import { expect, it, vi } from 'vitest';
import { batchFileKind, batchRowError, planBatchAssets, runBatchAssets, BATCH_ASSET_MAX_BYTES, type BatchAssetRow } from './asset-batch-import';
import { canonicalAssetId } from './asset-file-import';
const file = (name = 'scene.png', type = 'image/png') => new File([new Uint8Array([1, 2, 3])], name, { type });
const plan = (files: readonly File[], ids: readonly string[] = []) => planBatchAssets(files, ids, name => canonicalAssetId(name, 1));
it('plans distinct new IDs for existing/duplicate names, handles empty MIME kind suggestions and validates metadata before reading bytes', () => {
  const rows = plan([file(), file(), file('font.woff2', ''), file('music.wav', '')], ['scene']); expect(rows.map(row => row.assetId)).toEqual(['scene_2', 'scene_3', 'font', 'music']); expect(rows.map(row => row.kind)).toEqual(['cg', 'cg', 'font', 'audio']);
  expect(batchFileKind(file('clip.webm', ''))).toBe('video'); expect(batchRowError({ ...rows[0]!, displayName: ' ' })).toContain('名称'); expect(plan([new File([], 'empty.png')])[0]).toMatchObject({ state: 'error', selected: false });
  expect(() => plan(Array.from({ length: 51 }, () => file()))).toThrow('50'); expect(() => plan([{ name: 'large', size: BATCH_ASSET_MAX_BYTES + 1, type: '' } as File])).toThrow('512');
});
it('keeps successful items, continues after a file failure, and retries only unfinished selected rows', async () => {
  let rows = plan([file('a.png'), file('b.png'), file('c.png')]);
  const update = (id: string, patch: Partial<BatchAssetRow>) => { rows = rows.map(row => row.assetId === id ? { ...row, ...patch } : row); };
  const importer = vi.fn(async (f: File) => ({ status: f.name === 'b.png' ? 'error' as const : 'success' as const, message: f.name === 'b.png' ? '坏文件' : '已导入' }));
  expect(await runBatchAssets(rows, importer, new AbortController().signal, update)).toEqual({ succeeded: 2, failed: 1, stopped: false }); expect(rows.map(row => row.state)).toEqual(['success', 'error', 'success']);
  importer.mockImplementation(async () => ({ status: 'success', message: '修正后通过' })); await runBatchAssets(rows, importer, new AbortController().signal, update); expect(importer).toHaveBeenCalledTimes(4); expect(rows.every(row => row.state === 'success')).toBe(true);
});
it('stops before later items on cancellation or write failure and does not reinterpret a committed item as cancelled', async () => {
  const rows = plan([file('a.png'), file('b.png')]), controller = new AbortController(), update = vi.fn();
  const importer = vi.fn(async () => { controller.abort(); return { status: 'success' as const, message: '已提交' }; });
  expect(await runBatchAssets(rows, importer, controller.signal, update)).toEqual({ succeeded: 1, failed: 0, stopped: true }); expect(importer).toHaveBeenCalledOnce(); expect(update).toHaveBeenLastCalledWith('a', { state: 'success', message: '已提交' });
  const fail = vi.fn(async () => ({ status: 'error' as const, message: '编辑权已失效', halt: true })); expect((await runBatchAssets(rows, fail, new AbortController().signal, update)).stopped).toBe(true); expect(fail).toHaveBeenCalledOnce();
  const cancelled = vi.fn(async () => ({ status: 'cancelled' as const, message: '已停止' })); await runBatchAssets(rows, cancelled, new AbortController().signal, update); expect(cancelled).toHaveBeenCalledOnce();
});

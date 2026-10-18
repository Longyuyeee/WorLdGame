import { afterEach, expect, it, vi } from 'vitest';
import { createProjectTemplate, exportProjectZip, saveProject } from '@world-studio/project-domain';
import { importStudioProjectArchive } from './web-delivery-bundle';
import { importProjectArchiveInWorker } from './project-archive-import-client';
import { MAX_PROJECT_ARCHIVE_BYTES } from './project-archive-import-protocol';
import { ProjectImportSelectionError } from './project-import-guidance';

const archive = exportProjectZip(saveProject(createProjectTemplate('Worker Import', 'worker-import-test')));
const file = () => ({ size: archive.length, arrayBuffer: async () => archive.slice().buffer }) as Blob;
class FakeWorker {
  static instances: FakeWorker[] = [];
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  request: { id: number; file: Blob } | undefined;
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  addEventListener(name: string, fn: (e: MessageEvent) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]); }
  postMessage(request: { id: number; file: Blob }) { this.request = request; }
  terminate() { this.terminated = true; }
  emit(name: string, data?: unknown) { for (const listener of this.listeners.get(name) ?? []) listener({ data, preventDefault: vi.fn() } as unknown as MessageEvent); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); FakeWorker.instances = []; });
it('reads small legacy projects through the bounded compatibility fallback', async () => {
  vi.stubGlobal('Worker', undefined); const progress = vi.fn();
  expect(await importProjectArchiveInWorker(file(), { onProgress: progress })).toEqual(importStudioProjectArchive(archive));
  expect(progress.mock.calls.flat()).toEqual(['reading', 'checking']);
});
it('does not read oversized files or run large imports on the UI fallback', async () => {
  vi.stubGlobal('Worker', undefined); const read = vi.fn();
  await expect(importProjectArchiveInWorker({ size: MAX_PROJECT_ARCHIVE_BYTES + 1, arrayBuffer: read } as unknown as Blob)).rejects.toThrow('520 MB');
  await expect(importProjectArchiveInWorker({ size: 3 * 1024 * 1024, arrayBuffer: read } as unknown as Blob)).rejects.toThrow('Web Worker');
  expect(read).not.toHaveBeenCalled();
});
it('honors cancellation before and after asynchronous file reading in fallback', async () => {
  vi.stubGlobal('Worker', undefined); const controller = new AbortController(); controller.abort();
  await expect(importProjectArchiveInWorker(file(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  const during = new AbortController();
  await expect(importProjectArchiveInWorker({ size: 1, arrayBuffer: async () => { during.abort(); return new ArrayBuffer(1); } } as Blob, { signal: during.signal })).rejects.toMatchObject({ name: 'AbortError' });
  const reading = new AbortController(), read = vi.fn();
  await expect(importProjectArchiveInWorker({ size: 1, arrayBuffer: read } as unknown as Blob, { signal: reading.signal, onProgress: () => reading.abort() })).rejects.toMatchObject({ name: 'AbortError' }); expect(read).not.toHaveBeenCalled();
  const checking = new AbortController();
  await expect(importProjectArchiveInWorker({ size: 1, arrayBuffer: async () => new ArrayBuffer(1) } as Blob, { signal: checking.signal, onProgress: phase => { if (phase === 'checking') checking.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
});
it('returns the checked worker result, ignores unrelated replies and terminates after completion', async () => {
  vi.stubGlobal('Worker', FakeWorker); const progress = vi.fn(), source = file();
  const pending = importProjectArchiveInWorker(source, { onProgress: progress }), worker = FakeWorker.instances[0]!;
  expect(worker.request?.file).toBe(source); worker.emit('message', { id: -1, ok: false, error: 'unrelated' });
  worker.emit('message', { id: worker.request!.id, phase: 'checking' });
  worker.emit('message', { id: worker.request!.id, ok: true, result: importStudioProjectArchive(archive) });
  expect(await pending).toEqual(importStudioProjectArchive(archive)); expect(worker.terminated).toBe(true);
  expect(progress.mock.calls.flat()).toEqual(['reading', 'checking']);
  worker.emit('message', { id: worker.request!.id, phase: 'checking' }); expect(progress).toHaveBeenCalledTimes(2);
});
it('terminates on active cancellation and removes its deadline', async () => {
  vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker); const controller = new AbortController();
  const pending = importProjectArchiveInWorker(file(), { signal: controller.signal }); const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); await rejected; expect(FakeWorker.instances[0]!.terminated).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it('surfaces checked archive errors, malformed results and worker delivery failures without fallback', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  for (const type of ['invalid', 'malformed', 'error', 'messageerror']) {
    const pending = importProjectArchiveInWorker(file()), worker = FakeWorker.instances.at(-1)!;
    const rejected = expect(pending).rejects.toThrow(type === 'invalid' ? 'CRC mismatch' : '后台');
    if (type === 'invalid') worker.emit('message', { id: worker.request!.id, ok: false, error: 'CRC mismatch' });
    else if (type === 'malformed') worker.emit('message', { id: worker.request!.id, ok: true, result: {} });
    else worker.emit(type);
    await rejected; expect(worker.terminated).toBe(true);
  }
});
it('terminates a worker that exceeds its deadline and reports startup/transfer failures', async () => {
  vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker);
  const pending = importProjectArchiveInWorker(file(), {}, 50), rejected = expect(pending).rejects.toThrow('超时');
  await vi.advanceTimersByTimeAsync(50); await rejected; expect(FakeWorker.instances[0]!.terminated).toBe(true);
  vi.stubGlobal('Worker', class { constructor() { throw Error('blocked'); } });
  await expect(importProjectArchiveInWorker(file())).rejects.toThrow('启动失败');
  vi.stubGlobal('Worker', class extends FakeWorker { override postMessage() { throw Error('transfer'); } });
  await expect(importProjectArchiveInWorker(file())).rejects.toThrow('无法读取');
});
it('translates archive rejection into recovery guidance without hiding technical detail', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  for (const [code, expected] of [['UNSAFE_PATH', '不安全的文件路径'], ['SIZE_LIMIT', '大小超过导入上限'], ['UNSUPPORTED_COMPRESSION', '压缩方式'], ['CORRUPT_BLOB', '工程素材缺失'], ['INVALID_ARCHIVE', '不完整或已损坏']]) {
    const pending = importProjectArchiveInWorker(file()), worker = FakeWorker.instances.at(-1)!;
    const rejected = expect(pending).rejects.toThrow(expected);
    worker.emit('message', { id: worker.request!.id, ok: false, error: 'original diagnostic', code }); await rejected;
  }
});
it('restores typed selection guidance from the worker without trusting its diagnostic text', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const pending = importProjectArchiveInWorker(file()), worker = FakeWorker.instances.at(-1)!;
  const rejected = expect(pending).rejects.toBeInstanceOf(ProjectImportSelectionError);
  worker.emit('message', { id: worker.request!.id, ok: false, error: '<script>untrusted</script>', code: 'WEB_GAME_ARCHIVE' });
  await rejected; expect(worker.terminated).toBe(true);
  worker.emit('message', { id: worker.request!.id, ok: true, result: importStudioProjectArchive(archive) });
});
it('preserves selection guidance in the small fallback and never starts a write phase', async () => {
  vi.stubGlobal('Worker', undefined); const bytes = new TextEncoder().encode('<!doctype html><html>game</html>'), progress = vi.fn();
  const source = { size: bytes.length, arrayBuffer: async () => bytes.buffer } as Blob;
  await expect(importProjectArchiveInWorker(source, { onProgress: progress })).rejects.toMatchObject({ name: 'ProjectImportSelectionError', code: 'GAME_HTML' });
  expect(progress.mock.calls.flat()).toEqual(['reading', 'checking']);
});

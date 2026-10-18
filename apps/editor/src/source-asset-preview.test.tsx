import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createBlobDigest, type AssetIndex, type AssetIndexEntry } from '@world-studio/project-persistence';
import { applyWebAssetSources, newWebAssetSourceRecord } from '@world-studio/project-domain';
import { branchAuthoringFixture } from './branch-authoring-fixture';
import { projectCanonicalWithAssetIndex } from './canonical-project-adapter';
import { SourceAssetPreview, sourceAssetContexts } from './SourceAssetPreview';
import { WebAssetSourcesDialog } from './WebAssetSourcesDialog';
const bytes = new Uint8Array([1, 2, 3]), digest = createBlobDigest(bytes);
const entry: AssetIndexEntry = { assetId: 'voice', displayName: '当前对白', kind: 'audio', tags: [], source: { digest, byteLength: bytes.length, mimeType: 'audio/wav' }, preservedFields: { inspection: { status: 'pass' } } };
const second = { ...entry, assetId: 'voice_2', displayName: '另一句对白' }, index: AssetIndex = { schemaVersion: 1, indexRevision: 1, assets: [entry, second] };
const project = () => projectCanonicalWithAssetIndex(branchAuthoringFixture(), index);
const create = vi.fn(() => 'blob:preview'), revoke = vi.fn();
function media() {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.stubGlobal('URL', class extends URL { static override createObjectURL = create; static override revokeObjectURL = revoke; });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); create.mockClear(); revoke.mockClear(); });
function setup(reader = { read: vi.fn(async () => bytes as Uint8Array | null) }) {
  media(); const apply = vi.fn(), source = project(), view = render(<WebAssetSourcesDialog project={source} initialAssetId="voice" reader={reader} assetIndex={index} onApply={apply} onClose={vi.fn()} onReplace={vi.fn()} />);
  return { reader, apply, source, view };
}
it('only reads after an explicit preview request and preserves source drafts when closing it', async () => {
  const f = setup(); expect(f.reader.read).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('来源事实'), { target: { value: '尚未应用的来源' } }); fireEvent.click(screen.getByRole('button', { name: '试听当前音频' }));
  const audio = await screen.findByLabelText('试听 当前对白'); expect(audio).toHaveAttribute('preload', 'none'); expect(audio).not.toHaveAttribute('autoplay'); expect(f.reader.read).toHaveBeenCalledWith(digest);
  expect(f.apply).not.toHaveBeenCalled(); expect(screen.getByLabelText('发行条件状态')).toHaveValue('pending');
  fireEvent.click(screen.getByRole('button', { name: '关闭当前素材预览' })); expect(revoke).toHaveBeenCalledWith('blob:preview'); expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled(); expect(audio).not.toHaveAttribute('src'); expect(screen.getByLabelText('来源事实')).toHaveValue('尚未应用的来源');
});
it('stops and releases the previous audio on selection, without starting the next audio', async () => {
  const f = setup(); fireEvent.click(screen.getByRole('button', { name: '试听当前音频' })); await screen.findByLabelText('试听 当前对白');
  fireEvent.click(screen.getByRole('button', { name: /另一句对白/ })); expect(screen.queryByLabelText('试听 当前对白')).toBeNull(); expect(revoke).toHaveBeenCalledOnce(); expect(f.reader.read).toHaveBeenCalledOnce(); expect(screen.getByRole('button', { name: '试听当前音频' })).toHaveAttribute('aria-expanded', 'false');
});
it('stops hidden detail audio when opening the mobile selection list and requires a new request on return', async () => {
  const f = setup(); fireEvent.click(screen.getByRole('button', { name: '试听当前音频' })); await screen.findByLabelText('试听 当前对白');
  fireEvent.click(screen.getByRole('button', { name: '选择其他素材（2）' })); expect(screen.queryByLabelText('试听 当前对白')).toBeNull(); expect(revoke).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '查看当前素材详情' })); expect(f.reader.read).toHaveBeenCalledOnce(); expect(screen.getByRole('button', { name: '试听当前音频' })).toHaveAttribute('aria-expanded', 'false');
});
it.each(['pagehide', 'visibilitychange'])('stops preview on %s without applying or approving a record', async type => {
  const f = setup(); fireEvent.click(screen.getByRole('button', { name: '试听当前音频' })); await screen.findByLabelText('试听 当前对白');
  if (type === 'visibilitychange') vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => (type === 'pagehide' ? window : document).dispatchEvent(new Event(type)));
  expect(screen.queryByLabelText('试听 当前对白')).toBeNull(); expect(revoke).toHaveBeenCalledOnce(); expect(f.apply).not.toHaveBeenCalled(); expect(screen.getByLabelText('发行条件状态')).toHaveValue('pending');
});
it('ignores a late file reply after switching to another source record', async () => {
  let finish: (bytes: Uint8Array) => void = () => {}; const read = vi.fn(() => new Promise<Uint8Array>(resolve => { finish = resolve; }));
  media(); render(<WebAssetSourcesDialog project={project()} initialAssetId="voice" reader={{ read }} assetIndex={index} onApply={vi.fn()} onClose={vi.fn()} onReplace={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '试听当前音频' })); await waitFor(() => expect(read).toHaveBeenCalledOnce()); fireEvent.click(screen.getByRole('button', { name: /另一句对白/ }));
  await act(async () => finish(bytes)); expect(create).not.toHaveBeenCalled(); expect(screen.queryByRole('audio')).toBeNull();
});
it.each([null, new Uint8Array([3, 2, 1]), new Uint8Array([1])])('rejects missing, wrong-digest or wrong-length bytes and allows an explicit retry', async invalid => {
  const f = setup({ read: vi.fn().mockResolvedValueOnce(invalid).mockResolvedValue(bytes) }); fireEvent.click(screen.getByRole('button', { name: '试听当前音频' }));
  await screen.findByText(/音频读取失败/); expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '重新准备试听' })); await screen.findByLabelText('试听 当前对白'); expect(f.reader.read).toHaveBeenCalledTimes(2); expect(f.apply).not.toHaveBeenCalled();
});
it('uses the current indexed file even when the old ledger was approved for different bytes', async () => {
  const old = { ...newWebAssetSourceRecord('voice', `sha256:${'f'.repeat(64)}`), sourceKind: 'generated' as const, source: '旧素材', permission: 'documented' as const, evidence: '旧依据', reviewedBy: '旧确认人', reviewedOn: '2026-10-16' };
  const reader = { read: vi.fn(async () => bytes) }; media(); render(<WebAssetSourcesDialog project={applyWebAssetSources(project(), { schemaVersion: 1, records: [old] })} assetIndex={index} reader={reader} initialAssetId="voice" onApply={vi.fn()} onClose={vi.fn()} onReplace={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '试听当前音频' })); await screen.findByLabelText('试听 当前对白'); expect(reader.read).toHaveBeenCalledWith(digest); expect(screen.getByLabelText('来源事实')).toBeDisabled(); expect(screen.getByLabelText('确认依据')).toHaveValue('旧依据'); expect(screen.getByText(/旧记录对应/)).toBeInTheDocument();
});
it('never substitutes an index entry with a different ID or digest', () => {
  const read = vi.fn(); render(<WebAssetSourcesDialog project={project()} assetIndex={{ ...index, assets: [{ ...entry, source: { ...entry.source, digest: `sha256:${'f'.repeat(64)}` } }] }} reader={{ read }} initialAssetId="voice" onApply={vi.fn()} onClose={vi.fn()} onReplace={vi.fn()} />);
  expect(screen.queryByRole('button', { name: '试听当前音频' })).toBeNull(); expect(read).not.toHaveBeenCalled();
});
it('keeps the source fields available when no asset reader exists', () => {
  render(<WebAssetSourcesDialog project={project()} assetIndex={index} initialAssetId="voice" onApply={vi.fn()} onClose={vi.fn()} onReplace={vi.fn()} />);
  expect(screen.getByRole('button', { name: '试听当前音频' })).toBeDisabled(); expect(screen.getByLabelText('来源事实')).toBeEnabled(); expect(screen.getByText(/资源仓库暂不可用/)).toBeInTheDocument();
});
it('does not read an unsupported type or oversized audio', async () => {
  const reader = { read: vi.fn() }; media(); const source = project();
  const view = render(<SourceAssetPreview entry={{ ...entry, source: { ...entry.source, byteLength: 16 * 1024 * 1024 + 1 } }} reader={reader} project={source} visible />);
  fireEvent.click(screen.getByRole('button', { name: '试听当前音频' })); expect(await screen.findByText(/超过 16 MB/)).toBeInTheDocument(); expect(reader.read).not.toHaveBeenCalled();
  view.rerender(<SourceAssetPreview entry={{ ...entry, kind: 'font', source: { ...entry.source, mimeType: 'font/woff2' } }} reader={reader} project={source} visible />); expect(screen.queryByRole('button', { name: '试听当前音频' })).toBeNull(); expect(reader.read).not.toHaveBeenCalled();
});
it('lists exact source references and an immediately adjacent line, never guessed text beyond control flow', () => {
  const base = project(), scene = base.scenes[0]!;
  const source = { ...base, scripts: { ...base.scripts, [scene.id]: { ...base.scripts[scene.id]!, statements: [
    { id: 'voice_cue', kind: 'direction', command: 'audio', summary: 'action=play asset=voice bus=voice' }, { id: 'line', kind: 'narration', text: '准确原文' },
    { id: 'bad', kind: 'direction', command: 'audio', summary: 'asset=voice asset=another' },
    { id: 'text_only', kind: 'narration', text: 'asset=voice' },
    { id: 'before_jump', kind: 'direction', command: 'audio', summary: 'asset=voice' }, { id: 'jump', kind: 'jump', targetLabel: 'elsewhere' }, { id: 'not_adjacent', kind: 'narration', text: '不应猜测' }
  ] } } };
  expect(sourceAssetContexts(source, 'voice').map(row => [row.statementId, row.line])).toEqual([['voice_cue', '准确原文'], ['before_jump', null]]);
});

import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { applyWebAssetSources, applyWebCredits, DEFAULT_WEB_CREDITS, inspectWebAssetSources, newWebAssetSourceRecord, readWebAssetSources, type CanonicalProject, type WebAssetSourceRecord } from '@world-studio/project-domain';
import { branchAuthoringFixture } from './branch-authoring-fixture';
import { WebAssetSourcesDialog } from './WebAssetSourcesDialog';
import { WebReleasePreparation } from './WebReleasePreparation';
import { nextPendingSource, sourceDraftProblems } from './web-asset-source-workflow';
import { App } from './App';

const digest = `sha256:${'a'.repeat(64)}`;
const record = (assetId: string): WebAssetSourceRecord => ({ ...newWebAssetSourceRecord(assetId, digest), sourceKind: 'original', source: '测试来源', permission: 'documented', evidence: '仅测试依据，不是真实许可', reviewedBy: '测试者', reviewedOn: '2026-10-17', credit: '' });
function fixture() {
  const p = branchAuthoringFixture();
  return applyWebAssetSources({ ...p, assets: { ...p.assets, assets: ['missing', 'stale', 'pending', 'replace', 'credit-missing', 'documented'].map(assetId => ({ assetId, displayName: `素材 ${assetId}`, kind: 'background', source: { digest } })) } }, { schemaVersion: 1, records: [
    { ...record('stale'), digest: `sha256:${'b'.repeat(64)}` }, { ...record('pending'), permission: 'pending' }, { ...record('replace'), permission: 'replace' }, { ...record('credit-missing'), credit: '测试公开署名' }, record('documented'),
  ] });
}
const choose = (id: string) => fireEvent.click(within(screen.getByRole('group', { name: '选择来源素材' })).getByRole('button', { name: new RegExp(`素材 ${id}(?:未|待|需|公|已|文)`) }));
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const applyButton = () => screen.getByRole('button', { name: '应用来源台账' });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

it('groups all six current-file statuses and opens the precise first asset and category, never an approval', () => {
  const open = vi.fn(); render(<WebReleasePreparation project={fixture()} disabled={false} onOpen={open} />);
  const queue = within(screen.getByRole('list', { name: '素材准备事项', hidden: true }));
  for (const [status, label] of [['missing', '未填写来源'], ['stale', '文件已更换，需重核'], ['pending', '待确认发行条件'], ['replace', '需要替换素材'], ['credit-missing', '公开署名未补齐'], ['documented', '已记录确认依据']]) {
    fireEvent.click(queue.getByRole('button', { name: `${label} · 1 项`, hidden: true })); expect(open).toHaveBeenLastCalledWith({ status, assetId: status });
  }
  expect(screen.getByText(/6 项素材 · 1 项已记录依据并匹配署名 · 5 项仍待处理/)).toBeInTheDocument();
  expect(screen.getByText(/不是自动授权结论/)).toBeInTheDocument();
});
it('locks grouped navigation for surrounding drafts and disables empty statuses without blocking local validation exports', () => {
  const { rerender } = render(<WebReleasePreparation project={fixture()} disabled={true} onOpen={vi.fn()} />);
  expect(screen.getAllByRole('button', { hidden: true }).every(button => button.hasAttribute('disabled'))).toBe(true);
  const p = branchAuthoringFixture(); rerender(<WebReleasePreparation project={p} disabled={false} onOpen={vi.fn()} />);
  expect(screen.getByRole('button', { name: '核对素材来源' })).toBeEnabled(); expect(screen.getByRole('button', { name: '未填写来源 · 0 项', hidden: true })).toBeDisabled();
});
it('opens filtered context, explains hidden selection and retains drafts through search and next-pending navigation', () => {
  render(<WebAssetSourcesDialog project={fixture()} initialStatus="replace" onApply={vi.fn()} onClose={vi.fn()} onReplace={vi.fn()} />);
  expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('素材 replace'); expect(screen.getByLabelText('筛选处理事项')).toHaveValue('replace');
  change('来源事实', '未应用替换原因'); change('搜索素材', 'nothing'); expect(screen.getByText('没有匹配的素材。')).toBeInTheDocument(); expect(screen.getByRole('status')).toHaveTextContent('当前详情不在');
  fireEvent.click(screen.getByRole('button', { name: '下一项待处理（全部素材）' })); expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('credit-missing'); expect(screen.getByLabelText('搜索素材')).toHaveValue('');
  choose('replace'); expect(screen.getByLabelText('来源事实')).toHaveValue('未应用替换原因'); expect(screen.getByRole('button', { name: '前往替换此素材' })).toBeDisabled();
});
it('locates a hidden invalid draft, focuses the missing field and preserves all other drafts atomically', () => {
  const apply = vi.fn(); render(<WebAssetSourcesDialog project={fixture()} onApply={apply} onClose={vi.fn()} onReplace={vi.fn()} />);
  change('来源事实', '第一项保留'); change('发行条件状态', 'documented'); choose('pending'); change('来源事实', '另一项保留'); change('搜索素材', 'pending');
  fireEvent.click(applyButton()); expect(apply).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('素材 missing：请补齐来源类型、确认依据、确认人、确认日期');
  expect(screen.getByLabelText('来源类型')).toHaveFocus(); expect(screen.getByLabelText('搜索素材')).toHaveValue(''); expect(screen.getByLabelText('来源事实')).toHaveValue('第一项保留');
  fireEvent.click(screen.getByRole('button', { name: '保留填写，改为待确认' })); fireEvent.click(applyButton());
  const saved = readWebAssetSources(apply.mock.calls[0]![0]); expect(saved.records.find(row => row.assetId === 'missing')).toMatchObject({ source: '第一项保留', permission: 'pending' }); expect(saved.records.find(row => row.assetId === 'pending')!.source).toBe('另一项保留');
});
it('applies and continues without closing or falsely completing pending items, then discards only later edits', () => {
  const apply = vi.fn(), close = vi.fn(), p = fixture(); const view = render(<WebAssetSourcesDialog project={p} initialAssetId="pending" onApply={apply} onClose={close} onReplace={vi.fn()} />);
  change('来源事实', '  已应用的事实  '); fireEvent.click(screen.getByRole('button', { name: '应用并核对下一项' }));
  const saved = apply.mock.calls[0]![0] as CanonicalProject; view.rerender(<WebAssetSourcesDialog project={saved} onApply={apply} onClose={close} onReplace={vi.fn()} />);
  expect(close).not.toHaveBeenCalled(); expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('replace'); expect(screen.getByRole('status')).toHaveTextContent('仍需保存到本机');
  expect(inspectWebAssetSources(saved).filter(row => row.status !== 'documented')).toHaveLength(5);
  choose('pending'); expect(screen.getByLabelText('来源事实')).toHaveValue('已应用的事实'); expect(screen.getByRole('button', { name: '前往替换此素材' })).toBeEnabled();
  change('来源事实', '后来放弃'); fireEvent.click(screen.getByRole('button', { name: '放弃修改' })); expect(close).toHaveBeenCalledOnce(); expect(readWebAssetSources(saved).records.find(row => row.assetId === 'pending')!.source).toBe('已应用的事实');
});
it('does not combine the documented category with the contradictory pending-only filter', () => {
  render(<WebAssetSourcesDialog project={fixture()} onApply={vi.fn()} onClose={vi.fn()} onReplace={vi.fn()} />);
  fireEvent.click(screen.getByLabelText('只看待处理')); change('筛选处理事项', 'documented'); expect(screen.getByLabelText('只看待处理')).not.toBeChecked();
  expect(within(screen.getByRole('group', { name: '选择来源素材' })).getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByLabelText('只看待处理')); expect(screen.getByLabelText('筛选处理事项')).toHaveValue('all'); expect(within(screen.getByRole('group', { name: '选择来源素材' })).getAllByRole('button')).toHaveLength(5);
});
it('switches mobile selection and detail without losing a draft and returns errors to detail', () => {
  render(<WebAssetSourcesDialog project={fixture()} onApply={vi.fn()} onClose={vi.fn()} onReplace={vi.fn()} />);
  change('来源事实', '切换保留'); change('发行条件状态', 'documented');
  fireEvent.click(screen.getByRole('button', { name: '选择其他素材（6）', hidden: true })); expect(document.querySelector('.web-sources-layout')).toHaveAttribute('data-selecting', 'true');
  choose('pending'); expect(document.querySelector('.web-sources-layout')).toHaveAttribute('data-selecting', 'false'); choose('missing'); expect(screen.getByLabelText('来源事实')).toHaveValue('切换保留');
  fireEvent.click(screen.getByRole('button', { name: '选择其他素材（6）', hidden: true })); fireEvent.click(applyButton()); expect(document.querySelector('.web-sources-layout')).toHaveAttribute('data-selecting', 'false'); expect(screen.getByLabelText('来源类型')).toHaveFocus();
});
it('reports all invalid drafts and applies none until each is repaired without losing another item', () => {
  const apply = vi.fn(); render(<WebAssetSourcesDialog project={fixture()} onApply={apply} onClose={vi.fn()} onReplace={vi.fn()} />);
  change('来源事实', '保留 A'); change('发行条件状态', 'documented'); choose('pending'); change('发行条件状态', 'documented'); change('确认人', '');
  fireEvent.click(applyButton()); expect(screen.getByRole('alert')).toHaveTextContent('共 2 项草稿未通过'); expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '保留填写，改为待确认' })); fireEvent.click(applyButton()); expect(screen.getByRole('alert')).toHaveTextContent('素材 pending：请补齐确认人'); expect(screen.getByLabelText('确认人')).toHaveFocus(); expect(apply).not.toHaveBeenCalled();
  change('确认人', '测试者'); fireEvent.click(applyButton()); expect(apply).toHaveBeenCalledOnce(); expect(readWebAssetSources(apply.mock.calls[0]![0]).records.find(row => row.assetId === 'missing')!.source).toBe('保留 A');
});
it('keeps the dialog editable after explicit ledger repair and apply-and-continue', () => {
  const p = fixture(), invalid = { ...p, manifest: { ...p.manifest, preservedFields: { ...p.manifest.preservedFields, webAssetSources: { schemaVersion: 99 } } } } as CanonicalProject;
  render(<WebAssetSourcesDialog project={invalid} onApply={vi.fn()} onClose={vi.fn()} onReplace={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '重建来源台账' })); fireEvent.click(screen.getByRole('button', { name: '应用并核对下一项' }));
  expect(screen.queryByRole('button', { name: '重建来源台账' })).not.toBeInTheDocument(); expect(applyButton()).toBeEnabled(); expect(screen.getByLabelText('来源事实')).toBeEnabled();
});
it('preserves dirty drafts and replacement lock if the owner cannot apply the project', () => {
  render(<WebAssetSourcesDialog project={fixture()} onApply={() => { throw Error('保存交接失败'); }} onClose={vi.fn()} onReplace={vi.fn()} />);
  change('来源事实', '不能丢失'); fireEvent.click(screen.getByRole('button', { name: '应用并核对下一项' }));
  expect(screen.getByRole('alert')).toHaveTextContent('保存交接失败'); expect(screen.getByLabelText('来源事实')).toHaveValue('不能丢失'); expect(screen.getByRole('button', { name: '前往替换此素材' })).toBeDisabled();
});
it('credits only the explicitly selected item before the next queue item and never auto-confirms other assets', () => {
  const apply = vi.fn(); render(<WebAssetSourcesDialog project={fixture()} initialStatus="credit-missing" onApply={apply} onClose={vi.fn()} onReplace={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '加入玩家致谢（仅此条）' })); expect(screen.getByRole('status')).toHaveTextContent('当前详情不在');
  fireEvent.click(screen.getByRole('button', { name: '应用并核对下一项' })); const saved = apply.mock.calls[0]![0] as CanonicalProject;
  expect(inspectWebAssetSources(saved).filter(row => row.status === 'documented')).toHaveLength(2); expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('missing');
  expect(inspectWebAssetSources(applyWebCredits(saved, { ...DEFAULT_WEB_CREDITS, acknowledgements: '' })).find(row => row.assetId === 'credit-missing')!.status).toBe('credit-missing');
});
it('keeps real App navigation locked through apply-and-continue and saves the applied metadata after closing', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const save = vi.fn().mockResolvedValue(undefined); render(<App initialProject={fixture()} onCanonicalProjectSave={save} autosaveDebounceMs={60000} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '保存到本机' })).toBeEnabled()); const nav = within(screen.getByRole('navigation', { name: '主要功能' })); fireEvent.click(nav.getByRole('button', { name: '发布' }));
  fireEvent.click(within(screen.getByRole('region', { name: '作品发布信息' })).getByText(/按问题处理素材/)); fireEvent.click(screen.getByRole('button', { name: '需要替换素材 · 1 项' })); expect(screen.getByRole('heading', { name: '素材 replace' })).toBeInTheDocument();
  change('来源事实', '真实 App 应用'); fireEvent.click(screen.getByRole('button', { name: '应用并核对下一项' })); expect(nav.getByRole('button', { name: '故事' })).toBeDisabled(); expect(document.querySelector('.local-save-button')).toBeDisabled();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' })); await waitFor(() => expect(document.querySelector('.local-save-button')).toBeEnabled()); fireEvent.click(document.querySelector('.local-save-button')!);
  await waitFor(() => expect(save).toHaveBeenCalled()); expect(readWebAssetSources(save.mock.calls.at(-1)![0]).records.find(row => row.assetId === 'replace')!.source).toBe('真实 App 应用');
});
it('validates every missing confirmation field and impossible dates with the existing domain rules', () => {
  for (const field of ['sourceKind', 'source', 'evidence', 'reviewedBy', 'reviewedOn'] as const) {
    const row = { ...record('x'), [field]: field === 'sourceKind' ? 'unknown' : '' }; expect(sourceDraftProblems({ schemaVersion: 1, records: [row] })[0]?.field).toBe(field);
  }
  expect(sourceDraftProblems({ schemaVersion: 1, records: [{ ...record('x'), reviewedOn: '2026-02-30' }] })[0]).toMatchObject({ field: 'reviewedOn', message: '请填写有效的确认日期（YYYY-MM-DD）。' });
  expect(sourceDraftProblems({ schemaVersion: 1, records: [record('x')] })).toEqual([]);
});
it('wraps only to another unresolved item, skips documented and terminates for empty or one-item queues', () => {
  const rows = inspectWebAssetSources(fixture()); expect(nextPendingSource(rows, 'credit-missing')).toBe('missing'); expect(nextPendingSource(rows, 'unknown')).toBe('missing');
  expect(nextPendingSource([], '')).toBeUndefined(); expect(nextPendingSource([rows[0]!], 'missing')).toBeUndefined(); expect(nextPendingSource([rows.at(-1)!], '')).toBeUndefined();
});

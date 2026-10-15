import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { applyWebAssetSources, applyWebCredits, DEFAULT_WEB_CREDITS, newWebAssetSourceRecord, readWebAssetSources, readWebCredits, semanticHash, verifyWebSaveCompatibility, type CanonicalProject } from '@world-studio/project-domain';
import { compileProject } from '@world-studio/project-compiler';
import { createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1, loadPlayerCoreSessionSaveV1 } from '@world-studio/player-core';
import { createBlobDigest, type AssetIndex } from '@world-studio/project-persistence';
import { unzipSync, strFromU8 } from 'fflate';
import { WebAssetSourcesDialog } from './WebAssetSourcesDialog';
import { App } from './App';
import { branchAuthoringFixture } from './branch-authoring-fixture';
import { projectCanonicalWithAssetIndex } from './canonical-project-adapter';
import { createFormalWebArtifact, createFormalWebDirectoryArtifact } from './formal-web-export';
import { createWebDeliveryBundle, importStudioProjectArchive } from './web-delivery-bundle';
import { createWebReleasePreparation } from './web-release-preparation';
import { applyWebPublication } from './web-publication';
import { routeReviewSourceHash } from './route-review';

const bytes = new Uint8Array([1, 2, 3]), digest = createBlobDigest(bytes), runtime = { javascript: '', css: '' }, reader = { read: async () => bytes };
const index: AssetIndex = { schemaVersion: 1, indexRevision: 1, assets: [{ assetId: 'source_image', displayName: '测试图片', kind: 'background', tags: [], source: { digest, byteLength: bytes.length, mimeType: 'image/png' } }] };
const source = () => applyWebPublication(projectCanonicalWithAssetIndex(branchAuthoringFixture(), index), { name: '来源流程', version: '1.0.0', iconAssetId: '' });
const pending = () => ({ ...newWebAssetSourceRecord('source_image', digest), sourceKind: 'generated' as const, source: 'PRIVATE_SOURCE_PATH', evidence: 'PRIVATE_EVIDENCE' });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

it('retains dirty drafts on Escape, validates confirmation, explicitly adds only public credit and applies source', () => {
  const apply = vi.fn(), close = vi.fn(); render(<WebAssetSourcesDialog project={source()} onApply={apply} onClose={close} onReplace={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('来源事实'), { target: { value: 'PRIVATE_SOURCE_PATH' } });
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true })); expect(close).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('尚未应用');
  fireEvent.change(screen.getByLabelText('发行条件状态'), { target: { value: 'documented' } }); fireEvent.click(screen.getByRole('button', { name: '应用来源台账' })); expect(apply).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('补齐');
  for (const [field, value] of [['来源类型', 'generated'], ['确认依据', 'PRIVATE_EVIDENCE'], ['确认人', '测试确认人'], ['确认日期', '2026-10-16'], ['需展示的公开署名', '公开测试署名']]) fireEvent.change(screen.getByLabelText(field!), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '加入玩家致谢（仅此条）' })); fireEvent.click(screen.getByRole('button', { name: '加入玩家致谢（仅此条）' })); fireEvent.click(screen.getByRole('button', { name: '应用来源台账' }));
  const result = apply.mock.calls[0]![0] as CanonicalProject; expect(readWebCredits(result).acknowledgements).toBe('公开测试署名'); expect(readWebAssetSources(result).records[0]!.permission).toBe('documented'); expect(close).toHaveBeenCalledOnce();
});
it('does not transfer old confirmation onto a replacement and navigates to replacement only from applied content', () => {
  const old = { ...pending(), digest: `sha256:${'f'.repeat(64)}`, permission: 'documented' as const, reviewedBy: '旧确认人', reviewedOn: '2026-10-15' };
  const apply = vi.fn(), replace = vi.fn(); render(<WebAssetSourcesDialog project={applyWebAssetSources(source(), { schemaVersion: 1, records: [old] })} onApply={apply} onClose={vi.fn()} onReplace={replace} />);
  expect(screen.getByLabelText('来源事实')).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '前往替换此素材' })); expect(replace).toHaveBeenCalledWith('source_image');
  fireEvent.click(screen.getByRole('button', { name: '为当前文件重新核对' })); expect(screen.getByLabelText('确认依据')).toHaveValue(''); expect(screen.getByLabelText('确认人')).toHaveValue(''); expect(screen.getByLabelText('确认日期')).toHaveValue(''); expect(screen.getByLabelText('发行条件状态')).toHaveValue('pending'); expect(screen.getByRole('button', { name: '前往替换此素材' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '应用来源台账' })); expect(readWebAssetSources(apply.mock.calls[0]![0]).records[0]!.digest).toBe(digest);
});
it('keeps invalid imported metadata until explicit repair and records preparation as unverified rather than success', () => {
  const invalid = { ...source(), manifest: { ...source().manifest, preservedFields: { webAssetSources: { schemaVersion: 99 } } } } as CanonicalProject, apply = vi.fn();
  const report = createWebReleasePreparation(invalid); expect(report.ledgerError).toContain('台账'); expect(report.documentedAssets).toBe(0); expect(report.permissionReview).toBe('owner-review-required'); expect(report.deploymentUrl).toBeNull();
  render(<WebAssetSourcesDialog project={invalid} onApply={apply} onClose={vi.fn()} onReplace={vi.fn()} />); expect(screen.getByRole('button', { name: '应用来源台账' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '重建来源台账' })); fireEvent.click(screen.getByRole('button', { name: '应用来源台账' })); expect(readWebAssetSources(apply.mock.calls[0]![0]).records).toEqual([]);
});
it('protects surrounding publication drafts, locks navigation and reopens only applied metadata in the real App', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); render(<App initialProject={source()} autosaveDebounceMs={60000} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '保存到本机' })).toBeEnabled()); const nav = screen.getByRole('navigation', { name: '主要功能' }); fireEvent.click(within(nav).getByRole('button', { name: '发布' }));
  fireEvent.change(screen.getByLabelText('发布名称'), { target: { value: '未应用' } }); expect(screen.getByRole('button', { name: '核对素材来源' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
  fireEvent.click(screen.getByRole('button', { name: '核对素材来源' })); fireEvent.change(screen.getByLabelText('来源事实'), { target: { value: '已核对来源事实' } }); expect(within(nav).getByRole('button', { name: '故事' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '应用来源台账' }));
  fireEvent.click(screen.getByRole('button', { name: '核对素材来源' })); expect(screen.getByLabelText('来源事实')).toHaveValue('已核对来源事实'); fireEvent.change(screen.getByLabelText('来源事实'), { target: { value: '不能保留的草稿' } }); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '放弃修改' }));
  fireEvent.click(screen.getByRole('button', { name: '核对素材来源' })); expect(screen.getByLabelText('来源事实')).toHaveValue('已核对来源事实');
});
it('does not reopen save/navigation controls when metadata is applied during an older save', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); let finish: () => void = () => {};
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined), home = vi.fn();
  render(<App initialProject={source()} autosaveDebounceMs={60000} onCanonicalProjectSave={save} onReturnHome={home} onOpenProject={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '保存到本机' })).toBeEnabled()); fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name: '发布' }));
  fireEvent.click(document.querySelector('.local-save-button')!); await waitFor(() => expect(save).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: '核对素材来源' })); fireEvent.change(screen.getByLabelText('来源事实'), { target: { value: '保存期间新来源' } }); fireEvent.click(screen.getByRole('button', { name: '应用来源台账' }));
  expect(document.querySelector('.local-save-button')).toBeDisabled(); fireEvent.click(screen.getByLabelText('项目菜单')); expect(screen.getByRole('button', { name: /所有项目/ })).toBeDisabled();
  await act(async () => finish()); await waitFor(() => expect(document.querySelector('.local-save-button')).toBeEnabled()); expect(home).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /所有项目/ })); await waitFor(() => expect(home).toHaveBeenCalledOnce()); expect(save).toHaveBeenCalledTimes(2); expect(readWebAssetSources(save.mock.calls[1]![0]).records[0]!.source).toBe('保存期间新来源');
});
it('preserves original source and private report in both delivery formats without leaking evidence into player files, identity or old saves', async () => {
  const base = source(), p = applyWebAssetSources(base, { schemaVersion: 1, records: [pending()] });
  const compiled = compileProject(p, 'release'), original = compileProject(base, 'release');
  expect(compiled.ok).toBe(true); expect(original.ok).toBe(true);
  if (!compiled.ok || !original.ok) throw Error('fixture compilation failed');
  expect(compiled.artifacts.manifest.buildId).toBe(original.artifacts.manifest.buildId);
  expect(routeReviewSourceHash(p)).toBe(routeReviewSourceHash(base));
  const oldSave = createPlayerCoreSessionSaveV1(startPlayerCore(createPlayerCore(base), base));
  expect(oldSave.ok).toBe(true); if (!oldSave.ok) throw Error('fixture save failed');
  expect(loadPlayerCoreSessionSaveV1(createPlayerCore(p), oldSave.serialized).ok).toBe(true);
  const compatible = verifyWebSaveCompatibility(p, base); expect(createWebReleasePreparation(compatible).pendingAssets).toBe(1);
  for (const game of [await createFormalWebArtifact(p, reader, runtime), await createFormalWebDirectoryArtifact(p, reader, runtime)]) {
    const files = 'archive' in game ? unzipSync(game.archive) : { 'index.html': new TextEncoder().encode(game.html) };
    for (const file of Object.values(files)) { const text = strFromU8(file); expect(text).not.toContain('PRIVATE_SOURCE_PATH'); expect(text).not.toContain('PRIVATE_EVIDENCE'); expect(text).not.toContain('webAssetSources'); }
    const delivery = await createWebDeliveryBundle(p, index, reader, game, null), bundle = unzipSync(delivery.archive), restored = importStudioProjectArchive(delivery.archive);
    expect(semanticHash(restored.project)).toBe(semanticHash(p)); expect(readWebAssetSources(restored.project).records[0]!.source).toBe('PRIVATE_SOURCE_PATH');
    const report = JSON.parse(strFromU8(bundle['release/preparation.json']!)); expect(report.sourceProjectDigest).toBe(semanticHash(p)); expect(report.gameProjectDigest).toBe(game.projectDigest); expect(report.assets[0].record.evidence).toBe('PRIVATE_EVIDENCE'); expect(report.publicDeployment).toBe('not-verified'); expect(strFromU8(bundle['开始使用.txt']!)).toContain('source、release、review');
  }
});
it('does not auto-publish a requested attribution and keeps public credit edits distinct from private evidence', async () => {
  const record = { ...pending(), permission: 'documented' as const, reviewedBy: '测试确认人', reviewedOn: '2026-10-16', credit: '准确公开署名' };
  const p = applyWebAssetSources(source(), { schemaVersion: 1, records: [record] }); expect(createWebReleasePreparation(p).assets[0]!.status).toBe('credit-missing');
  const hidden = await createFormalWebArtifact(p, reader, runtime); expect(hidden.html).not.toContain(record.credit);
  const publicProject = applyWebCredits(p, { ...DEFAULT_WEB_CREDITS, acknowledgements: record.credit }); expect(createWebReleasePreparation(publicProject).documentedAssets).toBe(1);
  const exported = unzipSync((await createFormalWebDirectoryArtifact(publicProject, reader, runtime)).archive); expect(strFromU8(exported['credits.txt']!)).toContain(record.credit); expect(strFromU8(exported['index.html']!)).not.toContain(record.evidence);
});

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { applyWebAssetSources, applyWebCredits, DEFAULT_WEB_CREDITS, newWebAssetSourceRecord, readWebAssetSources, semanticHash } from '@world-studio/project-domain';
import { createBlobDigest, type AssetIndex } from '@world-studio/project-persistence';
import { unzipSync, strFromU8 } from 'fflate';
import { App } from './App';
import { branchAuthoringFixture } from './branch-authoring-fixture';
import { projectCanonicalWithAssetIndex } from './canonical-project-adapter';
import { createFormalWebArtifact, createFormalWebDirectoryArtifact } from './formal-web-export';
import { createWebDeliveryBundle, importStudioProjectArchive } from './web-delivery-bundle';
import { applyWebPublication } from './web-publication';
import { WebReleaseGuide } from './WebReleaseGuide';
import { DEFAULT_PUBLICATION_WORKFLOW, readStudioWorkPosition, resumePublicationWorkflow, studioWorkDescription, studioWorkPositionKey, type StudioWorkPosition } from './studio-work-position';

const bytes = new Uint8Array([1, 2, 3]), digest = createBlobDigest(bytes), runtime = { javascript: 'window.currentPlayer=true', css: 'body{color:#123}' };
const index: AssetIndex = { schemaVersion: 1, indexRevision: 1, assets: ['image_a', 'image_b'].map(assetId => ({ assetId, displayName: assetId, kind: 'background', tags: [], source: { digest, byteLength: bytes.length, mimeType: 'image/png' } })) };
const reader = { read: async () => bytes.slice() };
const project = () => applyWebCredits(applyWebAssetSources(applyWebPublication(projectCanonicalWithAssetIndex(branchAuthoringFixture(), index), { name: '网站交付', version: '2.1.0', iconAssetId: '' }), { schemaVersion: 1, records: [{ ...newWebAssetSourceRecord('image_a', digest), source: 'PRIVATE_SOURCE_375', evidence: 'PRIVATE_EVIDENCE_375' }] }), { ...DEFAULT_WEB_CREDITS, acknowledgements: '测试公开署名' });
const website = (p = project(), read: Parameters<typeof createFormalWebDirectoryArtifact>[1] = reader, signal?: AbortSignal) => createFormalWebDirectoryArtifact(p, read, runtime, signal, undefined, 'website');
const unpack = (archive: Uint8Array) => unzipSync(archive);
const json = (bytes: Uint8Array) => JSON.parse(strFromU8(bytes));
const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name }));
const button = (name: string) => screen.getByRole('button', { name });
const ready = () => waitFor(() => expect(document.querySelector('.local-save-button')).toBeEnabled());
async function openWebsite(options: { save?: (project: unknown) => Promise<void>; referenceId?: string } = {}) {
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:artifact-${vi.mocked(URL.createObjectURL).mock.calls.length}`); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const view = render(<App initialProject={branchAuthoringFixture()} autosaveDebounceMs={60000} {...(options.save ? { onCanonicalProjectSave: options.save } : {})} {...(options.referenceId ? { workspaceReferenceId: options.referenceId } : {})} />);
  await ready(); nav('发布'); fireEvent.click(button('继续：导出方式 →')); fireEvent.click(screen.getByRole('radio', { name: /网站上传 ZIP/ })); return view;
}
async function buildWebsite(production = false) {
  if (production) fireEvent.click(screen.getByLabelText('同时生成制作交付包')); fireEvent.click(button('继续：生成游戏 →'));
  await waitFor(() => expect(button('构建网站上传 ZIP')).toBeEnabled()); fireEvent.click(button('构建网站上传 ZIP'));
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

it('exports precisely the same public bytes as the local directory with no author helpers or extra wrapper folder', async () => {
  const p = project(), local = await createFormalWebDirectoryArtifact(p, reader, runtime), publicGame = await website(p), full = unpack(local.archive), files = unpack(publicGame.archive), info = json(files['build-info.json']!);
  expect(publicGame.websiteOnly).toBe(true); expect(local.websiteOnly).toBe(false); expect(publicGame.filename).toBe('网站交付-2.1.0-website.zip'); expect(local.filename).toBe('网站交付-web.zip');
  expect(publicGame.projectDigest).toBe(local.projectDigest); expect(Object.keys(files).sort()).toEqual(['build-info.json', ...info.files.map((row: { path: string }) => row.path)].sort());
  for (const [name, data] of Object.entries(files)) expect(data, name).toEqual(full[name]);
  for (const name of ['preview.mjs', 'deployment-check.mjs', 'check-deployment.cmd', 'start-preview.cmd', '使用说明.txt']) { expect(files[name]).toBeUndefined(); expect(full[name]).toBeDefined(); }
  for (const row of info.files) { expect(createBlobDigest(files[row.path]!)).toBe(row.digest); expect(files[row.path]!.length).toBe(row.byteLength); }
  const payload = json(new TextEncoder().encode(strFromU8(files['index.html']!).match(/<script id="world-project" type="application\/json">(.*?)<\/script>/u)![1]!));
  expect(payload.project.manifest.preservedFields.webAssetSources).toBeUndefined(); expect(payload.mediaAssets[0].url).toBe(payload.mediaAssets[1].url); expect(strFromU8(files['credits.txt']!)).toContain('测试公开署名');
  for (const data of Object.values(files)) for (const privateText of ['PRIVATE_SOURCE_375', 'PRIVATE_EVIDENCE_375']) expect(strFromU8(data)).not.toContain(privateText);
});
it('keeps the service worker and offline inventory byte-identical, excluding author helpers from both', async () => {
  const files = unpack((await website()).archive), info = json(files['build-info.json']!);
  const inventory = JSON.parse(strFromU8(files['sw.js']!).match(/^const inventory = (.*);$/mu)![1]!);
  expect(inventory).toEqual(Object.fromEntries(info.files.filter((row: { path: string }) => row.path !== 'sw.js').map((row: { path: string; digest: string }) => [row.path, row.digest])));
  expect(Object.keys(inventory).every(name => Object.hasOwn(files, name))).toBe(true); expect(files['manifest.webmanifest']).toBeDefined();
});
it('checks fresh media on every website build and never reuses an earlier successful export as validation', async () => {
  const read = vi.fn<() => Promise<Uint8Array | null>>().mockResolvedValue(bytes); await website(project(), { read }); expect(read).toHaveBeenCalledOnce();
  read.mockResolvedValue(null); await expect(website(project(), { read })).rejects.toThrow('缺失或不完整');
  read.mockResolvedValue(new Uint8Array([9, 9, 9])); await expect(website(project(), { read })).rejects.toThrow('缺失或不完整');
  read.mockResolvedValue(bytes); expect((await website(project(), { read })).websiteOnly).toBe(true); expect(read).toHaveBeenCalledTimes(4);
});
it('supports cancellation before and during media verification without returning a partial archive', async () => {
  const controller = new AbortController(); controller.abort(); const read = vi.fn(async () => bytes);
  await expect(website(project(), { read }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(read).not.toHaveBeenCalled();
  const later = new AbortController(); await expect(website(project(), { read: async () => { later.abort(); return bytes; } }, later.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
it('does not change editable source, player identity or existing formats, and validates the directory purpose', async () => {
  const p = project(), before = semanticHash(p); const site = await website(p), single = await createFormalWebArtifact(p, reader, runtime);
  expect(site.projectDigest).toBe(single.projectDigest); expect(semanticHash(p)).toBe(before); expect(readWebAssetSources(p).records[0]!.permission).toBe('pending');
  await expect(createFormalWebDirectoryArtifact(p, reader, runtime, undefined, undefined, 'invalid' as 'website')).rejects.toThrow('用途');
});
it('keeps the public website and private author production package separate and fully restorable', async () => {
  const p = project(), game = await website(p), result = await createWebDeliveryBundle(p, index, reader, game, null), files = unpack(result.archive);
  expect(result.manifest.format).toBe('directory'); expect(semanticHash(importStudioProjectArchive(result.archive).project)).toBe(semanticHash(p));
  for (const [name, data] of Object.entries(unpack(game.archive))) expect(files[`game/${name}`]).toEqual(data);
  expect(files['game/使用说明.txt']).toBeUndefined(); expect(files['source/project.zip']).toBeDefined(); expect(strFromU8(files['release/preparation.json']!)).toContain('PRIVATE_EVIDENCE_375');
  const help = strFromU8(files['开始使用.txt']!); expect(help).toContain('作者内部备份，不可整包上传'); expect(help).toContain('game 文件夹已是同版纯网站内容'); expect(help).not.toContain('本地站点说明见');
  const report = json(files['release/preparation.json']!); expect(report.publicDeployment).toBe('not-verified'); expect(report.deploymentUrl).toBeNull();
});
it('gives format-specific deployment guidance rather than claiming the generated ZIP is already online', () => {
  const view = render(<WebReleaseGuide format="website" ready={true} productionReady={true} />); expect(screen.getByText(/此处不执行上传，不生成网址/)).toBeInTheDocument(); expect(screen.getByText(/此包不含本地启动助手/)).toBeInTheDocument();
  view.rerender(<WebReleaseGuide format="html" ready={true} />); expect(screen.getByText(/无需先安装 Node.js/)).toBeInTheDocument();
  view.rerender(<WebReleaseGuide format="directory" ready={true} />); expect(screen.getByText(/双击 check-deployment.cmd/)).toBeInTheDocument();
});
it('preserves all three existing and new publication choices and rejects unknown future format values', () => {
  for (const format of ['html', 'directory', 'website'] as const) {
    const p = branchAuthoringFixture(), value: StudioWorkPosition = { schemaVersion: 1, projectId: p.manifest.projectId, referenceId: 'reference', page: 'publish', workspaceMode: 'writer', editorView: 'sequence', sceneId: 'entry', statementId: 'intro', productionSection: 'assets', previewOpen: false, publication: { ...DEFAULT_PUBLICATION_WORKFLOW, step: 3, format }, releaseReturnFormat: format };
    expect(readStudioWorkPosition(JSON.stringify(value), 'reference', p.manifest.projectId)).toEqual(value); expect(resumePublicationWorkflow(value.publication)).toMatchObject({ step: 2, format });
    localStorage.setItem(studioWorkPositionKey('reference'), JSON.stringify(value)); if (format === 'website') expect(studioWorkDescription('reference', p.manifest.projectId)).toContain('网站上传 ZIP');
    expect(() => readStudioWorkPosition(JSON.stringify({ ...value, publication: { ...value.publication, format: 'upload-automatically' } }), 'reference', p.manifest.projectId)).toThrow();
  }
});
it('builds an explicitly labelled website download and private package from the real App, then invalidates both when format changes', async () => {
  const save = vi.fn().mockResolvedValue(undefined); await openWebsite({ save }); await buildWebsite(true); await screen.findByRole('link', { name: '下载网站上传包' });
  expect(screen.getByText(/· Web · 网站上传 ZIP/u)).toBeVisible();
  expect(save).toHaveBeenCalledOnce(); expect(screen.getByRole('link', { name: '下载制作交付包' })).toBeVisible(); expect(screen.queryByRole('link', { name: '下载游戏' })).toBeNull(); expect(screen.getByText(/不要把整个制作交付包上传玩家网站/)).toBeInTheDocument();
  fireEvent.click(button('继续：试玩与部署 →')); expect(screen.getByText(/此处不执行上传，不生成网址/)).toBeVisible(); fireEvent.click(button('更换导出方式')); fireEvent.click(screen.getByRole('radio', { name: /单文件 HTML/ }));
  expect(screen.queryByRole('link', { name: '下载网站上传包' })).toBeNull(); expect(screen.queryByRole('link', { name: '下载制作交付包' })).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
}, 15000);
it('persists the website selection across reopening but never restores expired download links', async () => {
  const view = await openWebsite({ referenceId: 'website-workspace' }); await buildWebsite(); await screen.findByRole('link', { name: '下载网站上传包' }); fireEvent.click(button('继续：试玩与部署 →')); view.unmount();
  render(<App initialProject={branchAuthoringFixture()} workspaceReferenceId="website-workspace" autosaveDebounceMs={60000} />); await ready(); expect(button('构建网站上传 ZIP')).toBeVisible(); expect(screen.queryByRole('link', { name: '下载网站上传包' })).toBeNull();
  fireEvent.click(button('← 导出方式')); expect(screen.getByRole('radio', { name: /网站上传 ZIP/ })).toBeChecked();
}, 15000);
it('hides old website links for an unapplied publication draft, then rebuilds the changed version with a new filename', async () => {
  await openWebsite(); await buildWebsite(); const old = await screen.findByRole('link', { name: '下载网站上传包' }), href = old.getAttribute('href');
  fireEvent.click(within(screen.getByRole('navigation', { name: '发布流程' })).getByRole('button', { name: /作品信息/ })); fireEvent.change(screen.getByLabelText('发布版本'), { target: { value: '2.0.0' } });
  expect(screen.queryByRole('link', { name: '下载网站上传包' })).toBeNull(); expect(within(screen.getByRole('navigation', { name: '发布流程' })).getByRole('button', { name: /生成游戏/ })).toBeDisabled();
  fireEvent.click(button('应用发布设置')); expect(URL.revokeObjectURL).toHaveBeenCalledWith(href); expect(screen.queryByRole('link', { name: '下载网站上传包' })).toBeNull();
  fireEvent.click(within(screen.getByRole('navigation', { name: '发布流程' })).getByRole('button', { name: /生成游戏/ })); await waitFor(() => expect(button('构建网站上传 ZIP')).toBeEnabled()); fireEvent.click(button('构建网站上传 ZIP'));
  expect(await screen.findByRole('link', { name: '下载网站上传包' })).toHaveAttribute('download', expect.stringContaining('-2.0.0-website.zip'));
}, 15000);
it('does not generate public or private downloads after a failed source save and allows an explicit retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(Error('测试保存失败')).mockResolvedValue(undefined); await openWebsite({ save }); await buildWebsite(true);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('工程尚未保存成功')); expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(screen.queryByRole('link', { name: '下载网站上传包' })).toBeNull();
  fireEvent.click(button('构建网站上传 ZIP')); await screen.findByRole('link', { name: '下载网站上传包' }); expect(screen.getByRole('link', { name: '下载制作交付包' })).toBeVisible(); expect(save).toHaveBeenCalledTimes(2); expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
}, 15000);
it('cancels a website build waiting for source save and never offers a partial website or production ZIP', async () => {
  let finish: () => void = () => {}; const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve; })); await openWebsite({ save }); await buildWebsite(true); await waitFor(() => expect(save).toHaveBeenCalledOnce());
  fireEvent.click(button('取消本次构建')); await act(async () => finish()); expect(screen.queryByRole('link', { name: '下载网站上传包' })).toBeNull(); expect(screen.queryByRole('link', { name: '下载制作交付包' })).toBeNull(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('ignores a late website build after changing purpose and keeps the new HTML artifact', async () => {
  let finish: () => void = () => {}; const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve; })); await openWebsite({ save }); await buildWebsite(true); await waitFor(() => expect(save).toHaveBeenCalledOnce());
  fireEvent.click(within(screen.getByRole('navigation', { name: '发布流程' })).getByRole('button', { name: /导出方式/ })); fireEvent.click(screen.getByRole('radio', { name: /单文件 HTML/ })); fireEvent.click(screen.getByLabelText('同时生成制作交付包')); fireEvent.click(button('继续：生成游戏 →'));
  await waitFor(() => expect(button('构建试玩 HTML')).toBeEnabled()); fireEvent.click(button('构建试玩 HTML')); const html = await screen.findByRole('link', { name: '下载游戏' }), href = html.getAttribute('href'); await act(async () => finish());
  expect(screen.getByRole('link', { name: '下载游戏' })).toHaveAttribute('href', href); expect(screen.queryByRole('link', { name: '下载网站上传包' })).toBeNull(); expect(screen.queryByRole('link', { name: '下载制作交付包' })).toBeNull();
}, 15000);

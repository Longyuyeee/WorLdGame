import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DEFAULT_WEB_CREDITS, readWebCredits, applyWebCredits, type CanonicalProject } from '@world-studio/project-domain';
import { unzipSync, strFromU8 } from 'fflate';
import { App } from './App';
import { WebCreditsDialog } from './WebCreditsDialog';
import { branchAuthoringFixture } from './branch-authoring-fixture';
import { createFormalWebArtifact, createFormalWebDirectoryArtifact } from './formal-web-export';
import { inspectWebReleaseSources } from './web-release-readiness';
import { exportPortableCanonicalProject, importPortableProjectBundle } from './portable-project-bundle';
import { createAssetIndex } from '@world-studio/project-persistence';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
it('protects a draft on Escape, checks links, orders contributors and explicitly applies or discards', () => {
  const apply = vi.fn(), close = vi.fn(), source = branchAuthoringFixture(); render(<WebCreditsDialog project={source} onApply={apply} onClose={close} />);
  fireEvent.change(screen.getByLabelText('制作团队'), { target: { value: '示例团队' } }); fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true })); expect(close).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('尚未应用');
  for (const name of ['测试编剧', '测试美术']) { fireEvent.click(screen.getByRole('button', { name: '添加署名' })); const i = name === '测试编剧' ? 1 : 2; fireEvent.change(screen.getByLabelText(`职责 ${i}`), { target: { value: name === '测试编剧' ? '剧本' : '美术' } }); fireEvent.change(screen.getByLabelText(`署名 ${i}`), { target: { value: name } }); }
  fireEvent.change(screen.getByLabelText('作品网站'), { target: { value: 'javascript:alert(1)' } }); fireEvent.click(screen.getByRole('button', { name: '应用制作名单' })); expect(apply).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('https://');
  fireEvent.change(screen.getByLabelText('作品网站'), { target: { value: 'https://example.com' } }); fireEvent.click(screen.getByRole('button', { name: '上移署名 2' })); fireEvent.click(screen.getByRole('button', { name: '应用制作名单' })); expect(readWebCredits(apply.mock.calls[0]![0]).entries.map(entry => entry.name)).toEqual(['测试美术', '测试编剧']); expect(close).toHaveBeenCalledOnce();
});
it('keeps unfinished publication fields safe, applies the separate credits dialog and reopens its content', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); render(<App initialProject={branchAuthoringFixture()} autosaveDebounceMs={60000} />); await waitFor(() => expect(screen.getByRole('button', { name: '保存到本机' })).toBeEnabled());
  fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name: '发布' })); fireEvent.change(screen.getByLabelText('发布名称'), { target: { value: '未应用名称' } }); expect(screen.getByRole('button', { name: '编辑制作名单' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
  fireEvent.click(screen.getByRole('button', { name: '编辑制作名单' })); fireEvent.change(screen.getByLabelText('制作团队'), { target: { value: '作者测试组' } }); expect(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name: '故事' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '应用制作名单' })); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '编辑制作名单' })); expect(screen.getByLabelText('制作团队')).toHaveValue('作者测试组'); fireEvent.change(screen.getByLabelText('制作团队'), { target: { value: '未应用' } }); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '放弃修改' })); fireEvent.click(screen.getByRole('button', { name: '编辑制作名单' })); expect(screen.getByLabelText('制作团队')).toHaveValue('作者测试组');
});
it('carries credits through source and both game formats, lists the text file for deployment and blocks malformed imported credits', async () => {
  const source = applyWebCredits(branchAuthoringFixture(), { ...DEFAULT_WEB_CREDITS, studio: '示例团队', entries: [{ role: '编剧', name: '<测试>', url: '' }], acknowledgements: '来源\n许可说明' });
  const zip = await exportPortableCanonicalProject(source, createAssetIndex(), { read: async () => null }); expect(readWebCredits(importPortableProjectBundle(zip).project)).toEqual(readWebCredits(source));
  const runtime = { javascript: '', css: '' }, reader = { read: async () => null };
  const single = await createFormalWebArtifact(source, reader, runtime); const doc = new DOMParser().parseFromString(single.html, 'text/html'); expect(readWebCredits(JSON.parse(doc.getElementById('world-project')!.textContent!).project)).toEqual(readWebCredits(source));
  const files = unzipSync((await createFormalWebDirectoryArtifact(source, reader, runtime)).archive); expect(strFromU8(files['credits.txt']!)).toContain('编剧：<测试>'); expect(JSON.parse(strFromU8(files['build-info.json']!)).files).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'credits.txt' })])); expect(strFromU8(files['sw.js']!)).toContain('credits.txt');
  const invalid = { ...source, manifest: { ...source.manifest, preservedFields: { ...source.manifest.preservedFields, webCredits: { schemaVersion: 99 } } } } as CanonicalProject;
  expect((await inspectWebReleaseSources(invalid, reader)).findings).toContainEqual(expect.objectContaining({ code: 'WEB_CREDITS_INVALID', target: 'publication' })); await expect(createFormalWebArtifact(invalid, reader, runtime)).rejects.toThrow('制作名单');
});

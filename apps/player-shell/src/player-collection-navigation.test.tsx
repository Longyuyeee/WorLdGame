import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { createProjectTemplate } from '@world-studio/project-domain';
import { compileProject, updateAdditionalContentCatalogOverride } from '@world-studio/project-compiler';
import { PlayerShell } from './PlayerShell';
import { createPlayerMediaDemoV1 } from './media-demo';

afterEach(() => localStorage.clear());
function fixture() {
  const project = createProjectTemplate('Collection return', '018f08d8-71a1-7bc2-a627-2f4a843ee177'), id = project.manifest.entrySceneId;
  return { ...project, settings: withProjectSettings(project.settings, { text: { revealMode: 'instant' } }), scripts: { ...project.scripts, [id]: { ...project.scripts[id]!, statements: [
    { id: 'line', kind: 'narration' as const, textId: 'line_text', text: '信留在桌上。' }, { id: 'end', kind: 'end' as const, endingName: '约定' }
  ] } } };
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
it('names the title destination and returns to its actual trigger without starting the story', () => {
  const { container } = render(<PlayerShell project={fixture()} />); const root = container.querySelector('main')!, before = root.dataset.runtimeStateHash;
  const trigger = screen.getByRole('button', { name: '打开附加内容' }); trigger.focus(); click('打开附加内容');
  expect(screen.getByRole('button', { name: '返回标题' })).toHaveFocus(); click('查看 场景回想'); click('返回标题');
  expect(root).toHaveAttribute('data-player-status', 'title'); expect(root.dataset.runtimeStateHash).toBe(before); expect(trigger).toHaveFocus();
});
it('names the ending destination through all catalog views and keeps the ended checkpoint', () => {
  const { container } = render(<PlayerShell project={fixture()} />); click('开始故事'); click('继续下一句');
  const root = container.querySelector('main')!, before = root.dataset.runtimeStateHash;
  const trigger = screen.getByRole('button', { name: '查看收藏与结局' }); trigger.focus(); click('查看收藏与结局');
  for (const view of ['场景回想', '结局']) {
    expect(screen.getByRole('button', { name: '返回结局' })).toBeEnabled(); click('返回附加内容总览'); click(`查看 ${view}`);
  }
  click('返回结局'); expect(root).toHaveAttribute('data-player-status', 'ended'); expect(root.dataset.runtimeStateHash).toBe(before); expect(trigger).toHaveFocus();
});
it('keeps configured catalog covers in a separate visual column, including collected music', () => {
  const demo = createPlayerMediaDemoV1(); let project = demo.project;
  const compiled = compileProject(project); if (!compiled.ok) throw Error('Invalid demo');
  for (const catalog of ['replay', 'music', 'ending'] as const) {
    const entries = catalog === 'ending' ? compiled.artifacts.catalogs.endings : compiled.artifacts.catalogs[catalog];
    for (const entry of entries) project = updateAdditionalContentCatalogOverride(project, catalog, 'replayId' in entry ? entry.replayId : 'endingId' in entry ? entry.endingId : entry.assetId, { coverAssetId: 'media_sunset' });
  }
  const { container } = render(<PlayerShell project={project} mediaAssets={demo.mediaAssets} />);
  click('开始故事'); click('完成动效'); click('继续下一句'); click('继续下一句'); click('查看收藏与结局');
  for (const [view, list] of [['场景回想', 'replay'], ['音乐室', 'music'], ['结局', 'endings']]) {
    click('返回附加内容总览'); click(`查看 ${view}`);
    const row = container.querySelector(`.player-additional-content__${list} li`)!;
    expect(row.querySelector('.player-additional-content__catalog-visual > .player-additional-content__catalog-cover')).not.toBeNull();
    expect(row.querySelector('.player-additional-content__catalog-copy > strong')).not.toBeNull();
  }
});
it('keeps the body return name and reading checkpoint on direct close and layered Escape', () => {
  const { container } = render(<PlayerShell project={fixture()} />); click('开始故事'); const root = container.querySelector('main')!, before = root.dataset.runtimeStateHash;
  click('打开阅读菜单'); click('打开附加内容'); click('查看 场景回想'); expect(screen.getByRole('button', { name: '返回剧情' })).toBeEnabled();
  fireEvent.keyDown(window, { key: 'Escape' }); expect(within(screen.getByRole('dialog', { name: '附加内容' })).getByRole('button', { name: '查看 场景回想' })).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Escape' }); expect(root.dataset.runtimeStateHash).toBe(before); expect(screen.getByRole('button', { name: '打开阅读菜单' })).toHaveFocus();
});

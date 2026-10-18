import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { App } from './App';
import { progressProject } from './playtest-progress-fixture';
import { readStudioWorkPosition, studioWorkPositionKey } from './studio-work-position';
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name }));
const ready = () => waitFor(() => expect(document.querySelector<HTMLButtonElement>('.local-save-button')?.disabled).toBe(false));
const options = () => { fireEvent.click(screen.getByLabelText('同时生成制作交付包')); for (const label of ['附带校订记录', '附带试玩进度']) fireEvent.click(screen.getByLabelText(label)); fireEvent.click(screen.getByRole('radio', { name: /网页目录 ZIP/ })); };
const checkOptions = () => { for (const label of ['同时生成制作交付包', '附带校订记录', '附带试玩进度']) expect(screen.getByLabelText(label)).toBeChecked(); expect(screen.getByRole('radio', { name: /网页目录 ZIP/ })).toBeChecked(); };
function setup(referenceId?: string) { return render(<App initialProject={progressProject()} {...(referenceId ? { workspaceReferenceId: referenceId } : {})} autosaveDebounceMs={60_000} />); }
it('retains export step and all author choices across checks, story and appearance without a project reload', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); setup(); await ready(); nav('发布'); fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); options();
  fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' })); nav('检查'); nav('发布'); expect(screen.getByRole('region', { name: '生成可运行的游戏' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '← 导出方式' })); checkOptions(); nav('游戏外观'); nav('故事'); nav('发布'); expect(screen.getByRole('region', { name: '选择导出方式' })).toBeVisible(); checkOptions();
});
it('remembers scene, script view and collapsed preview without requiring a source edit or save', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const view = setup('workspace-one'); await ready();
  fireEvent.click(document.querySelectorAll('.scene-item')[2]!); fireEvent.click(screen.getByRole('button', { name: '脚本' })); fireEvent.click(screen.getByRole('button', { name: '收起预览' }));
  expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-context-scene-id', 'go');
  expect(readStudioWorkPosition(localStorage.getItem(studioWorkPositionKey('workspace-one')), 'workspace-one', progressProject().manifest.projectId)?.sceneId).toBe('go');
  view.unmount(); setup('workspace-one'); await ready();
  expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-context-scene-id', 'go'); expect((screen.getByLabelText('权威脚本编辑器') as HTMLTextAreaElement).value).toContain('go_end'); expect(screen.getByRole('button', { name: '打开预览' })).toBeVisible();
});
it('reopens a completed wizard at generation with choices intact and no expired artifact links', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:game'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const view = setup('workspace-one'); await ready(); nav('发布'); fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); options(); fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '构建目录 ZIP' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: '构建目录 ZIP' })); await screen.findByRole('link', { name: '下载制作交付包' });
  fireEvent.click(screen.getByRole('button', { name: '继续：试玩与部署 →' })); view.unmount(); setup('workspace-one'); await ready();
  expect(screen.getByRole('region', { name: '生成可运行的游戏' })).toBeVisible(); expect(screen.queryByRole('link', { name: '下载游戏' })).toBeNull(); expect(screen.queryByRole('link', { name: '下载制作交付包' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '← 导出方式' })); checkOptions();
}, 15000);
it('keeps the return-to-generation task across reopen and starts no runtime session automatically', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const view = setup('workspace-one'); await ready(); nav('发布'); fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); options(); fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' }));
  fireEvent.click(within(screen.getByRole('region', { name: '结局试玩进度' })).getByRole('button', { name: '从头试玩当前版本' })); view.unmount(); setup('workspace-one'); await ready();
  expect(screen.getByRole('button', { name: '试玩完整流程' })).toBeVisible(); expect(screen.getByRole('button', { name: '返回生成游戏' })).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: '返回生成游戏' }));
  expect(screen.getByRole('button', { name: '构建目录 ZIP' })).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: '← 导出方式' })); checkOptions();
});
it('starts an explicitly imported workspace with its own choices even for the same project ID', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const view = setup('workspace-one'); await ready(); nav('发布'); fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); options(); view.unmount();
  setup('workspace-two'); await ready(); expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-studio-page', 'story'); nav('发布'); expect(screen.getByRole('region', { name: '作品发布信息' })).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' }));
  expect(screen.getByRole('radio', { name: /单文件 HTML/ })).toBeChecked(); expect(screen.getByLabelText('同时生成制作交付包')).not.toBeChecked();
});
it('preserves corrupt preferences until explicit retry, and exposes failed writes without blocking editing', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const key = studioWorkPositionKey('workspace-one'); localStorage.setItem(key, 'broken'); setup('workspace-one'); await ready(); nav('检查'); expect(localStorage.getItem(key)).toBe('broken'); expect(screen.getByText(/上次工作位置无法读取/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重新记住当前位置' })); expect(readStudioWorkPosition(localStorage.getItem(key), 'workspace-one', progressProject().manifest.projectId)?.page).toBe('checks');
  const original = Storage.prototype.setItem, before = localStorage.getItem(key); const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) { if (name === key) throw Error('quota'); original.call(this, name, value); });
  nav('发布'); expect(screen.getByText(/本次工作位置暂未记住/)).toBeVisible(); expect(localStorage.getItem(key)).toBe(before); fail.mockRestore(); fireEvent.click(screen.getByRole('button', { name: '重新记住当前位置' })); expect(readStudioWorkPosition(localStorage.getItem(key), 'workspace-one', progressProject().manifest.projectId)?.page).toBe('publish');
});

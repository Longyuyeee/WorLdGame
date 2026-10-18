import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { App } from './App';
import { reviewTaskProject, reviewTaskNotes } from './playtest-review-task-fixture';
import { writePlaytestNotes } from './playtest-notes';
import type { StudioContinuity } from './studio-continuity';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
const ready = () => waitFor(() => expect(document.querySelector<HTMLButtonElement>('.local-save-button')?.disabled).toBe(false));
const focusMode = () => document.querySelector('.app-shell')?.getAttribute('data-preview-focus');
const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name }));
it('separates the readable copy from the canvas and retains exact live history, future and project through layout changes', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const captured: StudioContinuity[] = [];
  render(<App initialProject={reviewTaskProject()} onCanonicalProjectSave={async () => undefined} onOpenProject={(_scene, _intent, value) => { captured.push(value!); }} autosaveDebounceMs={60_000} />); await ready();
  fireEvent.click(screen.getByRole('button', { name: '试玩完整流程' })); fireEvent.click(screen.getByRole('button', { name: '继续故事' }));
  fireEvent.click(screen.getByRole('button', { name: '选择路线：留在车站' })); fireEvent.click(screen.getByRole('button', { name: 'Runtime 后退一步' }));
  const stage = screen.getByTestId('preview-stage'), copy = screen.getByTestId('preview-step'); expect(stage).not.toContainElement(copy);
  const capture = async () => { const count = captured.length; await ready(); fireEvent.click(screen.getByLabelText('项目菜单')); fireEvent.click(screen.getByRole('button', { name: /章节与角色/ })); await waitFor(() => expect(captured).toHaveLength(count + 1)); };
  await capture(); const before = captured[0]!.preview!;
  fireEvent.click(screen.getByRole('button', { name: '专注预览' })); expect(focusMode()).toBe('true');
  expect(screen.getByTestId('preview-stage')).toBe(stage); expect(screen.getByTestId('preview-step')).toBe(copy);
  fireEvent.keyDown(copy, { key: 'End' }); expect(screen.getByRole('group', { name: 'Runtime 调试控制' })).toHaveTextContent('试玩记录 2/3');
  fireEvent.keyDown(copy, { key: 'Escape' }); expect(focusMode()).toBe('false'); expect(screen.getByRole('button', { name: '专注预览' })).toHaveFocus();
  await capture(); const after = captured.at(-1)!.preview!;
  expect(after.playable.historySession).toBe(before.playable.historySession); expect(after.playable.runtimeState).toBe(before.playable.runtimeState);
  expect(after.playable.effectHost).toBe(before.playable.effectHost); expect(after.project).toBe(before.project);
  expect(screen.getByRole('button', { name: 'Runtime 前进一步' })).toBeEnabled();
});
it('does not treat IME/select Escape as an exit, and never applies preview focus to publishing', async () => {
  render(<App initialProject={reviewTaskProject()} initialSceneId="scene_a" />); fireEvent.click(screen.getByRole('button', { name: '专注预览' }));
  const copy = screen.getByTestId('preview-step'); fireEvent.keyDown(copy, { key: 'Escape', isComposing: true }); expect(focusMode()).toBe('true');
  fireEvent.keyDown(screen.getByLabelText('预览尺寸'), { key: 'Escape' }); expect(focusMode()).toBe('true');
  nav('发布'); expect(focusMode()).toBe('false'); expect(screen.queryByRole('button', { name: '专注预览' })).toBeNull();
});
it('suspends hidden writer insertion shortcuts until returning to the editing layout', () => {
  render(<App initialProject={reviewTaskProject()} initialSceneId="scene_a" />);
  fireEvent.click(screen.getByText('插入与整理内容')); fireEvent.change(screen.getByLabelText('插入 P0 语句类型'), { target: { value: 'narration' } });
  fireEvent.click(screen.getByRole('button', { name: '专注预览' }));
  expect(fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(window, { key: '1', altKey: true })).toBe(true);
  expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-source-revision', '0');
  fireEvent.click(screen.getByRole('button', { name: '返回编辑布局' }));
  expect(fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })).toBe(false);
  expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-source-revision', '1');
});
it('opens a review in a wide preview without restarting, editing or approving the issue', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const project = reviewTaskProject();
  localStorage.setItem(`world-studio:playtest-notes:${project.manifest.projectId}`, writePlaytestNotes(project.manifest.projectId, reviewTaskNotes()));
  render(<App initialProject={project} autosaveDebounceMs={60_000} />); await ready(); nav('检查');
  const row = document.querySelector('[data-review-id="first"]')!; fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '从此处复测' }));
  const task = screen.getByRole('region', { name: '当前校订任务' }); await waitFor(() => expect(within(task).getByRole('button', { name: '确认已复核' })).toBeEnabled());
  fireEvent.click(within(task).getByRole('button', { name: '查看试玩画面' })); expect(focusMode()).toBe('true');
  expect(task).toHaveTextContent('待修改'); expect(screen.getByTestId('preview-step')).toHaveAttribute('data-statement-id', 'intro');
  fireEvent.click(screen.getByRole('button', { name: '返回编辑布局' })); expect(within(task).getByRole('button', { name: '确认已复核' })).toBeEnabled();
});

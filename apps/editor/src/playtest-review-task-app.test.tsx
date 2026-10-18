import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { App } from './App';
import { readPlaytestNotes, writePlaytestNotes } from './playtest-notes';
import { reviewTaskNotes, reviewTaskProject } from './playtest-review-task-fixture';
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name }));
const task = () => screen.getByRole('region', { name: '当前校订任务' });
const board = () => screen.getByRole('region', { name: '试玩校订清单' });
const row = (id: string) => board().querySelector<HTMLElement>(`[data-review-id="${id}"]`)!;
const ready = () => waitFor(() => expect(document.querySelector<HTMLButtonElement>('.local-save-button')?.disabled).toBe(false));
const key = () => `world-studio:playtest-notes:${reviewTaskProject().manifest.projectId}`;
function seed() { vi.stubGlobal('indexedDB', new IDBFactory()); localStorage.setItem(key(), writePlaytestNotes(reviewTaskProject().manifest.projectId, reviewTaskNotes())); }
function open() { return render(<App initialProject={reviewTaskProject()} workspaceReferenceId="review-workspace" autosaveDebounceMs={60_000} />); }
const confirmReady = () => waitFor(() => expect(within(task()).getByRole('button', { name: '确认已复核' })).toBeEnabled());
it('takes a creator from publishing through edit/retest/confirm/next and back to the chosen export format', async () => {
  seed(); open(); await ready(); nav('发布'); fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); fireEvent.click(screen.getByRole('radio', { name: /网页目录 ZIP/ })); fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' }));
  fireEvent.click(screen.getByRole('button', { name: '查看校订清单' })); expect(screen.getByRole('button', { name: '返回生成游戏' })).toBeVisible(); fireEvent.click(within(row('first')).getByRole('button', { name: '定位原文' })); expect(task()).toHaveTextContent('开场措辞需要更自然。');
  fireEvent.change(screen.getByLabelText('旁白文本'), { target: { value: '雨已经停了，下一程从这里开始。' } }); expect(within(task()).getByRole('button', { name: '标记已修改并复测' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '应用修改' }));
  fireEvent.click(within(task()).getByText('问题详情与前后内容')); expect(within(task()).getAllByRole('blockquote').map(element => element.textContent)).toEqual(['雨声渐渐停下，你会走向哪里？', '雨已经停了，下一程从这里开始。']);
  fireEvent.click(within(task()).getByRole('button', { name: '标记已修改并复测' })); await confirmReady(); expect(screen.getByTestId('preview-step')).toHaveTextContent('雨已经停了，下一程从这里开始。'); fireEvent.click(within(task()).getByRole('button', { name: '确认已复核' })); expect(task()).toHaveTextContent('已复核');
  fireEvent.click(within(task()).getByRole('button', { name: '下一条待跟进' })); expect(task()).toHaveTextContent('检查留下路线的演出停顿。'); expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-context-statement-id', 'line_a');
  fireEvent.click(within(task()).getByRole('button', { name: '标记已修改并复测' })); await confirmReady(); fireEvent.click(within(task()).getByRole('button', { name: '确认已复核' })); fireEvent.click(within(task()).getByRole('button', { name: '返回校订清单' })); expect(board()).toHaveTextContent('当前记录均已复核。');
  expect(screen.getByRole('region', { name: '结局试玩进度' })).toHaveTextContent('0 / 2'); fireEvent.click(screen.getByRole('button', { name: '返回生成游戏' })); expect(screen.getByRole('button', { name: '构建目录 ZIP' })).toBeVisible(); expect(screen.queryByRole('region', { name: '发布前校订提醒' })).toBeNull();
}, 15000);
it('restores an unfinished task after reload but requires a new local run before confirming', async () => {
  seed(); const view = open(); await ready(); nav('检查'); fireEvent.click(within(row('first')).getByRole('button', { name: '从此处复测' })); await confirmReady(); view.unmount(); open(); await ready();
  expect(task()).toHaveTextContent('开场措辞需要更自然。'); expect(within(task()).getByRole('button', { name: '确认已复核' })).toBeDisabled(); expect(screen.getByRole('button', { name: '试玩完整流程' })).toBeVisible(); fireEvent.click(within(task()).getByRole('button', { name: '重新从此处复测' })); await confirmReady();
});
it('keeps a failed fix/retest transition in place and refuses confirmation after an external note update', async () => {
  seed(); open(); await ready(); nav('检查'); fireEvent.click(within(row('first')).getByRole('button', { name: '定位原文' })); const original = Storage.prototype.setItem;
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key()) throw Error('quota'); original.call(this, name, value); });
  fireEvent.click(within(task()).getByRole('button', { name: '标记已修改并复测' })); expect(within(task()).getByRole('alert')).toHaveTextContent('quota'); expect(readPlaytestNotes(localStorage.getItem(key())!, reviewTaskProject().manifest.projectId)[0]!.status).toBe('open'); fail.mockRestore();
  fireEvent.click(within(task()).getByRole('button', { name: '标记已修改并复测' })); await confirmReady(); const changed = readPlaytestNotes(localStorage.getItem(key())!, reviewTaskProject().manifest.projectId).map(note => note.id === 'first' ? { ...note, text: 'another window changed this issue', updatedAt: note.updatedAt + 1 } : note); localStorage.setItem(key(), writePlaytestNotes(reviewTaskProject().manifest.projectId, changed));
  fireEvent.click(within(task()).getByRole('button', { name: '确认已复核' })); expect(within(task()).getByRole('alert')).toHaveTextContent('其他窗口'); expect(readPlaytestNotes(localStorage.getItem(key())!, reviewTaskProject().manifest.projectId)[0]!.text).toBe('another window changed this issue');
});
it('keeps filters/page and focuses the same row when returning and reopening the checklist', async () => {
  seed(); const initial = reviewTaskNotes()[0]!, notes = Array.from({ length: 20 }, (_, i) => ({ ...initial, id: `item_${i}`, text: `留待处理 ${i}`, updatedAt: i + 10 })); localStorage.setItem(key(), writePlaytestNotes(reviewTaskProject().manifest.projectId, notes)); const view = open(); await ready(); nav('检查');
  fireEvent.click(within(board()).getByText('筛选与搜索', { exact: true })); fireEvent.change(screen.getByLabelText('搜索校订记录'), { target: { value: '留待处理' } }); fireEvent.change(screen.getByLabelText('筛选校订问题类型'), { target: { value: 'text' } }); fireEvent.click(screen.getByRole('button', { name: '下一页记录' })); fireEvent.click(within(row('item_11')).getByRole('button', { name: '定位原文' }));
  fireEvent.click(within(task()).getByRole('button', { name: '返回校订清单' })); expect(board()).toHaveTextContent('2 / 3'); expect(row('item_11')).toHaveFocus(); expect(screen.getByLabelText('搜索校订记录')).toHaveValue('留待处理'); view.unmount(); open(); await ready();
  expect(board()).toHaveTextContent('2 / 3'); expect(row('item_11')).toHaveFocus(); expect(screen.getByLabelText('筛选校订问题类型')).toHaveValue('text');
});
it('keeps the task and record readable after its original statement is removed', async () => {
  seed(); const view = open(); await ready(); nav('检查'); fireEvent.click(within(row('first')).getByRole('button', { name: '定位原文' })); view.unmount();
  const project = reviewTaskProject(), changed = { ...project, scripts: { ...project.scripts, entry: { ...project.scripts.entry!, statements: project.scripts.entry!.statements.filter(statement => statement.id !== 'intro') } } };
  render(<App initialProject={changed} workspaceReferenceId="review-workspace" preferInitialProject autosaveDebounceMs={60_000} />); await ready(); expect(task()).toHaveTextContent('原内容或记录已删除'); expect(within(task()).queryByRole('button', { name: '标记已修改并复测' })).toBeNull(); fireEvent.click(within(task()).getByRole('button', { name: '返回校订清单' })); expect(row('first')).toHaveTextContent('原内容已删除，记录仍保留。');
});

it('starts a stage task with scene context, waits for the target, and requires a new run after range changes', async () => {
  seed();
  const project = reviewTaskProject(), changed = { ...project, scripts: { ...project.scripts, scene_a: { ...project.scripts.scene_a!, statements: [
    { id: 'context', kind: 'narration', textId: 'context_text', text: '人物入场之前的前文。' }, ...project.scripts.scene_a!.statements
  ] } } };
  render(<App initialProject={changed} workspaceReferenceId="review-context" autosaveDebounceMs={60_000} />); await ready(); nav('检查');
  fireEvent.click(within(row('second')).getByRole('button', { name: '从场景开头复测' }));
  expect(screen.getByLabelText('校订复测范围')).toHaveValue('scene');
  await waitFor(() => expect(task()).toHaveTextContent('尚未到达问题位置'));
  expect(screen.getByTestId('preview-step')).toHaveTextContent('人物入场之前的前文。');
  expect(screen.getByTestId('preview-step')).toHaveAttribute('data-statement-id', 'context');
  expect(within(task()).getByRole('button', { name: '确认已复核' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '继续故事' })); await confirmReady();
  expect(readPlaytestNotes(localStorage.getItem(key())!, project.manifest.projectId).find(note => note.id === 'second')!.status).toBe('open');
  fireEvent.click(screen.getByRole('button', { name: 'Runtime 后退一步' }));
  await waitFor(() => expect(within(task()).getByRole('button', { name: '确认已复核' })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Runtime 前进一步' })); await confirmReady();
  fireEvent.change(screen.getByLabelText('校订复测范围'), { target: { value: 'entry' } });
  expect(within(task()).queryByRole('button', { name: '确认已复核' })).toBeNull();
  fireEvent.click(within(task()).getByRole('button', { name: '标记已修改并复测' }));
  await waitFor(() => expect(task()).toHaveTextContent('尚未到达问题位置'));
  fireEvent.click(screen.getByRole('button', { name: '继续故事' }));
  fireEvent.click(screen.getByRole('button', { name: '选择路线：留在车站' }));
  fireEvent.click(screen.getByRole('button', { name: '继续故事' })); await confirmReady();
  fireEvent.click(within(task()).getByRole('button', { name: '确认已复核' })); expect(task()).toHaveTextContent('已复核');
}, 15000);

it('restores the chosen story range without live proof and cannot verify a note by finishing the other route', async () => {
  seed(); const view = open(); await ready(); nav('检查'); fireEvent.click(within(row('second')).getByRole('button', { name: '定位原文' }));
  fireEvent.change(screen.getByLabelText('校订复测范围'), { target: { value: 'entry' } });
  fireEvent.click(within(task()).getByRole('button', { name: '标记已修改并复测' }));
  fireEvent.click(screen.getByRole('button', { name: '继续故事' })); fireEvent.click(screen.getByRole('button', { name: '选择路线：乘车出发' }));
  fireEvent.click(screen.getByRole('button', { name: '继续故事' }));
  expect(within(task()).getByRole('button', { name: '确认已复核' })).toBeDisabled();
  expect(task()).toHaveTextContent('尚未到达问题位置');
  view.unmount(); open(); await ready();
  expect(screen.getByLabelText('校订复测范围')).toHaveValue('entry');
  expect(within(task()).getByRole('button', { name: '确认已复核' })).toBeDisabled();
  fireEvent.click(within(task()).getByRole('button', { name: '重新从故事开头复测' }));
  fireEvent.click(screen.getByRole('button', { name: '继续故事' })); fireEvent.click(screen.getByRole('button', { name: '选择路线：留在车站' })); await confirmReady();
  // Ordinary preview restart cannot reuse the task's previous observation.
  fireEvent.click(screen.getByRole('button', { name: '退出试玩' }));
  expect(within(task()).getByRole('button', { name: '确认已复核' })).toBeDisabled();
  expect(readPlaytestNotes(localStorage.getItem(key())!, reviewTaskProject().manifest.projectId).find(note => note.id === 'second')!.checkedSourceHash).toBeNull();
}, 15000);

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
function fixture() {
  const base = loadProject(migrateS0Project({ schemaVersion: 0, id: 'history_boundary', title: '旧信', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: '信', statements: [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `line_${i}`, kind: 'narration' as const, textId: `text_${i}`, text: `信里的段落 ${i + 1}` })),
    { id: 'end', kind: 'end', endingName: '写完' }
  ] }] }).files);
  return { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }) };
}
async function reading() {
  const view = render(<PlayerShell project={fixture()} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  await act(async () => {}); return view;
}
function open() {
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '打开剧情历史' }));
  return screen.getByRole('dialog', { name: '剧情历史' });
}
const close = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: '关闭剧情历史' });
const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement ?? window, { key: 'Tab', shiftKey });
it('treats the history interaction as modal and makes the background reading controls inert', async () => {
  const view = await reading(), dialog = open(); expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(view.container.querySelector('.player-history-controls')).toHaveAttribute('inert');
  expect(view.container.querySelector('.player-playback-controls')).toHaveAttribute('inert');
  expect(view.container.querySelector('.player-dialogue')).toHaveAttribute('inert');
});
it('wraps Tab from the last history action to the close button', async () => {
  await reading(); const dialog = open(), actions = within(dialog).getAllByRole('button'); actions.at(-1)!.focus(); tab(); expect(close(dialog)).toHaveFocus();
});
it('wraps Shift Tab from close to the last action and retains the search box in the cycle', async () => {
  await reading(); const dialog = open(), actions = within(dialog).getAllByRole('button'); close(dialog).focus(); tab(true); expect(actions.at(-1)).toHaveFocus();
  close(dialog).focus(); tab(); expect(within(dialog).getByRole('searchbox')).toHaveFocus();
});
it('recovers focus from outside the panel using first or last according to Tab direction', async () => {
  await reading(); const dialog = open(), outside = document.createElement('button'); document.body.append(outside);
  try { outside.focus(); tab(); expect(close(dialog)).toHaveFocus(); outside.focus(); tab(true); expect(within(dialog).getAllByRole('button').at(-1)).toHaveFocus(); } finally { outside.remove(); }
});
it('ignores backdrop back actions while history is open', async () => {
  const view = await reading(), back = screen.getByRole('button', { name: '后退一步' }), hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  open(); fireEvent.click(back); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash); expect(screen.getByRole('dialog', { name: '剧情历史' })).toBeInTheDocument();
});
it('ignores backdrop forward actions while history is open', async () => {
  const view = await reading(); fireEvent.click(screen.getByRole('button', { name: '后退一步' })); const forward = screen.getByRole('button', { name: '前进一步' }), hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  open(); fireEvent.click(forward); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
});
it('keeps Escape inside search until the query is cleared then returns to the desktop history trigger', async () => {
  const view = await reading(), hash = view.container.querySelector('main')!.dataset.runtimeStateHash, dialog = open(), search = within(dialog).getByRole('searchbox');
  fireEvent.change(search, { target: { value: '不存在' } }); search.focus(); fireEvent.keyDown(search, { key: 'Escape' }); expect(search).toHaveValue(''); expect(dialog).toBeInTheDocument();
  fireEvent.keyDown(search, { key: 'Escape' }); await act(async () => {}); expect(screen.queryByRole('dialog', { name: '剧情历史' })).toBeNull(); expect(screen.getByRole('button', { name: '打开剧情历史' })).toHaveFocus(); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
});
it('preserves explicit row rollback and returns focus to the selected text', async () => {
  const view = await reading(), dialog = open(); fireEvent.click(within(dialog).getByRole('button', { name: '回退到：信里的段落 2' })); await act(async () => {});
  expect(screen.queryByRole('dialog', { name: '剧情历史' })).toBeNull(); expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('信里的段落 2'); expect(screen.getByRole('button', { name: '继续下一句' })).toHaveFocus();
});
it('removes background inertness on close without replacing the current paragraph', async () => {
  const view = await reading(), paragraph = screen.getByRole('button', { name: '继续下一句' }), hash = view.container.querySelector('main')!.dataset.runtimeStateHash, dialog = open();
  fireEvent.click(close(dialog)); await act(async () => {}); expect(view.container.querySelector('.player-history-controls')).not.toHaveAttribute('inert'); expect(paragraph).not.toHaveAttribute('inert'); expect(screen.getByRole('button', { name: '继续下一句' })).toBe(paragraph); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
});

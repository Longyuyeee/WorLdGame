import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import branching from '../../../fixtures/projects/branching/project.s0.json';
import { PlayerShell } from './PlayerShell';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
function setup(allowHold = true, keyboard = true, pointer = true) {
  const base = loadProject(migrateS0Project(branching as S0Project).files);
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' }, advance: { allowHold }, input: { keyboardAdvance: keyboard, pointerAdvance: pointer } }) };
  const view = render(<PlayerShell project={project} />);
  if (keyboard) fireEvent.keyDown(window, { key: 'Enter' }); else fireEvent.click(screen.getByRole('button', { name: /开始故事/u }));
  return { project, view, main: () => view.container.querySelector('main')!, left: () => screen.getByRole('button', { name: /Left/u }), right: () => screen.getByRole('button', { name: /Right/u }) };
}
it('navigates the actually focused choice in both directions with wrap, without committing a route', () => {
  const f = setup(), hash = f.main().dataset.runtimeStateHash; expect(f.left()).toHaveFocus();
  fireEvent.keyDown(f.left(), { key: 'ArrowDown' }); expect(f.right()).toHaveFocus();
  fireEvent.keyDown(f.right(), { key: 'ArrowDown' }); expect(f.left()).toHaveFocus();
  fireEvent.keyDown(f.left(), { key: 'ArrowUp' }); expect(f.right()).toHaveFocus();
  expect(f.main()).toHaveAttribute('data-runtime-state-hash', hash);
});
it('allows held arrow navigation independently of the normal-text hold setting', () => {
  const f = setup(false); fireEvent.keyDown(f.left(), { key: 'ArrowDown', repeat: true }); expect(f.right()).toHaveFocus();
});
it.each(['1', '2'])('selects digit %s from the focused choice using keyboard permissions', key => {
  const f = setup(true, true, false); fireEvent.keyDown(f.left(), { key });
  expect(screen.getByText(key === '1' ? 'The quiet route.' : 'The bright route.')).toBeInTheDocument(); expect(f.main()).toHaveAttribute('data-input-source', 'keyboard');
});
it.each(['Enter', ' '])('confirms the selected option with %s, not the previous pointer source', key => {
  const f = setup(true, true, false); f.right().focus(); fireEvent.focus(f.right()); fireEvent.keyDown(f.right(), { key });
  expect(screen.getByText('The bright route.')).toBeInTheDocument(); expect(f.main()).toHaveAttribute('data-input-source', 'keyboard');
});
for (const hold of [true, false]) it.each(['Enter', ' ', '1', '2'])(`prevents native repeated %s from choosing a branch with allowHold=${hold}`, key => {
  const f = setup(hold), hash = f.main().dataset.runtimeStateHash;
  const event = new KeyboardEvent('keydown', { key, repeat: true, bubbles: true, cancelable: true }); fireEvent(f.left(), event);
  expect(event.defaultPrevented).toBe(true); expect(f.main()).toHaveAttribute('data-runtime-state-hash', hash); expect(f.left()).toHaveFocus();
});
it('honors disabled keyboard input even when pointer selection remains enabled', () => {
  const f = setup(true, false), hash = f.main().dataset.runtimeStateHash; fireEvent.keyDown(f.left(), { key: 'Enter' });
  expect(f.main()).toHaveAttribute('data-runtime-state-hash', hash); expect(f.main()).toHaveAttribute('data-input-source', 'keyboard'); expect(f.main()).toHaveAttribute('data-input-accepted', 'false');
  fireEvent.click(f.right()); expect(screen.getByText('The bright route.')).toBeInTheDocument(); expect(f.main()).toHaveAttribute('data-input-source', 'pointer');
});
it('leaves a missing numbered option unchanged', () => {
  const f = setup(), hash = f.main().dataset.runtimeStateHash; fireEvent.keyDown(f.left(), { key: '9' }); expect(f.main()).toHaveAttribute('data-runtime-state-hash', hash);
});
it('does not capture shortcuts from another button or editable content', () => {
  const f = setup(), hash = f.main().dataset.runtimeStateHash;
  fireEvent.keyDown(screen.getByRole('button', { name: '打开阅读菜单' }), { key: '2' });
  const input = document.createElement('input'); document.body.append(input); fireEvent.keyDown(input, { key: '2' }); input.remove();
  fireEvent.keyDown(f.left(), { key: 'Enter', isComposing: true }); fireEvent.keyDown(f.left(), { key: '2', keyCode: 229 }); fireEvent.keyDown(f.left(), { key: '2', ctrlKey: true });
  expect(f.main()).toHaveAttribute('data-runtime-state-hash', hash);
});
it('keeps choice shortcuts behind the menu and the host activity ceiling', () => {
  const f = setup(), hash = f.main().dataset.runtimeStateHash; fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.keyDown(window, { key: '2' });
  expect(f.main()).toHaveAttribute('data-runtime-state-hash', hash); fireEvent.click(screen.getByRole('button', { name: '返回故事' }));
  f.view.rerender(<PlayerShell project={f.project} hostActivity="suspended" />); fireEvent.keyDown(f.left(), { key: '2' }); expect(f.main()).toHaveAttribute('data-runtime-state-hash', hash);
  f.view.rerender(<PlayerShell project={f.project} hostActivity="active" />); fireEvent.keyDown(f.right(), { key: '2' }); expect(screen.getByText('The bright route.')).toBeInTheDocument();
});
it('retains held normal-text advance after an intentional choice', () => {
  const f = setup(); fireEvent.click(f.right()); const hash = f.main().dataset.runtimeStateHash;
  fireEvent.keyDown(screen.getByRole('button', { name: '继续下一句' }), { key: 'Enter', repeat: true }); expect(f.main()).not.toHaveAttribute('data-runtime-state-hash', hash);
});
for (const kind of ['audio', 'image']) it(`keeps a ${kind} error in the scrollable choice surface and retains its recovery actions`, () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const base = loadProject(migrateS0Project(branching as S0Project).files), demo = createPlayerMediaMultichannelDemoV1();
  const direction = demo.project.scripts.media_stage!.statements.find(row => row.id === (kind === 'audio' ? 'media_bgm' : 'media_background'))!;
  const project = { ...base, assets: demo.project.assets, scripts: { ...base.scripts, branch_start: { ...base.scripts.branch_start!, statements: [direction, ...base.scripts.branch_start!.statements] } } };
  const retry = vi.fn(), view = render(<PlayerShell project={project} mediaAssets={demo.mediaAssets} onRetryMedia={retry} />); fireEvent.keyDown(window, { key: 'Enter' });
  const failed = view.container.querySelector(kind === 'audio' ? 'audio' : 'img[data-asset-id]')!; fireEvent.error(failed);
  expect(screen.getByRole('alert').closest('.player-choice-surface')).not.toBeNull(); const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '重试媒体' })); expect(retry).toHaveBeenCalledOnce(); expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  if (kind === 'audio') { fireEvent.error(view.container.querySelector('audio')!); fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash); }
  fireEvent.keyDown(screen.getByRole('button', { name: /Right/u }), { key: '2' }); expect(screen.getByText('The bright route.')).toBeInTheDocument(); expect(view.container.querySelector('.player-choice-surface')).toBeNull();
});

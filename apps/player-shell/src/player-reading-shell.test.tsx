import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
import { WebPlayerHost } from './player-host';
import { DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 } from './player-playback-policy';
import { createPlayerVideoDemoV1 } from './media-demo';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });
function project() {
  const source = loadProject(migrateS0Project(tiny as S0Project).files), script = source.scripts.tiny_start!;
  return { ...source, settings: withProjectSettings(source.settings, { text: { revealMode: 'instant' } }), scripts: { ...source.scripts, tiny_start: { ...script, statements: [
    { id: 'read_a', kind: 'narration' as const, textId: 'read_a_text', text: 'A' },
    { id: 'read_b', kind: 'narration' as const, textId: 'read_b_text', text: 'B' },
    { id: 'read_end', kind: 'end' as const, endingName: 'Done' }
  ] } } };
}
const policy = { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, auto: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto, baseDelayMilliseconds: 10, millisecondsPerReadableUnit: 0 } };
function compact() { vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })); }
function pointer(element: HTMLElement, type: string, options: { x?: number; id?: number; primary?: boolean; button?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, clientX: options.x ?? 20, clientY: 20, button: options.button ?? 0 });
  Object.defineProperties(event, { pointerId: { value: options.id ?? 1 }, pointerType: { value: 'touch' }, isPrimary: { value: options.primary ?? true } });
  fireEvent(element, event);
}
it('pauses the real Auto timer on pagehide and schedules a fresh wait after pageshow without catching up', async () => {
  vi.useFakeTimers(); const view = render(<WebPlayerHost project={project()} playbackPolicy={policy} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent(window, new Event('pagehide'));
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  expect(view.container.querySelector('main')).toHaveAttribute('data-auto-playback', 'suspended');
  fireEvent(window, new Event('pageshow')); expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  await act(async () => { await vi.advanceTimersByTimeAsync(11); });
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('B');
});
it('does not apply a held pointer release to the paragraph that Auto presents meanwhile', async () => {
  vi.useFakeTimers(); const view = render(<PlayerShell project={project()} playbackPolicy={policy} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
  const paragraph = screen.getByRole('button', { name: '继续下一句' });
  fireEvent.pointerDown(paragraph, { clientX: 20, clientY: 20, pointerId: 1, pointerType: 'mouse' });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('B');
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.pointerUp(paragraph, { pointerId: 1 }); fireEvent.click(paragraph, { detail: 1 });
  expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  expect(screen.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'true');
});
it.each(['menu', 'artwork', 'host-return', 'blur', 'pagehide', 'cancel', 'context-menu', 'drag', 'second-finger', 'wrong-pointer', 'right-button'])('discards a press interrupted by %s, but accepts the next intentional tap', async interruption => {
  compact(); const source = project(), view = render(<PlayerShell project={source} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  const paragraph = screen.getByRole('button', { name: '继续下一句' }), hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  pointer(paragraph, 'pointerdown', { button: interruption === 'right-button' ? 2 : 0 });
  if (interruption === 'menu') { fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '返回故事' })); }
  if (interruption === 'artwork') { fireEvent.keyDown(window, { key: 'h' }); fireEvent.keyDown(window, { key: 'h' }); }
  if (interruption === 'host-return') { view.rerender(<PlayerShell project={source} hostActivity="suspended" />); view.rerender(<PlayerShell project={source} hostActivity="active" />); }
  if (interruption === 'blur' || interruption === 'pagehide') fireEvent(window, new Event(interruption));
  if (interruption === 'cancel') pointer(paragraph, 'pointercancel');
  if (interruption === 'context-menu') fireEvent.contextMenu(paragraph);
  if (interruption === 'drag') { pointer(paragraph, 'pointermove', { x: 70 }); pointer(paragraph, 'pointermove'); }
  if (interruption === 'second-finger') pointer(paragraph, 'pointerdown', { id: 2, primary: false });
  pointer(paragraph, 'pointerup', { id: interruption === 'wrong-pointer' ? 2 : 1 }); fireEvent.click(paragraph, { detail: 1 });
  expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  pointer(paragraph, 'pointerdown'); pointer(paragraph, 'pointerup'); fireEvent.click(paragraph, { detail: 1 });
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('B');
});
it('consumes a pointer activation once while leaving keyboard and assistive clicks usable', async () => {
  const view = render(<PlayerShell project={project()} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  const paragraph = screen.getByRole('button', { name: '继续下一句' });
  pointer(paragraph, 'pointerdown'); pointer(paragraph, 'pointerup'); fireEvent.click(paragraph, { detail: 1 });
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(paragraph, { detail: 1 }); expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  fireEvent.click(paragraph, { detail: 0 }); expect(view.container.querySelector('main')).not.toHaveAttribute('data-runtime-state-hash', hash);
});
it('ignores IME confirmation keys, legacy 229 and editable content without advancing or closing the reading menu', async () => {
  const view = render(<PlayerShell project={project()} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.keyDown(window, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(window, { key: ' ', keyCode: 229 });
  expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  const editable = document.createElement('div'); editable.setAttribute('contenteditable', 'true'); document.body.append(editable);
  try { fireEvent.keyDown(editable, { key: 'Enter' }); expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash); }
  finally { editable.remove(); }
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' }));
  fireEvent.keyDown(window, { key: 'Escape', isComposing: true });
  expect(screen.getByRole('dialog', { name: '阅读菜单' })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog', { name: '阅读菜单' })).not.toBeInTheDocument();
});
it('does not accept a pointer advance while the host is suspended and resumes at the same paragraph', async () => {
  const source = project(), view = render(<PlayerShell project={source} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  view.rerender(<PlayerShell project={source} hostActivity="suspended" />);
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  view.rerender(<PlayerShell project={source} hostActivity="active" />);
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('A');
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('B');
});
it('marks the actual speaker for the authored paper-theme contrast rule', async () => {
  const source = loadProject(migrateS0Project(tiny as S0Project).files);
  const view = render(<PlayerShell project={source} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  const speaker = view.container.querySelector('.player-dialogue > strong');
  expect(speaker).toHaveTextContent('Narrator');
  expect(speaker).toHaveClass('player-dialogue__speaker');
});
it('pauses Auto and ignores underlying primary while the mobile reading menu is open', async () => {
  compact(); vi.useFakeTimers(); const view = render(<PlayerShell project={project()} playbackPolicy={policy} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const initial = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' }));
  expect(screen.getByRole('dialog', { name: '阅读菜单' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '自动播放' })); fireEvent.keyDown(window, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(initial);
  fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {}); expect(screen.getByRole('button', { name: '打开阅读菜单' })).toHaveFocus();
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).not.toBe(initial);
});
it('reads the next screen before advancing and never treats a drag as a flip', async () => {
  const view = render(<PlayerShell project={project()} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  const paragraph = screen.getByRole('button', { name: '继续下一句' }), initial = view.container.querySelector('main')!.dataset.runtimeStateHash;
  Object.defineProperties(paragraph, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 300 } });
  fireEvent.scroll(paragraph); fireEvent.click(paragraph); expect(paragraph.scrollTop).toBe(240);
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(initial);
  fireEvent.pointerCancel(paragraph); fireEvent.click(paragraph, { detail: 1 }); expect(paragraph.scrollTop).toBe(240);
  paragraph.scrollTop = 700; fireEvent.scroll(paragraph); fireEvent.click(paragraph);
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).not.toBe(initial);
});
it('waits for below-fold text before starting the actual Auto clock', async () => {
  vi.useFakeTimers(); const view = render(<PlayerShell project={project()} playbackPolicy={policy} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const paragraph = screen.getByRole('button', { name: '继续下一句' }), initial = view.container.querySelector('main')!.dataset.runtimeStateHash;
  Object.defineProperties(paragraph, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 300 } }); fireEvent.scroll(paragraph);
  fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(initial); expect(view.container.querySelector('main')).toHaveAttribute('data-auto-playback', 'waiting-reading');
  paragraph.scrollTop = 700; fireEvent.scroll(paragraph); await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).not.toBe(initial);
});
it('honors reduced motion without an invisible extra reveal wait', async () => {
  compact(); const source = project(), view = render(<PlayerShell project={{ ...source, settings: withProjectSettings(source.settings, { text: { revealMode: 'typewriter' } }) }} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  expect(screen.getByRole('button', { name: '继续下一句' })).toHaveAttribute('data-text-reveal-duration', '0');
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('B');
});
it('defers an awaited video completion while the reading menu is open and completes it on return', async () => {
  compact(); vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const demo = createPlayerVideoDemoV1('data:video/webm;base64,AA=='), view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.ended(view.container.querySelector('video')!);
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  fireEvent.click(screen.getByRole('button', { name: '返回故事' }));
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('After video');
});
it('keeps a queued menu completion frozen if the host suspends before the menu closes', async () => {
  compact(); vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const demo = createPlayerVideoDemoV1('data:video/webm;base64,AA=='), view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.ended(view.container.querySelector('video')!);
  view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="suspended" />);
  fireEvent.click(screen.getByRole('button', { name: '返回故事' }));
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="active" />);
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('After video');
});
it('does not flush a menu completion into the history panel', async () => {
  compact(); vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const demo = createPlayerVideoDemoV1('data:video/webm;base64,AA=='), view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.ended(view.container.querySelector('video')!);
  fireEvent.click(screen.getByRole('button', { name: '打开剧情历史' }));
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  fireEvent.click(within(screen.getByRole('dialog', { name: '剧情历史' })).getByRole('button', { name: '关闭剧情历史' }));
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('After video');
});

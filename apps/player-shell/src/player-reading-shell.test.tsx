import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
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

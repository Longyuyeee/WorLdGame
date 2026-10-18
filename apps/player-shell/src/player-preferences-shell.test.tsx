import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createGalSettingsDocument, withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project, semanticHash, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
import { DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 } from './player-playback-policy';
import { createPlayerMediaMultichannelDemoV1, createPlayerVideoDemoV1 } from './media-demo';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); Reflect.deleteProperty(document, 'fullscreenElement'); Reflect.deleteProperty(document, 'exitFullscreen'); });
function project() {
  const base = loadProject(migrateS0Project(tiny as S0Project).files), script = base.scripts.tiny_start!;
  return { ...base, settings: withProjectSettings(createGalSettingsDocument(), { text: { revealMode: 'instant' } }), scripts: { ...base.scripts, tiny_start: { ...script, statements: [
    { id: 'a', kind: 'narration' as const, textId: 'a_text', text: 'First' }, { id: 'b', kind: 'narration' as const, textId: 'b_text', text: 'Second' }, { id: 'end', kind: 'end' as const, endingName: 'Done' }
  ] } } };
}
const open = () => fireEvent.click(screen.getByRole('button', { name: '打开玩家设置' }));
it('provides title settings and instant personal changes without mutating source or progress', async () => {
  const source = project(), hash = semanticHash(source), view = render(<PlayerShell project={source} />); open();
  const panel = screen.getByRole('dialog', { name: '玩家设置' }); expect(within(panel).getByRole('button', { name: '返回故事' })).toHaveFocus();
  fireEvent.change(within(panel).getByLabelText('个人字号'), { target: { value: '140' } }); fireEvent.click(within(panel).getByLabelText('高对比阅读'));
  expect(view.container.querySelector('main')).toHaveAttribute('data-settings-high-contrast', 'true'); expect(view.container.querySelector('main')!.style.getPropertyValue('--gal-font-scale')).toBe('1.4');
  fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {}); expect(screen.getByRole('button', { name: '打开玩家设置' })).toHaveFocus(); expect(semanticHash(source)).toBe(hash);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('First');
});
it('pauses Auto and ignores background inputs until the settings panel closes', async () => {
  vi.useFakeTimers(); const policy = { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, auto: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto, baseDelayMilliseconds: 10, millisecondsPerReadableUnit: 0 } };
  const view = render(<PlayerShell project={project()} playbackPolicy={policy} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  fireEvent.click(screen.getByRole('button', { name: '自动播放' })); open(); const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); fireEvent.keyDown(window, { key: 'Enter' }); await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash); fireEvent.click(screen.getByRole('button', { name: '返回故事' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(50); }); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).not.toBe(hash);
});
it('applies mute/volume to current tracks without replacing or restarting them', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const demo = createPlayerMediaMultichannelDemoV1(), view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  const track = view.container.querySelector('audio')!; track.currentTime = 7; const volume = track.volume, hash = view.container.querySelector('main')!.dataset.runtimeStateHash; open();
  fireEvent.change(screen.getByLabelText('总音量'), { target: { value: '50' } }); expect(track.volume).toBeCloseTo(volume * .5);
  fireEvent.click(screen.getByLabelText('静音全部声音')); expect(track.muted).toBe(true); expect(track.volume).toBe(0); expect(track.currentTime).toBe(7); expect(view.container.querySelector('audio')).toBe(track);
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
});
it('restores project-scoped preferences and retains them over authored settings updates', () => {
  const source = project(), view = render(<PlayerShell project={source} />); open(); fireEvent.change(screen.getByLabelText('个人字号'), { target: { value: '125' } });
  view.rerender(<PlayerShell project={{ ...source, settings: withProjectSettings(source.settings, { text: { fontScale: 1.2 } }) }} />);
  expect(view.container.querySelector('main')!.style.getPropertyValue('--gal-font-scale')).toBe('1.5');
  view.rerender(<PlayerShell project={{ ...source, manifest: { ...source.manifest, projectId: 'other_project' } }} />);
  expect(view.container.querySelector('main')!.style.getPropertyValue('--gal-font-scale')).toBe('1'); view.unmount();
  const again = render(<PlayerShell project={source} />); expect(again.container.querySelector('main')!.style.getPropertyValue('--gal-font-scale')).toBe('1.25');
});
it('keeps settings usable and reports denied preference persistence', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('denied'); }); const view = render(<PlayerShell project={project()} />); open();
  fireEvent.click(screen.getByLabelText('减少动效')); expect(view.container.querySelector('main')).toHaveAttribute('data-settings-reduce-motion', 'true'); expect(screen.getByText(/浏览器未允许保存偏好/)).toBeInTheDocument();
});
it('keeps the slow reveal option selected and resets only this settings page', () => {
  const view = render(<PlayerShell project={project()} />); open(); fireEvent.change(screen.getByLabelText('逐字速度'), { target: { value: '0.5' } });
  expect(screen.getByLabelText('逐字速度')).toHaveValue('0.5'); expect(view.container.querySelector('main')).toHaveAttribute('data-settings-text-cps', '15');
  fireEvent.click(screen.getByRole('button', { name: '恢复作品默认' })); expect(screen.getByLabelText('逐字速度')).toHaveValue('1');
});
it('defers an awaited video while preferences are open and respects host suspension', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const original = createPlayerVideoDemoV1('data:video/webm;base64,AA=='), demo = { ...original, project: { ...original.project, settings: withProjectSettings(original.project.settings, { text: { revealMode: 'instant' } }) } }, view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); open();
  fireEvent.change(screen.getByLabelText('总音量'), { target: { value: '50' } }); expect(view.container.querySelector('video')!.volume).toBe(.5);
  fireEvent.click(screen.getByLabelText('静音全部声音')); expect(view.container.querySelector('video')!.volume).toBe(0); fireEvent.ended(view.container.querySelector('video')!);
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash; view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="suspended" />); fireEvent.click(screen.getByRole('button', { name: '返回故事' }));
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash); view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="active" />); expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('After video');
});
it('handles unsupported fullscreen without changing progress', () => {
  const view = render(<PlayerShell project={project()} />); open(); fireEvent.click(screen.getByRole('button', { name: '进入游戏全屏' })); expect(screen.getByText(/不支持或未允许游戏全屏/)).toBeInTheDocument(); expect(view.container.querySelector('main')).toHaveAttribute('data-player-status', 'title');
});
it('owns only the player fullscreen and synchronizes rejection, enter and browser exit', async () => {
  const view = render(<PlayerShell project={project()} />), root = view.container.querySelector('main')!; let current: Element | null = null;
  const request = vi.fn(async () => { current = root; document.dispatchEvent(new Event('fullscreenchange')); }), exit = vi.fn(async () => { current = null; document.dispatchEvent(new Event('fullscreenchange')); });
  Object.defineProperty(root, 'requestFullscreen', { configurable: true, value: request }); Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit }); open();
  request.mockRejectedValueOnce(Error('denied')); fireEvent.click(screen.getByRole('button', { name: '进入游戏全屏' })); await act(async () => {}); expect(screen.getByText(/未完成全屏切换/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '进入游戏全屏' })); await act(async () => {}); expect(root).toHaveAttribute('data-player-fullscreen', 'true');
  fireEvent.click(screen.getByRole('button', { name: '退出游戏全屏' })); await act(async () => {}); expect(exit).toHaveBeenCalledTimes(1); expect(root).toHaveAttribute('data-player-fullscreen', 'false');
  fireEvent.click(screen.getByRole('button', { name: '进入游戏全屏' })); await act(async () => {});
  act(() => { current = null; document.dispatchEvent(new Event('fullscreenchange')); }); expect(root).toHaveAttribute('data-player-fullscreen', 'false'); expect(screen.getByText(/已退出全屏/)).toBeInTheDocument();
  current = document.documentElement; fireEvent.click(screen.getByRole('button', { name: '进入游戏全屏' })); expect(request).toHaveBeenCalledTimes(3); expect(screen.getByText(/其他画面正在全屏/)).toBeInTheDocument();
});

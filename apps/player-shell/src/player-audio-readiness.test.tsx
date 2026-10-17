import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import { PlayerShell } from './PlayerShell';

afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });
async function setup() {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => new Promise(() => {})); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const demo = createPlayerMediaMultichannelDemoV1(), props = { project: { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: 'instant' } }) }, mediaAssets: demo.mediaAssets };
  const view = render(<PlayerShell {...props} />); fireEvent.click(screen.getByRole('button', { name: '开始故事' })); await act(async () => {});
  // Flush the existing deferred collection writer before taking an invariant
  // snapshot; its legitimate initial commit is not an audio preference change.
  await act(async () => { window.dispatchEvent(new Event('pagehide')); });
  const main = () => view.container.querySelector('main')!, voice = () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!, music = () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="bgm"]')!;
  return { view, props, main, voice, music };
}
const tick = async (milliseconds: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); };
async function healthyMusic(f: Awaited<ReturnType<typeof setup>>, milliseconds: number) { for (let elapsed = 0; elapsed < milliseconds; elapsed += 1000) { f.music().currentTime += 1; await tick(1000); } }
it('offers an actionable wait for a sound with no canplay/error, stops Auto and preserves the current story', async () => {
  const f = await setup(), before = f.main().dataset.runtimeStateHash; fireEvent.click(screen.getByRole('button', { name: '自动播放' })); await tick(9000);
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument(); expect(f.main()).toHaveAttribute('data-auto-playback', 'stopped'); expect(f.main().dataset.runtimeStateHash).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' })); expect(screen.getAllByText(/声音准备时间较长/).length).toBeGreaterThan(0); expect(screen.getByRole('button', { name: '重试未就绪声音' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: '本次先无声阅读' })).toBeInTheDocument(); expect(f.voice().error ?? null).toBeNull();
});
it('does not show premature or misleading file-error feedback before the active wait', async () => {
  const f = await setup(); await tick(7000); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull(); expect(screen.queryByRole('alert')).toBeNull(); expect(f.voice().dataset.voiceFailed).not.toBe('true');
});
it('retries only the pending voice and releases its old source without restarting healthy music or changing progress/preferences', async () => {
  const f = await setup(), voice = f.voice(), music = f.music(), hash = f.main().dataset.runtimeStateHash, cursor = f.main().dataset.historyCursor, preferences = JSON.stringify(localStorage);
  await healthyMusic(f, 9000); fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' })); fireEvent.click(screen.getByRole('button', { name: '重试未就绪声音' })); await act(async () => {});
  expect(f.voice()).not.toBe(voice); expect(voice).not.toHaveAttribute('src'); expect(f.music()).toBe(music); expect(f.music().currentTime).toBe(9); expect(f.main().dataset.runtimeStateHash).toBe(hash); expect(f.main().dataset.historyCursor).toBe(cursor); expect(JSON.stringify(localStorage)).toBe(preferences); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull(); expect(screen.getByRole('button', { name: '继续下一句' })).toHaveFocus();
  fireEvent.error(voice); expect(screen.queryByRole('alert')).toBeNull();
});
it('allows session-only silent continuation, releases pending sounds and retains volume/preferences', async () => {
  const f = await setup(), old = f.voice(), hash = f.main().dataset.runtimeStateHash, preferences = JSON.stringify(localStorage); await tick(9000);
  fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' })); fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); await act(async () => {});
  expect(f.main()).toHaveAttribute('data-audio-mode', 'silent'); expect(f.view.container.querySelectorAll('audio')).toHaveLength(0); expect(old).not.toHaveAttribute('src'); expect(f.main().dataset.runtimeStateHash).toBe(hash); expect(JSON.stringify(localStorage)).toBe(preferences);
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); expect(f.main().dataset.runtimeStateHash).not.toBe(hash);
});
it('clears the wait when native time finally advances without restarting Auto or completing the voice', async () => {
  const f = await setup(); fireEvent.click(screen.getByRole('button', { name: '自动播放' })); await healthyMusic(f, 9000); const hash = f.main().dataset.runtimeStateHash;
  f.voice().currentTime = .5; fireEvent.timeUpdate(f.voice()); await act(async () => {});
  expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull(); expect(f.main()).toHaveAttribute('data-auto-playback', 'stopped'); expect(f.main().dataset.runtimeStateHash).toBe(hash); expect(f.voice().dataset.voiceCompleted).not.toBe('true'); expect(f.voice().dataset.voiceFailed).not.toBe('true');
});
it('excludes actual suspended-host time and does not offer a retry until a fresh active wait has elapsed', async () => {
  const f = await setup(); await tick(7000); f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); await tick(60000); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull();
  f.view.rerender(<PlayerShell {...f.props} hostActivity="active" />); await tick(7000); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull(); await tick(1000); expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument();
});
it('keeps a genuine permission rejection on its existing gesture recovery path', async () => {
  const f = await setup(); f.voice().play = vi.fn().mockRejectedValue(new DOMException('permission', 'NotAllowedError')); fireEvent.canPlay(f.voice()); await act(async () => {}); await healthyMusic(f, 10000);
  expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull(); expect(screen.getByRole('button', { name: '恢复声音' })).toBeInTheDocument();
});
it('does not relabel native decoding errors as slow preparation or clear unrelated image failures', async () => {
  const f = await setup(); Object.defineProperty(f.voice(), 'error', { value: { code: 4 } }); fireEvent.error(f.voice()); await healthyMusic(f, 10000);
  fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' })); expect(screen.queryByRole('button', { name: '重试未就绪声音' })).toBeNull(); expect(screen.getByRole('button', { name: '重试媒体' })).toBeInTheDocument();
  fireEvent.error(f.view.container.querySelector('img[data-asset-id]')!); fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' })); expect(screen.getByRole('button', { name: '重试媒体' })).toBeInTheDocument();
});
it('retains an existing observation window through menu and gain renders', async () => {
  const f = await setup(), music = f.music(), gain = music.volume; await healthyMusic(f, 7000); fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '打开玩家设置' })); fireEvent.change(screen.getByLabelText('总音量'), { target: { value: '50' } }); fireEvent.click(screen.getByRole('button', { name: '返回故事' }));
  expect(f.music()).toBe(music); expect(music.volume).toBeCloseTo(gain / 2); await healthyMusic(f, 1000); expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument();
});
it('does not mistake a history-owned policy pause for slow main-story audio', async () => {
  const f = await setup(); fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '打开剧情历史' })); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ })); await healthyMusic(f, 12000);
  expect(f.voice().dataset.historyVoiceInterrupted).toBe('true'); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull();
});
it('does not hold manual progress hostage when a previously playing voice stalls', async () => {
  const f = await setup(); Object.defineProperty(f.voice(), 'readyState', { value: 3 }); fireEvent.play(f.voice()); await healthyMusic(f, 9000); const hash = f.main().dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); expect(f.main().dataset.runtimeStateHash).not.toBe(hash);
});
it('reports a pending background track without stopping an otherwise healthy voice or disabling Auto', async () => {
  const f = await setup(); fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
  for (let index = 0; index < 9; index++) { f.voice().currentTime += 1; fireEvent.timeUpdate(f.voice()); await tick(1000); }
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument(); expect(f.main()).toHaveAttribute('data-auto-playback', 'waiting-voice'); expect(screen.getByRole('button', { name: '自动播放' })).not.toBeDisabled();
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import { DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 } from './player-playback-policy';

afterEach(async () => { cleanup(); await Promise.resolve(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
async function setup() {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const demo = createPlayerMediaMultichannelDemoV1();
  const project = { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: 'instant' } }) };
  const playbackPolicy = { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, auto: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto, baseDelayMilliseconds: 40, millisecondsPerReadableUnit: 0, voiceTailMilliseconds: 10 } };
  const props = { project, mediaAssets: demo.mediaAssets, playbackPolicy };
  const view = render(<PlayerShell {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  const voice = () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
  const hash = () => view.container.querySelector('main')!.dataset.runtimeStateHash;
  return { view, voice, hash, props };
}
const auto = () => fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
const tick = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const openProblem = () => fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' }));

it('settles an owned play rejection without a native error event and keeps the remaining reading deadline', async () => {
  const f = await setup(), audio = f.voice(), before = f.hash();
  let reject!: (error: unknown) => void;
  audio.play = vi.fn(() => new Promise<void>((_, failed) => { reject = failed; }));
  fireEvent.canPlay(audio); auto(); await tick(10);
  await act(async () => { reject(new DOMException('unavailable', 'NotSupportedError')); });
  expect(audio.error).toBeFalsy(); expect(audio.dataset.voiceFailed).toBe('true');
  await tick(29); expect(f.hash()).toBe(before);
  await tick(1); expect(f.hash()).not.toBe(before);
});

it('cancels the failed voice clock when retry replaces the owner, waiting for the new actual completion', async () => {
  const f = await setup(), old = f.voice(), before = f.hash();
  fireEvent.play(old); auto(); await tick(10); fireEvent.error(old);
  openProblem();
  fireEvent.click(screen.getByRole('button', { name: '重试媒体' })); await act(async () => {});
  const replacement = f.voice(); expect(replacement).not.toBe(old); fireEvent.play(replacement);
  fireEvent.ended(old); await tick(100); expect(f.hash()).toBe(before);
  fireEvent.ended(replacement); await tick(9); expect(f.hash()).toBe(before);
  await tick(1); expect(f.hash()).not.toBe(before);
});

it('waits for newly restored sound if the reader enabled Auto during session-only silent reading', async () => {
  const f = await setup(), before = f.hash(); fireEvent.error(f.voice());
  openProblem();
  fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); auto(); await tick(10);
  fireEvent.click(screen.getByRole('button', { name: '恢复当前声音' })); fireEvent.play(f.voice());
  await tick(100); expect(f.hash()).toBe(before);
  fireEvent.ended(f.voice()); await tick(10); expect(f.hash()).not.toBe(before);
});

it('keeps permission denial waiting, rather than treating it as a completed or broken voice', async () => {
  const f = await setup(), audio = f.voice(), before = f.hash();
  audio.play = vi.fn().mockRejectedValue(new DOMException('gesture required', 'NotAllowedError'));
  auto(); fireEvent.canPlay(audio); await act(async () => {}); await tick(100);
  expect(f.hash()).toBe(before); expect(audio.dataset.voiceFailed).not.toBe('true');
  expect(screen.getByRole('button', { name: '恢复声音' })).toBeInTheDocument();
});

it('does not apply late rejected playback from a detached voice to the replacement clock', async () => {
  const f = await setup(), old = f.voice(), before = f.hash();
  let reject!: (error: unknown) => void;
  old.play = vi.fn(() => new Promise<void>((_, failed) => { reject = failed; }));
  fireEvent.canPlay(old); auto(); fireEvent.error(old);
  openProblem();
  fireEvent.click(screen.getByRole('button', { name: '重试媒体' })); await act(async () => {});
  fireEvent.play(f.voice()); await act(async () => { reject(new DOMException('old failure', 'NotSupportedError')); });
  await tick(100); expect(f.hash()).toBe(before); expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.ended(f.voice()); await tick(10); expect(f.hash()).not.toBe(before);
});

it('keeps menu and background ceilings over a failed clock and starts a fresh wait on returning', async () => {
  const f = await setup(), before = f.hash(); auto();
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.error(f.voice());
  await tick(100); expect(f.hash()).toBe(before);
  f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />);
  fireEvent.click(screen.getByRole('button', { name: '返回故事' })); await tick(100); expect(f.hash()).toBe(before);
  f.view.rerender(<PlayerShell {...f.props} hostActivity="active" />);
  await tick(39); expect(f.hash()).toBe(before); await tick(1); expect(f.hash()).not.toBe(before);
});

it('retains the healthy voice while music retry returns from the menu with a fresh reading wait', async () => {
  const f = await setup(), before = f.hash(), voice = f.voice(); fireEvent.ended(voice); auto(); await tick(30);
  fireEvent.error(f.view.container.querySelector('audio[data-audio-bus="bgm"]')!);
  openProblem(); await tick(100); expect(f.hash()).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: '重试媒体' })); await act(async () => {});
  expect(f.voice()).toBe(voice); await tick(39); expect(f.hash()).toBe(before); await tick(1); expect(f.hash()).not.toBe(before);
});

it('can stop Auto after a rejected request, without its remaining clock flipping the paragraph', async () => {
  const f = await setup(), audio = f.voice(), before = f.hash();
  audio.play = vi.fn().mockRejectedValue(new DOMException('unavailable', 'NotSupportedError'));
  auto(); fireEvent.canPlay(audio); await act(async () => {}); await tick(10);
  fireEvent.click(screen.getByRole('button', { name: '停止自动阅读' }));
  await tick(100); expect(f.hash()).toBe(before); expect(f.view.container.querySelector('main')).toHaveAttribute('data-auto-playback', 'off');
});

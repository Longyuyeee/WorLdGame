import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useHistoryVoice } from './use-history-voice';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';

const media = createPlayerMediaMultichannelDemoV1().mediaAssets.find(row => row.assetId === 'media_theme')!;
let paused: WeakMap<HTMLMediaElement, boolean>, readiness: WeakMap<HTMLMediaElement, number>;
beforeEach(() => {
  vi.useFakeTimers(); paused = new WeakMap(); readiness = new WeakMap();
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) { return paused.get(this) ?? true; });
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockImplementation(function (this: HTMLMediaElement) { return readiness.get(this) ?? 4; });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) { paused.set(this, true); this.dispatchEvent(new Event('pause')); });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) { paused.set(this, true); this.currentTime = 0; });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    paused.set(this, false); this.dispatchEvent(new Event('play'));
    if (this.readyState < 2) return new Promise<void>(() => {});
    this.dispatchEvent(new Event('playing')); return Promise.resolve();
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function Harness({ active = true, volume = .5, onPlaying = (_value: boolean) => {} }: { active?: boolean; volume?: number; onPlaying?: (value: boolean) => void }) {
  const history = useHistoryVoice({ active, muted: false, volume, onPlaying });
  return <><button onClick={event => history.play({ source: media, volume: .8 }, '过去的一句', event.currentTarget)}>听第一句</button>{history.player}</>;
}
const tick = async (milliseconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
async function setup(ready = 4, onPlaying?: (value: boolean) => void) {
  const view = render(<Harness {...(onPlaying ? { onPlaying } : {})} />), audio = view.container.querySelector('audio')!;
  Object.defineProperty(audio, 'error', { configurable: true, value: null }); readiness.set(audio, ready); fireEvent.click(screen.getByRole('button', { name: '听第一句' })); await act(async () => {}); return { view, audio };
}
it('bounds an unfinished native-style play request even when play already fired and paused is false', async () => {
  const f = await setup(0); expect(f.audio.paused).toBe(false); await tick(5001);
  expect(screen.getByRole('button', { name: '重试重听' })).toBeInTheDocument(); expect(f.audio.paused).toBe(true); expect(f.audio.error).toBeNull();
});
it('offers retry after real playback stops making progress without an error or ended event', async () => {
  const f = await setup(); f.audio.currentTime = .3; fireEvent.timeUpdate(f.audio); await tick(5001);
  expect(screen.getByRole('button', { name: '重试重听' })).toBeInTheDocument(); expect(f.audio.paused).toBe(true); expect(f.audio.error).toBeNull();
});
it('does not confuse healthy continuous progress with an elapsed total playback deadline', async () => {
  const f = await setup();
  for (let index = 1; index <= 6; index++) { await tick(2000); f.audio.currentTime = index * 2; fireEvent.timeUpdate(f.audio); }
  expect(screen.queryByRole('button', { name: '重试重听' })).toBeNull(); expect(screen.getByRole('region', { name: '历史语音重听' })).toHaveTextContent('正在重听'); expect(f.audio.paused).toBe(false);
});
it('keeps intentional pause and host suspension under explicit reader control', async () => {
  const f = await setup(); fireEvent.click(screen.getByRole('button', { name: '暂停重听' })); await tick(12000); expect(screen.getByRole('button', { name: '继续重听' })).toBeInTheDocument();
  f.view.rerender(<Harness active={false} />); expect(screen.getByRole('button', { name: '继续重听' })).toBeDisabled(); f.view.rerender(<Harness />); expect(f.audio.paused).toBe(true);
});
it('does not report audible ownership from an early play event before native readiness', async () => {
  const notify = vi.fn(), f = await setup(0, notify);
  expect(notify).not.toHaveBeenCalledWith(true); expect(screen.getByRole('region', { name: '历史语音重听' })).not.toHaveTextContent('正在重听');
  readiness.set(f.audio, 4); fireEvent.playing(f.audio); expect(notify).toHaveBeenLastCalledWith(true);
  await tick(5001); expect(notify).toHaveBeenLastCalledWith(false); expect(screen.getByRole('button', { name: '重试重听' })).toBeInTheDocument();
});
it('does not extend the wait for repeated readiness and timeupdate events without elapsed media time', async () => {
  const f = await setup();
  for (let i = 0; i < 4; i++) { await tick(1000); fireEvent.waiting(f.audio); fireEvent.playing(f.audio); fireEvent.timeUpdate(f.audio); }
  await tick(1001); expect(screen.getByRole('button', { name: '重试重听' })).toBeInTheDocument();
});
it('recovers from brief buffering only when the same attempt actually advances', async () => {
  const notify = vi.fn(), f = await setup(4, notify); await tick(3000); fireEvent.waiting(f.audio);
  expect(notify).toHaveBeenLastCalledWith(false); expect(screen.getByRole('region', { name: '历史语音重听' })).toHaveTextContent('正在缓冲');
  await tick(1000); f.audio.currentTime = .5; fireEvent.timeUpdate(f.audio); expect(notify).toHaveBeenLastCalledWith(true);
  await tick(4000); expect(screen.queryByRole('button', { name: '重试重听' })).toBeNull(); await tick(1001); expect(screen.getByRole('button', { name: '重试重听' })).toBeInTheDocument();
});
it('observes native time progress even without a timeupdate event', async () => {
  const f = await setup(); await tick(4000); f.audio.currentTime = .4; await tick(1000);
  expect(screen.queryByRole('button', { name: '重试重听' })).toBeNull(); await tick(4501); expect(screen.getByRole('button', { name: '重试重听' })).toBeInTheDocument();
});
it('does not reload or renew a stuck audition when personal gain changes', async () => {
  const f = await setup(0), loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
  await tick(4000); f.view.rerender(<Harness volume={.2} />); expect(f.audio.volume).toBeCloseTo(.16); expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loads);
  await tick(1001); expect(screen.getByRole('button', { name: '重试重听' })).toBeInTheDocument();
});
it('gives an explicit continuation its own deadline without restarting the paused position', async () => {
  const f = await setup(); f.audio.currentTime = .8; fireEvent.timeUpdate(f.audio); fireEvent.click(screen.getByRole('button', { name: '暂停重听' })); await tick(15000);
  fireEvent.click(screen.getByRole('button', { name: '继续重听' })); await act(async () => {}); expect(f.audio.currentTime).toBe(.8); await tick(4000); expect(screen.queryByRole('button', { name: '重试重听' })).toBeNull(); await tick(1001); expect(screen.getByRole('button', { name: '重试重听' })).toBeInTheDocument();
});
it('ignores a retired play promise rejection after retrying the same source', async () => {
  let rejectOld!: (reason: Error) => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) { paused.set(this, false); this.dispatchEvent(new Event('play')); return new Promise<void>((_resolve, reject) => { rejectOld = reject; }); });
  const f = await setup(0); await tick(5001); readiness.set(f.audio, 4); fireEvent.click(screen.getByRole('button', { name: '重试重听' })); await act(async () => {});
  await act(async () => { rejectOld(new Error('old network failure')); }); expect(screen.getByRole('region', { name: '历史语音重听' })).toHaveTextContent('正在重听'); expect(f.audio.paused).toBe(false);
});
it('disposes the observer on stop and rejects a late native play event', async () => {
  const f = await setup(0); fireEvent.click(screen.getByRole('button', { name: '停止重听' })); expect(f.audio.getAttribute('src')).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  paused.set(f.audio, false); fireEvent.play(f.audio); expect(f.audio.paused).toBe(true); await tick(9000); expect(screen.queryByRole('region', { name: '历史语音重听' })).toBeNull();
});
it('releases native playback and every observer when history unmounts', async () => {
  const f = await setup(); f.view.unmount(); expect(vi.getTimerCount()).toBe(0); expect(f.audio.paused).toBe(true); expect(f.audio.getAttribute('src')).toBeNull();
});

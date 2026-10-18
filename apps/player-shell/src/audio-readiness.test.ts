import { afterEach, expect, it, vi } from 'vitest';
import { watchPlayerAudioReadiness, PLAYER_AUDIO_READINESS_WAIT_MS } from './audio-readiness';

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); vi.useRealTimers(); });
function setup(readyState = 0) {
  vi.useFakeTimers(); const audio = document.createElement('audio'); document.body.append(audio); audio.dataset.shouldPlay = 'true'; audio.dataset.playerPlayback = 'resuming';
  Object.defineProperty(audio, 'readyState', { configurable: true, value: readyState });
  const changed = vi.fn(), observer = watchPlayerAudioReadiness(audio, () => audio.isConnected && audio.dataset.shouldPlay === 'true', changed); disposers.push(observer.dispose);
  return { audio, changed, observer };
}
it('reports an unfinished initial load after the bounded active wait without inventing an error or end', () => {
  const f = setup(); vi.advanceTimersByTime(PLAYER_AUDIO_READINESS_WAIT_MS - 1); expect(f.changed).not.toHaveBeenCalled(); vi.advanceTimersByTime(1);
  expect(f.changed).toHaveBeenLastCalledWith('preparing'); expect(f.audio.error ?? null).toBeNull(); expect(f.audio.ended).toBe(false);
});
it('reports stalled ready audio separately and clears the wait only on actual native-time movement', () => {
  const f = setup(3); vi.advanceTimersByTime(8000); expect(f.changed).toHaveBeenLastCalledWith('buffering'); f.audio.currentTime = 1; f.audio.dispatchEvent(new Event('timeupdate')); expect(f.changed).toHaveBeenLastCalledWith(null);
});
it('does not mistake long healthy playback or a loop wrap for a stall', () => {
  const f = setup(4); for (const time of [1, 2, 0, 1, 2, 0, 1, 2, 0, 1]) { f.audio.currentTime = time; vi.advanceTimersByTime(3000); } expect(f.changed).not.toHaveBeenCalled();
});
it('excludes a suspended host interval and begins a fresh active window on return', () => {
  const f = setup(); vi.advanceTimersByTime(7000); f.observer.setActive(false); vi.advanceTimersByTime(60000); expect(f.changed).not.toHaveBeenCalled(); f.observer.setActive(true); vi.advanceTimersByTime(7000); expect(f.changed).not.toHaveBeenCalled(); vi.advanceTimersByTime(1000); expect(f.changed).toHaveBeenLastCalledWith('preparing');
});
it.each(['blocked', 'error', 'ended', 'suspended', 'skipped', 'paused-by-policy', 'interrupted'])('does not relabel intentional or already explained %s transport as waiting', transport => {
  const f = setup(); f.audio.dataset.playerPlayback = transport; vi.advanceTimersByTime(20000); expect(f.changed).not.toHaveBeenCalled();
});
it('ignores a completed native voice and clears a genuine media error through the existing owner', () => {
  const f = setup(); vi.advanceTimersByTime(8000); Object.defineProperty(f.audio, 'error', { value: { code: 4 } }); f.audio.dispatchEvent(new Event('error')); expect(f.changed).toHaveBeenLastCalledWith(null); vi.advanceTimersByTime(9000); expect(f.changed).toHaveBeenCalledTimes(2);
});
it('does not accept a timeupdate event with no native-time progress as successful playback', () => {
  const f = setup(); for (let i = 0; i < 8; i++) { f.audio.dispatchEvent(new Event('timeupdate')); vi.advanceTimersByTime(1000); } expect(f.changed).toHaveBeenLastCalledWith('preparing');
});
it('restarts the observation window when a source is explicitly loaded again', () => {
  const f = setup(); vi.advanceTimersByTime(7000); f.audio.dispatchEvent(new Event('loadstart')); vi.advanceTimersByTime(7000); expect(f.changed).not.toHaveBeenCalled(); vi.advanceTimersByTime(1000); expect(f.changed).toHaveBeenLastCalledWith('preparing');
});
it('releases timers/listeners and never reports a detached or retired owner', () => {
  const f = setup(); f.audio.remove(); vi.advanceTimersByTime(10000); expect(f.changed).not.toHaveBeenCalled(); f.observer.dispose(); f.audio.dispatchEvent(new Event('timeupdate')); vi.advanceTimersByTime(20000); expect(f.changed).not.toHaveBeenCalled();
});

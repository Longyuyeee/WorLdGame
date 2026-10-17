export type PlayerAudioDelay = 'preparing' | 'buffering';
export const PLAYER_AUDIO_READINESS_WAIT_MS = 8000;

/** A lack of progress is a recoverable wait, never proof of codec failure or
 * voice completion. Observe only the live native owner; never dispatch Core. */
export function watchPlayerAudioReadiness(element: HTMLAudioElement, current: () => boolean, changed: (delay: PlayerAudioDelay | null) => void) {
  let active = true, disposed = false, lastTime = element.currentTime, since = performance.now(), delay: PlayerAudioDelay | null = null;
  const report = (next: PlayerAudioDelay | null) => { if (next !== delay) { delay = next; changed(next); } };
  const reset = () => { lastTime = element.currentTime; since = performance.now(); report(null); };
  const inspect = () => {
    if (disposed) return;
    if (!active || !current() || element.ended || element.error || element.dataset.voiceCompleted === 'true' || element.dataset.voiceFailed === 'true'
      || ['blocked', 'error', 'ended', 'suspended', 'skipped', 'paused-by-policy', 'interrupted'].includes(element.dataset.playerPlayback ?? '')) { reset(); return; }
    if (element.currentTime !== lastTime) { reset(); return; }
    if (performance.now() - since >= PLAYER_AUDIO_READINESS_WAIT_MS) report(element.readyState < 2 ? 'preparing' : 'buffering');
  };
  const progress = () => { if (!disposed && element.currentTime !== lastTime) reset(); };
  const loaded = () => { if (!disposed) reset(); };
  const timer = setInterval(inspect, 1000);
  element.addEventListener('timeupdate', progress); element.addEventListener('loadstart', loaded);
  element.addEventListener('ended', inspect); element.addEventListener('error', inspect);
  return {
    setActive(next: boolean) { if (next !== active) { active = next; reset(); } },
    dispose() { disposed = true; clearInterval(timer); element.removeEventListener('timeupdate', progress); element.removeEventListener('loadstart', loaded); element.removeEventListener('ended', inspect); element.removeEventListener('error', inspect); }
  };
}

const voiceFailures = new WeakMap<HTMLAudioElement, Set<() => void>>();

/** The owning audio request can reject without a native media error event. */
export function notifyPlayerAutoVoiceFailure(voice: HTMLAudioElement): void {
  for (const failed of voiceFailures.get(voice) ?? []) failed();
}

/** Reading and voice run concurrently. Metadata duration is never proof of completion. */
export function startPlayerAutoClock(
  voice: HTMLAudioElement | undefined,
  readingMilliseconds: number,
  voiceTailMilliseconds: number,
  advance: () => void
): () => void {
  const readingDeadline = performance.now() + readingMilliseconds;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let settled = false;
  const schedule = (tail: number) => {
    if (disposed || settled) return;
    settled = true;
    timer = setTimeout(() => { if (!disposed) advance(); }, Math.max(0, readingDeadline - performance.now(), tail));
  };
  const ended = () => schedule(voiceTailMilliseconds);
  const failed = () => schedule(0);
  if (voice && voice.dataset.shouldPlay === "true" && !voice.error && voice.dataset.voiceFailed !== "true") {
    if (voice.ended || voice.dataset.voiceCompleted === "true") schedule(voiceTailMilliseconds);
    else {
      voice.addEventListener("ended", ended);
      voice.addEventListener("error", failed);
      const subscribers = voiceFailures.get(voice) ?? new Set();
      subscribers.add(failed); voiceFailures.set(voice, subscribers);
    }
  } else schedule(0);
  return () => {
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    voice?.removeEventListener("ended", ended);
    voice?.removeEventListener("error", failed);
    if (voice) {
      const subscribers = voiceFailures.get(voice);
      subscribers?.delete(failed);
      if (subscribers?.size === 0) voiceFailures.delete(voice);
    }
  };
}

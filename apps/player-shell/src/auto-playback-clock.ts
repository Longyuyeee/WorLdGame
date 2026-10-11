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
    }
  } else schedule(0);
  return () => {
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    voice?.removeEventListener("ended", ended);
    voice?.removeEventListener("error", failed);
  };
}

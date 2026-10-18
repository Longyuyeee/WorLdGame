/** Give visible story changes a rendering opportunity before cloning the full
 * recovery history. The bounded fallback also works when frames are throttled.
 * Hidden documents flush immediately; cancellation never starts a later copy.
 */
export function yieldBeforeRecoveryCopy(signal: AbortSignal): Promise<void> | undefined {
  signal.throwIfAborted();
  if (typeof document === "undefined" || document.visibilityState !== "visible" ||
      typeof requestAnimationFrame !== "function" || typeof cancelAnimationFrame !== "function") return;
  return new Promise((resolve, reject) => {
    let frame: number | undefined, settled = false;
    const finish = (aborted = false) => {
      if (settled) return;
      settled = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      document.removeEventListener("visibilitychange", visibility);
      if (aborted) reject(signal.reason); else resolve();
    };
    const abort = () => finish(true);
    const visibility = () => { if (document.visibilityState !== "visible") finish(); };
    const timer = setTimeout(() => finish(), 100);
    signal.addEventListener("abort", abort, { once: true });
    document.addEventListener("visibilitychange", visibility);
    frame = requestAnimationFrame(() => { if (!settled) frame = requestAnimationFrame(() => finish()); });
    if (signal.aborted) abort();
  });
}

const KEY = "world-studio.preview-audio-muted.v1";

/** Editor-only preference: preview quietly until the author opts in to sound. */
export function readPreviewAudioMuted(): boolean {
  try { return globalThis.localStorage.getItem(KEY) !== "false"; }
  catch { return true; }
}

export function storePreviewAudioMuted(muted: boolean): void {
  try { globalThis.localStorage.setItem(KEY, String(muted)); }
  catch { /* Preview still respects the current in-memory setting. */ }
}

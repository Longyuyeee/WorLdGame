const requests = new WeakMap<HTMLMediaElement, number>();

export function cancelPlayerMediaRequest(element: HTMLMediaElement): void {
  requests.set(element, (requests.get(element) ?? 0) + 1);
}

/** A late permission result must never update a replaced or suspended media owner. */
export function requestPlayerMediaPlayback(element: HTMLMediaElement, isCurrent: () => boolean, changed: () => void, reason: "resuming" | "resuming-after-skip" = "resuming"): void {
  cancelPlayerMediaRequest(element);
  const request = requests.get(element);
  const current = () => requests.get(element) === request && isCurrent();
  const failed = (error: unknown) => {
    if (!current() || (error instanceof DOMException && error.name === "AbortError")) return;
    element.dataset.playerPlayback = "blocked";
    changed();
  };
  element.dataset.playerPlayback = reason;
  try {
    element.play()?.then(() => {
      if (!current()) return;
      element.dataset.playerPlayback = "playing";
      changed();
    }).catch(failed);
  } catch (error) { failed(error); }
}

export const cancelPlayerAudioRequest = cancelPlayerMediaRequest;
export const requestPlayerAudioPlayback = requestPlayerMediaPlayback;

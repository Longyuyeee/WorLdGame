/** React 19 callback-ref cleanup: release this element's animations on DOM detachment.
 * A background document may not tick its animation timeline to discard removed targets.
 * Never cancel the document timeline or another player's live animations.
 */
export function releaseAnimationsOnDetach(element: HTMLElement | null) {
  if (!element) return;
  // Keep finished/fill-mode animations too; getAnimations can omit them by cleanup time.
  const owned = new Set(element.getAnimations?.({ subtree: true }) ?? []);
  return () => {
    for (const animation of element.getAnimations?.({ subtree: true }) ?? []) owned.add(animation);
    queueMicrotask(() => {
      // StrictMode replays refs on still-connected nodes; it must not stop live animation.
      if (!element.isConnected) for (const animation of owned) {
        animation.cancel();
        animation.effect = null;
        animation.timeline = null;
      }
      owned.clear();
    });
  };
}

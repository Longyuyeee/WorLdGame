import { useEffect } from 'react';

/** Warn before browser navigation; never promise asynchronous saving during unload. */
export function usePageLeaveGuard(hasPendingChanges: boolean): void {
  useEffect(() => {
    if (!hasPendingChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by browsers that still use the legacy beforeunload opt-in.
      event.returnValue = '';
    };
    globalThis.addEventListener('beforeunload', warn);
    return () => globalThis.removeEventListener('beforeunload', warn);
  }, [hasPendingChanges]);
}

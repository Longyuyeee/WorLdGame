import { useLayoutEffect, useRef, useState } from 'react';
import type { CanonicalProject } from '@world-studio/project-domain';
import type { PlayerCoreState } from '@world-studio/player-core';
import type { ReadingAnchor } from './reading-position';
import type { useReadingSurface } from './use-reading-surface';

export interface ReplayTextReveal {
  readonly complete: boolean;
  readonly elapsed: number;
  readonly duration: number;
}

/** One in-memory presentation return, owned by the exact replay checkpoint.
 * Never reads/writes a save, or applies to a new project/load/paragraph/locale. */
export function useReplayReadingReturn(reading: ReturnType<typeof useReadingSurface>, state: PlayerCoreState, project: CanonicalProject, captureReveal: () => ReplayTextReveal) {
  const pending = useRef<{ parent: PlayerCoreState; project: CanonicalProject; identity: string; anchor: ReadingAnchor; reveal: ReplayTextReveal; entered: boolean } | null>(null);
  const [restoration, setRestoration] = useState<{ serial: number; reveal: ReplayTextReveal | null }>({ serial: 0, reveal: null });
  useLayoutEffect(() => {
    const request = pending.current;
    if (!request) return;
    if (request.project !== project) { pending.current = null; return; }
    if (state.replaySession !== null) {
      if (state.replaySession.checkpoint === request.parent) request.entered = true;
      else pending.current = null;
      return;
    }
    pending.current = null;
    if (request.entered && state.runtimeState === request.parent.runtimeState && state.historySession === request.parent.historySession && reading.identity === request.identity) {
      reading.restore(request.anchor);
      setRestoration(value => ({ serial: value.serial + 1, reveal: request.reveal }));
    }
  }, [state, project, reading.identity]);
  return {
    revealSerial: restoration.serial,
    restoredReveal: restoration.reveal,
    capture() {
      const anchor = reading.capture();
      pending.current = state.replaySession === null && anchor ? { parent: state, project, identity: reading.identity, anchor, reveal: captureReveal(), entered: false } : null;
    }
  };
}

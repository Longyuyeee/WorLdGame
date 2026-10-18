import { useLayoutEffect, useRef, useState } from 'react';
import type { CanonicalProject } from '@world-studio/project-domain';
import type { PlayerCoreState } from '@world-studio/player-core';
import type { ReadingAnchor } from './reading-position';
import type { useReadingSurface } from './use-reading-surface';

/** One in-memory presentation return, owned by the exact replay checkpoint.
 * Never reads/writes a save, or applies to a new project/load/paragraph/locale. */
export function useReplayReadingReturn(reading: ReturnType<typeof useReadingSurface>, state: PlayerCoreState, project: CanonicalProject, revealed: boolean) {
  const pending = useRef<{ parent: PlayerCoreState; project: CanonicalProject; identity: string; anchor: ReadingAnchor; revealed: boolean; entered: boolean } | null>(null);
  const [revealSerial, setRevealSerial] = useState(0);
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
      if (request.revealed) setRevealSerial(value => value + 1);
    }
  }, [state, project, reading.identity]);
  return {
    revealSerial,
    capture() {
      const anchor = reading.capture();
      pending.current = state.replaySession === null && anchor ? { parent: state, project, identity: reading.identity, anchor, revealed, entered: false } : null;
    }
  };
}

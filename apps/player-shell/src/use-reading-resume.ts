import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PlayerCoreState } from '@world-studio/player-core';
import type { useReadingSurface } from './use-reading-surface';
import { readReadingResume, storeReadingResumeMarks, type ReadingResumeContext, type ReadingResumeMark } from './reading-resume-store';
import { ReadingResumeScope } from './reading-resume-scope';

/** Restore only after the owner has validated an explicit slot/recovery load.
 * Ordinary reading, history navigation, new stories and replay never opt in. */
export function useReadingResume(reading: ReturnType<typeof useReadingSurface>, state: PlayerCoreState, context: ReadingResumeContext | null) {
  const identity = context ? JSON.stringify(context) : '';
  const live = useRef({ reading, context, state }); live.current = { reading, context, state };
  const queued = useRef<readonly ReadingResumeMark[]>([]), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scope = useRef(new ReadingResumeScope());
  const pending = useRef<{ target: PlayerCoreState; buildId: string; savedHash: string } | null>(null);
  const [notice, setNotice] = useState<number | null>(null), [revealSerial, setRevealSerial] = useState(0);
  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current); timer.current = null;
    const marks = queued.current; queued.current = [];
    if (marks.length) { try { storeReadingResumeMarks(globalThis.localStorage, marks); } catch { /* Optional presentation only. */ } }
  }, []);
  const capture = useCallback((includeStart = true) => {
    const current = live.current, anchor = current.reading.capture();
    if (!current.context || !anchor || !includeStart && anchor.kind === 'start') return;
    const sources = scope.current.sources({ paragraph: current.reading.identity, context: current.context, runtime: current.state.runtimeState });
    queued.current = sources.map(source => ({ ...source, anchor }));
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 150);
  }, [flush]);
  useLayoutEffect(() => {
    flush();
    const request = pending.current;
    if (request && request.target === state) {
      pending.current = null;
      const token = context ? scope.current.track({ paragraph: reading.identity, context, runtime: state.runtimeState }, request.savedHash) : (scope.current.clear(), null);
      let anchor = null;
      try { if (context && context.buildId === request.buildId) anchor = readReadingResume(globalThis.localStorage, { ...context, runtimeStateHash: request.savedHash }); } catch { /* A valid story still loads. */ }
      const applied = reading.restore(anchor ?? { kind: 'start' });
      if (applied && context && anchor && anchor.kind !== 'start') { setNotice(token); setRevealSerial(value => value + 1); }
      else setNotice(null);
    } else {
      if (request) { pending.current = null; scope.current.clear(); }
      const token = context ? scope.current.track({ paragraph: reading.identity, context, runtime: state.runtimeState }) : (scope.current.clear(), null);
      if (notice !== token) setNotice(null);
    }
    // Carry a non-start anchor across a same-paragraph hash/Meta change without
    // overwriting an existing mark merely by displaying a fresh paragraph.
    capture(false);
  }, [identity, state, flush, capture]);
  useEffect(() => {
    const away = () => { capture(false); flush(); };
    const visibility = () => { if (document.visibilityState === 'hidden') away(); };
    window.addEventListener('pagehide', away); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('pagehide', away); document.removeEventListener('visibilitychange', visibility); flush(); };
  }, [capture, flush]);
  const prepare = useCallback((target: PlayerCoreState, buildId: string, savedHash: string) => {
    capture(false); flush(); scope.current.clear(); pending.current = { target, buildId, savedHash }; setNotice(null);
  }, [capture, flush]);
  const restartParagraph = useCallback(() => { live.current.reading.restore({ kind: 'start' }); setNotice(null); capture(); flush(); }, [capture, flush]);
  return { capture, prepare, restartParagraph, revealSerial, restored: notice !== null && notice === scope.current.id, dismiss: () => setNotice(null) };
}

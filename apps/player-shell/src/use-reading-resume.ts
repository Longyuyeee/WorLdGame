import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PlayerCoreState } from '@world-studio/player-core';
import type { useReadingSurface } from './use-reading-surface';
import { readReadingResume, storeReadingResume, type ReadingResumeContext, type ReadingResumeMark } from './reading-resume-store';

/** Restore only after the owner has validated an explicit slot/recovery load.
 * Ordinary reading, history navigation, new stories and replay never opt in. */
export function useReadingResume(reading: ReturnType<typeof useReadingSurface>, state: PlayerCoreState, context: ReadingResumeContext | null) {
  const identity = context ? JSON.stringify(context) : '';
  const live = useRef({ reading, context, identity }); live.current = { reading, context, identity };
  const queued = useRef<readonly ReadingResumeMark[]>([]), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedSource = useRef<{ paragraph: string; context: ReadingResumeContext } | null>(null);
  const pending = useRef<{ target: PlayerCoreState; buildId: string; savedHash: string } | null>(null);
  const [notice, setNotice] = useState(''), [revealSerial, setRevealSerial] = useState(0);
  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current); timer.current = null;
    const marks = queued.current; queued.current = [];
    for (const mark of marks) { try { storeReadingResume(globalThis.localStorage, mark); } catch { /* Optional presentation only. */ } }
  }, []);
  const capture = useCallback((includeStart = true) => {
    const current = live.current, anchor = current.reading.capture();
    if (!current.context || !anchor || !includeStart && anchor.kind === 'start') return;
    const original = loadedSource.current;
    const alias = original?.paragraph === current.reading.identity && original.context.projectId === current.context.projectId && original.context.buildId === current.context.buildId && original.context.locale === current.context.locale && original.context.textHash === current.context.textHash && original.context.runtimeStateHash !== current.context.runtimeStateHash ? original.context : null;
    // A validated load may merge newer read knowledge. Keep the original saved
    // hash's UI mark in sync too, including an explicit return to the start.
    queued.current = [...(alias ? [{ ...alias, anchor }] : []), { ...current.context, anchor }];
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 150);
  }, [flush]);
  useLayoutEffect(() => {
    flush();
    const request = pending.current;
    if (request && request.target === state) {
      pending.current = null;
      loadedSource.current = context ? { paragraph: reading.identity, context: { ...context, runtimeStateHash: request.savedHash } } : null;
      let anchor = null;
      try { if (context && context.buildId === request.buildId) anchor = readReadingResume(globalThis.localStorage, { ...context, runtimeStateHash: request.savedHash }); } catch { /* A valid story still loads. */ }
      const applied = reading.restore(anchor ?? { kind: 'start' });
      if (applied && context && anchor && anchor.kind !== 'start') { setNotice(identity); setRevealSerial(value => value + 1); }
      else setNotice('');
    } else if (request) { pending.current = null; loadedSource.current = null; }
    else if (loadedSource.current?.paragraph !== reading.identity) loadedSource.current = null;
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
    capture(false); flush(); loadedSource.current = null; pending.current = { target, buildId, savedHash }; setNotice('');
  }, [capture, flush]);
  const restartParagraph = useCallback(() => { live.current.reading.restore({ kind: 'start' }); setNotice(''); capture(); flush(); }, [capture, flush]);
  return { capture, prepare, restartParagraph, revealSerial, restored: notice !== '' && notice === identity, dismiss: () => setNotice('') };
}

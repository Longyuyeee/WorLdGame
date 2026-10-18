import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listWorldPlayerSaveSummariesV3, type WorldPlayerSaveStoreV3, type WorldPlayerSaveSummaryV3 } from './player-save-store';

export const PLAYER_SAVE_LIST_WAIT_MS = 8000;
type Phase = 'loading' | 'ready' | 'error';
type Owner = { store: WorldPlayerSaveStoreV3 | undefined; projectId: string };
type Snapshot = { owner: Owner; slots: readonly WorldPlayerSaveSummaryV3[]; phase: Phase; timedOut: boolean };
type Request = { owner: Owner; promise: Promise<boolean>; retire(): void };

/** Listing is read-only. Retiring its wait never cancels a submitted write or
 * claims that an underlying storage request stopped. Late results are consumed. */
export function usePlayerSaveList(store: WorldPlayerSaveStoreV3 | undefined, projectId: string) {
  const owner = useMemo(() => ({ store, projectId }), [store, projectId]);
  const current = useRef(owner); current.current = owner;
  const mounted = useRef(false), pending = useRef<Request | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ owner, slots: [], phase: store ? 'loading' : 'ready', timedOut: false });
  const refresh = useCallback((force = false): Promise<boolean> => {
    if (!mounted.current || current.current !== owner) return Promise.resolve(false);
    if (pending.current?.owner === owner && !force) return pending.current.promise;
    pending.current?.retire();
    if (!store) { setSnapshot({ owner, slots: [], phase: 'ready', timedOut: false }); return Promise.resolve(true); }
    setSnapshot(previous => ({ owner, slots: previous.owner === owner ? previous.slots : [], phase: 'loading', timedOut: false }));
    let resolve!: (success: boolean) => void, settled = false;
    const promise = new Promise<boolean>(done => { resolve = done; });
    const request: Request = { owner, promise, retire: () => finish(false) };
    const finish = (success: boolean, slots?: readonly WorldPlayerSaveSummaryV3[], timedOut = false) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (pending.current === request) {
        pending.current = null;
        if (mounted.current && current.current === owner) setSnapshot(previous => ({ owner, slots: slots ?? (previous.owner === owner ? previous.slots : []), phase: success ? 'ready' : 'error', timedOut }));
      }
      resolve(success);
    };
    const timer = setTimeout(() => finish(false, undefined, true), PLAYER_SAVE_LIST_WAIT_MS);
    pending.current = request;
    void Promise.resolve().then(() => settled ? [] : listWorldPlayerSaveSummariesV3(store, projectId)).then(slots => finish(true, slots), () => finish(false));
    return promise;
  }, [owner, store, projectId]);
  useEffect(() => {
    mounted.current = true; void refresh();
    return () => { mounted.current = false; pending.current?.retire(); };
  }, [refresh]);
  const view = snapshot.owner === owner ? snapshot : { owner, slots: [], phase: store ? 'loading' as const : 'ready' as const, timedOut: false };
  return { ...view, refresh };
}

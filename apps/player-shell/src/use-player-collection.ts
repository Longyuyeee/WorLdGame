import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { mergePlayerCoreMetaProgressV1, playerCoreMetaProgressV1, type PlayerCoreState } from '@world-studio/player-core';
import { collectionKey, readPlayerCollection, storePlayerCollection } from './player-collection-store';

export function restorePlayerCollection(state: PlayerCoreState): PlayerCoreState {
  const buildId = state.artifacts?.manifest.buildId;
  if (!buildId) return state;
  try { const progress = readPlayerCollection(globalThis.localStorage, state.projectId, buildId); return progress === null ? state : mergePlayerCoreMetaProgressV1(state, progress); } catch { return state; }
}

export function usePlayerCollection(state: PlayerCoreState, setState: Dispatch<SetStateAction<PlayerCoreState>>) {
  const [error, setError] = useState(false), [attempt, retry] = useState(0);
  const projectId = state.projectId, buildId = state.artifacts?.manifest.buildId, progress = playerCoreMetaProgressV1(state);
  useEffect(() => {
    if (!buildId) return;
    try { readPlayerCollection(globalThis.localStorage, projectId, buildId); setError(false); } catch { setError(true); }
    const receive = (event: StorageEvent) => {
      if (event.key !== collectionKey(projectId, buildId) && event.key !== null) return;
      try { const incoming = readPlayerCollection(globalThis.localStorage, projectId, buildId); if (incoming) setState(current => current.projectId === projectId && current.artifacts?.manifest.buildId === buildId ? mergePlayerCoreMetaProgressV1(current, incoming) : current); setError(false); } catch { setError(true); }
    };
    window.addEventListener('storage', receive); return () => window.removeEventListener('storage', receive);
  }, [projectId, buildId, setState, attempt]);
  useEffect(() => {
    if (!buildId || !progress || state.replaySession !== null) return;
    const commit = () => {
      try {
        const merged = storePlayerCollection(globalThis.localStorage, projectId, buildId, progress); setError(false);
        setState(current => current.projectId === projectId && current.artifacts?.manifest.buildId === buildId ? mergePlayerCoreMetaProgressV1(current, merged) : current);
      } catch { setError(true); }
    };
    const timer = state.status === 'ended' || state.status === 'title' ? (commit(), null) : window.setTimeout(commit, 400);
    window.addEventListener('pagehide', commit);
    return () => { if (timer !== null) clearTimeout(timer); window.removeEventListener('pagehide', commit); };
  }, [projectId, buildId, progress, state.status, state.replaySession, setState, attempt]);
  return { error, retry: () => retry(value => value + 1) };
}

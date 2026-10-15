import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { mergePlayerCoreReplayEntriesV1, type PlayerCoreState } from '@world-studio/player-core';
import { readPlayerReplayArchive, storePlayerReplayArchive } from './player-replay-store';

export function restorePlayerReplayArchive(state: PlayerCoreState): PlayerCoreState {
  try { return mergePlayerCoreReplayEntriesV1(state, readPlayerReplayArchive(localStorage, state)); } catch { return state; }
}
export function usePlayerReplayArchive(state: PlayerCoreState, setState: Dispatch<SetStateAction<PlayerCoreState>>) {
  const [error, setError] = useState(false), [attempt, retry] = useState(0);
  const projectId = state.projectId, buildId = state.artifacts?.manifest.buildId, entries = state.replayEntries;
  useEffect(() => {
    if (!buildId || state.replaySession) return;
    const sameBuild = (current: PlayerCoreState) => current.projectId === projectId && current.artifacts?.manifest.buildId === buildId;
    const commit = () => {
      try {
        const merged = storePlayerReplayArchive(localStorage, state); setError(false);
        setState(current => sameBuild(current) ? mergePlayerCoreReplayEntriesV1(current, merged) : current);
      } catch { setError(true); }
    };
    const receive = (event: StorageEvent) => {
      if (event.key !== null && event.key !== `world-player.replay.v1:${projectId}:${buildId}`) return;
      try {
        const incoming = readPlayerReplayArchive(localStorage, state); setError(false);
        setState(current => sameBuild(current) ? mergePlayerCoreReplayEntriesV1(current, incoming) : current);
      } catch { setError(true); }
    };
    commit();
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, [projectId, buildId, entries, state.replaySession, setState, attempt]);
  return { error, retry: () => retry(value => value + 1) };
}

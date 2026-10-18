import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PLAYER_PREFERENCES, readPlayerPreferences, storePlayerPreferences, type PlayerPreferences } from './player-preferences';

export function usePlayerPreferences(projectId: string, persist = true) {
  const initial = useMemo(() => persist ? readPlayerPreferences(projectId) : DEFAULT_PLAYER_PREFERENCES, [projectId, persist]);
  const [state, setState] = useState({ projectId, value: initial, saved: true });
  useEffect(() => { setState({ projectId, value: initial, saved: true }); }, [projectId, initial]);
  const current = state.projectId === projectId ? state : { projectId, value: initial, saved: true };
  return { preferences: current.value, saved: current.saved,
    update(value: PlayerPreferences) { setState({ projectId, value, saved: persist ? storePlayerPreferences(projectId, value) : true }); }
  };
}

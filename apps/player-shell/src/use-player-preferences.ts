import { useEffect, useMemo, useState } from 'react';
import { readPlayerPreferences, storePlayerPreferences, type PlayerPreferences } from './player-preferences';

export function usePlayerPreferences(projectId: string) {
  const initial = useMemo(() => readPlayerPreferences(projectId), [projectId]);
  const [state, setState] = useState({ projectId, value: initial, saved: true });
  useEffect(() => { setState({ projectId, value: initial, saved: true }); }, [projectId, initial]);
  const current = state.projectId === projectId ? state : { projectId, value: initial, saved: true };
  return { preferences: current.value, saved: current.saved,
    update(value: PlayerPreferences) { setState({ projectId, value, saved: storePlayerPreferences(projectId, value) }); }
  };
}

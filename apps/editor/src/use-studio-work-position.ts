import { useCallback, useEffect, useRef, useState } from 'react';
import { readStudioWorkPosition, studioWorkPositionKey, type StudioWorkPosition } from './studio-work-position';

export function useRememberStudioWorkPosition(position: StudioWorkPosition, enabled: boolean, initialError: string) {
  const latest = useRef({ position, enabled }), blocked = useRef(!!initialError), lastSaved = useRef<string | null>(null);
  latest.current = { position, enabled };
  const [error, setError] = useState(initialError);
  const save = useCallback((explicit = false) => {
    const { position: current, enabled: active } = latest.current;
    if (!active || blocked.current && !explicit) return;
    try {
      const raw = JSON.stringify(current); readStudioWorkPosition(raw, current.referenceId, current.projectId);
      if (raw !== lastSaved.current || explicit) localStorage.setItem(studioWorkPositionKey(current.referenceId), raw);
      blocked.current = false; lastSaved.current = raw; setError('');
    } catch { setError('本次工作位置暂未记住，下次打开可能回到默认页面。可以继续编辑。'); }
  }, []);
  const raw = JSON.stringify(position);
  useEffect(() => { save(); }, [raw, enabled, save]);
  useEffect(() => {
    const flush = () => save(); window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); if (latest.current.enabled && !blocked.current) {
      try { const current = latest.current.position, raw = JSON.stringify(current); if (raw !== lastSaved.current) localStorage.setItem(studioWorkPositionKey(current.referenceId), raw); } catch { /* Existing project data and earlier position remain. */ }
    } };
  }, [save]);
  return { error, retry: () => save(true) };
}

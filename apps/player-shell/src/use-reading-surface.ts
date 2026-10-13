import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasUnreadBelow } from './player-reading';
export function useCompactReadingLayout() {
  return useReadingMediaQuery('(max-width: 640px), (max-height: 480px)');
}
export function useReadingMediaQuery(query: string) {
  const [compact, setCompact] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = globalThis.matchMedia?.(query); if (!media) return;
    const changed = () => setCompact(media.matches); changed();
    media.addEventListener?.('change', changed);
    return () => media.removeEventListener?.('change', changed);
  }, [query]);
  return compact;
}
export function useReadingSurface(identity: string, layoutRevision: unknown) {
  const element = useRef<HTMLButtonElement | null>(null), previous = useRef('');
  const [unread, setUnread] = useState(false);
  const gesture = useRef({ x: 0, y: 0, moved: false });
  const measure = () => setUnread(element.current !== null && hasUnreadBelow(element.current));
  useLayoutEffect(() => {
    const current = element.current;
    if (!current) { setUnread(false); return; }
    if (previous.current !== identity) { current.scrollTop = 0; previous.current = identity; }
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(current);
    if (current.firstElementChild) observer?.observe(current.firstElementChild);
    const text = current.querySelector('.player-dialogue__text'); if (text) observer?.observe(text);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [identity, layoutRevision]);
  return { element, unread, measure, gesture,
    nextPage() {
      const current = element.current;
      if (!current || !hasUnreadBelow(current)) return false;
      current.scrollTop += Math.max(40, current.clientHeight * .8);
      measure(); return true;
    }
  };
}

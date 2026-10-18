import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasUnreadBelow } from './player-reading';
import { ReadingPosition, type ReadingAnchor } from './reading-position';
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
export function useReadingSurface(identity: string, layoutRevision: unknown, inputEnabled = true) {
  const element = useRef<HTMLButtonElement | null>(null), previous = useRef('');
  const position = useRef<ReadingPosition | null>(null);
  const [unread, setUnread] = useState(false);
  const gesture = useRef<{ x: number; y: number; pointerId: number; released: boolean } | null>(null);
  // A press belongs to the paragraph and active surface where it began. A late
  // release must not consume the new paragraph after Auto, a load or host return.
  useLayoutEffect(() => { gesture.current = null; }, [identity, inputEnabled]);
  useEffect(() => {
    const cancel = () => { gesture.current = null; };
    window.addEventListener('blur', cancel); window.addEventListener('pagehide', cancel);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('pagehide', cancel); };
  }, []);
  const updateUnread = () => setUnread(element.current !== null && hasUnreadBelow(element.current));
  const measure = () => { position.current?.scroll(); updateUnread(); };
  useLayoutEffect(() => {
    const current = element.current;
    if (!current) { position.current = null; setUnread(false); return; }
    if (previous.current !== identity || position.current?.element !== current) { position.current = new ReadingPosition(current); previous.current = identity; }
    else position.current.reflow(true);
    updateUnread();
    const reflow = () => { position.current?.reflow(); updateUnread(); };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(reflow) : null;
    observer?.observe(current);
    if (current.firstElementChild) observer?.observe(current.firstElementChild);
    const text = current.querySelector('.player-dialogue__text'); if (text) observer?.observe(text);
    window.addEventListener('resize', reflow);
    return () => { observer?.disconnect(); window.removeEventListener('resize', reflow); };
  }, [identity, layoutRevision]);
  return { element, unread, measure, identity,
    pointerDown(event: { clientX: number; clientY: number; pointerId: number; isPrimary: boolean; button: number }) {
      if (!inputEnabled || event.isPrimary === false || event.button > 0) { gesture.current = null; return; }
      gesture.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, released: false };
    },
    pointerMove(event: { clientX: number; clientY: number; pointerId: number }) {
      const press = gesture.current;
      if (press && event.pointerId === press.pointerId && Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) > 10) gesture.current = null;
    },
    pointerUp(event: { pointerId: number }) {
      const press = gesture.current;
      if (press && event.pointerId === press.pointerId) press.released = true;
    },
    cancelPointer() { gesture.current = null; },
    acceptClick(detail: number) {
      const press = gesture.current; gesture.current = null;
      // Keyboard and assistive activation have no preceding pointer sequence.
      return inputEnabled && (detail === 0 || press?.released === true);
    },
    capture() { return previous.current === identity ? position.current?.snapshot() ?? null : null; },
    restore(anchor: ReadingAnchor) { if (previous.current !== identity || !position.current) return false; const restored = position.current.restore(anchor); updateUnread(); return restored; },
    nextPage() {
      const current = element.current;
      if (!current || !hasUnreadBelow(current)) return false;
      current.scrollTop += Math.max(40, current.clientHeight * .8);
      measure(); return true;
    }
  };
}

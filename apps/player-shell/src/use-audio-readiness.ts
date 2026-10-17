import { useLayoutEffect, useRef, useState } from 'react';
import { watchPlayerAudioReadiness, type PlayerAudioDelay } from './audio-readiness';

/** Keep healthy owners' observation windows across unrelated voice/gain/UI
 * renders. Intentional host/skip/history pauses do not consume wait time. */
export function usePlayerAudioReadiness(elements: ReadonlyMap<string, HTMLAudioElement>, active: boolean) {
  const [delays, setDelays] = useState<ReadonlyMap<HTMLAudioElement, PlayerAudioDelay>>(new Map());
  const observers = useRef(new Map<HTMLAudioElement, ReturnType<typeof watchPlayerAudioReadiness>>());
  useLayoutEffect(() => {
    const live = new Set(elements.values());
    const changed = (element: HTMLAudioElement, delay: PlayerAudioDelay | null) => setDelays(previous => {
      if ((previous.get(element) ?? null) === delay) return previous;
      const next = new Map(previous); if (delay === null) next.delete(element); else next.set(element, delay); return next;
    });
    for (const [element, observer] of observers.current) if (!live.has(element)) { observer.dispose(); observers.current.delete(element); changed(element, null); }
    for (const element of live) {
      let observer = observers.current.get(element);
      if (!observer) {
        observer = watchPlayerAudioReadiness(element, () => element.isConnected && elements.get(element.dataset.audioBus ?? '') === element && element.dataset.shouldPlay === 'true', delay => changed(element, delay));
        observers.current.set(element, observer);
      }
      observer.setActive(active && element.dataset.historyVoiceInterrupted !== 'true');
    }
  });
  useLayoutEffect(() => () => { for (const observer of observers.current.values()) observer.dispose(); observers.current.clear(); }, []);
  return delays;
}

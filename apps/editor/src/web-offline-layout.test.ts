import { expect, it } from 'vitest';
import { addWebOfflineFiles } from './web-offline-export';
it('budgets version and offline controls before protocol guards and after resize/toggle', () => {
  const files: Record<string, Uint8Array> = { 'index.html': new TextEncoder().encode('<html><head></head><body><div id="player-root"></div></body></html>') };
  addWebOfflineFiles(files, '作品');
  const html = new TextDecoder().decode(files['index.html']);
  expect(html).toContain('<body style="--player-viewport-offset:68px"><details');
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const panel = document.getElementById('offline-panel')!, version = document.getElementById('world-publication-version')!;
  let height = 44, resized = () => {}, mutated = () => {};
  panel.getBoundingClientRect = () => ({ height } as DOMRect);
  version.getBoundingClientRect = () => ({ height: 24 } as DOMRect);
  const observed: Element[] = [];
  class Observer { constructor(callback: () => void) { resized = callback; } observe(element: Element) { observed.push(element); } }
  const toggleObserved: unknown[] = [];
  class ToggleObserver { constructor(callback: () => void) { mutated = callback; } observe(element: Element, options: MutationObserverInit) { toggleObserved.push(element, options); } }
  new Function('document', 'window', 'ResizeObserver', 'MutationObserver', 'location', new TextDecoder().decode(files['offline.js']))(document, window, Observer, ToggleObserver, { protocol: 'file:' });
  expect(document.body.style.getPropertyValue('--player-viewport-offset')).toBe('68px');
  expect(observed).toEqual([panel, version]); expect(document.getElementById('offline-action')!.hidden).toBe(true);
  expect(toggleObserved).toEqual([panel, { attributes: true, attributeFilter: ['open'] }]);
  height = 192; mutated(); expect(document.body.style.getPropertyValue('--player-viewport-offset')).toBe('216px');
  panel.dispatchEvent(new Event('toggle'));
  expect(document.body.style.getPropertyValue('--player-viewport-offset')).toBe('216px');
  height = 64; resized(); expect(document.body.style.getPropertyValue('--player-viewport-offset')).toBe('88px');
  height = 44; window.dispatchEvent(new Event('resize')); expect(document.body.style.getPropertyValue('--player-viewport-offset')).toBe('68px');
});

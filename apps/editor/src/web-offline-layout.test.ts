import { expect, it, vi } from 'vitest';
import { addWebOfflineFiles } from './web-offline-export';
function fixture() {
  const files: Record<string, Uint8Array> = { 'index.html': new TextEncoder().encode('<html><head></head><body><div id="player-root"></div></body></html>') };
  addWebOfflineFiles(files, '作品');
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(files['index.html']), 'text/html');
  return { doc, panel: doc.getElementById('offline-panel')!, version: doc.getElementById('world-publication-version')!, script: new TextDecoder().decode(files['offline.js']) };
}

it('uses border-box delivery without forcing startup layout; expansion, wrapping and rotation preserve the viewport budget', () => {
  const { doc, panel, version, script } = fixture();
  let resized: ResizeObserverCallback = () => {};
  const observed: Element[] = [];
  class Observer { constructor(callback: ResizeObserverCallback) { resized = callback; } observe(element: Element) { observed.push(element); } }
  const measure = vi.fn(() => { throw Error('Forced layout'); });
  panel.getBoundingClientRect = measure; version.getBoundingClientRect = measure;
  const writes = vi.spyOn(doc.body.style, 'setProperty');
  new Function('document', 'window', 'ResizeObserver', 'location', script)(doc, { addEventListener: vi.fn() }, Observer, { protocol: 'file:' });
  expect(observed).toEqual([panel, version]);
  expect(doc.body.style.getPropertyValue('--player-viewport-offset')).toBe('68px');
  expect(doc.getElementById('offline-action')!.hidden).toBe(true);
  const resize = (rows: [Element, number][]) => resized(rows.map(([target, blockSize]) => ({ target, borderBoxSize: [{ blockSize }] })) as unknown as ResizeObserverEntry[], {} as ResizeObserver);
  resize([[panel, 44]]); expect(writes).not.toHaveBeenCalled();
  resize([[version, 24]]); expect(writes).not.toHaveBeenCalled();
  resize([[panel, 192.2]]); expect(doc.body.style.getPropertyValue('--player-viewport-offset')).toBe('217px');
  resize([[panel, 192.2]]); expect(writes).toHaveBeenCalledTimes(1);
  resize([[panel, 64], [version, 40]]); expect(doc.body.style.getPropertyValue('--player-viewport-offset')).toBe('104px');
  resize([[panel, 44], [version, 24]]); expect(doc.body.style.getPropertyValue('--player-viewport-offset')).toBe('68px');
  expect(measure).not.toHaveBeenCalled();
});

it('coalesces resize and toggle measurement for hosts without ResizeObserver', () => {
  const { doc, panel, version, script } = fixture();
  let frame: FrameRequestCallback = () => {}, resized = () => {}, mutated = () => {}, height = 44;
  const schedule = vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; });
  panel.getBoundingClientRect = vi.fn(() => ({ height } as DOMRect));
  version.getBoundingClientRect = () => ({ height: 24 } as DOMRect);
  class ToggleObserver { constructor(callback: () => void) { mutated = callback; } observe() {} }
  const host = { requestAnimationFrame: schedule, addEventListener: (type: string, callback: () => void) => { if (type === 'resize') resized = callback; } };
  new Function('document', 'window', 'ResizeObserver', 'MutationObserver', 'location', script)(doc, host, undefined, ToggleObserver, { protocol: 'file:' });
  expect(panel.getBoundingClientRect).not.toHaveBeenCalled();
  height = 192; mutated(); resized(); panel.dispatchEvent(new Event('toggle'));
  expect(schedule).toHaveBeenCalledTimes(1); frame(0);
  expect(doc.body.style.getPropertyValue('--player-viewport-offset')).toBe('216px');
  height = 44; resized(); frame(16);
  expect(doc.body.style.getPropertyValue('--player-viewport-offset')).toBe('68px');
});

import { expect, it, vi } from 'vitest';
import { addWebOfflineFiles } from './web-offline-export';
function fixture() {
  const files: Record<string, Uint8Array> = { 'index.html': new TextEncoder().encode('<html><head></head><body><div id="player-root"></div></body></html>') };
  addWebOfflineFiles(files, '作品', '1.8.0');
  const html = new TextDecoder().decode(files['index.html']);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return { doc, html, script: new TextDecoder().decode(files['offline.js']) };
}

it('keeps publication/offline tools in an initially hidden home, not in the viewport budget', () => {
  const { doc, html } = fixture();
  expect(doc.getElementById('world-publication-home')?.hidden).toBe(true);
  expect(doc.getElementById('world-publication-tools')?.parentElement?.id).toBe('world-publication-home');
  expect(doc.getElementById('world-publication-version')?.textContent).toBe('版本 1.8.0');
  expect(doc.querySelector('#offline-panel summary')?.textContent).toBe('离线与安装 · 尚未下载');
  expect(doc.querySelector('#offline-panel summary #offline-status')).toBeNull();
  expect(doc.getElementById('offline-status')?.textContent).toBe('尚未下载离线内容');
  expect(html).not.toContain('--player-viewport-offset:');
});

it.each([true, false])('does not measure or observe player layout, even without ResizeObserver (%s)', supported => {
  const { doc, script } = fixture();
  const measure = vi.fn(() => { throw Error('Forced layout'); });
  doc.getElementById('offline-panel')!.getBoundingClientRect = measure;
  doc.getElementById('world-publication-version')!.getBoundingClientRect = measure;
  const observer = vi.fn(() => { throw Error('Unnecessary layout observer'); });
  const host = { addEventListener: vi.fn(), requestAnimationFrame: vi.fn() };
  const writes = vi.spyOn(doc.body.style, 'setProperty');
  new Function('document', 'window', 'ResizeObserver', 'location', script)(doc, host, supported ? observer : undefined, { protocol: 'file:' });
  expect(measure).not.toHaveBeenCalled(); expect(observer).not.toHaveBeenCalled();
  expect(host.requestAnimationFrame).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  expect(doc.getElementById('offline-action')!.hidden).toBe(true);
  expect(doc.getElementById('offline-storage-open')!.hidden).toBe(true);
  expect(doc.getElementById('offline-summary')?.textContent).toBe('本地文件');
  expect(doc.getElementById('offline-status')?.textContent).toContain('本地目录可直接试玩');
});

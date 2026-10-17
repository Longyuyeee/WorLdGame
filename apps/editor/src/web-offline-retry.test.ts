import { afterEach, expect, it, vi } from 'vitest';
import { waitFor, fireEvent, screen } from '@testing-library/react';
import { addWebOfflineFiles } from './web-offline-export';

class Worker extends EventTarget {
  state = 'activated';
  ready = true;
  messages: string[] = [];
  postMessage(message: { type: string }, ports: { reply: (value: unknown) => void }[]) { this.messages.push(message.type); queueMicrotask(() => ports[0]!.reply({ ready: this.ready })); }
  change(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class Channel {
  port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close() {} };
  port2 = { reply: (data: unknown) => this.port1.onmessage?.({ data }) };
}
function client() {
  const files: Record<string, Uint8Array> = { 'index.html': new TextEncoder().encode('<html><head></head><body></body></html>') };
  addWebOfflineFiles(files, '更新测试'); document.body.innerHTML = new DOMParser().parseFromString(new TextDecoder().decode(files['index.html']), 'text/html').body.innerHTML;
  document.getElementById('world-publication-home')!.hidden = false;
  document.getElementById('offline-panel')!.setAttribute('open', '');
  const active = new Worker(), registration = Object.assign(new EventTarget(), { active, installing: null as Worker | null, waiting: null as Worker | null, scope: 'http://localhost/' });
  const update = vi.fn(async () => {}); const register = vi.fn(async () => ({ ...registration, update }));
  const navigator = { serviceWorker: { getRegistration: vi.fn(async () => Object.assign(registration, { update })), register } };
  new Function('document', 'window', 'navigator', 'isSecureContext', 'MessageChannel', 'location', new TextDecoder().decode(files['offline.js']))(document, window, navigator, true, Channel, { protocol: 'http:', href: 'http://localhost/' });
  return { active, registration, update, register };
}
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });
it('retries a failed new worker download, not a successful re-download of the old active game', async () => {
  const { active, registration, update } = client(); await screen.findByRole('button', { name: '检查更新' });
  const failed = new Worker(); update.mockImplementationOnce(async () => { registration.installing = failed; registration.dispatchEvent(new Event('updatefound')); });
  fireEvent.click(screen.getByRole('button', { name: '检查更新' })); await waitFor(() => expect(update).toHaveBeenCalledOnce()); failed.change('redundant'); registration.installing = null;
  await screen.findByRole('button', { name: '重试更新' }, { timeout: 1000 }); expect(document.getElementById('offline-status')).toHaveTextContent('原有离线内容保留');
  const next = new Worker(); update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); });
  fireEvent.click(screen.getByRole('button', { name: '重试更新' })); await waitFor(() => expect(update).toHaveBeenCalledTimes(2)); expect(active.messages).not.toContain('CACHE');
  registration.installing = null; registration.waiting = next; next.change('installed'); expect(document.getElementById('offline-status')).toHaveTextContent('新版已下载');
});
it('keeps an update network failure separate from repair of an incomplete old offline cache', async () => {
  const { registration, update } = client(); await screen.findByRole('button', { name: '检查更新' }); update.mockRejectedValueOnce(Error('network offline'));
  fireEvent.click(screen.getByRole('button', { name: '检查更新' })); await screen.findByRole('button', { name: '重试更新' }, { timeout: 1000 }); expect(document.getElementById('offline-status')).toHaveTextContent('原有离线内容保留');
  expect(registration.active.messages).not.toContain('CACHE');
});
it('still repairs the current cache when status actually reports missing offline files', async () => {
  const { active, update } = client(); active.ready = false;
  await screen.findByRole('button', { name: '重试离线下载' }); active.ready = true; fireEvent.click(screen.getByRole('button', { name: '重试离线下载' }));
  await screen.findByRole('button', { name: '检查更新' }); expect(active.messages).toContain('CACHE'); expect(update).not.toHaveBeenCalled(); expect(document.getElementById('offline-status')).toHaveTextContent('文件已缓存'); expect(document.getElementById('offline-status')).toHaveTextContent('声音和存读档');
});

import { afterEach, expect, it, vi } from 'vitest';
import { waitFor, fireEvent, screen } from '@testing-library/react';
import { addWebOfflineFiles } from './web-offline-export';

class Worker extends EventTarget {
  state = 'installing';
  ready = true;
  messages: string[] = [];
  handle?: (message: { type: string; requestId?: string }, reply: (value: unknown) => void) => void;
  postMessage(message: { type: string; requestId?: string }, ports: { reply: (value: unknown) => void }[]) { this.messages.push(message.type); queueMicrotask(() => this.handle ? this.handle(message, ports[0]!.reply) : ports[0]!.reply({ ready: this.ready })); }
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
  const active = new Worker(); active.state = 'activated'; const registration = Object.assign(new EventTarget(), { active, installing: null as Worker | null, waiting: null as Worker | null, scope: 'http://localhost/' });
  const update = vi.fn(async () => {}); const register = vi.fn(async () => ({ ...registration, update }));
  const serviceWorker = Object.assign(new EventTarget(), { getRegistration: vi.fn(async () => Object.assign(registration, { update })), register });
  const navigator = { serviceWorker };
  new Function('document', 'window', 'navigator', 'isSecureContext', 'MessageChannel', 'location', new TextDecoder().decode(files['offline.js']))(document, window, navigator, true, Channel, { protocol: 'http:', href: 'http://localhost/' });
  const progress = (worker: Worker, detail: Record<string, unknown>) => { const event = new MessageEvent('message', { data: { type: 'WORLD_OFFLINE_PROGRESS', requestId: 'install', phase: 'progress', completed: 2, total: 8, path: 'media/rain.png', ...detail } }); Object.defineProperty(event, 'source', { value: worker }); serviceWorker.dispatchEvent(event); };
  return { active, registration, update, register, progress };
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

it('shows file progress only from the current worker and request, without interpreting file names as HTML', async () => {
  const { active, registration, update, progress } = client(); await screen.findByRole('button', { name: '检查更新' });
  const next = new Worker(); update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); });
  fireEvent.click(screen.getByRole('button', { name: '检查更新' })); await screen.findByRole('button', { name: '取消下载' });
  progress(active, { completed: 7 }); progress(next, { requestId: 'stale' }); progress(next, { total: -1 });
  expect(document.getElementById('offline-status')).not.toHaveTextContent('2 / 8');
  progress(next, { path: '<img src=x onerror=alert(1)>' }); expect(document.getElementById('offline-status')).toHaveTextContent('2 / 8');
  expect(document.getElementById('offline-status')!.querySelector('img')).toBeNull();
});

it('cancels an updating worker, ignores its late error/state events and retries the update rather than repairing the old cache', async () => {
  const { active, registration, update, progress } = client(); await screen.findByRole('button', { name: '检查更新' });
  const next = new Worker(); next.handle = (message, reply) => reply({ cancelled: message.type === 'CANCEL', ready: false });
  update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); });
  fireEvent.click(screen.getByRole('button', { name: '检查更新' })); await screen.findByRole('button', { name: '取消下载' });
  screen.getByRole('button', { name: '取消下载' }).focus(); fireEvent.click(screen.getByRole('button', { name: '取消下载' })); await screen.findByRole('button', { name: '重试更新' });
  expect(screen.getByRole('button', { name: '重试更新' })).toHaveFocus();
  next.change('redundant'); progress(next, { phase: 'failed' }); registration.installing = null;
  expect(document.getElementById('offline-summary')).toHaveTextContent('已取消'); expect(document.getElementById('offline-status')).toHaveTextContent('原有离线内容和故事进度保留');
  fireEvent.click(screen.getByRole('button', { name: '重试更新' })); await waitFor(() => expect(update).toHaveBeenCalledTimes(2)); expect(active.messages).not.toContain('CACHE');
});

it('keeps an active-cache repair cancellation separate from its late CACHE response', async () => {
  const { active, progress } = client(); active.ready = false;
  await screen.findByRole('button', { name: '重试离线下载' }); let complete: ((value: unknown) => void) | undefined, id: string | undefined;
  active.handle = (message, reply) => { if (message.type === 'CACHE') { id = message.requestId; complete = reply; } else reply({ ready: false, cancelled: message.type === 'CANCEL' }); };
  fireEvent.click(screen.getByRole('button', { name: '重试离线下载' })); await waitFor(() => expect(complete).toBeDefined());
  progress(active, { requestId: id }); expect(document.getElementById('offline-status')).toHaveTextContent('2 / 8');
  fireEvent.click(screen.getByRole('button', { name: '取消下载' })); await screen.findByRole('button', { name: '重试离线下载' });
  complete!({ ready: false }); progress(active, { requestId: id, phase: 'failed' }); await Promise.resolve();
  expect(document.getElementById('offline-summary')).toHaveTextContent('已取消'); expect(document.getElementById('offline-cancel')).not.toBeVisible();
});

it('does not report repair failure when CACHE settles before the cancellation acknowledgement', async () => {
  const { active } = client(); active.ready = false; await screen.findByRole('button', { name: '重试离线下载' }); let complete: ((value: unknown) => void) | undefined;
  active.handle = (message, reply) => {
    if (message.type === 'CACHE') complete = reply;
    else if (message.type === 'CANCEL') { complete!({ ready: false }); queueMicrotask(() => reply({ cancelled: true, ready: false })); }
    else reply({ ready: false });
  };
  fireEvent.click(screen.getByRole('button', { name: '重试离线下载' })); await waitFor(() => expect(complete).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: '取消下载' })); await screen.findByRole('button', { name: '重试离线下载' });
  expect(document.getElementById('offline-summary')).toHaveTextContent('已取消');
});

it.each(['http', 'integrity'])('names the failed file and keeps the correct update retry (%s)', async reason => {
  const { registration, update, progress } = client(); await screen.findByRole('button', { name: '检查更新' }); const next = new Worker();
  update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); });
  fireEvent.click(screen.getByRole('button', { name: '检查更新' })); await screen.findByRole('button', { name: '取消下载' });
  progress(next, { phase: 'failed', reason, httpStatus: 503 });
  expect(document.getElementById('offline-status')).toHaveTextContent('media/rain.png'); expect(document.getElementById('offline-status')).toHaveTextContent(reason === 'http' ? 'HTTP 503' : '文件与本版清单不一致');
  expect(screen.getByRole('button', { name: '重试更新' })).toBeEnabled();
});

it('retains failure details arriving after redundant, but ignores them after a new download starts', async () => {
  const { registration, update, progress } = client(); await screen.findByRole('button', { name: '检查更新' }); const next = new Worker();
  update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); });
  fireEvent.click(screen.getByRole('button', { name: '检查更新' })); await screen.findByRole('button', { name: '取消下载' }); next.change('redundant'); registration.installing = null;
  progress(next, { phase: 'failed', reason: 'http', httpStatus: 503 }); expect(document.getElementById('offline-status')).toHaveTextContent('HTTP 503');
  const retry = new Worker(); update.mockImplementationOnce(async () => { registration.installing = retry; registration.dispatchEvent(new Event('updatefound')); });
  fireEvent.click(screen.getByRole('button', { name: '重试更新' })); await screen.findByRole('button', { name: '取消下载' });
  progress(next, { phase: 'failed', reason: 'http', httpStatus: 404 }); expect(document.getElementById('offline-status')).not.toHaveTextContent('HTTP 404');
});

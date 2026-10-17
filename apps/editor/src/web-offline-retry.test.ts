import { afterEach, expect, it, vi } from 'vitest';
import { waitFor, fireEvent, screen } from '@testing-library/react';
import { addWebOfflineFiles } from './web-offline-export';

class Worker extends EventTarget {
  state = 'installing';
  ready = true;
  messages: string[] = [];
  handle?: (message: { type: string; requestId?: string; releaseId?: string; confirmed?: boolean }, reply: (value: unknown) => void) => void;
  postMessage(message: { type: string; requestId?: string; releaseId?: string; confirmed?: boolean }, ports: { reply: (value: unknown) => void }[]) { this.messages.push(message.type); queueMicrotask(() => this.handle ? this.handle(message, ports[0]!.reply) : ports[0]!.reply({ ready: this.ready })); }
  change(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class Channel {
  port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close() {} };
  port2 = { reply: (data: unknown) => this.port1.onmessage?.({ data }) };
}
function client(href = 'http://localhost/') {
  const files: Record<string, Uint8Array> = { 'index.html': new TextEncoder().encode('<html><head></head><body></body></html>') };
  addWebOfflineFiles(files, '更新测试'); document.body.innerHTML = new DOMParser().parseFromString(new TextDecoder().decode(files['index.html']), 'text/html').body.innerHTML;
  document.getElementById('world-publication-home')!.hidden = false;
  document.getElementById('offline-panel')!.setAttribute('open', '');
  const active = new Worker(); active.state = 'activated'; const registration = Object.assign(new EventTarget(), { active, installing: null as Worker | null, waiting: null as Worker | null, scope: 'http://localhost/' });
  const update = vi.fn(async () => {}); const register = vi.fn(async () => ({ ...registration, update }));
  const serviceWorker = Object.assign(new EventTarget(), { getRegistration: vi.fn(async () => Object.assign(registration, { update })), register });
  const navigator = { serviceWorker };
  new Function('document', 'window', 'navigator', 'isSecureContext', 'MessageChannel', 'location', new TextDecoder().decode(files['offline.js']))(document, window, navigator, true, Channel, { protocol: 'http:', href, pathname: new URL(href).pathname });
  const progress = (worker: Worker, detail: Record<string, unknown>) => { const event = new MessageEvent('message', { data: { type: 'WORLD_OFFLINE_PROGRESS', requestId: 'install', phase: 'progress', completed: 2, total: 8, path: 'media/rain.png', ...detail } }); Object.defineProperty(event, 'source', { value: worker }); serviceWorker.dispatchEvent(event); };
  return { active, registration, update, register, progress, serviceWorker };
}
function clickUpdate(name = '检查更新') {
  fireEvent.click(screen.getByRole('button', { name }));
  const ack = document.getElementById('offline-update-ack') as HTMLInputElement;
  if (!ack.checked) fireEvent.click(ack);
  fireEvent.click(document.getElementById('offline-update-confirm')!);
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });
it('retries a failed new worker download, not a successful re-download of the old active game', async () => {
  const { active, registration, update } = client(); await screen.findByRole('button', { name: '检查更新' });
  const failed = new Worker(); update.mockImplementationOnce(async () => { registration.installing = failed; registration.dispatchEvent(new Event('updatefound')); });
  clickUpdate(); await waitFor(() => expect(update).toHaveBeenCalledOnce()); failed.change('redundant'); registration.installing = null;
  await screen.findByRole('button', { name: '重试更新' }, { timeout: 1000 }); expect(document.getElementById('offline-status')).toHaveTextContent('原有离线内容保留');
  const next = new Worker(); update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); });
  clickUpdate('重试更新'); await waitFor(() => expect(update).toHaveBeenCalledTimes(2)); expect(active.messages).not.toContain('CACHE');
  registration.installing = null; registration.waiting = next; next.change('installed'); expect(document.getElementById('offline-status')).toHaveTextContent('新版已下载');
});
it('keeps an update network failure separate from repair of an incomplete old offline cache', async () => {
  const { registration, update } = client(); await screen.findByRole('button', { name: '检查更新' }); update.mockRejectedValueOnce(Error('network offline'));
  clickUpdate(); await screen.findByRole('button', { name: '重试更新' }, { timeout: 1000 }); expect(document.getElementById('offline-status')).toHaveTextContent('原有离线内容保留');
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
  clickUpdate(); await screen.findByRole('button', { name: '取消下载' });
  progress(active, { completed: 7 }); progress(next, { requestId: 'stale' }); progress(next, { total: -1 });
  expect(document.getElementById('offline-status')).not.toHaveTextContent('2 / 8');
  progress(next, { path: '<img src=x onerror=alert(1)>' }); expect(document.getElementById('offline-status')).toHaveTextContent('2 / 8');
  expect(document.getElementById('offline-status')!.querySelector('img')).toBeNull();
});

it('cancels an updating worker, ignores its late error/state events and retries the update rather than repairing the old cache', async () => {
  const { active, registration, update, progress } = client(); await screen.findByRole('button', { name: '检查更新' });
  const next = new Worker(); next.handle = (message, reply) => reply({ cancelled: message.type === 'CANCEL', ready: false });
  update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); });
  clickUpdate(); await screen.findByRole('button', { name: '取消下载' });
  screen.getByRole('button', { name: '取消下载' }).focus(); fireEvent.click(screen.getByRole('button', { name: '取消下载' })); await screen.findByRole('button', { name: '重试更新' });
  expect(screen.getByRole('button', { name: '重试更新' })).toHaveFocus();
  next.change('redundant'); progress(next, { phase: 'failed' }); registration.installing = null;
  expect(document.getElementById('offline-summary')).toHaveTextContent('已取消'); expect(document.getElementById('offline-status')).toHaveTextContent('原有离线内容和故事进度保留');
  clickUpdate('重试更新'); await waitFor(() => expect(update).toHaveBeenCalledTimes(2)); expect(active.messages).not.toContain('CACHE');
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
  clickUpdate(); await screen.findByRole('button', { name: '取消下载' });
  progress(next, { phase: 'failed', reason, httpStatus: 503 });
  expect(document.getElementById('offline-status')).toHaveTextContent('media/rain.png'); expect(document.getElementById('offline-status')).toHaveTextContent(reason === 'http' ? 'HTTP 503' : '文件与本版清单不一致');
  expect(screen.getByRole('button', { name: '重试更新' })).toBeEnabled();
});

it('retains failure details arriving after redundant, but ignores them after a new download starts', async () => {
  const { registration, update, progress } = client(); await screen.findByRole('button', { name: '检查更新' }); const next = new Worker();
  update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); });
  clickUpdate(); await screen.findByRole('button', { name: '取消下载' }); next.change('redundant'); registration.installing = null;
  progress(next, { phase: 'failed', reason: 'http', httpStatus: 503 }); expect(document.getElementById('offline-status')).toHaveTextContent('HTTP 503');
  const retry = new Worker(); update.mockImplementationOnce(async () => { registration.installing = retry; registration.dispatchEvent(new Event('updatefound')); });
  clickUpdate('重试更新'); await screen.findByRole('button', { name: '取消下载' });
  progress(next, { phase: 'failed', reason: 'http', httpStatus: 404 }); expect(document.getElementById('offline-status')).not.toHaveTextContent('HTTP 404');
});

it('requires explicit preparation before checking, keeps a private-query-free current entry and supports deferring', async () => {
  const { update } = client('http://localhost/?token=private#place'); await screen.findByRole('button', { name: '检查更新' });
  fireEvent.click(screen.getByRole('button', { name: '检查更新' })); expect(update).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: '确认检查并下载' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '显示本版入口' })); const url = new URL((screen.getByLabelText('本版浏览器内入口') as HTMLInputElement).value);
  expect([...url.searchParams.keys()]).toEqual(['world-release']); expect(url.hash).toBe('');
  fireEvent.click(screen.getByRole('button', { name: '稍后，继续本版' })); expect(document.getElementById('offline-update-plan')).not.toBeVisible(); expect(update).not.toHaveBeenCalled();
  clickUpdate(); await waitFor(() => expect(update).toHaveBeenCalledOnce()); await waitFor(() => expect(document.getElementById('offline-summary')).toHaveTextContent('暂无新版'));
});

it('requires acknowledgement again for the actual waiting release, activates only on demand and opens the new version separately', async () => {
  const { active, registration, update } = client(); await screen.findByRole('button', { name: '检查更新' }); const next = new Worker(), info = { releaseId: 'sha256:' + 'b'.repeat(64), publicationVersion: '1.9.0' };
  next.handle = (message, reply) => { if (message.type === 'ACTIVATE') { registration.waiting = null; registration.active = next; next.state = 'activated'; reply({ activated: true }); next.dispatchEvent(new Event('statechange')); } else reply(message.type === 'INFO' ? info : { ready: true, retained: true, latest: info }); };
  update.mockImplementationOnce(async () => { registration.installing = next; registration.dispatchEvent(new Event('updatefound')); }); clickUpdate(); await screen.findByRole('button', { name: '取消下载' }); registration.installing = null; registration.waiting = next; next.change('installed');
  await waitFor(() => expect(document.getElementById('offline-version-note')).toHaveTextContent('1.9.0')); expect((document.getElementById('offline-update-ack') as HTMLInputElement).checked).toBe(false); expect(next.messages).not.toContain('ACTIVATE');
  fireEvent.click(document.getElementById('offline-update-ack')!); fireEvent.click(screen.getByRole('button', { name: '启用已下载新版（本版仍保留）' }));
  const link = await screen.findByRole('link', { name: '在新窗口打开新版' }); expect(link).toHaveAttribute('target', '_blank'); expect(new URL(link.getAttribute('href')!).searchParams.get('world-release')).toBe(info.releaseId); expect(active.messages).not.toContain('ACTIVATE');
});

it.each([true, false])('ignores an old active worker STATUS after controller replacement (old replies first: %s)', async oldFirst => {
  const { active, registration, serviceWorker } = client(); let oldReply: ((value: unknown) => void) | undefined, newReply: ((value: unknown) => void) | undefined;
  active.handle = (_message, reply) => { oldReply = reply; }; await waitFor(() => expect(oldReply).toBeDefined());
  const next = new Worker(); next.state = 'activated'; next.handle = (_message, reply) => { newReply = reply; }; registration.active = next; serviceWorker.dispatchEvent(new Event('controllerchange'));
  await waitFor(() => expect(newReply).toBeDefined());
  const oldInfo = { ready: true, latest: { releaseId: 'sha256:' + 'a'.repeat(64), publicationVersion: '1.8.0' } }, nextInfo = { ready: true, retained: true, latest: { releaseId: 'sha256:' + 'b'.repeat(64), publicationVersion: '1.9.0' } };
  if (oldFirst) { oldReply!(oldInfo); newReply!(nextInfo); } else { newReply!(nextInfo); oldReply!(oldInfo); }
  await screen.findByRole('button', { name: '查看版本与备份' }); expect(document.getElementById('offline-status')).toHaveTextContent('本机另有新版'); expect(document.getElementById('offline-version-note')).toHaveTextContent('1.9.0');
});

const oldRelease = 'sha256:' + 'c'.repeat(64);
const storageResult = (reason: string | null = null) => ({ schemaVersion: 1, byteLength: 4194304, releases: [{ releaseId: oldRelease, publicationVersion: '1.8.0', fileCount: 34, complete: true, byteLength: 4194304, reason }] });

it('shows only reported game payload size and requires a fresh destructive acknowledgement, with cancel focus restored', async () => {
  const { active } = client(); await screen.findByRole('button', { name: '检查更新' }); active.handle = (message, reply) => reply(message.type === 'STORAGE' ? storageResult() : { ready: true });
  fireEvent.click(screen.getByRole('button', { name: '查看缓存与空间' })); await screen.findByText(/本游戏 1 份缓存/u); expect(document.getElementById('offline-storage-status')).toHaveTextContent('4.0 MiB'); expect(document.getElementById('offline-storage')).toHaveTextContent('不含存档');
  fireEvent.click(screen.getByRole('button', { name: '清理这个版本' })); expect(screen.getByRole('button', { name: '确认清理所选版本' })).toBeDisabled(); expect(active.messages).not.toContain('DELETE_RELEASE');
  fireEvent.click(screen.getByRole('checkbox', { name: '我已保留需要的原版游戏与进度备份' })); fireEvent.click(screen.getByRole('button', { name: '取消清理' })); expect(screen.getByRole('button', { name: '清理这个版本' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '清理这个版本' })); expect(screen.getByRole('button', { name: '确认清理所选版本' })).toBeDisabled(); expect(active.messages).not.toContain('DELETE_RELEASE');
});

it('handles a newly protected release at confirmation, refreshes it and never claims deletion', async () => {
  const { active } = client(); await screen.findByRole('button', { name: '检查更新' }); let used = false;
  active.handle = (message, reply) => { if (message.type === 'DELETE_RELEASE') { expect(message).toMatchObject({ releaseId: oldRelease, confirmed: true }); used = true; reply({ deleted: false, reason: 'used' }); } else reply(message.type === 'STORAGE' ? storageResult(used ? 'used' : null) : { ready: true }); };
  fireEvent.click(screen.getByRole('button', { name: '查看缓存与空间' })); await screen.findByRole('button', { name: '清理这个版本' }); fireEvent.click(screen.getByRole('button', { name: '清理这个版本' })); fireEvent.click(screen.getByRole('checkbox', { name: '我已保留需要的原版游戏与进度备份' })); fireEvent.click(screen.getByRole('button', { name: '确认清理所选版本' }));
  await waitFor(() => expect(document.getElementById('offline-storage-status')).toHaveTextContent('其他游戏窗口正在使用')); expect(screen.getByRole('button', { name: '清理这个版本' })).toBeDisabled(); expect(screen.getByRole('button', { name: '刷新缓存列表' })).toHaveFocus(); expect(document.getElementById('offline-storage-status')).not.toHaveTextContent('已移除');
});

it('does not submit duplicate cleanup while waiting and refreshes only after a confirmed deletion', async () => {
  const { active } = client(); await screen.findByRole('button', { name: '检查更新' }); let finish: ((value: unknown) => void) | undefined, deleted = false;
  active.handle = (message, reply) => { if (message.type === 'DELETE_RELEASE') finish = value => { deleted = true; reply(value); }; else reply(message.type === 'STORAGE' ? deleted ? { schemaVersion: 1, byteLength: 0, releases: [] } : storageResult() : { ready: true }); };
  fireEvent.click(screen.getByRole('button', { name: '查看缓存与空间' })); await screen.findByRole('button', { name: '清理这个版本' }); fireEvent.click(screen.getByRole('button', { name: '清理这个版本' })); fireEvent.click(screen.getByRole('checkbox', { name: '我已保留需要的原版游戏与进度备份' })); fireEvent.click(screen.getByRole('button', { name: '确认清理所选版本' })); await waitFor(() => expect(finish).toBeDefined()); fireEvent.click(screen.getByRole('button', { name: '确认清理所选版本' })); expect(active.messages.filter(type => type === 'DELETE_RELEASE')).toHaveLength(1);
  expect(screen.getByRole('button', { name: '取消清理' })).toBeDisabled(); expect(screen.getByRole('button', { name: '刷新缓存列表' })).toBeDisabled();
  finish!({ deleted: true }); await waitFor(() => expect(document.getElementById('offline-storage-status')).toHaveTextContent('存档未删除')); expect(screen.queryByRole('button', { name: '清理这个版本' })).toBeNull();
});

it('refuses unavailable list responses and does not render an old worker list after replacement', async () => {
  const { active, registration } = client(); await screen.findByRole('button', { name: '检查更新' }); fireEvent.click(screen.getByRole('button', { name: '查看缓存与空间' })); await screen.findByText(/暂时无法读取缓存列表/u); expect(screen.queryByRole('button', { name: '清理这个版本' })).toBeNull();
  let reply: ((value: unknown) => void) | undefined; active.handle = (_message, response) => { reply = response; }; fireEvent.click(screen.getByRole('button', { name: '刷新缓存列表' })); await waitFor(() => expect(reply).toBeDefined()); registration.active = new Worker(); reply!(storageResult()); await screen.findByText('离线组件已切换，请刷新缓存列表。'); expect(screen.queryByRole('button', { name: '清理这个版本' })).toBeNull();
});

it('preserves the confirmed cleanup outcome if refreshing the list subsequently fails', async () => {
  const { active } = client(); await screen.findByRole('button', { name: '检查更新' }); let deleted = false;
  active.handle = (message, reply) => { if (message.type === 'DELETE_RELEASE') { deleted = true; reply({ deleted: true }); } else reply(message.type === 'STORAGE' && !deleted ? storageResult() : { ready: true }); };
  fireEvent.click(screen.getByRole('button', { name: '查看缓存与空间' })); await screen.findByRole('button', { name: '清理这个版本' }); fireEvent.click(screen.getByRole('button', { name: '清理这个版本' })); fireEvent.click(screen.getByRole('checkbox', { name: '我已保留需要的原版游戏与进度备份' })); fireEvent.click(screen.getByRole('button', { name: '确认清理所选版本' }));
  await waitFor(() => expect(document.getElementById('offline-storage-status')).toHaveTextContent('暂时无法刷新')); expect(document.getElementById('offline-storage-status')).toHaveTextContent('所选版本缓存已移除'); expect(document.getElementById('offline-storage-status')).not.toHaveTextContent('未执行清理');
});

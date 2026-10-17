// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { addWebOfflineFiles } from './web-offline-export';

function fixture() {
  const scope = 'https://example.test/game/', files: Record<string, Uint8Array> = { 'index.html': new TextEncoder().encode('<html><head></head><body></body></html>'), 'player.js': new TextEncoder().encode('original game') };
  addWebOfflineFiles(files, '下载测试');
  const buckets = new Map<string, Map<string, Response>>(), oldKey = 'world-offline:' + encodeURIComponent(scope) + ':previous';
  buckets.set(oldKey, new Map([[scope + 'index.html', new Response('original cached game')]]));
  const notices: Record<string, unknown>[] = [], foreign = vi.fn(), fetches: string[] = [];
  let hook: ((name: string, signal: AbortSignal) => Promise<Response | void>) | undefined;
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const caches = { open: async (name: string) => {
    if (!buckets.has(name)) buckets.set(name, new Map()); const bucket = buckets.get(name)!;
    return { match: async (url: string) => bucket.get(url)?.clone(), put: async (url: string, response: Response) => { bucket.set(url, response.clone()); } };
  }, delete: async (name: string) => buckets.delete(name), keys: async () => [...buckets.keys()] };
  const fetch = async (url: string, options: { signal: AbortSignal }) => {
    const name = url.slice(scope.length); fetches.push(name); const override = await hook?.(name, options.signal);
    return override ?? new Response(files[name] as BodyInit);
  };
  const self = { registration: { scope }, clients: { claim: vi.fn(), matchAll: async () => [{ url: scope, postMessage: (value: Record<string, unknown>) => notices.push(value) }, { url: 'https://example.test/other/', postMessage: foreign }] }, addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => handlers.set(name, handler) };
  new Function('self', 'caches', 'fetch', 'crypto', 'AbortController', 'DOMException', new TextDecoder().decode(files['sw.js']))(self, caches, fetch, webcrypto, AbortController, DOMException);
  function dispatch(name: string, data?: Record<string, unknown>) {
    let promise: Promise<unknown> | undefined; const postMessage = vi.fn();
    handlers.get(name)!({ data, ports: [{ postMessage }], waitUntil: (value: Promise<unknown>) => { promise = value; } });
    return { promise: promise!, reply: postMessage };
  }
  function pause(name: string) {
    hook = async (file, signal) => { if (file !== name) return; await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })); };
  }
  return { files, scope, buckets, oldKey, notices, foreign, fetches, dispatch, pause, setHook: (value: typeof hook) => { hook = value; } };
}

it('reports bounded file progress in this scope and caches only exact inventory bytes', async () => {
  const f = fixture(); await f.dispatch('install').promise;
  const total = f.notices.at(-1)!.total as number;
  expect(f.notices.at(-1)).toMatchObject({ completed: total, requestId: 'install', phase: 'progress', path: '' });
  expect(f.notices.every(n => (n.completed as number) >= 0 && (n.completed as number) <= total)).toBe(true); expect(f.foreign).not.toHaveBeenCalled();
  const status = f.dispatch('message', { type: 'STATUS' }); await status.promise; expect(status.reply).toHaveBeenCalledWith(expect.objectContaining({ ready: true }));
  expect(f.buckets.has(f.oldKey)).toBe(true); // Only normal activation can remove the old version.
});

it('cancels an installing download, deletes only its incomplete cache and does not write the blocked file', async () => {
  const f = fixture(); f.pause('player.js'); const install = f.dispatch('install').promise; const rejected = expect(install).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(f.fetches).toContain('player.js'));
  const cancel = f.dispatch('message', { type: 'CANCEL', requestId: 'install' }); await cancel.promise; await rejected;
  expect(cancel.reply).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true, ready: false })); expect([...f.buckets.keys()]).toEqual([f.oldKey]);
  expect(await f.buckets.get(f.oldKey)!.get(f.scope + 'index.html')!.text()).toBe('original cached game');
  expect(f.notices.at(-1)).toMatchObject({ phase: 'cancelled', path: 'player.js' });
});

it.each(['http', 'integrity'])('reports the exact failed file without promoting the incomplete new cache (%s)', async reason => {
  const f = fixture(); f.setHook(async name => name === 'player.js' ? new Response('not this file', { status: reason === 'http' ? 503 : 200 }) : undefined);
  await expect(f.dispatch('install').promise).rejects.toThrow(); expect(f.notices.at(-1)).toMatchObject({ phase: 'failed', path: 'player.js', reason, ...(reason === 'http' ? { httpStatus: 503 } : {}) });
  expect([...f.buckets.keys()]).toEqual([f.oldKey]);
});

it('repairs only missing files; cancellation preserves good cached files and rejects a concurrent repair token', async () => {
  const f = fixture(); await f.dispatch('install').promise;
  const key = [...f.buckets.keys()].find(k => k !== f.oldKey)!, bucket = f.buckets.get(key)!, good = bucket.get(f.scope + 'index.html')!;
  bucket.delete(f.scope + 'player.js'); f.fetches.length = 0; f.pause('player.js');
  const repair = f.dispatch('message', { type: 'CACHE', requestId: 'repair-one' }); await vi.waitFor(() => expect(f.fetches).toEqual(['player.js']));
  const other = f.dispatch('message', { type: 'CACHE', requestId: 'repair-two' }); await other.promise; expect(other.reply).toHaveBeenCalledWith(expect.objectContaining({ busy: true }));
  const wrong = f.dispatch('message', { type: 'CANCEL', requestId: 'repair-two' }); await wrong.promise; expect(wrong.reply).toHaveBeenCalledWith(expect.objectContaining({ cancelled: false }));
  const cancel = f.dispatch('message', { type: 'CANCEL', requestId: 'repair-one' }); await cancel.promise; await repair.promise;
  expect(cancel.reply).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true, ready: false })); expect(bucket.get(f.scope + 'index.html')).toBe(good); expect(bucket.has(f.scope + 'player.js')).toBe(false);
  f.setHook(undefined); f.fetches.length = 0; const retry = f.dispatch('message', { type: 'CACHE', requestId: 'retry' }); await retry.promise;
  expect(retry.reply).toHaveBeenCalledWith(expect.objectContaining({ ready: true })); expect(f.fetches).toEqual(['player.js']);
});

// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { addWebOfflineFiles } from './web-offline-export';

it('fills only the release attribute, never a matching string in the author title or story', () => {
  const files: Record<string, Uint8Array> = { 'index.html': new TextEncoder().encode('<html><head><title>__WORLD_RELEASE__</title></head><body><p>__WORLD_RELEASE__</p></body></html>') };
  addWebOfflineFiles(files, '__WORLD_RELEASE__'); const html = new TextDecoder().decode(files['index.html']);
  expect(html).toContain('<title>__WORLD_RELEASE__</title>'); expect(html).toContain('<p>__WORLD_RELEASE__</p>'); expect(html).toMatch(/data-world-release="sha256:[a-f0-9]{64}"/u);
});

function fixture() {
  const scope = 'https://example.test/game/', buckets = new Map<string, Map<string, Response>>(), clients = new Map<string, { url: string }>();
  const caches = { keys: async () => [...buckets.keys()], delete: async (key: string) => buckets.delete(key), open: async (key: string) => {
    if (!buckets.has(key)) buckets.set(key, new Map()); const bucket = buckets.get(key)!;
    return { keys: async () => [...bucket.keys()].map(url => new Request(url)), match: async (url: string | Request) => bucket.get(typeof url === 'string' ? url : url.url)?.clone(), put: async (url: string, value: Response) => { bucket.set(url, value.clone()); } };
  } };
  function worker(version: string) {
    const files: Record<string, Uint8Array> = { 'index.html': new TextEncoder().encode('<html><head></head><body>' + version + '</body></html>'), 'player.js': new TextEncoder().encode('script ' + version), 'sound.wav': new Uint8Array(version === '1.8.0' ? [1, 2, 3, 4] : [5, 6, 7, 8]) };
    addWebOfflineFiles(files, '版本测试', version);
    const code = new TextDecoder().decode(files['sw.js']), id = JSON.parse(code.match(/^const version = (.*);$/mu)![1]!) as string;
    const handlers = new Map<string, (event: Record<string, unknown>) => void>(), skipWaiting = vi.fn(), fetch = vi.fn(async (url: string | { url: string }) => new Response(files[new URL(typeof url === 'string' ? url : url.url).pathname.slice('/game/'.length)] as BodyInit));
    const self = { registration: { scope, active: { state: 'activated' }, waiting: null as null | { state: string }, installing: null as null | { state: string } }, clients: { claim: vi.fn(), get: async (id: string) => clients.get(id), matchAll: vi.fn(async () => [...clients.values()]) }, skipWaiting, addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => handlers.set(type, handler) };
    new Function('self', 'caches', 'fetch', 'crypto', 'AbortController', 'DOMException', code)(self, caches, fetch, webcrypto, AbortController, DOMException);
    async function lifecycle(type: string) { let promise: Promise<unknown> | undefined; handlers.get(type)!({ waitUntil: (value: Promise<unknown>) => { promise = value; } }); await promise; }
    async function message(type: string, sourceUrl?: string, detail: Record<string, unknown> = {}) { let promise: Promise<unknown> | undefined; const reply = vi.fn(); handlers.get('message')!({ data: { ...detail, type }, source: sourceUrl ? { url: sourceUrl } : undefined, ports: [{ postMessage: reply }], waitUntil: (p: Promise<unknown>) => { promise = p; } }); await promise; return reply.mock.calls[0]?.[0]; }
    async function request(file: string, options: { client?: string; navigate?: boolean; range?: string } = {}) {
      let response: Promise<Response> | undefined;
      handlers.get('fetch')!({ request: { url: new URL(file, scope).href, method: 'GET', mode: options.navigate ? 'navigate' : 'cors', headers: new Headers(options.range ? { range: options.range } : {}) }, clientId: options.client ?? '', respondWith: (value: Promise<Response>) => { response = value; } });
      return response;
    }
    return { id, files, fetch, skipWaiting, lifecycle, message, request, self, url: scope + '?world-release=' + encodeURIComponent(id), key: 'world-offline:' + encodeURIComponent(scope) + ':' + id };
  }
  return { worker, buckets, clients, scope };
}

it('keeps old bytes through activation, navigation, client asset requests and ranged audio', async () => {
  const f = fixture(), old = f.worker('1.8.0'); await old.lifecycle('install'); const next = f.worker('1.9.0'); await next.lifecycle('install'); await next.lifecycle('activate');
  expect(f.buckets.size).toBe(2); const page = await next.request(old.url, { navigate: true }); expect(new Uint8Array(await page!.arrayBuffer())).toEqual(old.files['index.html']);
  f.clients.set('old-tab', { url: old.url }); expect(await (await next.request('player.js', { client: 'old-tab' }))!.text()).toBe('script 1.8.0');
  const audio = await next.request('sound.wav', { client: 'old-tab', range: 'bytes=1-2' }); expect(audio!.status).toBe(206); expect([...new Uint8Array(await audio!.arrayBuffer())]).toEqual([2, 3]);
  expect(new Uint8Array(await (await next.request(next.url, { navigate: true }))!.arrayBuffer())).toEqual(next.files['index.html']);
  // Explicitly visiting the unpinned current entry is a new navigation, not an
  // asset request belonging to the old initiating window.
  expect(new Uint8Array(await (await next.request('./', { navigate: true, client: 'old-tab' }))!.arrayBuffer())).toEqual(next.files['index.html']);
  const restarted = f.worker('1.9.0'); expect(await (await restarted.request('player.js', { client: 'old-tab' }))!.text()).toBe('script 1.8.0');
});

it('describes current and latest separately, never repairs an old cache with new files, and activates only on request', async () => {
  const f = fixture(), old = f.worker('1.8.0'); await old.lifecycle('install'); const next = f.worker('1.9.0'); await next.lifecycle('install');
  expect(next.skipWaiting).not.toHaveBeenCalled(); const info = await next.message('INFO'); expect(info.publicationVersion).toBe('1.9.0');
  const status = await next.message('STATUS', old.url); expect(status).toMatchObject({ ready: true, version: old.id, retained: true, latest: { publicationVersion: '1.9.0' } });
  next.fetch.mockClear(); expect(await next.message('CACHE', old.url)).toMatchObject({ ready: false, retained: true }); expect(next.fetch).not.toHaveBeenCalled();
  await next.message('ACTIVATE', old.url); expect(next.skipWaiting).toHaveBeenCalledOnce();
});

it('blocks a missing or partially evicted pinned version rather than using new server bytes', async () => {
  const f = fixture(), old = f.worker('1.8.0'); await old.lifecycle('install'); const next = f.worker('1.9.0'); await next.lifecycle('install');
  f.buckets.get(old.key)!.delete(f.scope + 'player.js'); next.fetch.mockClear();
  const incomplete = await next.request(old.url, { navigate: true }); expect(incomplete!.status).toBe(410); expect(await incomplete!.text()).toContain('未替换为新版');
  f.clients.set('old-tab', { url: old.url }); expect((await next.request('player.js', { client: 'old-tab' }))!.status).toBe(503);
  f.buckets.delete(old.key); expect((await next.request(old.url, { navigate: true }))!.status).toBe(410); expect(next.fetch).not.toHaveBeenCalled(); expect(f.buckets.has(old.key)).toBe(false);
});

it('rejects invalid release selectors and does not expose cache metadata or intercept other scopes', async () => {
  const f = fixture(), next = f.worker('1.9.0'); await next.lifecycle('install');
  expect((await next.request('?world-release=../../other', { navigate: true }))!.status).toBe(410);
  expect((await next.request('__world-release-info__'))!.status).toBe(404);
  expect(await next.request('https://example.test/other/index.html')).toBeUndefined();
});

it('counts only this game payload bytes, differentiates same-version builds and preserves all caches until confirmation', async () => {
  const f = fixture(), old = f.worker('1.8.0'); await old.lifecycle('install'); const next = f.worker('1.9.0'); await next.lifecycle('install');
  f.buckets.set('other-app', new Map([[f.scope + 'private', new Response('private')]]));
  const result = await next.message('STORAGE', next.url); expect(result.schemaVersion).toBe(1); expect(result.releases).toHaveLength(2);
  for (const game of [old, next]) { const row = result.releases.find((row: { releaseId: string }) => row.releaseId === game.id); const inventory = JSON.parse(new TextDecoder().decode(game.files['sw.js']).match(/^const inventory = (.*);$/mu)![1]!); expect(row).toMatchObject({ fileCount: Object.keys(inventory).length, byteLength: Object.keys(inventory).reduce((n, path) => n + game.files[path]!.byteLength, 0), complete: true, reason: game === next ? 'current' : null }); }
  expect(f.buckets.size).toBe(3); expect(await next.message('DELETE_RELEASE', next.url, { releaseId: old.id })).toMatchObject({ deleted: false, reason: 'invalid' }); expect(f.buckets.has(old.key)).toBe(true);
  expect(await next.message('DELETE_RELEASE', next.url, { releaseId: old.id, confirmed: true })).toMatchObject({ deleted: true }); expect(f.buckets.has(old.key)).toBe(false); expect(f.buckets.has('other-app')).toBe(true); expect(f.buckets.has(next.key)).toBe(true);
});

it('rechecks open windows and refuses current, default, newly used, unknown and updating versions', async () => {
  const f = fixture(), old = f.worker('1.8.0'); await old.lifecycle('install'); const next = f.worker('1.9.0'); await next.lifecycle('install');
  const remove = (id: string, source = next.url) => next.message('DELETE_RELEASE', source, { releaseId: id, confirmed: true });
  expect(await remove(old.id, old.url)).toMatchObject({ deleted: false, reason: 'current' }); expect(await remove(next.id, old.url)).toMatchObject({ deleted: false, reason: 'default' });
  await next.message('STORAGE', next.url); f.clients.set('opened-after-list', { url: old.url }); expect(await remove(old.id)).toMatchObject({ deleted: false, reason: 'used' });
  f.clients.set('opened-after-list', { url: f.scope }); expect(await remove(old.id)).toMatchObject({ deleted: false, reason: 'unknownWindow' }); f.clients.clear();
  next.self.registration.waiting = { state: 'installed' }; expect(await remove(old.id)).toMatchObject({ deleted: false, reason: 'updating' }); next.self.registration.waiting = null;
  next.self.clients.matchAll.mockImplementationOnce(async () => []).mockImplementationOnce(async () => [{ url: old.url }]); expect(await remove(old.id)).toMatchObject({ deleted: false, reason: 'used' }); expect(f.buckets.has(old.key)).toBe(true);
});

it('never accepts foreign or traversal cleanup, and keeps missing metadata protected', async () => {
  const f = fixture(), old = f.worker('1.8.0'); await old.lifecycle('install'); const next = f.worker('1.9.0'); await next.lifecycle('install');
  f.buckets.get(old.key)!.delete(f.scope + '__world-release-info__');
  expect((await next.message('STORAGE', next.url)).releases.find((row: { releaseId: string }) => row.releaseId === old.id)).toMatchObject({ reason: 'unknown', complete: false });
  expect(await next.message('DELETE_RELEASE', next.url, { releaseId: old.id, confirmed: true })).toMatchObject({ reason: 'unknown', deleted: false });
  for (const [source, releaseId] of [['https://example.test/other/', old.id], [next.url, '../../other-app']]) expect(await next.message('DELETE_RELEASE', source, { releaseId, confirmed: true })).toMatchObject({ reason: 'invalid', deleted: false });
  expect(f.buckets.size).toBe(2);
});

it.each([{}, [], { '../other/private': 'sha256:' + 'a'.repeat(64) }])('keeps malformed inventory metadata protected (%j)', async inventory => {
  const f = fixture(), old = f.worker('1.8.0'); await old.lifecycle('install'); const next = f.worker('1.9.0'); await next.lifecycle('install');
  f.buckets.get(old.key)!.set(f.scope + '__world-release-info__', new Response(JSON.stringify({ schemaVersion: 1, releaseId: old.id, publicationVersion: '1.8.0', inventory })));
  expect((await next.message('STORAGE', next.url)).releases.find((row: { releaseId: string }) => row.releaseId === old.id)).toMatchObject({ reason: 'unknown', complete: false }); expect(await next.message('DELETE_RELEASE', next.url, { releaseId: old.id, confirmed: true })).toMatchObject({ deleted: false, reason: 'unknown' }); expect(f.buckets.has(old.key)).toBe(true);
});

it('serializes cleanup against cache listing and in-flight game requests', async () => {
  const f = fixture(), old = f.worker('1.8.0'); await old.lifecycle('install'); const next = f.worker('1.9.0'); await next.lifecycle('install');
  const original = f.buckets.get(old.key)!.get(f.scope + 'player.js')!, clone = original.clone.bind(original); let finishRead: ((value: ArrayBuffer) => void) | undefined;
  const intercept = vi.spyOn(original, 'clone').mockImplementation(() => { const response = clone(); vi.spyOn(response, 'arrayBuffer').mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; })); return response; });
  const list = next.message('STORAGE', next.url); await vi.waitFor(() => expect(finishRead).toBeDefined());
  expect(await next.message('DELETE_RELEASE', next.url, { releaseId: old.id, confirmed: true })).toMatchObject({ deleted: false, reason: 'busy' });
  finishRead!(await clone().arrayBuffer()); await list; intercept.mockRestore();
  let finishClient: ((value: { url: string }) => void) | undefined; vi.spyOn(next.self.clients, 'get').mockImplementationOnce(() => new Promise(resolve => { finishClient = resolve; }));
  const pending = next.request('player.js', { client: 'opening-old' }); await vi.waitFor(() => expect(finishClient).toBeDefined());
  expect(await next.message('DELETE_RELEASE', next.url, { releaseId: old.id, confirmed: true })).toMatchObject({ deleted: false, reason: 'busy' }); finishClient!({ url: old.url }); expect(await (await pending)!.text()).toBe('script 1.8.0');
  expect(await next.message('DELETE_RELEASE', next.url, { releaseId: old.id, confirmed: true })).toMatchObject({ deleted: true });
});

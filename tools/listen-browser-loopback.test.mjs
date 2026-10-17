import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const close = server => new Promise(resolve => server.listening ? server.close(resolve) : resolve());
test('listens only on a browser-safe high loopback port and removes temporary listeners', async () => {
  const server = createServer(), originalListeners = ['error', 'listening'].map(event => server.listeners(event));
  try { const port = await listenBrowserLoopback(server); assert.ok(port >= 20000 && port < 50000); assert.equal(server.address().address, '127.0.0.1'); assert.deepEqual(['error', 'listening'].map(event => server.listeners(event)), originalListeners); }
  finally { await close(server); }
});
test('retries an occupied port without changing the existing server', async () => {
  const original = createServer(), next = createServer();
  try { const occupied = await listenBrowserLoopback(original); let first = true; const chosen = await listenBrowserLoopback(next, () => { if (first) { first = false; return occupied; } return 20000 + Math.floor(Math.random() * 30000); }); assert.notEqual(chosen, occupied); assert.equal(original.address().port, occupied); }
  finally { await close(next); await close(original); }
});
test('rejects unsafe or invalid candidates without binding a broad interface', async () => {
  for (const port of [0, 1720, 19999, 50000, NaN]) { const server = createServer(); await assert.rejects(listenBrowserLoopback(server, () => port), /20000/u); assert.equal(server.listening, false); }
});
test('retries a Windows excluded port and removes the failed attempt listeners', async () => {
  const server = new EventEmitter(), calls = [];
  server.listen = (port, host) => { calls.push({ port, host }); queueMicrotask(() => server.emit(calls.length === 1 ? 'error' : 'listening', Object.assign(new Error('excluded port'), { code: 'EACCES' }))); };
  server.address = () => ({ port: calls.at(-1).port });
  let candidate = 20000;
  assert.equal(await listenBrowserLoopback(server, () => candidate++), 20001);
  assert.deepEqual(calls, [{ port: 20000, host: '127.0.0.1' }, { port: 20001, host: '127.0.0.1' }]);
  assert.equal(server.listenerCount('error') + server.listenerCount('listening'), 0);
});
test('bounds excluded-port retries and preserves the final error instead of hiding other failures', async () => {
  for (const code of ['EACCES', 'EAFNOSUPPORT']) {
    const server = new EventEmitter(); let calls = 0;
    server.listen = () => { calls++; queueMicrotask(() => server.emit('error', Object.assign(new Error('injected listen failure'), { code }))); };
    await assert.rejects(listenBrowserLoopback(server, () => 20000), code === 'EACCES' ? error => error.cause?.code === code : error => error.code === code);
    assert.equal(calls, code === 'EACCES' ? 16 : 1); assert.equal(server.listenerCount('error') + server.listenerCount('listening'), 0);
  }
});

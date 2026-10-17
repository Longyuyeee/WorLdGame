import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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

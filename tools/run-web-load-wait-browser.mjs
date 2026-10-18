import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-load-wait/browser');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.split('=')[1] ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine)); await mkdir(output, { recursive: true });
await writeFile(path.join(output, `${engine}.json`), JSON.stringify({ passed: false, status: 'running' }));
const result = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: path.join(root, 'tools/fixtures/reading-advance-player.ts'), name: 'LoadWait', formats: ['iife'] } } });
const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output), code = outputs.find(item => item.type === 'chunk').code, css = outputs.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n');
const server = createServer((req, res) => {
  const file = new URL(req.url, 'http://local').pathname;
  if (file === '/player.js') res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(code);
  else if (file === '/player.css') res.writeHead(200, { 'Content-Type': 'text/css' }).end(css);
  else res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/player.css"><div id="player-root"></div><script src="/player.js"></script>');
});
await listenBrowserLoopback(server);
const require = createRequire(import.meta.url); let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await playwright[engine].launch({ headless: true }), context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), checks = [], errors = [], completedLoads = [];
page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
await page.addInitScript(() => {
  // Hold a REAL successful load reply, not fabricated history or validators.
  // Deliver it after cancellation to exercise the late-result gate as well.
  window.loadProbe = { hold: false, held: [], live: 0, terminated: 0, completed: [], urls: new Set() };
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  URL.createObjectURL = function (...args) { const url = create.apply(this, args); loadProbe.urls.add(url); return url; };
  URL.revokeObjectURL = function (url) { loadProbe.urls.delete(url); return revoke.call(this, url); };
  const Native = Worker, descriptor = Object.getOwnPropertyDescriptor(Native.prototype, 'onmessage');
  window.Worker = class extends Native {
    constructor(...args) { super(...args); this.owned = String(args[1]?.name ?? '').startsWith('world-player-'); if (this.owned) loadProbe.live++; }
    get onmessage() { return descriptor.get.call(this); }
    set onmessage(callback) { descriptor.set.call(this, !callback ? callback : event => {
      if (event.data?.id === this.loadId) {
        loadProbe.completed.push({ id: this.loadId, encoding: event.data.result?.encoding ?? 'plain', success: (event.data.result?.value ?? event.data.result)?.result?.ok === true });
        if (loadProbe.hold) { loadProbe.held.push(() => callback.call(this, event)); return; }
      }
      return callback.call(this, event);
    }); }
    postMessage(data, ...args) { if (data?.task?.kind === 'load') this.loadId = data.id; return super.postMessage(data, ...args); }
    terminate() { if (this.owned && !this.released) { this.released = true; loadProbe.live--; loadProbe.terminated++; } return super.terminate(); }
  };
});
const button = name => page.getByRole('button', { name, exact: true }), main = page.locator('main.player-shell');
const state = () => main.evaluate(element => ({ hash: element.dataset.runtimeStateHash, length: element.dataset.historyLength, cursor: element.dataset.historyCursor, text: document.querySelector('.player-dialogue__text')?.textContent, status: element.dataset.playerStatus }));
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${engine} ${name}`); };
async function menu() { await page.mouse.move(100, 100); await button('打开阅读菜单').click(); }
async function read() { await menu(); await button('快速读取').click(); await button('确认读取').click(); }
async function hold() { await page.evaluate(() => { loadProbe.hold = true; }); }
async function held() { await page.waitForFunction(() => loadProbe.held.length > 0); }
async function release() { await page.evaluate(() => { loadProbe.hold = false; for (const send of loadProbe.held.splice(0)) send(); }); }
async function reload() { completedLoads.push(...await page.evaluate(() => loadProbe.completed)); await page.reload(); }
async function record(store, key) {
  return page.evaluate(async ({ store, key }) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      const row = await new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      if (!row) return null;
      const metadata = row.metadata ?? row;
      return { bytes: row.byteLength ?? new TextEncoder().encode(row.serializedSessionSave).length, sha256: row.sha256 ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.serializedSessionSave))), byte => byte.toString(16).padStart(2, '0')).join(''), hash: metadata.runtimeStateHash, artifact: metadata.sessionArtifactHash };
    } finally { db.close(); }
  }, { store, key });
}
const slot = () => record('save-slots', 'session_budget\0quick-1'), recovery = () => record('recovery-sessions', 'session_budget');
async function settled() { await page.waitForFunction(() => ['idle', 'ready', 'loaded', 'available'].includes(document.querySelector('main')?.dataset.recoveryOperation) && (JSON.parse(document.documentElement.dataset.recoverySerializer ?? '{}').active ?? 0) === 0); }
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?count=480`); await button('开始故事').click();
  while (Number(await main.getAttribute('data-history-length')) < 480) {
    const old = await main.getAttribute('data-runtime-state-hash'); await button('继续下一句').click();
    await page.waitForFunction(old => document.querySelector('main')?.dataset.runtimeStateHash !== old, old);
  }
  await settled(); await menu(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('返回故事').click();
  const target = await state(), originalSlot = await slot(); await button('继续下一句').click();
  await page.waitForFunction(old => document.querySelector('main')?.dataset.runtimeStateHash !== old, target.hash);
  await settled(); const before = await state();
  await hold(); await read(); await held();
  assert.equal(await button('取消读取').isEnabled(), true); await button('取消读取').click(); await release(); assert.deepEqual(await state(), before); assert.deepEqual(await slot(), originalSlot);
  await button('关闭存读档').click(); check('complete-native-worker-load-cancel-late-reply-retains-current-story-and-slot', { history: 480, target, before, slot: originalSlot });
  await hold(); await read(); await held();
  const layouts = [];
  for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await button('取消读取').scrollIntoViewIfNeeded();
    const box = await button('取消读取').boundingBox(); assert.ok(box && box.height >= 44 && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
    layouts.push({ viewport, cancel: box }); await page.screenshot({ path: path.join(output, `${engine}-wait-${viewport.width}x${viewport.height}.png`) });
  }
  await page.keyboard.press('Escape'); await release(); assert.deepEqual(await state(), before); await button('关闭存读档').click(); await page.setViewportSize({ width: 1280, height: 900 });
  check('four-mobile-viewports-44px-cancel-and-keyboard-exit', { layouts });
  await hold(); await read(); await held(); await page.evaluate(() => readingAdvanceHost.setHostActivity('suspended'));
  await page.waitForFunction(() => document.querySelector('main')?.dataset.sessionRead === 'idle'); await release(); assert.deepEqual(await state(), before);
  await page.evaluate(() => readingAdvanceHost.setHostActivity('active')); await button('确认读取').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
  const loaded = await state(); assert.equal(loaded.length, target.length); assert.equal(loaded.cursor, target.cursor); assert.equal(loaded.text, target.text); assert.deepEqual(await slot(), originalSlot);
  check('host-suspension-cancels-without-corruption-and-explicit-retry-restores-full-history', { loaded });
  await settled(); await reload(); await button('恢复上次进度').waitFor(); const originalRecovery = await recovery(); await hold(); await button('恢复上次进度').click(); await held();
  assert.equal(await button('放弃并清除').isDisabled(), true); await button('取消读取').click(); await release(); assert.deepEqual(await recovery(), originalRecovery);
  await button('恢复上次进度').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'loaded'); assert.deepEqual(await slot(), originalSlot);
  check('cold-recovery-cancel-retains-durable-record-and-explicit-retry', { originalRecovery, restored: await state() });
  await settled(); await reload(); await button('恢复上次进度').waitFor(); await button('放弃并清除').click(); await button('继续最近存档').waitFor(); await hold(); await button('继续最近存档').click(); await held();
  await button('取消读取').click(); await release(); assert.equal((await state()).status, 'title'); assert.equal(await button('继续最近存档').isEnabled(), true);
  await button('继续最近存档').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); assert.deepEqual(await slot(), originalSlot);
  check('title-recent-save-cancel-and-retry-the-same-pinned-slot');
  await hold(); await read(); await held(); await page.evaluate(() => readingAdvanceHost.unmount()); await release();
  const diagnostics = await page.evaluate(() => ({ live: loadProbe.live, terminated: loadProbe.terminated, urls: loadProbe.urls.size, completed: loadProbe.completed }));
  diagnostics.completed = [...completedLoads, ...diagnostics.completed];
  assert.equal(diagnostics.live, 0); assert.equal(diagnostics.urls, 0); assert.ok(diagnostics.completed.length >= 8 && diagnostics.completed.every(item => item.success && item.encoding === 'world-player.history-lists.1'));
  assert.deepEqual(errors, []); check('unmount-releases-all-native-workers-and-blob-urls', diagnostics);
  await writeFile(path.join(output, `${engine}.json`), JSON.stringify({ passed: true, engine, version: browser.version(), bundleHash: sha(code), cssHash: sha(css), checks, errors, scope: 'HTTP local production-mode synthetic long story; real UI progression, IndexedDB and native Workers. Held actual validated load replies and explicit Host suspension are fault injections, not OS background/BFCache, physical phone or media acceptance. No history is injected and no formal validation is replaced.' }, null, 2));
} catch (error) { await page.screenshot({ path: path.join(output, `${engine}-failure.png`) }); await writeFile(path.join(output, `${engine}.json`), JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

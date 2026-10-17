import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-reading-delivery/load');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const html = await readFile(path.join(output, '../work/before-rain-stops.html'));
const projectId = readGamePayload(html.toString()).project.manifest.projectId;
await mkdir(output, { recursive: true }); const report = path.join(output, `${engine}.json`);
await writeFile(report, JSON.stringify({ passed: false, status: 'running' }));
const server = createServer((req, res) => res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html));
await listenBrowserLoopback(server);
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true }), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), checks = [], errors = [], completedLoads = [];
page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
await page.addInitScript(() => {
  // Only delay delivery of an actual native Worker reply after full validation.
  // No synthetic story, IndexedDB writes, validator replacement or fake result.
  window.loadProbe = { hold: false, held: [], completed: [] };
  const Native = Worker, descriptor = Object.getOwnPropertyDescriptor(Native.prototype, 'onmessage');
  window.Worker = class extends Native {
    get onmessage() { return descriptor.get.call(this); }
    set onmessage(callback) { descriptor.set.call(this, !callback ? callback : event => {
      if (event.data?.id === this.loadId) {
        loadProbe.completed.push({ encoding: event.data.result?.encoding ?? 'plain', success: (event.data.result?.value ?? event.data.result)?.result?.ok === true });
        if (loadProbe.hold) { loadProbe.held.push(() => callback.call(this, event)); return; }
      }
      callback.call(this, event);
    }); }
    postMessage(data, ...args) { if (data?.task?.kind === 'load') this.loadId = data.id; return super.postMessage(data, ...args); }
  };
});
const button = name => page.getByRole('button', { name, exact: true }), main = page.locator('main.player-shell');
const state = () => main.evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, length: el.dataset.historyLength, text: document.querySelector('.player-dialogue__text')?.textContent, status: el.dataset.playerStatus }));
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${engine} ${name}`); };
const shot = name => page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled' });
const hold = () => page.evaluate(() => { loadProbe.hold = true; });
async function held() {
  await page.waitForFunction(() => loadProbe.held.length > 0);
  const reply = await page.evaluate(() => loadProbe.completed.at(-1));
  assert.deepEqual(reply, { encoding: 'plain', success: true }, 'Cancellation must hold a real fully validated successful short-save reply');
  // A native reply is not a React commit barrier, especially for tiny saves in
  // WebKit. Observe the real public phase before asserting or using its UI.
  await page.waitForFunction(() => document.querySelector('main')?.dataset.sessionRead === 'validating');
}
const release = () => page.evaluate(() => { loadProbe.hold = false; for (const send of loadProbe.held.splice(0)) send(); });
async function reload() { completedLoads.push(...await page.evaluate(() => loadProbe.completed)); await page.reload(); }
async function record(store, key) {
  return page.evaluate(async ({ store, key }) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      const row = await new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      if (!row) return null;
      const bytes = new TextEncoder().encode(row.serializedSessionSave), metadata = row.metadata ?? row;
      return { bytes: bytes.length, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''), artifact: metadata.sessionArtifactHash, runtime: metadata.runtimeStateHash };
    } finally { db.close(); }
  }, { store, key });
}
const slot = () => record('save-slots', `${projectId}\0quick-1`), recovery = () => record('recovery-sessions', projectId);
async function read() { await button('打开阅读菜单').click(); await button('快速读取').click(); await button('确认读取').click(); }
async function nextParagraph() {
  const before = await state();
  for (let i = 0; i < 12 && (await state()).hash === before.hash; i++) {
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button('继续下一句').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  assert.notEqual((await state()).hash, before.hash);
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click(); await button('开始故事').click();
  await button('打开阅读菜单').click(); await button('本次先无声阅读').click(); await nextParagraph();
  await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('返回故事').click();
  const target = await state(), saved = await slot(); assert.ok(saved); await nextParagraph(); const before = await state();
  await hold(); await read(); await held(); assert.equal(await main.getAttribute('data-session-read'), 'validating');
  await button('取消读取').click(); await release(); assert.deepEqual(await state(), before); assert.deepEqual(await slot(), saved); await button('关闭存读档').click();
  check('actual-complete-game-cancel-and-late-native-worker-reply-preserve-story-and-slot', { target, before, saved });
  await hold(); await read(); await held(); const layouts = [];
  for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await button('取消读取').scrollIntoViewIfNeeded(); const cancel = await button('取消读取').boundingBox();
    assert.ok(cancel && cancel.height >= 44 && cancel.x >= 0 && cancel.y >= 0 && cancel.x + cancel.width <= viewport.width + 1 && cancel.y + cancel.height <= viewport.height + 1);
    layouts.push({ viewport, cancel }); await shot(`wait-${viewport.width}x${viewport.height}`);
  }
  await page.keyboard.press('Escape'); await release(); assert.deepEqual(await state(), before); await button('关闭存读档').click(); check('four-phone-sized-viewports-and-escape-cancel', { layouts });
  await hold(); await read(); await held(); await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await page.waitForFunction(() => document.querySelector('main')?.dataset.sessionRead === 'idle'); await release(); assert.deepEqual(await state(), before);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await page.waitForFunction(() => document.querySelector('main')?.dataset.hostActivity === 'active'); await button('确认读取').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); const loaded = await state();
  for (const key of ['text', 'cursor', 'length']) assert.equal(loaded[key], target[key]); assert.deepEqual(await slot(), saved);
  check('lifecycle-cancellation-and-explicit-retry-restore-own-validated-save', { loaded, injectedLifecycleEvents: true });
  await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'ready'); await reload(); await button('恢复上次进度').waitFor();
  const durable = await recovery(); assert.ok(durable); await hold(); await button('恢复上次进度').click(); await held(); await button('取消读取').click(); await release();
  assert.deepEqual(await recovery(), durable); await button('恢复上次进度').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'loaded'); assert.deepEqual(await slot(), saved);
  check('cold-recovery-cancel-and-retry-retain-durable-recovery-and-quick-slot', { durable });
  // A successfully restored unchanged recovery already is durable; Shell keeps
  // it as loaded instead of needlessly serializing the same hash again.
  await page.waitForFunction(() => ['ready', 'loaded'].includes(document.querySelector('main')?.dataset.recoveryOperation)); await reload(); await button('恢复上次进度').waitFor(); await button('放弃并清除').click(); await button('继续最近存档').waitFor();
  await hold(); await button('继续最近存档').click(); await held(); await button('取消读取').click(); await release(); assert.equal((await state()).status, 'title'); assert.deepEqual(await slot(), saved);
  await button('继续最近存档').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); assert.deepEqual(await slot(), saved);
  // This real save has six entries. Encoding starts at 480, so its validated
  // reply must remain plain; the synthetic long-story probe has a different
  // transport expectation and must not be copied into this acceptance task.
  const completed = [...completedLoads, ...await page.evaluate(() => loadProbe.completed)];
  assert.ok(Number(target.length) < 480);
  assert.ok(completed.length >= 8 && completed.every(item => item.success && item.encoding === 'plain'), JSON.stringify(completed));
  check('title-recent-save-cancel-and-explicit-retry', { completed });
  assert.deepEqual(errors, []); await writeFile(report, JSON.stringify({ passed: true, browser: browser.version(), artifactSha256: sha(html), checks, errors, scope: 'Actual unchanged complete game via HTTP single-file HTML. Native Workers and IndexedDB with held real fully validated replies; injected lifecycle events. Silent reading explicitly selected for load testing. Not long-story performance, OS suspension, audio, physical phone/Safari or public deployment acceptance.' }, null, 2));
} catch (error) { await shot('failure'); await writeFile(report, JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

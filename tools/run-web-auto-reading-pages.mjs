import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { unzipSync } from 'fflate';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-auto-reading-pages'), baseline = process.argv.includes('--baseline'), nativeSaveProbe = process.argv.includes('--native-save-probe');
const reportPath = path.join(output, baseline ? 'baseline-reading.json' : nativeSaveProbe ? 'native-save-checks.json' : 'reading-checks.json');
await mkdir(output, { recursive: true }); await writeFile(reportPath, JSON.stringify({ passed: false, status: 'running' }));
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const checks = [], errors = []; let server, browser, current;
const button = (p, name) => p.getByRole('button', { name, exact: true });
const hash = p => p.locator('main.player-shell').getAttribute('data-runtime-state-hash');
const settle = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const shot = (p, name) => p.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
async function menu(p) { await button(p, '打开阅读菜单').click(); }
async function closeMenu(p) { await p.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '返回故事', exact: true }).click(); }
async function geometry(p) { return p.locator('.player-dialogue').evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, total: el.scrollHeight, unread: el.scrollHeight - el.clientHeight - el.scrollTop > 2 })); }
async function feedback(p) {
  await menu(p); await button(p, '快速保存').click();
  try { await p.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('main')?.dataset.saveOperation)); }
  catch (error) { throw Error(String(error) + ' ' + JSON.stringify(await p.evaluate(() => ({ operation: document.querySelector('main')?.dataset.saveOperation, operations: window.readerProbeErrors, blobs: window.readerBlobProbe, foreground: document.documentElement.dataset.foregroundSerializer })))); }
  if (await p.locator('main').getAttribute('data-save-operation') !== 'saved') throw Error('Save failed: ' + JSON.stringify(await p.evaluate(() => ({ operations: window.readerProbeErrors, blobs: window.readerBlobProbe, foreground: document.documentElement.dataset.foregroundSerializer }))) + ' ' + await p.locator('.player-save').innerText()); await closeMenu(p); await p.locator('.player-save-feedback').filter({ hasText: '快速存档已保存' }).waitFor();
  const toast = await p.locator('.player-save-feedback').boundingBox(); assert.ok(toast);
  const boxes = {};
  for (const selector of ['.player-reading-caption', '.player-dialogue', '.player-compact-toolbar']) {
    const box = await p.locator(selector).boundingBox(); assert.ok(box); boxes[selector] = box;
    assert.ok(toast.x + toast.width <= box.x || box.x + box.width <= toast.x || toast.y + toast.height <= box.y || box.y + box.height <= toast.y, `Save feedback covers ${selector}`);
  }
  for (const control of await p.locator('.player-compact-toolbar button').all()) { const box = await control.boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44); }
  const size = p.viewportSize(); assert.ok(toast.x >= 0 && toast.y >= 0 && toast.x + toast.width <= size.width && toast.y + toast.height <= size.height); return { toast, boxes };
}
async function checkReader(engine, url) {
  browser = await engines[engine].launch({ headless: true, args: engine === 'chromium' ? ['--mute-audio'] : [] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: engine === 'chromium' });
  if (nativeSaveProbe) await ctx.addInitScript(() => {
    window.readerProbeErrors = [];
    const abort = IDBTransaction.prototype.abort;
    IDBTransaction.prototype.abort = function (...args) { try { const result = abort.apply(this, args); window.readerProbeErrors.push({ source: 'IDB.abort', result: 'ok' }); return result; } catch (error) { window.readerProbeErrors.push({ source: 'IDB.abort', error: String(error) }); throw error; } };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) { const result = transaction.apply(this, args); if (this.name === 'world-player-saves') { const label = String(args[0]) + ':' + args[1]; window.readerProbeErrors.push({ transaction: label, event: 'start' }); for (const event of ['complete', 'abort', 'error']) result.addEventListener(event, () => window.readerProbeErrors.push({ transaction: label, event, error: String(result.error) })); } return result; };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { const store = this.name, database = this.transaction.db.name; try { const request = put.apply(this, args); request.addEventListener('error', () => window.readerProbeErrors.push({ source: 'IDB.put', database, store, error: String(request.error) })); return request; } catch (error) { window.readerProbeErrors.push({ source: 'IDB.put-throw', database, store, error: String(error) }); throw error; } };
    const post = Worker.prototype.postMessage, observed = new WeakSet();
    Worker.prototype.postMessage = function (...args) { if (!observed.has(this)) { observed.add(this); this.addEventListener('error', e => window.readerProbeErrors.push({ source: 'worker', error: e.message })); this.addEventListener('message', e => { if (e.data?.error) window.readerProbeErrors.push({ source: 'worker-result', error: e.data.error }); }); } return post.apply(this, args); };
  });
  const p = await ctx.newPage(); current = p; p.setDefaultTimeout(20000); p.on('pageerror', e => errors.push({ engine, error: String(e) }));
  await p.goto(url); await button(p, '打开玩家设置').click(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await p.getByLabel('静音全部声音', { exact: true }).check(); const font = p.getByLabel('个人字号', { exact: true }); await font.focus(); await font.press('End'); assert.equal(await font.inputValue(), '140'); await button(p, '返回故事').click(); await button(p, '开始故事').click();
  await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await settle(p);
  const beforeHash = await hash(p), before = await geometry(p), initialText = await p.locator('.player-dialogue__text').innerText(), initialCursor = await p.locator('main').getAttribute('data-history-cursor'); assert.ok(before.unread, `${engine}: actual first paragraph must overflow`);
  // Rendering and input only here. Native audio failures remain reported, not
  // converted into a claim that muted playback or desktop WebKit is Safari.
  const audioFailures = await p.locator('.player-media-error').allInnerTexts();
  if (nativeSaveProbe) {
    await p.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('reader-blob-capability-probe', 1); request.onupgradeneeded = () => request.result.createObjectStore('values'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2; const canvasBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const values = { memoryBlob: new Blob(['test'], { type: 'image/png' }), canvasBlob, copiedCanvasBlob: new Blob([await canvasBlob.arrayBuffer()], { type: 'image/png' }), bytes: new Uint8Array([1, 2, 3]) };
      window.readerBlobProbe = {};
      for (const [name, value] of Object.entries(values)) window.readerBlobProbe[name] = await new Promise(resolve => { const transaction = db.transaction('values', 'readwrite'); transaction.oncomplete = () => resolve('ok'); transaction.onabort = () => resolve(String(transaction.error)); transaction.objectStore('values').put(value, name); });
      db.close();
    });
    await menu(p); await button(p, '自动播放').click(); await closeMenu(p); const notices = await feedback(p); assert.equal(await hash(p), beforeHash);
    const blobs = await p.evaluate(() => window.readerBlobProbe), operationTrace = await p.evaluate(() => window.readerProbeErrors), saveFeedback = await p.locator('.player-save-feedback').innerText();
    if (blobs.memoryBlob !== 'ok') assert.match(saveFeedback, /截图不可用/u);
    await shot(p, `${engine}-native-save-feedback`);
    await p.reload(); await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click(); if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); assert.equal(await hash(p), beforeHash); assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'off');
    assert.equal(await p.locator('main').getAttribute('data-history-cursor'), initialCursor); assert.equal(await p.locator('.player-dialogue__text').innerText(), initialText);
    checks.push({ engine, nativeClock: true, saved: true, reloadedHash: await hash(p), historyCursor: initialCursor, blobs, saveFeedback, operationTrace, notices }); console.log(`PASS ${engine}-native-clock-save-reopen-load`); await ctx.close(); await browser.close(); browser = undefined; return;
  }
  await p.clock.install(); await menu(p); await p.getByLabel('自动阅读节奏', { exact: true }).selectOption('brisk'); await button(p, '自动播放').click(); await closeMenu(p);
  await p.waitForFunction(() => document.querySelector('main')?.dataset.autoPlayback === 'waiting-reading'); await p.clock.fastForward(120000); assert.equal(await hash(p), beforeHash);
  const captionBefore = await p.locator('.player-reading-caption').innerText();
  const notices = [];
  if (!baseline) { notices.push({ viewport: p.viewportSize(), ...await feedback(p) }); assert.equal(await hash(p), beforeHash); await shot(p, `${engine}-auto-waiting-portrait`); }
  if (engine === 'chromium') await p.getByRole('button', { name: '继续下一句', exact: true }).tap(); else await button(p, '继续下一句').click();
  await settle(p); const afterPage = await geometry(p), autoAfterPage = await p.locator('main').getAttribute('data-auto-playback'); assert.equal(await hash(p), beforeHash); assert.ok(afterPage.top > before.top);
  const pageInputSource = await p.locator('main').getAttribute('data-input-source'); assert.equal(pageInputSource, engine === 'chromium' ? 'touch' : 'pointer');
  if (baseline) assert.equal(autoAfterPage, 'off');
  else {
    assert.notEqual(autoAfterPage, 'off'); assert.match(captionBefore, /自动/u);
    await shot(p, `${engine}-auto-after-page`);
    await menu(p); const position = await geometry(p); await p.clock.fastForward(120000); assert.equal(await hash(p), beforeHash); await closeMenu(p); assert.ok(Math.abs((await geometry(p)).top - position.top) <= 2);
    await p.setViewportSize({ width: 844, height: 390 }); await settle(p); const landscape = await geometry(p); assert.equal(await hash(p), beforeHash);
    const landscapeRatio = await p.locator('.player-stage-world').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; }); assert.ok(Math.abs(landscapeRatio - 16 / 9) < .01); notices.push({ viewport: p.viewportSize(), ...await feedback(p) }); await shot(p, `${engine}-auto-landscape`);
    await p.setViewportSize({ width: 390, height: 844 }); await settle(p); assert.equal(await hash(p), beforeHash); assert.ok(Math.abs((await geometry(p)).top - afterPage.top) <= 2);
    const fontRoundtrip = [];
    for (const key of ['Home', 'End']) {
      await menu(p); await button(p, '打开玩家设置').click(); const size = p.getByLabel('个人字号', { exact: true }); await size.focus(); await size.press(key); const percent = await size.inputValue(); await button(p, '返回故事').click(); await settle(p);
      assert.equal(await hash(p), beforeHash); assert.notEqual(await p.locator('main').getAttribute('data-auto-playback'), 'off'); fontRoundtrip.push({ percent, ...await geometry(p) });
    }
    assert.deepEqual(fontRoundtrip.map(row => row.percent), ['85', '140']); assert.ok(Math.abs((await geometry(p)).top - afterPage.top) <= 2); await shot(p, `${engine}-auto-font-return`);
    for (const size of [{ width: 320, height: 740 }, { width: 740, height: 320 }]) { await p.setViewportSize(size); await settle(p); notices.push({ viewport: size, ...await feedback(p) }); assert.equal(await hash(p), beforeHash); await shot(p, `${engine}-feedback-${size.width}x${size.height}`); }
    await p.setViewportSize({ width: 390, height: 844 }); await settle(p);
    for (let i = 0; i < 12 && (await geometry(p)).unread; i++) { await button(p, '继续下一句').click(); await settle(p); assert.equal(await hash(p), beforeHash); }
    assert.equal((await geometry(p)).unread, false); assert.notEqual(await p.locator('main').getAttribute('data-auto-playback'), 'off');
    await p.clock.fastForward(120000); await p.waitForFunction(before => document.querySelector('main')?.dataset.runtimeStateHash !== before, beforeHash); await button(p, '停止自动阅读').click();
    assert.equal((await geometry(p)).top, 0); await menu(p); await button(p, '后退一步').click(); assert.equal((await geometry(p)).top, 0); assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'off');
    assert.equal(await p.locator('.player-dialogue__text').innerText(), initialText); assert.equal(await p.locator('main').getAttribute('data-history-cursor'), initialCursor);
    // Reading a new paragraph expands collection progress even after rollback.
    // Compare exact state after that intentional merge, not a pre-unlock hash.
    const returnedHash = await hash(p);
    // Keyboard paging has the same semantics; an explicit stop still owns the mode.
    await menu(p); await button(p, '自动播放').click(); await closeMenu(p); await button(p, '继续下一句').focus(); await p.keyboard.press('Space'); await settle(p); assert.equal(await hash(p), returnedHash); assert.notEqual(await p.locator('main').getAttribute('data-auto-playback'), 'off'); await button(p, '停止自动阅读').click();
    await p.clock.fastForward(120000); assert.equal(await hash(p), returnedHash); assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'off');
    const ratio = await p.locator('.player-stage-world').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; }); assert.ok(Math.abs(ratio - 16 / 9) < .01);
    checks.push({ engine, browser: browser.version(), before, afterPage, autoAfterPage, landscape, fontRoundtrip, notices, captionBefore, pageInputSource, returnedHash, keyboardPaging: true, menuPause: true, rotationAndHistory: true, explicitStop: true, audioFailures, virtualClock: true, physicalPhone: false, safari: false });
  }
  if (baseline) checks.push({ engine, browser: browser.version(), before, afterPage, autoAfterPage, captionBefore, audioFailures, virtualClock: true, physicalPhone: false });
  await shot(p, `${baseline ? 'baseline-' : ''}${engine}-reading`); console.log(`PASS ${baseline ? 'baseline-' : ''}${engine}-actual-long-paragraph-pages`); await ctx.close(); await browser.close(); browser = undefined;
}
try {
  if (!baseline && !nativeSaveProbe && !process.argv.includes('--read-only')) {
    await new Promise((resolve, reject) => { const child = spawn(process.execPath, [path.join(root, 'tools/run-web-auto-voice-continuity.mjs')], { cwd: root, env: { ...process.env, STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY: output }, stdio: 'inherit' }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`Candidate export/regression exited ${code}`))); });
  }
  const files = unzipSync(await readFile(path.join(baseline ? path.join(root, 'evidence/web-auto-voice-continuity') : output, 'before-rain-stops-website.zip')));
  server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', data = files[name], headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }, range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? ''); if (data && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : data.length - 1, data.length - 1); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }).end(data.subarray(start, end + 1)); } res.writeHead(data ? 200 : 404, headers).end(data ?? 'Missing'); }); await listenBrowserLoopback(server); const url = `http://127.0.0.1:${server.address().port}/gal/`;
  for (const engine of ['chromium', 'firefox', 'webkit']) await checkReader(engine, url);
  assert.deepEqual(errors, []); await writeFile(reportPath, JSON.stringify({ passed: true, baseline, checks, errors, scope: nativeSaveProbe ? 'Native-clock quick saves only, no clock install or time jump; actual exported game in three desktop engines, not full-route, physical-device or public acceptance.' : 'Actual current complete-work paragraph at 140% font; Chromium touch-context tap and Firefox/WebKit pointer/keyboard, desktop viewport rotation and controlled-clock Auto. Text/input checks do not certify native sound, physical phones/Safari, natural reading time, public HTTPS or long-soak.' }, null, 2));
} catch (error) { await writeFile(reportPath, JSON.stringify({ passed: false, baseline, checks, errors, error: String(error) }, null, 2)); if (current && !current.isClosed()) await shot(current, 'failure'); throw error; }
finally { if (browser) await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

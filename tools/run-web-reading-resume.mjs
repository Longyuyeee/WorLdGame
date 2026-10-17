import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
import { sha } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-reading-resume');
const baseline = process.argv.includes('--baseline'), fileMode = process.argv.includes('--file');
const engine = process.argv.find(x => x.startsWith('--engine='))?.slice(9) ?? 'chromium'; assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.join(root, baseline ? 'evidence/web-auto-reading-pages/before-rain-stops.html' : 'evidence/web-reading-resume/work/before-rain-stops.html');
const html = await readFile(source), label = baseline ? 'baseline' : `${engine}${fileMode ? '-file' : ''}`;
await mkdir(output, { recursive: true }); const reportPath = path.join(output, `${label}.json`);
await writeFile(reportPath, JSON.stringify({ passed: false, status: 'running' }));
const server = createServer((req, res) => res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html)); await listenBrowserLoopback(server);
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) }), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(30000); const errors = [], checks = []; page.on('pageerror', e => errors.push(String(e)));
const button = name => page.getByRole('button', { name, exact: true }), main = page.locator('main.player-shell');
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function position() {
  await settle();
  return page.locator('.player-dialogue').evaluate(el => {
    const text = el.querySelector('.player-dialogue__text'), box = el.getBoundingClientRect(), top = box.top + el.clientTop, lines = [], walker = document.createTreeWalker(text, 4); let node, index = 0;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('rt,rp')) continue;
      for (let i = 0; i < node.length; i++, index++) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const rect = r.getBoundingClientRect(); if (rect.height > 0 && (!lines.length || Math.abs(lines.at(-1).top - rect.top) > 2)) lines.push({ index, top: rect.top, bottom: rect.bottom }); }
    }
    const first = lines.find(row => row.top >= top - 1);
    return { first: first?.index ?? 0, excerpt: text.textContent.slice(first?.index ?? 0, (first?.index ?? 0) + 30), scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight, top, bottom: top + el.clientHeight, lines, hash: document.querySelector('main').dataset.runtimeStateHash, cursor: document.querySelector('main').dataset.historyCursor };
  });
}
function visible(result, offset) { const line = result.lines.find((line, i) => line.index <= offset && (result.lines[i + 1]?.index ?? Infinity) > offset); return line && line.top >= result.top - 1 && line.bottom <= result.bottom + 1; }
async function menu() { if (!await page.getByRole('dialog', { name: '阅读菜单', exact: true }).isVisible()) await button('打开阅读菜单').click(); }
async function closeMenu() { if (await button('返回故事').isVisible()) await button('返回故事').click(); }
async function scroll() { await page.locator('.player-dialogue').hover(); await page.mouse.wheel(0, 220); await page.waitForFunction(() => document.querySelector('.player-dialogue').scrollTop > 100); await settle(); }
async function quickLoad() { await menu(); await button('快速读取').click(); await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); await settle(); }
async function recovery() { await page.reload(); await button('恢复上次进度').waitFor(); await button('恢复上次进度').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'loaded'); await page.evaluate(() => document.fonts.ready); await settle(); }
async function slotDigest() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { const rows = await new Promise((resolve, reject) => { const r = db.transaction('save-slots').objectStore('save-slots').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); const row = rows.find(r => (r.metadata ?? r).slotId === 'quick-1'); const metadata = row.metadata ?? row;
      return { bytes: row.byteLength ?? new TextEncoder().encode(row.serializedSessionSave).length, sha256: row.sha256 ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.serializedSessionSave))), b => b.toString(16).padStart(2, '0')).join(''), artifactHash: metadata.sessionArtifactHash, hash: metadata.runtimeStateHash };
    } finally { db.close(); }
  });
}
try {
  await page.goto(fileMode ? pathToFileURL(source).href : `http://127.0.0.1:${server.address().port}/`);
  await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check();
  const font = page.getByLabel('个人字号', { exact: true }); await font.focus(); await font.press('End'); await button('返回故事').click();
  await button('开始故事').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false' && document.querySelector('main')?.dataset.recoveryOperation === 'ready'); await page.evaluate(() => document.fonts.ready);
  await scroll(); const before = await position(); assert.ok(before.first > 0); await shot('before');
  await menu(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await closeMenu(); const saved = await slotDigest();
  await recovery(); const resumed = await position(); assert.equal(resumed.cursor, before.cursor); await shot('after-recovery');
  if (baseline) { assert.equal(resumed.scrollTop, 0); assert.ok(resumed.first < before.first); checks.push({ name: 'reproduced-paragraph-restored-but-reading-point-lost', before, resumed }); }
  else {
    assert.ok(visible(resumed, before.first), 'Recovery must retain the original visible text'); assert.equal(await main.getAttribute('data-auto-playback'), 'off'); assert.equal(await main.getAttribute('data-reading-unread-below'), 'true');
    assert.equal(await page.locator('.player-save-feedback').count(), 0); checks.push({ name: 'recovery-restores-actual-text-anchor', before, resumed });
    for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); const pos = await position(); assert.ok(visible(pos, before.first)); const bounds = await button('从段首重读').boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height && bounds.height >= 44);
      const notice = await page.locator('.player-reading-resume').boundingBox(), paragraph = await page.locator('.player-dialogue').boundingBox(), save = await button('存读档').boundingBox();
      const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.ok(notice && paragraph && save && !overlaps(notice, paragraph) && !overlaps(notice, save), 'Resume notice must not cover the paragraph or save action');
      await shot(`resume-${viewport.width}`); checks.push({ name: 'resume-reflow-and-controls', viewport, position: pos, bounds, notice, paragraph, save });
    }
    await menu(); await button('快进已读').click(); await page.waitForFunction(cursor => document.querySelector('main')?.dataset.historyCursor !== cursor, before.cursor);
    await quickLoad(); const afterLoad = await position(); assert.ok(visible(afterLoad, before.first)); assert.notEqual(afterLoad.hash, saved.hash, 'Previously read progress is merged, not rolled back'); assert.deepEqual(await slotDigest(), saved); checks.push({ name: 'quick-load-original-hash-mark-after-monotonic-meta-merge', afterLoad });
    await page.clock.install(); await menu(); await button('自动播放').click(); await closeMenu(); await page.clock.fastForward(120000);
    assert.equal(await main.getAttribute('data-runtime-state-hash'), afterLoad.hash); assert.equal(await main.getAttribute('data-auto-playback'), 'waiting-reading'); await button('停止自动阅读').click(); checks.push({ name: 'restored-unread-paragraph-holds-auto', controlledClockMs: 120000 }); await page.clock.resume();
    await button('从段首重读').click(); assert.equal((await position()).scrollTop, 0); assert.equal(await main.getAttribute('data-reading-position-restored'), 'false');
    await quickLoad(); assert.equal((await position()).scrollTop, 0); assert.equal(await main.getAttribute('data-reading-position-restored'), 'false');
    await recovery(); assert.equal((await position()).scrollTop, 0); checks.push({ name: 'explicit-head-re-read-survives-reload' });
    await scroll(); await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('world-player.reading-resume.v1:')));
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      for (const k of Object.keys(localStorage)) if (k.startsWith('world-player.reading-resume.v1:')) set.call(localStorage, k, '{broken');
      Storage.prototype.setItem = function(k, v) { if (k.startsWith('world-player.reading-resume.v1:')) throw new DOMException('Injected reading cache quota', 'QuotaExceededError'); return set.call(this, k, v); };
    });
    // Reload immediately after fault injection, before the optional debounce can
    // repair it. Disable only reading-cache writes, never save/recovery IO.
    await page.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith('world-player.reading-resume.v1:')) throw new DOMException('Injected reading cache quota', 'QuotaExceededError'); return set.call(this, k, v); }; });
    await recovery(); assert.equal((await position()).scrollTop, 0); assert.equal(await main.getAttribute('data-reading-position-restored'), 'false'); assert.deepEqual(await slotDigest(), saved); checks.push({ name: 'corrupt-optional-cache-keeps-formal-story-and-quick-slot' });
  }
  assert.deepEqual(errors, []); await writeFile(reportPath, JSON.stringify({ passed: true, label, browser: browser.version(), htmlSha256: sha(html), checks, saved, errors, scope: 'Actual complete 1.10.0 HTML, public controls, native wheel/Range and IndexedDB. Local UI marks only; no fake story states or DOM geometry. Controlled Auto time is a gate test, not natural reading. Desktop engines/phone-sized windows do not prove physical phone/Safari acceptance.' }, null, 2)); console.log(`PASS ${label} actual-work reading resume`);
} catch (error) { await shot('failure'); await writeFile(reportPath, JSON.stringify({ passed: false, label, error: String(error), stack: error.stack, errors, checks }, null, 2)); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

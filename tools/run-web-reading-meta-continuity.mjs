import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline'), engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium'; assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.resolve(root, baseline ? 'evidence/web-manual-save-safety' : process.env.STUDIO_READING_META_SOURCE_DIRECTORY ?? 'evidence/web-reading-meta-continuity');
const output = path.resolve(root, process.env.STUDIO_READING_META_OUTPUT_DIRECTORY ?? 'evidence/web-reading-meta-continuity'), label = `${baseline ? 'baseline-' : ''}${engine}`; await mkdir(output, { recursive: true });
const reportPath = path.join(output, `${label}.json`); try { await access(reportPath); throw Error('Refusing to overwrite a reading-Meta continuity report; choose a new directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip);
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = files[name], headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
});
let browser, current; const checks = [], errors = [];
const button = (p, name) => p.getByRole('button', { name, exact: true }), paragraph = p => button(p, '继续下一句');
const state = p => p.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, length: el.dataset.historyLength, restored: el.dataset.readingPositionRestored, auto: el.dataset.autoPlayback, status: el.dataset.playerStatus }));
const marks = p => p.evaluate(() => { const key = Object.keys(localStorage).find(key => key.startsWith('world-player.reading-resume.v1:')); return key ? JSON.parse(localStorage.getItem(key)).marks : []; });
const geometry = p => paragraph(p).evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, total: el.scrollHeight, text: el.querySelector('.player-dialogue__text')?.textContent }));
const shot = (p, name) => p.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
async function originalSlot(p) { return p.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots', 'readonly'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { const row = get.result.find(row => (row.metadata ?? row).slotId === 'manual-1'); if (!row) throw Error('Manual slot missing'); const m = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); resolve({ projectId: m.projectId, buildId: m.buildId, hash: m.runtimeStateHash, savedAt: m.savedAtEpochMilliseconds, storedSha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }); } catch (error) { reject(error); } }; };
})); }
async function ready(p) { await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false' && document.querySelector('[data-text-ready]')?.dataset.textReady === 'true'); }
async function slots(p) { await button(p, '打开阅读菜单').click(); await button(p, '存读档').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveList === 'ready'); }
async function read(p, title = false) {
  if (title) await button(p, '读取存档').click(); else await slots(p);
  await p.waitForFunction(() => document.querySelector('main')?.dataset.saveList === 'ready'); await button(p, '读取进度').click(); await p.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '读取', exact: true }).click(); if (!title) await button(p, '确认读取').click();
  await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); await ready(p);
}
async function scroll(p, top) {
  await paragraph(p).evaluate((el, top) => { el.scrollTop = top; }, top);
  await p.waitForFunction(() => { const el = document.querySelector('.player-dialogue'); return el && el.scrollTop > 0; });
  await p.waitForFunction(hash => { const key = Object.keys(localStorage).find(key => key.startsWith('world-player.reading-resume.v1:')); return key && JSON.parse(localStorage.getItem(key)).marks.some(mark => mark.runtimeStateHash === hash && !['start'].includes(mark.anchor.kind)); }, (await state(p)).hash);
}
async function scenario(loadedFirst) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, reducedMotion: 'reduce' });
  context.on('page', p => { p.setDefaultTimeout(30000); p.on('pageerror', error => errors.push(String(error))); });
  await context.addInitScript(() => {
    window.observedCollectionEvents = [];
    addEventListener('storage', event => { if (event.key?.startsWith('world-player.collection.v1:')) window.observedCollectionEvents.push({ trusted: event.isTrusted, local: event.storageArea === localStorage, readTexts: event.newValue ? JSON.parse(event.newValue).progress.readTextIds.length : 0 }); });
  });
  const a = await context.newPage(), url = `http://127.0.0.1:${server.address().port}/gal/`; current = a; await a.goto(url);
  await button(a, '打开玩家设置').click(); await a.getByLabel('文字显示', { exact: true }).selectOption('instant'); await a.getByLabel('个人字号', { exact: true }).focus(); await a.getByLabel('个人字号', { exact: true }).press('End'); assert.equal(await a.getByLabel('个人字号', { exact: true }).inputValue(), '140'); await a.getByLabel('静音全部声音', { exact: true }).check(); await button(a, '返回故事').click(); await button(a, '开始故事').click(); await ready(a);
  const initialGeometry = await geometry(a); assert.ok(initialGeometry.total - initialGeometry.height > 200, 'Actual prose must scroll at the chosen user settings');
  await slots(a); await a.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '保存', exact: true }).click(); await a.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button(a, '关闭存读档').click(); const original = await originalSlot(a);
  await scroll(a, 100); if (loadedFirst) { await read(a); await a.waitForFunction(() => document.querySelector('main')?.dataset.readingPositionRestored === 'true'); }
  const before = await state(a), beforeGeometry = await geometry(a), beforeMark = (await marks(a)).find(mark => mark.runtimeStateHash === original.hash); assert.ok(beforeMark);
  const b = await context.newPage(); current = b; await b.goto(url); await read(b, true); await paragraph(b).evaluate(el => { el.scrollTop = el.scrollHeight; }); await b.waitForFunction(() => document.querySelector('main')?.dataset.readingUnreadBelow === 'false');
  await b.waitForFunction(() => { const voice = document.querySelector('audio[data-audio-bus="voice"]'); return !voice || voice.ended; }); const oldCursor = (await state(b)).cursor; await paragraph(b).click(); await b.waitForFunction(cursor => document.querySelector('main')?.dataset.historyCursor !== cursor, oldCursor);
  current = a; await a.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash !== hash, before.hash); const after = await state(a), afterGeometry = await geometry(a), events = await a.evaluate(() => window.observedCollectionEvents);
  assert.ok(events.some(event => event.trusted && event.local)); assert.equal(after.cursor, before.cursor); assert.equal(after.length, before.length); assert.equal(afterGeometry.text, beforeGeometry.text); assert.ok(Math.abs(afterGeometry.top - beforeGeometry.top) <= 2); assert.deepEqual(await originalSlot(a), original);
  if (loadedFirst) {
    assert.equal(after.restored, baseline ? 'false' : 'true'); assert.equal(await button(a, '从段首重读').count(), baseline ? 0 : 1); await shot(a, 'restored-notice-after-native-meta-merge');
    checks.push({ name: baseline ? 'frozen-game-loses-restored-notice-after-native-cross-window-read-merge' : 'native-cross-window-read-merge-keeps-restored-notice-position-and-story', before, after, original, beforeGeometry, afterGeometry, events });
    if (!baseline) {
      const layouts = [];
      for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
        await a.setViewportSize(viewport); const control = button(a, '从段首重读'); assert.equal(await control.isVisible(), true); await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox(); assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= viewport.height + 1); layouts.push({ viewport, box }); await shot(a, `restart-${viewport.width}`);
      }
      await a.setViewportSize({ width: 320, height: 568 }); await button(a, '从段首重读').click(); await a.waitForFunction(() => document.querySelector('.player-dialogue')?.scrollTop === 0); assert.equal((await state(a)).restored, 'false'); assert.equal((await marks(a)).find(mark => mark.runtimeStateHash === original.hash).anchor.kind, 'start'); assert.deepEqual(await originalSlot(a), original); checks.push({ name: 'explicit-restart-updates-the-saved-source-mark-without-writing-a-story-slot', layouts, original, marks: await marks(a) });
      await a.reload(); await read(a, true); assert.equal((await geometry(a)).top, 0); assert.equal((await state(a)).auto, 'off'); assert.deepEqual(await originalSlot(a), original); checks.push({ name: 'reopen-explicit-read-honors-restarted-paragraph-and-retains-the-original-slot', state: await state(a), original });
      const restartedCursor = (await state(a)).cursor; await paragraph(a).click(); await a.waitForFunction(() => document.querySelector('.player-dialogue')?.scrollTop > 0); assert.equal((await state(a)).cursor, restartedCursor); assert.deepEqual(await originalSlot(a), original); checks.push({ name: 'next-after-paragraph-restart-scrolls-unread-prose-instead-of-skipping-the-story', state: await state(a), geometry: await geometry(a), original });
    }
  } else {
    const destination = Math.min(afterGeometry.total - afterGeometry.height - 15, 260); assert.ok(destination > beforeGeometry.top + 80); await scroll(a, destination);
    await a.waitForFunction(hash => { const key = Object.keys(localStorage).find(key => key.startsWith('world-player.reading-resume.v1:')); const marks = key ? JSON.parse(localStorage.getItem(key)).marks : []; const current = marks.find(mark => mark.runtimeStateHash === hash); return current && current.anchor.kind === 'text' && current.anchor.offset > 20; }, (await state(a)).hash);
    const stored = await marks(a), currentMark = stored.find(mark => mark.runtimeStateHash === (after.hash)), savedMark = stored.find(mark => mark.runtimeStateHash === original.hash); assert.ok(currentMark && savedMark && stored.length <= 8); assert.notDeepEqual(currentMark.anchor, beforeMark.anchor);
    if (baseline) assert.notDeepEqual(savedMark.anchor, currentMark.anchor); else assert.deepEqual(savedMark.anchor, currentMark.anchor);
    await shot(a, 'later-position-before-any-explicit-load'); checks.push({ name: baseline ? 'frozen-game-leaves-the-pre-merge-save-mark-behind-the-current-reading-position' : 'later-reading-updates-the-pre-merge-saved-hash-before-any-explicit-load', before, after, original, beforeMark, currentMark, savedMark, marks: stored, events });
    if (!baseline) {
      const top = (await geometry(a)).top; await a.reload(); await read(a, true); const restored = await geometry(a); assert.ok(Math.abs(restored.top - top) < 50, 'Restore the same visible text line'); assert.equal((await state(a)).restored, 'true'); assert.equal((await state(a)).auto, 'off'); assert.deepEqual(await originalSlot(a), original); checks.push({ name: 'reopen-old-saved-hash-restores-the-latest-optional-position-without-changing-the-story', top, restored, original, state: await state(a) });
      await button(a, '知道了').click(); assert.equal(await button(a, '从段首重读').count(), 0); await a.reload(); await read(a, true); assert.equal((await state(a)).restored, 'true'); assert.deepEqual(await originalSlot(a), original); checks.push({ name: 'dismissal-only-hides-the-notice-and-never-erases-the-position-or-original-save', state: await state(a), original });
    }
  }
  await context.close();
}
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) }); await scenario(true); await scenario(false); assert.deepEqual(errors, []);
  await writeFile(reportPath, JSON.stringify({ passed: true, engine, browser: browser.version(), artifacts: { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } }, checks, errors, scope: 'Actual exported website and two real pages: UI-generated save, real long prose at user font settings, browser scrolling, native localStorage storage events from normal reading. Test only observes storage and readonly IndexedDB payload digests; no database/cache writes or event injection. Phone-sized windows and desktop engines, not physical phones/Safari, natural listening, system interruption, rights/public HTTPS or long-soak acceptance.' }, null, 2)); console.log(`PASS ${label} reading-Meta continuity (${checks.length} checks)`);
} catch (error) { if (current && !current.isClosed()) await shot(current, 'failure').catch(() => {}); await writeFile(reportPath, JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors, state: current && !current.isClosed() ? await state(current).catch(() => null) : null }, null, 2)); throw error; }
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

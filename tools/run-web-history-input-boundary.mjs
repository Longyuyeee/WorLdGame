import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.resolve(root, baseline ? 'evidence/web-audio-failure-continuity' : process.env.STUDIO_HISTORY_INPUT_SOURCE_DIRECTORY ?? 'evidence/web-history-input-boundary');
const output = path.resolve(root, process.env.STUDIO_HISTORY_INPUT_OUTPUT_DIRECTORY ?? `evidence/web-history-input-boundary/${baseline ? 'baseline-native' : 'current-browser'}`);
await mkdir(output, { recursive: true });
const report = path.join(output, `${baseline ? 'baseline-' : ''}${engine}.json`);
try { await access(report); throw Error('Refusing to overwrite a history input boundary report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip);
const artifacts = { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } };
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1) || 'index.html', bytes = files[name];
  const headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
});
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
let browser, page; const checks = [], errors = [];
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, text: el.querySelector('.player-dialogue__text')?.textContent, auto: el.dataset.autoPlayback }));
const focus = () => page.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent, inHistory: !!document.activeElement?.closest('.player-history-panel'), tag: document.activeElement?.tagName })) ;
const shot = name => page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled' });
async function slots() { return page.evaluate(() => new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction('save-slots'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => { const bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave), digest = await crypto.subtle.digest('SHA-256', bytes); return { slotId: (row.metadata ?? row).slotId, hash: (row.metadata ?? row).runtimeStateHash, digest: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (e) { reject(e); } }; }; })); }
async function openHistory() { await button('打开阅读菜单').click(); await button('打开剧情历史').click(); await page.getByRole('dialog', { name: '剧情历史', exact: true }).waitFor(); }
try {
  await listenBrowserLoopback(server); browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click(); await button('开始故事').click();
  for (let step = 0; step < 5; step++) { await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button('继续下一句').click(); }
  await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await page.getByRole('dialog', { name: '阅读菜单' }).getByRole('button', { name: '返回故事', exact: true }).click();
  const before = await state(), originalSlots = await slots(); assert.ok(originalSlots.some(row => row.slotId === 'quick-1')); await openHistory(); const trace = [await focus()];
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Shift+Tab'); trace.push(await focus()); if (baseline && trace.at(-1).label === '后退一步') break; }
  if (baseline) {
    assert.ok(trace.some(row => !row.inHistory)); assert.equal(trace.at(-1).label, '后退一步'); await page.keyboard.press('Enter');
    await page.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash !== hash, before.hash); const after = await state();
    assert.notEqual(after.cursor, before.cursor); assert.equal(await page.getByRole('dialog', { name: '剧情历史' }).count(), 1); assert.deepEqual(await slots(), originalSlots);
    checks.push({ name: 'frozen-game-tab-escapes-history-and-background-back-changes-story-with-panel-open', before, after, trace, originalSlots }); await shot('background-back');
  } else {
    assert.ok(trace.every(row => row.inHistory)); const dialog = page.getByRole('dialog', { name: '剧情历史', exact: true }); assert.equal(await dialog.getAttribute('aria-modal'), 'true');
    for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); assert.equal((await focus()).inHistory, true); }
    assert.deepEqual(await state(), before); assert.deepEqual(await slots(), originalSlots); checks.push({ name: 'both-tab-directions-stay-in-history-without-changing-story-or-slots', before, trace, originalSlots });
    const search = page.getByRole('searchbox', { name: '查找已记录的剧情', exact: true }); await search.fill('没有这样的句子'); await page.keyboard.press('Escape'); assert.equal(await search.inputValue(), ''); assert.equal(await dialog.count(), 1); assert.deepEqual(await state(), before);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); assert.equal((await focus()).label, '打开剧情历史'); assert.deepEqual(await state(), before); checks.push({ name: 'escape-clears-query-then-closes-and-restores-visible-desktop-trigger', before });
    const layouts = [];
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport); await openHistory(); assert.equal((await focus()).inHistory, true); await page.keyboard.press('Shift+Tab'); assert.equal((await focus()).inHistory, true);
      const current = await page.evaluate(() => { const el = document.activeElement, r = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label') ?? el.textContent, height: r.height, y: r.y, bottom: r.bottom }; }); assert.ok(current.height >= 44 && current.y >= 0 && current.bottom <= viewport.height + 1); layouts.push({ viewport, current }); await shot(`history-${viewport.width}`); await page.keyboard.press('Escape'); assert.equal((await focus()).label, viewport.width <= 640 || viewport.height <= 480 ? '打开阅读菜单' : '打开剧情历史');
    }
    checks.push({ name: 'portrait-landscape-and-desktop-keyboard-targets-visible-and-return-current-paragraph', layouts, before });
    // Reopen from real reading, search an earlier line and explicitly choose rollback.
    await openHistory(); await search.fill('生活确实忙'); const rollback = page.getByRole('button', { name: /^回退到：/u }); assert.equal(await rollback.count(), 1); await rollback.focus(); await page.keyboard.press('Enter'); await dialog.waitFor({ state: 'detached' });
    const afterRollback = await state(); assert.ok(+afterRollback.cursor < +before.cursor); assert.equal(await button('继续下一句').evaluate(el => el === document.activeElement), true); assert.deepEqual(await slots(), originalSlots); checks.push({ name: 'only-explicit-history-row-rolls-back-and-returns-focus-to-reading', before, afterRollback, originalSlots });
    await page.reload(); await button('读取存档').click(); const saves = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await saves.getByRole('button', { name: '快速', exact: true }).click(); await saves.getByRole('button', { name: '读取', exact: true }).click(); if (await page.locator('.player-load-confirm').isVisible()) await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
    const loaded = await state(); assert.equal(loaded.hash, before.hash); assert.equal(loaded.cursor, before.cursor); assert.equal(loaded.text, before.text); assert.equal(loaded.auto, 'off'); assert.deepEqual(await slots(), originalSlots); checks.push({ name: 'save-reopen-returns-original-progress-after-explicit-history-rollback', before, loaded, originalSlots });
    for (let step = 0; step < 25 && !await page.locator('audio[data-audio-bus="voice"]').count(); step++) { await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button('继续下一句').click(); }
    await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); const voiced = await state(), voicedSlots = await slots();
    await openHistory(); await search.fill(voiced.text); const audition = page.getByRole('button', { name: `重听语音：${voiced.text}`, exact: true }); await audition.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => { const audio = document.querySelector('audio[data-history-voice]'); return audio && !audio.paused && audio.currentTime > 0; });
    const audio = await page.locator('audio[data-history-voice]').evaluate(el => ({ currentTime: el.currentTime, error: el.error?.code ?? null, paused: el.paused, duration: el.duration })); assert.equal(audio.error, null);
    // Filtering the initiating row out must retain access to Stop and the search.
    await search.fill('没有这样的句子'); const dynamicTrace = [];
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); dynamicTrace.push(await focus()); assert.equal(dynamicTrace.at(-1).inHistory, true); if (dynamicTrace.at(-1).label === '停止重听') break; }
    assert.equal(dynamicTrace.at(-1).label, '停止重听'); await page.keyboard.press('Enter'); assert.equal(await search.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape'); assert.equal(await search.inputValue(), ''); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); assert.deepEqual(await state(), voiced); assert.deepEqual(await slots(), voicedSlots);
    checks.push({ name: 'native-keyboard-audition-filter-stop-and-return-retain-story-and-formal-slots', voiced, audio, dynamicTrace, voicedSlots });
  }
  assert.deepEqual(errors, []); await writeFile(report, JSON.stringify({ passed: true, baseline, engine, browser: browser.version(), artifacts, checks, errors, scope: 'Actual unmodified exported website, native keyboard Tab/Shift+Tab/Enter/Escape and UI save/load. Readonly IndexedDB digests; no synthetic input/lifecycle/media events, injected database or story state. Desktop engines and viewport resizing, not screen reader, physical phone/Safari, OS interruptions or natural full reading acceptance.' }, null, 2)); console.log(`PASS ${engine} history input boundary (${checks.length} checks)`);
} catch (error) { if (page && !page.isClosed()) await shot('failure').catch(() => {}); await writeFile(report, JSON.stringify({ passed: false, baseline, engine, artifacts, checks, errors, error: String(error), stack: error.stack, focus: page && !page.isClosed() ? await focus().catch(() => null) : null }, null, 2)); throw error; }
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

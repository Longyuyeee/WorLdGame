import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline'), stream = process.argv.includes('--stream');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium'; assert.ok(['chromium', 'firefox', 'webkit'].includes(engine)); assert.ok(!stream || engine === 'chromium' && !baseline);
const source = path.resolve(root, baseline ? 'evidence/web-backup-envelope' : process.env.STUDIO_HISTORY_READINESS_SOURCE_DIRECTORY ?? 'evidence/web-history-voice-readiness/work');
const output = path.resolve(root, process.env.STUDIO_HISTORY_READINESS_OUTPUT_DIRECTORY ?? 'evidence/web-history-voice-readiness'), label = `${baseline ? 'baseline-' : ''}${engine}${stream ? '-stream' : ''}`;
await mkdir(output, { recursive: true }); const report = path.join(output, `${label}.json`);
try { await access(report); throw Error('Refusing to overwrite a history voice readiness report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip), payload = readGamePayload(Buffer.from(files['index.html']).toString());
const first = Object.values(payload.project.scripts).flatMap(row => row.statements).find(row => row.id === 'stmt_ui_25').text;
const voicePath = payload.mediaAssets.find(row => row.assetId === 'voice_01').url.replace(/^\.\//u, ''), backupFile = path.join(root, 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave'), backupBytes = await readFile(backupFile);
let hold = true; const held = new Map(), requests = [];
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = files[name], headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? ''), start = range ? +range[1] : 0, end = bytes ? Math.min(range?.[2] ? +range[2] : bytes.length - 1, bytes.length - 1) : 0;
  if (!bytes) return res.writeHead(404).end('Missing'); if (start > end) return res.writeHead(416).end();
  const sendHeaders = () => res.writeHead(range ? 206 : 200, { ...headers, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}), 'Content-Length': end - start + 1 });
  if (name === voicePath && hold) {
    if (stream && start < Math.floor(bytes.length / 2)) {
      const partialEnd = Math.min(end, Math.floor(bytes.length / 2) - 1);
      requests.push({ name, start, end: partialEnd, prefixBytes: partialEnd - start + 1, mode: 'completed-prefix-range' });
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${partialEnd}/${bytes.length}`, 'Content-Length': partialEnd - start + 1 }).end(bytes.subarray(start, partialEnd + 1)); return;
    }
    const cutoff = stream ? Math.floor(bytes.length / 2) : start, next = Math.min(end + 1, Math.max(start, cutoff));
    if (stream) { sendHeaders(); if (next > start) res.write(bytes.subarray(start, next)); }
    requests.push({ name, start, end, prefixBytes: next - start, mode: stream ? 'partial-response' : 'pending-response' });
    held.set(res, () => { if (!stream) sendHeaders(); res.end(bytes.subarray(next, end + 1)); }); res.on('close', () => held.delete(res)); return;
  }
  sendHeaders(); res.end(bytes.subarray(start, end + 1));
});
let browser, page; const checks = [], errors = [];
const button = name => page.getByRole('button', { name, exact: true }), panel = () => page.getByRole('region', { name: '历史语音重听', exact: true });
const state = () => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, auto: el.dataset.autoPlayback, host: el.dataset.hostActivity }));
const audio = () => page.locator('audio[data-history-voice]').evaluate(el => ({ paused: el.paused, time: el.currentTime, ready: el.readyState, ended: el.ended, error: el.error?.code ?? null, src: el.getAttribute('src') }));
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
const prefs = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('world-player:preferences:')).map(key => [key, localStorage.getItem(key)])));
async function slots() { return page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots', 'readonly'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => { const m = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slotId: m.slotId, hash: m.runtimeStateHash, savedAt: m.savedAtEpochMilliseconds, storedSha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (error) { reject(error); } }; };
})); }
async function playing() { await page.waitForFunction(() => { const el = document.querySelector('audio[data-history-voice]'); return el && !el.paused && el.currentTime > 0 && !el.error; }); }
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let pw; try { pw = require('playwright'); } catch { pw = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) }); page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    window.historyReadinessEvents = [];
    for (const type of ['play', 'playing', 'waiting', 'stalled', 'pause', 'ended', 'error']) document.addEventListener(type, event => { const el = event.target; if (el instanceof HTMLAudioElement && el.dataset.historyVoice === 'true') window.historyReadinessEvents.push({ type, trusted: event.isTrusted, time: el.currentTime, ready: el.readyState, paused: el.paused, ended: el.ended, error: el.error?.code ?? null, at: performance.now() }); }, true);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/gal/`); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click();
  await button('读取存档').click(); await page.getByRole('dialog', { name: '存读档槽位' }).getByRole('button', { name: '备份', exact: true }).click(); await page.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(backupFile); await button('导入到所选槽位').click(); await button('读取导入的存档').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  await page.locator('audio[data-audio-bus="voice"]').evaluate(el => { window.originalHistoryLiveVoice = el; el.playbackRate = .1; window.originalHistoryMusic = document.querySelector('audio[data-audio-bus="bgm"]'); });
  const before = await state(), saved = await slots(), personal = await prefs();
  await button('打开阅读菜单').click(); await button('自动播放').click(); await button('打开剧情历史').click(); await page.getByLabel('查找已记录的剧情', { exact: true }).fill(first); await button(`重听语音：${first}`).click();
  await page.waitForFunction(() => window.historyReadinessEvents.some(row => row.type === 'play' && row.trusted));
  if (stream) { await playing(); await page.waitForFunction(() => window.historyReadinessEvents.some(row => row.type === 'waiting' && row.trusted && row.time > 0)); }
  if (baseline) {
    await page.evaluate(() => { window.historyReadinessStart = performance.now(); }); await page.waitForFunction(() => performance.now() - window.historyReadinessStart >= 6500);
    const observed = await audio(); assert.equal(observed.error, null); assert.equal(observed.time, 0); assert.equal(observed.paused, false); assert.equal(observed.ready, 0); assert.equal(await button('重试重听').count(), 0); assert.ok((await panel().innerText()).includes('正在重听')); assert.ok(requests.length > 0); assert.equal((await state()).hash, before.hash); assert.deepEqual(await slots(), saved);
    checks.push({ name: 'frozen-native-play-event-clears-the-wait-deadline-before-any-audible-progress', before, observed, requests, events: await page.evaluate(() => window.historyReadinessEvents) }); await shot('false-playing-without-retry');
  } else {
    await button('重试重听').waitFor(); const delayed = await audio(); assert.equal(delayed.error, null); assert.equal(delayed.ended, false); assert.equal(delayed.paused, true); assert.ok(requests.length > 0); if (stream) assert.ok(delayed.time > 0); else assert.equal(delayed.time, 0);
    const owned = await page.evaluate(() => ({ sameVoice: window.originalHistoryLiveVoice === document.querySelector('audio[data-audio-bus="voice"]'), voicePaused: window.originalHistoryLiveVoice.paused, voiceTime: window.originalHistoryLiveVoice.currentTime, sameMusic: window.originalHistoryMusic === document.querySelector('audio[data-audio-bus="bgm"]'), musicPlaying: !window.originalHistoryMusic.paused })); assert.ok(owned.sameVoice && owned.voicePaused && owned.sameMusic && owned.musicPlaying); assert.equal((await state()).hash, before.hash); assert.equal((await state()).auto, 'suspended'); assert.deepEqual(await slots(), saved); assert.deepEqual(await prefs(), personal);
    checks.push({ name: stream ? 'native-midstream-buffering-retains-explicit-retry-without-faking-completion' : 'native-play-before-data-remains-bounded-and-offers-explicit-retry', before, delayed, owned, requests, events: await page.evaluate(() => window.historyReadinessEvents) });
    const layouts = [];
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport); for (const name of ['重试重听', '停止重听']) { await button(name).scrollIntoViewIfNeeded(); const box = await button(name).boundingBox(); assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= viewport.height + 1); layouts.push({ viewport, name, box }); } await shot(`wait-${viewport.width}`);
      const bodyHeight = await page.locator('.player-history-panel-body').evaluate(el => el.clientHeight); assert.ok(bodyHeight >= 96);
      await button(`重听语音：${first}`).scrollIntoViewIfNeeded(); await button(`重听语音：${first}`).click({ trial: true }); const recordBox = await button(`重听语音：${first}`).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }); assert.ok(recordBox.height >= 44 && recordBox.y >= 0 && recordBox.y + recordBox.height <= viewport.height + 1, JSON.stringify({ viewport, recordBox, bodyHeight })); layouts.push({ viewport, name: 'history-record', bodyHeight, box: recordBox }); await shot(`record-${viewport.width}`);
    }
    checks.push({ name: 'waiting-actions-remain-reachable-at-four-reading-sizes', layouts }); await page.setViewportSize({ width: 390, height: 844 });
    hold = false; for (const release of [...held.values()]) release(); await page.evaluate(() => { window.historyLateResponseStart = performance.now(); }); await page.waitForFunction(() => performance.now() - window.historyLateResponseStart >= 1000); assert.equal((await audio()).paused, true); assert.equal(await button('重试重听').count(), 1); assert.equal((await state()).hash, before.hash);
    checks.push({ name: 'late-real-network-response-never-resumes-a-retired-audition', state: await state(), audio: await audio() });
    await button('重试重听').click(); await playing(); await button('暂停重听').click(); const pausedAt = (await audio()).time; await button('继续重听').click(); await playing(); assert.ok((await audio()).time >= pausedAt); await page.waitForFunction(() => window.historyReadinessEvents.some(row => row.type === 'ended' && row.trusted && row.time > 0 && row.error === null)); assert.equal((await state()).hash, before.hash); assert.deepEqual(await slots(), saved); assert.deepEqual(await prefs(), personal);
    checks.push({ name: 'retry-real-source-pause-resume-and-native-end-leave-the-story-and-save-intact', pausedAt, ended: await page.evaluate(() => window.historyReadinessEvents.filter(row => row.type === 'ended')) });
    await button('再次重听').click(); await playing(); await button('停止重听').click(); assert.equal((await audio()).src, null); assert.equal(await panel().count(), 0); assert.equal((await state()).hash, before.hash); assert.deepEqual(await slots(), saved);
    checks.push({ name: 'explicit-stop-releases-the-preview-without-clearing-story-or-slot' });
    await page.getByRole('dialog', { name: '剧情历史' }).getByRole('button', { name: '关闭剧情历史', exact: true }).click(); assert.equal((await state()).hash, before.hash); assert.deepEqual(await slots(), saved); assert.deepEqual(await prefs(), personal); assert.ok(await page.evaluate(() => window.originalHistoryLiveVoice === document.querySelector('audio[data-audio-bus="voice"]'))); await shot('returned-story');
    checks.push({ name: 'close-history-returns-to-the-same-current-reading-without-writing-a-slot', state: await state() });
  }
  assert.deepEqual(errors, []); await writeFile(report, JSON.stringify({ passed: true, baseline, stream, engine, browser: browser.version(), artifacts: { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } }, sourceBackupSha256: sha(backupBytes), checks, errors, scope: 'Actual complete work and same-content backup imported/read through UI, native HTTP pending/partial media responses, trusted playback events and actual media time. No mocked media, clock, narrative, storage or events; readonly slot digests. Muted desktop engines and phone-sized windows, not natural listening, physical phones/Safari/OS interruption, embedded WebKit audio, rights/public HTTPS or long-soak acceptance. Baseline success means reproducing the known failure, not product acceptance.' }, null, 2)); console.log(`PASS ${label} history voice readiness (${checks.length} checks)`);
} catch (error) { if (page && !page.isClosed()) await shot('failure').catch(() => {}); await writeFile(report, JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors, requests, state: page && !page.isClosed() ? await state().catch(() => null) : null, audio: page && !page.isClosed() ? await audio().catch(() => null) : null, observation: page && !page.isClosed() ? await page.evaluate(() => ({ text: document.body.innerText, events: window.historyReadinessEvents, audio: [...document.querySelectorAll('audio')].map(el => ({ bus: el.dataset.audioBus, history: el.dataset.historyVoice, paused: el.paused, time: el.currentTime, ready: el.readyState, error: el.error?.code ?? null })) })).catch(() => null) : null }, null, 2)); throw error; }
finally { await browser?.close(); for (const response of held.keys()) response.destroy(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

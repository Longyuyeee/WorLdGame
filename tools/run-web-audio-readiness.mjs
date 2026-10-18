import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium'; assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const output = path.resolve(root, process.env.STUDIO_AUDIO_READINESS_OUTPUT_DIRECTORY ?? 'evidence/web-audio-readiness');
const source = path.resolve(root, baseline ? 'evidence/web-history-voice' : process.env.STUDIO_AUDIO_READINESS_SOURCE_DIRECTORY ?? 'evidence/web-audio-readiness');
const label = `${baseline ? 'baseline-' : ''}${engine}`, reportPath = path.join(output, `${label}.json`);
await mkdir(output, { recursive: true }); try { await access(reportPath); throw Error('Refusing to overwrite an audio readiness report; use a new output directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), html = await readFile(path.join(source, 'before-rain-stops.html')), files = unzipSync(zip);
const payload = readGamePayload(Buffer.from(files['index.html']).toString()), voicePath = payload.mediaAssets.find(row => row.assetId === 'voice_01').url.replace(/^\.\//u, '');
let holdVoice = true; const held = new Map(), requests = [];
function send(name, requestRange, res) {
  const bytes = files[name], type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' }, range = /^bytes=(\d+)-(\d*)$/u.exec(requestRange ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, { ...headers, ...(bytes ? { 'Content-Length': bytes.length } : {}) }).end(bytes ?? 'Missing');
}
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html';
  if (name === voicePath && holdVoice) { requests.push({ name, range: req.headers.range ?? null }); held.set(res, { name, range: req.headers.range }); res.on('close', () => held.delete(res)); return; }
  send(name, req.headers.range, res);
});
let browser, page; const checks = [], errors = [];
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, auto: el.dataset.autoPlayback, text: el.querySelector('.player-dialogue__text')?.textContent }));
const sound = () => page.locator('audio[data-audio-bus="voice"]').evaluate(el => ({ paused: el.paused, time: el.currentTime, readyState: el.readyState, error: el.error?.code ?? null, transport: el.dataset.playerPlayback }));
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
const preferences = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('world-player:preferences:')).map(key => [key, localStorage.getItem(key)])));
async function slots() { return page.evaluate(() => new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots', 'readonly'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => { const metadata = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slotId: metadata.slotId, hash: metadata.runtimeStateHash, savedAt: metadata.savedAtEpochMilliseconds, bytes: bytes.byteLength, storedSha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (error) { reject(error); } }; }; })); }
async function quickLoad() {
  await page.reload(); await button('读取存档').click(); const panel = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '快速', exact: true }).click(); await panel.getByRole('button', { name: '读取', exact: true }).click(); if (await page.locator('.player-load-confirm').isVisible()) await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
}
const playingVoice = () => page.waitForFunction(() => { const voice = document.querySelector('audio[data-audio-bus="voice"]'); return voice && !voice.paused && voice.currentTime > 0 && !voice.error; });
const owned = () => page.evaluate(() => ({ sameMusic: window.readinessMusic === document.querySelector('audio[data-audio-bus="bgm"]'), musicPlaying: !window.readinessMusic.paused, musicTime: window.readinessMusic.currentTime, sameVoice: window.readinessVoice === document.querySelector('audio[data-audio-bus="voice"]'), oldSource: window.readinessVoice.getAttribute('src') }));
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) }); page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => { window.readinessEnds = []; document.addEventListener('ended', event => { const audio = event.target; if (audio instanceof HTMLAudioElement && audio.dataset.audioBus === 'voice') window.readinessEnds.push({ trusted: event.isTrusted, time: audio.currentTime, duration: audio.duration }); }, true); });
  await page.goto(`http://127.0.0.1:${server.address().port}/gal/`); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click(); await button('开始故事').click();
  for (let index = 0; index < 40 && !await page.locator('audio[data-audio-bus="voice"]').count(); index++) { await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button('继续下一句').click(); }
  await page.locator('audio[data-audio-bus="voice"]').waitFor({ state: 'attached' }); await page.waitForFunction(() => { const music = document.querySelector('audio[data-audio-bus="bgm"]'); return music && !music.paused && music.currentTime > 0; });
  await page.evaluate(() => { window.readinessVoice = document.querySelector('audio[data-audio-bus="voice"]'); window.readinessMusic = document.querySelector('audio[data-audio-bus="bgm"]'); window.readinessStarted = performance.now(); });
  const before = await state(); let saved, personal;
  if (!baseline) { await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('返回故事').click(); saved = await slots(); personal = await preferences(); assert.ok(saved.length > 0); }
  await button('打开阅读菜单').click(); await button('自动播放').click(); await button('返回故事').click();
  if (baseline) {
    await page.waitForFunction(() => performance.now() - window.readinessStarted >= 9000);
    const observation = await sound(); assert.ok(requests.length > 0); assert.equal(observation.error, null); assert.equal(observation.readyState, 0); assert.equal(observation.time, 0); assert.equal((await state()).hash, before.hash); assert.equal((await state()).auto, 'waiting-voice'); assert.equal(await button('查看媒体问题').count(), 0);
    checks.push({ name: 'native-unfinished-voice-request-has-no-error-no-progress-and-no-actionable-wait-feedback', before, after: await state(), observation, requests }); await shot('unexplained-wait');
  } else {
    await button('查看媒体问题').waitFor(); await page.waitForFunction(() => document.querySelector('main')?.dataset.autoPlayback === 'stopped'); assert.equal((await state()).hash, before.hash); const observation = await sound(), ownership = await owned(); assert.equal(observation.error, null); assert.equal(observation.readyState, 0); assert.equal(observation.time, 0); assert.ok(ownership.sameMusic && ownership.musicPlaying && ownership.sameVoice); assert.ok(requests.length > 0); assert.deepEqual(await slots(), saved); assert.deepEqual(await preferences(), personal);
    checks.push({ name: 'native-unfinished-request-offers-wait-feedback-stops-auto-without-rewriting-real-slots-or-personal-volume', before, observation, ownership, requests, saved });
    await button('查看媒体问题').click(); await page.getByText(/声音准备时间较长/u).waitFor(); const layouts = [];
    for (const viewport of [{ width: 320, height: 740 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport); const controls = [];
      for (const name of ['重试未就绪声音', '本次先无声阅读']) { const control = button(name); await control.scrollIntoViewIfNeeded(); const geometry = await control.evaluate(el => { const rect = el.getBoundingClientRect(); return { height: rect.height, inViewport: rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1 }; }); assert.ok(geometry.inViewport && geometry.height >= 44); controls.push({ name, ...geometry }); }
      layouts.push({ viewport, controls }); await shot(`wait-${viewport.width}`);
    }
    checks.push({ name: 'wait-details-and-explicit-actions-are-reachable-at-four-viewports', layouts }); await page.setViewportSize({ width: 390, height: 844 });
    holdVoice = false; await button('重试未就绪声音').click(); await playingVoice(); const retry = await owned(); assert.ok(retry.sameMusic && retry.musicPlaying && !retry.sameVoice); assert.equal(retry.oldSource, null); assert.equal((await state()).hash, before.hash); assert.equal((await state()).auto, 'stopped'); assert.deepEqual(await slots(), saved); assert.deepEqual(await preferences(), personal);
    await page.waitForFunction(() => window.readinessEnds.some(row => row.trusted && row.time > 0 && row.duration > 0)); checks.push({ name: 'explicit-retry-replaces-only-the-pending-voice-keeps-healthy-music-and-reaches-native-ended', retry, ended: await page.evaluate(() => window.readinessEnds) });
    holdVoice = true; await quickLoad(); assert.equal((await state()).hash, before.hash); await button('打开阅读菜单').click(); await button('自动播放').click(); await button('返回故事').click(); await button('查看媒体问题').waitFor(); await page.waitForFunction(() => document.querySelector('main')?.dataset.autoPlayback === 'stopped');
    holdVoice = false; for (const [response, request] of held) send(request.name, request.range, response); await playingVoice(); await page.waitForFunction(() => !document.querySelector('.player-media-problem-trigger')); assert.equal((await state()).hash, before.hash); assert.equal((await state()).auto, 'stopped'); assert.deepEqual(await slots(), saved);
    checks.push({ name: 'late-real-http-response-clears-wait-without-automatic-page-turn-or-resuming-auto', after: await state(), native: await sound() });
    holdVoice = true; await quickLoad(); await button('查看媒体问题').waitFor(); const silentBefore = await state(); await button('查看媒体问题').click(); await button('本次先无声阅读').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.audioMode === 'silent' && document.querySelectorAll('audio[data-audio-bus]').length === 0); assert.equal((await state()).hash, silentBefore.hash); assert.deepEqual(await slots(), saved); assert.deepEqual(await preferences(), personal); await shot('silent-same-paragraph');
    await button('继续下一句').click(); await page.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash !== hash, silentBefore.hash); checks.push({ name: 'explicit-silent-reading-releases-pending-audio-retains-volume-and-formal-slot-and-can-continue-manually', before: silentBefore, after: await state() });
    holdVoice = false; await quickLoad(); await playingVoice(); assert.equal((await state()).hash, before.hash); assert.deepEqual(await slots(), saved); assert.deepEqual(await preferences(), personal); assert.equal(await page.locator('main').getAttribute('data-audio-mode'), 'enabled'); checks.push({ name: 'validated-reload-retains-original-progress-and-restores-default-sound-session-not-permanent-silence' }); await shot('reloaded-sound');
  }
  assert.deepEqual(errors, []); await writeFile(reportPath, JSON.stringify({ passed: true, engine, browser: browser.version(), artifacts: { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } }, checks, errors, scope: 'Actual unchanged story and native HTTP media request held by the local server. No fake audio, error/ended events or narrative state. Output muted. Not decode compatibility, natural listening/timing, physical devices, OS interruption, public HTTPS or permissions approval.' }, null, 2)); console.log(`PASS ${label} audio readiness`);
} catch (error) { if (page && !page.isClosed()) await shot('failure').catch(() => {}); await writeFile(reportPath, JSON.stringify({ passed: false, checks, errors, error: String(error), stack: error.stack, state: page && !page.isClosed() ? await state().catch(() => null) : null, sound: page && !page.isClosed() ? await sound().catch(() => null) : null }, null, 2)); throw error; }
finally { await browser?.close(); for (const response of held.keys()) response.destroy(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

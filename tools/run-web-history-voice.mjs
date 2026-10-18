import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_HISTORY_VOICE_OUTPUT_DIRECTORY ?? 'evidence/web-history-voice');
const baseline = process.argv.includes('--baseline'), fileMode = process.argv.includes('--file');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium'; assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.resolve(root, baseline ? 'evidence/web-progress-recovery' : process.env.STUDIO_HISTORY_VOICE_SOURCE_DIRECTORY ?? 'evidence/web-history-voice');
const label = `${baseline ? 'baseline-' : ''}${engine}${fileMode ? '-file' : '-website'}`, reportPath = path.join(output, `${label}.json`);
await mkdir(output, { recursive: true }); try { await access(reportPath); throw Error('Refusing to overwrite a history voice report; use a new output directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), website = unzipSync(zip), payload = readGamePayload(html.toString()), media = payload.mediaAssets;
const first = Object.values(payload.project.scripts).flatMap(script => script.statements).find(row => row.id === 'stmt_ui_25').text;
const second = Object.values(payload.project.scripts).flatMap(script => script.statements).find(row => row.id === 'stmt_ui_51').text;
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = website[name], type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream', headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
});
let browser, page; const errors = [], checks = [];
const button = name => page.getByRole('button', { name, exact: true });
const snapshot = () => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, auto: el.dataset.autoPlayback, host: el.dataset.hostActivity, text: el.querySelector('.player-dialogue__text')?.textContent }));
const audition = () => page.locator('audio[data-history-voice]');
const history = () => page.getByRole('dialog', { name: '剧情历史', exact: true });
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
async function openHistory() { await button('打开阅读菜单').click(); await button('打开剧情历史').click(); await history().getByLabel('查找已记录的剧情', { exact: true }).fill(first); }
async function slots() { return page.evaluate(() => new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction('save-slots', 'readonly'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => { const meta = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slotId: meta.slotId, hash: meta.runtimeStateHash, artifactHash: meta.sessionArtifactHash, savedAt: meta.savedAtEpochMilliseconds, bytes: bytes.byteLength, storedSha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (error) { reject(error); } }; }; })); }
async function playing() { await page.waitForFunction(() => { const audio = document.querySelector('audio[data-history-voice]'); return audio && !audio.paused && audio.currentTime > 0 && !audio.error; }); }
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) }); page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => { window.historyVoiceEnds = []; document.addEventListener('ended', event => { const audio = event.target; if (audio instanceof HTMLAudioElement && audio.dataset.historyVoice === 'true') window.historyVoiceEnds.push({ trusted: event.isTrusted, time: audio.currentTime, duration: audio.duration, src: audio.src }); }, true); });
  const url = fileMode ? pathToFileURL(path.join(source, 'before-rain-stops.html')).href : `http://127.0.0.1:${server.address().port}/gal/`;
  await page.goto(url); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click(); await button('开始故事').click();
  for (let i = 0; i < 100 && (await snapshot()).text !== second; i++) { await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); const voice = page.locator('audio[data-audio-bus="voice"]'); if (await voice.count()) await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); await button('继续下一句').click(); }
  assert.equal((await snapshot()).text, second);
  await page.locator('audio[data-audio-bus="voice"]').evaluate(audio => { window.liveHistoryVoice = audio; audio.playbackRate = .2; window.liveHistoryMusic = document.querySelector('audio[data-audio-bus="bgm"]'); });
  await page.waitForFunction(() => window.liveHistoryVoice.currentTime > 0 && !window.liveHistoryVoice.paused);
  const before = await snapshot(); await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('返回故事').click(); const saved = await slots();
  await openHistory(); assert.equal((await snapshot()).hash, before.hash);
  if (baseline) { assert.equal(await button(`重听语音：${first}`).count(), 0); assert.equal(await history().getByRole('button', { name: `回退到：${first}`, exact: true }).count(), 1); checks.push({ name: 'original-game-can-find-the-past-line-but-only-offers-story-rollback', before, first }); await shot('missing-audition'); }
  else {
    await button(`重听语音：${first}`).tap(); await playing();
    const firstSource = fileMode ? media.find(row => row.assetId === 'voice_01').url : new URL(readGamePayload(Buffer.from(website['index.html']).toString()).mediaAssets.find(row => row.assetId === 'voice_01').url, url).href;
    assert.equal(await audition().evaluate(audio => audio.src), firstSource);
    const owned = await page.evaluate(() => ({ currentPaused: window.liveHistoryVoice.paused, currentTime: window.liveHistoryVoice.currentTime, sameVoice: window.liveHistoryVoice === document.querySelector('audio[data-audio-bus="voice"]'), sameMusic: window.liveHistoryMusic === document.querySelector('audio[data-audio-bus="bgm"]'), musicPlaying: !window.liveHistoryMusic.paused, muted: document.querySelector('audio[data-history-voice]').muted }));
    assert.ok(owned.currentPaused && owned.sameVoice && owned.sameMusic && owned.musicPlaying && owned.muted); assert.equal((await snapshot()).hash, before.hash); assert.deepEqual(await slots(), saved);
    checks.push({ name: 'past-voice-audition-owns-only-temporary-sound-not-story-music-or-slots', before, owned, saved });
    await button('暂停重听').click(); const pausedAt = await audition().evaluate(audio => audio.currentTime); await button('继续重听').click(); await playing(); assert.ok(await audition().evaluate(audio => audio.currentTime) >= pausedAt);
    await page.waitForFunction(() => document.querySelector('audio[data-history-voice]')?.ended);
    await page.waitForFunction(() => window.historyVoiceEnds.some(row => row.trusted && row.time > 0 && row.duration > 0));
    const ended = await page.evaluate(() => window.historyVoiceEnds); assert.ok(ended.some(row => row.trusted && row.time > 0 && row.duration > 0));
    assert.equal((await snapshot()).hash, before.hash); checks.push({ name: 'explicit-pause-resume-and-native-ended-do-not-complete-the-current-story-voice', pausedAt, ended });
    const layouts = [];
    for (const viewport of [{ width: 320, height: 740 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport); const control = button('再次重听'); await control.scrollIntoViewIfNeeded(); const geometry = await control.evaluate(el => { const r = el.getBoundingClientRect(); return { height: r.height, inViewport: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 }; }); assert.ok(geometry.height >= 44 && geometry.inViewport);
      const paneHeight = await page.locator('.player-history-panel-body').evaluate(el => el.clientHeight); assert.ok(paneHeight >= 96, 'Audition must not squeeze the history list into an unusable strip');
      await button(`重听语音：${first}`).scrollIntoViewIfNeeded(); const recordControl = await button(`重听语音：${first}`).evaluate(el => { const r = el.getBoundingClientRect(); return { height: r.height, inViewport: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 }; }); assert.ok(recordControl.height >= 44 && recordControl.inViewport);
      layouts.push({ viewport, geometry, paneHeight, recordControl }); await shot(`history-${viewport.width}`);
    }
    checks.push({ name: 'audition-controls-remain-readable-and-reachable-in-four-viewports', layouts });
    await page.setViewportSize({ width: 390, height: 844 }); await button('再次重听').click(); await playing(); await audition().evaluate(audio => { audio.src = 'data:audio/wav;base64,AA=='; audio.load(); });
    await page.getByRole('region', { name: '历史语音重听' }).getByText('这句语音暂时无法播放，可重试或继续回看。', { exact: false }).waitFor(); assert.equal((await snapshot()).hash, before.hash); await button('重试重听').click(); await playing();
    checks.push({ name: 'native-preview-decode-error-is-local-and-explicit-retry-uses-the-recorded-source', sameStory: (await snapshot()).hash === before.hash, nativeErrorEventInjected: false });
    const preview = await audition().elementHandle(); await history().getByRole('button', { name: '关闭剧情历史', exact: true }).click(); await page.waitForFunction(() => !window.liveHistoryVoice.paused);
    assert.equal(await preview.getAttribute('src'), null); const returned = await page.evaluate(() => ({ currentTime: window.liveHistoryVoice.currentTime, sameVoice: window.liveHistoryVoice === document.querySelector('audio[data-audio-bus="voice"]'), sameMusic: window.liveHistoryMusic === document.querySelector('audio[data-audio-bus="bgm"]') })); assert.ok(returned.sameVoice && returned.sameMusic && returned.currentTime >= owned.currentTime); assert.equal((await snapshot()).hash, before.hash); assert.deepEqual(await slots(), saved);
    checks.push({ name: 'closing-history-releases-the-preview-and-resumes-the-same-current-voice-position', returned });
    await page.reload(); await button('读取存档').click(); const panel = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '快速', exact: true }).click(); await panel.getByRole('button', { name: '读取', exact: true }).click(); if (await page.locator('.player-load-confirm').isVisible()) await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
    await openHistory(); await button(`重听语音：${first}`).click(); await playing(); assert.equal((await snapshot()).hash, before.hash); assert.deepEqual(await slots(), saved); checks.push({ name: 'validated-reload-reconstructs-the-past-voice-from-committed-history-without-rewriting-the-slot' });
    await shot('reopened-past-voice');
  }
  assert.deepEqual(errors, []); await writeFile(reportPath, JSON.stringify({ passed: true, engine, browser: browser.version(), fileMode, artifacts: { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } }, checks, errors, scope: baseline ? 'Frozen #400 actual game: past voice line found through visible history, only rollback offered. No current acceptance claim.' : 'Actual unchanged 1.11 story in exported game; real voice playback/ended/error, real IndexedDB payload digests, native history actions and viewport checks. Current story voice slowed to 0.2 for ownership checks, audition at natural speed, all output muted. No synthetic media/narrative events or geometry. Desktop engines/phone-sized windows are not natural listening/timing, physical phone/Safari/background/lock, rights, public HTTPS or long soak.' }, null, 2)); console.log(`PASS ${label} history voice`);
} catch (error) { if (page && !page.isClosed()) await shot('failure').catch(() => {}); await writeFile(reportPath, JSON.stringify({ passed: false, checks, errors, error: String(error), stack: error.stack, state: page && !page.isClosed() ? await snapshot().catch(() => null) : null, audioObservation: page && !page.isClosed() ? await page.evaluate(() => ({ ended: window.historyVoiceEnds, audio: [...document.querySelectorAll('audio')].map(audio => ({ bus: audio.dataset.audioBus, history: audio.dataset.historyVoice, paused: audio.paused, ended: audio.ended, time: audio.currentTime, duration: audio.duration, error: audio.error?.code ?? null })) })).catch(() => null) : null }, null, 2)); throw error; }
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

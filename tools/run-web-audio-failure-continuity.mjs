import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline'), freeze = process.argv.includes('--freeze');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium'; assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
assert.ok(!freeze || engine === 'chromium' && !baseline);
const source = path.resolve(root, baseline ? 'evidence/web-history-voice-readiness' : process.env.STUDIO_AUDIO_FAILURE_SOURCE_DIRECTORY ?? 'evidence/web-audio-failure-continuity/final-work');
const output = path.resolve(root, process.env.STUDIO_AUDIO_FAILURE_OUTPUT_DIRECTORY ?? 'evidence/web-audio-failure-continuity'), label = `${baseline ? 'baseline-' : ''}${engine}${freeze ? '-freeze' : ''}`;
await mkdir(output, { recursive: true }); const report = path.join(output, `${label}.json`);
try { await access(report); throw Error('Refusing to overwrite an audio failure continuity report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip), payload = readGamePayload(Buffer.from(files['index.html']).toString());
const first = Object.values(payload.project.scripts).flatMap(row => row.statements).find(row => row.id === 'stmt_ui_25').text;
const voicePath = payload.mediaAssets.find(row => row.assetId === 'voice_01').url.replace(/^\.\//u, ''), backupFile = path.join(root, 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave'), backupBytes = await readFile(backupFile);
let corrupt = true; const requests = [], server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', original = files[name];
  if (!original) return res.writeHead(404).end('Missing');
  const bytes = name === voicePath && corrupt ? Buffer.from('not-WAV') : original;
  if (name === voicePath) requests.push({ corrupt, bytes: bytes.length });
  const headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? ''), start = range ? +range[1] : 0, end = Math.min(range?.[2] ? +range[2] : bytes.length - 1, bytes.length - 1);
  if (start > end) return res.writeHead(416).end();
  res.writeHead(range ? 206 : 200, { ...headers, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}), 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1));
});
let browser, page; const checks = [], errors = [];
const button = name => page.getByRole('button', { name, exact: true }), voice = () => page.locator('audio[data-audio-bus="voice"]');
const state = () => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, auto: el.dataset.autoPlayback, host: el.dataset.hostActivity }));
const audio = () => voice().evaluate(el => ({ paused: el.paused, time: el.currentTime, error: el.error?.code ?? null, transport: el.dataset.playerPlayback, failed: el.dataset.voiceFailed, completed: el.dataset.voiceCompleted }));
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
const prefs = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('world-player:preferences:')).map(key => [key, localStorage.getItem(key)])));
async function slots() { return page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots', 'readonly'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => { const m = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slotId: m.slotId, hash: m.runtimeStateHash, savedAt: m.savedAtEpochMilliseconds, storedSha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (error) { reject(error); } }; };
})); }
async function invariants(before, saved, personal) { assert.equal((await state()).hash, before.hash); assert.deepEqual(await slots(), saved); assert.deepEqual(await prefs(), personal); }
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let pw; try { pw = require('playwright'); } catch { pw = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) }); page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => { window.failureContinuityEvents = []; window.failureLifecycleEvents = []; for (const type of ['freeze', 'resume']) document.addEventListener(type, event => window.failureLifecycleEvents.push({ type, trusted: event.isTrusted }), true); for (const type of ['play', 'playing', 'pause', 'ended', 'error']) document.addEventListener(type, event => { const el = event.target; if (el instanceof HTMLAudioElement) window.failureContinuityEvents.push({ type, bus: el.dataset.audioBus, history: el.dataset.historyVoice, trusted: event.isTrusted, time: el.currentTime, error: el.error?.code ?? null }); }, true); });
  await page.goto(`http://127.0.0.1:${server.address().port}/gal/`); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click();
  await button('读取存档').click(); await page.getByRole('dialog', { name: '存读档槽位' }).getByRole('button', { name: '备份', exact: true }).click(); await page.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(backupFile); await button('导入到所选槽位').click(); await button('读取导入的存档').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
  await button('查看媒体问题').waitFor(); await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.error?.code === 4); await voice().evaluate(el => { window.failedOriginalVoice = el; window.failureOriginalMusic = document.querySelector('audio[data-audio-bus="bgm"]'); });
  const before = await state(), saved = await slots(), personal = await prefs(); assert.ok(await page.evaluate(() => window.failureContinuityEvents.some(row => row.type === 'error' && row.bus === 'voice' && row.trusted && row.error === 4)));
  checks.push({ name: 'real-corrupt-http-voice-produces-a-native-local-failure', before, audio: await audio(), requests: [...requests] });
  if (freeze) {
    await page.evaluate(() => { window.failureHostTransitions = []; window.failureHostObserver = new MutationObserver(rows => window.failureHostTransitions.push(...rows.map(row => row.oldValue))); window.failureHostObserver.observe(document.querySelector('main'), { attributes: true, attributeFilter: ['data-host-activity'], attributeOldValue: true }); });
    const client = await page.context().newCDPSession(page); await client.send('Page.setWebLifecycleState', { state: 'frozen' }); await client.send('Page.setWebLifecycleState', { state: 'active' }); await client.detach();
    await page.waitForFunction(() => window.failureLifecycleEvents.some(row => row.type === 'freeze' && row.trusted) && window.failureLifecycleEvents.some(row => row.type === 'resume' && row.trusted) && window.failureHostTransitions.includes('suspended') && document.querySelector('main')?.dataset.hostActivity === 'active');
    await button('查看媒体问题').waitFor(); assert.equal((await audio()).transport, 'error'); await invariants(before, saved, personal);
    checks.push({ name: 'native-chromium-freeze-resume-retains-the-same-failure-and-explicit-retry', lifecycle: await page.evaluate(() => ({ events: window.failureLifecycleEvents, transitions: window.failureHostTransitions })), audio: await audio() }); await page.evaluate(() => window.failureHostObserver.disconnect());
  }
  corrupt = false;
  await button('打开阅读菜单').click(); await button('打开剧情历史').click(); await page.getByLabel('查找已记录的剧情', { exact: true }).fill(first); await button(`重听语音：${first}`).click();
  await page.waitForFunction(() => { const el = document.querySelector('audio[data-history-voice]'); return el && !el.paused && el.currentTime > 0 && !el.error; });
  await page.getByRole('dialog', { name: '剧情历史' }).getByRole('button', { name: '关闭剧情历史', exact: true }).click(); await invariants(before, saved, personal);
  if (baseline) {
    assert.equal(await button('查看媒体问题').count(), 0); assert.equal((await audio()).error, 4); assert.equal((await audio()).transport, 'paused-by-policy');
    checks.push({ name: 'frozen-history-audition-erases-live-failure-and-retry-despite-native-error-remaining', audio: await audio() }); await shot('lost-failure-retry');
  } else {
    await button('查看媒体问题').waitFor(); assert.equal((await audio()).transport, 'error'); assert.equal((await audio()).failed, 'true'); assert.ok(await page.evaluate(() => window.failedOriginalVoice === document.querySelector('audio[data-audio-bus="voice"]') && window.failureOriginalMusic === document.querySelector('audio[data-audio-bus="bgm"]') && !window.failureOriginalMusic.paused));
    checks.push({ name: 'return-from-history-retains-live-failure-and-the-original-healthy-music', audio: await audio() });
    const layouts = [];
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport); await button('查看媒体问题').click();
      for (const name of ['重试媒体', '本次先无声阅读']) { await button(name).scrollIntoViewIfNeeded(); await button(name).click({ trial: true }); const box = await button(name).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }); assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= viewport.height + 1); layouts.push({ viewport, name, box }); }
      await shot(`recovery-${viewport.width}`); await button('返回故事').click();
    }
    checks.push({ name: 'retry-and-silent-reading-remain-reachable-at-four-sizes', layouts }); await page.setViewportSize({ width: 390, height: 844 });
    await button('查看媒体问题').click(); await button('重试媒体').click(); await page.waitForFunction(() => { const el = document.querySelector('audio[data-audio-bus="voice"]'); return el !== window.failedOriginalVoice && !el.paused && el.currentTime > 0 && !el.error; });
    assert.equal(await page.evaluate(() => window.failedOriginalVoice.getAttribute('src')), null); assert.ok(await page.evaluate(() => window.failureOriginalMusic === document.querySelector('audio[data-audio-bus="bgm"]') && !window.failureOriginalMusic.paused)); await invariants(before, saved, personal);
    checks.push({ name: 'explicit-retry-replaces-only-the-failed-owner-and-plays-the-original-complete-source', audio: await audio(), requests: [...requests] });
    await voice().evaluate(el => el.pause()); await button('恢复声音').waitFor(); const pausedAt = (await audio()).time; await button('恢复声音').click(); await page.waitForFunction(() => { const el = document.querySelector('audio[data-audio-bus="voice"]'); return !el.paused && el.currentTime > 0; }); assert.ok((await audio()).time >= pausedAt); await invariants(before, saved, personal);
    checks.push({ name: 'subsequent-native-pause-and-explicit-resume-retain-current-voice-position', pausedAt });
    await page.waitForFunction(() => { const el = document.querySelector('audio[data-audio-bus="voice"]'); return el.ended && el.dataset.voiceCompleted === 'true'; }); await invariants(before, saved, personal); assert.equal(await button('查看媒体问题').count(), 0); await shot('recovered-current-story');
    checks.push({ name: 'actual-recovered-voice-completes-without-replaying-history-or-writing-a-slot', audio: await audio() });
  }
  assert.deepEqual(errors, []); await writeFile(report, JSON.stringify({ passed: true, baseline, engine, browser: browser.version(), artifacts: { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } }, sourceBackupSha256: sha(backupBytes), checks, events: await page.evaluate(() => window.failureContinuityEvents), errors, scope: 'Actual complete work and original same-content backup through UI; native decode error caused by a corrupt HTTP response, then real history audition and explicit retry of original complete bytes. No synthetic media, clock, story or storage events. Native pause() is application instrumentation, not OS interruption. Muted desktop engines/phone-sized windows do not prove natural listening, physical phones/Safari, OS background/lock/BFCache, rights/public HTTPS or long soak. Baseline success reproduces the old failure, not product acceptance.' }, null, 2)); console.log(`PASS ${label} audio failure continuity (${checks.length} checks)`);
} catch (error) { if (page && !page.isClosed()) await shot('failure').catch(() => {}); await writeFile(report, JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors, requests, state: page && !page.isClosed() ? await state().catch(() => null) : null, audio: page && !page.isClosed() ? await audio().catch(() => null) : null, observation: page && !page.isClosed() ? await page.evaluate(() => ({ text: document.body.innerText, events: window.failureContinuityEvents })).catch(() => null) : null }, null, 2)); throw error; }
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

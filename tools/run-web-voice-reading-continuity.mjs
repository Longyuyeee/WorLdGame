import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-voice-reading-continuity');
const baseline = process.argv.includes('--baseline'), file = process.argv.includes('--file'), websiteMode = process.argv.includes('--website'), inlineFallback = process.argv.includes('--inline-fallback'), engine = process.argv.find(x => x.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.join(output, baseline ? 'baseline-work' : process.argv.includes('--published') ? '' : 'work', 'before-rain-stops.html'), html = await readFile(source), label = baseline ? 'baseline' : engine + (file ? '-file' : websiteMode ? '-website' : inlineFallback ? '-inline-fallback' : '');
const websiteBytes = websiteMode ? await readFile(path.join(path.dirname(source), 'before-rain-stops-website.zip')) : null, website = websiteBytes ? unzipSync(websiteBytes) : null;
await mkdir(output, { recursive: true }); const report = path.join(output, label + '.json'); await writeFile(report, JSON.stringify({ passed: false, status: 'running' }));
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const server = createServer((req, res) => {
  if (!website) return res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html);
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = website[name];
  const headers = { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json', '.webmanifest': 'application/manifest+json' })[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' };
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
}); await listenBrowserLoopback(server);
const browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const url = file ? pathToFileURL(source).href : `http://127.0.0.1:${server.address().port}/${website ? 'gal/' : ''}`, checks = [], errors = []; let current;
const button = (p, name) => p.getByRole('button', { name, exact: true });
const settle = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const shot = (p, name) => p.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
async function menu(p) { if (!await p.getByRole('dialog', { name: '阅读菜单', exact: true }).isVisible()) await button(p, '打开阅读菜单').click(); }
async function closeMenu(p) { if (await p.getByRole('dialog', { name: '阅读菜单', exact: true }).isVisible()) await button(p, '返回故事').click(); }
const voice = p => p.locator('audio[data-audio-bus="voice"]');
const hash = p => p.locator('main').getAttribute('data-runtime-state-hash');
async function atVoice(held = false) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(({ held }) => {
    const play = HTMLMediaElement.prototype.play; window.voiceMode = held ? 'held' : 'native'; window.lateVoicePlays = 0;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.audioBus === 'voice') {
        this.playbackRate = .5;
        if (window.voiceMode === 'held') return new Promise((resolve, reject) => {
          window.releaseVoice = () => { this.addEventListener('play', () => window.lateVoicePlays++, { once: true }); play.call(this).then(resolve, reject); };
        });
      }
      return play.call(this);
    };
  }, { held });
  const p = await ctx.newPage(); current = p; p.on('pageerror', e => errors.push(String(e))); p.setDefaultTimeout(30000); await p.goto(url);
  await button(p, '打开玩家设置').click(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await p.getByLabel('静音全部声音', { exact: true }).check(); await button(p, '返回故事').click(); await button(p, '开始故事').click();
  for (let i = 0; i < 30 && !await voice(p).count(); i++) { await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button(p, '继续下一句').click(); }
  await voice(p).waitFor({ state: 'attached' }); await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  if (held) await p.waitForFunction(() => typeof window.releaseVoice === 'function');
  else if (!inlineFallback) await p.waitForFunction(() => { const v = document.querySelector('audio[data-audio-bus="voice"]'); return v && !v.paused && v.currentTime > 0; });
  return { p, ctx };
}
async function slot(p) {
  return p.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { const rows = await new Promise((resolve, reject) => { const r = db.transaction('save-slots').objectStore('save-slots').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); const r = rows.find(row => (row.metadata ?? row).slotId === 'quick-1'), m = r.metadata ?? r; return { bytes: r.byteLength ?? new TextEncoder().encode(r.serializedSessionSave).length, sha256: r.sha256 ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.serializedSessionSave))), x => x.toString(16).padStart(2, '0')).join(''), artifactHash: m.sessionArtifactHash, hash: m.runtimeStateHash }; } finally { db.close(); }
  });
}
try {
  if (inlineFallback) {
    const { p, ctx } = await atVoice(), before = await hash(p);
    await p.evaluate(() => new Promise(resolve => setTimeout(resolve, 1200)));
    const native = await voice(p).evaluate(v => ({ paused: v.paused, time: v.currentTime, readyState: v.readyState, error: v.error?.code ?? null, playback: v.dataset.playerPlayback }));
    await menu(p); await button(p, '本次先无声阅读').click(); assert.equal(await hash(p), before); assert.equal(await p.locator('main').getAttribute('data-audio-mode'), 'silent');
    await button(p, '继续下一句').click(); assert.notEqual(await hash(p), before); await shot(p, 'manual-silent-fallback');
    checks.push({ name: 'explicit-menu-silent-fallback-without-a-native-error', native, nativePlaybackAccepted: false }); await ctx.close();
  } else {
  const { p, ctx } = await atVoice();
  await menu(p); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await closeMenu(p);
  const saved = await slot(p), before = await hash(p); await voice(p).evaluate(v => { v.playbackRate = 4; window.oldVoice = v; window.healthyMusic = document.querySelector('audio[data-audio-bus="bgm"]'); });
  await p.waitForFunction(() => window.oldVoice.ended);
  await menu(p); await button(p, '快速读取').click(); await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); await settle(p);
  const after = await voice(p).evaluate(v => ({ sameOwner: v === window.oldVoice, ended: v.ended, completed: v.dataset.voiceCompleted, musicUnchanged: document.querySelector('audio[data-audio-bus="bgm"]') === window.healthyMusic }));
  assert.equal(after.sameOwner, baseline); assert.equal(after.musicUnchanged, true); assert.equal(await hash(p), before); assert.deepEqual(await slot(p), saved);
  if (baseline) assert.equal(after.ended, true);
  else {
    await voice(p).evaluate(v => { v.playbackRate = .1; });
    await p.waitForFunction(() => { const v = document.querySelector('audio[data-audio-bus="voice"]'); return v && !v.paused && !v.ended && v.currentTime > 0; });
    assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'off');
  }
  await shot(p, 'same-paragraph-load'); checks.push({ name: baseline ? 'reproduced-completed-voice-reused-on-load' : 'validated-load-restarts-only-current-voice', after, saved });
  if (!baseline) {
    await p.clock.install(); await menu(p); await button(p, '自动播放').click(); await closeMenu(p); await p.clock.fastForward(120000);
    assert.equal(await hash(p), before); assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'waiting-voice'); await button(p, '停止自动阅读').click(); await p.clock.resume();
    checks.push({ name: 'auto-waits-for-new-native-voice-after-load', controlledClockMilliseconds: 120000 });
    const interruptions = [];
    for (let i = 0; i < 3; i++) {
      await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))); await p.waitForFunction(() => document.querySelector('main')?.dataset.hostActivity === 'suspended');
      const paused = await voice(p).evaluate(v => ({ paused: v.paused, time: v.currentTime })); assert.equal(paused.paused, true);
      await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await p.waitForFunction(() => { const v = document.querySelector('audio[data-audio-bus="voice"]'); return document.querySelector('main')?.dataset.hostActivity === 'active' && v && !v.paused; });
      const resumed = await voice(p).evaluate(v => v.currentTime); assert.ok(resumed >= paused.time - .05); assert.equal(await hash(p), before); interruptions.push({ paused, resumed });
    }
    checks.push({ name: 'three-lifecycle-ceilings-resume-native-position', interruptions, injectedLifecycleEvents: true });
    await menu(p); await button(p, '重听当前语音').click(); assert.equal(await p.getByRole('dialog', { name: '阅读菜单', exact: true }).count(), 0); assert.equal(await hash(p), before); assert.ok(await voice(p).evaluate(v => v.currentTime < .5));
    assert.equal(await voice(p).evaluate(v => document.querySelector('audio[data-audio-bus="bgm"]') === window.healthyMusic), true); checks.push({ name: 'public-relisten-current-voice-without-story-or-music-reset' });
    await p.waitForFunction(() => !document.querySelector('audio[data-audio-bus="voice"]').paused); await voice(p).evaluate(v => v.pause()); await button(p, '恢复声音').waitFor();
    for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
      await p.setViewportSize(viewport); await settle(p); const notice = await p.locator('.player-audio-recovery').boundingBox(), paragraph = await p.locator('.player-dialogue').boundingBox(), save = await button(p, '存读档').boundingBox();
      const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.ok(notice && paragraph && save && !overlaps(notice, paragraph) && !overlaps(notice, save));
      for (const name of ['恢复声音', '本次先无声阅读']) { const b = await button(p, name).boundingBox(); assert.ok(b && b.height >= 44 && b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width && b.y + b.height <= viewport.height); }
      await shot(p, `interrupted-${viewport.width}`); checks.push({ name: 'interruption-notice-does-not-occlude-reading-or-save', viewport, notice, paragraph, save });
    }
    await menu(p); assert.equal(await button(p, '恢复声音').count(), 0); await closeMenu(p); await button(p, '恢复声音').waitFor();
    const preferences = await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('preferences')));
    await button(p, '本次先无声阅读').click(); assert.equal(await p.locator('main').getAttribute('data-audio-mode'), 'silent'); assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'off'); assert.equal(await hash(p), before); assert.deepEqual(await slot(p), saved);
    assert.deepEqual(await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('preferences'))), preferences); checks.push({ name: 'interrupted-audio-silent-choice-retains-progress-slot-and-preferences' });
    await p.reload(); await button(p, '恢复上次进度').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'loaded');
    await p.waitForFunction(() => { const v = document.querySelector('audio[data-audio-bus="voice"]'); return v && !v.paused && !v.ended && v.currentTime > 0; });
    assert.equal(await hash(p), before); assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'off'); assert.equal(await p.locator('main').getAttribute('data-audio-mode'), 'enabled'); assert.deepEqual(await slot(p), saved);
    await shot(p, 'reload-recovery-voice'); checks.push({ name: 'reload-recovery-starts-current-voice-with-auto-off-and-slot-unchanged' });
  }
  await ctx.close();
  const late = await atVoice(true); await late.p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))); await late.p.waitForFunction(() => document.querySelector('main')?.dataset.hostActivity === 'suspended');
  await late.p.evaluate(() => window.releaseVoice()); await late.p.waitForFunction(() => window.lateVoicePlays === 1); await settle(late.p);
  const lateState = await voice(late.p).evaluate(v => ({ paused: v.paused, playback: v.dataset.playerPlayback, host: document.querySelector('main').dataset.hostActivity }));
  assert.equal(lateState.host, 'suspended'); assert.equal(lateState.paused, !baseline); assert.equal(lateState.playback, baseline ? 'playing' : 'suspended');
  await shot(late.p, 'late-native-play'); checks.push({ name: baseline ? 'reproduced-late-native-play-bypasses-suspension' : 'late-native-play-is-paused-by-owner-ceiling', lateState, injectedPlayRequestDelay: true, syntheticNativeEvents: false });
  await late.ctx.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(report, JSON.stringify({ passed: true, browser: browser.version(), delivery: website ? 'http-website' : file ? 'file-html' : 'http-html', artifactSha256: sha(websiteBytes ?? html), htmlSha256: sha(html), checks, errors, scope: 'Actual 1.10.0 production export, native audio at accelerated/slowed rates, public controls and unchanged IndexedDB quick slot. Persisted page-transition events and a held play request are explicit fault injections; native play/pause/ended are not synthesized. WebKit HTTP website playback does not prove embedded HTML/data/Blob or offline audio. Desktop engines/phone-sized windows are not human listening, physical-phone/Safari or long-soak acceptance.' }, null, 2)); console.log(`PASS ${label} actual-work voice reading continuity`);
} catch (error) { if (current && !current.isClosed()) await shot(current, 'failure'); await writeFile(report, JSON.stringify({ passed: false, browser: browser.version(), delivery: website ? 'http-website' : file ? 'file-html' : 'http-html', artifactSha256: sha(websiteBytes ?? html), error: String(error), checks, errors }, null, 2)); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

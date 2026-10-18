import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
import { pollBrowserState } from './poll-browser-state.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-playback-advance');
const baselineCommit = '0ae9cfe0fabeeb535acc587cc1806b659bb8f8d5';
await mkdir(output, { recursive: true });
if (process.argv.includes('--matrix')) {
  const matrixPath = path.join(output, 'browser-matrix.json'), reports = [];
  await writeFile(matrixPath, JSON.stringify({ passed: false, status: 'running' }));
  try {
    for (const engine of ['chromium', 'firefox', 'webkit']) {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [import.meta.filename, `--engine=${engine}`], { cwd: root, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve);
      });
      assert.equal(code, 0, engine);
      const file = engine === 'chromium' ? 'interaction.json' : `interaction-${engine}.json`, report = JSON.parse(await readFile(path.join(output, file), 'utf8'));
      assert.equal(report.passed, true); reports.push({ engine, file, browser: report.browser, checks: report.checks.length });
      await writeFile(matrixPath, JSON.stringify({ passed: false, status: 'running', reports }, null, 2));
    }
    await writeFile(matrixPath, JSON.stringify({ passed: true, reports }, null, 2));
  } catch (error) { await writeFile(matrixPath, JSON.stringify({ passed: false, reports, error: String(error) }, null, 2)); throw error; }
  process.exit(0);
}
if (process.argv.includes('--work')) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/run-web-auto-voice-continuity.mjs'], { cwd: root, env: { ...process.env, STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY: 'evidence/web-playback-advance/work' }, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', resolve);
  });
  assert.equal(code, 0, 'Production author/complete-work checks');
  // Only these two freshly generated, verified temporary exports are removed.
  for (const name of ['before-rain-stops.html', 'before-rain-stops-website.zip']) await unlink(path.join(output, 'work', name));
  process.exit(0);
}
if (process.argv.includes('--profile')) {
  await writeFile(path.join(output, 'comparison.json'), JSON.stringify({ passed: false, status: 'running' }));
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', baselineCommit, 'packages/runtime/src', 'apps/player-shell/src'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim().split('\n').filter(p => /\.(?:tsx?|css)$/.test(p) && !/\.test\.tsx?$/.test(p));
  const sources = Object.fromEntries(paths.map(p => [p, execFileSync('git', ['show', `${baselineCommit}:${p}`], { cwd: root, encoding: 'utf8', windowsHide: true })]));
  await writeFile(path.join(output, 'baseline-sources.json'), JSON.stringify({ baselineCommit, sources }));
  for (const label of ['--baseline', '--current']) {
    const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [import.meta.filename, label], { cwd: root, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, label);
  }
  await compare();
  process.exit(0);
}
if (process.argv.includes('--compare-only')) { await compare(); process.exit(0); }
async function compare() {
  const target = path.join(output, 'comparison.json');
  try {
    const old = JSON.parse(await readFile(path.join(output, 'baseline.json'))), current = JSON.parse(await readFile(path.join(output, 'current.json')));
    assert.equal(old.passed, true); assert.equal(current.passed, true); assert.equal(old.rows.length, 18); assert.equal(current.rows.length, 18);
    for (const key of ['baselineCommit', 'fixtureHash', 'frozenSourcesHash', 'cssHash']) assert.equal(current.identity[key], old.identity[key]);
    assert.deepEqual(current.rows.map(r => ({ count: r.count, mode: r.mode, round: r.round, state: r.state, saved: r.saved })), old.rows.map(r => ({ count: r.count, mode: r.mode, round: r.round, state: r.state, saved: r.saved })));
    await writeFile(target, JSON.stringify({ passed: true, matchedOutcomes: 18, originalQuickSlotsMatched: [480, 960], baselineIdentity: old.identity, currentIdentity: current.identity }, null, 2));
    console.log('PASS all 18 playback outcomes and original full canonical quick saves match baseline');
  } catch (error) { await writeFile(target, JSON.stringify({ passed: false, error: String(error) }, null, 2)); throw error; }
}
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice('--engine='.length) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const baseline = process.argv.includes('--baseline'), profile = baseline || process.argv.includes('--current'), label = profile ? baseline ? 'baseline' : 'current' : engine === 'chromium' ? 'interaction' : `interaction-${engine}`;
assert.ok(!profile || engine === 'chromium', 'Profiles use Chromium only');
const reportPath = path.join(output, `${label}.json`);
if (!process.argv.includes('--audit-only')) await writeFile(reportPath, JSON.stringify({ passed: false, status: 'running' }));
if (profile && !process.argv.includes('--audit-only')) await writeFile(path.join(output, 'comparison.json'), JSON.stringify({ passed: false, status: `${label}-sampling` }));
const frozen = profile ? JSON.parse(await readFile(path.join(output, 'baseline-sources.json'), 'utf8')) : null;
if (frozen) assert.equal(frozen.baselineCommit, baselineCommit);
const overrides = new Map(Object.entries(baseline ? frozen.sources : {}).map(([p, text]) => [path.resolve(root, p).replaceAll('\\', '/'), text]));
const fixture = path.join(root, 'tools/fixtures/playback-advance-player.ts');
const bundles = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'playback-baseline', load(id) { return overrides.get(id.replaceAll('\\', '/')); } }], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: fixture, name: 'PlaybackAdvance', formats: ['iife'] } } });
const files = (Array.isArray(bundles) ? bundles : [bundles]).flatMap(item => item.output), code = files.find(item => item.type === 'chunk').code, css = files.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n');
const identity = { baselineCommit, bundleHash: sha(code), cssHash: sha(css), fixtureHash: sha((await readFile(fixture, 'utf8')).replaceAll('\r\n', '\n')), frozenSourcesHash: frozen ? sha(JSON.stringify(frozen)) : null };
if (process.argv.includes('--audit-only')) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.passed, true); assert.deepEqual(report.identity, identity); console.log(`PASS ${label} final bundle/fixture identity`); process.exit(0);
}
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html' }).end(pathname.endsWith('.js') ? code : pathname.endsWith('.css') ? css : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/player.css"><div id="player-root"></div><script src="/player.js"></script>');
});
await listenBrowserLoopback(server);
const require = createRequire(import.meta.url); let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) }), page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), errors = [], rows = [], checks = [];
page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
await page.addInitScript(() => {
  window.playbackTest = { held: [], hold: false, corrupt: false, packets: [], tasks: [], frames: [], workers: { live: 0, peak: 0 }, stopAtChange: false, changed: null };
  new MutationObserver(records => {
    for (const record of records) if (record.target.matches?.('main.player-shell')) {
      const main = record.target, changed = performance.now(); requestAnimationFrame(() => playbackTest.frames.push({ changed, frame: performance.now() }));
      if (playbackTest.stopAtChange) { playbackTest.stopAtChange = false; playbackTest.changed = { at: changed, hash: main.dataset.runtimeStateHash, cursor: main.dataset.historyCursor, length: main.dataset.historyLength, text: document.querySelector('.player-dialogue__text')?.textContent ?? '', stopReason: main.dataset.playbackStopReason }; document.querySelector('button[aria-label="打开阅读菜单"]')?.click(); }
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-runtime-state-hash'] });
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => playbackTest.tasks.push(...list.getEntries().map(item => ({ start: item.startTime, duration: item.duration })))).observe({ type: 'longtask', buffered: true });
  const NativeWorker = Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options); this.ids = new Set(); this.released = false; playbackTest.workers.live++; playbackTest.workers.peak = Math.max(playbackTest.workers.peak, playbackTest.workers.live);
      this.addEventListener('message', event => {
        if (!this.ids.delete(event.data?.id)) return;
        const packet = playbackTest.packets.findLast(item => item.id === event.data.id); if (packet) { packet.replyAt = performance.now(); packet.resultEncoding = event.data.result?.encoding ?? 'plain'; }
        if (!playbackTest.hold) return;
        const callback = this.onmessage; event.stopImmediatePropagation(); playbackTest.held.push({ callback, event, owner: this });
      });
    }
    postMessage(data, ...rest) {
      if (data?.task?.kind === 'playback') {
        this.ids.add(data.id);
        if (playbackTest.corrupt) { playbackTest.corrupt = false; data = structuredClone(data); data.task.state.checkpoints[0].stateHash = '0'.repeat(64); }
        const packet = { id: data.id, mode: data.task.policy.mode, at: performance.now(), encoding: data.task.state.encoding ?? 'plain', checkpoints: data.task.state.checkpoints?.length ?? 0 }; playbackTest.packets.push(packet);
        const before = performance.now(); super.postMessage(data, ...rest); packet.sendMs = performance.now() - before; return;
      }
      return super.postMessage(data, ...rest);
    }
    terminate() { if (!this.released) { this.released = true; playbackTest.workers.live--; } return super.terminate(); }
  };
  window.deliverPlaybackReplies = () => { for (const { callback, event, owner } of playbackTest.held.splice(0)) callback?.call(owner, event); };
});
const main = page.locator('main.player-shell'), button = name => page.getByRole('button', { name, exact: true });
const state = async () => ({ hash: await main.getAttribute('data-runtime-state-hash'), cursor: await main.getAttribute('data-history-cursor'), length: await main.getAttribute('data-history-length'), text: await page.locator('.player-dialogue__text').innerText() });
async function menu() { if (!await page.getByRole('dialog', { name: '阅读菜单', exact: true }).isVisible()) await button('打开阅读菜单').click(); }
async function closeMenu() { if (await button('返回故事').isVisible()) await button('返回故事').click(); }
async function save() { await menu(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await closeMenu(); }
async function restore() { await menu(); await button('快速读取').click(); await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); await closeMenu(); }
async function begin(mode) { await menu(); if (mode === 'auto') await page.getByLabel('自动阅读节奏', { exact: true }).selectOption('policy'); await button(mode === 'auto' ? '自动播放' : mode === 'skipRead' ? '快进已读' : '快进全部').click(); if (await page.getByRole('dialog', { name: '阅读菜单', exact: true }).isVisible()) await closeMenu(); }
async function quickDigest() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { const records = await new Promise((resolve, reject) => { const r = db.transaction('save-slots').objectStore('save-slots').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); const slot = records.find(r => (r.metadata ?? r).slotId === 'quick-1'), metadata = slot.metadata ?? slot;
      const bytes = slot.byteLength ?? new TextEncoder().encode(slot.serializedSessionSave).length;
      const sha256 = slot.sha256 ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(slot.serializedSessionSave))), b => b.toString(16).padStart(2, '0')).join('');
      return { bytes, sha256, sessionArtifactHash: metadata.sessionArtifactHash, runtimeStateHash: metadata.runtimeStateHash }; } finally { db.close(); }
  });
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?mixed=${profile ? 0 : 1}`); await button('开始故事').click();
  for (const count of profile ? [480, 960] : [480]) {
    let lastProgress = Date.now(), lastHash = await main.getAttribute('data-runtime-state-hash');
    while (Number(await main.getAttribute('data-history-length')) < count) {
      await button('继续下一句').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.storyOperation !== 'busy');
      const nextHash = await main.getAttribute('data-runtime-state-hash');
      if (nextHash !== lastHash) { lastHash = nextHash; lastProgress = Date.now(); }
      else if (Date.now() - lastProgress > 15_000) throw Error('Reading made no progress: ' + JSON.stringify(await page.evaluate(() => ({ main: { ...document.querySelector('main').dataset }, media: [...document.querySelectorAll('audio')].map(a => ({ ...a.dataset, paused: a.paused, ended: a.ended, time: a.currentTime, duration: a.duration, ready: a.readyState, error: a.error?.code })) }))));
    }
    const original = await state(); await save(); const saved = await quickDigest();
    if (profile) {
      for (const mode of ['auto', 'skipRead', 'skipAll']) for (let round = 0; round < 3; round++) {
        await restore();
        await page.evaluate(() => { playbackTest.stopAtChange = true; playbackTest.changed = null; });
        const start = await page.evaluate(() => performance.now()); await begin(mode);
        await page.waitForFunction(() => playbackTest.changed !== null); await menu();
        if (await button('自动播放').getAttribute('aria-pressed') === 'true') await button('自动播放').click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const telemetry = await page.evaluate(start => ({ state: playbackTest.changed, wallMs: performance.now() - start, tasks: playbackTest.tasks.filter(item => item.start >= start), packets: playbackTest.packets.filter(item => item.at >= start), frames: playbackTest.frames.filter(item => item.changed >= start) }), start);
        const { at, ...outcome } = telemetry.state; rows.push({ count, mode, round, ...telemetry, commitMs: at - start, state: outcome, saved });
        if (!baseline) { assert.equal(telemetry.packets.length, 1); assert.equal(telemetry.packets[0].encoding, 'world-player.session-input.1'); assert.equal(telemetry.packets[0].resultEncoding, 'world-player.history-lists.1'); }
        console.log(`PASS ${label} ${count} ${mode} ${round + 1}`);
      }
      await restore();
    } else {
      await page.evaluate(() => { playbackTest.hold = true; }); await begin('auto'); await page.waitForFunction(() => playbackTest.held.length === 1);
      for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
        await page.setViewportSize(viewport); const bounds = await button('停止并留在当前句').boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height && bounds.height >= 44);
        assert.equal(await page.locator('.player-save-feedback').count(), 0); await page.screenshot({ path: path.join(output, `pending-${engine === 'chromium' ? '' : engine + '-'}${viewport.width}.png`) }); checks.push({ viewport, stopBounds: bounds, saveToastHidden: true });
      }
      await button('停止并留在当前句').click(); await page.evaluate(() => deliverPlaybackReplies()); assert.deepEqual(await state(), original);
      await begin('auto'); await page.waitForFunction(() => playbackTest.held.length === 1); await button('继续下一句').click(); await page.evaluate(() => deliverPlaybackReplies()); assert.deepEqual(await state(), original); checks.push({ paragraphTakeoverStopsFirst: true });
      await menu(); await page.getByLabel('快进激活方式', { exact: true }).selectOption('hold');
      await button('快进全部').dispatchEvent('pointerdown', { pointerType: 'mouse', pointerId: 1, buttons: 1 }); await page.waitForFunction(() => playbackTest.held.length === 1);
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))); await page.evaluate(() => deliverPlaybackReplies()); assert.deepEqual(await state(), original);
      await menu(); await page.getByLabel('快进激活方式', { exact: true }).selectOption('toggle'); await closeMenu(); checks.push({ heldSkipReleaseDiscardsLate: true });
      for (const mode of ['auto', 'skipRead', 'skipAll']) {
        await begin(mode); await page.waitForFunction(() => playbackTest.held.length === 1); await menu(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
        await page.evaluate(() => deliverPlaybackReplies()); assert.deepEqual(await state(), original); assert.deepEqual(await quickDigest(), saved);
        if (await button('自动播放').getAttribute('aria-pressed') === 'true') await button('自动播放').click(); await closeMenu(); checks.push({ mode, menuCancelsAndSavesOriginal: true });
      }
      await begin('auto'); await page.waitForFunction(() => playbackTest.held.length === 1); await page.evaluate(() => readingAdvanceHost.setHostActivity('suspended')); await page.evaluate(() => deliverPlaybackReplies()); assert.deepEqual(await state(), original);
      await page.evaluate(() => { readingAdvanceHost.setHostActivity('active'); playbackTest.hold = false; playbackTest.corrupt = true; });
      await page.waitForFunction(() => document.querySelector('main')?.dataset.playbackOperation === 'error'); assert.deepEqual(await state(), original); assert.deepEqual(await quickDigest(), saved);
      await page.setViewportSize({ width: 320, height: 740 }); const errorBounds = await button('切回手动阅读').boundingBox();
      assert.ok(errorBounds && errorBounds.x >= 0 && errorBounds.y >= 0 && errorBounds.x + errorBounds.width <= 320 && errorBounds.y + errorBounds.height <= 740 && errorBounds.height >= 44);
      await page.screenshot({ path: path.join(output, `error-${engine}-320.png`) }); checks.push({ errorStopBounds: errorBounds }); await page.setViewportSize({ width: 1280, height: 900 });
      assert.equal(await button('自动播放').getAttribute('aria-pressed'), 'false'); await button('切回手动阅读').click();
      await page.evaluate(() => { playbackTest.stopAtChange = true; playbackTest.changed = null; }); await begin('auto'); await page.waitForFunction(() => playbackTest.changed !== null);
      await menu(); if (await button('自动播放').getAttribute('aria-pressed') === 'true') await button('自动播放').click();
      assert.equal(Number((await state()).cursor), Number(original.cursor) + 1); await restore();
      // Read/unlock progress is deliberately monotonic across load. Returning
      // to the old sentence may merge newly read IDs and change its live hash.
      const restored = await state(); assert.equal(restored.cursor, original.cursor); assert.equal(restored.length, original.length); assert.equal(restored.text, original.text); assert.deepEqual(await quickDigest(), saved);
      checks.push({ backgroundDiscardsLate: true, corruptInputRejected: true, explicitRestartSucceeds: true, quickSlotUnchanged: true });
      for (const mode of ['skipRead', 'skipAll']) {
        await page.evaluate(() => { playbackTest.stopAtChange = true; playbackTest.changed = null; }); await begin(mode); await page.waitForFunction(() => playbackTest.changed !== null); await menu();
        assert.ok(Number((await state()).cursor) > Number(original.cursor)); checks.push({ mode, committed: await state() }); await restore();
      }
      const packets = await page.evaluate(() => playbackTest.packets); assert.ok(packets.every(p => p.encoding === 'world-player.session-input.1' && p.checkpoints >= 481));
    }
  }
  await page.evaluate(() => readingAdvanceHost.unmount()); await pollBrowserState(page, () => playbackTest.workers.live === 0); assert.deepEqual(errors, []);
  const workers = await page.evaluate(() => playbackTest.workers); assert.ok(workers.peak <= 2);
  await writeFile(reportPath, JSON.stringify({ passed: true, label, browser: browser.version(), identity, rows, checks, packets: await page.evaluate(() => playbackTest.packets), workers, errors, scope: profile ? 'Serial desktop Chromium, fixed old-then-current, 3 batches per mode and history size. Accelerated 40ms host reading clock, not natural reading or physical phone acceptance. Mutation observer opens the real menu at first committed change; wallMs and commitMs include UI automation (and wallMs includes frames), not pure computation.' : '480 naturally read mixed entries. Native Worker computes real replies; delivery is held only for cancellation tests. One actual input hash corruption. Not performance evidence, complete story or physical devices.' }, null, 2));
  console.log(`PASS ${label} playback batches, complete history and worker ownership`);
} catch (error) {
  await page.screenshot({ path: path.join(output, `${label}-failure.png`) }); await writeFile(reportPath, JSON.stringify({ passed: false, identity, error: String(error), stack: error.stack, errors, rows, checks }, null, 2)); throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

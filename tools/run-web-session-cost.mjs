import { createRequire, SourceMap } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
import { pollBrowserState } from './poll-browser-state.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, process.env.STUDIO_COST_OUTPUT_DIRECTORY ?? 'evidence/web-session-cost');
const baseline = process.argv.includes('--baseline'), label = baseline ? 'baseline' : 'current';
const baselineCommit = process.env.STUDIO_COST_BASELINE_COMMIT ?? '8207650d4836017e368db0422edc2fabbf51a63d';
const snapshotFile = path.join(output, 'baseline-sources.json');
await mkdir(output, { recursive: true });
if (process.argv.includes('--freeze')) {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', baselineCommit, 'packages/runtime/src', 'apps/player-shell/src'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim().split('\n').filter(p => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p));
  const sources = Object.fromEntries(paths.map(p => [p, execFileSync('git', ['show', `${baselineCommit}:${p}`], { cwd: root, encoding: 'utf8', windowsHide: true })]));
  await writeFile(snapshotFile, JSON.stringify({ baselineCommit, sources }, null, 2));
}
const frozen = JSON.parse(await readFile(snapshotFile, 'utf8'));
assert.equal(frozen.baselineCommit, baselineCommit);
const overrides = new Map(Object.entries(baseline ? frozen.sources : {}).map(([p, text]) => [path.resolve(root, p).replaceAll('\\', '/'), text]));
const mixed = process.env.STUDIO_COST_MIXED === '1';
const fixture = mixed ? 'tools/fixtures/reading-mixed-player.ts' : 'tools/fixtures/reading-advance-player.ts';
const bundles = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'session-cost-baseline', load(id) { return overrides.get(id.replaceAll('\\', '/')); } }], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, sourcemap: 'hidden', lib: { entry: path.join(root, fixture), name: 'SessionCost', formats: ['iife'] } } });
const outputs = (Array.isArray(bundles) ? bundles : [bundles]).flatMap(item => item.output);
const chunk = outputs.find(item => item.type === 'chunk');
const code = chunk.code, css = outputs.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n');
const fixtureSourceHash = sha((await readFile(path.join(root, fixture), 'utf8')).replaceAll('\r\n', '\n'));
const identity = { baselineCommit, label, bundleHash: sha(code), cssHash: sha(css), fixtureSourceHash, frozenSourcesHash: sha(JSON.stringify(frozen)), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim() };
function assertCopyAfterFrame(report) {
  for (const operation of report.operations.filter(item => item.name === 'advance')) {
    const advanced = report.rows.find(row => row.count === operation.count && row.round === operation.round).advanced;
    const observed = operation.recoveryThroughDurable.frames.find(item => item.hash === advanced.hash);
    assert.ok(observed, 'Changed story state must reach an observed frame callback');
    assert.ok(operation.recoveryThroughDurable.posts.length > 0, 'Recovery must actually be sent and durably settle');
    for (const post of operation.recoveryThroughDurable.posts) if (post.previousSynchronousMs >= 4) assert.ok(post.start >= observed.frame, 'Known slow recovery copy must follow the changed story frame callback');
  }
}
if (process.argv.includes('--audit-only')) {
  const report = JSON.parse(await readFile(path.join(output, `${label}.json`), 'utf8'));
  for (const key of ['bundleHash', 'cssHash', 'fixtureSourceHash', 'frozenSourcesHash']) assert.equal(report[key], identity[key], key);
  if (!baseline && report.operations.every(item => item.name !== 'advance' || item.recoveryThroughDurable)) assertCopyAfterFrame(report);
  console.log(`PASS ${label} exact bundle and fixture identity`); process.exit(0);
}
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname === '/player.js') res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(code);
  else if (url.pathname === '/player.css') res.writeHead(200, { 'Content-Type': 'text/css' }).end(css);
  else res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/player.css"><div id="player-root"></div><script src="/player.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [], operations = [], rows = [];
page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
await page.addInitScript(() => {
  window.sessionCost = { tasks: [], heartbeats: [], posts: [], frames: [], media: { playing: 0, ended: 0, errors: [] }, workers: { created: 0, live: 0, peak: 0 } };
  new MutationObserver(records => {
    for (const record of records) if (record.target.matches?.('main.player-shell')) {
      const hash = record.target.dataset.runtimeStateHash, changed = performance.now();
      requestAnimationFrame(() => sessionCost.frames.push({ hash, changed, frame: performance.now() }));
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-runtime-state-hash'] });
  for (const name of ['playing', 'ended', 'error']) document.addEventListener(name, event => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    if (name === 'error') sessionCost.media.errors.push({ asset: event.target.dataset.assetId, code: event.target.error?.code });
    else sessionCost.media[name]++;
  }, true);
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => sessionCost.tasks.push(...list.getEntries().map(item => ({ start: item.startTime, duration: item.duration })))).observe({ type: 'longtask', buffered: true });
  let previous = performance.now();
  setInterval(() => { const now = performance.now(); sessionCost.heartbeats.push({ at: now, gap: now - previous }); previous = now; }, 16);
  const NativeWorker = Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options); this.counted = String(options?.name ?? '').startsWith('world-player-'); this.released = false;
      if (this.counted) { sessionCost.workers.created++; sessionCost.workers.live++; sessionCost.workers.peak = Math.max(sessionCost.workers.peak, sessionCost.workers.live); }
      this.addEventListener('message', event => { const post = sessionCost.posts.find(item => item.worker === this.workerNumber && item.id === event.data?.id && item.arrived === null); if (post) post.arrived = performance.now(); });
      this.workerNumber = sessionCost.workers.created;
    }
    postMessage(data, ...args) {
      const start = performance.now(), previousSynchronousMs = this.previousSynchronousMs ?? 0;
      try { return super.postMessage(data, ...args); }
      finally { const synchronousMs = performance.now() - start; this.previousSynchronousMs = synchronousMs; if (this.counted) sessionCost.posts.push({ worker: this.workerNumber, id: data?.id, kind: data?.task?.kind ?? 'recovery', start, synchronousMs, previousSynchronousMs, arrived: null }); }
    }
    terminate() { if (this.counted && !this.released) { this.released = true; sessionCost.workers.live--; } return super.terminate(); }
  };
});
const main = page.locator('main.player-shell');
const state = async () => ({ hash: await main.getAttribute('data-runtime-state-hash'), cursor: Number(await main.getAttribute('data-history-cursor')), length: Number(await main.getAttribute('data-history-length')), text: await page.locator('.player-dialogue__text').innerText() });
const cdp = await context.newCDPSession(page), sourceMap = new SourceMap(chunk.map);
await cdp.send('Profiler.enable');
function cpuSummary(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node])), totals = new Map();
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const frame = nodes.get(profile.samples[i]).callFrame;
    const entry = frame.url.endsWith('/player.js') ? sourceMap.findEntry(frame.lineNumber, frame.columnNumber) : null;
    const name = entry?.originalSource ? `${entry.originalSource}:${entry.originalLine + 1} ${entry.name || frame.functionName}` : `${frame.functionName} ${frame.url}`;
    totals.set(name, (totals.get(name) ?? 0) + profile.timeDeltas[i] / 1000);
  }
  return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([location, sampledMs]) => ({ location, sampledMs }));
}
async function measure(count, round, name, action) {
  // Only advance is CPU-profiled. Sampling does not skew the save/load comparison.
  if (name === 'advance') await cdp.send('Profiler.start');
  const start = await page.evaluate(() => performance.now());
  await action();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const end = await page.evaluate(() => performance.now());
  const cpu = name === 'advance' ? cpuSummary((await cdp.send('Profiler.stop')).profile) : undefined;
  const telemetry = await page.evaluate(({ start, end }) => ({
    longTasks: sessionCost.tasks.filter(item => item.start >= start && item.start < end),
    maximumHeartbeatGapMs: Math.max(0, ...sessionCost.heartbeats.filter(item => item.at >= start && item.at <= end).map(item => item.gap)),
    posts: sessionCost.posts.filter(item => item.start >= start && item.start < end),
    frames: sessionCost.frames.filter(item => item.changed >= start && item.changed < end)
  }), { start, end });
  operations.push({ count, round, name, start, end, wallMs: end - start, cpu, ...telemetry });
}
async function openMenu() {
  const trigger = page.getByRole('button', { name: '打开阅读菜单', exact: true });
  await page.mouse.move(1110, 160); await trigger.waitFor({ state: 'visible' }); await trigger.click();
}
async function closeMenu() { const dialog = page.getByRole('dialog', { name: '阅读菜单', exact: true }); if (await dialog.isVisible()) await dialog.getByRole('button', { name: '返回故事', exact: true }).click(); }
async function recoverySettled() {
  await pollBrowserState(page, async () => {
    const hash = document.querySelector('main.player-shell')?.dataset.runtimeStateHash;
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { const record = await new Promise((resolve, reject) => { const request = db.transaction('recovery-sessions').objectStore('recovery-sessions').get('session_budget'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); return (record?.metadata ?? record)?.runtimeStateHash === hash && JSON.parse(document.documentElement.dataset.recoverySerializer ?? '{}').active === 0; } finally { db.close(); }
  });
}
async function quickIdentity() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const row = await new Promise((resolve, reject) => { const request = db.transaction('save-slots').objectStore('save-slots').get('session_budget\0quick-1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const metadata = row.metadata ?? row;
      const bytes = row.byteLength ?? new TextEncoder().encode(row.serializedSessionSave).length;
      const digest = row.sha256 ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.serializedSessionSave))), byte => byte.toString(16).padStart(2, '0')).join('');
      return { bytes, sha256: digest, sessionArtifactHash: metadata.sessionArtifactHash, runtimeStateHash: metadata.runtimeStateHash };
    } finally { db.close(); }
  });
}
async function mediaIdentity() {
  if (!mixed) return null;
  await pollBrowserState(page, () => {
    const images = [...document.querySelectorAll('img[data-asset-id]')], bgm = document.querySelector('audio[data-audio-bus="bgm"]');
    return images.length >= 3 && images.every(image => image.complete && image.naturalWidth > 0) && bgm?.readyState >= 2 && !bgm.paused && sessionCost.media.ended > 0;
  });
  const media = await page.evaluate(() => ({ images: [...document.querySelectorAll('img[data-asset-id]')].map(image => ({ asset: image.dataset.assetId, width: image.naturalWidth, height: image.naturalHeight })), buses: [...document.querySelectorAll('audio[data-audio-bus]')].map(audio => ({ asset: audio.dataset.assetId, bus: audio.dataset.audioBus, loop: audio.loop })), events: sessionCost.media }));
  assert.deepEqual(media.events.errors, []); return media;
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?count=960`);
  await page.getByRole('button', { name: '开始故事', exact: true }).click();
  for (const count of [120, 480, 960]) {
    while (Number(await main.getAttribute('data-history-length')) < count) await page.getByRole('button', { name: '继续下一句', exact: true }).click();
    await recoverySettled();
    for (let round = 0; round < 3; round++) {
      const before = await state(); await openMenu();
      await measure(count, round, 'quick-save', async () => { await page.getByRole('button', { name: '快速保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); });
      await closeMenu();
      await measure(count, round, 'advance', () => page.getByRole('button', { name: '继续下一句', exact: true }).click());
      const advanced = await state(); assert.notEqual(advanced.hash, before.hash);
      await recoverySettled();
      const advanceOperation = operations.at(-1), settled = await page.evaluate(() => performance.now());
      advanceOperation.recoveryThroughDurable = await page.evaluate(({ start, end }) => ({ elapsedMs: end - start, posts: sessionCost.posts.filter(item => item.kind === 'recovery' && item.start >= start && item.start < end), frames: sessionCost.frames.filter(item => item.changed >= start && item.changed < end) }), { start: advanceOperation.start, end: settled });
      await openMenu();
      await measure(count, round, 'quick-load', async () => {
        await page.getByRole('button', { name: '快速读取', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded' || document.querySelector('.player-load-confirm'));
        const confirm = page.locator('.player-load-confirm'); if (await confirm.isVisible()) await confirm.getByRole('button', { name: '确认读取', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded');
      });
      const loaded = await state();
      assert.equal(loaded.cursor, before.cursor); assert.equal(loaded.length, before.length); assert.equal(loaded.text, before.text);
      const slot = await quickIdentity(); assert.equal(slot.runtimeStateHash, before.hash);
      rows.push({ count, round, before, advanced, loaded, slot }); await closeMenu(); await recoverySettled();
      console.log(`PASS ${label} ${count} round ${round + 1}: real Worker/IndexedDB save/advance/load`);
    }
  }
  await page.screenshot({ path: path.join(output, `${label}.png`) });
  const mediaBeforePressure = await mediaIdentity();
  const workersBeforePressure = await page.evaluate(() => ({ ...sessionCost.workers }));
  const beforePressure = await state(); await page.evaluate(() => readingAdvanceHost.notifyMemoryPressure('critical'));
  await page.waitForFunction(() => readingAdvanceHost.getObservation().memoryPressure === 'protected');
  assert.equal((await state()).hash, beforePressure.hash);
  const workersAfterPressure = await page.evaluate(() => ({ ...sessionCost.workers })); assert.equal(workersAfterPressure.live, 0);
  const protectedState = await state();
  // Cold page restoration is an explicit user action. No replacement Core or
  // IndexedDB payload is injected, and the saved quick slot stays unchanged.
  const slotBeforeReload = await quickIdentity();
  await page.reload();
  await page.getByRole('button', { name: '恢复上次进度', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.recoveryOperation === 'loaded');
  const restored = await state(); assert.deepEqual(restored, beforePressure);
  const mediaAfterRestore = await mediaIdentity();
  assert.deepEqual(await quickIdentity(), slotBeforeReload);
  await page.evaluate(() => readingAdvanceHost.unmount());
  assert.equal(await page.evaluate(() => sessionCost.workers.live), 0);
  assert.deepEqual(errors, []);
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const medians = [120, 480, 960].flatMap(count => ['quick-save', 'advance', 'quick-load'].map(name => ({ count, name, wallMs: median(operations.filter(item => item.count === count && item.name === name).map(item => item.wallMs)) })));
  if (!baseline) {
    assertCopyAfterFrame({ operations, rows });
    const reference = JSON.parse(await readFile(path.join(output, 'baseline.json'), 'utf8'));
    assert.equal(identity.cssHash, reference.cssHash); assert.equal(identity.fixtureSourceHash, reference.fixtureSourceHash);
    assert.deepEqual(rows, reference.rows, 'All saved canonical byte lengths/digests, state hashes, text, cursors and full history lengths must match the frozen baseline');
    assert.deepEqual(restored, reference.restored); assert.deepEqual(protectedState, reference.protectedState);
    for (const field of ['images', 'buses']) if (mixed) {
      assert.deepEqual(mediaBeforePressure[field], reference.mediaBeforePressure[field]);
      assert.deepEqual(mediaAfterRestore[field], reference.mediaAfterRestore[field]);
    }
  }
  await writeFile(path.join(output, `${label}.json`), JSON.stringify({ passed: true, ...identity, browser: browser.version(), medians, rows, operations, workersBeforePressure, workersAfterPressure, protectedState, restored, mediaBeforePressure, mediaAfterRestore, errors, foregroundSerializer: await page.evaluate(() => JSON.parse(document.documentElement.dataset.foregroundSerializer ?? 'null')), scope: `Sequential same-machine synthetic ${mixed ? 'text, background, two characters, looping BGM and finite voice' : 'text'}, three repeated real UI operations per size; native Worker/IndexedDB. Sender synchronous postMessage is not total copy cost; reply elapsed includes worker/queue/transport. Advance alone CPU sampled. No injected history, forced GC, physical phone or long soak.` }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, `${label}-failure.png`) });
  await writeFile(path.join(output, `${label}-failure.json`), JSON.stringify({ error: String(error), stack: error.stack, rows, operations, errors }, null, 2)); throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

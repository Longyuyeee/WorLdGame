import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { readGamePayload, sha } from './audit-rain-story-refinement.mjs';
import { pollBrowserState } from './poll-browser-state.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_CONTINUOUS_OUTPUT_DIRECTORY ?? 'evidence/web-recovery-worker');
const assertDirectPng = process.env.STUDIO_ASSERT_DIRECT_PNG === '1';
const assertForeground = process.env.STUDIO_ASSERT_FOREGROUND_SESSION === '1';
await mkdir(output, { recursive: true });
const archive = await readFile(path.join(output, 'before-rain-stops-web.zip')), files = unzipSync(archive);
const projectId = readGamePayload(strFromU8(files['index.html'])).project.manifest.projectId;
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://local').pathname.slice(1) || 'index.html', bytes = files[name];
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(name)] ?? 'application/octet-stream';
  res.writeHead(bytes ? 200 : 404, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(bytes ?? 'Missing');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true }), context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage(), liveWorkers = new Set(), errors = [], cycles = []; let peakLiveWorkers = 0;
page.on('worker', worker => { liveWorkers.add(worker); peakLiveWorkers = Math.max(peakLiveWorkers, liveWorkers.size); worker.once('close', () => liveWorkers.delete(worker)); });
page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
await page.addInitScript(assertForeground => {
  const NativeWorker = window.Worker, revoke = URL.revokeObjectURL.bind(URL), liveUrls = new Set();
  const observed = window.recoveryUse = { created: 0, revoked: 0, liveUrls };
  window.Worker = class extends NativeWorker {
    constructor(url, options) { super(url, options); if (options?.name === 'world-player-recovery'||assertForeground&&options?.name==='world-player-session') { observed.created++; liveUrls.add(String(url)); } }
  };
  URL.revokeObjectURL = url => { if (liveUrls.delete(String(url))) observed.revoked++; return revoke(url); };
},assertForeground);
const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
const started = Date.now();
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for (let cycle = 0; cycle < 8; cycle++) {
    const [branch, ending] = cycle % 2 ? ['去追最后一班车', '远行的约定'] : ['留下等雨停', '同行的约定'];
    await page.getByRole('button', { name: '开始故事', exact: true }).click();
    const texts = new Set(), voices = new Set(), imageDecodeModes = new Set();
    for (let i = 0; i < 500; i++) {
      if (await page.locator('main.player-shell').getAttribute('data-player-status') === 'ended') break;
      if (await page.locator('.player-choice button').count()) { await page.locator('.player-choice').getByRole('button', { name: branch, exact: true }).click(); continue; }
      await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
      if (assertDirectPng) {
        const modes=await page.locator('canvas[data-image-decode]').evaluateAll(elements=>elements.map(element=>element.dataset.imageDecode));
        assert.ok(modes.length>0);for(const mode of modes){assert.equal(mode,'owned-blob-bitmap');imageDecodeModes.add(mode);}
      }
      texts.add((await page.locator('.player-dialogue__text').innerText()).trim());
      if (await page.locator('audio[data-audio-bus="voice"]').count()) {
        await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended);
        voices.add(await page.locator('audio[data-audio-bus="voice"]').getAttribute('src'));
      }
      assert.equal(await page.locator('.player-media-error').count(), 0);
      await page.getByRole('button', { name: '继续下一句', exact: true }).click();
    }
    assert.equal(texts.size, 66); assert.equal(voices.size, 6);
    assert.match(await page.locator('.player-ending').innerText(), new RegExp(ending));
    const hash = await page.locator('main.player-shell').getAttribute('data-runtime-state-hash');
    await pollBrowserState(page, async ({ projectId, hash }) => {
      const d = JSON.parse(document.documentElement.dataset.recoverySerializer ?? 'null');
      if (!d || d.active !== 0) return false;
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { const row = await new Promise((resolve, reject) => { const r = db.transaction('recovery-sessions').objectStore('recovery-sessions').get(projectId); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); return (row?.metadata ?? row)?.runtimeStateHash === hash; }
      finally { db.close(); }
    }, { projectId, hash });
    if (cycle === 0 || cycle === 7) await page.screenshot({ path: path.join(output, `continuous-${cycle}-ending.png`) });
    await page.getByRole('button', { name: '回到标题', exact: true }).click();
    await page.getByRole('button', { name: '开始故事', exact: true }).waitFor();
    await page.waitForFunction(() => Number(document.documentElement.dataset.nativeAtlasBytes ?? 0) === 0 && JSON.parse(document.documentElement.dataset.recoverySerializer).active === 0 && recoveryUse.liveUrls.size === 0);
    for (let i = 0; i < 100 && liveWorkers.size; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(liveWorkers.size, 0);
    const resources = await page.evaluate(() => ({
      recovery: JSON.parse(document.documentElement.dataset.recoverySerializer),
      foreground: JSON.parse(document.documentElement.dataset.foregroundSerializer??'null'),
      atlas: JSON.parse(document.documentElement.dataset.nativeAtlasScheduler ?? 'null'),
      ownedWorkerUrls: { created: recoveryUse.created, revoked: recoveryUse.revoked, live: recoveryUse.liveUrls.size },
      localStorageCharacters: Object.entries(localStorage).reduce((sum, [key, value]) => sum + key.length + value.length, 0)
    }));
    assert.equal(resources.recovery.peakActive, 1); assert.equal(resources.recovery.failed, 0); assert.equal(resources.recovery.fallback, 0);
    assert.ok(resources.ownedWorkerUrls.created > 0); assert.equal(resources.ownedWorkerUrls.created, resources.ownedWorkerUrls.revoked);
    assert.equal(resources.atlas.accountedBytes, 0); assert.equal(resources.atlas.ordinaryBitmapDecodes, 0);
    if(assertForeground){assert.equal(resources.foreground.active,0);assert.equal(resources.foreground.fallback,0);assert.equal(resources.foreground.failed,0);assert.equal(resources.foreground.peakActive,1);}
    assert.equal(await page.locator('audio').count(), 0);
    cycles.push({ cycle, ending, texts: texts.size, naturallyEndedVoices: voices.size, imageDecodeModes:[...imageDecodeModes], nativeWorkersLive: liveWorkers.size, resources, performanceMetrics: (await cdp.send('Performance.getMetrics')).metrics });
    console.log(`PASS continuous cycle ${cycle + 1}/8: ${ending}, title resources released`);
  }
  assert.deepEqual(errors, []); await page.screenshot({ path: path.join(output, 'continuous-title.png') });
  await writeFile(path.join(output, 'continuous.json'), JSON.stringify({ passed: true, browser: browser.version(), candidateArchiveSha256: sha(archive), runtimeHash: sha(files['player.js']), cycles, peakLiveWorkers, errors, wallMilliseconds: Date.now() - started, instrumentation: 'native Worker/URL forwarding and CDP; no fake completion or forced GC', physicalDevice: false, humanTiming: false, twoHourSoakPassed: false, physicalMemoryLeakFreeProven: false }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'continuous-failure.png') });
  await writeFile(path.join(output, 'continuous-failure.json'), JSON.stringify({ error: String(error), stack: error.stack, cycles, errors }, null, 2)); throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

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

const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const fileMode = process.argv.includes('--file');
const faultMode = process.argv.includes('--fault'); assert.ok(!faultMode || !fileMode, 'Controlled response faults use the HTTP website');
const source = path.resolve(root, baseline ? 'evidence/web-route-replay-continuity' : process.env.STUDIO_REPLAY_RECOVERY_SOURCE_DIRECTORY ?? 'evidence/web-replay-recovery');
const output = path.resolve(root, process.env.STUDIO_REPLAY_RECOVERY_OUTPUT_DIRECTORY ?? `evidence/web-replay-recovery/${baseline ? 'baseline' : 'current-browser'}`);
await mkdir(output, { recursive: true });
const reportPath = path.join(output, `${baseline ? 'baseline-' : ''}${engine}${fileMode ? '-file' : ''}.json`);
try { await access(reportPath); throw Error('Refusing to overwrite a replay recovery report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip);
const artifacts = { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } };
const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
let brokenAsset = null;
const oversizedHeader = new Uint8Array(24), faultRequests = [];
oversizedHeader.set([137,80,78,71,13,10,26,10]); const headerView = new DataView(oversizedHeader.buffer); headerView.setUint32(8,13); headerView.setUint32(12,0x49484452); headerView.setUint32(16,4097); headerView.setUint32(20,4097);
const server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1) || 'index.html', bytes = name === brokenAsset ? oversizedHeader : files[name]; if (name === brokenAsset) faultRequests.push({ path: name, kind: 'oversized-png-header', declaredWidth: 4097, declaredHeight: 4097 }); res.writeHead(bytes ? 200 : 404, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes ?? 'Missing'); });
let browser, page; const checks = [], errors = [], rapid = [];
const button = name => page.getByRole('button', { name, exact: true });
const shot = name => page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled' });
const state = () => page.locator('main').evaluate(el => ({ hash: el.dataset.runtimeStateHash, host: el.dataset.runtimeHostSnapshotHash, cursor: el.dataset.historyCursor, status: el.dataset.playerStatus, replay: el.dataset.sceneReplay, autoEnabled: el.querySelector('[aria-label="自动播放"]')?.getAttribute('aria-pressed'), autoPlayback: el.dataset.autoPlayback, text: el.querySelector('.player-dialogue__text')?.textContent }));
async function settle() { await page.evaluate(() => document.fonts.ready); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function position() {
  return page.locator('.player-dialogue').evaluate(el => {
    const r = el.getBoundingClientRect(), scale = r.height / el.offsetHeight, top = r.top + el.clientTop * scale, bottom = top + el.clientHeight * scale;
    const walker = document.createTreeWalker(el.querySelector('.player-dialogue__text'), 4), lines = []; let node, offset = 0;
    while ((node = walker.nextNode())) { if (node.parentElement.closest('rt,rp')) continue; for (let i = 0; i < node.length; i++, offset++) { const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1); const rect = range.getBoundingClientRect(); if (rect.height && (!lines.length || Math.abs(lines.at(-1).top - rect.top) > 2)) lines.push({ offset, top: rect.top, bottom: rect.bottom }); } }
    return { top, bottom, scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight, first: lines.find(row => row.top >= top - 1)?.offset ?? 0, lines };
  });
}
function visible(pos, offset) { const row = pos.lines.find((row, i) => row.offset <= offset && (pos.lines[i + 1]?.offset ?? Infinity) > offset); return !!row && row.top >= pos.top - 1 && row.bottom <= pos.bottom + 1; }
async function stored() {
  return page.evaluate(() => new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => { const meta = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slot: meta.slotId, hash: meta.runtimeStateHash, digest: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (e) { reject(e); } }; }; }));
}
async function archives() { return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().filter(key => /^world-player\.(collection|replay)\.v1:/u.test(key)).map(key => [key, localStorage.getItem(key)]))); }
async function openSave(intent, ending = false) {
  if (ending) await button('读取存档探索其他路线').click();
  else if (await button('读取存档').isVisible()) await button('读取存档').click();
  else { await button('打开阅读菜单').click(); await button('存读档').click(); }
  await page.getByRole('dialog', { name: '存读档槽位', exact: true }).getByRole('button', { name: intent === 'save' ? '保存进度' : '读取进度', exact: true }).click();
}
async function save(id) { await openSave('save'); await page.locator(`[data-save-slot="${id}"]`).getByRole('button', { name: '保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('关闭存读档').click(); }
async function load(id, ending = false) { await openSave('load', ending); await page.locator(`[data-save-slot="${id}"]`).getByRole('button', { name: '读取', exact: true }).click(); if (await page.locator('.player-load-confirm').isVisible()) await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); await settle(); }
async function extras(ending = false) {
  if (ending) { await button('查看收藏与结局').click(); await button('返回附加内容总览').click(); }
  else if (await button('打开附加内容').isVisible()) await button('打开附加内容').click();
  else { await button('打开阅读菜单').click(); await button('打开附加内容').click(); }
  if (await button('返回附加内容总览').isVisible()) await button('返回附加内容总览').click();
  await button('查看 场景回想').click();
}
async function enter(title, ready = false) {
  await button(`开始回想 ${title}`).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay !== 'inactive');
  if (ready) await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
}

const diagnostics = () => page.evaluate(() => {
  const text = document.querySelector('.player-dialogue__text'), paint = text ? getComputedStyle(text) : null;
  return ({
  state: { pending: document.querySelector('main')?.getAttribute('data-stage-images-pending'), ready: document.querySelector('.player-dialogue')?.getAttribute('data-text-ready') },
  textPaint: paint ? { opacity: paint.opacity, clipPath: paint.clipPath, animationName: paint.animationName } : null,
  scheduler: JSON.parse(document.documentElement.dataset.nativeAtlasScheduler ?? '{}'),
  canvases: Array.from(document.querySelectorAll('canvas[data-native-atlas]')).map(el => ({ asset: el.dataset.assetId, busy: el.getAttribute('aria-busy'), mode: el.dataset.nativeAtlas })),
  trace: window.replayImageTrace ?? [],
  messages: Array.from(document.querySelectorAll('[role="alert"]')).map(el => el.textContent)
  });
});
async function skip() { await button('打开阅读菜单').click(); await button('快进全部').click(); }
async function identity(before) {
  const after = await state();
  for (const key of ['hash', 'host', 'cursor', 'text', 'status', 'replay']) assert.equal(after[key], before[key], key);
}
try {
  await listenBrowserLoopback(server); browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  await context.addInitScript(() => {
    window.replayImageTrace = [];
    new MutationObserver(records => {
      if (!records.some(row => row.attributeName === 'data-native-atlas-scheduler')) return;
      window.replayImageTrace.push({ at: performance.now(), replay: document.querySelector('main')?.dataset.sceneReplay, ...JSON.parse(document.documentElement.dataset.nativeAtlasScheduler ?? '{}') });
      if (window.replayImageTrace.length > 1000) window.replayImageTrace.shift();
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-native-atlas-scheduler'] });
  });
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
  await page.goto(fileMode ? pathToFileURL(path.join(source, 'before-rain-stops.html')).href : `http://127.0.0.1:${server.address().port}/`);
  await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await page.getByLabel('个人字号', { exact: true }).focus(); await page.getByLabel('个人字号', { exact: true }).press('End'); await button('返回故事').click(); await button('开始故事').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await settle();
  await save('manual-1'); const manual = (await stored()).filter(row => row.slot.startsWith('manual-'));
  await skip(); await page.locator('.player-choice button').first().waitFor(); await page.locator('.player-choice button').first().click(); await skip(); await page.waitForFunction(() => document.querySelector('main')?.dataset.playerStatus === 'ended');
  await load('manual-1', true); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  await button('继续下一句').hover(); await page.mouse.wheel(0, 220); await page.waitForFunction(() => document.querySelector('.player-dialogue').scrollTop > 100); await settle();
  const parent = await state(), anchor = await position(), originalArchives = await archives();
  checks.push({ name: 'actual-play-unlocks-replay-then-loads-the-original-manual-body', parent, anchor, manual });
  for (let index = 0; index < 8; index++) {
    await extras(); await enter('雨后的天明');
    const viewport = [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 390, height: 844 }][index % 4];
    await page.setViewportSize(viewport); await button('退出回想，返回原剧情').click();
    await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay === 'inactive'); await settle(); await identity(parent);
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false' || document.querySelector('.player-media-problem-trigger'));
    const returned = await diagnostics(), pos = await position();
    assert.ok(visible(pos, anchor.first));
    let failure = null;
    if (returned.state.pending === 'true') {
      await button('查看媒体问题').click();
      failure = await page.locator('.player-media-error').innerText(); await shot('rapid-image-failure-' + index);
      const failed = await diagnostics();
      // Observe actual physical completion, never forge a released lease.
      await page.waitForFunction(() => JSON.parse(document.documentElement.dataset.nativeAtlasScheduler ?? '{}').ordinaryQuarantinedDecodes === 0);
      await button('重试画面资源').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await identity(parent);
      rapid.push({ index, viewport, returned, failure, failed, recovered: await diagnostics(), explicitRetry: true });
    } else rapid.push({ index, viewport, returned, explicitRetry: false });
  }
  assert.deepEqual((await stored()).filter(row => row.slot.startsWith('manual-')), manual); assert.deepEqual(await archives(), originalArchives);
  checks.push({ name: 'eight-native-rapid-replays-preserve-parent-and-manual-records', rapid, imageFailures: rapid.filter(row => row.failure).length });
  await button('打开阅读菜单').click(); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('project'); await page.getByLabel('减少动效', { exact: true }).uncheck(); await button('返回故事').click();
  await page.waitForFunction(() => document.querySelector('.player-dialogue')?.dataset.textReady === 'true');
  const revealed = await state(), beforeReveal = await diagnostics(); assert.equal(beforeReveal.state.ready, 'true');
  assert.equal(await page.locator('main').getAttribute('data-settings-reduce-motion'), 'false');
  const duration = Number(await page.locator('.player-dialogue').getAttribute('data-text-reveal-duration')); assert.ok(duration > 0);
  await extras(); await enter('雨后的天明', true); await button('退出回想，返回原剧情').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay === 'inactive'); await settle(); await identity(revealed);
  const afterReveal = await diagnostics(); await shot('default-reveal-return');
  checks.push({ name: 'default-reveal-does-not-cover-the-already-read-parent', duration, before: beforeReveal, after: afterReveal });
  if (faultMode) {
    const assetId = await page.locator('.player-stage-background').first().getAttribute('data-asset-id');
    const publicMedia = readGamePayload(Buffer.from(files['index.html']).toString()).mediaAssets;
    brokenAsset = publicMedia.find(row => row.assetId === assetId).url.replace(/^\.\//u, ''); const target = brokenAsset;
    await extras(); await enter('雨后的天明', true); await button('退出回想，返回原剧情').click();
    await button('查看媒体问题').click(); await page.locator('.player-media-error').getByText(/画面资源超过安全预算/u).waitFor(); assert.ok(faultRequests.length > 0);
    const failed = await diagnostics(); await shot('actual-broken-response-before-explicit-retry'); await identity(revealed);
    brokenAsset = null; await button('重试画面资源').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    await identity(revealed); assert.ok(visible(await position(), anchor.first)); assert.deepEqual((await stored()).filter(row => row.slot.startsWith('manual-')), manual); assert.deepEqual(await archives(), originalArchives);
    checks.push({ name: 'controlled-oversized-png-header-stays-explicitly-retryable-with-parent-and-records-intact', target, faultRequests, failed, recovered: await diagnostics(), manualPreserved: true });
  }
  if (baseline) assert.ok(rapid.some(row => row.failure) || afterReveal.state.ready === 'false', 'Baseline did not reproduce either open finding');
  else { assert.equal(rapid.filter(row => row.failure).length, 0); assert.equal(afterReveal.state.ready, 'true'); assert.equal(afterReveal.textPaint.opacity, '1'); assert.equal(afterReveal.textPaint.animationName, 'none'); assert.equal(afterReveal.textPaint.clipPath, 'none'); }
  assert.deepEqual(errors, []);
  await writeFile(reportPath, JSON.stringify({ passed: true, baseline, engine, fileMode, faultMode, artifacts, checks, errors, scope: 'Actual UI skip-all unlocks one route (not full natural/manual reading); real manual save/read, eight rapid replay exits with native renderer diagnostics and explicit retry when needed, default project reveal with no reduced-motion override. Optional --fault serves a controlled 24-byte PNG header declaring 4097x4097 for a real browser request, exercising strict preflight rejection rather than a large physical decode; original files unchanged. No injected session/unlocks/native media events; desktop engines and phone viewport are not physical phones or OS/rights/HTTPS acceptance.' }, null, 2));
  console.log(`PASS ${engine}${fileMode ? '-file' : ''} replay recovery (${checks.length} checks)`);
} catch (error) {
  if (page && !page.isClosed()) await shot('failure').catch(() => {});
  await writeFile(reportPath, JSON.stringify({ passed: false, baseline, engine, fileMode, artifacts, checks, rapid, errors, diagnostics: await diagnostics().catch(() => null), error: String(error), stack: error.stack }, null, 2)); throw error;
} finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

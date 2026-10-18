import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha, json, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
import { rainRouteContract, assertRouteObservation, assertMatrixCoverage } from './web-work-continuity-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(root, process.env.STUDIO_WORK_CONTINUITY_SOURCE_DIRECTORY ?? 'evidence/web-progress-recovery');
const output = path.resolve(root, process.env.STUDIO_WORK_CONTINUITY_OUTPUT_DIRECTORY ?? 'evidence/web-work-continuity-matrix');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium', matrix = process.argv.includes('--matrix');
const expectedVersion = process.argv.find(arg => arg.startsWith('--version='))?.slice(10) ?? '1.11.0';
assert.ok(['1.11.0', '1.12.0'].includes(expectedVersion), 'Unsupported frozen story version');
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine)); assert.ok(!matrix || ['chromium', 'firefox'].includes(engine), 'Full native voice matrix requires Chromium or Firefox; Windows WebKit embedded/offline audio remains unverified');
await mkdir(output, { recursive: true }); const reportPath = path.join(output, matrix ? 'matrix.json' : `${engine}-navigation.json`);
try { await access(reportPath); throw Error('Refusing to replace an existing continuity report; choose a new output directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const htmlBytes = await readFile(path.join(source, 'before-rain-stops.html')), zipBytes = await readFile(path.join(source, 'before-rain-stops-website.zip'));
const delivery = json(await readFile(path.join(source, 'delivery.json')));
for (const [bytes, kind] of [[htmlBytes, 'html'], [zipBytes, 'website']]) { assert.equal(bytes.length, delivery.artifacts[kind].bytes); assert.equal(sha(bytes), delivery.artifacts[kind].sha256); }
const website = unzipSync(zipBytes), payload = readGamePayload(htmlBytes.toString()), project = payload.project;
assert.deepEqual(readGamePayload(Buffer.from(website['index.html']).toString()).project, project);
const version = project.manifest.preservedFields.webPublication.version; assert.equal(version, expectedVersion);
const expectedMediaCount = version === '1.12.0' ? 28 : 26;
assert.equal(payload.mediaAssets.length, expectedMediaCount);
const build = json(website['build-info.json']); assert.equal(Object.keys(website).length, expectedMediaCount + 11);
for (const file of build.files) { assert.equal(website[file.path].length, file.byteLength); assert.equal('sha256:' + sha(website[file.path]), file.digest); }
const contracts = [rainRouteContract(project, 0), rainRouteContract(project, 1)];
for (const contract of contracts) { assert.equal(contract.texts.length, 66); assert.equal(contract.voices.length, 6); }
await writeFile(reportPath, JSON.stringify({ passed: false, status: 'running' }));
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  if (pathname === '/away') return res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('<!doctype html><html lang="en"><title>Outside the game</title><p>Outside the game</p></html>');
  const name = pathname.startsWith('/gal/') ? decodeURIComponent(pathname.slice(5)) || 'index.html' : '', bytes = website[name];
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml' }[path.extname(name)] ?? 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' }, range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
});
let browser, current; const errors = [], checks = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const state = page => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, auto: el.dataset.autoPlayback, recovery: el.dataset.recoveryOperation, host: el.dataset.hostActivity, text: el.querySelector('.player-dialogue__text')?.textContent }));
async function settle(page) { await page.evaluate(() => document.fonts.ready); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function stored(page, store) {
  return page.evaluate(store => new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onerror = () => reject(r.error); r.onsuccess = () => {
    const db = r.result, tx = db.transaction(store, 'readonly'), get = tx.objectStore(store).getAll(); get.onerror = () => reject(get.error); tx.oncomplete = () => db.close();
    get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => {
      const bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave), metadata = row.metadata ?? row;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return { ...metadata, serializedSessionSave: undefined, storedEncoding: row.encoding ?? 'plain', storedPayloadBytes: bytes.byteLength, storedPayloadSha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') };
    }))); } catch (error) { reject(error); } };
  }; }), store);
}
async function durable(page, hash) { for (let i = 0; i < 100; i++) { if ((await stored(page, 'recovery-sessions')).some(row => row.runtimeStateHash === hash)) return; await page.waitForTimeout(100); } throw Error('Requested recovery did not actually reach IndexedDB'); }
async function menu(page) { await button(page, '打开阅读菜单').click(); }
async function returnStory(page) { await page.getByRole('dialog', { name: '阅读菜单' }).getByRole('button', { name: '返回故事', exact: true }).click(); }
async function setup(format, largeFont = false, offline = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript(() => { window.continuityDocument = crypto.randomUUID(); window.continuityEvents = []; for (const name of ['pagehide', 'pageshow']) window.addEventListener(name, event => { window.continuityEvents.push({ name, persisted: event.persisted, trusted: event.isTrusted }); }); });
  const page = await context.newPage(); current = page; page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
  const url = format === 'html' ? pathToFileURL(path.join(source, 'before-rain-stops.html')).href : `http://127.0.0.1:${server.address().port}/gal/`;
  await page.goto(url); await button(page, '打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check();
  if (largeFont) { await page.getByLabel('个人字号', { exact: true }).focus(); await page.getByLabel('个人字号', { exact: true }).press('End'); }
  await button(page, '返回故事').click();
  if (offline) { await page.locator('#offline-panel > summary').click(); await button(page, '下载离线内容').click(); await page.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 }); await context.setOffline(true); assert.equal((await page.reload()).fromServiceWorker(), true); }
  await button(page, '开始故事').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await settle(page);
  return { context, page, url };
}
async function navigateBack(page, before) {
  await durable(page, before.hash); const originalDocument = await page.evaluate(() => window.continuityDocument);
  await page.goto(`http://127.0.0.1:${server.address().port}/away`); await page.getByText('Outside the game', { exact: true }).waitFor(); await page.goBack(); await page.locator('main.player-shell').waitFor();
  let explicitRecovery = false;
  // A fresh document can render its title before the native recovery read has
  // finished. Await the actual enabled action instead of taking one early
  // visibility snapshot and incorrectly expecting it to recover itself.
  if (await page.locator('main.player-shell').getAttribute('data-player-status') === 'title') { await button(page, '恢复上次进度').click(); explicitRecovery = true; }
  await page.locator('.player-dialogue').waitFor(); await settle(page); const after = await state(page); assert.equal(after.hash, before.hash); assert.equal(after.cursor, before.cursor); assert.equal(after.text, before.text); assert.equal(after.auto, 'off');
  const lifecycle = await page.evaluate(originalDocument => ({ originalDocument, returnedDocument: window.continuityDocument, events: window.continuityEvents }), originalDocument);
  assert.ok(lifecycle.events.some(event => event.name === 'pageshow' && event.trusted));
  return { before, after, explicitRecovery, ...lifecycle };
}
async function position(page) {
  return page.locator('.player-dialogue').evaluate(el => {
    const box = el.getBoundingClientRect(), scale = box.height / el.offsetHeight, top = box.top + el.clientTop * scale, bottom = top + el.clientHeight * scale;
    const walker = document.createTreeWalker(el.querySelector('.player-dialogue__text'), 4), lines = []; let node, offset = 0;
    while ((node = walker.nextNode())) { if (node.parentElement.closest('rt,rp')) continue; for (let i = 0; i < node.length; i++, offset++) { const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1); const r = range.getBoundingClientRect(); if (r.height && (!lines.length || Math.abs(lines.at(-1).top - r.top) > 2)) lines.push({ offset, top: r.top, bottom: r.bottom }); } }
    return { top, bottom, scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight, first: lines.find(row => row.top >= top - 1)?.offset ?? 0, lines };
  });
}
function visible(position, offset) { const row = position.lines.find((row, i) => row.offset <= offset && (position.lines[i + 1]?.offset ?? Infinity) > offset); return !!row && row.top >= position.top - 1 && row.bottom <= position.bottom + 1; }
async function navigation(format) {
  const { page, context } = await setup(format, true); const paragraph = button(page, '继续下一句'); await paragraph.hover(); await page.mouse.wheel(0, 220); await page.waitForFunction(() => document.querySelector('.player-dialogue').scrollTop > 100); await settle(page);
  const anchor = await position(page); assert.ok(anchor.first > 0); const before = await state(page);
  await menu(page); await button(page, '快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await returnStory(page); const saved = await stored(page, 'save-slots');
  const navigation = await navigateBack(page, before), resumed = await position(page); assert.ok(visible(resumed, anchor.first), 'Native navigation lost the visible text anchor');
  const layouts = [];
  for (const viewport of [{ width: 320, height: 740 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const prior = await position(page); await page.setViewportSize(viewport); await settle(page); const actual = await position(page);
    if (prior.max - prior.scrollTop <= 2) assert.ok(actual.max - actual.scrollTop <= 2, 'End anchor must remain at the end after reflow'); else assert.ok(visible(actual, prior.first));
    const unread = actual.max - actual.scrollTop > 2;
    if (unread) { await paragraph.tap(); assert.equal((await state(page)).hash, before.hash, 'First native tap should page the unread paragraph, not skip it'); }
    const paged = await position(page); await menu(page); await returnStory(page); assert.equal((await position(page)).scrollTop, paged.scrollTop); layouts.push({ viewport, prior, position: actual, paged, nativeTap: unread });
  }
  assert.deepEqual(await stored(page, 'save-slots'), saved); await page.screenshot({ path: path.join(output, `${engine}-${format}-native-return.png`), animations: 'disabled' });
  checks.push({ name: 'native-navigation-preserves-current-paragraph-and-visible-anchor', format, navigation, anchor, resumed, layouts, formalSlotsPreserved: true }); await context.close();
}
async function route(format, branch) {
  const { context, page } = await setup(format, false, format === 'website');
  const expected = contracts[branch], texts = [], voices = [], byText = new Map(Object.values(project.scripts).flatMap(script => script.statements).filter(row => ['narration', 'dialogue'].includes(row.kind)).map(row => [row.text, row]));
  const observed = { texts, voices, voiceProof: [], autoAdvanced: false, explicitLoadStoppedAuto: false, actualReopenResumed: false, slotPreserved: false }, target = branch ? 'stmt_ui_219' : 'stmt_ui_137';
  for (let i = 0; i < 260 && (await page.locator('main').getAttribute('data-player-status')) !== 'ended'; i++) {
    if (await page.locator('.player-choice button').count()) { await page.locator('.player-choice button').nth(branch).click(); continue; }
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    const text = (await page.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(text); assert.ok(statement, 'Unexpected prose'); if (texts.at(-1) !== statement.id) texts.push(statement.id);
    if (await page.locator('audio[data-audio-bus="voice"]').count()) {
      voices.push(statement.id);
      if (!observed.autoAdvanced) {
        await page.locator('audio[data-audio-bus="voice"]').evaluate(voice => {
          const read = () => ({ assetId: voice.dataset.assetId, nativeEnded: voice.ended, error: voice.error?.code ?? null, duration: voice.duration, completedTime: voice.currentTime });
          window.continuityVoiceProof = read(); voice.addEventListener('ended', event => { window.continuityVoiceProof = { ...read(), trustedEndedEvent: event.isTrusted }; }, { once: true });
        });
        const before = await state(page); await menu(page); await page.getByLabel('自动阅读节奏', { exact: true }).selectOption('brisk'); await button(page, '自动播放').click(); await returnStory(page); await page.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash !== hash, before.hash, { timeout: 15000 }); await button(page, '停止自动阅读').click();
        const proof = await page.evaluate(() => window.continuityVoiceProof); assert.equal(proof.nativeEnded, true); assert.equal(proof.error, null); observed.voiceProof.push({ statementId: statement.id, ...proof }); observed.autoAdvanced = true; continue;
      }
      await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended);
      observed.voiceProof.push({ statementId: statement.id, ...await page.locator('audio[data-audio-bus="voice"]').evaluate(voice => ({ assetId: voice.dataset.assetId, nativeEnded: voice.ended, error: voice.error?.code ?? null, duration: voice.duration, completedTime: voice.currentTime })) });
    }
    if (statement.id === target && !observed.explicitLoadStoppedAuto) {
      const before = await state(page); await menu(page); await button(page, '快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); const saved = await stored(page, 'save-slots'); await returnStory(page);
      // Offline routes reload through the real service worker; online local HTML
      // leaves the page and returns through browser history, never synthetic events.
      if (format === 'html') { observed.navigation = await navigateBack(page, before); observed.actualReopenResumed = true; observed.reopenKind = 'native-leave-and-history-back'; }
      else { assert.equal((await page.reload()).fromServiceWorker(), true); await button(page, '恢复上次进度').click(); await page.locator('.player-dialogue').waitFor(); observed.actualReopenResumed = true; observed.reopenKind = 'offline-service-worker-reload'; }
      await menu(page); await button(page, '自动播放').click(); await button(page, '存读档').click();
      const panel = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '读取进度', exact: true }).click(); await panel.getByRole('button', { name: '快速', exact: true }).click(); observed.loadBefore = await state(page); assert.notEqual(observed.loadBefore.auto, 'off');
      await panel.getByRole('button', { name: '读取', exact: true }).click(); if (await page.locator('.player-load-confirm').isVisible()) await button(page, '确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); observed.loadAfter = await state(page);
      assert.equal((await state(page)).hash, before.hash); assert.equal((await state(page)).auto, 'off'); assert.deepEqual(await stored(page, 'save-slots'), saved); observed.explicitLoadStoppedAuto = true; observed.slotPreserved = true;
    }
    await button(page, '继续下一句').click();
  }
  observed.ending = await page.locator('.player-ending h2').innerText(); assertRouteObservation(expected, observed);
  const row = { name: 'complete-format-route-cell', format, branch, offline: format === 'website', passed: true, ...observed }; checks.push(row); await page.screenshot({ path: path.join(output, `matrix-${format}-${branch}-ending.png`), animations: 'disabled' }); await context.close(); console.log(`PASS full ${format} route ${branch}`);
}
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
  if (matrix) { for (const format of ['html', 'website']) for (const branch of [0, 1]) await route(format, branch); assertMatrixCoverage(checks); }
  else for (const format of ['html', 'website']) await navigation(format);
  for (const [bytes, kind] of [[await readFile(path.join(source, 'before-rain-stops.html')), 'html'], [await readFile(path.join(source, 'before-rain-stops-website.zip')), 'website']]) assert.equal(sha(bytes), delivery.artifacts[kind].sha256);
  assert.deepEqual(errors, []); await writeFile(reportPath, JSON.stringify({ passed: true, engine, browser: browser.version(), version, artifacts: delivery.artifacts, source: path.relative(root, source).replaceAll('\\', '/'), checks, errors, scope: matrix ? `Four distinct format/route cells in desktop ${engine} using actual frozen ${version} game, both website routes reloaded offline from native service worker, each 66 exact prose IDs and six native voice completions (output muted), Auto and explicit load. HTML routes also actual leave/back. No author re-export, physical phone/Safari, natural listening/timing, rights, public deployment or long soak.` : 'Actual native leave/back and pageshow, explicit recovery when a new document loads, local text anchor and unchanged formal slots across phone-sized reflow and real taps, actual HTML and website. No synthetic lifecycle, native media or narrative events. Not physical phone/background/lock/Safari, audio acceptance or long soak.' }, null, 2)); console.log(`PASS ${engine} ${matrix ? 'full matrix' : 'native navigation'}`);
} catch (error) { if (current && !current.isClosed()) await current.screenshot({ path: path.join(output, `${engine}-${matrix ? 'matrix' : 'navigation'}-failure.png`), animations: 'disabled' }).catch(() => {}); await writeFile(reportPath, JSON.stringify({ passed: false, engine, artifacts: delivery.artifacts, checks, errors, error: String(error), stack: error.stack }, null, 2)); throw error; }
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

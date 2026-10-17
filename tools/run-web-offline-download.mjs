import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { json, sha } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-offline-download');
const baseline = path.join(root, 'evidence/web-story-branch-context'), require = createRequire(import.meta.url);
const auditOnly = process.argv.includes('--audit-only');
let engines; if (!auditOnly) { try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); } }
await mkdir(output, { recursive: true });
const oldFiles = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-website.zip')));
let files = oldFiles, heldPath, release, reached, held, blocked, holdTimer;
const requests = [], checks = [], errors = [];
function hold(name) { heldPath = name; held = new Promise((resolve, reject) => { holdTimer = setTimeout(() => reject(Error('No worker request for ' + name)), 30000); reached = () => { clearTimeout(holdTimer); resolve(); }; }); const promise = new Promise(resolve => { release = resolve; }); return promise; }
let gate;
const server = createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/game\//u, '') || 'index.html';
  requests.push(name); if (name === heldPath && req.headers['sec-fetch-dest'] !== 'script') { reached(); await gate; }
  const bytes = files[name]; const headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
  if (blocked === name) return res.writeHead(503, headers).end('Temporarily unavailable');
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
});
if (!auditOnly) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = auditOnly ? undefined : `http://127.0.0.1:${server.address().port}/game/`;
const browser = auditOnly ? undefined : await engines.chromium.launch({ headless: true, args: ['--mute-audio'] });
const button = (p, name) => p.getByRole('button', { name, exact: true });
const offline = async p => { if (!await p.locator('#offline-panel').isVisible()) await button(p, '打开阅读菜单').click(); if (!await p.locator('#offline-panel').evaluate(el => el.open)) await p.locator('#offline-panel > summary').click(); };
const screenshot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log('PASS ' + name); };
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
let current;
async function download(p, action) { const event = p.waitForEvent('download'); await action(); return readFile(await (await event).path()); }
async function author() {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); current = p; p.on('pageerror', e => errors.push(String(e)));
  const dist = path.join(root, 'apps/editor/dist'), html = await readFile(path.join(dist, 'index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), html);
  for (const [, name] of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) assert.equal(sha(await readFile(path.join(dist, name))), sha(new Uint8Array(await (await fetch(new URL(name, ui))).arrayBuffer())));
  const source = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip')));
  await p.goto(ui); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops-project.zip'));
  await p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await p.getByLabel('项目菜单', { exact: true }).click(); const restored = unzipSync(await download(p, () => p.getByRole('button', { name: /导出工程 ZIP/u }).click()));
  assert.deepEqual(Object.keys(restored).sort(), Object.keys(source).sort()); for (const [name, data] of Object.entries(source)) assert.equal(sha(restored[name]), sha(data), name);
  await p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await button(p, '继续：导出方式 →').click();
  for (const format of ['html', 'website']) {
    if (format === 'website') await p.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/u }).click();
    await p.locator(`input[name="publication-format"][value="${format}"]`).check(); await p.getByLabel('同时生成制作交付包', { exact: true }).uncheck(); await button(p, '继续：生成游戏 →').click();
    await p.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(p, format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP').click();
    const link = p.getByRole('link', { name: format === 'html' ? '下载游戏' : '下载网站上传包', exact: true }); await link.waitFor({ timeout: 90000 }); const bytes = await download(p, () => link.click());
    if (format === 'html') assert.equal(sha(bytes), sha(await readFile(path.join(baseline, 'before-rain-stops.html'))), 'Standalone HTML remains byte-identical');
    else { await writeFile(path.join(output, 'before-rain-stops-website.zip'), bytes); files = unzipSync(bytes); }
  }
  check('actual-editor-import-roundtrip-html-byte-identical-and-new-website-export'); await p.close();
}
async function stable(p) { await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); }
const hash = p => p.locator('main.player-shell').getAttribute('data-runtime-state-hash');
async function closeMenu(p) { await p.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '返回故事', exact: true }).click(); }
async function quickSave(p) { if (!await p.getByRole('dialog', { name: '阅读菜单', exact: true }).isVisible()) await button(p, '打开阅读菜单').click(); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await closeMenu(p); }
async function quickLoad(p) {
  await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
  if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); await stable(p);
}
async function cached(p) { await p.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 }); await p.waitForFunction(() => navigator.serviceWorker.controller !== null); }
async function cacheAudit(p, inventory) {
  return p.evaluate(async inventory => {
    const cacheNames = (await caches.keys()).filter(n => n.startsWith('world-offline:' + encodeURIComponent(new URL('./', location.href).href) + ':')), mismatches = [];
    for (const name of cacheNames) { const cache = await caches.open(name); for (const [file, digest] of Object.entries(inventory)) { const response = await cache.match(new URL(file, location.href)); if (!response) { mismatches.push(file + ':missing'); continue; } const bytes = await response.arrayBuffer(); const value = 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join(''); if (value !== digest) mismatches.push(file + ':digest'); } }
    return { cacheNames, mismatches };
  }, inventory);
}
async function firstDownload() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }), p = await ctx.newPage(); current = p; p.on('pageerror', e => errors.push(String(e)));
  await p.goto(url); await offline(p); gate = hold('player.js'); await button(p, '下载离线内容').click(); await held;
  await p.locator('#offline-summary').filter({ hasText: /下载中 \d+\/\d+/u }).waitFor(); await screenshot(p, 'download-progress-phone');
  await button(p, '开始故事').click(); await stable(p); const savedHash = await hash(p); await quickSave(p); await offline(p);
  assert.match(await p.locator('#offline-status').innerText(), /\d+ \/ \d+/u); await closeMenu(p); assert.equal(await p.locator('#world-publication-tools').isVisible(), false); await offline(p);
  await button(p, '取消下载').focus(); await p.keyboard.press('Enter'); await p.locator('#offline-summary').filter({ hasText: '已取消' }).waitFor(); release(); heldPath = undefined;
  assert.ok(await button(p, '重试离线下载').evaluate(el => el === document.activeElement));
  assert.equal(await hash(p), savedHash); await button(p, '重试离线下载').waitFor(); await screenshot(p, 'cancelled-in-reading-menu');
  blocked = 'player.js'; await button(p, '重试离线下载').click(); await p.locator('#offline-status').filter({ hasText: 'HTTP 503' }).waitFor(); assert.match(await p.locator('#offline-status').innerText(), /player\.js/u); await screenshot(p, 'failed-file-and-retry');
  blocked = undefined; await button(p, '重试离线下载').click(); await cached(p); assert.equal(await hash(p), savedHash);
  const inventory = JSON.parse(new TextDecoder().decode(files['sw.js']).match(/^const inventory = (.*);$/mu)[1]);
  const cachedFiles = await cacheAudit(p, inventory); assert.equal(cachedFiles.cacheNames.length, 1); assert.deepEqual(cachedFiles.mismatches, []);
  check('first-download-progress-reading-save-menu-cancel-failed-file-and-retry', { savedHash, inventoryFiles: Object.keys(inventory).length });
  // Remove a single not-yet-used background from this browser's real cache.
  const payload = await import('./audit-rain-story-refinement.mjs').then(m => m.readGamePayload(Buffer.from(files['index.html']).toString('utf8'))), missing = payload.mediaAssets.find(a => a.assetId === 'bus_stop_night').url;
  await p.evaluate(async file => { for (const name of await caches.keys()) await (await caches.open(name)).delete(new URL(file, location.href)); }, missing);
  await p.reload(); await quickLoad(p); await offline(p); await button(p, '重试离线下载').waitFor(); gate = hold(missing); await button(p, '重试离线下载').click(); await held;
  await button(p, '取消下载').click(); await p.locator('#offline-summary').filter({ hasText: '已取消' }).waitFor(); release(); heldPath = undefined;
  const partial = await cacheAudit(p, inventory); assert.deepEqual(partial.mismatches, [missing + ':missing']); assert.equal(await hash(p), savedHash);
  await button(p, '重试离线下载').click(); await cached(p); assert.deepEqual((await cacheAudit(p, inventory)).mismatches, []); await screenshot(p, 'repaired-cache');
  await closeMenu(p); await ctx.setOffline(true); assert.equal((await p.reload()).fromServiceWorker(), true); await quickLoad(p); assert.equal(await hash(p), savedHash);
  check('missing-cache-repair-cancel-preserves-good-files-retry-and-offline-save-restore', { missing, savedHash });
  await ctx.close();
}
async function upgrade() {
  const latest = files; files = oldFiles; const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' }), p = await ctx.newPage(); current = p; p.on('pageerror', e => errors.push(String(e)));
  await p.goto(url); await button(p, '开始故事').click(); await stable(p); await quickSave(p); const savedHash = await hash(p); await offline(p); await button(p, '下载离线内容').click(); await cached(p);
  const oldKeys = await p.evaluate(() => caches.keys()); gate = hold('player.js'); files = latest;
  // A hard refresh obtains the actual new page while retaining the old active
  // worker, cache and quick slot. It does not forge any game or worker bytes.
  const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); await cdp.send('Network.setBypassServiceWorker', { bypass: true }); const fresh = await p.reload(); assert.equal(fresh.fromServiceWorker(), false); assert.equal(await p.locator('#offline-cancel').count(), 1, 'Hard refresh must obtain the real new page'); await cdp.send('Network.setBypassServiceWorker', { bypass: false });
  await quickLoad(p); assert.equal(await hash(p), savedHash); await offline(p); await p.locator('#offline-cancel').waitFor({ state: 'attached' });
  if (!await button(p, '取消下载').isVisible()) await button(p, '检查更新').click(); await held; await button(p, '取消下载').click(); await p.locator('#offline-summary').filter({ hasText: '已取消' }).waitFor(); release(); heldPath = undefined;
  assert.equal(await hash(p), savedHash); assert.deepEqual(await p.evaluate(() => caches.keys()), oldKeys); await screenshot(p, 'update-cancel-retains-original');
  blocked = 'player.js'; await button(p, '重试更新').click(); await p.locator('#offline-status').filter({ hasText: 'HTTP 503' }).waitFor(); assert.deepEqual(await p.evaluate(() => caches.keys()), oldKeys);
  blocked = undefined; await button(p, '重试更新').click(); await p.locator('#offline-summary').filter({ hasText: '新版等待重开' }).waitFor({ timeout: 90000 }); assert.equal(await hash(p), savedHash); await screenshot(p, 'update-waits-for-close');
  await p.close(); const reopened = await ctx.newPage(); current = reopened; reopened.on('pageerror', e => errors.push(String(e))); await reopened.goto(url); await offline(reopened); await cached(reopened); await ctx.setOffline(true);
  assert.equal((await reopened.reload()).fromServiceWorker(), true); await quickLoad(reopened); assert.equal(await hash(reopened), savedHash); await screenshot(reopened, 'updated-offline-quick-slot');
  check('actual-previous-cache-hard-refresh-update-cancel-failure-retry-wait-close-and-offline-load', { savedHash, sameContentVersion: '1.9.0', hardRefreshViaCdp: true, loopbackOnly: true }); await ctx.close();
}
async function fullRoute(branch) {
  const ctx = await browser.newContext({ viewport: branch ? { width: 390, height: 844 } : { width: 1280, height: 900 }, reducedMotion: 'reduce' }), p = await ctx.newPage(); current = p; p.on('pageerror', e => errors.push(String(e)));
  await p.goto(url);
  if (!branch) { await offline(p); await button(p, '下载离线内容').click(); await cached(p); await ctx.setOffline(true); assert.equal((await p.reload()).fromServiceWorker(), true); }
  await button(p, '打开玩家设置').click(); await p.getByLabel('静音全部声音', { exact: true }).check(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button(p, '返回故事').click(); await button(p, '开始故事').click();
  const source = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), statements = Object.entries(source).filter(([n]) => n.startsWith('scripts/')).flatMap(([, b]) => json(b).statements), byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  const ids = [], voices = new Set(); let restored = false;
  for (let i = 0; i < 300 && await p.locator('main.player-shell').getAttribute('data-player-status') !== 'ended'; i++) {
    const choices = p.locator('.player-choice button'); if (await choices.count()) { await choices.nth(branch).click(); continue; }
    await stable(p); const text = (await p.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(text); assert.ok(statement, text); if (ids.at(-1) !== statement.id) ids.push(statement.id);
    if (await p.locator('audio[data-audio-bus="voice"]').count()) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(statement.id); }
    if (!restored && statement.id === (branch ? 'stmt_ui_238' : 'stmt_ui_137')) { const saved = await hash(p); await quickSave(p); await p.reload(); await quickLoad(p); assert.equal(await hash(p), saved); restored = true; }
    assert.equal(await p.locator('.player-media-error').count(), 0); assert.equal(await p.locator('#world-publication-tools').isVisible(), false); await button(p, '继续下一句').click();
  }
  assert.equal(await p.locator('main.player-shell').getAttribute('data-player-status'), 'ended'); assert.equal(ids.length, 66); assert.equal(voices.size, 6); assert.equal(restored, true);
  const scenes = Object.entries(source).filter(([n]) => n.startsWith('scenes/')).map(([, b]) => json(b)), titles = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch ? ['远行', '车窗与海', '再一次见面'] : ['留下', '灯下的回信', '雨后的天明'])];
  assert.deepEqual(ids, titles.flatMap(title => json(source[scenes.find(s => s.title === title).scriptPath]).statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id)));
  await screenshot(p, `route-${branch}-ending`); check(`website-${branch ? 'online-phone-remote' : 'offline-desktop-stay'}-full-route`, { ids, voices: voices.size, ending: await p.locator('.player-ending').innerText(), saveReloadRestored: restored }); await ctx.close();
}
async function artifactAudit() {
  const allowed = ['index.html', 'offline.js', 'sw.js', 'build-info.json']; assert.deepEqual(Object.keys(files).sort(), Object.keys(oldFiles).sort());
  for (const [name, bytes] of Object.entries(oldFiles)) if (!allowed.includes(name)) assert.equal(sha(files[name]), sha(bytes), name);
  const { readGamePayload } = await import('./audit-rain-story-refinement.mjs'); assert.deepEqual(readGamePayload(Buffer.from(files['index.html']).toString()).project, readGamePayload(Buffer.from(oldFiles['index.html']).toString()).project);
  const info = json(files['build-info.json']); assert.equal(Object.keys(files).length, 37); assert.deepEqual(Object.keys(files).sort(), ['build-info.json', ...info.files.map(r => r.path)].sort());
  for (const file of info.files) { assert.equal(files[file.path].length, file.byteLength); assert.equal('sha256:' + sha(files[file.path]), file.digest); }
  const sourceBytes = await readFile(path.join(baseline, 'before-rain-stops-project.zip')), htmlBytes = await readFile(path.join(baseline, 'before-rain-stops.html')), websiteBytes = await readFile(path.join(output, 'before-rain-stops-website.zip'));
  const result = { passed: true, version: '1.9.0', sourceUnchanged: { path: 'evidence/web-story-branch-context/before-rain-stops-project.zip', sha256: sha(sourceBytes), entries: 66 }, htmlByteIdentical: { path: 'evidence/web-story-branch-context/before-rain-stops.html', sha256: sha(htmlBytes) }, unchangedMedia: 26, websiteFiles: 37, allowedChangedFiles: allowed, website: { byteLength: websiteBytes.length, sha256: sha(websiteBytes) } };
  await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(result, null, 2)); check('exact-website-only-four-file-delta-story-26-media-source-and-html-preserved', result);
}
try {
  if (auditOnly) { files = unzipSync(await readFile(path.join(output, 'before-rain-stops-website.zip'))); await artifactAudit(); }
  else if (process.argv.includes('--baseline-only')) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); p.on('pageerror', e => errors.push(String(e)));
  await p.goto(url); await offline(p); gate = hold('player.js'); await button(p, '下载离线内容').click(); await held;
  const state = { summary: await p.locator('#offline-summary').innerText(), status: await p.locator('#offline-status').innerText(), cancelButtons: await button(p, '取消下载').count() };
  assert.equal(state.summary, '下载中'); assert.equal(state.cancelButtons, 0); assert.doesNotMatch(state.status, /\d+\s*\/\s*\d+/u);
  await screenshot(p, 'baseline-no-progress-or-cancel'); await writeFile(path.join(output, 'baseline.json'), JSON.stringify({ passed: true, state, sourceVersion: '1.9.0', websiteSha256: sha(await readFile(path.join(baseline, 'before-rain-stops-website.zip'))), heldFile: 'player.js', loopbackOnly: true }, null, 2));
  release(); heldPath = undefined; await p.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 }); await p.close();
  check('baseline-reproduces-unobservable-download-without-cancel', state);
  } else {
    if (!process.argv.includes('--play-only')) await author(); else files = unzipSync(await readFile(path.join(output, 'before-rain-stops-website.zip')));
    await artifactAudit(); await firstDownload(); await upgrade(); await fullRoute(0); await fullRoute(1); assert.deepEqual(errors, []);
    await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), checks, errors, scope: 'Actual same-content 1.9.0 UI export and Chromium Service Worker cache lifecycle on loopback. One full offline desktop route and one online phone-size route, native audio muted and voices naturally ended. Hard refresh used CDP to obtain new UI with real old active cache; no worker/game bytes fabricated. No public hosting, physical phone, Safari, human listening, integrity revalidation of previously cached files, or long-story acceptance.' }, null, 2));
  }
} catch (error) {
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); if (current && !current.isClosed()) await screenshot(current, 'failure'); throw error;
} finally { clearTimeout(holdTimer); release?.(); await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

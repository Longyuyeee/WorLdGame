import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { pollBrowserState } from './poll-browser-state.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_CANDIDATE_OUTPUT_DIRECTORY ?? 'evidence/web-audio-compatibility');
await mkdir(output, { recursive: true });
const priorDirectory = path.resolve(root, process.env.STUDIO_PRIOR_EVIDENCE_DIRECTORY ?? 'evidence/web-deployment-flow');
const previousPath = path.join(priorDirectory, 'before-rain-stops-project.zip'), previous = unzipSync(await readFile(previousPath));
const priorGame = unzipSync(await readFile(path.join(priorDirectory, 'before-rain-stops-web.zip')));
const priorManifest = json(previous['world.project.json']), priorVersion = priorManifest.webPublication.version;
const candidateVersion = process.env.STUDIO_CANDIDATE_VERSION ?? '1.7.3';
const compatibleVersions = [...new Set([...priorManifest.webSaveCompatibility.versions, priorVersion])];
const mediaProbePath = path.resolve(root, process.env.STUDIO_MEDIA_PROBE_REPORT ?? path.join(output, 'native-media-probe.json'));
const assertWorker = process.env.STUDIO_ASSERT_RECOVERY_WORKER === '1';
const checks = [], errors = [], routes = []; let browser, current, server, files, port, served, fail = new Set();
const selectedEngines = (process.env.STUDIO_BROWSER_ENGINES ?? 'chromium,firefox,webkit').split(',');
assert.ok(selectedEngines.length > 0 && new Set(selectedEngines).size === selectedEngines.length && selectedEngines.every(engine => ['chromium', 'firefox', 'webkit'].includes(engine)));
const check = (name, detail = {}) => { checks.push({ name, ...detail }); console.log('PASS ' + name); };
const shot = (page, name) => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
const watch = page => page.on('pageerror', e => errors.push(String(e)));
const hash = page => page.locator('main.player-shell').getAttribute('data-runtime-state-hash');
const nav = (page, name) => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const ready = page => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
async function download(page, trigger, name) { const event = page.waitForEvent('download'); await trigger(); const bytes = await readFile(await (await event).path()); await writeFile(path.join(output, name), bytes); return bytes; }
async function projectMenu(page, name) { await ready(page); if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function author(engines) {
  browser = await engines.chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); current = page; watch(page);
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(previousPath); await ready(page); await nav(page, '发布');
  await page.getByLabel('发布版本', { exact: true }).fill(candidateVersion); await page.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready(page); await page.locator('.web-save-compatibility > summary').click(); await page.getByLabel('核对上一版工程 ZIP', { exact: true }).setInputFiles(previousPath); await page.getByText(`已核对版本：${compatibleVersions.join('、')}。读取不会改写原槽位，继续保存仍遵循手动覆盖确认。`, { exact: true }).waitFor();
  await projectMenu(page, '所有项目'); await page.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await page.reload(); await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready(page);
  await download(page, () => projectMenu(page, '导出工程 ZIP'), 'before-rain-stops-project.zip'); await nav(page, '发布');
  for (const directory of [false, true]) {
    await page.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/ }).click(); await page.getByRole('radio', { name: directory ? /网页目录 ZIP/ : /单文件 HTML/ }).check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByText('故事与素材检查通过', { exact: true }).waitFor(); await page.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 90000 }); await download(page, () => page.getByRole('link', { name: '下载游戏', exact: true }).click(), directory ? 'before-rain-stops-web.zip' : 'before-rain-stops.html');
  }
  await writeFile(path.join(output, 'before-rain-stops.worldreview'), await readFile(path.join(priorDirectory, 'before-rain-stops.worldreview'))); check(`actual-editor-save-reopen-formal-${candidateVersion}-dual-export`); await browser.close(); browser = null;
}
async function audit() {
  const source = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip'))), manifest = json(source['world.project.json']), old = json(previous['world.project.json']);
  assert.deepEqual(Object.keys(source).sort(), Object.keys(previous).sort()); for (const [name, bytes] of Object.entries(previous)) if (name !== 'world.project.json') assert.equal(sha(source[name]), sha(bytes), name);
  assert.deepEqual({ ...manifest, webPublication: old.webPublication, webSaveCompatibility: old.webSaveCompatibility }, old); assert.equal(manifest.webPublication.version, candidateVersion); assert.deepEqual(manifest.webSaveCompatibility.versions, compatibleVersions);
  assert.deepEqual(manifest.webPublication, { ...old.webPublication, version: candidateVersion }); assert.equal(manifest.webAssetSources.records.length, 25); assert.ok(manifest.webAssetSources.records.every(row => row.permission === 'pending'));
  files = unzipSync(await readFile(path.join(output, 'before-rain-stops-web.zip'))); served = files; const payload = readGamePayload(strFromU8(files['index.html'])); assert.deepEqual(payload.project, readGamePayload(await readFile(path.join(output, 'before-rain-stops.html'), 'utf8')).project); assert.equal(payload.project.manifest.preservedFields.webAssetSources, undefined);
  for (const asset of json(source['.world-assets/index.json']).assets) { const key = `.world-assets/blobs/sha256/${asset.source.digest.slice(7, 9)}/${asset.source.digest.slice(9)}`; assert.equal(sha(files[payload.mediaAssets.find(a => a.assetId === asset.assetId).url]), sha(source[key])); }
  const artifacts = {}; for (const name of ['before-rain-stops-project.zip', 'before-rain-stops.html', 'before-rain-stops-web.zip', 'before-rain-stops.worldreview']) { const bytes = await readFile(path.join(output, name)); artifacts[name] = { byteLength: bytes.length, sha256: sha(bytes) }; }
  assert.equal(artifacts['before-rain-stops.worldreview'].sha256, sha(await readFile(path.join(priorDirectory, 'before-rain-stops.worldreview'))));
  await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify({ passed: true, artifacts, unchangedSourceEntries: Object.keys(source).length - 1, unchangedMedia: 25, permissionsPending: 25, publicDeployment: false }, null, 2)); return { source, payload, artifacts };
}
async function startServer() {
  server = createServer((req, res) => { if (req.url === '/probe') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Outside game scope</title>'); const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//, '') || 'index.html'; const bytes = fail.has(name) ? undefined : served[name]; const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream'; const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' }; const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? ''); if (bytes && m) { const start = +m[1], end = Math.min(m[2] ? +m[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end(); return res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes' }).end(bytes.subarray(start, end + 1)); } res.writeHead(bytes ? 200 : 503, headers).end(bytes ?? 'Test missing media'); }); await new Promise(resolve => server.listen(port ?? 0, '127.0.0.1', resolve)); port = server.address().port;
}
const url = () => `http://127.0.0.1:${port}/gal/`;
async function offlinePanel(page) { if (!await page.locator('#offline-panel').evaluate(el => el.open)) await page.locator('#offline-panel > summary').click(); }
async function slots(page, tab = '快速') { if (await page.getByRole('button', { name: '读取存档', exact: true }).isVisible()) await page.getByRole('button', { name: '读取存档', exact: true }).click(); else { const menu = page.getByRole('button', { name: '打开阅读菜单', exact: true }); if (await menu.isVisible()) await menu.click(); await page.getByRole('button', { name: '存读档', exact: true }).click(); } const panel = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: tab, exact: true }).click(); return panel; }
async function loadQuick(page) { const panel = await slots(page); await panel.getByRole('button', { name: '读取', exact: true }).click(); const confirm = page.locator('.player-load-confirm'); if (await confirm.isVisible()) await confirm.getByRole('button', { name: '确认读取', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); }
async function saveQuick(page) { await page.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await page.getByRole('button', { name: '快速保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); const close = page.getByRole('button', { name: '关闭阅读菜单', exact: true }); if (await close.isVisible()) await close.click(); }
async function mediaReady(page) { const resume = page.getByRole('button', { name: '恢复声音', exact: true }); if (await resume.isVisible()) await resume.click(); await page.waitForFunction(() => { const a = [...document.querySelectorAll('audio')]; return a.length === 2 && a.every(a => !a.error && !a.paused && a.currentTime > 0); }); }
async function connectivity(context, engine, offline) {
  if (engine !== 'webkit') return context.setOffline(offline);
  const control = json(await readFile(mediaProbePath)).results.find(r => r.engine === 'webkit'); assert.equal(control.cachedFetch.worker, 'worker');
  if (offline && server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await assert.rejects(fetch(url())); }
  else if (!offline && !server.listening) await startServer();
}
async function slotBytes(page, projectId) { return page.evaluate(async projectId => { const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); try { const row = await new Promise((resolve, reject) => { const r = db.transaction('save-slots').objectStore('save-slots').get(projectId + '\0quick-1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); return JSON.stringify(row, (_key, v) => v instanceof ArrayBuffer ? [...new Uint8Array(v)] : ArrayBuffer.isView(v) ? [...new Uint8Array(v.buffer, v.byteOffset, v.byteLength)] : v); } finally { db.close(); } }, projectId); }
async function upgrade(engines, engine, payload) {
  browser = await engines[engine].launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); let page = await context.newPage(); current = page; watch(page); page.setDefaultTimeout(25000); served = priorGame; fail.clear();
  await page.goto(url()); await page.getByRole('button', { name: '开始故事', exact: true }).click(); await mediaReady(page); await saveQuick(page); const oldHash = await hash(page), originalSlot = await slotBytes(page, payload.project.manifest.projectId);
  const panel = await slots(page, '备份'); await panel.getByLabel('备份进度', { exact: true }).selectOption('current'); const backup = await download(page, () => panel.getByRole('button', { name: '导出备份文件', exact: true }).click(), `${engine}-${priorVersion}.worldsave`); await panel.getByRole('button', { name: '关闭存读档', exact: true }).click();
  await offlinePanel(page); await page.getByRole('button', { name: '下载离线内容', exact: true }).click(); await page.locator('#offline-status').filter({ hasText: '离线内容已就绪' }).waitFor({ timeout: 90000 }); await page.waitForFunction(() => navigator.serviceWorker.controller !== null); await connectivity(context, engine, true); assert.equal((await page.reload()).fromServiceWorker(), true); await loadQuick(page); assert.equal(await hash(page), oldHash); await connectivity(context, engine, false);
  served = files; await offlinePanel(page); await page.getByRole('button', { name: '检查更新', exact: true }).click(); await page.locator('#offline-status').filter({ hasText: '新版已下载' }).waitFor({ timeout: 90000 }); const second = await context.newPage(); await second.goto(url()); assert.equal(await second.locator('meta[name="application-version"]').getAttribute('content'), priorVersion); await page.close(); page = second; current = page; watch(page); await pollBrowserState(page, async () => Boolean((await navigator.serviceWorker.getRegistration('./'))?.waiting));
  await shot(page, engine + '-update-waits-for-all-windows');
  const probe = await context.newPage(); await probe.goto(`http://127.0.0.1:${port}/probe`); await page.close(); const version = strFromU8(files['sw.js']).match(/^const version = (.*);$/mu)[1].slice(1, -1);
  await pollBrowserState(probe, async ({ scope, version }) => { const reg = await navigator.serviceWorker.getRegistration(scope); if (!reg?.active || reg.waiting || reg.installing) return false; return new Promise(resolve => { const ch = new MessageChannel(), timer = setTimeout(() => { ch.port1.close(); resolve(false); }, 1000); ch.port1.onmessage = e => { clearTimeout(timer); ch.port1.close(); resolve(e.data.version === version && e.data.ready); }; reg.active.postMessage({ type: 'STATUS' }, [ch.port2]); }); }, { scope: url(), version }, { timeoutMs: 60000 });
  page = await context.newPage(); current = page; watch(page); await page.goto(url()); assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'), candidateVersion); await connectivity(context, engine, true); assert.equal((await page.reload()).fromServiceWorker(), true); await loadQuick(page); assert.equal(await hash(page), oldHash); assert.equal(await slotBytes(page, payload.project.manifest.projectId), originalSlot);
  const imported = await slots(page, '备份'); await imported.getByLabel('选择存档备份文件', { exact: true }).setInputFiles({ name: 'old.worldsave', mimeType: 'application/json', buffer: backup }); await imported.getByText('备份校验通过，请选择手动槽位后导入。', { exact: true }).waitFor(); await imported.getByRole('button', { name: '导入到所选槽位', exact: true }).click(); await imported.getByRole('button', { name: '读取导入的存档', exact: true }).waitFor(); assert.equal(await hash(page), oldHash); await imported.getByRole('button', { name: '读取导入的存档', exact: true }).click(); const confirm = page.locator('.player-load-confirm'); if (await confirm.isVisible()) await confirm.getByRole('button', { name: '确认读取', exact: true }).click(); await imported.waitFor({ state: 'hidden' }); assert.equal(await hash(page), oldHash);
  if (engine === 'webkit') { await page.getByRole('button', { name: '本次先无声阅读', exact: true }).waitFor(); await shot(page, engine + '-actual-offline-media-failure'); await page.getByRole('button', { name: '本次先无声阅读', exact: true }).click(); assert.equal(await hash(page), oldHash); assert.equal(await page.locator('audio').count(), 0); await shot(page, engine + '-actual-offline-silent-old-save'); await connectivity(context, engine, false); await page.getByRole('button', { name: '恢复当前声音', exact: true }).click(); await mediaReady(page); }
  else { await mediaReady(page); await shot(page, engine + '-offline-updated-backup-playing'); await connectivity(context, engine, false); }
  assert.equal(await hash(page), oldHash); assert.equal(await slotBytes(page, payload.project.manifest.projectId), originalSlot); check(`${engine}-actual-${priorVersion}-update-two-windows-offline-backup-explicit-read`, { offlineAudioPlays: engine !== 'webkit', silentFallbackAndOnlineResume: engine === 'webkit', outageMechanism: engine === 'webkit' ? 'origin-stopped' : 'browser-offline' }); await context.close();
  if (engine === 'chromium') { const local = await browser.newContext(), file = await local.newPage(); current = file; watch(file); await file.goto(pathToFileURL(path.join(output, 'before-rain-stops.html')).href); const target = await slots(file, '备份'); await target.getByLabel('选择存档备份文件', { exact: true }).setInputFiles({ name: 'old.worldsave', mimeType: 'application/json', buffer: backup }); await target.getByRole('button', { name: '导入到所选槽位', exact: true }).click(); await target.getByRole('button', { name: '读取导入的存档', exact: true }).click(); await mediaReady(file); assert.equal(await hash(file), oldHash); if (assertWorker) await assertBackgroundRecovery(file, payload.project.manifest.projectId); await shot(file, 'chromium-local-html-old-backup'); check('chromium-file-html-actual-old-backup-and-media', { inlineWorkerChecked: assertWorker }); await local.close(); }
  await browser.close(); browser = null;
}
async function recovery(engines, engine, payload) {
  browser = await engines[engine].launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); const page = await context.newPage(); current = page; watch(page); page.setDefaultTimeout(20000); served = files;
  const theme = payload.mediaAssets.find(a => a.assetId === 'night_travel_theme').url; fail = new Set([theme]); await page.goto(url()); await page.getByRole('button', { name: '开始故事', exact: true }).click(); await page.getByRole('button', { name: '本次先无声阅读', exact: true }).waitFor(); await page.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="ambient"]'); return a && !a.error && a.currentTime > 0; });
  await page.evaluate(() => { window.healthyAudio = document.querySelector('audio[data-audio-bus="ambient"]'); }); const before = await hash(page); await shot(page, engine + '-sound-failure');
  fail.clear(); await page.getByRole('button', { name: '重试媒体', exact: true }).click(); await mediaReady(page); assert.equal(await hash(page), before); assert.equal(await page.evaluate(() => healthyAudio === document.querySelector('audio[data-audio-bus="ambient"]')), true); check(engine + '-real-http-failure-retry-keeps-healthy-rain-and-story'); await saveQuick(page);
  fail = new Set(payload.mediaAssets.filter(a => a.mimeType.startsWith('audio/')).map(a => a.url)); await page.reload(); await loadQuick(page); await page.getByRole('button', { name: '本次先无声阅读', exact: true }).waitFor(); const failedHash = await hash(page); const preferences = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('preferences'))); await page.getByRole('button', { name: '本次先无声阅读', exact: true }).click(); assert.equal(await hash(page), failedHash); assert.equal(await page.locator('audio').count(), 0); await shot(page, engine + '-silent-reading');
  await page.setViewportSize({ width: 320, height: 740 }); await shot(page, engine + '-silent-320'); await page.setViewportSize({ width: 844, height: 390 }); await shot(page, engine + '-silent-landscape'); fail.clear(); await page.getByRole('button', { name: '恢复当前声音', exact: true }).click(); await mediaReady(page); assert.equal(await hash(page), failedHash); assert.deepEqual(await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('preferences'))), preferences); await shot(page, engine + '-sound-restored'); check(engine + '-silent-session-rotation-restore-retains-progress-and-preferences');
  await context.close(); await browser.close(); browser = null;
}
async function route(engines, engine, source, branch, ending) {
  browser = await engines[engine].launch({ headless: true }); const context = await browser.newContext({ viewport: { width: engine === 'chromium' ? 1280 : 390, height: 844 }, reducedMotion: 'reduce' }); const page = await context.newPage(); current = page; watch(page); page.setDefaultTimeout(25000); fail.clear(); served = files;
  const statements = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => json(bytes).statements), byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s])); const ids = [], narrations = new Set(), voices = new Set();
  await page.goto(url()); await page.getByRole('button', { name: '开始故事', exact: true }).click();
  for (let i = 0; i < 500; i++) {
    if (await page.locator('main.player-shell').getAttribute('data-player-status') === 'ended') break;
    if (await page.locator('.player-choice button').count()) { await page.locator('.player-choice').getByRole('button', { name: branch, exact: true }).click(); continue; }
    await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const text = (await page.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(text); assert.ok(statement, text); if (ids.at(-1) !== statement.id) ids.push(statement.id); if (statement.kind === 'narration') narrations.add(statement.id);
    if (statement.kind === 'dialogue' && !voices.has(statement.id)) { await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(statement.id); }
    assert.equal(await page.locator('.player-media-error').count(), 0); await page.getByRole('button', { name: '继续下一句', exact: true }).click();
  }
  assert.equal(await page.locator('main.player-shell').getAttribute('data-player-status'), 'ended'); assert.match(await page.locator('.player-ending').innerText(), new RegExp(ending)); assert.equal(narrations.size, 60); assert.equal(voices.size, 6); assert.equal(ids.length, 66); assert.equal(await page.locator('audio').count(), 0); assert.equal(await page.getByRole('button', { name: '恢复声音', exact: true }).count(), 0);
  let workerDiagnostics = null;
  if (assertWorker) {
    workerDiagnostics = await assertBackgroundRecovery(page, payloadProjectId(source)); const endingHash = workerDiagnostics.protectedStateHash;
    await page.reload(); await page.getByRole('button', { name: '恢复上次进度', exact: true }).click();
    assert.equal(await hash(page), endingHash); assert.equal(await page.locator('main.player-shell').getAttribute('data-player-status'), 'ended');
    await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
    assert.equal(await page.locator('.player-media-error').count(), 0);
  }
  await shot(page, engine + '-' + (branch === '留下等雨停' ? 'stay' : 'leave') + '-ending'); routes.push({ engine, branch, ending, narrationCount: narrations.size, naturallyEndedVoices: voices.size, textIds: ids, noStaleAudioRecoveryAtEnding: true, humanListening: false, workerDiagnostics, endingRestoredAfterReload: assertWorker, restoredStageReady: assertWorker }); check(engine + '-' + ending + '-full-route'); await context.close(); await browser.close(); browser = null;
}
const payloadProjectId = source => json(source['world.project.json']).projectId;
async function assertBackgroundRecovery(page, projectId) {
  const diagnostic = await pollBrowserState(page, async projectId => {
    const expected = document.querySelector('main.player-shell')?.dataset.runtimeStateHash;
    const diagnostic = JSON.parse(document.documentElement.dataset.recoverySerializer ?? 'null');
    if (!diagnostic || diagnostic.active !== 0 || diagnostic.completed < 1) return false;
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      const row = await new Promise((resolve, reject) => { const r = db.transaction('recovery-sessions').objectStore('recovery-sessions').get(projectId); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const settled = JSON.parse(document.documentElement.dataset.recoverySerializer);
      return (row?.metadata ?? row)?.runtimeStateHash === expected && document.querySelector('main.player-shell')?.dataset.runtimeStateHash === expected && settled.active === 0 ? { ...settled, protectedStateHash: expected } : false;
    }
    finally { db.close(); }
  }, projectId);
  assert.equal(diagnostic.active, 0); assert.equal(diagnostic.peakActive, 1); assert.equal(diagnostic.fallback, 0); assert.equal(diagnostic.failed, 0);
  return diagnostic;
}
try {
  let engines; if (!process.argv.includes('--audit-only')) { const require = createRequire(import.meta.url); try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); } if (!process.argv.includes('--reuse-artifacts')) await author(engines); }
  const audited = await audit();
  if (engines && !process.argv.includes('--reuse-artifacts')) await writeFile(path.join(output, 'author-check.json'), JSON.stringify({ passed: true, candidateVersion, artifacts: audited.artifacts, checks, sourceReused: false }, null, 2));
  if (process.argv.includes('--author-only')) process.exitCode = 0;
  if (engines && !process.argv.includes('--author-only')) { await startServer(); for (const engine of selectedEngines) { await recovery(engines, engine, audited.payload); await upgrade(engines, engine, audited.payload); for (const [branch, ending] of [['留下等雨停', '同行的约定'], ['去追最后一班车', '远行的约定']]) await route(engines, engine, audited.source, branch, ending); } assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, hostPlatform: process.platform, requestedEngines: selectedEngines, recoveryMatrixComplete: selectedEngines.length === 3, candidateVersion, priorVersion, assertedBackgroundWorker: assertWorker, mediaProbeReport: path.relative(root, mediaProbePath).replaceAll('\\', '/'), artifacts: audited.artifacts, checks, routes, errors, sourceReused: process.argv.includes('--reuse-artifacts'), offlineAudioFixed: false, fullOfflineAudioMatrixPassed: false, physicalDevice: false, publicDeployment: false, permissionsVerified: false }, null, 2)); }
} catch (error) { if (current && !current.isClosed()) await shot(current, 'failure'); await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ checks, errors, error: String(error), stack: error.stack }, null, 2)); throw error; }
finally { if (browser) await browser.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

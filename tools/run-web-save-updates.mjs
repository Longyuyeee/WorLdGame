import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-save-updates');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
editor.setDefaultTimeout(30000); const checks = [], errors = []; let server, player;
const watch = page => page.on('pageerror', error => errors.push(error.message)); watch(editor);
const check = value => { checks.push(value); console.log(JSON.stringify(value)); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const nav = name => editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const ready = () => editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
async function exportGame(directory, filename) {
  await nav('故事'); await nav('发布'); await editor.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  await editor.getByRole('radio', { name: directory ? /目录 ZIP/ : /单文件 HTML/ }).check();
  await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await editor.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click();
  await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const pending = editor.waitForEvent('download'); await editor.getByRole('link', { name: '下载游戏', exact: true }).click(); const download = await pending;
  if (filename) { await download.saveAs(path.join(output, filename)); return await readFile(path.join(output, filename)); }
  return await readFile(await download.path());
}
async function openSave(page, tab = '手动') {
  if (await page.getByRole('button', { name: '读取存档', exact: true }).count()) await page.getByRole('button', { name: '读取存档', exact: true }).click();
  else { if (await page.getByRole('button', { name: '打开阅读菜单' }).count()) await page.getByRole('button', { name: '打开阅读菜单' }).click(); await page.getByRole('button', { name: '存读档', exact: true }).click(); }
  const dialog = page.getByRole('dialog', { name: '存读档槽位' }); await dialog.getByRole('button', { name: tab, exact: true }).click(); return dialog;
}
async function loadQuick(page, rejected = false) {
  const dialog = await openSave(page, '快速'); await dialog.getByRole('button', { name: '读取', exact: true }).click();
  await page.waitForFunction(expected => document.querySelector('main')?.dataset.saveOperation === expected, rejected ? 'error' : 'loaded');
}
async function activate(worker) {
  await worker.evaluate(() => new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const poll = () => { if (!self.registration.waiting && !self.registration.installing && self.registration.active?.state === 'activated') resolve(true);
      else if (Date.now() > deadline) reject(Error('worker activation timeout')); else setTimeout(poll, 50); }; poll();
  }));
}
async function storedFingerprint(page, projectId) {
  return await page.evaluate(async projectId => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const record = await new Promise((resolve, reject) => { const request = db.transaction('save-slots').objectStore('save-slots').get(`${projectId}\0quick-1`); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      if (!record) throw Error('quick slot missing');
      const bytes = new TextEncoder().encode(JSON.stringify(record, (_key, value) => value instanceof ArrayBuffer ? Array.from(new Uint8Array(value)) : ArrayBuffer.isView(value) ? Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) : value));
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    } finally { db.close(); }
  }, projectId);
}
function changedSource(files) {
  const result = { ...files }, script = Object.keys(result).find(name => name.endsWith('.json') && strFromU8(result[name]).includes('"narration"'));
  assert.ok(script); const value = JSON.parse(strFromU8(result[script])); const narration = value.statements.find(item => item.kind === 'narration');
  assert.ok(narration); narration.text += '内容变化不应兼容。'; result[script] = strToU8(JSON.stringify(value)); return zipSync(result, { level: 0 });
}
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/');
  const previousArchive = await readFile(path.join(root, 'evidence/web-player-entry/before-rain-stops-project.zip'));
  const previousSource = unzipSync(previousArchive), previousManifest = JSON.parse(strFromU8(previousSource['world.project.json']));
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-player-entry/before-rain-stops-project.zip')); await ready();
  await nav('发布'); await editor.getByLabel('发布版本', { exact: true }).fill('1.5.3'); await editor.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready();
  await editor.locator('.web-save-compatibility > summary').click();
  await editor.getByLabel('核对上一版工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-player-entry/before-rain-stops-project.zip')); await editor.getByText(/已核对版本：1.5.2/).waitFor(); await ready();
  await editor.getByLabel('核对上一版工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-authoring-polish/before-rain-stops-project.zip')); await editor.getByText(/已核对版本：1.5.1、1.5.2/).waitFor(); await ready();
  await editor.getByLabel('核对上一版工程 ZIP', { exact: true }).setInputFiles({ name: 'changed-previous.zip', mimeType: 'application/zip', buffer: Buffer.from(changedSource(previousSource)) });
  await editor.getByText(/作品内容有变化：/).waitFor(); await editor.screenshot({ path: path.join(output, 'editor-compatibility.png') });
  await editor.getByLabel('项目菜单', { exact: true }).click(); const pending = editor.waitForEvent('download'); await editor.getByRole('button', { name: /导出工程 ZIP/ }).click(); await (await pending).saveAs(path.join(output, 'before-rain-stops-project.zip'));
  const source = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip'))), manifest = JSON.parse(strFromU8(source['world.project.json']));
  assert.deepEqual(Object.keys(source).sort(), Object.keys(previousSource).sort());
  for (const name of Object.keys(source).filter(name => name !== 'world.project.json')) assert.deepEqual(source[name], previousSource[name]);
  assert.deepEqual(manifest.webSaveCompatibility.versions, ['1.5.1', '1.5.2']);
  const { webSaveCompatibility, ...rest } = manifest;
  assert.deepEqual(rest, { ...previousManifest, webPublication: { ...previousManifest.webPublication, version: '1.5.3' } });
  check('UI verifies 1.5.1 and 1.5.2, refuses changed source without altering current project; source preserves every story/media entry');
  await exportGame(false, 'before-rain-stops.html');
  const directory = await exportGame(true, 'before-rain-stops-web.zip'), currentFiles = unzipSync(directory);
  assert.deepEqual(JSON.parse(strFromU8(currentFiles['save-compatibility.json'])).verifiedVersions, ['1.5.1', '1.5.2']);
  // A separate test build comes from the actual editor with a stale receipt, never arbitrary runtime mutation.
  await editor.getByLabel('项目菜单', { exact: true }).click();
  await editor.getByRole('button', { name: /所有项目/ }).click();
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles({ name: 'changed-current.zip', mimeType: 'application/zip', buffer: Buffer.from(changedSource(source)) }); await ready(); await nav('发布');
  await editor.getByLabel('发布版本', { exact: true }).fill('1.5.4'); await editor.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready();
  await editor.locator('.web-save-compatibility > summary').click(); await editor.getByText(/之前的核对已失效/).waitFor();
  await editor.screenshot({ path: path.join(output, 'editor-stale-compatibility.png') });
  const incompatibleDirectory = await exportGame(true), incompatibleFiles = unzipSync(incompatibleDirectory);
  assert.equal(JSON.parse(strFromU8(incompatibleFiles['save-compatibility.json'])).status, 'stale');
  check('actual editor content change invalidates the saved receipt; test-only directory declares no accepted prior versions');

  const oldFiles = unzipSync(await readFile(path.join(root, 'evidence/web-player-entry/before-rain-stops-web.zip'))); let served = oldFiles;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = served[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': types[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes ?? 'Missing'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = `http://127.0.0.1:${server.address().port}/gal/`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 844 }, reducedMotion: 'reduce', timezoneId: 'Asia/Hong_Kong' });
  let page = await context.newPage(); player = page; page.setDefaultTimeout(30000); watch(page);
  await page.goto(url); await page.getByRole('button', { name: /^开始故事/ }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  await page.getByRole('button', { name: '快速保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
  const oldHash = await page.locator('main').getAttribute('data-runtime-state-hash'), originalSlot = await storedFingerprint(page, manifest.projectId);
  await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'ready');
  await page.locator('#offline-panel > summary').click(); await page.getByRole('button', { name: '下载离线内容', exact: true }).click(); await page.locator('#offline-status').filter({ hasText: '离线内容已就绪' }).waitFor({ timeout: 60000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true); await page.reload(); await loadQuick(page); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), oldHash);
  check('original 1.5.2 caches fully and reads its quick save offline');
  await context.setOffline(false); served = currentFiles; await page.locator('#offline-panel > summary').click();
  let workerPromise = context.waitForEvent('serviceworker'); await page.getByRole('button', { name: '检查更新', exact: true }).click(); let worker = await workerPromise;
  await page.locator('#offline-status').filter({ hasText: '新版已下载' }).waitFor({ timeout: 60000 });
  assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), oldHash); assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'), '1.5.2');
  await page.screenshot({ path: path.join(output, 'update-waiting.png') }); await page.close(); await activate(worker);
  page = await context.newPage(); player = page; watch(page); await page.goto(url);
  assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'), '1.5.3');
  await page.getByText('这份旧版进度已核对兼容，可以继续上次的故事。', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'compatible-recovery-title.png') });
  await page.getByRole('button', { name: '恢复上次进度', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'loaded'); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), oldHash);
  await loadQuick(page); await page.getByText('已读取核对过的旧版存档，可以继续故事', { exact: true }).waitFor();
  assert.equal(await storedFingerprint(page, manifest.projectId), originalSlot);
  await context.setOffline(true); await page.reload(); await loadQuick(page);
  assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), oldHash);
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false' && [...document.querySelectorAll('audio')].some(audio => audio.currentTime > 0));
  await page.screenshot({ path: path.join(output, 'old-save-offline.png') });
  check('waiting update preserves the old window; activated 1.5.3 restores old recovery/quick saves offline with cached audio and unchanged original slot bytes');
  for (let step = 0; step < 5 && await page.locator('main').getAttribute('data-runtime-state-hash') === oldHash; step++) await page.getByRole('button', { name: '继续下一句', exact: true }).click();
  const newHash = await page.locator('main').getAttribute('data-runtime-state-hash'); assert.notEqual(newHash, oldHash);
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openSave(page); await dialog.getByRole('button', { name: '保存', exact: true }).first().click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
  assert.ok(await dialog.evaluate(item => { const r = item.getBoundingClientRect(); return item.matches(':modal') && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  await page.screenshot({ path: path.join(output, 'mobile-compatible-save.png') }); await dialog.getByRole('button', { name: '关闭存读档' }).click();
  await page.reload(); const reopened = await openSave(page); await reopened.getByRole('button', { name: '读取', exact: true }).first().click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
  assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), newHash); assert.equal(await storedFingerprint(page, manifest.projectId), originalSlot);
  await page.screenshot({ path: path.join(output, 'continued-save-resumed.png') });
  check('continued old session saves to a separate manual slot, refreshes offline at the same progress on a 390px viewport, and keeps the original quick slot');
  await context.setOffline(false); served = incompatibleFiles; await page.locator('#offline-panel > summary').click();
  workerPromise = context.waitForEvent('serviceworker'); await page.getByRole('button', { name: '检查更新', exact: true }).click(); worker = await workerPromise;
  await page.locator('#offline-status').filter({ hasText: '新版已下载' }).waitFor({ timeout: 60000 }); await page.close(); await activate(worker);
  page = await context.newPage(); player = page; watch(page); await page.goto(url); assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'), '1.5.4');
  await page.getByText(/这个进度来自尚未核对的游戏版本/).waitFor();
  assert.ok(await page.getByRole('button', { name: '恢复上次进度', exact: true }).first().isDisabled());
  const titleHash = await page.locator('main').getAttribute('data-runtime-state-hash'); await loadQuick(page, true);
  await page.getByRole('alert').filter({ hasText: '尚未核对的游戏版本' }).waitFor();
  assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), titleHash); assert.equal(await storedFingerprint(page, manifest.projectId), originalSlot);
  await page.screenshot({ path: path.join(output, 'changed-update-rejected.png') }); await context.close();
  check('a real content-changing update disables incompatible recovery, rejects old quick load visibly and preserves title state/original slot');

  const standalone = await browser.newContext({ viewport: { width: 1280, height: 844 }, reducedMotion: 'reduce' }); const single = await standalone.newPage(); player = single; watch(single);
  await single.goto(pathToFileURL(path.join(output, 'before-rain-stops.html')).href); await single.getByRole('button', { name: /^开始故事/ }).click();
  await single.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  await single.getByRole('button', { name: '快速保存', exact: true }).click(); await single.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
  const singleHash = await single.locator('main').getAttribute('data-runtime-state-hash'); await single.reload(); await loadQuick(single);
  assert.equal(await single.locator('main').getAttribute('data-runtime-state-hash'), singleHash); await standalone.close();
  check('current standalone HTML opens as a local file, quick saves, refreshes and loads correctly');
  const artifacts = Object.fromEntries(await Promise.all(['before-rain-stops-project.zip', 'before-rain-stops.html', 'before-rain-stops-web.zip'].map(async name => { const bytes = await readFile(path.join(output, name)); return [name, { byteLength: bytes.length, sha256: hash(bytes) }]; })));
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), browser: browser.version(), version: '1.5.3', checks, artifacts,
    verifiedPreviousVersions: ['1.5.1', '1.5.2'], incompatibleTestArtifactSha256: hash(incompatibleDirectory), originalQuickSlotUnchanged: true,
    errors, publicDeployment: false, physicalDevicePassed: false, completeRoutesRerun: false, previousRouteEvidence: 'evidence/web-player-entry/browser-checks.json' }, null, 2));
} catch (error) {
  await player?.screenshot({ path: path.join(output, 'failure-player.png') }).catch(() => {}); await editor.screenshot({ path: path.join(output, 'failure-editor.png') }).catch(() => {});
  await writeFile(path.join(output, 'failure-checks.json'), JSON.stringify({ passed: false, checks, errors, error: String(error), stack: error.stack }, null, 2)); throw error;
} finally { server?.close(); await browser.close(); }

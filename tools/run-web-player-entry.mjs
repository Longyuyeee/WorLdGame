import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { editedScenes } from '../assets/rain-story/editorial-v1.5.1.mjs';

const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-player-entry');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
editor.setDefaultTimeout(20000); const checks = [], errors = [], routes = {}; let server, playerForFailure;
const watch = page => page.on('pageerror', error => errors.push(error.message)); watch(editor);
const check = value => { checks.push(value); console.log(JSON.stringify(value)); };
const offlineOnly = process.env.STUDIO_ENTRY_OFFLINE_ONLY === '1';
const nav = name => editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const ready = () => editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
async function exportGame(directory) {
  await nav('故事'); await nav('发布'); await editor.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  await editor.getByRole('radio', { name: directory ? /目录 ZIP/ : /单文件 HTML/ }).check();
  await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await editor.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click();
  await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const pending = editor.waitForEvent('download'); await editor.getByRole('link', { name: '下载游戏', exact: true }).click(); await (await pending).saveAs(path.join(output, directory ? 'before-rain-stops-web.zip' : 'before-rain-stops.html'));
}
async function openSave(page) {
  if (await page.getByRole('button', { name: '读取存档', exact: true }).count()) await page.getByRole('button', { name: '读取存档', exact: true }).click();
  else { if (await page.getByRole('button', { name: '打开阅读菜单' }).count()) await page.getByRole('button', { name: '打开阅读菜单' }).click(); await page.getByRole('button', { name: '存读档', exact: true }).click(); }
  await page.getByRole('dialog', { name: '存读档槽位' }).waitFor();
}
async function quick(page, load = false, allowRejected = false) {
  if (load && await page.getByRole('button', { name: '读取存档' }).count()) {
    await openSave(page); const dialog = page.getByRole('dialog', { name: '存读档槽位' }); await dialog.getByRole('button', { name: '快速', exact: true }).click(); await dialog.getByRole('button', { name: '读取', exact: true }).click();
  } else {
    if (await page.getByRole('button', { name: '打开阅读菜单' }).count()) await page.getByRole('button', { name: '打开阅读菜单' }).click();
    await page.getByRole('button', { name: load ? '快速读取' : '快速保存', exact: true }).click();
  }
  await page.waitForFunction(load => document.querySelector('main')?.dataset.saveOperation === (load ? 'loaded' : 'saved') || document.querySelector('main')?.dataset.saveOperation === 'error', load);
  const operation = await page.locator('main').getAttribute('data-save-operation');
  if (!allowRejected) assert.equal(operation, load ? 'loaded' : 'saved', await page.locator('main').textContent());
  if (await page.getByRole('dialog', { name: '阅读菜单' }).count()) await page.getByRole('dialog', { name: '阅读菜单' }).getByRole('button', { name: '返回故事', exact: true }).click();
  return operation;
}
async function route(url, name, branch, width, ending, expected) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500, isMobile: width < 500, reducedMotion: 'reduce', timezoneId: 'Asia/Hong_Kong' });
  const page = await context.newPage(); playerForFailure = page; page.setDefaultTimeout(20000); watch(page);
  await page.goto(url); await page.getByRole('button', { name: /^开始故事/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: '自动播放', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '后退一步', exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, `${name}-title.png`) });
  await page.getByRole('button', { name: '打开玩家设置' }).click(); await page.getByRole('dialog', { name: '玩家设置' }).getByRole('button', { name: '返回故事' }).click();
  assert.ok(await page.getByRole('button', { name: '打开玩家设置' }).evaluate(item => item === document.activeElement));
  await openSave(page); const dialog = page.getByRole('dialog', { name: '存读档槽位' });
  assert.ok(await dialog.getByRole('button', { name: '关闭存读档' }).evaluate(item => item === document.activeElement));
  await page.keyboard.press('Tab'); assert.ok(await dialog.evaluate(item => item.contains(document.activeElement)));
  await page.keyboard.press('Escape'); assert.ok(await page.getByRole('button', { name: '读取存档' }).evaluate(item => item === document.activeElement));
  await page.getByRole('button', { name: /^开始故事/ }).click();
  const paragraphs = new Set(), visited = [], voices = new Set(); let saved = false;
  for (let step = 0; step < 450; step++) {
    if (await page.locator('main').getAttribute('data-player-status') === 'ended') break;
    if (await page.locator('.player-choice').count()) { await page.locator('.player-choice').getByRole('button', { name: new RegExp(branch) }).click(); continue; }
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    const text = await page.locator('.player-dialogue__text').textContent(), scene = editedScenes.find(scene => scene.prose.includes(text));
    if (scene) { paragraphs.add(text); if (visited.at(-1) !== scene.name) visited.push(scene.name); }
    if (!saved && scene?.name === '候车室的旧信') {
      const hash = await page.locator('main').getAttribute('data-runtime-state-hash');
      await openSave(page); const save = page.getByRole('dialog', { name: '存读档槽位' });
      const bounds = await save.evaluate(item => { const r = item.getBoundingClientRect(); return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, closedBackground: item.matches(':modal') }; }); assert.ok(bounds.inside && bounds.closedBackground);
      await save.getByRole('button', { name: '保存', exact: true }).first().click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
      assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash);
      await page.screenshot({ path: path.join(output, `${name}-save-dialog.png`) }); await save.getByRole('button', { name: '关闭存读档' }).click();
      await quick(page); await page.getByText('快速存档已保存', { exact: true }).waitFor(); await page.reload(); await quick(page, true); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); saved = true;
    }
    const voice = page.locator('audio[data-audio-bus="voice"]'); if (await voice.count()) { const id = await voice.getAttribute('data-asset-id'); if (!voices.has(id)) { await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(id); } }
    await page.getByRole('button', { name: '继续下一句', exact: true }).click(); await page.waitForTimeout(60);
  }
  assert.equal(await page.locator('main').getAttribute('data-player-status'), 'ended'); assert.ok((await page.locator('.player-ending').textContent()).includes(ending)); assert.equal(paragraphs.size, 60); assert.equal(voices.size, 6); assert.deepEqual(visited, expected);
  await page.screenshot({ path: path.join(output, `${name}-ending.png`) }); routes[name] = { paragraphs: paragraphs.size, voices: voices.size, visited, saveRefresh: saved, nativeSaveDialog: true, physicalPhone: false, humanReadTiming: false };
  await context.close(); check({ route: name, ...routes[name] });
}
try {
  if (!offlineOnly) {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/'); assert.match(await editor.title(), /WorLd/i);
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-authoring-polish/before-rain-stops-project.zip')); await ready();
  await nav('发布'); await editor.getByLabel('发布版本', { exact: true }).fill('1.5.2'); await editor.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready();
  await editor.getByLabel('项目菜单', { exact: true }).click(); const sourceDownload = editor.waitForEvent('download'); await editor.getByRole('button', { name: /导出工程 ZIP/ }).click(); await (await sourceDownload).saveAs(path.join(output, 'before-rain-stops-project.zip'));
  await exportGame(false); await exportGame(true);
  const previousSource = unzipSync(await readFile(path.join(root, 'evidence/web-authoring-polish/before-rain-stops-project.zip'))), source = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip')));
  assert.deepEqual(Object.keys(source).sort(), Object.keys(previousSource).sort()); for (const name of Object.keys(source).filter(name => name !== 'world.project.json')) assert.deepEqual(source[name], previousSource[name]);
  const previousManifest = JSON.parse(strFromU8(previousSource['world.project.json'])), manifest = JSON.parse(strFromU8(source['world.project.json'])); assert.deepEqual(manifest, { ...previousManifest, webPublication: { ...previousManifest.webPublication, version: '1.5.2' } });
  check('UI version 1.5.2 and three exports; all source entries unchanged except publication version');
  await route(pathToFileURL(path.join(output, 'before-rain-stops.html')).href, 'desktop-stay', '留下等雨停', 1280, '同行的约定', editedScenes.slice(0, 6).map(scene => scene.name));
  }
  const currentFiles = unzipSync(await readFile(path.join(output, 'before-rain-stops-web.zip'))), oldFiles = unzipSync(await readFile(path.join(root, 'evidence/web-authoring-polish/before-rain-stops-web.zip'))); let served = currentFiles;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = served[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': types[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/gal/`;
  if (!offlineOnly) {
    await route(url, 'mobile-leave', '去追最后一班车', 390, '远行的约定', [...editedScenes.slice(0, 3), ...editedScenes.slice(6)].map(scene => scene.name));
    const hashes = Object.fromEntries(await Promise.all(['before-rain-stops-project.zip', 'before-rain-stops.html', 'before-rain-stops-web.zip'].map(async name => [name, createHash('sha256').update(await readFile(path.join(output, name))).digest('hex')])));
    await writeFile(path.join(output, 'route-checks.json'), JSON.stringify({ passed: true, checks, routes, hashes, errors }, null, 2));
  } else {
    const prior = JSON.parse(await readFile(path.join(output, 'route-checks.json'), 'utf8')); assert.equal(prior.passed, true);
    for (const [name, hash] of Object.entries(prior.hashes)) assert.equal(createHash('sha256').update(await readFile(path.join(output, name))).digest('hex'), hash);
    checks.push(...prior.checks); Object.assign(routes, prior.routes);
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 844 }, reducedMotion: 'reduce' }); const page = await context.newPage(); playerForFailure = page; page.setDefaultTimeout(30000); watch(page);
  served = oldFiles; await page.goto(url); await page.getByRole('button', { name: /^开始故事/ }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  await page.getByRole('button', { name: '快速保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); const hash = await page.locator('main').getAttribute('data-runtime-state-hash');
  await page.locator('#offline-panel > summary').click(); await page.getByRole('button', { name: '下载离线内容', exact: true }).click(); await page.locator('#offline-status').filter({ hasText: '离线内容已就绪' }).waitFor({ timeout: 60000 }); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); await page.screenshot({ path: path.join(output, 'offline-ready.png') });
  await context.setOffline(true); await page.reload(); await page.getByRole('button', { name: '快速读取', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash);
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false' && [...document.querySelectorAll('audio')].some(audio => audio.currentTime > 0)); await page.screenshot({ path: path.join(output, 'offline-resumed.png') }); check('cached 1.5.1 restarts offline, restores quick progress and plays cached background audio');
  await context.setOffline(false); served = currentFiles; await page.locator('#offline-panel > summary').click();
  const nextWorkerPromise = context.waitForEvent('serviceworker'); await page.getByRole('button', { name: '检查更新', exact: true }).click(); const nextWorker = await nextWorkerPromise;
  await page.locator('#offline-status').filter({ hasText: '新版已下载' }).waitFor({ timeout: 60000 }); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'), '1.5.1'); await page.screenshot({ path: path.join(output, 'update-waiting.png') });
  await page.close(); await nextWorker.evaluate(() => new Promise((resolve, reject) => { const deadline = Date.now() + 15000; const poll = () => { if (!self.registration.waiting && !self.registration.installing && self.registration.active?.state === 'activated') resolve(true); else if (Date.now() > deadline) reject(Error('activation timeout')); else setTimeout(poll, 50); }; poll(); }));
  const updated = await context.newPage(); playerForFailure = updated; watch(updated); await updated.goto(url); assert.equal(await updated.locator('meta[name="application-version"]').getAttribute('content'), '1.5.2');
  const titleHash = await updated.locator('main').getAttribute('data-runtime-state-hash');
  assert.equal(await quick(updated, true, true), 'error');
  assert.equal(await updated.locator('main').getAttribute('data-runtime-state-hash'), titleHash);
  await updated.screenshot({ path: path.join(output, 'updated-old-save-rejected.png') });
  await updated.getByRole('button', { name: '关闭存读档', exact: true }).click();
  await updated.getByRole('button', { name: /^开始故事/ }).click(); await updated.getByRole('button', { name: '确认开始新故事', exact: true }).click();
  await updated.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); const newHash = await updated.locator('main').getAttribute('data-runtime-state-hash');
  await openSave(updated); await updated.getByRole('dialog', { name: '存读档槽位' }).getByRole('button', { name: '手动', exact: true }).click(); await updated.getByRole('dialog', { name: '存读档槽位' }).getByRole('button', { name: '保存', exact: true }).first().click(); await updated.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await updated.getByRole('button', { name: '关闭存读档' }).click();
  await context.setOffline(true); await updated.reload(); await openSave(updated); await updated.getByRole('dialog', { name: '存读档槽位' }).getByRole('button', { name: '读取', exact: true }).first().click(); await updated.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
  await updated.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false' && [...document.querySelectorAll('audio')].some(audio => audio.currentTime > 0)); assert.equal(await updated.locator('main').getAttribute('data-runtime-state-hash'), newHash); await updated.screenshot({ path: path.join(output, 'updated-offline-resumed.png') });
  check('update waits without interrupting 1.5.1, then activates 1.5.2; old quick save is rejected with visible feedback; new-version manual save resumes offline with audio');
  await context.setOffline(false); served = oldFiles; await updated.locator('#offline-panel > summary').click();
  const rollbackWorkerPromise = context.waitForEvent('serviceworker'); await updated.getByRole('button', { name: '检查更新', exact: true }).click(); const rollbackWorker = await rollbackWorkerPromise;
  await updated.locator('#offline-status').filter({ hasText: '新版已下载' }).waitFor({ timeout: 60000 }); await updated.close();
  await rollbackWorker.evaluate(() => new Promise((resolve, reject) => { const deadline = Date.now() + 15000; const poll = () => { if (!self.registration.waiting && !self.registration.installing && self.registration.active?.state === 'activated') resolve(true); else if (Date.now() > deadline) reject(Error('rollback activation timeout')); else setTimeout(poll, 50); }; poll(); }));
  const rolledBack = await context.newPage(); playerForFailure = rolledBack; watch(rolledBack); await rolledBack.goto(url); assert.equal(await rolledBack.locator('meta[name="application-version"]').getAttribute('content'), '1.5.1');
  await rolledBack.getByRole('button', { name: '快速读取', exact: true }).click(); await rolledBack.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); assert.equal(await rolledBack.locator('main').getAttribute('data-runtime-state-hash'), hash);
  await rolledBack.screenshot({ path: path.join(output, 'rollback-original-quick-save.png') }); await context.close();
  check('operator restores original directory through the same offline update lifecycle; original 1.5.1 quick save remains readable');
  const artifacts = Object.fromEntries(await Promise.all(['before-rain-stops-project.zip', 'before-rain-stops.html', 'before-rain-stops-web.zip'].map(async name => { const bytes = await readFile(path.join(output, name)); return [name, { byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }]; })));
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), browser: browser.version(), version: '1.5.2', checks, routes, artifacts, errors, publicDeployment: false, physicalDevicePassed: false, humanReadTimingPassed: false, releasePermissionConfirmed: false }, null, 2));
} catch (error) { await playerForFailure?.screenshot({ path: path.join(output, 'failure-player.png') }).catch(() => {}); await editor.screenshot({ path: path.join(output, 'failure-editor.png') }).catch(() => {}); await writeFile(path.join(output, 'failure-checks.json'), JSON.stringify({ passed: false, checks, errors, error: String(error), stack: error.stack }, null, 2)); throw error; }
finally { server?.close(); await browser.close(); }

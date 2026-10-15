import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { editedScenes } from '../assets/rain-story/editorial-v1.5.1.mjs';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-reading-controls'); await mkdir(output, { recursive: true });
const layoutOnly = process.env.STUDIO_READING_LAYOUT_ONLY === '1';
const temporary = await mkdtemp(path.join(tmpdir(), 'world-reading-controls-'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
editor.setDefaultTimeout(20000); const checks = [], errors = [], routes = {}, exports = {}; let server, current = editor;
const watch = page => page.on('pageerror', error => errors.push(error.message)); watch(editor);
const check = value => { checks.push(value); console.log(JSON.stringify(value)); };
const main = page => page.locator('main.player-shell');
const hash = page => main(page).getAttribute('data-runtime-state-hash');
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const menu = page => page.getByRole('button', { name: '打开阅读菜单', exact: true }).click();
const closeMenu = page => page.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '返回故事', exact: true }).click();
async function fit(page, selector) { const r = await page.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, scroll: el.scrollWidth, client: el.clientWidth }; }); assert.ok(r.left >= -1 && r.right <= r.width + 1 && r.top >= -1 && r.bottom <= r.height + 1 && r.scroll <= r.client + 1, JSON.stringify(r)); }
async function exportGame(directory) {
  if (directory) await editor.getByRole('button', { name: '← 导出方式', exact: true }).click();
  else { await editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await editor.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); }
  await editor.getByRole('radio', { name: directory ? /网页目录 ZIP/ : /单文件 HTML/ }).check(); await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await editor.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await editor.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click(); await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const pending = editor.waitForEvent('download'); await editor.getByRole('link', { name: '下载游戏', exact: true }).click(); const file = await pending, bytes = await readFile(await file.path());
  const name = directory ? 'rain-web.zip' : 'rain.html'; exports[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; await writeFile(path.join(temporary, name), bytes); return bytes;
}
async function quick(page, load = false) {
  if (await page.getByRole('button', { name: '读取存档', exact: true }).isVisible()) { await page.getByRole('button', { name: '读取存档', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '存读档槽位' }); await dialog.getByRole('button', { name: '快速', exact: true }).click(); await dialog.getByRole('button', { name: '读取', exact: true }).click(); }
  else { await menu(page); await page.getByRole('button', { name: load ? '快速读取' : '快速保存', exact: true }).click(); }
  await page.waitForFunction(load => document.querySelector('main.player-shell')?.dataset.saveOperation === (load ? 'loaded' : 'saved'), load);
  if (await page.getByRole('dialog', { name: '阅读菜单', exact: true }).count()) await closeMenu(page);
}
async function route(url, name, branch, width, ending, expected) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width < 500, isMobile: width < 500, timezoneId: 'Asia/Hong_Kong' });
  const page = await context.newPage(); page.setDefaultTimeout(20000); watch(page); current = page;
  await page.goto(url); await page.getByRole('button', { name: /^开始故事/ }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
  const startHash = await hash(page), startText = await page.locator('.player-dialogue__text').innerText();
  assert.equal(await page.getByLabel('自动阅读节奏', { exact: true }).isVisible(), false); assert.equal(await page.getByRole('button', { name: '快进全部', exact: true }).isVisible(), false);
  await shot(page, `${name}-reading`); await page.getByRole('button', { name: '欣赏画面', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '继续下一句', exact: true }).isVisible(), false); await page.waitForTimeout(120); assert.equal(await hash(page), startHash); await shot(page, `${name}-artwork`);
  await page.keyboard.press('Space'); assert.equal(await hash(page), startHash); assert.equal(await page.locator('.player-dialogue__text').innerText(), startText);
  await menu(page); const dialog = page.getByRole('dialog', { name: '阅读菜单', exact: true }); await fit(page, '.player-control-layer[data-open="true"]');
  assert.ok(await dialog.evaluate(el => el.contains(document.activeElement))); await page.keyboard.press('Shift+Tab'); assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
  await page.getByLabel('自动阅读节奏', { exact: true }).selectOption('calm'); await shot(page, `${name}-menu`); await page.waitForTimeout(100); assert.equal(await hash(page), startHash);
  await page.setViewportSize({ width: width < 500 ? 844 : 1000, height: width < 500 ? 390 : 800 }); assert.equal(await dialog.count(), 1); await fit(page, '.player-control-layer[data-open="true"]'); await shot(page, `${name}-menu-resized`); await page.keyboard.press('Escape');
  assert.ok(await page.getByRole('button', { name: '打开阅读菜单', exact: true }).evaluate(el => el === document.activeElement)); await page.setViewportSize({ width, height: 900 });
  await menu(page); await page.getByRole('button', { name: '打开玩家设置', exact: true }).click(); const preferences = page.getByRole('dialog', { name: '玩家设置' });
  await preferences.getByLabel('高对比阅读', { exact: true }).check(); await shot(page, `${name}-contrast-settings`); await preferences.getByRole('button', { name: '返回故事', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: '打开阅读菜单', exact: true }).evaluate(el => el === document.activeElement)); await menu(page); await shot(page, `${name}-contrast-menu`); await closeMenu(page);
  await menu(page); await page.getByRole('button', { name: '打开玩家设置', exact: true }).click(); await page.getByLabel('高对比阅读', { exact: true }).uncheck(); await page.getByRole('dialog', { name: '玩家设置' }).getByRole('button', { name: '返回故事', exact: true }).click();
  if (width < 500) await menu(page); await page.getByRole('button', { name: '打开剧情历史', exact: true }).click(); await fit(page, '.player-history-panel'); await shot(page, `${name}-history`); await page.getByRole('dialog', { name: '剧情历史', exact: true }).getByRole('button', { name: '关闭剧情历史', exact: true }).click(); assert.equal(await hash(page), startHash);
  await menu(page); await page.getByRole('button', { name: '打开附加内容', exact: true }).click(); await fit(page, '.player-additional-content'); await shot(page, `${name}-additional`); await page.getByRole('button', { name: '返回剧情', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: '打开阅读菜单', exact: true }).evaluate(el => el === document.activeElement)); assert.equal(await hash(page), startHash);
  check(`${name}: compact stage controls; artwork/restore preserves paragraph; desktop/mobile menu focus, resize, high contrast and return from additional content; advanced controls visible only in menu`);
  if (layoutOnly) { await context.close(); current = editor; return; }
  const paragraphs = new Set(), voices = new Set(), visited = []; let saved = false;
  for (let step = 0; step < 450; step++) {
    if (await main(page).getAttribute('data-player-status') === 'ended') break;
    if (await page.locator('.player-choice button').count()) { await page.locator('.player-choice').getByRole('button', { name: new RegExp(branch) }).click(); continue; }
    const text = (await page.locator('.player-dialogue__text').innerText()).trim(), scene = editedScenes.find(scene => scene.prose.includes(text));
    if (scene) { paragraphs.add(text); if (visited.at(-1) !== scene.name) visited.push(scene.name); }
    if (!saved && scene?.name === '候车室的旧信') {
      const beforeSave = await hash(page); await quick(page); await page.reload(); await quick(page, true); assert.equal(await hash(page), beforeSave); assert.equal(await main(page).getAttribute('data-reading-pace'), 'calm'); saved = true;
    }
    const voice = page.locator('audio[data-audio-bus="voice"]'); if (await voice.count()) { const id = await voice.getAttribute('data-asset-id'); if (!voices.has(id)) { await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(id); } }
    await page.getByRole('button', { name: '继续下一句', exact: true }).click(); await page.waitForTimeout(45);
  }
  assert.equal(await main(page).getAttribute('data-player-status'), 'ended'); assert.ok((await page.locator('.player-ending').textContent()).includes(ending)); assert.equal(paragraphs.size, 60); assert.equal(voices.size, 6); assert.deepEqual(visited, expected); assert.ok(saved);
  await shot(page, `${name}-ending`); routes[name] = { paragraphs: paragraphs.size, voices: voices.size, visited, quickSaveReload: saved, physicalPhone: false, humanReadTiming: false }; check({ route: name, ...routes[name] }); await context.close(); current = editor;
}
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/'); await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip')); await editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await exportGame(false); const files = unzipSync(await exportGame(true)); assert.ok(new TextDecoder().decode(files['player.css']).includes('player-artwork-return'));
  check('actual production UI exports HTML and directory with the new reading controls; source remains Rain 1.5.4');
  await route(pathToFileURL(path.join(temporary, 'rain.html')).href, 'desktop-stay', '留下等雨停', 1280, '同行的约定', editedScenes.slice(0, 6).map(scene => scene.name));
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = files[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': mime[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await route(`http://127.0.0.1:${server.address().port}/gal/index.html`, 'mobile-go', '去追最后一班车', 390, '远行的约定', [...editedScenes.slice(0, 3), ...editedScenes.slice(6)].map(scene => scene.name));
  assert.deepEqual(errors, []); await writeFile(path.join(output, layoutOnly ? 'browser-layout-final.json' : 'browser-checks.json'), JSON.stringify({ passed: true, layoutOnly, browser: browser.version(), checks, errors, routes, exports, artifactsRetained: false, scope: 'same Rain 1.5.4 author source; fresh HTML/directory kept only in temporary storage; layout-only mode does not rerun full routes; no public deployment, human reading/listening acceptance, physical device or service-worker lifecycle rerun' }, null, 2));
} catch (error) { await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ checks, errors, error: String(error), stack: error.stack }, null, 2)); await shot(current, 'failure'); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); const resolved = path.resolve(temporary); assert.equal(path.dirname(resolved), path.resolve(tmpdir())); assert.ok(path.basename(resolved).startsWith('world-reading-controls-')); await rm(resolved, { recursive: true, force: true }); }

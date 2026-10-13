import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { scenes } from '../assets/rain-story/story.mjs';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-reading-mobile'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME });
const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); editor.setDefaultTimeout(20000);
const checks = [], errors = [], routes = {}, voices = new Set(); let server;
const watch = page => page.on('pageerror', error => errors.push(error.message)); watch(editor);
const check = value => { checks.push(value); console.log(typeof value === 'string' ? value : JSON.stringify(value)); };
const nav = name => editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const ready = () => editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
async function menu(page) { await page.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await page.getByRole('dialog', { name: '阅读菜单', exact: true }).waitFor(); }
async function close(page) { await page.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '返回故事', exact: true }).click(); }
async function quick(page, name) { if (await page.getByRole('button', { name: '打开阅读菜单' }).count()) await menu(page); await page.getByRole('button', { name, exact: true }).click(); await page.waitForFunction(name => document.querySelector('main')?.dataset.saveOperation === (name === '快速保存' ? 'saved' : 'loaded'), name); if (await page.getByRole('dialog', { name: '阅读菜单' }).count()) await close(page); }
async function exportGame(directory, target) {
  await nav('故事'); await nav('发布'); await editor.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  if (directory) await editor.getByRole('radio', { name: /目录 ZIP/ }).check();
  await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await editor.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click();
  await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const pending = editor.waitForEvent('download'); await editor.getByRole('link', { name: '下载游戏', exact: true }).click(); await (await pending).saveAs(target);
}
async function bounds(page) {
  assert.ok(await page.locator('.player-dialogue').evaluate(item => { const r = item.getBoundingClientRect(), stage = document.querySelector('.player-stage').getBoundingClientRect(), toolbar = document.querySelector('.player-compact-toolbar')?.getBoundingClientRect(), playback = document.querySelector('.player-playback-controls').getBoundingClientRect(), save = document.querySelector('.player-save').getBoundingClientRect(); return r.top >= stage.top && r.bottom <= Math.min(innerHeight, stage.bottom) && r.bottom < save.top && r.top > (toolbar?.height ? toolbar.bottom : playback.bottom); }));
}
async function frameProportions(page) {
  const frame = await page.locator('.player-stage-world').evaluate(item => { const r = item.getBoundingClientRect(), stage = document.querySelector('.player-stage').getBoundingClientRect(), ratio = parseFloat(getComputedStyle(document.querySelector('main')).getPropertyValue('--gal-stage-ratio')); return { width: r.width, height: r.height, ratio, inside: r.left >= stage.left - 1 && r.right <= stage.right + 1 && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1 }; });
  assert.ok(Math.abs(frame.width / frame.height - frame.ratio) < .005, JSON.stringify(frame)); assert.ok(frame.inside);
  const portrait = page.locator('.player-stage-character'); if (await portrait.count()) assert.ok(await portrait.evaluate(item => { const world = item.parentElement.getBoundingClientRect(), r = item.getBoundingClientRect(); return Math.abs(r.width / world.width - .3) < .01; }), 'Character remains 30% of authored canvas width across devices');
  return frame;
}
async function route(url, label, branch, width, expected, ending) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500, isMobile: width < 500, reducedMotion: 'reduce' });
  const page = await context.newPage(); watch(page); const paragraphs = new Set(), visited = [], spoken = new Set(); let saved = false;
  await page.goto(url); await page.getByRole('button', { name: /^开始故事/ }).click();
  if (label === 'http-touch-stay') {
    await page.locator('#offline-panel > summary').click();
    await page.waitForFunction(() => parseFloat(document.body.style.getPropertyValue('--player-viewport-offset')) === Math.ceil(document.getElementById('offline-panel').getBoundingClientRect().height + document.getElementById('world-publication-version').getBoundingClientRect().height));
    await bounds(page); await frameProportions(page); await page.screenshot({ path: path.join(output, 'http-expanded-toolbar.png') });
    await page.locator('#offline-panel > summary').click(); await page.waitForTimeout(100);
  }
  for (let step = 0; step < 450; step++) {
    if (await page.locator('main').getAttribute('data-player-status') === 'ended') break;
    if (await page.locator('.player-choice').count()) { await page.locator('.player-choice').getByRole('button', { name: new RegExp(branch) }).click(); continue; }
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    const text = await page.locator('.player-dialogue__text').textContent(), scene = scenes.find(item => item.prose.includes(text));
    if (scene) { paragraphs.add(text); if (visited.at(-1) !== scene.name) { visited.push(scene.name); console.log(`${label}: ${scene.name}`); } }
    await bounds(page);
    if (width < 500) await frameProportions(page);
    const voice = page.locator('audio[data-audio-bus="voice"]');
    if (await voice.count()) { const id = await voice.getAttribute('data-asset-id'); if (!spoken.has(id)) { await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.currentTime > 0); await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); spoken.add(id); voices.add(id); } }
    if (!saved && scene?.name === '候车室的旧信') { await quick(page, '快速保存'); const hash = await page.locator('main').getAttribute('data-runtime-state-hash'); await page.reload(); await quick(page, '快速读取'); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); saved = true; }
    if (scene && scene.prose[0] === text) await page.screenshot({ path: path.join(output, `${label}-${visited.length}.png`) });
    await page.getByRole('button', { name: '继续下一句', exact: true }).click(); await page.waitForTimeout(70);
  }
  assert.equal(await page.locator('main').getAttribute('data-player-status'), 'ended'); assert.ok((await page.locator('.player-ending').innerText()).includes(ending));
  assert.equal(paragraphs.size, 60); assert.deepEqual(visited, expected); assert.equal(spoken.size, 6); assert.equal(await page.locator('audio').count(), 0);
  routes[label] = { visited, paragraphs: 60, completedVoices: [...spoken], saveRefresh: saved, allParagraphsClearOfControls: true, hasTouch: width < 500 };
  await page.screenshot({ path: path.join(output, `${label}-ending.png`) }); await context.close(); check(`${label}: complete route, all 60 paragraphs, voices and menu-based save/refresh`);
}
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5192/');
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-story-direction/before-rain-stops-project.zip')); await ready();
  await nav('发布'); await editor.getByLabel('发布版本').fill('1.4.0'); await editor.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready();
  await editor.getByLabel('项目菜单', { exact: true }).click(); const sourceDownload = editor.waitForEvent('download'); await editor.getByRole('button', { name: /导出工程 ZIP/ }).click(); await (await sourceDownload).saveAs(path.join(output, 'before-rain-stops-project.zip'));
  await exportGame(false, path.join(output, 'before-rain-stops.html')); await exportGame(true, path.join(output, 'before-rain-stops-web.zip'));
  check('UI import, version 1.4.0, source ZIP, production HTML and directory export');
  const url = pathToFileURL(path.join(output, 'before-rain-stops.html')).href;
  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }); const page = await context.newPage(); watch(page);
    await page.goto(url); await page.getByRole('button', { name: /^开始故事/ }).click(); await page.waitForFunction(() => document.querySelector('.player-dialogue')?.dataset.textReady === 'true');
    await bounds(page); const portraitFrame = await frameProportions(page); assert.ok(await page.locator('.player-dialogue').evaluate(item => item.getBoundingClientRect().top > document.querySelector('.player-stage-world').getBoundingClientRect().bottom)); assert.equal(await page.locator('.player-playback-controls').isVisible(), false); assert.equal(await page.locator('.player-history-controls').isVisible(), false);
    assert.ok(await page.locator('.player-compact-toolbar').evaluate(item => item.getBoundingClientRect().height <= 56));
    const hash = await page.locator('main').getAttribute('data-runtime-state-hash'); await page.screenshot({ path: path.join(output, `phone-${width}-reading.png`) });
    await menu(page); await page.getByLabel('自动阅读节奏').selectOption('calm'); await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.getElementById('player-reading-menu').contains(document.activeElement)));
    await page.waitForTimeout(250); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); await page.screenshot({ path: path.join(output, `phone-${width}-menu.png`) });
    await page.keyboard.press('Escape'); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); assert.ok(await page.getByRole('button', { name: '打开阅读菜单' }).evaluate(item => item === document.activeElement));
    await quick(page, '快速保存'); await page.reload(); await quick(page, '快速读取'); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); assert.equal(await page.locator('main').getAttribute('data-reading-pace'), 'calm');
    await menu(page); await page.getByRole('button', { name: '打开剧情历史', exact: true }).click(); await page.getByRole('dialog', { name: '剧情历史', exact: true }).getByRole('button', { name: '关闭剧情历史' }).click(); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash);
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(200); await bounds(page); const landscapeFrame = await frameProportions(page); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); await page.screenshot({ path: path.join(output, `phone-${width}-landscape.png`) });
    await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(200); await bounds(page);
    check({ width, portraitFrame, landscapeFrame, touchContext: true, compactToolbar: true, menuFocusAndNoProgress: true, saveRefresh: true, paceRestored: true, history: true, viewportRotation: true }); await context.close();
  }
  await route(url, 'desktop-stay', '留下等雨停', 1280, scenes.slice(0, 6).map(item => item.name), '同行的约定');
  await route(url, 'touch-leave', '去追最后一班车', 320, [...scenes.slice(0, 3), ...scenes.slice(6)].map(item => item.name), '远行的约定');
  const files = unzipSync(await readFile(path.join(output, 'before-rain-stops-web.zip')));
  server = createServer((request, response) => { const key = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html'; const bytes = files[key]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': key.endsWith('.js') ? 'text/javascript' : key.endsWith('.css') ? 'text/css' : key.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await route(`http://127.0.0.1:${server.address().port}/gal/`, 'http-touch-stay', '留下等雨停', 390, scenes.slice(0, 6).map(item => item.name), '同行的约定');
  assert.equal(voices.size, 9);
  const timingContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const timing = await timingContext.newPage(); watch(timing); await timing.goto(url); await timing.getByRole('button', { name: /^开始故事/ }).click();
  await timing.waitForFunction(() => document.querySelector('.player-dialogue')?.dataset.textReady === 'true' && document.querySelector('main')?.dataset.stageImagesPending === 'false');
  assert.equal(await timing.locator('.player-dialogue').getAttribute('data-text-reveal-duration'), '0');
  assert.equal(await timing.locator('main').getAttribute('data-reading-pace'), 'standard');
  const timingHash = await timing.locator('main').getAttribute('data-runtime-state-hash'), units = Array.from(await timing.locator('.player-dialogue__text').textContent()).length, expectedDelay = 500 + 180 * units;
  await menu(timing); await timing.getByRole('button', { name: '自动播放', exact: true }).click(); const started = Date.now(); await close(timing);
  await timing.waitForTimeout(1000); assert.equal(await timing.locator('main').getAttribute('data-runtime-state-hash'), timingHash);
  await timing.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash !== hash, timingHash, { timeout: 45000 });
  const measuredDelay = Date.now() - started; assert.ok(measuredDelay >= expectedDelay - 500); assert.ok(measuredDelay < expectedDelay + 6000);
  await timing.getByRole('button', { name: '停止自动阅读' }).click();
  check({ autoStandardTiming: true, units, expectedDelay, measuredDelay, reducedMotionNeedsNoExtraRevealTap: true, humanTiming: false }); await timingContext.close();
  // A disposable UI-authored long paragraph; never replace the production story.
  await nav('故事'); await editor.locator('.scene-rail').getByRole('button', { name: /车站的雨/ }).click();
  await editor.locator('.statement-card--direction').filter({ hasText: /action=show.*slot=/ }).first().click();
  await editor.getByRole('button', { name: '添加成段文字', exact: true }).click(); const draft = editor.getByRole('dialog', { name: '添加成段文字', exact: true });
  const longText = '长段文字也必须能够完整读完。'.repeat(100); await draft.getByLabel('成段文字', { exact: true }).fill(longText); await draft.getByRole('button', { name: '添加到故事', exact: true }).click(); await ready();
  const stressFile = path.join(tmpdir(), `world-reading-stress-${Date.now()}.html`); await exportGame(false, stressFile);
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }); const page = await context.newPage(); watch(page);
  await page.goto(pathToFileURL(stressFile).href); await page.getByRole('button', { name: /^开始故事/ }).click(); await page.getByRole('button', { name: '继续下一句' }).click(); await page.waitForFunction(() => document.querySelector('.player-dialogue')?.dataset.textReady === 'true');
  assert.equal(await page.locator('.player-dialogue__text').textContent(), longText); const original = await page.locator('main').getAttribute('data-runtime-state-hash');
  await menu(page); await page.getByRole('button', { name: '自动播放', exact: true }).click(); await close(page); await page.waitForFunction(() => document.querySelector('main')?.dataset.autoPlayback === 'waiting-reading'); await page.waitForTimeout(1000); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), original);
  const cdp = await context.newCDPSession(page), box = await page.locator('.player-dialogue').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height - 35;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 24 }] }); await page.waitForTimeout(35); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(150);
  assert.ok(await page.locator('.player-dialogue').evaluate(item => item.scrollTop > 0)); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), original);
  await page.getByRole('button', { name: '停止自动阅读' }).click(); const before = await page.locator('.player-dialogue').evaluate(item => item.scrollTop); await page.getByRole('button', { name: '继续下一句' }).click(); assert.ok(await page.locator('.player-dialogue').evaluate(item => item.scrollTop) > before); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), original);
  for (let i = 0; i < 20 && await page.locator('main').getAttribute('data-reading-unread-below') === 'true'; i++) await page.getByRole('button', { name: '继续下一句' }).click();
  await bounds(page); await page.screenshot({ path: path.join(output, 'long-paragraph-touch-bottom.png') }); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), original);
  await page.getByRole('button', { name: '继续下一句' }).click(); assert.notEqual(await page.locator('main').getAttribute('data-runtime-state-hash'), original); assert.equal(await page.locator('.player-dialogue').evaluate(item => item.scrollTop), 0); await context.close();
  check('1400-character UI-authored paragraph: native touch scroll, Auto below-fold wait, next-screen reading, final flip/reset');
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checks, routes, errors, voiceLinesCompleted: voices.size, physicalDevicePassed: false, humanReadTimingPassed: false, publicDeployment: false }, null, 2) + '\n');
} catch (error) { await editor.screenshot({ path: path.join(output, 'failure-editor.png') }).catch(() => {}); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2) + '\n'); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

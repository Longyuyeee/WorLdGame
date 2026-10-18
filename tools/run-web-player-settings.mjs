import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { scenes } from '../assets/rain-story/story.mjs';

process.env.STUDIO_READING_OUTPUT = 'evidence/web-player-settings';
process.env.STUDIO_READING_VERSION = '1.5.0';
process.env.STUDIO_READING_SOURCE = 'evidence/web-reading-mobile/before-rain-stops-project.zip';
process.env.STUDIO_UI_URL ??= 'http://127.0.0.1:5193/';
if (process.env.STUDIO_SETTINGS_ONLY !== '1') await import('./run-web-reading-mobile.mjs');

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, process.env.STUDIO_READING_OUTPUT);
const require = createRequire(import.meta.url); let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const files = unzipSync(await readFile(path.join(output, 'before-rain-stops-web.zip')));
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.json': 'application/json' };
const server = createServer((request, response) => {
  const key = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = files[key];
  response.writeHead(bytes ? 200 : 404, { 'Content-Type': mime[path.extname(key)] ?? 'application/octet-stream' }); response.end(bytes ?? 'Missing');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/gal/`, checks = [], errors = []; let browser;
async function settings(page) {
  if (await page.getByRole('button', { name: '打开阅读菜单' }).count()) await page.getByRole('button', { name: '打开阅读菜单' }).click();
  await page.getByRole('button', { name: '打开玩家设置' }).click(); await page.getByRole('dialog', { name: '玩家设置' }).waitFor();
}
const close = page => page.getByRole('dialog', { name: '玩家设置' }).getByRole('button', { name: '返回故事' }).click();
async function quick(page, name) {
  if (await page.getByRole('button', { name: '打开阅读菜单' }).count()) await page.getByRole('button', { name: '打开阅读菜单' }).click();
  await page.getByRole('button', { name, exact: true }).click(); await page.waitForFunction(name => document.querySelector('main').dataset.saveOperation === (name === '快速保存' ? 'saved' : 'loaded'), name);
  if (await page.getByRole('dialog', { name: '阅读菜单' }).count()) await page.getByRole('dialog', { name: '阅读菜单' }).getByRole('button', { name: '返回故事' }).click();
}
async function ratio(page) {
  const result = await page.locator('.player-stage-world').evaluate(item => { const r = item.getBoundingClientRect(), expected = Number(getComputedStyle(document.querySelector('main')).getPropertyValue('--gal-stage-ratio')); return { width: r.width, height: r.height, expected }; });
  assert.ok(Math.abs(result.width / result.height - result.expected) < .005, JSON.stringify(result)); return result;
}
async function slider(page, label, key, count) { const control = page.getByRole('slider', { name: label, exact: true }); await control.focus(); for (let i = 0; i < count; i++) await control.press(key); }
try {
  for (const engine of (process.env.STUDIO_SETTINGS_ENGINES ?? 'chromium,firefox,webkit').split(',')) {
    assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
    browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(engine === 'firefox' ? {} : { isMobile: true }), reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(`${engine}: ${error.message}`));
    await page.goto(url); const authoredScale = await page.locator('main').evaluate(item => parseFloat(item.style.getPropertyValue('--gal-font-scale')));
    await settings(page); const panel = page.getByRole('dialog', { name: '玩家设置' });
    assert.ok(await panel.getByRole('button', { name: '返回故事' }).evaluate(item => item === document.activeElement));
    await slider(page, '个人字号', 'ArrowRight', 8); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('逐字速度', { exact: true }).selectOption('2');
    await slider(page, '总音量', 'ArrowLeft', 10); await slider(page, '背景音乐', 'ArrowLeft', 12); await page.getByLabel('高对比阅读', { exact: true }).check();
    await page.getByRole('slider', { name: '个人字号', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `${engine}-settings-text.png`) });
    await page.keyboard.press('Tab'); assert.ok(await panel.evaluate(item => item.contains(document.activeElement)));
    await close(page); await page.getByRole('button', { name: /^开始故事/ }).click();
    await page.waitForFunction(() => document.querySelector('main').dataset.stageImagesPending === 'false');
    const hash = await page.locator('main').getAttribute('data-runtime-state-hash');
    const gains = await page.locator('audio').evaluateAll(items => items.map(item => ({ bus: item.dataset.audioBus, actual: item.volume, source: Number(item.dataset.volume), time: item.currentTime })));
    assert.ok(gains.some(item => item.bus === 'bgm' && item.actual > 0)); await ratio(page);
    await page.screenshot({ path: path.join(output, `${engine}-large-text.png`) });
    await page.getByRole('button', { name: '打开阅读菜单' }).click(); await page.getByRole('button', { name: '自动播放', exact: true }).click();
    await settings(page); await page.getByLabel('静音全部声音', { exact: true }).check();
    assert.equal(await page.locator('main').getAttribute('data-auto-playback'), 'suspended');
    assert.ok(await page.locator('audio').evaluateAll(items => items.every(item => item.muted && item.volume === 0)));
    await page.waitForTimeout(300); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash);
    await page.getByRole('button', { name: '恢复作品默认' }).click(); await close(page);
    await page.getByRole('button', { name: '停止自动阅读' }).click();
    assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); assert.equal(await page.locator('main').getAttribute('data-player-muted'), 'false');
    await settings(page); await slider(page, '个人字号', 'ArrowRight', 5); await slider(page, '总音量', 'ArrowLeft', 10); await close(page);
    await quick(page, '快速保存'); await page.reload(); await quick(page, '快速读取'); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash);
    const restoredScale = await page.locator('main').evaluate(item => ({ scale: item.style.getPropertyValue('--gal-font-scale'), preferences: Object.entries(localStorage).filter(([key]) => key.startsWith('world-player:preferences:')) }));
    assert.ok(Math.abs(parseFloat(restoredScale.scale) - authoredScale * 1.25) < .001, JSON.stringify(restoredScale));
    assert.equal(await page.locator('main').getAttribute('data-settings-audio-master'), '0.5');
    await settings(page); await page.getByRole('button', { name: '恢复作品默认' }).click(); await close(page);
    await page.setViewportSize({ width: 844, height: 390 }); await ratio(page); const beforeOffset = await page.locator('main').evaluate(item => getComputedStyle(item).getPropertyValue('--player-viewport-offset'));
    await settings(page); await page.getByRole('button', { name: '进入游戏全屏' }).click();
    await page.waitForFunction(() => document.querySelector('main').dataset.playerFullscreen === 'true' || /不支持|未完成|未允许/.test(document.querySelector('.player-preferences').textContent));
    const entered = await page.locator('main').getAttribute('data-player-fullscreen') === 'true';
    if (entered) {
      assert.ok(await page.locator('main').evaluate(item => document.fullscreenElement === item && parseFloat(getComputedStyle(item).getPropertyValue('--player-viewport-offset')) === 0));
      await close(page); await ratio(page); await page.screenshot({ path: path.join(output, `${engine}-fullscreen.png`) });
      await settings(page); await page.getByRole('button', { name: '退出游戏全屏' }).click(); await page.waitForFunction(() => document.fullscreenElement === null); await close(page);
      assert.equal(await page.locator('main').evaluate(item => getComputedStyle(item).getPropertyValue('--player-viewport-offset')), beforeOffset);
    } else { await page.screenshot({ path: path.join(output, `${engine}-fullscreen-unavailable.png`) }); await close(page); }
    assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); await ratio(page); await page.setViewportSize({ width: 390, height: 844 });
    // Exercise both original routes across the extra engines, including voices and ending restart.
    const leave = engine === 'webkit', paragraphs = new Set(), visited = [], voices = new Set();
    for (let step = 0; step < 450 && await page.locator('main').getAttribute('data-player-status') !== 'ended'; step++) {
      if (await page.locator('.player-choice').count()) { await page.locator('.player-choice').getByRole('button', { name: new RegExp(leave ? '去追最后一班车' : '留下等雨停') }).click(); continue; }
      await page.waitForFunction(() => document.querySelector('main').dataset.stageImagesPending === 'false');
      const text = await page.locator('.player-dialogue__text').textContent(), scene = scenes.find(item => item.prose.includes(text));
      if (scene) { paragraphs.add(text); if (visited.at(-1) !== scene.name) visited.push(scene.name); } await ratio(page);
      const voice = page.locator('audio[data-audio-bus="voice"]'); if (await voice.count()) { const id = await voice.getAttribute('data-asset-id'); if (!voices.has(id)) { await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]').currentTime > 0); await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]').ended); voices.add(id); } }
      await page.getByRole('button', { name: '继续下一句', exact: true }).click(); await page.waitForTimeout(60);
    }
    assert.equal(paragraphs.size, 60); assert.equal(voices.size, 6); assert.deepEqual(visited, (leave ? [...scenes.slice(0, 3), ...scenes.slice(6)] : scenes.slice(0, 6)).map(item => item.name));
    assert.ok((await page.locator('.player-ending').textContent()).includes(leave ? '远行的约定' : '同行的约定'));
    await page.screenshot({ path: path.join(output, `${engine}-ending.png`) }); await page.getByRole('button', { name: '回到标题', exact: true }).click(); assert.equal(await page.locator('main').getAttribute('data-player-status'), 'title');
    let normalMotionText = null;
    if (engine === 'chromium') {
      const normal = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' }), reading = await normal.newPage();
      reading.on('pageerror', error => errors.push(`${engine}-normal-motion: ${error.message}`)); await reading.goto(url); await reading.getByRole('button', { name: /^开始故事/ }).click();
      const originalDuration = Number(await reading.locator('.player-dialogue').getAttribute('data-text-reveal-duration')), originalHash = await reading.locator('main').getAttribute('data-runtime-state-hash'); assert.ok(originalDuration > 0);
      await settings(reading); await reading.getByLabel('逐字速度', { exact: true }).selectOption('0.5'); await reading.getByLabel('文字显示', { exact: true }).selectOption('typewriter');
      const slowDuration = Number(await reading.locator('.player-dialogue').getAttribute('data-text-reveal-duration')); assert.ok(slowDuration > originalDuration);
      await reading.getByLabel('文字显示', { exact: true }).selectOption('instant'); assert.equal(await reading.locator('.player-dialogue').getAttribute('data-text-reveal-duration'), '0'); assert.equal(await reading.locator('.player-dialogue').getAttribute('data-text-ready'), 'true');
      await close(reading); assert.equal(await reading.locator('main').getAttribute('data-runtime-state-hash'), originalHash); await reading.getByRole('button', { name: '继续下一句', exact: true }).click(); assert.notEqual(await reading.locator('main').getAttribute('data-runtime-state-hash'), originalHash);
      normalMotionText = { originalDuration, slowDuration, instantNoExtraTap: true, humanTiming: false }; await normal.close();
    }
    checks.push({ engine, version: browser.version(), settings: true, savedPreferences: true, defaultReset: true, mutedWithoutProgress: true, ratio: true, fullscreenEntered: entered, fullscreenFallback: !entered, paragraphs: 60, voices: 6, visited, endingRestart: true, normalMotionText, physicalPhone: false });
    console.log(JSON.stringify(checks.at(-1))); await browser.close(); browser = null;
  }
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'settings-checks.json'), JSON.stringify({ passed: true, checks, errors, physicalDevicePassed: false, safariIosPassed: false, humanReadTimingPassed: false }, null, 2) + '\n');
} catch (error) { await writeFile(path.join(output, 'settings-checks.json'), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2) + '\n'); throw error; }
finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }

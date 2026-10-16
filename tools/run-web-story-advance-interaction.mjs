import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
import { pollBrowserState } from './poll-browser-state.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-foreground-advance/interaction');
await mkdir(output, { recursive: true });
const bundles = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: path.join(root, 'tools/fixtures/reading-mixed-player.ts'), name: 'StoryInteraction', formats: ['iife'] } } });
const files = (Array.isArray(bundles) ? bundles : [bundles]).flatMap(item => item.output), code = files.find(item => item.type === 'chunk').code, css = files.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n');
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html' }).end(pathname.endsWith('.js') ? code : pathname.endsWith('.css') ? css : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/player.css"><div id="player-root"></div><script src="/player.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] }), page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), errors = [], checks = [];
page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
await page.addInitScript(() => {
  window.storyReplies = []; window.holdStoryReplies = false; window.storyWorkers = { live: 0, peak: 0 };
  const NativeWorker = Worker;
  // Fault injection only: hold genuine advance replies after real computation.
  // Cancellation deliberately cannot erase an already captured callback.
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options); this.ids = new Set(); this.released = false;
      storyWorkers.live++; storyWorkers.peak = Math.max(storyWorkers.peak, storyWorkers.live);
      this.addEventListener('message', event => {
        if (!holdStoryReplies || !this.ids.delete(event.data?.id)) return;
        const callback = this.onmessage;
        event.stopImmediatePropagation(); storyReplies.push({ callback, event, owner: this });
      });
    }
    postMessage(data, ...rest) { if (data?.task?.kind === 'advance') this.ids.add(data.id); return super.postMessage(data, ...rest); }
    terminate() { if (!this.released) { this.released = true; storyWorkers.live--; } return super.terminate(); }
  };
  window.deliverStoryReplies = (failed = false) => { for (const { callback, event, owner } of storyReplies.splice(0)) callback?.call(owner, failed ? { data: { id: event.data.id, error: true } } : event); };
});
const main = page.locator('main.player-shell'), button = name => page.getByRole('button', { name, exact: true }), state = async () => ({ hash: await main.getAttribute('data-runtime-state-hash'), cursor: await main.getAttribute('data-history-cursor'), length: await main.getAttribute('data-history-length'), text: await page.locator('.player-dialogue__text').innerText() });
async function holdAdvance() {
  await page.evaluate(() => { holdStoryReplies = true; }); await button('继续下一句').click();
  await page.waitForFunction(() => storyReplies.length === 1);
  assert.equal(await main.getAttribute('data-story-operation'), 'busy');
}
async function menu() { await button('打开阅读菜单').click(); }
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?count=960`); await button('开始故事').click();
  while (Number(await main.getAttribute('data-history-length')) < 480) await button('继续下一句').click();
  const original = await state(); await menu(); await button('快速保存').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('返回故事').click();
  await holdAdvance();
  for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport); const bounds = await button('取消推进').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height && bounds.height >= 44);
    await page.screenshot({ path: path.join(output, `pending-${viewport.width}.png`) });
    assert.deepEqual(await state(), original); checks.push({ viewport, cancelBounds: bounds });
  }
  await button('取消推进').click(); await page.evaluate(() => deliverStoryReplies());
  assert.deepEqual(await state(), original);
  await holdAdvance(); await menu(); await button('快速保存').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
  await page.evaluate(() => deliverStoryReplies()); assert.deepEqual(await state(), original);
  await button('返回故事').click();
  await holdAdvance(); await page.evaluate(() => { holdStoryReplies = false; deliverStoryReplies(); });
  await page.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash !== hash, original.hash);
  const advanced = await state(); assert.equal(advanced.cursor, '481');
  await menu(); await button('快速读取').click(); await button('确认读取').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
  const loaded = await state(); assert.equal(loaded.cursor, original.cursor); assert.equal(loaded.length, original.length); assert.equal(loaded.text, original.text);
  await holdAdvance(); await page.evaluate(() => readingAdvanceHost.setHostActivity('suspended'));
  await page.evaluate(() => deliverStoryReplies()); assert.deepEqual(await state(), loaded);
  await page.evaluate(() => readingAdvanceHost.setHostActivity('active'));
  await holdAdvance(); await page.evaluate(() => { holdStoryReplies = false; deliverStoryReplies(true); });
  await page.waitForFunction(() => document.querySelector('main')?.dataset.storyOperation === 'error'); assert.deepEqual(await state(), loaded);
  await button('使用兼容模式继续').click();
  await page.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash !== hash, loaded.hash);
  const compatible = await state(); assert.equal(compatible.cursor, '481'); assert.deepEqual(compatible, advanced);
  await page.evaluate(() => readingAdvanceHost.unmount());
  await pollBrowserState(page, () => storyWorkers.live === 0); assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), bundleHash: sha(code), cssHash: sha(css), checks, original, advanced, loaded, compatible, workers: await page.evaluate(() => storyWorkers), errors, scope: '480 naturally read mixed-media entries; genuine native Worker replies held at transport delivery only, with one injected transport failure. Actual cancel, late callback, suspension, quick save/load and explicit compatibility. Not normal timing, physical phones or human listening.' }, null, 2));
  console.log('PASS long-story native Worker cancellation, late replies, suspension, save/load, compatibility and 3 viewport controls');
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }); await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, errors, checks }, null, 2)); throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

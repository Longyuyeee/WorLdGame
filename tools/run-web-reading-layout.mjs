import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-reading-smoothness');
await mkdir(output, { recursive: true });
const archive = await readFile(path.join(output, 'before-rain-stops-web.zip')), game = unzipSync(archive);
const result = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: path.join(root, 'tools/fixtures/reading-history-player.ts'), name: 'HistoryReading', formats: ['iife'] } } });
const outputs = (Array.isArray(result) ? result : [result]).flatMap(value => value.output);
const code = outputs.filter(value => value.type === 'chunk').map(value => value.code).join('\n');
const css = outputs.filter(value => value.type === 'asset' && value.fileName.endsWith('.css')).map(value => String(value.source)).join('\n');
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname.startsWith('/history/')) {
    const file = url.pathname.endsWith('player.js') ? code : url.pathname.endsWith('player.css') ? css : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="player.css"><div id="player-root"></div><script src="player.js"></script>';
    return res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html' }).end(file);
  }
  const name = url.pathname.slice(1) || 'index.html', bytes = game[name];
  res.writeHead(bytes ? 200 : 404, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json' }[path.extname(name)] ?? 'application/octet-stream' }).end(bytes ?? 'Missing');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const url = `http://127.0.0.1:${server.address().port}/`, checks = [], errors = [];
let browser, page;
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function openMenu() { const trigger = page.getByRole('button', { name: '打开阅读菜单', exact: true }); if (await trigger.isVisible()) await trigger.click(); }
async function budget() {
  await frames();
  const value = await page.evaluate(() => {
    const panel = document.getElementById('offline-panel'), version = document.getElementById('world-publication-version');
    return { offset: parseFloat(document.body.style.getPropertyValue('--player-viewport-offset')), measured: panel.getBoundingClientRect().height + version.getBoundingClientRect().height, shellTop: document.querySelector('main.player-shell').getBoundingClientRect().top, width: document.documentElement.scrollWidth, viewport: innerWidth };
  });
  assert.ok(Math.abs(value.offset - value.measured) < 1.01, JSON.stringify(value));
  assert.ok(Math.abs(value.shellTop - value.measured) < 1.01, JSON.stringify(value));
  assert.ok(value.width <= value.viewport + 1, JSON.stringify(value));
  return value;
}
try {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    browser = await engines[engine].launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page = await context.newPage(); page.on('pageerror', error => errors.push(`${engine}: ${error}`));
    await page.addInitScript(() => {
      window.offlineStartupReads = 0;
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function(...args) { if (['offline-panel', 'world-publication-version'].includes(this.id)) window.offlineStartupReads++; return original.apply(this, args); };
    });
    await page.goto(url); await page.getByRole('button', { name: '开始故事', exact: true }).waitFor(); await frames();
    const startupReads = await page.evaluate(() => window.offlineStartupReads); assert.equal(startupReads, 0, `${engine} synchronous bar measurement`);
    const collapsed = await budget();
    await page.locator('#offline-panel > summary').click();
    const expanded = await budget(); assert.ok(expanded.offset > collapsed.offset);
    await page.setViewportSize({ width: 320, height: 568 });
    const narrow = await budget(); await shot(`${engine}-offline-expanded-320`);
    await page.locator('#offline-panel > summary').click();
    const closed = await budget(); assert.ok(closed.offset < narrow.offset);
    await page.setViewportSize({ width: 844, height: 390 }); const landscape = await budget(); await shot(`${engine}-title-landscape`);
    checks.push({ engine, version: browser.version(), startupReads, collapsed, expanded, narrow, closed, landscape });
    console.log(`PASS ${engine}: no synchronous startup bar reads; expand/320px/collapse/rotate`);
    await browser.close(); browser = null;
  }
  browser = await engines.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  page = await context.newPage(); page.on('pageerror', error => errors.push(`history: ${error}`));
  await page.goto(url + 'history/?count=120'); await page.getByRole('button', { name: '开始故事', exact: true }).click();
  const main = page.locator('main.player-shell');
  while (Number(await main.getAttribute('data-history-length')) < 95) await page.getByRole('button', { name: '继续下一句', exact: true }).click();
  const text = await page.locator('.player-dialogue__text').innerText();
  await openMenu();
  await page.getByRole('button', { name: '快速保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell').dataset.saveOperation === 'saved');
  await page.getByRole('button', { name: '打开剧情历史', exact: true }).click();
  const history = page.getByRole('dialog', { name: '剧情历史', exact: true });
  assert.equal(await history.locator('li').count(), 15); assert.ok((await history.locator('[data-history-position="current"]').innerText()).includes(text));
  const currentBounds = await history.locator('[data-history-position="current"]').boundingBox(), panelBounds = await history.boundingBox();
  assert.ok(currentBounds.y >= panelBounds.y && currentBounds.y + currentBounds.height <= panelBounds.y + panelBounds.height);
  await history.locator('.player-history-panel-body').evaluate(element => { element.scrollTop = 0; });
  await history.getByRole('button', { name: '定位当前记录', exact: true }).click(); await frames();
  const revealed = await history.locator('[data-history-position="current"]').boundingBox();
  assert.ok(revealed.y + revealed.height <= panelBounds.y + panelBounds.height);
  await shot('history-current-desktop');
  await history.getByRole('button', { name: '当前主线：较早记录', exact: true }).click();
  assert.equal(await history.locator('li').count(), 40);
  const target = history.locator('li').first(), targetText = await target.locator('strong').innerText();
  await target.getByRole('button').click(); await history.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.player-dialogue__text').innerText(), targetText);
  await openMenu(); await page.getByRole('button', { name: '打开剧情历史', exact: true }).click();
  assert.equal(await history.locator('li').count(), 40); assert.ok((await history.locator('[data-history-position="current"]').innerText()).includes(targetText));
  await history.getByRole('button', { name: '当前主线：较后记录', exact: true }).click(); assert.equal(await history.locator('li').count(), 15);
  await history.getByRole('button', { name: '定位当前记录', exact: true }).click(); assert.equal(await history.locator('li').count(), 40);
  await history.getByRole('button', { name: '关闭剧情历史', exact: true }).click();
  await openMenu(); await page.getByRole('button', { name: '快速读取', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('main.player-shell').dataset.saveOperation === 'loaded' || document.querySelector('.player-load-confirm'));
  const confirm = page.locator('.player-load-confirm'); if (await confirm.isVisible()) await confirm.getByRole('button', { name: '确认读取', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('main.player-shell').dataset.saveOperation === 'loaded');
  assert.equal(await page.locator('.player-dialogue__text').innerText(), text);
  await page.setViewportSize({ width: 390, height: 844 });
  await openMenu(); await page.getByRole('button', { name: '打开剧情历史', exact: true }).click();
  await history.getByRole('button', { name: '当前主线：较早记录', exact: true }).click();
  const bounds = await history.locator('.player-history-pages').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
  await history.locator('.player-history-panel-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  const close = await history.getByRole('button', { name: '关闭剧情历史', exact: true }).boundingBox();
  assert.ok(close.y >= 0 && close.y + close.height <= 844);
  await shot('history-older-390');
  checks.push({ history: '95 real UI paragraphs; current/older/future/back/current-page/quick-load/390px', maximumRendered: 40 });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'layout-history.json'), JSON.stringify({ passed: true, archiveSha256: sha(archive), fixtureBundleHash: sha(code), fixtureCssHash: sha(css), checks, errors, physicalDevice: false }, null, 2));
  console.log('PASS real UI history paging, rollback and saved progress restore');
} catch (error) {
  if (page && !page.isClosed()) await shot('layout-history-failure');
  await writeFile(path.join(output, 'layout-history-failure.json'), JSON.stringify({ error: String(error), stack: error.stack, checks, errors }, null, 2));
  throw error;
} finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
import { pollBrowserState } from './poll-browser-state.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-history-navigation');
await mkdir(output, { recursive: true });
const label = process.argv.includes('--baseline') ? 'baseline' : 'current';
const frozen = label === 'baseline' ? JSON.parse(await readFile(path.join(output, 'baseline-sources.json'), 'utf8')) : {};
const baselineSources = new Map(Object.entries(frozen).map(([name, source]) => [path.join(root, name).replaceAll('\\', '/'), source]));
const built = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'frozen-navigation-baseline', load(id) { return baselineSources.get(id.replaceAll('\\', '/')); } }], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: path.join(root, 'tools/fixtures/history-navigation-player.ts'), name: 'HistoryNavigation', formats: ['iife'] } } });
const outputs = (Array.isArray(built) ? built : [built]).flatMap(value => value.output), code = outputs.filter(value => value.type === 'chunk').map(value => value.code).join('\n'), css = outputs.filter(value => value.type === 'asset' && value.fileName.endsWith('.css')).map(value => String(value.source)).join('\n');
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html' }).end(pathname.endsWith('.js') ? code : pathname.endsWith('.css') ? css : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="player.css"><div id="player-root"></div><script src="player.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true }), context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [], operations = [];
page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(45000);
await page.addInitScript(() => { window.navigationTelemetry = { tasks: [], gaps: [] }; if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => navigationTelemetry.tasks.push(...list.getEntries().map(value => ({ start: value.startTime, duration: value.duration })))).observe({ type: 'longtask', buffered: true }); let last = performance.now(); setInterval(() => { const now = performance.now(); navigationTelemetry.gaps.push({ at: now, gap: now - last }); last = now; }, 16); });
const main = page.locator('main.player-shell'), hash = () => main.getAttribute('data-runtime-state-hash');
async function menu() { const button = page.getByRole('button', { name: '打开阅读菜单', exact: true }); if (await button.isVisible()) await button.click(); }
async function measure(name, action) {
  const start = await page.evaluate(() => performance.now()); await action(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const end = await page.evaluate(() => performance.now());
  operations.push({ name, wallMs: end - start, ...await page.evaluate(({ start, end }) => ({ longTasks: navigationTelemetry.tasks.filter(value => value.start >= start && value.start < end), maximumHeartbeatGapMs: Math.max(0, ...navigationTelemetry.gaps.filter(value => value.at >= start && value.at <= end).map(value => value.gap)) }), { start, end }) });
}
async function protectedRecovery() {
  await pollBrowserState(page, async () => {
    const current = document.querySelector('main.player-shell')?.dataset.runtimeStateHash;
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { const row = await new Promise((resolve, reject) => { const request = db.transaction('recovery-sessions').objectStore('recovery-sessions').get('session_budget'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); return (row?.metadata ?? row)?.runtimeStateHash === current && JSON.parse(document.documentElement.dataset.recoverySerializer ?? '{}').active === 0; } finally { db.close(); }
  });
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.getByRole('button', { name: '开始故事', exact: true }).click();
  while (Number(await main.getAttribute('data-history-length')) < 120) await page.getByRole('button', { name: '继续下一句', exact: true }).click();
  const before = { hash: await hash(), text: await page.locator('.player-dialogue__text').innerText() };
  await menu(); await page.getByRole('button', { name: '快速保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell').dataset.saveOperation === 'saved');
  await page.getByRole('button', { name: '打开剧情历史', exact: true }).click();
  const history = page.getByRole('dialog', { name: '剧情历史', exact: true });
  while (!await history.getByRole('button', { name: /^回退到：长篇第 20 句/ }).count()) await history.getByRole('button', { name: '当前主线：较早记录', exact: true }).click();
  await measure('120-to-21-history-back', async () => { await history.getByRole('button', { name: /^回退到：长篇第 20 句/ }).click(); await history.waitFor({ state: 'hidden' }); });
  assert.ok((await page.locator('.player-dialogue__text').innerText()).includes('第 20 句')); assert.equal(await main.getAttribute('data-history-cursor'), '21');
  const navigated = { hash: await hash(), hostHash: await main.getAttribute('data-runtime-host-snapshot-hash'), cursor: 21 };
  await menu(); await page.getByRole('button', { name: '快速读取', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell').dataset.saveOperation === 'loaded' || document.querySelector('.player-load-confirm'));
  if (await page.locator('.player-load-confirm').isVisible()) await page.getByRole('button', { name: '确认读取', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('main.player-shell').dataset.saveOperation === 'loaded'); assert.equal(await hash(), before.hash);
  const close = page.getByRole('button', { name: '返回故事', exact: true }); if (await close.isVisible()) await close.click();
  await protectedRecovery(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await measure('120-critical-protection', async () => { await page.evaluate(() => historyNavigationHost.notifyMemoryPressure('critical')); await page.waitForFunction(() => historyNavigationHost.getObservation().memoryPressure === 'protected'); });
  assert.equal(await hash(), before.hash); assert.equal(await main.getAttribute('data-history-archives'), '1');
  const compactedCursor = await main.getAttribute('data-history-cursor'); assert.equal(compactedCursor, '64');
  const foreground = await page.evaluate(() => JSON.parse(document.documentElement.dataset.foregroundSerializer ?? 'null'));
  await page.screenshot({ path: path.join(output, `${label}-protected.png`), animations: 'disabled' });
  await page.reload(); await page.getByRole('button', { name: '恢复上次进度', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.playerStatus === 'presenting');
  assert.equal(await hash(), before.hash); assert.equal(await main.getAttribute('data-history-cursor'), '120');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, `${label}.json`), JSON.stringify({ passed: true, label, browser: browser.version(), bundleHash: sha(code), cssHash: sha(css), before, navigated, compactedCursor, restoredCursor: 120, foreground, operations, errors, physicalMemoryPressure: false, physicalDevice: false }, null, 2));
  console.log(`PASS ${label}: real history jump, quick load, public memory notification, durable full-history recovery`);
} catch (error) { await page.screenshot({ path: path.join(output, `${label}-failure.png`) }); await writeFile(path.join(output, `${label}-failure.json`), JSON.stringify({ error: String(error), stack: error.stack, operations, errors }, null, 2)); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
import { pollBrowserState } from './poll-browser-state.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-checkpoint-responsiveness');
await mkdir(output, { recursive: true });
const label = process.argv.includes('--baseline') ? 'baseline' : 'current';
const frozen = label === 'baseline' ? JSON.parse(await readFile(path.join(output, 'baseline-sources.json'), 'utf8')) : {};
const sources = new Map(Object.entries(frozen).map(([name, source]) => [path.join(root, name).replaceAll('\\', '/'), source]));
const built = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'frozen-checkpoint-baseline', load(id) { return sources.get(id.replaceAll('\\', '/')); } }], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: path.join(root, 'tools/fixtures/checkpoint-responsiveness-player.ts'), name: 'CheckpointResponsiveness', formats: ['iife'] } } });
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
await page.addInitScript(() => { window.checkpointTelemetry = { tasks: [], gaps: [] }; if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => checkpointTelemetry.tasks.push(...list.getEntries().map(value => ({ start: value.startTime, duration: value.duration })))).observe({ type: 'longtask', buffered: true }); let last = performance.now(); setInterval(() => { const now = performance.now(); checkpointTelemetry.gaps.push({ at: now, gap: now - last }); last = now; }, 16); });
const main = page.locator('main.player-shell');
async function measure(name, action) {
  const start = await page.evaluate(() => performance.now()); await action();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const end = await page.evaluate(() => performance.now());
  operations.push({ name, wallMs: end - start, ...await page.evaluate(({ start, end }) => ({ longTasks: checkpointTelemetry.tasks.filter(value => value.start >= start && value.start < end), maximumHeartbeatGapMs: Math.max(0, ...checkpointTelemetry.gaps.filter(value => value.at >= start && value.at <= end).map(value => value.gap)) }), { start, end }) });
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.getByRole('button', { name: '开始故事', exact: true }).click();
  while (Number(await main.getAttribute('data-history-length')) < 239) await page.getByRole('button', { name: '继续下一句', exact: true }).click();
  await measure('ordinary-advance-at-239', () => page.getByRole('button', { name: '继续下一句', exact: true }).click());
  const before = await main.getAttribute('data-runtime-state-hash');
  await measure('eight-cues-and-checkpoint', async () => {
    await page.getByRole('button', { name: '继续下一句', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.player-dialogue__text')?.textContent?.includes('长篇第 240 句'));
  });
  const after = await main.getAttribute('data-runtime-state-hash'); assert.notEqual(before, after);
  // Continue immediately. The checkpoint must retain its earlier exact state.
  await page.getByRole('button', { name: '继续下一句', exact: true }).click();
  await page.getByRole('button', { name: '存读档', exact: true }).click();
  await page.getByRole('button', { name: '读取进度', exact: true }).click();
  await page.getByRole('button', { name: '检查点', exact: true }).click();
  await pollBrowserState(page, () => Array.from(document.querySelectorAll('button')).some(button => button.textContent === '读取' && !button.disabled), undefined, { timeoutMs: 45000 });
  await page.getByRole('button', { name: '读取', exact: true }).first().click();
  await page.getByRole('button', { name: '确认读取', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded');
  assert.match(await page.locator('.player-dialogue__text').innerText(), /长篇第 240 句/);
  await page.screenshot({ path: path.join(output, `${label}-checkpoint-restored.png`) });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, `${label}.json`), JSON.stringify({ passed: true, label, bundleHash: sha(code), cssHash: sha(css), browser: browser.version(), before, after, restoredText: await page.locator('.player-dialogue__text').innerText(), historyLength: await main.getAttribute('data-history-length'), operations, foreground: await page.evaluate(() => JSON.parse(document.documentElement.dataset.foregroundSerializer ?? 'null')), errors, scope: '240 lines/eight internal textbox cues/one checkpoint; actual UI/Worker/IndexedDB; one local Chromium observation, not physical memory or soak' }, null, 2));
  console.log(`PASS ${label}: ordinary reading, cue/checkpoint transition, continued reading and exact checkpoint restore`);
} catch (error) { await page.screenshot({ path: path.join(output, `${label}-failure.png`) }); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

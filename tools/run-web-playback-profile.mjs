import { createRequire, SourceMap } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { buildPlayerExportRuntime } from './player-export-bundle.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-playback-responsiveness'), scratchRoot = path.join(root, '.browser-diagnostic/playback-profile');
await mkdir(output, { recursive: true }); await mkdir(scratchRoot, { recursive: true }); const scratch = await mkdtemp(path.join(scratchRoot, 'run-'));
const label = process.argv.includes('--baseline') ? 'baseline' : 'current', samples = Number(process.env.PLAYBACK_SAMPLES ?? 3);
assert.ok(Number.isSafeInteger(samples) && samples >= 1 && samples <= 10);
const archive = await readFile(path.join(root, 'evidence/web-audio-compatibility/before-rain-stops-web.zip')), files = unzipSync(archive), runtime = await buildPlayerExportRuntime({ sourceMap: true });
const originalRuntimeHash = sha(files['player.js']);
if (label === 'current') { files['player.js'] = new TextEncoder().encode(runtime.javascript); files['player.css'] = new TextEncoder().encode(runtime.css); }
// A future baseline rerun must still execute the original candidate, not label
// current code as "before". Never map old generated offsets through a new map.
const map = sha(files['player.js']) === sha(new TextEncoder().encode(runtime.javascript)) ? new SourceMap(runtime.sourceMap) : null;
const server = createServer((req, res) => { const name = new URL(req.url, 'http://local').pathname.slice(1) || 'index.html', bytes = files[name]; const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream'; res.writeHead(bytes ? 200 : 404, { 'Content-Type': mime, 'Cache-Control': 'no-cache' }).end(bytes ?? 'Missing'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = `http://127.0.0.1:${server.address().port}/`, browser = await chromium.launch({ headless: true }), tasks = [], profiles = [], errors = [], results = [];
let current;
function summarize(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map(); for (const n of profile.nodes) for (const id of n.children ?? []) parent.set(id, n.id);
  const location = n => { const f = n.callFrame, e = f.url.endsWith('/player.js') ? map?.findEntry(f.lineNumber, f.columnNumber) : null; return e?.originalSource ? `${e.originalSource.replaceAll('\\', '/').replace(/^.*?(apps\/|packages\/)/u, '$1')}:${e.originalLine + 1} ${e.name || f.functionName}` : `${f.functionName || '(anonymous)'} ${f.url}`; };
  const self = new Map(), inclusive = new Map(); for (let i = 0; i < (profile.samples?.length ?? 0); i++) { const id = profile.samples[i], ms = profile.timeDeltas[i] / 1000, at = location(nodes.get(id)); self.set(at, (self.get(at) ?? 0) + ms); const seen = new Set(); for (let node = id; node !== undefined; node = parent.get(node)) { const at = location(nodes.get(node)); if (seen.has(at)) continue; seen.add(at); inclusive.set(at, (inclusive.get(at) ?? 0) + ms); } }
  const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([location, sampledMs]) => ({ location, sampledMs })); return { self: top(self), inclusive: top(inclusive), wallMs: (profile.endTime - profile.startTime) / 1000, scope: 'sampled CPU; inclusive overlap, not additive operation times' };
}
async function measure(page, name, action) { const start = await page.evaluate(() => performance.timeOrigin + performance.now()); await action(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); const end = await page.evaluate(() => performance.timeOrigin + performance.now()); tasks.push({ name, wallMs: end - start, ...await page.evaluate(({ start, end }) => ({ longTasks: telemetry.longTasks.filter(t => t.start + performance.timeOrigin >= start && t.start + performance.timeOrigin < end), longFrames: telemetry.frames.filter(t => t.start + performance.timeOrigin >= start && t.start + performance.timeOrigin < end) }), { start, end }) }); }
async function menu(page) { if (!await page.getByRole('dialog', { name: '阅读菜单', exact: true }).isVisible()) await page.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); }
try {
  for (let run = 0; run < samples; run++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(); current = page; page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { window.telemetry = { longTasks: [], frames: [] }; for (const [type, key] of [['longtask', 'longTasks'], ['long-animation-frame', 'frames']]) if (PerformanceObserver.supportedEntryTypes.includes(type)) new PerformanceObserver(list => telemetry[key].push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration, blockingDuration: e.blockingDuration ?? null, scripts: e.scripts?.map(s => ({ sourceURL: s.sourceURL, invoker: s.invoker, duration: s.duration, function: s.sourceFunctionName, position: s.sourceCharPosition })) ?? [] })))).observe({ type, buffered: true }); });
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable'); if (run === 0) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
    await measure(page, `${run}-open`, () => page.goto(url)); await measure(page, `${run}-start`, () => page.getByRole('button', { name: '开始故事', exact: true }).click());
    let saves = 0, paragraphs = new Set(); const before = (await cdp.send('Performance.getMetrics')).metrics;
    for (let i = 0; i < 500; i++) {
      if (await page.locator('main.player-shell').getAttribute('data-player-status') === 'ended') break;
      if (await page.locator('.player-choice button').count()) { await measure(page, `${run}-choice`, () => page.locator('.player-choice').getByRole('button', { name: '去追最后一班车', exact: true }).click()); continue; }
      await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const text = (await page.locator('.player-dialogue__text').innerText()).trim(); paragraphs.add(text);
      const voice = page.locator('audio[data-audio-bus="voice"]'); if (await voice.count()) await page.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="voice"]'); return !a || a.ended || a.error; }); assert.equal(await page.locator('.player-media-error').count(), 0);
      if ([10, 30, 50].includes(paragraphs.size) && saves < [10, 30, 50].indexOf(paragraphs.size) + 1) {
        await measure(page, `${run}-save-${paragraphs.size}`, async () => { await menu(page); await page.getByRole('button', { name: '快速保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); }); saves++;
        await measure(page, `${run}-load-${paragraphs.size}`, async () => { await menu(page); await page.getByRole('button', { name: '快速读取', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded' || document.querySelector('.player-load-confirm')); const confirm = page.locator('.player-load-confirm'); if (await confirm.isVisible()) await confirm.getByRole('button', { name: '确认读取', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); const readingMenu = page.getByRole('dialog', { name: '阅读菜单', exact: true }); if (await readingMenu.isVisible()) await readingMenu.getByRole('button', { name: '返回故事', exact: true }).click(); });
      }
      await measure(page, `${run}-next-${i}`, () => page.getByRole('button', { name: '继续下一句', exact: true }).click());
    }
    assert.equal(await page.locator('main.player-shell').getAttribute('data-player-status'), 'ended'); assert.equal(paragraphs.size, 66); assert.equal(saves, 3); const after = (await cdp.send('Performance.getMetrics')).metrics;
    if (run === 0) { const { profile } = await cdp.send('Profiler.stop'); await writeFile(path.join(scratch, label + '.cpuprofile'), JSON.stringify(profile)); profiles.push(summarize(profile)); }
    results.push({ run, paragraphs: paragraphs.size, saves, before, after, telemetry: await page.evaluate(() => telemetry) }); await page.screenshot({ path: path.join(output, label + '-ending.png') }); console.log('PASS ' + label + ' full route ' + run); await context.close();
  }
  assert.deepEqual(errors, []); await writeFile(path.join(output, label + '.json'), JSON.stringify({ passed: true, label, samples, browser: browser.version(), candidateArchiveSha256: sha(archive), originalRuntimeHash, diagnosticRuntimeHash: sha(files['player.js']), telemetryInstrumented: true, tasks, profiles, results, errors, physicalDevice: false, humanTiming: false, statisticalBenchmark: false, twoHourSoakPassed: false }, null, 2));
} catch (error) { if (current && !current.isClosed()) await current.screenshot({ path: path.join(output, label + '-failure.png') }); await writeFile(path.join(output, label + '-failure.json'), JSON.stringify({ error: String(error), stack: error.stack, tasks, errors }, null, 2)); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

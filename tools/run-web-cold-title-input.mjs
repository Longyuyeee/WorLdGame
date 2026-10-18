import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-story-plans-and-farewell');
const baseline = process.argv.includes('--baseline'), engine = process.argv.find(x => x.startsWith('--engine='))?.slice(9) ?? 'webkit';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const html = await readFile(path.join(root, baseline ? 'evidence/web-reading-delivery/before-rain-stops.html' : 'evidence/web-story-plans-and-farewell/before-rain-stops.html'));
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
await mkdir(output, { recursive: true }); const report = path.join(output, `${engine}-cold-title${baseline ? '-baseline' : ''}.json`), checks = [], errors = [];
await writeFile(report, JSON.stringify({ passed: false, status: 'running' }));
const server = createServer((req, res) => res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html)); await listenBrowserLoopback(server);
const browser = await engines[engine].launch({ headless: true }); let current;
try {
  for (let attempt = 0; attempt < 20; attempt++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      window.titleInputProbe = [];
      for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
        window.titleInputProbe.push({ type, tag: event.target.tagName, label: event.target.getAttribute('aria-label'), preferencesOpen: document.querySelector('main')?.dataset.preferencesOpen, host: document.querySelector('main')?.dataset.hostActivity });
      }, true);
    });
    const page = await context.newPage(); current = page; page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    // The very first user action: no settling delay, snapshot, synthetic click,
    // focus workaround or automatic retry before the real pointer click.
    await page.getByRole('button', { name: '打开玩家设置', exact: true }).click();
    await page.getByLabel('文字显示', { exact: true }).waitFor({ timeout: 2500 });
    const detail = await page.locator('main').evaluate(element => ({ attempt: 0, open: element.dataset.preferencesOpen, status: element.dataset.playerStatus, events: window.titleInputProbe })); detail.attempt = attempt;
    checks.push(detail); assert.equal(detail.open, 'true'); assert.equal(detail.status, 'title');
    assert.deepEqual(detail.events.map(event => event.type), ['pointerdown', 'pointerup', 'click']);
    assert.ok(detail.events.every(event => event.label === '打开玩家设置' && event.host === 'active'));
    if (attempt === 0) await page.screenshot({ path: path.join(output, `${engine}-cold-title${baseline ? '-baseline' : ''}.png`) });
    await context.close();
  }
  assert.deepEqual(errors, []); await writeFile(report, JSON.stringify({ passed: true, baseline, browser: browser.version(), artifactSha256: sha(html), checks, errors, scope: 'Twenty fresh contexts with the first real pointer click opening settings, native input event observation and actual panel. No automatic click retry or synthetic input. Bounded diagnostic only: does not close the #393 intermittent settings timeout, prove OS cold start, physical phone/Safari or long-soak acceptance.' }, null, 2)); console.log(`PASS ${engine} 20 cold title settings contexts`);
} catch (error) {
  const events = current && !current.isClosed() ? await current.evaluate(() => window.titleInputProbe).catch(() => null) : null;
  if (current && !current.isClosed()) await current.screenshot({ path: path.join(output, `${engine}-cold-title${baseline ? '-baseline' : ''}-failure.png`) });
  await writeFile(report, JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors, events }, null, 2)); throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

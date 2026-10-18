// Isolate offline-emulation behavior from the game before changing its test mechanism.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const worker = "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(new Response('<h1>Worker-only literal response</h1>',{headers:{'Content-Type':'text/html','X-Offline-Probe':'worker'}})));";
const server = createServer((request, response) => response.writeHead(200, { 'Content-Type': request.url.endsWith('sw.js') ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' }).end(request.url.endsWith('sw.js') ? worker : '<h1>Origin response</h1>'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await engines.webkit.launch({ headless: true }), context = await browser.newContext(), page = await context.newPage();
const report = { engine: browser.version(), offlineFlag: {}, originStopped: {}, negativeControl: {}, notGameCode: true };
try {
  await page.goto(origin + '/sw-test/index.html'); await page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js', { scope: './' }); await navigator.serviceWorker.ready; }); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  try { const response = await page.goto(origin + '/sw-test/uncached-flag', { timeout: 10000 }); report.offlineFlag = { passed: response.headers()['x-offline-probe'] === 'worker', fromServiceWorker: response.fromServiceWorker() }; } catch (error) { report.offlineFlag = { passed: false, error: String(error) }; }
  await context.setOffline(false); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  const response = await page.goto(origin + '/sw-test/uncached-origin-stopped', { timeout: 10000 }); report.originStopped = { passed: response.headers()['x-offline-probe'] === 'worker' && await page.locator('h1').textContent() === 'Worker-only literal response', fromServiceWorker: response.fromServiceWorker() };
  const control = await context.newPage(); try { const result = await control.goto(origin + '/no-worker-control', { timeout: 10000 }); report.negativeControl = { networkFailed: false, status: result?.status(), headers: result?.headers(), fromServiceWorker: result?.fromServiceWorker(), body: (await control.locator('body').innerText()).slice(0, 300), url: control.url(), controller: await control.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null) }; } catch (error) { report.negativeControl = { networkFailed: true, error: String(error) }; }
  try { const response = await fetch(origin + '/node-origin-control'); report.nodeOriginControl = { failed: false, status: response.status() }; } catch (error) { report.nodeOriginControl = { failed: true, error: String(error) }; }
  // This Windows WebKit transport returns proxy HTTP 502 rather than rejecting
  // the uncontrolled navigation. Preserve that distinction; Node confirms TCP failure.
  report.validOriginOutageControl = report.originStopped.passed && report.nodeOriginControl.failed && (report.negativeControl.networkFailed || report.negativeControl.status >= 500 && report.negativeControl.fromServiceWorker === false && report.negativeControl.controller === null);
  const output = path.resolve(import.meta.dirname, '../evidence/web-deployment-flow'); await mkdir(output, { recursive: true }); await writeFile(path.join(output, 'webkit-offline-probe.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  if (!report.validOriginOutageControl) process.exitCode = 1;
} finally { await browser.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

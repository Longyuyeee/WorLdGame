// Read-only diagnosis of a previously downloaded game. No project or player state is injected.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const out = path.resolve('evidence/web-skin-images'), files = unzipSync(await readFile(path.join(out, 'page-images-web.zip')));
const server = createServer((req, res) => { const name = new URL(req.url, 'http://local').pathname.slice(1) || 'index.html'; res.writeHead(files[name] ? 200 : 404, { 'Content-Type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(name)] ?? 'application/octet-stream' }); res.end(files[name]); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), p = await context.newPage(); await p.goto(`http://127.0.0.1:${server.address().port}/`);
  const button = p.getByRole('button', { name: '打开这封回信', exact: true }); await button.scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(p), box = await button.boundingBox();
  const state = () => button.evaluate(e => ({ active: e.matches(':active'), text: e.textContent, rect: e.getBoundingClientRect().toJSON(), image: getComputedStyle(e).backgroundImage, hit: document.elementFromPoint(e.getBoundingClientRect().x + e.clientWidth / 2, e.getBoundingClientRect().y + e.clientHeight / 2)?.outerHTML.slice(0, 160), visual: { scale: visualViewport.scale, offsetTop: visualViewport.offsetTop } }));
  const report = { before: await state(), after: [] };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  for (const delay of [0, 20, 80, 160]) { await p.waitForTimeout(delay); report.after.push({ delay, state: await state() }); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await writeFile(path.join(out, 'touch-diagnostic.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }

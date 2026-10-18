import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium'; assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const output = path.resolve(root, process.env.STUDIO_COLLECTION_COVERS_OUTPUT_DIRECTORY ?? `evidence/web-collection-reading/${baseline ? 'covers-baseline' : 'covers'}`);
await mkdir(output, { recursive: true }); const reportPath = path.join(output, `${engine}.json`);
try { await access(reportPath); throw Error('Refusing to overwrite a collection cover report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const fixture = path.join(root, 'tools/fixtures/collection-reading-player.ts');
const baselineCommit = '74f98747eb86fb7a3154a41a339e4f7f4a4daf6c', sourcePaths = ['apps/player-shell/src/PlayerShell.tsx', 'apps/player-shell/src/player-shell.css'];
const overrides = new Map(), sourceHashes = {};
for (const file of sourcePaths) { const bytes = baseline ? execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root, windowsHide: true, maxBuffer: 2 ** 22 }) : await readFile(path.join(root, file)); sourceHashes[file] = sha(bytes.toString().replaceAll('\r\n', '\n')); if (baseline) overrides.set(path.join(root, file).replaceAll('\\', '/'), bytes.toString()); }
const bundles = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'collection-cover-baseline', load(id) { return overrides.get(id.replaceAll('\\', '/')); } }], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: fixture, name: 'CollectionReading', formats: ['iife'] } } });
const files = (Array.isArray(bundles) ? bundles : [bundles]).flatMap(item => item.output), code = files.find(item => item.type === 'chunk').code, css = files.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n');
const identity = { baselineCommit: baseline ? baselineCommit : null, sourceHashes, codeSha256: sha(code), cssSha256: sha(css), fixtureSha256: sha((await readFile(fixture, 'utf8')).replaceAll('\r\n', '\n')) };
const media = JSON.parse(await readFile(path.join(root, 'fixtures/projects/media/media-golden.json'), 'utf8')).assets;
const server = createServer((req, res) => { const name = new URL(req.url, 'http://local').pathname, asset = media.find(asset => name === `/media/${asset.assetId}`); if (asset) return res.writeHead(200, { 'Content-Type': asset.mimeType }).end(Buffer.from(asset.base64, 'base64')); res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' }).end(name.endsWith('.js') ? code : name.endsWith('.css') ? css : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/player.css"><div id="player-root"></div><script src="/player.js"></script>'); });
const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
let browser, page; const samples = [], errors = [];
try {
  await listenBrowserLoopback(server); browser = await engines[engine].launch({ headless: true }); page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' }); page.on('pageerror', error => errors.push(String(error)));
  const button = name => page.getByRole('button', { name, exact: true }); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await button('打开玩家设置').click(); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click();
  await button('开始故事').click();
  for (let index = 0; index < 6 && await page.locator('main').getAttribute('data-player-status') !== 'ended'; index++) {
    // The awaited cue can finish between lookup and click. Resolve the live
    // available action, rather than retain a locator for an expired cue button.
    await button('完成动效').or(button('继续下一句')).first().click();
  }
  await page.waitForFunction(() => document.querySelector('main')?.dataset.playerStatus === 'ended');
  await button('查看收藏与结局').click();
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const [view, selector] of [['场景回想', 'replay'], ['音乐室', 'music'], ['结局', 'endings']]) {
      await button('返回附加内容总览').click(); await button(`查看 ${view}`).click();
      await page.waitForFunction(selector => [...document.querySelectorAll(`.player-additional-content__${selector} .player-additional-content__catalog-cover`)].every(image => image.complete && image.naturalWidth > 0), selector);
      const result = await page.locator(`.player-additional-content__${selector}`).evaluate(list => {
        const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        return { overflow: list.scrollWidth - list.clientWidth, rows: [...list.children].map(row => { const cover = row.querySelector('.player-additional-content__catalog-cover'); return { title: row.querySelector('strong').textContent, titleBox: box(row.querySelector('strong')), rowBox: box(row), coverBox: box(cover), coverReady: !!cover && cover.complete && cover.naturalWidth > 0, actionBox: row.querySelector('button') ? box(row.querySelector('button')) : null }; }) };
      });
      samples.push({ viewport, view, result }); await page.screenshot({ path: path.join(output, `${engine}-${selector}-${viewport.width}.png`), animations: 'disabled' });
      if (!baseline) { assert.ok(result.overflow <= 1, 'No list overflow'); for (const row of result.rows) { assert.equal(row.coverReady, true); assert.ok(row.titleBox.width >= 120, `${view} title width ${row.titleBox.width}`); assert.ok(row.coverBox && row.coverBox.width <= 72 && row.coverBox.width > 0); assert.ok(row.titleBox.x >= row.rowBox.x && row.titleBox.x + row.titleBox.width <= row.rowBox.x + row.rowBox.width + 1); if (row.actionBox) { assert.ok(row.actionBox.height >= 44 && row.actionBox.x + row.actionBox.width <= row.rowBox.x + row.rowBox.width + 1); assert.ok(row.actionBox.y >= row.titleBox.y + row.titleBox.height || row.actionBox.x >= row.titleBox.x + row.titleBox.width, 'Title and action do not overlap'); } } }
    }
  }
  assert.deepEqual(errors, []);
} catch (error) { errors.push(String(error?.stack ?? error)); if (page) { errors.push(await page.locator('main').innerText().catch(() => 'No player')); await page.screenshot({ path: path.join(output, `${engine}-failure.png`) }).catch(() => {}); } }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await writeFile(reportPath, JSON.stringify({ baseline, engine, identity, samples, errors, scope: 'Configured catalog covers and long names in an isolated native-browser fixture. Not an authored Rain story export or full-story acceptance.' }, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ report: path.relative(root, reportPath), samples: samples.length, errors })); }
if (errors.length) process.exitCode = 1;

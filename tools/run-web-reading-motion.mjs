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
const output = path.resolve(root, process.env.STUDIO_READING_MOTION_OUTPUT_DIRECTORY ?? `evidence/web-reading-motion/${baseline ? 'baseline' : 'browser'}`);
await mkdir(output, { recursive: true }); const reportPath = path.join(output, `${engine}.json`);
try { await access(reportPath); throw Error('Refusing to overwrite a reading motion report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const fixture = path.join(root, 'tools/fixtures/reading-motion-player.ts'), baselineCommit = 'aab617c007950fd2fd14d23f6a84e95a5aecb4e8';
const sourcePaths = ['apps/player-shell/src/PlayerShell.tsx', 'apps/player-shell/src/player-shell.css', 'apps/player-shell/src/player-skin.css', 'apps/player-shell/src/use-replay-reading-return.ts'];
const overrides = new Map(), sourceHashes = {};
for (const file of sourcePaths) { const bytes = baseline ? execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root, windowsHide: true, maxBuffer: 2 ** 22 }) : await readFile(path.join(root, file)); sourceHashes[file] = sha(bytes.toString().replaceAll('\r\n', '\n')); if (baseline) overrides.set(path.join(root, file).replaceAll('\\', '/'), bytes.toString()); }
const bundles = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'reading-motion-baseline', load(id) { return overrides.get(id.replaceAll('\\', '/')); } }], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: fixture, name: 'ReadingMotion', formats: ['iife'] } } });
const files = (Array.isArray(bundles) ? bundles : [bundles]).flatMap(item => item.output), code = files.find(item => item.type === 'chunk').code, css = files.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n');
const identity = { baselineCommit: baseline ? baselineCommit : null, sourceHashes, codeSha256: sha(code), cssSha256: sha(css), fixtureSha256: sha((await readFile(fixture, 'utf8')).replaceAll('\r\n', '\n')) };
const server = createServer((req, res) => { const name = new URL(req.url, 'http://local').pathname; res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' }).end(name.endsWith('.js') ? code : name.endsWith('.css') ? css : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/player.css"><div id="player-root"></div><script src="/player.js"></script>'); });
const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
let browser, page; const checks = [], errors = [];
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('main').evaluate(el => ({ hash: el.dataset.runtimeStateHash, host: el.dataset.runtimeHostSnapshotHash, cursor: el.dataset.historyCursor, text: el.querySelector('.player-dialogue__text')?.textContent, replay: el.dataset.sceneReplay }));
const paint = () => page.locator('.player-dialogue__text').evaluate(el => { const style = getComputedStyle(el), host = getComputedStyle(el.closest('.player-dialogue')), duration = Number(el.closest('.player-dialogue').dataset.textRevealDuration), animation = el.getAnimations().find(item => item.animationName === 'player-text-reveal'); return { ready: el.closest('.player-dialogue').dataset.textReady, opacity: style.opacity, clipPath: style.clipPath, animation: style.animationName, filter: style.filter, progress: animation ? (Number(animation.currentTime) - Number(animation.effect.getTiming().delay)) / duration : null, offset: Number(el.closest('.player-dialogue').dataset.textRevealOffset ?? 0), hostOpacity: host.opacity, hostAnimation: host.animationName }; });
const shot = name => page.screenshot({ path: path.join(output, `${engine}-${name}.png`) }); // Do not finish animations while measuring partial text.
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function extras() { await button('打开阅读菜单').click(); await button('打开附加内容').click(); await button('查看 场景回想').click(); }
async function enter() { await page.getByRole('button', { name: /^开始回想 /u }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay !== 'inactive'); }
async function waitPartial() { await page.waitForFunction(() => { const el = document.querySelector('.player-dialogue__text'), animation = el?.getAnimations().find(item => item.animationName === 'player-text-reveal'); return animation && Number(animation.currentTime) >= 1100 && el.closest('.player-dialogue').dataset.textReady === 'false'; }); }
try {
  await listenBrowserLoopback(server); browser = await engines[engine].launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' }); page.on('pageerror', error => errors.push(String(error)));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await button('开始故事').click(); await waitPartial(); const beforeFull = await state(); await button('继续下一句').click(); const explicit = await paint(); assert.equal(explicit.ready, 'true'); if (!baseline) { assert.equal(explicit.opacity, '1'); assert.equal(explicit.clipPath, 'none'); assert.equal(explicit.animation, 'none'); } await shot('explicit-full-text');
  checks.push({ name: 'explicit-full-text-is-actually-visible-with-letter-ink', beforeFull, paint: explicit });
  // Real UI completion unlocks the replay, then ordinary history returns to the
  // second paragraph. No injected session, unlock or browser animation clock.
  for (let index = 0; index < 25 && await page.locator('main').getAttribute('data-player-status') !== 'ended'; index++) await button('继续下一句').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.playerStatus === 'ended'); await page.setViewportSize({ width: 1280, height: 800 }); await button('后退一步').click(); await page.setViewportSize({ width: 390, height: 844 }); await waitPartial();
  await extras(); const parent = await state(), partial = await paint(); await enter(); await button('退出回想，返回原剧情').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay === 'inactive');
  await settle(); const returned = await paint(); assert.deepEqual(await state(), parent); if (!baseline) { assert.equal(returned.ready, 'false'); assert.ok(returned.progress >= partial.progress - .03, `Partial text rewound: ${partial.progress} -> ${returned.progress}`); } await shot('partial-replay-return');
  checks.push({ name: 'partial-parent-replay-return-keeps-visible-progress', parent, before: partial, after: returned });
  await button('继续下一句').click(); await page.waitForFunction(() => document.querySelector('.player-dialogue')?.dataset.textReady === 'true'); const fullParent = await state(); await extras(); await enter(); await button('退出回想，返回原剧情').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay === 'inactive'); await settle(); const fullReturn = await paint(); assert.deepEqual(await state(), fullParent); assert.equal(fullReturn.ready, 'true'); if (!baseline) { assert.equal(fullReturn.opacity, '1'); assert.equal(fullReturn.clipPath, 'none'); assert.equal(fullReturn.animation, 'none'); } await shot('full-replay-return');
  checks.push({ name: 'completed-parent-is-not-recovered-by-a-new-ink-animation', paint: fullReturn });
  await page.close();
  for (const reduction of ['personal', 'system']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduction === 'system' ? 'reduce' : 'no-preference' }); page = await context.newPage(); page.on('pageerror', error => errors.push(String(error))); await page.goto(url + '?preset=ocean');
    if (reduction === 'personal') { await button('打开玩家设置').click(); await page.getByLabel('减少动效', { exact: true }).check(); await button('返回故事').click(); }
    await button('开始故事').hover(); const hover = await button('开始故事').evaluate(el => ({ transform: getComputedStyle(el).transform, transition: getComputedStyle(el).transitionDuration })); if (!baseline) assert.equal(hover.transform, 'none'); await button('开始故事').click(); const reduced = await paint(); if (!baseline) { assert.equal(reduced.ready, 'true'); assert.equal(reduced.animation, 'none'); assert.equal(reduced.hostAnimation, 'none'); } checks.push({ name: `${reduction}-reduction-removes-skin-motion-and-hover-displacement`, hover, paint: reduced }); await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) { errors.push(String(error?.stack ?? error)); if (page && !page.isClosed()) await shot('failure').catch(() => {}); }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await writeFile(reportPath, JSON.stringify({ baseline, engine, identity, checks, errors, scope: 'Real UI text completion, ordinary history, replay return and personal/system reduced-motion in isolated letter/ocean preset fixtures. Native CSS paint and timers, not simulated animation/media events. No Rain source change, physical phone, natural listening or real OS background acceptance.' }, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ report: path.relative(root, reportPath), checks: checks.length, errors })); }
if (errors.length) process.exitCode = 1;

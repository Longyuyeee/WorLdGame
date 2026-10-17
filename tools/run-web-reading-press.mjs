import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, process.env.STUDIO_READING_PRESS_OUTPUT_DIRECTORY ?? 'evidence/web-reading-press');
const baseline = process.argv.includes('--baseline');
const realTime = process.argv.includes('--real-time');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.resolve(root, baseline ? 'evidence/web-story-plans-and-farewell/before-rain-stops.html' : process.env.STUDIO_READING_PRESS_SOURCE_HTML ?? 'evidence/web-reading-press/before-rain-stops.html');
const bytes = await readFile(source), label = baseline ? `baseline-${engine}` : engine;
await mkdir(output, { recursive: true });
const report = path.join(output, `${label}.json`);
await writeFile(report, JSON.stringify({ passed: false, status: 'running' }));
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true, reducedMotion: 'reduce' });
const checks = [], errors = []; page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
const advance = milliseconds => realTime ? page.waitForTimeout(milliseconds) : page.clock.runFor(milliseconds);
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, auto: el.dataset.autoPlayback, text: el.querySelector('.player-dialogue__text')?.textContent }));
async function press() { const box = await button('继续下一句').boundingBox(); assert.ok(box); await page.mouse.move(box.x + box.width - 12, box.y + box.height - 12); await page.mouse.down(); }
try {
  await page.goto(pathToFileURL(source).href);
  await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click(); await button('开始故事').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  const epoch = new Date('2026-10-18T04:00:00Z');
  if (!realTime) { await page.clock.install({ time: epoch }); await page.clock.pauseAt(new Date(epoch.getTime() + 1000)); }
  await button('打开阅读菜单').click(); await button('自动播放').click(); await button('返回故事').click();
  const before = await state(); await press(); let changed;
  for (let i = 0; i < 90; i++) { await advance(1000); changed = await state(); if (changed.cursor !== before.cursor) break; }
  assert.notEqual(changed.cursor, before.cursor, 'The real Auto clock must commit the next paragraph while the native pointer remains held');
  await page.screenshot({ path: path.join(output, `${label}-before-release.png`), animations: 'disabled' });
  await page.mouse.up(); await advance(250); const released = await state();
  checks.push({ name: 'press-observation', before, changed, released });
  if (baseline) { assert.notEqual(released.cursor, changed.cursor); assert.equal(released.auto, 'off'); }
  else { assert.equal(released.cursor, changed.cursor); assert.equal(released.hash, changed.hash); assert.notEqual(released.auto, 'off'); }
  checks.push({ name: baseline ? 'reproduced-press-on-previous-paragraph-skips-new-paragraph-and-stops-auto' : 'release-of-previous-paragraph-does-not-skip-new-paragraph-or-stop-auto', before, changed, released });
  await page.screenshot({ path: path.join(output, `${label}-after-release.png`), animations: 'disabled' });
  if (!baseline) {
    // A fresh click on the new paragraph is still an intentional manual takeover.
    await press(); await page.mouse.up(); await advance(250); const takeover = await state();
    assert.notEqual(takeover.cursor, released.cursor); assert.equal(takeover.auto, 'off'); if (!realTime) await page.clock.resume();
    checks.push({ name: 'fresh-native-click-still-advances-and-stops-auto', released, takeover });
    await button('打开阅读菜单').click(); await button('本次先无声阅读').click();
    // Hide and restore the surface through the public shortcut while a native
    // button is still held. No fabricated pointer/click or narrative event.
    const beforeHide = await state(); await press(); await page.keyboard.press('h'); await page.keyboard.press('h'); await page.mouse.up();
    assert.deepEqual(await state(), beforeHide);
    await button('继续下一句').click(); await page.waitForFunction(cursor => document.querySelector('main')?.dataset.historyCursor !== cursor, beforeHide.cursor);
    checks.push({ name: 'artwork-return-discards-old-press-but-next-native-click-works', beforeHide, afterNewClick: await state() });
    for (const key of ['Space', 'Enter']) {
      const beforeKey = await state(); await button('继续下一句').focus(); await page.keyboard.press(key);
      await page.waitForFunction(cursor => document.querySelector('main')?.dataset.historyCursor !== cursor, beforeKey.cursor);
      checks.push({ name: 'native-keyboard-still-advances-once', key, before: beforeKey, after: await state() });
    }
    await button('打开阅读菜单').click(); await button('打开玩家设置').click(); await page.getByLabel('个人字号', { exact: true }).focus(); await page.getByLabel('个人字号', { exact: true }).press('End'); await button('返回故事').click();
    await page.setViewportSize({ width: 568, height: 320 });
    await page.waitForFunction(() => { const e = document.querySelector('.player-dialogue'); return e && e.scrollHeight > e.clientHeight + 2; });
    const beforeDrag = await state(); const box = await button('继续下一句').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
    assert.deepEqual(await state(), beforeDrag);
    const scrollBefore = await button('继续下一句').evaluate(el => el.scrollTop); await button('继续下一句').tap();
    await page.waitForFunction(top => document.querySelector('.player-dialogue')?.scrollTop > top, scrollBefore); assert.deepEqual(await state(), beforeDrag);
    await page.screenshot({ path: path.join(output, `${label}-landscape-tap.png`), animations: 'disabled' });
    checks.push({ name: 'landscape-native-drag-does-not-flip-and-fresh-touch-tap-pages-within-paragraph', state: beforeDrag, scrollBefore, scrollAfter: await button('继续下一句').evaluate(el => el.scrollTop) });
    await page.setViewportSize({ width: 390, height: 844 }); assert.deepEqual(await state(), beforeDrag);
    await button('打开阅读菜单').tap(); const menuState = await state(); await button('返回故事').tap(); assert.deepEqual(await state(), menuState);
    await page.screenshot({ path: path.join(output, `${label}-portrait-return.png`), animations: 'disabled' });
    checks.push({ name: 'phone-rotation-and-native-menu-taps-preserve-current-paragraph', state: menuState });
  }
  assert.deepEqual(errors, []);
  await writeFile(report, JSON.stringify({ passed: true, browser: browser.version(), artifactSha256: sha(bytes), clockMode: realTime ? 'real' : 'controlled', checks, errors, scope: baseline ? 'Original #394 HTML, native mouse down/up and production Auto reproduce a release on the wrong paragraph. Not a candidate acceptance run.' : `Actual game HTML, native mouse down/up/drag, keyboard shortcuts and native touch taps in phone-sized windows. Production Auto clock under ${realTime ? 'unmodified real' : 'controlled'} time; no fabricated pointer/click, DOM geometry or narrative states. Not natural reading timing, physical touch/phone/Safari, background-lock cycle or audio acceptance.` }, null, 2));
  console.log(`PASS ${label} paragraph press ownership`);
} catch (error) { await page.screenshot({ path: path.join(output, `${label}-failure.png`), animations: 'disabled' }); await writeFile(report, JSON.stringify({ passed: false, artifactSha256: sha(bytes), error: String(error), stack: error.stack, checks, errors, lastState: await state(), geometry: await button('继续下一句').evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, scrollHeight: el.scrollHeight })).catch(() => null) }, null, 2)); throw error; }
finally { await browser.close(); }

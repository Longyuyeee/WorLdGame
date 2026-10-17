import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { sha } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-audio-preview-recovery');
const baseline = process.argv.includes('--baseline'), engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'webkit';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', require = createRequire(import.meta.url);
let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
await mkdir(output, { recursive: true }); const label = baseline ? `baseline-${engine}` : engine;
const build = {}, index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), index);
for (const [, name] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) { build[name] = sha(await readFile(path.join(root, 'apps/editor/dist', name))); assert.equal(sha(new Uint8Array(await (await fetch(new URL(name, ui))).arrayBuffer())), build[name]); }
const browser = await engines[engine].launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await page.addInitScript(() => {
  window.previewMediaEvents = []; window.previewNativeCalls = [];
  for (const name of ['pointerdown', 'click', 'loadstart', 'loadedmetadata', 'canplay', 'play', 'playing', 'waiting', 'pause', 'error', 'stalled', 'timeupdate', 'ended']) document.addEventListener(name, event => {
    const el = event.target; if (!(el instanceof HTMLAudioElement) || !el.closest('.web-source-preview')) return;
    window.previewMediaEvents.push({ name, at: performance.now(), paused: el.paused, time: el.currentTime, readyState: el.readyState, error: el.error?.code ?? null });
  }, true);
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(...args) {
    const result = nativePlay.apply(this, args);
    if (this.closest('.web-source-preview')) {
      const call = { outcome: 'pending', at: performance.now() }; window.previewNativeCalls.push(call);
      void result.then(() => { call.outcome = 'resolved'; }, error => { call.outcome = error.name; });
    }
    return result;
  };
});
const checks = [], errors = []; page.on('pageerror', e => errors.push(String(e))); page.setDefaultTimeout(30000);
const button = name => page.getByRole('button', { name, exact: true }), dialog = () => page.getByRole('dialog', { name: '素材来源与发行准备', exact: true });
async function state() { return page.locator('.web-source-preview audio').evaluate(el => ({ paused: el.paused, ended: el.ended, time: el.currentTime, readyState: el.readyState, error: el.error?.code ?? null, status: el.closest('.asset-audio-preview').innerText, events: window.previewMediaEvents ?? [], nativeCalls: window.previewNativeCalls ?? [], promise: window.previewPlayPromise ?? null })); }
try {
  await page.goto(ui); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-story-plans-and-farewell/before-rain-stops-project.zip')); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await button('核对素材来源').click(); await dialog().getByLabel('搜索素材', { exact: true }).fill('voice_04'); await dialog().getByRole('group', { name: '选择来源素材', exact: true }).getByRole('button').click(); await button('试听当前音频').click();
  const audio = page.locator('.web-source-preview audio'); await audio.waitFor();
  if (baseline) {
    const box = await audio.boundingBox(); await audio.click({ position: { x: 20, y: box.height / 2 } }); await page.waitForTimeout(2000); const afterControl = await state();
    await audio.evaluate(el => { window.previewPlayPromise = 'pending'; void el.play().then(() => { window.previewPlayPromise = 'resolved'; }, error => { window.previewPlayPromise = error.name; }); });
    await page.waitForTimeout(10000); const afterExplicitPlay = await state();
    checks.push({ name: 'observed-native-controls-versus-explicit-play', afterControl, afterExplicitPlay, explicitPendingWaitMs: 10000 });
    assert.equal(afterControl.time, 0); assert.ok(/点击播放试听|音频无法播放/u.test(afterControl.status));
    assert.equal(afterExplicitPlay.time, 0); assert.equal(afterExplicitPlay.error, 4); assert.equal(afterExplicitPlay.promise, 'NotSupportedError'); assert.ok(afterExplicitPlay.status.includes('音频无法播放'));
  } else {
    const marker = 'PRIVATE_AUDIO_RECOVERY_397'; await dialog().getByLabel('确认依据', { exact: true }).fill(marker);
    const initial = await state(); assert.equal(initial.time, 0); assert.equal(initial.paused, true);
    const old = await audio.elementHandle();
    await button('开始试听').focus(); await page.keyboard.press('Enter');
    let playback = false;
    if (engine === 'webkit') {
      await dialog().getByText(/音频无法播放|试听长时间没有进展/u).waitFor({ timeout: 12000 });
      assert.equal(await button('停止试听').count(), 0); await button('开始试听').waitFor();
    } else {
      await page.waitForFunction(() => { const a = document.querySelector('.web-source-preview audio'); return a.currentTime > 0 && !a.paused; }); playback = true;
      await button('停止试听').click(); assert.deepEqual(await old.evaluate(el => ({ paused: el.paused, src: el.getAttribute('src') })), { paused: true, src: null });
      await button('开始试听').click(); await page.waitForFunction(() => document.querySelector('.web-source-preview audio').currentTime > 0);
      await dialog().getByText('试听结束，可再次开始试听。', { exact: true }).waitFor();
    }
    checks.push({ name: 'explicit-keyboard-start-and-native-outcome', initial, result: await state(), playback, nativeProgressRequired: engine !== 'webkit', physicalDevice: false });
    const layouts = [];
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport); const geometry = [];
      for (const control of [button('开始试听'), button('重新准备试听'), audio]) {
        await control.scrollIntoViewIfNeeded(); const bounds = await control.evaluate(el => { const r = el.getBoundingClientRect(), body = el.closest('.web-credits-editor__body').getBoundingClientRect(); return { tag: el.tagName, width: r.width, height: r.height, visible: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= body.top - 1 && r.bottom <= body.bottom + 1, overflow: el.closest('dialog').scrollWidth > el.closest('dialog').clientWidth + 1 }; });
        assert.ok(bounds.visible && !bounds.overflow && bounds.width > 0 && bounds.height >= (bounds.tag === 'BUTTON' ? 44 : 1), JSON.stringify(bounds)); geometry.push(bounds);
      }
      await button('开始试听').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `${engine}-controls-${viewport.width}.png`), animations: 'disabled' }); layouts.push({ viewport, geometry });
    }
    checks.push({ name: 'three-phone-sized-layouts-with-reachable-native-and-explicit-controls', layouts });
    const before = await audio.getAttribute('src'); await button('重新准备试听').click(); await page.waitForFunction(url => { const a = document.querySelector('.web-source-preview audio'); return a && a.src.startsWith('blob:') && a.getAttribute('src') !== url; }, before);
    assert.equal(await audio.evaluate(el => el.currentTime), 0); await button('开始试听').click();
    if (engine === 'webkit') await dialog().getByText(/音频无法播放|试听长时间没有进展/u).waitFor({ timeout: 12000 });
    else await page.waitForFunction(() => document.querySelector('.web-source-preview audio').currentTime > 0);
    const last = await audio.elementHandle(); await button('关闭当前素材预览').click();
    assert.deepEqual(await last.evaluate(el => ({ paused: el.paused, src: el.getAttribute('src') })), { paused: true, src: null });
    assert.equal(await dialog().getByLabel('确认依据', { exact: true }).inputValue(), marker); assert.equal(await dialog().getByLabel('发行条件状态', { exact: true }).inputValue(), 'pending');
    checks.push({ name: 'manual-reprepare-retry-close-with-private-draft-and-pending-state-retained', markerSavedToCanonicalSource: false });
  }
  await page.screenshot({ path: path.join(output, label + '.png'), animations: 'disabled' }); assert.deepEqual(errors, []); await writeFile(path.join(output, label + '.json'), JSON.stringify({ passed: true, baseline, engine, browser: browser.version(), build, checks, errors, scope: 'Actual editor and original current voice file; native control click and native play Promise, observed events only. No synthetic media events; no claim of Safari, physical phone or licensing acceptance.' }, null, 2)); console.log(`PASS ${label} audio preview recovery`);
} catch (error) { await page.screenshot({ path: path.join(output, label + '-failure.png'), animations: 'disabled' }); await writeFile(path.join(output, label + '-failure.json'), JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); throw error; }
finally { await browser.close(); }

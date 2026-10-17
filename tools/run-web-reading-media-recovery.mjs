import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_READING_MEDIA_OUTPUT_DIRECTORY ?? 'evidence/web-reading-media-recovery');
const baseline = process.argv.includes('--baseline'), engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.resolve(root, baseline ? 'evidence/web-choice-keyboard/before-rain-stops.html' : process.env.STUDIO_READING_MEDIA_SOURCE_HTML ?? 'evidence/web-reading-media-recovery/before-rain-stops.html');
const bytes = await readFile(source), label = baseline ? `baseline-${engine}` : engine, checks = [], errors = [];
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true });
let page = await browser.newPage({ viewport: { width: 568, height: 320 }, hasTouch: true, reducedMotion: 'reduce' });
page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, audio: el.dataset.audioMode, auto: el.dataset.autoPlayback, text: el.querySelector('.player-dialogue__text')?.textContent }));
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
const faultSound = async (waitImages = true) => {
  await page.locator('audio[data-audio-bus="bgm"]').evaluate(el => { el.src = 'data:audio/wav;base64,AA=='; el.load(); });
  await page.waitForFunction(waitImages => !!document.querySelector('audio[data-audio-bus="bgm"]')?.error && (!waitImages || document.querySelector('main')?.dataset.stageImagesPending === 'false'), waitImages);
};
const geometry = async locator => locator.evaluate(el => {
  const r = el.getBoundingClientRect(), viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  return { x: r.x, y: r.y, width: r.width, height: r.height, inViewport: r.left >= viewport.left && r.top >= viewport.top && r.right <= viewport.right + 1 && r.bottom <= viewport.bottom + 1 };
});
try {
  await page.goto(pathToFileURL(source).href); await button('打开玩家设置').click();
  await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check();
  await page.getByLabel('个人字号', { exact: true }).focus(); await page.getByLabel('个人字号', { exact: true }).press('End');
  await button('返回故事').click(); await button('开始故事').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  await faultSound(); const original = await state();
  if (baseline) {
    await page.locator('.player-media-error').waitFor(); const overlap = await page.evaluate(() => {
      const a = document.querySelector('.player-media-error').getBoundingClientRect(), b = document.querySelector('.player-dialogue').getBoundingClientRect();
      return { error: { top: a.top, bottom: a.bottom }, reading: { top: b.top, bottom: b.bottom }, overlapHeight: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) };
    }); assert.ok(overlap.overlapHeight > 40); await shot('error-covers-reading'); checks.push({ name: 'original-native-error-covers-ordinary-reading', original, overlap });
  } else {
    await button('查看媒体问题').waitFor(); assert.equal(await page.locator('.player-stage > .player-media-error').count(), 0);
    const layouts = [];
    for (const viewport of [{ width: 568, height: 320 }, { width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport); const entrance = await geometry(button('查看媒体问题')), menuButton = await geometry(button('打开阅读菜单'));
      assert.ok(entrance.inViewport && entrance.height >= 44 && menuButton.inViewport && menuButton.height >= 44);
      assert.equal(await page.locator('.player-media-error').count(), 0); assert.equal((await state()).hash, original.hash);
      await shot(`reading-${viewport.width}`); await button('查看媒体问题').click(); const menu = page.getByRole('dialog', { name: '阅读菜单', exact: true });
      const retry = menu.getByRole('button', { name: '重试媒体', exact: true }); await retry.scrollIntoViewIfNeeded(); const recovery = await geometry(retry); assert.ok(recovery.inViewport && recovery.height >= 44);
      assert.equal(await menu.locator('.player-media-error').evaluate(el => getComputedStyle(el).position), 'static');
      assert.equal(await menu.getByRole('button', { name: '本次先无声阅读', exact: true }).count(), 1);
      const artwork = menu.getByRole('button', { name: '欣赏画面', exact: true });
      if (await artwork.count()) { await artwork.scrollIntoViewIfNeeded(); assert.ok((await geometry(artwork)).height >= 44); }
      await shot(`menu-${viewport.width}`); await page.keyboard.press('Escape'); assert.equal((await state()).hash, original.hash); assert.equal(await button('查看媒体问题').evaluate(el => el === document.activeElement), true);
      layouts.push({ viewport, entrance, menuButton, recovery });
    }
    checks.push({ name: 'error-does-not-cover-reading-and-menu-actions-remain-reachable', layouts, original });
    await page.setViewportSize({ width: 568, height: 320 }); const paragraph = button('继续下一句');
    await page.waitForFunction(() => { const e = document.querySelector('.player-dialogue'); return e && e.scrollHeight > e.clientHeight + 2; });
    const beforeTop = await paragraph.evaluate(el => el.scrollTop); await paragraph.tap();
    await page.waitForFunction(top => document.querySelector('.player-dialogue')?.scrollTop > top, beforeTop); const pagedTop = await paragraph.evaluate(el => el.scrollTop);
    assert.equal((await state()).hash, original.hash); await button('查看媒体问题').click(); await button('返回故事').click();
    assert.equal(await paragraph.evaluate(el => el.scrollTop), pagedTop); assert.equal((await state()).hash, original.hash);
    checks.push({ name: 'native-tap-pages-with-error-and-menu-return-preserves-current-reading-offset', beforeTop, pagedTop, afterMenu: await paragraph.evaluate(el => el.scrollTop) });
    await button('查看媒体问题').click(); await button('重试媒体').click(); await page.getByRole('dialog', { name: '阅读菜单', exact: true }).waitFor({ state: 'hidden' });
    assert.equal((await state()).hash, original.hash); assert.equal(await paragraph.evaluate(el => el.scrollTop), pagedTop);
    assert.equal(await paragraph.evaluate(el => el === document.activeElement), true);
    let settled = true;
    try { await page.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="bgm"]'); return a && (a.error || a.currentTime > 0 || a.dataset.playerPlayback === 'error'); }, null, { timeout: 8000 }); }
    catch (error) { if (engine !== 'webkit' || error.name !== 'TimeoutError') throw error; settled = false; }
    const retried = await page.locator('audio[data-audio-bus="bgm"]').evaluate(el => ({ currentTime: el.currentTime, error: el.error?.code ?? null, playback: el.dataset.playerPlayback, failureCode: el.dataset.audioFailureCode ?? null, paused: el.paused, readyState: el.readyState, networkState: el.networkState, src: el.getAttribute('src')?.slice(0, 40) }));
    retried.settledWithinObservation = settled; retried.nativePlaybackConfirmed = retried.currentTime > 0;
    if (engine !== 'webkit') assert.ok(retried.nativePlaybackConfirmed); // Windows WebKit audio remains an explicit open gate.
    checks.push({ name: 'explicit-retry-returns-to-same-paragraph-offset-and-native-transport', retried, sameOffset: true, audioAcceptance: retried.nativePlaybackConfirmed ? 'native muted time progressed; not natural listening' : 'not passed; native audio pending, UI retry only' });
    await faultSound(); await button('查看媒体问题').click();
    await button('本次先无声阅读').click(); await page.getByRole('dialog', { name: '阅读菜单', exact: true }).waitFor({ state: 'hidden' });
    assert.equal((await state()).hash, original.hash); assert.equal((await state()).audio, 'silent'); assert.equal(await page.locator('audio').count(), 0);
    assert.equal(await paragraph.evaluate(el => el.scrollTop), pagedTop); await button('查看媒体问题').waitFor({ state: 'hidden' });
    checks.push({ name: 'explicit-silence-returns-to-same-offset-without-changing-personal-settings', final: await state() }); await shot('recovered-reading');
    // The delivered stage uses Canvas sampling, not always an IMG. Inject at
    // native bitmap/IMG input boundaries so the real decoder emits its errors.
    await page.close(); page = await browser.newPage({ viewport: { width: 320, height: 740 }, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
    await page.addInitScript(() => {
      window.readingImageFault = true; window.readingImageFaults = 0;
      const bitmap = window.createImageBitmap;
      if (bitmap) window.createImageBitmap = (...args) => { if (window.readingImageFault) { window.readingImageFaults++; return bitmap(new Blob(['broken image'], { type: 'image/png' })); } return bitmap(...args); };
      const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) { if (window.readingImageFault && value) { window.readingImageFaults++; descriptor.set.call(this, 'data:image/png;base64,AA=='); } else descriptor.set.call(this, value); } });
      const set = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) { if (window.readingImageFault && this instanceof HTMLImageElement && name === 'src' && value) { window.readingImageFaults++; return set.call(this, name, 'data:image/png;base64,AA=='); } return set.call(this, name, value); };
    });
    await page.goto(pathToFileURL(source).href); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click(); await button('开始故事').click();
    await button('查看媒体问题').waitFor(); const pictureState = await state();
    await faultSound(false); await button('查看媒体问题').click(); await page.locator('.player-media-error').filter({ hasText: '画面资源未能加载' }).waitFor();
    await button('本次先无声阅读').click(); await button('查看媒体问题').click();
    await page.locator('.player-media-error').filter({ hasText: '画面资源未能加载' }).waitFor();
    await button('自动播放').click(); await button('返回故事').click();
    const crowded = await page.locator('.player-compact-toolbar button').evaluateAll(elements => elements.filter(el => getComputedStyle(el).display !== 'none').map(el => { const r = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label') ?? el.textContent, height: r.height, inViewport: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 }; }));
    assert.ok(crowded.length >= 4 && crowded.every(row => row.height >= 44 && row.inViewport)); await shot('picture-silent-auto-toolbar');
    assert.equal((await state()).hash, pictureState.hash); await button('停止自动阅读').click(); await button('查看媒体问题').click();
    await page.evaluate(() => { window.readingImageFault = false; }); await button('重试画面资源').click();
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button('查看媒体问题').waitFor({ state: 'hidden' });
    assert.equal((await state()).hash, pictureState.hash); const nativeImageFaults = await page.evaluate(() => window.readingImageFaults); assert.ok(nativeImageFaults > 0);
    checks.push({ name: 'native-canvas-picture-failure-survives-silence-and-explicit-picture-retry', pictureState, crowded, nativeImageFaults, final: await state() }); await shot('picture-recovered');
  }
  assert.deepEqual(errors, []); await writeFile(path.join(output, label + '.json'), JSON.stringify({ passed: true, engine, browser: browser.version(), artifactSha256: sha(bytes), checks, errors, scope: 'Actual complete game, invalid native WAV and PNG sources, native touch/keyboard/menu interactions and phone-sized desktop geometry. No fabricated native error/ended events, narrative state or DOM geometry; not physical phone/Safari, natural timing/listening, permissions or public deployment.' }, null, 2)); console.log(`PASS ${label} reading media recovery`);
} catch (error) { await shot('failure'); await writeFile(path.join(output, label + '-failure.json'), JSON.stringify({ passed: false, artifactSha256: sha(bytes), checks, errors, error: String(error), stack: error.stack }, null, 2)); throw error; }
finally { await browser.close(); }

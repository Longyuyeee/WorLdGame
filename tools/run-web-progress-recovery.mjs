import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_PROGRESS_OUTPUT_DIRECTORY ?? 'evidence/web-progress-recovery');
const baseline = process.argv.includes('--baseline'), engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.resolve(root, baseline ? 'evidence/web-reading-media-recovery/before-rain-stops.html' : process.env.STUDIO_PROGRESS_SOURCE_HTML ?? 'evidence/web-progress-recovery/before-rain-stops.html');
const bytes = await readFile(source), label = baseline ? `baseline-${engine}` : engine, checks = [], errors = [];
let heldPackingBytes;
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true, reducedMotion: 'reduce' });
page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, recovery: el.dataset.recoveryOperation, text: el.querySelector('.player-dialogue__text')?.textContent }));
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
async function stored(store = 'recovery-sessions') {
  return page.evaluate(store => new Promise((resolve, reject) => {
    const open = indexedDB.open('world-player-saves'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction(store, 'readonly'), get = tx.objectStore(store).getAll();
      get.onsuccess = () => resolve(get.result.map(value => { const v = value.metadata ?? value; return { hash: v.runtimeStateHash, slotId: v.slotId, kind: v.kind, sceneId: v.sceneId }; })); get.onerror = () => reject(get.error); tx.oncomplete = () => db.close(); };
  }), store);
}
async function waitStored(hash) { for (let i = 0; i < 100; i++) { if ((await stored()).some(row => row.hash === hash)) return; await page.waitForTimeout(100); } throw Error('Actual durable recovery did not reach the requested hash'); }
async function controlGeometry(control) { await control.scrollIntoViewIfNeeded(); return control.evaluate(el => { const r = el.getBoundingClientRect(); return { height: r.height, inViewport: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 }; }); }
try {
  // Delay one real session-packing digest before IndexedDB writes. No fabricated
  // transaction, serialized save, worker reply, narrative event or timer.
  await page.addInitScript(() => {
    window.holdNextPacking = false; window.packingHeld = false; window.releasePacking = null;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async function (algorithm, data) {
      const bytes = new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength);
      if (window.holdNextPacking && bytes.length >= 65536 && new TextDecoder().decode(bytes.subarray(0, 256)).includes('"format":"world.runtime-session-save"')) {
        window.holdNextPacking = false; window.packingHeld = true; window.heldPackingBytes = bytes.length;
        await new Promise(resolve => { window.releasePacking = () => { window.packingHeld = false; resolve(); }; });
      }
      return digest(algorithm, data);
    };
  });
  await page.goto(pathToFileURL(source).href); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check();
  await page.getByLabel('个人字号', { exact: true }).focus(); await page.getByLabel('个人字号', { exact: true }).press('End'); await button('返回故事').click(); await button('开始故事').click();
  await button('打开阅读菜单').click(); await button('本次先无声阅读').click();
  for (let i = 0; i < 160; i++) { await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); const s = await state(); if (Number(s.cursor) >= 32 && s.text?.length >= 80) break; await button('继续下一句').click(); }
  const protectedState = await state(); assert.ok(Number(protectedState.cursor) >= 32 && Number(protectedState.cursor) < 48); await waitStored(protectedState.hash); const durableBefore = await stored();
  await page.evaluate(() => { window.holdNextPacking = true; });
  for (let i = 0; i < 16 && !await page.evaluate(() => window.packingHeld); i++) { await button('继续下一句').click(); await page.waitForTimeout(100); }
  await page.waitForFunction(() => window.packingHeld); const held = await state(); heldPackingBytes = await page.evaluate(() => window.heldPackingBytes);
  await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'error', null, { timeout: 15000 });
  assert.deepEqual(await stored(), durableBefore); await page.setViewportSize({ width: 568, height: 320 }); const before = await state();
  if (baseline) {
    const overlap = await page.evaluate(() => { const a = document.querySelector('.player-stage > .player-recovery').getBoundingClientRect(), b = document.querySelector('.player-dialogue').getBoundingClientRect(); return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); }); assert.ok(overlap > 0);
    let blocked = false; try { await button('继续下一句').tap({ timeout: 1200 }); } catch (error) { if (error.name !== 'TimeoutError') throw error; blocked = true; }
    assert.ok(blocked); assert.equal((await state()).hash, before.hash); checks.push({ name: 'real-time-packing-delay-reproduces-timeout-overlay-blocking-native-reading', protectedState, held, before, overlap, blocked, durableBefore }); await shot('blocked-reading');
  } else {
    assert.equal(await page.locator('.player-stage > .player-recovery,.player-stage > .player-background-save-notice').count(), 0);
    const layouts = [];
    for (const viewport of [{ width: 568, height: 320 }, { width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport); const entrance = await controlGeometry(button('查看保存问题')); assert.ok(entrance.inViewport && entrance.height >= 44); await button('查看保存问题').click();
      const notice = page.getByRole('alert', { name: '恢复保护提醒', exact: true }); await notice.waitFor(); assert.ok((await notice.innerText()).includes('存储操作仍未结束'));
      assert.equal(await notice.getByRole('button', { name: '重试恢复保护', exact: true }).isDisabled(), true);
      const manual = await controlGeometry(notice.getByRole('button', { name: '保存当前进度', exact: true })); assert.ok(manual.inViewport && manual.height >= 44); await shot(`menu-${viewport.width}`);
      await page.keyboard.press('Escape'); assert.equal((await state()).hash, before.hash); assert.equal(await button('查看保存问题').evaluate(el => el === document.activeElement), true); layouts.push({ viewport, entrance, manual });
    }
    checks.push({ name: 'pending-recovery-is-discoverable-without-covering-reading', before, durableBefore, layouts });
    await page.setViewportSize({ width: 320, height: 740 }); await button('恢复当前声音').click();
    await page.locator('audio[data-audio-bus="bgm"]').evaluate(el => { el.src = 'data:audio/wav;base64,AA=='; el.load(); });
    await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="bgm"]')?.dataset.playerPlayback === 'error');
    assert.equal(await button('查看媒体问题').count(), 0); await button('查看保存问题').click(); await page.locator('.player-media-error').waitFor();
    assert.equal(await page.getByRole('alert', { name: '恢复保护提醒' }).count(), 1); await button('本次先无声阅读').click(); await button('查看保存问题').waitFor(); assert.equal((await state()).hash, before.hash);
    checks.push({ name: 'one-prioritized-save-entrance-retains-real-media-failure-and-explicit-silence-does-not-clear-recovery', state: await state() });
    await page.setViewportSize({ width: 568, height: 320 }); const paragraph = button('继续下一句'), top = await paragraph.evaluate(el => el.scrollTop);
    await paragraph.tap(); const afterTap = await state(); const pagedTop = await paragraph.evaluate(el => el.scrollTop); assert.ok(pagedTop > top && afterTap.hash === before.hash);
    await button('查看保存问题').click(); await button('返回故事').click(); assert.equal(await paragraph.evaluate(el => el.scrollTop), pagedTop);
    for (let i = 0; i < 12 && (await state()).hash === before.hash; i++) await paragraph.tap(); const latest = await state(); assert.notEqual(latest.hash, before.hash); assert.deepEqual(await stored(), durableBefore);
    checks.push({ name: 'native-tap-pages-then-advances-during-pending-recovery-without-mutating-the-old-record', top, pagedTop, latest });
    await button('查看保存问题').click(); await button('保存当前进度').click(); const saves = page.getByRole('dialog', { name: '存读档槽位', exact: true });
    assert.equal(await saves.getByRole('button', { name: '保存进度', exact: true }).getAttribute('aria-pressed'), 'true'); await saves.getByRole('button', { name: '保存', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); const manual = (await stored('save-slots')).find(row => row.slotId === 'manual-1'); assert.equal(manual.hash, latest.hash); assert.deepEqual(await stored(), durableBefore);
    await button('关闭存读档').click(); await button('查看保存问题').click(); assert.equal(await button('重试恢复保护').isDisabled(), true);
    checks.push({ name: 'independent-manual-save-protects-the-current-paragraph-without-pretending-recovery-has-finished', manual, recoveryBefore: durableBefore });
    await page.evaluate(() => window.releasePacking()); await page.getByRole('alert', { name: '恢复保护提醒' }).filter({ hasText: '不一定包含最新进度' }).waitFor();
    assert.equal((await state()).recovery, 'error'); assert.equal(await button('重试恢复保护').isDisabled(), false); const late = await stored(); assert.notEqual(late[0].hash, latest.hash);
    await button('重试恢复保护').click(); await waitStored(latest.hash); await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'ready');
    await button('返回故事').click(); await button('查看保存问题').waitFor({ state: 'hidden' }); assert.equal((await state()).hash, latest.hash); await shot('protected-current-reading');
    await page.reload(); await button('恢复上次进度').click(); await page.locator('.player-dialogue').waitFor(); assert.equal((await state()).hash, latest.hash); assert.equal(await page.locator('main').getAttribute('data-auto-playback'), 'off'); assert.equal((await stored('save-slots')).find(row => row.slotId === 'manual-1').hash, manual.hash);
    checks.push({ name: 'late-success-remains-truthful-and-explicit-retry-plus-reload-restores-the-latest-actual-record', late, latest, restored: await state() }); await shot('explicit-recovery-restored');
  }
  assert.deepEqual(errors, []); await writeFile(path.join(output, label + '.json'), JSON.stringify({ passed: true, engine, browser: browser.version(), artifactSha256: sha(bytes), realTime: true, heldPackingBytes, checks, errors, scope: 'Actual 1.11 game and real timers; one native session-packing digest delayed before real IndexedDB IO, old records and real manual save checked read-only, native taps/keys/menu/retry/reload. No fabricated narrative/save/worker/transaction or geometry. Not a cure for Firefox controlled-clock compression timing, physical phone/Safari, natural listening/timing, permissions or HTTPS.' }, null, 2)); console.log(`PASS ${label} progress recovery`);
} catch (error) { await shot('failure'); await writeFile(path.join(output, label + '-failure.json'), JSON.stringify({ passed: false, artifactSha256: sha(bytes), checks, errors, error: String(error), stack: error.stack, state: await state().catch(() => null) }, null, 2)); throw error; }
finally { await browser.close(); }

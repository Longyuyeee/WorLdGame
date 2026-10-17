import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_CHOICE_KEYBOARD_OUTPUT_DIRECTORY ?? 'evidence/web-choice-keyboard');
const baseline = process.argv.includes('--baseline'), engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
let source = path.resolve(root, process.env.STUDIO_CHOICE_KEYBOARD_SOURCE_HTML ?? path.join(output, 'before-rain-stops.html'));
if (baseline) source = path.resolve(root, 'evidence/web-reading-press/before-rain-stops.html');
else { try { await access(source); } catch (error) { if (error.code !== 'ENOENT' || process.env.STUDIO_CHOICE_KEYBOARD_SOURCE_HTML) throw error; source = path.join(output, 'final-work/before-rain-stops.html'); } }
const bytes = await readFile(source);
const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
await mkdir(output, { recursive: true }); const label = baseline ? `baseline-${engine}` : engine, checks = [], errors = [];
const browser = await engines[engine].launch({ headless: true }), contexts = []; let current;
const button = (page, name) => page.getByRole('button', { name, exact: true });
const state = page => page.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, status: el.dataset.playerStatus, choices: [...el.querySelectorAll('.player-choice button')].map(button => ({ text: button.textContent, selected: button.dataset.playerSelected, focused: button === document.activeElement })), text: el.querySelector('.player-dialogue__text')?.textContent }));
async function page(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' }); contexts.push(ctx); const p = await ctx.newPage(); current = p; p.setDefaultTimeout(30000); p.on('pageerror', error => errors.push(String(error))); await p.goto(pathToFileURL(source).href); return p;
}
async function beforeChoice(p) {
  await button(p, '打开玩家设置').click(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await p.getByLabel('静音全部声音', { exact: true }).check(); await button(p, '返回故事').click(); await button(p, '开始故事').click();
  await button(p, '打开阅读菜单').click(); await button(p, '本次先无声阅读').click();
  for (let i = 0; i < 160; i++) {
    await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    if ((await p.locator('.player-dialogue__text').innerText()).trim() === '这次我不会只回答一句以后。') return;
    await button(p, '继续下一句').click();
  }
  throw Error('Did not reach the real final pre-choice paragraph');
}
async function importChoiceBackup(p) {
  await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '备份', exact: true }).click();
  await slots.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(path.resolve(root, process.env.STUDIO_CHOICE_KEYBOARD_BACKUP ?? 'evidence/web-choice-keyboard/original-choice-1.11.0.worldsave')); await slots.getByRole('button', { name: '导入到所选槽位', exact: true }).click(); await slots.getByRole('button', { name: '读取导入的存档', exact: true }).click();
  if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.locator('.player-choice').waitFor();
}
const paint = p => p.locator('#player-choice-prompt').evaluate(el => {
  const style = getComputedStyle(el), values = color => color.match(/[\d.]+/gu).map(Number);
  const fg = values(style.color), bg = values(style.backgroundColor), fallback = values(getComputedStyle(el.closest('.player-stage')).backgroundColor), alpha = bg[3] ?? 1;
  const backdrop = bg.slice(0, 3).map((v, i) => v * alpha + fallback[i] * (1 - alpha));
  const luminance = rgb => rgb.map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  const a = luminance(fg.slice(0, 3)), b = luminance(backdrop); return { foreground: style.color, background: style.backgroundColor, backgroundAlpha: alpha, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
});
try {
  for (const key of ['Enter', 'Space']) {
    const held = await page(); await beforeChoice(held); await button(held, '继续下一句').focus(); await held.keyboard.down(key); await held.locator('.player-choice').waitFor(); const atChoice = await state(held);
    await held.keyboard.down(key); const repeated = await state(held); await held.keyboard.up(key); const released = await state(held);
    if (baseline) { assert.equal(released.choices.length, 0); assert.notEqual(released.hash, atChoice.hash); }
    else { assert.equal(repeated.hash, atChoice.hash); assert.equal(released.hash, atChoice.hash); await held.keyboard.press(key); await held.waitForFunction(() => !document.querySelector('.player-choice')); assert.ok((await state(held)).text.startsWith('林远没有走向检票口')); }
    checks.push({ name: baseline ? 'reproduced-held-confirmation-selects-first-branch' : 'held-confirmation-stops-at-choice-until-a-fresh-confirmation', key, atChoice, repeated, released, afterFreshConfirmation: baseline ? null : await state(held) }); await held.screenshot({ path: path.join(output, `${label}-held-${key.toLowerCase()}.png`), animations: 'disabled' }); await held.close();
  }
  const navigation = await page(); await beforeChoice(navigation); await button(navigation, '继续下一句').click(); await navigation.locator('.player-choice').waitFor(); const before = await state(navigation);
  await navigation.keyboard.press('ArrowDown'); const down = await state(navigation);
  if (baseline) {
    assert.equal(down.choices[0].focused, true); await navigation.keyboard.press('2'); const number = await state(navigation); assert.equal(number.hash, before.hash);
    checks.push({ name: 'reproduced-focused-choice-ignores-arrow-and-number-keys', before, down, number });
    await navigation.setViewportSize({ width: 320, height: 740 }); const originalPaint = await paint(navigation); assert.ok(originalPaint.contrast < 2); await navigation.screenshot({ path: path.join(output, 'baseline-choice-prompt-320.png'), animations: 'disabled' }); checks.push({ name: 'reproduced-white-prompt-on-paper', paint: originalPaint });
    await button(navigation, '打开阅读菜单').click(); await button(navigation, '存读档').click(); const panel = navigation.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '备份', exact: true }).click(); await panel.getByLabel('备份进度', { exact: true }).selectOption('current'); const pending = navigation.waitForEvent('download'); await panel.getByRole('button', { name: '导出备份文件', exact: true }).click(); const backup = await readFile(await (await pending).path()); await writeFile(path.join(output, 'original-choice-1.11.0.worldsave'), backup); checks.push({ name: 'actual-original-choice-backup', sha256: sha(backup), choiceHash: before.hash });
  } else {
    assert.equal(down.choices[1].focused, true); assert.equal(down.hash, before.hash); await navigation.keyboard.press('ArrowDown'); assert.equal((await state(navigation)).choices[0].focused, true); await navigation.keyboard.press('ArrowUp'); assert.equal((await state(navigation)).choices[1].focused, true);
    await navigation.keyboard.press('2'); await navigation.waitForFunction(() => !document.querySelector('.player-choice')); assert.ok((await state(navigation)).text.includes('拉起行李箱'));
    checks.push({ name: 'focused-arrows-wrap-and-number-two-selects-the-right-branch', before, down, selected: await state(navigation) });
    const restored = await page({ width: 390, height: 844 }); await importChoiceBackup(restored); const loaded = await state(restored); assert.equal(loaded.cursor, before.cursor); assert.equal(loaded.choices.length, 2);
    await restored.locator('audio[data-audio-bus="bgm"]').evaluate(el => { el.src = 'data:audio/wav;base64,AA=='; el.load(); }); await restored.locator('.player-media-error').waitFor();
    const layouts = [];
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await restored.setViewportSize(viewport); const prompt = restored.locator('#player-choice-prompt'); await prompt.scrollIntoViewIfNeeded(); const promptPaint = await paint(restored); assert.ok(promptPaint.backgroundAlpha === 1 && promptPaint.contrast >= 4.5); await restored.screenshot({ path: path.join(output, `${engine}-prompt-${viewport.width}.png`), animations: 'disabled' });
      await restored.locator('.player-choice button').first().focus(); await restored.keyboard.press('ArrowDown'); const option = restored.locator('.player-choice button').nth(1); await option.scrollIntoViewIfNeeded(); const geometry = await option.evaluate(el => { const r = el.getBoundingClientRect(), surface = el.closest('.player-choice-surface').getBoundingClientRect(), alert = el.closest('.player-choice-surface').querySelector('.player-media-error').getBoundingClientRect(); return { visible: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= surface.top && r.bottom <= surface.bottom + 1, height: r.height, focused: document.activeElement === el, errorDoesNotOverlapChoices: alert.top >= r.bottom - 1 }; }); assert.ok(geometry.visible && geometry.focused && geometry.height >= 44 && geometry.errorDoesNotOverlapChoices); layouts.push({ viewport, geometry, promptPaint }); await restored.screenshot({ path: path.join(output, `${engine}-choice-${viewport.width}.png`), animations: 'disabled' });
    }
    const recover = button(restored, '本次先无声阅读'); await recover.scrollIntoViewIfNeeded(); const recoveryGeometry = await recover.evaluate(el => { const r = el.getBoundingClientRect(), body = el.closest('.player-choice-surface').getBoundingClientRect(); return { visible: r.top >= body.top && r.bottom <= body.bottom + 1 && r.left >= 0 && r.right <= innerWidth + 1, height: r.height }; }); assert.ok(recoveryGeometry.visible && recoveryGeometry.height >= 44); await restored.screenshot({ path: path.join(output, `${engine}-choice-recovery.png`), animations: 'disabled' });
    await recover.click(); assert.equal((await state(restored)).hash, loaded.hash); assert.equal(await restored.locator('.player-media-error').count(), 0);
    await button(restored, '打开阅读菜单').click(); await button(restored, '打开玩家设置').click(); await restored.getByLabel('高对比阅读', { exact: true }).check(); await button(restored, '返回故事').click(); const highContrast = await paint(restored); assert.ok(highContrast.backgroundAlpha === 1 && highContrast.contrast >= 4.5); await restored.locator('.player-choice button').nth(1).focus();
    await restored.keyboard.press('Enter'); await restored.waitForFunction(() => !document.querySelector('.player-choice')); assert.ok((await state(restored)).text.includes('拉起行李箱')); checks.push({ name: 'old-current-candidate-choice-backup-load-navigation-and-explicit-confirmation', loaded, selected: await state(restored), layouts, highContrast, recoveryGeometry, fault: 'invalid native BGM source, no fabricated error or narrative events', silentReadingRetainedChoice: true });
  }
  assert.deepEqual(errors, []); await writeFile(path.join(output, label + '.json'), JSON.stringify({ passed: true, engine, browser: browser.version(), baseline, artifactSha256: sha(bytes), checks, errors, scope: 'Actual complete work and native keyboard down/repeat/up, arrows, numbers and explicit original backup import. Silent reading; phone-sized desktop engines, not physical phone, natural timing/listening, rights or public deployment.' }, null, 2)); console.log(`PASS ${label} choice keyboard`);
} catch (error) { if (current && !current.isClosed()) await current.screenshot({ path: path.join(output, label + '-failure.png'), animations: 'disabled' }); await writeFile(path.join(output, label + '-failure.json'), JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); throw error; }
finally { await browser.close(); }

import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-history-reading');
const baseline = process.argv.includes('--baseline'), engine = process.argv.find(arg => arg.startsWith('--engine='))?.split('=')[1] ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const label = baseline ? 'baseline' : engine, source = path.join(root, baseline ? 'evidence/web-voice-reading-continuity/before-rain-stops.html' : 'evidence/web-history-reading/work/before-rain-stops.html');
const html = await readFile(source), project = readGamePayload(html.toString()).project;
const text = id => Object.values(project.scripts).flatMap(script => script.statements).find(item => item.id === id)?.text;
await mkdir(output, { recursive: true }); const reportPath = path.join(output, label + '.json');
await writeFile(reportPath, JSON.stringify({ passed: false, status: 'running' }));
const server = createServer((req, res) => res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html)); await listenBrowserLoopback(server);
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), checks = [], errors = [];
page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(30000);
const button = name => page.getByRole('button', { name, exact: true }), main = page.locator('main.player-shell');
const hash = () => main.getAttribute('data-runtime-state-hash'), cursor = () => main.getAttribute('data-history-cursor');
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${label} ${name}`); };
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
const search = value => page.getByRole('searchbox', { name: '查找已记录的剧情', exact: true }).fill(value);
async function walk(id, branch = 0) {
  for (let step = 0; step < 180; step++) {
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    if (await page.locator('.player-dialogue__text').textContent().catch(() => '') === text(id)) return;
    if (await main.getAttribute('data-player-status') === 'waiting-choice') await page.locator('.player-choice button').nth(branch).click();
    else { await button('继续下一句').click(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  }
  throw Error(`Could not reach actual story ${id}`);
}
async function openHistory() { await button('打开阅读菜单').click(); await button('打开剧情历史').click(); }
async function save() { await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('返回故事').click(); }
async function load() { await button('打开阅读菜单').click(); await button('快速读取').click(); await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); }
async function slot() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { const rows = await new Promise((resolve, reject) => { const r = db.transaction('save-slots').objectStore('save-slots').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); const row = rows.find(row => (row.metadata ?? row).slotId === 'quick-1'), metadata = row.metadata ?? row; return { bytes: row.byteLength ?? new TextEncoder().encode(row.serializedSessionSave).length, digest: row.sha256 ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.serializedSessionSave))), b => b.toString(16).padStart(2, '0')).join(''), artifact: metadata.sessionArtifactHash, runtime: metadata.runtimeStateHash }; } finally { db.close(); }
  });
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click(); await button('开始故事').click();
  await button('打开阅读菜单').click(); await button('本次先无声阅读').click();
  await walk('stmt_ui_101'); await save(); const saved = await slot(), before = await hash(), beforeCursor = await cursor();
  await openHistory(); await search(text('stmt_ui_25'));
  const row = page.locator('.player-history-list > li').filter({ hasText: text('stmt_ui_25') });
  const rowText = await row.innerText(); await shot('speaker-and-reading');
  if (baseline) {
    assert.equal(rowText.includes('林远'), false); await row.locator('strong').click(); assert.notEqual(await hash(), before);
    check('reproduced-dialogue-without-speaker-and-reading-text-immediately-rolls-story-back', { rowText, before, after: await hash(), beforeCursor, afterCursor: await cursor() });
    await load(); await openHistory(); await search('今晚留下，把回信写完'); assert.equal(await page.locator('.player-history-list > li').count(), 0);
    check('reproduced-selected-choice-label-not-searchable');
  } else {
    assert.ok(rowText.includes('林远')); await row.locator('strong').click(); assert.equal(await hash(), before); assert.equal(await cursor(), beforeCursor);
    check('history-reading-text-does-not-navigate-and-dialogue-has-actual-speaker', { rowText, saved });
    await search('小夏'); assert.equal(await page.locator('.player-history-list > li').filter({ hasText: text('stmt_ui_51') }).count(), 1);
    await search('今晚留下，把回信写完'); const choice = page.locator('.player-history-list > li').filter({ hasText: '已选择' }); assert.equal(await choice.count(), 1); assert.ok((await choice.innerText()).includes('今晚留下，把回信写完'));
    check('actual-speaker-and-committed-choice-label-are-searchable');
    const layouts = [];
    for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); const action = choice.getByRole('button', { name: /^回退到：/ }); await action.scrollIntoViewIfNeeded(); const bounds = await action.boundingBox(); assert.ok(bounds && bounds.height >= 44 && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
      const body = await page.locator('.player-history-panel-body').boundingBox(), prompt = await choice.locator('strong').boundingBox(), selected = await choice.locator('.player-history-choice').boundingBox();
      for (const textBox of [prompt, selected]) assert.ok(textBox && body && textBox.y >= body.y - 1 && textBox.y + textBox.height <= body.y + body.height + 1, 'The exact rollback target and selected answer must be visible together with the action');
      const colors = await choice.evaluate(row => ({ text: getComputedStyle(row.querySelector('strong')).color, inherited: getComputedStyle(row).color }));
      assert.equal(colors.text, colors.inherited, 'The readonly text must retain the current history palette, not inherit the old dark-only card color');
      layouts.push({ viewport, action: bounds, body, prompt, selected, colors }); await shot(`choice-${viewport.width}`);
    }
    assert.equal(await hash(), before); assert.deepEqual(await slot(), saved); check('four-mobile-viewports-target-answer-and-44px-action-visible-together', { layouts });
    await button('关闭剧情历史').click(); await button('打开阅读菜单').click(); await button('打开玩家设置').click(); await page.getByLabel('高对比阅读', { exact: true }).check(); await button('返回故事').click();
    await openHistory(); await search('今晚留下，把回信写完');
    const contrast = await choice.evaluate(row => ({ expected: getComputedStyle(row).color, colors: [...row.querySelectorAll('.player-history-record > strong,.player-history-record > p,.player-history-record > span,.player-history-record > button')].map(element => getComputedStyle(element).color) }));
    assert.equal(contrast.expected, 'rgb(255, 255, 255)'); assert.ok(contrast.colors.length >= 4 && contrast.colors.every(color => color === contrast.expected));
    assert.equal(await hash(), before); await shot('high-contrast'); check('public-high-contrast-setting-keeps-text-answer-speaker-and-action-readable', contrast);
    await choice.getByRole('button', { name: /^回退到：/ }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.playerStatus === 'waiting-choice');
    await openHistory(); await search('今晚留下，把回信写完'); assert.equal(await page.locator('.player-history-choice').count(), 0); await search('');
    assert.ok((await page.locator('[data-history-position="current"]').innerText()).includes('等待选择')); assert.equal(await page.locator('[data-history-position="current"] button').count(), 0); await button('关闭剧情历史').click();
    await page.locator('.player-choice button').nth(1).click(); await walk('stmt_ui_182', 1); await openHistory(); await search('今晚出发，在路上继续'); assert.equal(await page.locator('.player-history-choice').count(), 1);
    await search(text('stmt_ui_101')); const archived = page.locator('.player-history-panel__archive .player-history-list > li').filter({ hasText: text('stmt_ui_101') }); assert.equal(await archived.count(), 1); assert.equal(await archived.getByRole('button').count(), 0); await archived.locator('strong').click();
    assert.equal(await page.locator('.player-history-list > li[data-history-position="current"]').count(), 0); await button('关闭剧情历史').click(); assert.equal(await page.locator('.player-dialogue__text').textContent(), text('stmt_ui_182')); assert.deepEqual(await slot(), saved);
    check('pending-choice-does-not-borrow-future-input-and-old-branch-remains-readonly');
    await page.reload(); await button('恢复上次进度').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.recoveryOperation === 'loaded'); await openHistory(); await search('今晚出发，在路上继续'); assert.equal(await page.locator('.player-history-choice').count(), 1); await button('关闭剧情历史').click();
    await load(); await openHistory(); await search('今晚留下，把回信写完'); assert.equal(await page.locator('.player-history-choice').count(), 1); assert.deepEqual(await slot(), saved); check('cold-recovery-and-explicit-load-derive-their-own-recorded-choice');
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('searchbox').inputValue(), ''); await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog', { name: '剧情历史' }).count(), 0); check('escape-clears-query-before-closing-without-extra-navigation');
  }
  assert.deepEqual(errors, []); await writeFile(reportPath, JSON.stringify({ passed: true, baseline, browser: browser.version(), artifactSha256: sha(html), checks, errors, scope: 'Actual unchanged complete story, HTTP single-file HTML, public UI and native IndexedDB. Instant text and mute for a history task, not natural listening or timing. No injected history, fake geometry, physical phone/Safari or public deployment acceptance.' }, null, 2));
} catch (error) { await shot('failure'); await writeFile(reportPath, JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

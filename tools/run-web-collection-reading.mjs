import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const fileMode = process.argv.includes('--file');
const source = path.resolve(root, baseline ? 'evidence/web-replay-recovery' : process.env.STUDIO_COLLECTION_READING_SOURCE_DIRECTORY ?? 'evidence/web-collection-reading');
const output = path.resolve(root, process.env.STUDIO_COLLECTION_READING_OUTPUT_DIRECTORY ?? `evidence/web-collection-reading/${baseline ? 'baseline' : 'browser'}`);
await mkdir(output, { recursive: true });
const reportPath = path.join(output, `${baseline ? 'baseline-' : ''}${engine}${fileMode ? '-file' : ''}.json`);
try { await access(reportPath); throw Error('Refusing to overwrite a collection reading report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip);
const artifacts = { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } };
const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1) || 'index.html', bytes = files[name]; res.writeHead(bytes ? 200 : 404, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes ?? 'Missing'); });
let browser, page; const checks = [], errors = [];
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('main').evaluate(el => ({ hash: el.dataset.runtimeStateHash, host: el.dataset.runtimeHostSnapshotHash, cursor: el.dataset.historyCursor, status: el.dataset.playerStatus, replay: el.dataset.sceneReplay, text: el.querySelector('.player-dialogue__text')?.textContent }));
async function manualSlots() {
  return page.evaluate(() => new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { const rows = get.result.filter(row => (row.metadata ?? row).slotId.startsWith('manual-')); resolve(await Promise.all(rows.map(async row => { const meta = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slot: meta.slotId, hash: meta.runtimeStateHash, digest: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (error) { reject(error); } }; }; }));
}
async function archives() { return page.evaluate(async () => Object.fromEntries(await Promise.all(Object.keys(localStorage).sort().filter(key => /^world-player\.(collection|replay)\.v1:/u.test(key)).map(async key => [key, Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(localStorage.getItem(key)))), b => b.toString(16).padStart(2, '0')).join('')])))); }
async function settle() { await page.evaluate(() => document.fonts.ready); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function shot(name) { await page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled' }); }
async function skip() { await button('打开阅读菜单').click(); await button('快进全部').click(); }
async function layout(selector) {
  return page.locator(selector).evaluate(list => {
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { scrollWidth: list.scrollWidth, clientWidth: list.clientWidth, rows: [...list.children].map(row => ({ title: row.querySelector('strong')?.textContent, titleBox: box(row.querySelector('strong')), bodyBox: box(row.querySelector('strong').parentElement), rowBox: box(row), coverBox: row.querySelector('.player-additional-content__catalog-cover') ? box(row.querySelector('.player-additional-content__catalog-cover')) : null, actionBox: row.querySelector('button') ? box(row.querySelector('button')) : null, unlocked: row.dataset.unlocked, text: row.textContent })) };
  });
}
function assertLayout(result, width) {
  assert.ok(result.scrollWidth <= result.clientWidth + 1, 'No horizontal list overflow');
  for (const row of result.rows) {
    assert.ok(row.titleBox.width >= 120, `${row.title}: readable title width, got ${row.titleBox.width}`);
    assert.ok(row.bodyBox.x >= row.rowBox.x && row.bodyBox.x + row.bodyBox.width <= row.rowBox.x + row.rowBox.width + 1);
    if (row.actionBox) assert.ok(row.actionBox.height >= 44 && row.actionBox.x + row.actionBox.width <= row.rowBox.x + row.rowBox.width + 1, 'Reachable 44px action');
  }
}
async function inspect(view, selector, name) {
  await button('返回附加内容总览').click(); await button(`查看 ${view}`).click(); await settle();
  const result = await layout(selector); if (!baseline) assertLayout(result, page.viewportSize().width);
  await shot(name); return result;
}
try {
  await listenBrowserLoopback(server); browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' }); page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
  await page.goto(fileMode ? pathToFileURL(path.join(source, 'before-rain-stops.html')).href : `http://127.0.0.1:${server.address().port}/`);
  const title = await state(); await button('打开附加内容').click(); const titleClose = page.locator('.player-additional-content > header button').first(), titleReturn = await titleClose.innerText(); if (!baseline) assert.equal(titleReturn, '返回标题'); await titleClose.click(); assert.deepEqual(await state(), title);
  checks.push({ name: 'title-collection-return-does-not-start-story', titleReturn, title });
  await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await button('返回故事').click(); await button('开始故事').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  const initial = await state(); await button('打开阅读菜单').click(); await button('存读档').click();
  await page.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('关闭存读档').click();
  const saved = await manualSlots(); assert.equal(saved.length, 1);
  await skip(); await page.locator('.player-choice button').first().waitFor(); await page.locator('.player-choice button').first().click(); await skip(); await page.waitForFunction(() => document.querySelector('main')?.dataset.playerStatus === 'ended');
  const ending = await state(), independent = await archives(); assert.equal(Object.keys(independent).length, 2); await button('查看收藏与结局').click();
  const samples = [];
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport); await settle();
    if (await button('返回附加内容总览').isVisible()) await button('返回附加内容总览').click();
    await button('查看 场景回想').click(); await settle();
    const replay = await layout('.player-additional-content__replay'); if (!baseline) assertLayout(replay, viewport.width); await shot(`replay-${viewport.width}`);
    const endings = await inspect('结局', '.player-additional-content__endings', `endings-${viewport.width}`);
    const music = await inspect('音乐室', '.player-additional-content__music', `music-${viewport.width}`);
    samples.push({ viewport, replay, endings, music });
  }
  checks.push({ name: 'actual-collection-lists-across-five-viewports', samples });
  const close = page.locator('.player-additional-content > header button').first();
  const returnLabel = await close.innerText(); if (!baseline) assert.equal(returnLabel, '返回结局'); await close.click(); assert.deepEqual(await state(), ending);
  checks.push({ name: 'collections-return-to-original-ending', returnLabel, ending });
  await button('读取存档探索其他路线').click(); await page.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '读取', exact: true }).click(); if (await page.locator('.player-load-confirm').isVisible()) await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
  const loaded = await state(); for (const key of ['cursor', 'status', 'text', 'replay']) assert.equal(loaded[key], initial[key], key); // Loading merges legitimate independently earned collection/read metadata.
  await button('打开阅读菜单').click(); await button('打开附加内容').click(); if (!baseline) assert.equal(await button('返回剧情').count(), 1); await button('查看 场景回想').click(); await button('开始回想 雨后的天明').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button('退出回想，返回原剧情').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay === 'inactive'); assert.deepEqual(await state(), loaded);
  checks.push({ name: 'real-saved-body-replay-and-original-body-return', initial, loaded, exactLoadedCheckpointRestored: true });
  assert.deepEqual(await manualSlots(), saved); assert.deepEqual(await archives(), independent);
  await page.reload(); await button('打开附加内容').click(); if (!baseline) await button('返回标题').waitFor(); await button('查看 场景回想').click(); assert.ok(await button('开始回想 雨后的天明').isEnabled()); assert.equal(await button('场景 1 尚未解锁').isDisabled(), true);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await button('读取存档').click(); await page.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '读取', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); const reopened = await state(); for (const key of ['cursor', 'status', 'text', 'replay']) assert.equal(reopened[key], loaded[key], key); assert.deepEqual(await manualSlots(), saved); assert.deepEqual(await archives(), independent);
  checks.push({ name: 'reopen-keeps-independent-unlocks-and-original-manual-save-for-explicit-continuation', reopened, manualSlotsPreserved: true, independentArchivesPreserved: true, saved, independent });
  assert.deepEqual(errors, []);
} catch (error) { errors.push(String(error?.stack ?? error)); if (page) await shot('failure').catch(() => {}); }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  await writeFile(reportPath, JSON.stringify({ source: path.relative(root, source), artifacts, engine, fileMode, baseline, checks, errors, scope: 'Actual UI save, skip-all stay ending, collection lists and return. Desktop viewport emulation, not full natural reading, voice or physical phone acceptance.' }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ report: path.relative(root, reportPath), checks: checks.length, errors }));
}
if (errors.length) process.exitCode = 1;

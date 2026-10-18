import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium'; assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const output = path.resolve(root, process.env.STUDIO_MANUAL_SAVE_OUTPUT_DIRECTORY ?? 'evidence/web-manual-save-safety');
const source = path.resolve(root, baseline ? 'evidence/web-save-list-recovery' : process.env.STUDIO_MANUAL_SAVE_SOURCE_DIRECTORY ?? 'evidence/web-manual-save-safety');
const label = `${baseline ? 'baseline-' : ''}${engine}`, reportPath = path.join(output, `${label}.json`); await mkdir(output, { recursive: true });
try { await access(reportPath); throw Error('Refusing to overwrite a manual-save safety report; use a new output directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip);
const backupFile = path.join(root, 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave'), backup = await readFile(backupFile), original = JSON.parse(backup);
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = files[name];
  const headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
});
let browser, current; const checks = [], errors = [];
const button = (p, name) => p.getByRole('button', { name, exact: true }), card = (p, id) => p.locator(`[data-save-slot="${id}"]`);
const state = p => p.locator('main.player-shell').evaluate(el => ({ hash: el.dataset.runtimeStateHash, save: el.dataset.saveOperation, list: el.dataset.saveList, auto: el.dataset.autoPlayback }));
const ready = p => p.waitForFunction(() => document.querySelector('main')?.dataset.saveList === 'ready');
const save = (p, id, confirm = false) => card(p, id).getByRole('button', { name: confirm ? '确认覆盖' : '保存', exact: true }).click();
const saved = p => p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved' && document.querySelector('main')?.dataset.saveList === 'ready');
const conflict = p => p.getByRole('alert').filter({ hasText: '本次未保存' }).waitFor();
const reading = p => p.locator('.player-dialogue__text').textContent();
const position = p => p.locator('main.player-shell').evaluate(el => ({ cursor: el.dataset.historyCursor, length: el.dataset.historyLength, archives: el.dataset.historyArchives, status: el.dataset.playerStatus }));
const shot = (p, name) => p.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
async function slots(p) { return p.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error);
  request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots', 'readonly'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error);
    get.onsuccess = async () => { try { resolve((await Promise.all(get.result.map(async row => { const m = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slotId: m.slotId, hash: m.runtimeStateHash, savedAt: m.savedAtEpochMilliseconds, storedSha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))).filter(row => row.slotId.startsWith('manual-')).sort((a, b) => a.slotId.localeCompare(b.slotId))); } catch (error) { reject(error); } };
  };
})); }
async function openSave(p) { await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button(p, '打开阅读菜单').click(); await button(p, '存读档').click(); await ready(p); await button(p, '保存进度').click(); }
async function readTitle(p, id) { await button(p, '读取存档').click(); await ready(p); await card(p, id).getByRole('button', { name: '读取', exact: true }).click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); }
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  context.on('page', p => p.on('pageerror', error => errors.push(String(error))));
  const a = await context.newPage(); current = a; a.setDefaultTimeout(30000); const url = `http://127.0.0.1:${server.address().port}/gal/`; await a.goto(url);
  await button(a, '打开玩家设置').click(); await a.getByLabel('静音全部声音', { exact: true }).check(); await a.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button(a, '返回故事').click();
  await button(a, '读取存档').click(); await button(a, '备份').click(); await a.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(backupFile); await button(a, '导入到所选槽位').click(); await button(a, '读取导入的存档').click();
  await a.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); let aHash = (await state(a)).hash; assert.equal(aHash, original.payload.slot.runtimeStateHash);
  await openSave(a); await save(a, 'manual-1'); assert.equal(await card(a, 'manual-1').getByRole('button', { name: '确认覆盖', exact: true }).count(), 1);
  const b = await context.newPage(); current = b; b.setDefaultTimeout(30000); await b.goto(url); await readTitle(b, 'manual-1'); await b.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false' && document.querySelector('[data-text-ready]')?.dataset.textReady === 'true');
  await b.waitForFunction(() => { const voice = document.querySelector('audio[data-audio-bus="voice"]'); return !voice || voice.ended; });
  await button(b, '继续下一句').click(); await b.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash !== hash, aHash);
  const bHash = (await state(b)).hash; assert.notEqual(bHash, aHash); await openSave(b); await save(b, 'manual-1'); await save(b, 'manual-1', true); await saved(b); const external = (await slots(b)).find(row => row.slotId === 'manual-1'); assert.equal(external.hash, bHash);
  current = a; aHash = (await state(a)).hash; const beforeText = await reading(a), beforePosition = await position(a); await save(a, 'manual-1', true);
  if (baseline) { await saved(a); assert.equal((await slots(a)).find(row => row.slotId === 'manual-1').hash, aHash); checks.push({ name: 'frozen-game-overwrites-another-window-after-stale-confirmation', external, beforeHash: aHash, beforeText, beforePosition, afterPosition: await position(a), state: await state(a), overwritten: await slots(a) }); }
  else { await conflict(a); assert.deepEqual((await slots(a)).find(row => row.slotId === 'manual-1'), external); assert.equal(await reading(a), beforeText); assert.deepEqual(await position(a), beforePosition); assert.equal(await card(a, 'manual-1').getByRole('button', { name: '保存', exact: true }).isEnabled(), true); checks.push({ name: 'stale-confirmation-refuses-write-and-keeps-external-payload-and-current-line', external, beforeHash: aHash, beforeText, afterText: await reading(a), beforePosition, afterPosition: await position(a), state: await state(a) }); }
  await shot(a, 'occupied-conflict');
  current = b; await save(b, 'manual-2'); await saved(b); const filled = (await slots(b)).find(row => row.slotId === 'manual-2'); assert.equal(filled.hash, bHash);
  current = a; aHash = (await state(a)).hash; assert.equal(await card(a, 'manual-2').getByText('空槽位', { exact: true }).count(), 1); await save(a, 'manual-2');
  if (baseline) { await saved(a); assert.equal((await slots(a)).find(row => row.slotId === 'manual-2').hash, aHash); checks.push({ name: 'frozen-game-overwrites-a-slot-filled-after-the-list-was-read', external: filled, overwritten: await slots(a) }); }
  else {
    await conflict(a); assert.deepEqual((await slots(a)).find(row => row.slotId === 'manual-2'), filled); checks.push({ name: 'formerly-empty-slot-refuses-concurrent-fill-without-automatic-retry', filled, state: await state(a) });
    const layouts = [];
    for (const viewport of [{ width: 320, height: 740 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      await a.setViewportSize(viewport); const message = a.getByRole('alert').filter({ hasText: '本次未保存' }); assert.equal(await message.isVisible(), true); await message.scrollIntoViewIfNeeded(); const rect = await message.boundingBox(); assert.ok(rect && rect.height > 0 && rect.y >= 0 && rect.y + rect.height <= viewport.height + 1);
      const back = button(a, '关闭存读档'); await back.scrollIntoViewIfNeeded(); const box = await back.boundingBox(); assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= viewport.height + 1); layouts.push({ viewport, message: rect, close: box }); await shot(a, `conflict-${viewport.width}`);
    }
    checks.push({ name: 'conflict-result-and-return-control-readable-at-four-window-sizes', layouts }); await a.setViewportSize({ width: 390, height: 844 });
    aHash = (await state(a)).hash; await save(a, 'manual-3'); await saved(a); assert.deepEqual((await slots(a)).find(row => row.slotId === 'manual-1'), external); assert.deepEqual((await slots(a)).find(row => row.slotId === 'manual-2'), filled); assert.equal((await slots(a)).find(row => row.slotId === 'manual-3').hash, aHash); checks.push({ name: 'save-to-another-empty-slot-preserves-both-conflicting-progress-records', slots: await slots(a) });
    await save(a, 'manual-2'); assert.deepEqual((await slots(a)).find(row => row.slotId === 'manual-2'), filled); await save(a, 'manual-2', true); await saved(a); assert.equal((await slots(a)).find(row => row.slotId === 'manual-2').hash, aHash); checks.push({ name: 'fresh-explicit-double-confirmation-can-replace-the-reviewed-new-slot', slots: await slots(a) });
    const raceHashes = [(await state(a)).hash, (await state(b)).hash]; await Promise.all([save(a, 'manual-4'), save(b, 'manual-4')]);
    await Promise.all([a.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('main')?.dataset.saveOperation)), b.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('main')?.dataset.saveOperation))]);
    const pair = [await state(a), await state(b)]; assert.deepEqual(pair.map(row => row.save).sort(), ['error', 'saved']); const winner = pair.findIndex(row => row.save === 'saved'), loser = winner === 0 ? b : a; await conflict(loser);
    assert.equal((await slots(a)).find(row => row.slotId === 'manual-4').hash, raceHashes[winner]); checks.push({ name: 'two-real-windows-racing-for-the-same-empty-slot-produce-one-winner-and-one-conflict', pair, raceHashes, slots: await slots(a) });
    const retained = await slots(a); await a.reload(); await readTitle(a, 'manual-1'); assert.equal((await state(a)).hash, bHash); assert.equal((await state(a)).auto, 'off'); assert.deepEqual(await slots(a), retained); await shot(a, 'reopened-continuation'); checks.push({ name: 'reopen-and-explicit-read-restore-the-external-story-with-all-four-slots-intact', slots: retained, state: await state(a) });
  }
  assert.deepEqual(errors, []); await writeFile(reportPath, JSON.stringify({ passed: true, engine, browser: browser.version(), artifacts: { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } }, sourceBackupSha256: sha(backup), checks, errors, scope: 'Actual exported website, two pages sharing real IndexedDB and UI-generated saves; no database writes or storage/playback event injection by the test. Desktop engines and phone-sized windows, not physical phones/Safari, natural listening, system interruption, rights or public deployment acceptance.' }, null, 2)); console.log(`PASS ${label} manual-save safety (${checks.length} checks)`);
} catch (error) { if (current && !current.isClosed()) await shot(current, 'failure').catch(() => {}); await writeFile(reportPath, JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors, state: current && !current.isClosed() ? await state(current).catch(() => null) : null }, null, 2)); throw error; }
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

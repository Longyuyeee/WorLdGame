import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
import { rainRouteContract } from './web-work-continuity-contract.mjs';

const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const fileMode = process.argv.includes('--file');
const source = path.resolve(root, baseline ? 'evidence/web-backup-inspection' : process.env.STUDIO_ROUTE_REPLAY_SOURCE_DIRECTORY ?? 'evidence/web-route-replay-continuity');
const output = path.resolve(root, process.env.STUDIO_ROUTE_REPLAY_OUTPUT_DIRECTORY ?? `evidence/web-route-replay-continuity/${baseline ? 'baseline' : 'current-browser'}`);
await mkdir(output, { recursive: true });
const reportPath = path.join(output, `${baseline ? 'baseline-' : ''}${engine}${fileMode ? '-file' : ''}.json`);
try { await access(reportPath); throw Error('Refusing to overwrite a route replay report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip);
const artifacts = { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } };
const project = readGamePayload(html.toString()).project, contracts = [rainRouteContract(project, 0), rainRouteContract(project, 1)];
const byText = new Map(Object.values(project.scripts).flatMap(script => script.statements).filter(row => ['narration', 'dialogue'].includes(row.kind)).map(row => [row.text, row.id]));
const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1) || 'index.html', bytes = files[name]; res.writeHead(bytes ? 200 : 404, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes ?? 'Missing'); });
let browser, page; const checks = [], errors = [];
const button = name => page.getByRole('button', { name, exact: true });
const shot = name => page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled' });
const state = () => page.locator('main').evaluate(el => ({ hash: el.dataset.runtimeStateHash, host: el.dataset.runtimeHostSnapshotHash, cursor: el.dataset.historyCursor, status: el.dataset.playerStatus, replay: el.dataset.sceneReplay, autoEnabled: el.querySelector('[aria-label="自动播放"]')?.getAttribute('aria-pressed'), autoPlayback: el.dataset.autoPlayback, text: el.querySelector('.player-dialogue__text')?.textContent }));
async function settle() { await page.evaluate(() => document.fonts.ready); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function position() {
  return page.locator('.player-dialogue').evaluate(el => {
    const r = el.getBoundingClientRect(), scale = r.height / el.offsetHeight, top = r.top + el.clientTop * scale, bottom = top + el.clientHeight * scale;
    const walker = document.createTreeWalker(el.querySelector('.player-dialogue__text'), 4), lines = []; let node, offset = 0;
    while ((node = walker.nextNode())) { if (node.parentElement.closest('rt,rp')) continue; for (let i = 0; i < node.length; i++, offset++) { const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1); const rect = range.getBoundingClientRect(); if (rect.height && (!lines.length || Math.abs(lines.at(-1).top - rect.top) > 2)) lines.push({ offset, top: rect.top, bottom: rect.bottom }); } }
    return { top, bottom, scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight, first: lines.find(row => row.top >= top - 1)?.offset ?? 0, lines };
  });
}
function visible(pos, offset) { const row = pos.lines.find((row, i) => row.offset <= offset && (pos.lines[i + 1]?.offset ?? Infinity) > offset); return !!row && row.top >= pos.top - 1 && row.bottom <= pos.bottom + 1; }
async function stored() {
  return page.evaluate(() => new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => { const meta = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slot: meta.slotId, hash: meta.runtimeStateHash, digest: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (e) { reject(e); } }; }; }));
}
async function archives() { return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().filter(key => /^world-player\.(collection|replay)\.v1:/u.test(key)).map(key => [key, localStorage.getItem(key)]))); }
async function openSave(intent, ending = false) {
  if (ending) await button('读取存档探索其他路线').click();
  else if (await button('读取存档').isVisible()) await button('读取存档').click();
  else { await button('打开阅读菜单').click(); await button('存读档').click(); }
  await page.getByRole('dialog', { name: '存读档槽位', exact: true }).getByRole('button', { name: intent === 'save' ? '保存进度' : '读取进度', exact: true }).click();
}
async function save(id) { await openSave('save'); await page.locator(`[data-save-slot="${id}"]`).getByRole('button', { name: '保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('关闭存读档').click(); }
async function load(id, ending = false) { await openSave('load', ending); await page.locator(`[data-save-slot="${id}"]`).getByRole('button', { name: '读取', exact: true }).click(); if (await page.locator('.player-load-confirm').isVisible()) await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); await settle(); }
async function extras(ending = false) {
  if (ending) { await button('查看收藏与结局').click(); await button('返回附加内容总览').click(); }
  else if (await button('打开附加内容').isVisible()) await button('打开附加内容').click();
  else { await button('打开阅读菜单').click(); await button('打开附加内容').click(); }
  if (await button('返回附加内容总览').isVisible()) await button('返回附加内容总览').click();
  await button('查看 场景回想').click();
}
async function enter(title) {
  await button(`开始回想 ${title}`).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay !== 'inactive');
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await settle();
}
async function advance() {
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  await page.waitForFunction(() => { const voice = document.querySelector('audio[data-audio-bus="voice"]'); return !voice || voice.ended || voice.error || voice.dataset.voiceFailed === 'true' || voice.dataset.shouldPlay !== 'true'; });
  const before = await state();
  for (let i = 0; i < 30; i++) { await button('继续下一句').click(); if ((await state()).hash !== before.hash) return; }
  throw Error('Current paragraph did not advance');
}
async function finish(branch, prefix = [], stopAtChoice = false) {
  const texts = [...prefix];
  for (let i = 0; i < 260 && (await state()).status !== 'ended'; i++) {
    if (await page.locator('.player-choice button').count()) { if (stopAtChoice) return texts; await page.locator('.player-choice button').nth(branch).click(); continue; }
    const text = (await page.locator('.player-dialogue__text').innerText()).trim(), id = byText.get(text); assert.ok(id, 'Unknown actual story text'); if (texts.at(-1) !== id) texts.push(id); await advance();
  }
  assert.equal((await state()).status, 'ended'); await settle(); return texts;
}
async function returned(before) {
  await page.waitForFunction(() => document.querySelector('main')?.dataset.sceneReplay === 'inactive'); await settle();
  if (before.status === 'presenting') await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  if (before.autoEnabled === 'true') await page.waitForFunction(value => document.querySelector('main')?.dataset.autoPlayback === value, before.autoPlayback);
  const { autoPlayback: priorTransport, ...expected } = before, { autoPlayback: transport, ...actual } = await state();
  assert.deepEqual(actual, expected); // Auto's enabled mode is authoritative; its wait/status may re-evaluate on restored media.
  if (expected.autoEnabled === 'true') assert.equal(transport, priorTransport);
}
try {
  await listenBrowserLoopback(server); browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
  await page.goto(fileMode ? pathToFileURL(path.join(source, 'before-rain-stops.html')).href : `http://127.0.0.1:${server.address().port}/`);
  await button('打开玩家设置').click(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await page.getByLabel('静音全部声音', { exact: true }).check(); await page.getByLabel('个人字号', { exact: true }).focus(); await page.getByLabel('个人字号', { exact: true }).press('End'); await button('返回故事').click(); await button('开始故事').click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await settle();
  await button('继续下一句').hover(); await page.mouse.wheel(0, 220); await page.waitForFunction(() => document.querySelector('.player-dialogue').scrollTop > 100); await settle();
  const initial = await state(), savedPosition = await position(); assert.ok(savedPosition.first > 0); await save('manual-2');
  const prefix = await finish(0, [], true), branchPoint = await state(); await save('manual-1'); const savedSlots = (await stored()).filter(row => row.slot.startsWith('manual-'));
  assert.deepEqual(await finish(0, prefix), contracts[0].texts); await page.getByText('已达成 1 / 2 个结局', { exact: true }).waitFor();
  checks.push({ name: 'first-full-route-and-two-real-manual-checkpoints', paragraphs: contracts[0].texts.length, branchPoint, initial, savedPosition });
  await load('manual-1', true); assert.equal((await state()).cursor, branchPoint.cursor); assert.equal(await page.locator('.player-choice button').count(), 2);
  assert.deepEqual(await finish(1, prefix), contracts[1].texts); await page.getByText('已达成 2 / 2 个结局', { exact: true }).waitFor(); assert.deepEqual((await stored()).filter(row => row.slot.startsWith('manual-')), savedSlots);
  const ending = await state(); await extras(true); await enter('雨后的天明'); await button('退出回想，返回原剧情').click(); await returned(ending);
  checks.push({ name: 'load-saved-branch-finish-other-route-and-return-to-second-ending', paragraphs: contracts[1].texts.length, ending, formalSlotsPreserved: true });
  await button('回到标题').click(); await page.reload(); const title = await state(); await extras(); assert.ok(await button('开始回想 雨后的天明').isEnabled()); assert.ok(await button('开始回想 再一次见面').isEnabled()); await enter('再一次见面'); await page.keyboard.press('Escape'); await returned(title);
  checks.push({ name: 'both-unlocks-and-real-entrances-survive-reopen-and-title-replay', title });
  await load('manual-2'); assert.equal((await state()).text, initial.text);
  // The old saved line can already be visible near the bottom of a fresh
  // viewport. Deliberately scroll as a reader again: a start anchor is not proof
  // that replay can restore a non-start line.
  await button('继续下一句').hover(); await page.mouse.wheel(0, -5000); await page.waitForFunction(() => document.querySelector('.player-dialogue').scrollTop === 0);
  await page.mouse.wheel(0, 220); await page.waitForFunction(() => document.querySelector('.player-dialogue').scrollTop > 100); await settle();
  const parent = await state(), anchor = await position(); assert.ok(anchor.first > 0 && anchor.scrollTop > 100);
  const beforeArchives = await archives(), beforeReplaySlots = await stored(); await extras(); await enter('雨后的天明'); await page.keyboard.press('Escape'); await returned(parent);
  const after = await position(); await shot(baseline ? 'lost-parent-reading-position' : 'restored-parent-reading-position');
  if (baseline) { checks.push({ name: 'real-replay-exit-keeps-runtime-but-loses-parent-visible-reading-line', before: anchor, after, formalSlotsPreserved: true }); assert.ok(after.first < anchor.first); assert.equal(after.scrollTop, 0); }
  else {
    assert.ok(visible(after, anchor.first), 'Replay exit lost the parent visible reading line'); assert.ok(Math.abs(after.scrollTop - anchor.scrollTop) <= 2, 'Same-viewport replay return shifted the reading position'); assert.deepEqual(await stored(), beforeReplaySlots); assert.deepEqual(await archives(), beforeArchives);
    checks.push({ name: 'escape-restores-parent-visible-line-without-writing-slots-or-archives', before: anchor, after });
    await extras(); await enter('再一次见面'); await finish(1); await page.getByText('回想结束', { exact: true }).waitFor(); await button('结束回想，返回原剧情').click(); await returned(parent); assert.ok(visible(await position(), anchor.first)); assert.ok(Math.abs((await position()).scrollTop - anchor.scrollTop) <= 2);
    checks.push({ name: 'completed-replay-and-explicit-return-preserve-parent-reading-line', after: await position() });
    await button('打开阅读菜单').click(); await button('自动播放').click(); await page.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '返回故事', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main')?.dataset.autoPlayback === 'waiting-reading'); const autoParent = await state();
    await extras(); await enter('雨后的天明'); await finish(0); await page.getByText('回想结束', { exact: true }).waitFor(); await page.keyboard.press('Space'); await returned(autoParent); assert.ok(visible(await position(), anchor.first)); assert.ok(Math.abs((await position()).scrollTop - anchor.scrollTop) <= 2); await button('停止自动阅读').click();
    checks.push({ name: 'native-space-after-replay-completion-restores-parent-auto-and-readable-line', autoParent, after: await state() });
    const layouts = [], layoutCheck = { name: 'four-viewport-replay-return-restores-readable-anchor-focus-and-keeps-original-records', logicalAnchorOffset: anchor.first, layouts, formalSlotsPreserved: false, independentArchivesPreserved: false }; checks.push(layoutCheck);
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      const before = await position(); await extras(); await enter('雨后的天明'); await page.setViewportSize(viewport); await button('退出回想，返回原剧情').click(); await returned(parent); const actual = await position();
      layouts.push({ viewport, before, after: actual }); await shot(`return-${viewport.width}`);
      // Reflow can bring earlier characters onto the anchor's wrapped line.
      // Those are not a new reader-selected anchor. Keep the original character
      // selected before replay visible across every subsequent rotation.
      assert.ok(visible(actual, anchor.first), 'Return after replay rotation lost the original reader-selected character'); assert.ok(await button('继续下一句').evaluate(el => document.activeElement === el), 'Reading return must focus the restored paragraph');
    }
    assert.deepEqual(await stored(), beforeReplaySlots); assert.deepEqual(await archives(), beforeArchives); layoutCheck.formalSlotsPreserved = true; layoutCheck.independentArchivesPreserved = true;
  }
  assert.deepEqual(errors, []); await context.close();
  await writeFile(reportPath, JSON.stringify({ passed: true, baseline, engine, fileMode, browser: browser.version(), artifacts, checks, errors, scope: 'Actual 1.11 UI only: both full routes with a real saved branch, reopen/unlocks, title/ending/body replay and visible text-line restoration. Muted desktop engines/phone viewports, not human reading/listening, physical Safari/OS lifecycle, native streaming stalls, cross-device independent archive migration, rights or public HTTPS.' }, null, 2)); console.log(`PASS ${engine}${fileMode ? '-file' : ''} route replay (${checks.length} checks)`);
} catch (error) {
  let mediaDiagnostics = null;
  if (page && !page.isClosed()) {
    await shot('failure').catch(() => {});
    mediaDiagnostics = await page.evaluate(() => ({ pending: document.querySelector('main')?.getAttribute('data-stage-images-pending'), scheduler: document.documentElement.dataset.nativeAtlasScheduler, images: Array.from(document.querySelectorAll('canvas[data-native-atlas]')).map(el => ({ assetId: el.dataset.assetId, mode: el.dataset.nativeAtlas, busy: el.getAttribute('aria-busy') })), messages: Array.from(document.querySelectorAll('[role="alert"]')).map(el => el.textContent) })).catch(() => null);
  }
  await writeFile(reportPath, JSON.stringify({ passed: false, baseline, engine, fileMode, artifacts, checks, errors, mediaDiagnostics, error: String(error), stack: error.stack }, null, 2)); throw error;
}
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

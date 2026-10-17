import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY ?? 'evidence/web-auto-voice-continuity'), prior = path.resolve(root, process.env.STUDIO_AUTO_CONTINUITY_SOURCE_DIRECTORY ?? 'evidence/web-story-arrival-and-night');
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', baselineOnly = process.argv.includes('--baseline-only');
const playOnly = process.argv.includes('--play-only');
const sourceManifest = json(unzipSync(await readFile(path.join(prior, 'before-rain-stops-project.zip')))['world.project.json']);
const version = sourceManifest.webPublication.version, notes = json(await readFile(path.join(prior, 'before-rain-stops.worldreview')));
assert.match(version, /^\d+\.\d+\.\d+$/u); assert.ok(notes.notes.every(note => note.status === 'fixed' && note.checkedSourceHash === null));
const retained = await Promise.all(['before-rain-stops-project.zip', 'before-rain-stops.worldreview', 'before-rain-stops.html', 'before-rain-stops-website.zip'].map(async name => ({ name, sha256: sha(await readFile(path.join(prior, name))) })));
if (!baselineOnly && !playOnly) for (const name of ['before-rain-stops.html', 'before-rain-stops-website.zip']) {
  try { await readFile(path.join(output, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  throw Error(`Refusing to overwrite frozen game ${path.join(output, name)}; use a new output directory or --play-only`);
}
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
await mkdir(output, { recursive: true });
const reportPath = path.join(output, baselineOnly ? 'baseline-browser.json' : playOnly ? 'player-only-checks.json' : 'browser-checks.json');
await writeFile(reportPath, JSON.stringify({ passed: false, status: 'running', startedAt: new Date().toISOString() }, null, 2));
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] }), errors = [], checks = [];
let current, server;
const button = (p, name) => p.getByRole('button', { name, exact: true });
const hash = p => p.locator('main.player-shell').getAttribute('data-runtime-state-hash');
const shot = (p, name) => p.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log('PASS ' + name); };
const watch = p => { current = p; p.on('pageerror', e => errors.push(String(e))); };
async function wait(p, ms) { await p.waitForTimeout(ms); }
async function auto(p) { await button(p, '打开阅读菜单').click(); await p.getByLabel('自动阅读节奏', { exact: true }).selectOption('brisk'); await button(p, '自动播放').click(); await button(p, '返回故事').click(); }
async function voicePage(url, fault = true) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  if (fault) await ctx.addInitScript(() => {
    // Fault injection at the browser playback boundary, not the game's source,
    // payload, native error/ended events or narrative clock.
    const play = HTMLMediaElement.prototype.play;
    window.voiceTestMode = 'hold'; window.voiceTestReject = null;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.audioBus === 'voice') {
        if (window.voiceTestMode === 'hold') return new Promise((_, reject) => { window.voiceTestReject = () => reject(new DOMException('Injected unsupported playback', 'NotSupportedError')); });
        this.playbackRate = window.voiceTestMode === 'slow' ? .1 : 1;
      }
      return play.call(this);
    };
  });
  const p = await ctx.newPage(); watch(p); await p.goto(url);
  await button(p, '打开玩家设置').click(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await p.getByLabel('静音全部声音', { exact: true }).check(); await button(p, '返回故事').click(); await button(p, '开始故事').click();
  for (let i = 0; i < 25 && !await p.locator('audio[data-audio-bus="voice"]').count(); i++) { await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); await button(p, '继续下一句').click(); }
  await p.locator('audio[data-audio-bus="voice"]').waitFor({ state: 'attached' });
  if (fault) await p.waitForFunction(() => typeof window.voiceTestReject === 'function');
  return { ctx, p };
}
async function faultRoute(url, retry, baseline) {
  const { p, ctx } = await voicePage(url), before = await hash(p), text = await p.locator('.player-dialogue__text').innerText(), deadline = 500 + Array.from(text).length * 90;
  await auto(p);
  if (retry) await p.locator('audio[data-audio-bus="voice"]').evaluate(v => { v.src = 'data:audio/wav;base64,AA=='; v.load(); });
  else await p.evaluate(() => window.voiceTestReject());
  await p.getByRole('alert').filter({ hasText: '声音' }).waitFor();
  if (retry) { await p.evaluate(() => { window.voiceTestMode = 'slow'; }); if (await button(p, '查看媒体问题').count()) await button(p, '查看媒体问题').click(); await button(p, '重试媒体').click(); await p.waitForFunction(() => { const v = document.querySelector('audio[data-audio-bus="voice"]'); return v && !v.paused && v.currentTime > 0 && v.playbackRate === .1; }); }
  await wait(p, deadline + 500);
  const after = await hash(p), state = await p.locator('main').getAttribute('data-auto-playback');
  const detail = { text, deadline, before, after, auto: state, retry, injectedPlayRejection: !retry, invalidVoiceUrlForNativeDecodeError: retry, nativeErrorEventInjected: false };
  if (baseline) assert.equal(after !== before, retry, 'Original clock failure reproduction');
  else {
    assert.equal(after === before, retry);
    if (retry) {
      assert.equal(await p.locator('audio[data-audio-bus="voice"]').evaluate(v => v.ended), false);
      await shot(p, 'retry-waits-for-new-native-voice');
      await p.locator('audio[data-audio-bus="voice"]').evaluate(v => { v.playbackRate = 4; });
      await p.waitForFunction(before => document.querySelector('main')?.dataset.runtimeStateHash !== before, before, { timeout: 15000 });
      detail.nativeCompletionThenAdvanced = true;
    }
  }
  await shot(p, (baseline ? 'baseline-' : '') + (retry ? 'retry-owner' : 'promise-rejection'));
  check((baseline ? 'baseline-' : '') + (retry ? 'retry-owner' : 'promise-rejection'), detail); await ctx.close();
}
async function author() {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); watch(p);
  const html = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), html);
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) assert.equal(sha(new Uint8Array(await (await fetch(new URL(asset, ui))).arrayBuffer())), sha(await readFile(path.join(root, 'apps/editor/dist', asset))));
  await p.goto(ui); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(prior, 'before-rain-stops-project.zip'));
  await p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  const nav = name => p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
  await nav('检查'); await p.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(prior, 'before-rain-stops.worldreview')); await p.getByRole('button', { name: `待跟进 ${notes.notes.length}`, exact: true }).waitFor();
  await p.locator('.local-save-button').click(); await p.locator('.local-save-button--saved').waitFor();
  if (!await p.locator('.project-switcher').evaluate(e => e.open)) await p.getByLabel('项目菜单', { exact: true }).click();
  await p.getByRole('button', { name: /所有项目/u }).click(); await p.reload(); await button(p, '打开项目：雨停之前').click(); await p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  if (!await p.locator('.project-switcher').evaluate(e => e.open)) await p.getByLabel('项目菜单', { exact: true }).click();
  const sourceDownload = p.waitForEvent('download'); await p.getByRole('button', { name: /导出工程 ZIP/u }).click(); const sourceBytes = await readFile(await (await sourceDownload).path()); assert.equal(sha(sourceBytes), sha(await readFile(path.join(prior, 'before-rain-stops-project.zip'))));
  await nav('检查'); const board = p.getByRole('region', { name: '试玩校订清单', exact: true }); const noteDownload = p.waitForEvent('download'); await board.getByRole('button', { name: '导出校订记录', exact: true }).click(); assert.deepEqual(json(await readFile(await (await noteDownload).path())), json(await readFile(path.join(prior, 'before-rain-stops.worldreview'))));
  await nav('发布'); await button(p, '继续：导出方式 →').click();
  for (const format of ['html', 'website']) {
    await p.locator(`input[name="publication-format"][value="${format}"]`).check(); await p.getByLabel('同时生成制作交付包', { exact: true }).uncheck(); await button(p, '继续：生成游戏 →').click(); await p.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(p, format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP').click();
    const link = p.getByRole('link', { name: format === 'html' ? '下载游戏' : '下载网站上传包', exact: true }); await link.waitFor({ timeout: 90000 }); const pending = p.waitForEvent('download'); await link.click(); await writeFile(path.join(output, format === 'html' ? 'before-rain-stops.html' : 'before-rain-stops-website.zip'), await readFile(await (await pending).path()));
    if (format === 'html') await button(p, '← 导出方式').click();
  }
  check('actual-production-editor-unchanged-source-and-pending-notes-save-reopen-dual-export', { sourceSha256: sha(sourceBytes), pendingNotes: notes.notes.length }); await p.close();
}
async function audit() {
  const oldHtml = readGamePayload(await readFile(path.join(prior, 'before-rain-stops.html'), 'utf8')), htmlBytes = await readFile(path.join(output, 'before-rain-stops.html')), websiteBytes = await readFile(path.join(output, 'before-rain-stops-website.zip')), website = unzipSync(websiteBytes), html = readGamePayload(htmlBytes.toString()), web = readGamePayload(Buffer.from(website['index.html']).toString());
  assert.deepEqual(html, oldHtml); assert.deepEqual(web.project, html.project); assert.equal(web.mediaAssets.length, 26);
  for (const asset of web.mediaAssets) assert.equal(sha(website[asset.url]), sha(Buffer.from(html.mediaAssets.find(a => a.assetId === asset.assetId).url.split(',')[1], 'base64')));
  const info = json(website['build-info.json']); assert.equal(Object.keys(website).length, 37); assert.deepEqual(Object.keys(website).sort(), ['build-info.json', ...info.files.map(f => f.path)].sort()); for (const file of info.files) { assert.equal(website[file.path].length, file.byteLength); assert.equal('sha256:' + sha(website[file.path]), file.digest); }
  const report = { passed: true, unchangedPayloadAndAll26Media: true, sameContentVersion: version, unchangedNotesPending: notes.notes.length, sourceAndNotes: path.relative(root, prior).replaceAll('\\', '/'), retained, websiteFiles: 37, artifacts: { html: { bytes: htmlBytes.length, sha256: sha(htmlBytes) }, website: { bytes: websiteBytes.length, sha256: sha(websiteBytes) } } }; await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(report, null, 2)); check('unchanged-content-media-and-public-files', report); return website;
}
async function quickLoad(p) {
  await button(p, '读取存档').click(); const panel = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '快速', exact: true }).click(); await panel.getByRole('button', { name: '读取', exact: true }).click();
  if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
}
async function completeRoute(url, branch) {
  const ctx = await browser.newContext({ viewport: branch ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: !!branch, reducedMotion: 'reduce' }), p = await ctx.newPage(); watch(p);
  const source = readGamePayload(await readFile(path.join(prior, 'before-rain-stops.html'), 'utf8')).project;
  const statements = Object.values(source.scripts).flatMap(script => script.statements), byText = new Map(statements.filter(s => ['dialogue', 'narration'].includes(s.kind)).map(s => [s.text, s]));
  await p.goto(url); await button(p, '打开玩家设置').click(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await p.getByLabel('静音全部声音', { exact: true }).check(); await button(p, '返回故事').click();
  if (branch) { await p.locator('#offline-panel > summary').click(); await button(p, '下载离线内容').click(); await p.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 }); await ctx.setOffline(true); assert.equal((await p.reload()).fromServiceWorker(), true); }
  await button(p, '开始故事').click(); const ids = [], voices = []; let continuedAutomatically = false, restored = false;
  const ratio = await p.locator('.player-stage-world').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; }); assert.ok(Math.abs(ratio - 16 / 9) < .01, 'Styled game keeps authored stage ratio');
  const target = branch ? 'stmt_ui_219' : 'stmt_ui_137';
  for (let i = 0; i < 240 && await p.locator('main').getAttribute('data-player-status') !== 'ended'; i++) {
    if (await p.locator('.player-choice button').count()) { await p.locator('.player-choice button').nth(branch).click(); continue; }
    await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    const text = (await p.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(text); assert.ok(statement); if (ids.at(-1) !== statement.id) ids.push(statement.id);
    if (await p.locator('audio[data-audio-bus="voice"]').count()) {
      voices.push(statement.id);
      if (!continuedAutomatically) {
        const before = await hash(p); await auto(p); await p.waitForFunction(before => document.querySelector('main')?.dataset.runtimeStateHash !== before, before, { timeout: 15000 });
        await button(p, '停止自动阅读').click(); continuedAutomatically = true; continue;
      }
      await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended);
    }
    if (statement.id === target && !restored) {
      const before = await hash(p), cursor = await p.locator('main').getAttribute('data-history-cursor'), bg = await p.locator('.player-stage-background').getAttribute('data-asset-id');
      await button(p, '打开阅读菜单').click(); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
      const menu = p.getByRole('dialog', { name: '阅读菜单', exact: true }); if (await menu.isVisible()) await menu.getByRole('button', { name: '返回故事', exact: true }).click();
      await button(p, '打开阅读菜单').click(); await button(p, '打开剧情历史').click(); const history = p.getByRole('dialog', { name: '剧情历史', exact: true });
      const past = ids.at(-2), pastText = statements.find(s => s.id === past).text; await history.getByLabel('查找已记录的剧情', { exact: true }).fill(pastText.slice(0, 18));
      await history.getByRole('button', { name: '回退到：' + pastText, exact: true }).click(); assert.notEqual(await hash(p), before); assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'off');
      await p.reload(); await quickLoad(p); assert.equal(await hash(p), before); assert.equal(await p.locator('main').getAttribute('data-history-cursor'), cursor); await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), bg); assert.equal(await p.locator('main').getAttribute('data-auto-playback'), 'off');
      await shot(p, `route-${branch}-history-save-reopen`); restored = true;
    }
    await button(p, '继续下一句').click();
  }
  assert.equal(ids.length, 66); assert.equal(voices.length, 6); assert.equal(continuedAutomatically, true); assert.equal(restored, true); assert.equal(await p.locator('main').getAttribute('data-player-status'), 'ended');
  const titles = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch ? ['远行', '车窗与海', '再一次见面'] : ['留下', '灯下的回信', '雨后的天明'])];
  assert.deepEqual(ids, titles.flatMap(title => source.scripts[source.scenes.find(scene => scene.title === title).id].statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id)));
  const ending = await p.locator('.player-ending').innerText(); await shot(p, `route-${branch}-ending`); check(`full-${branch ? 'offline-phone-website' : 'desktop-html'}-route-auto-history-save-reopen`, { texts: ids.length, voices: voices.length, ending, naturallyEndedAudioMuted: true, historyTarget: target, autoStopsAfterLoad: true }); await ctx.close();
}
async function originalSave(url) {
  const original = await voicePage(pathToFileURL(path.join(prior, 'before-rain-stops.html')).href, false), p = original.p;
  const before = await hash(p); await button(p, '打开阅读菜单').click(); await button(p, '存读档').click(); const panel = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '备份', exact: true }).click(); await panel.getByLabel('备份进度', { exact: true }).selectOption('current');
  const pending = p.waitForEvent('download'); await panel.getByRole('button', { name: '导出备份文件', exact: true }).click(); const bytes = await readFile(await (await pending).path()), filename = path.join(output, `original-${version}.worldsave`); await writeFile(filename, bytes); assert.equal(json(bytes).payload.slot.runtimeStateHash, before); await original.ctx.close();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), target = await ctx.newPage(); watch(target); await target.goto(url); await button(target, '读取存档').click(); const slots = target.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '备份', exact: true }).click(); await slots.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(filename);
  await slots.getByRole('button', { name: '导入到所选槽位', exact: true }).click(); await slots.getByRole('button', { name: '读取导入的存档', exact: true }).click(); if (await target.locator('.player-load-confirm').isVisible()) await button(target, '确认读取').click(); await target.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); assert.equal(await hash(target), before); assert.equal(await target.locator('main').getAttribute('data-auto-playback'), 'off'); await shot(target, `original-${version}-backup-restored`); check('actual-original-same-content-backup-explicit-import-and-load', { version, before, after: await hash(target), backupSha256: sha(bytes) }); await ctx.close();
}
try {
  if (baselineOnly) { const url = pathToFileURL(path.join(prior, 'before-rain-stops.html')).href; await faultRoute(url, false, true); await faultRoute(url, true, true); }
  else {
    if (!playOnly) await author(); const website = await audit();
    server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = website[name], type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' }[path.extname(name)] ?? 'application/octet-stream', range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? ''); const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' }; if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); } res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing'); }); await listenBrowserLoopback(server);
    const url = `http://127.0.0.1:${server.address().port}/gal/`; await faultRoute(url, false, false); await faultRoute(url, true, false);
    await completeRoute(pathToFileURL(path.join(output, 'before-rain-stops.html')).href, 0); await completeRoute(url, 1); await originalSave(url);
  }
  for (const file of retained) assert.equal(sha(await readFile(path.join(prior, file.name))), file.sha256);
  assert.deepEqual(errors, []); await writeFile(path.join(output, baselineOnly ? 'baseline-browser.json' : playOnly ? 'player-only-checks.json' : 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), version, pendingNotes: notes.notes.length, retained, checks, errors, scope: baselineOnly ? 'Original retained HTML in Chromium with explicit playback-boundary faults at one voice: rejected play Promise or invalid WAV causing native decode error, then slowed native retry. No synthetic native error/ended events. Not an author run, full route, human listening, physical device or public deployment.' : (playOnly ? 'Frozen game revalidation, no author rerun. ' : 'Actual production editor, unchanged source and pending notes, save/reopen/dual export. ') + `Content ${version}; desktop HTML route 0 and offline phone-sized website route 1, 66 texts and six voice lines each, Auto/history/save/reopen, original same-content backup import/load. Separate Chromium playback-boundary fault injection, native retry completion, no synthetic native error/ended events. Not a full format/route matrix, human listening, physical phone/Safari, public HTTPS, upgrade or long-soak acceptance.` }, null, 2));
} catch (error) { await writeFile(reportPath, JSON.stringify({ passed: false, error: String(error), checks, errors }, null, 2)); if (current && !current.isClosed()) await shot(current, 'failure'); throw error; }
finally { await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

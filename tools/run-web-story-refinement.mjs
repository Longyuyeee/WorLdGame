import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { revisions, refinedScenes, newBackgrounds, backgroundChanges, audioChanges } from '../assets/rain-story/editorial-v1.6.mjs';
import { auditArtifacts, sha } from './audit-rain-story-refinement.mjs';

const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-story-refinement'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(25000);
const errors = [], checks = [], routeReports = {}; let current = page, server; const watch = p => p.on('pageerror', e => errors.push(e.message)); watch(page);
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function scene(name) {
  await nav('故事'); if (!await page.locator('.scene-rail').isVisible()) await page.getByRole('button', { name: '场景列表', exact: true }).click();
  await page.locator('.scene-rail').getByRole('button').filter({ hasText: name }).click();
}
async function view(name) { await page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name, exact: true }).click(); }
async function select(id) { await page.locator(`#statement-card-${id}`).click(); }
async function menu(name) { await ready(); if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function file(trigger, name) { const event = page.waitForEvent('download'); await trigger(); const bytes = await readFile(await (await event).path()); await writeFile(path.join(output, name), bytes); return bytes; }
async function issue(sceneName, id, text, category = 'text') {
  await scene(sceneName); await view('写作'); await select(id);
  if (await page.getByRole('button', { name: '打开预览', exact: true }).count()) await page.getByRole('button', { name: '打开预览', exact: true }).click();
  const options = page.locator('.preview-run-options'); if (!await options.evaluate(el => el.open)) await options.locator('summary').click();
  await page.getByRole('button', { name: '从当前语句运行', exact: true }).click(); await page.getByRole('button', { name: '记录问题', exact: true }).click();
  await page.getByLabel('校订问题描述', { exact: true }).fill(text); await page.getByLabel('校订问题类型', { exact: true }).selectOption(category);
  await page.getByRole('button', { name: '保存校订记录', exact: true }).click(); await page.getByRole('button', { name: '退出试玩', exact: true }).click();
}
async function generate(directory) {
  if (!directory) { await nav('发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); }
  else await page.getByRole('button', { name: '← 导出方式', exact: true }).click();
  await page.getByRole('radio', { name: directory ? /网页目录 ZIP/ : /单文件 HTML/ }).check();
  await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await page.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 90000 });
  await file(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), directory ? 'before-rain-stops-web.zip' : 'before-rain-stops.html');
}
async function rejectOldContentSave() {
  const old = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); current = old; watch(old);
  await old.goto(pathToFileURL(path.join(root, 'evidence/web-save-backup/before-rain-stops.html')).href); await old.getByRole('button', { name: /^开始故事/ }).click();
  if (!await old.getByRole('button', { name: '存读档', exact: true }).isVisible()) await old.getByRole('button', { name: '打开阅读菜单', exact: true }).click();
  await old.getByRole('button', { name: '存读档', exact: true }).click(); const slots = old.getByRole('dialog', { name: '存读档槽位' });
  await slots.getByRole('button', { name: '备份', exact: true }).click(); await slots.getByLabel('备份进度', { exact: true }).selectOption('current');
  const event = old.waitForEvent('download'); await slots.getByRole('button', { name: '导出备份文件', exact: true }).click(); const bytes = await readFile(await (await event).path()); await writeFile(path.join(output, 'original-1.5.4.worldsave'), bytes); await old.close();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); current = p; watch(p);
  await p.goto(`http://127.0.0.1:${server.address().port}/gal/index.html`); await p.getByRole('button', { name: '读取存档', exact: true }).click(); const target = p.getByRole('dialog', { name: '存读档槽位' }); await target.getByRole('button', { name: '备份', exact: true }).click();
  await target.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(path.join(output, 'original-1.5.4.worldsave'));
  const error = target.getByRole('alert'); await error.waitFor(); const message = await error.innerText(); assert.match(message, /版本|构建|不兼容|不同|匹配/u);
  assert.equal(await target.getByRole('button', { name: '导入到所选槽位', exact: true }).count(), 0); assert.equal(await p.locator('main.player-shell').getAttribute('data-player-status'), 'title'); await shot(p, 'old-content-save-rejected');
  check('actual-1.5.4-backup-rejected-for-changed-1.6-story', { message, stateUnchanged: true }); await p.close(); current = page;
}
async function route(url, name, branch, ending, width, expectedScenes) {
  const p = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width < 500, isMobile: width < 500 }); current = p; watch(p); p.setDefaultTimeout(25000);
  const main = p.locator('main.player-shell'), hash = () => main.getAttribute('data-runtime-state-hash');
  await p.goto(url); await p.getByRole('button', { name: /^开始故事/ }).click();
  const paragraphs = new Set(), voices = new Set(), stage = new Map(), seenScenes = []; let saved = false;
  const expectedStage = new Map(backgroundChanges.map(c => [c.anchor, c.to]));
  const original = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip'))), byText = new Map();
  for (const [key, value] of Object.entries(original)) if (key.startsWith('scripts/')) for (const s of JSON.parse(strFromU8(value)).statements) if (s.kind === 'narration') byText.set(s.text, s.id);
  for (let step = 0; step < 500; step++) {
    if (await main.getAttribute('data-player-status') === 'ended') break;
    if (await p.locator('.player-choice button').count()) { await p.locator('.player-choice').getByRole('button', { name: branch, exact: true }).click(); continue; }
    await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
    const text = (await p.locator('.player-dialogue__text').innerText()).trim(), matched = refinedScenes.find(s => s.prose.includes(text)), id = byText.get(text);
    if (matched) { paragraphs.add(text); if (seenScenes.at(-1) !== matched.name) seenScenes.push(matched.name); }
    if (expectedStage.has(id) && !stage.has(id)) {
      const asset = await p.locator('.player-stage-background').getAttribute('data-asset-id'); assert.equal(asset, expectedStage.get(id)); stage.set(id, asset);
      const frame = await p.locator('.player-stage-world').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; }); assert.ok(Math.abs(frame - 16 / 9) < .01);
      await shot(p, `${name}-${id}-${asset}`);
    }
    if (id === 'stmt_ui_234') {
      await p.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="ambient"]'); return a?.dataset.assetId === 'soft_rain' && a.currentTime > 0 && !a.paused; });
      assert.equal(await p.locator('audio[data-audio-bus="ambient"]').getAttribute('data-volume'), '0.1');
    }
    if (id === 'stmt_ui_248') assert.equal(await p.locator('audio[data-audio-bus="ambient"]').count(), 0);
    if (!saved && matched?.name === '候车室的旧信') {
      const before = await hash(); await p.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await p.getByRole('button', { name: '快速保存', exact: true }).click();
      await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await p.reload();
      await p.getByRole('button', { name: '读取存档', exact: true }).click(); const slots = p.getByRole('dialog', { name: '存读档槽位' });
      await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
      await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); assert.equal(await hash(), before); saved = true;
    }
    const voice = p.locator('audio[data-audio-bus="voice"]'); if (await voice.count()) { const id = await voice.getAttribute('data-asset-id'); if (!voices.has(id)) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(id); } }
    await p.getByRole('button', { name: '继续下一句', exact: true }).click(); await p.waitForTimeout(45);
  }
  assert.equal(await main.getAttribute('data-player-status'), 'ended'); assert.ok((await p.locator('.player-ending').innerText()).includes(ending)); assert.equal(paragraphs.size, 60); assert.equal(voices.size, 6); assert.deepEqual(seenScenes, expectedScenes); assert.ok(saved);
  assert.equal(stage.size, branch === '留下等雨停' ? 1 : 4); assert.equal(await p.locator('audio').count(), 0); await shot(p, `${name}-ending`);
  const beforeReplay = await hash(); await p.getByRole('button', { name: '查看收藏与结局', exact: true }).click(); await p.getByRole('button', { name: '返回附加内容总览', exact: true }).click(); await p.getByRole('button', { name: '查看 场景回想', exact: true }).click();
  await p.getByRole('button', { name: `开始回想 ${expectedScenes.at(-1)}`, exact: true }).click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.sceneReplay !== 'inactive');
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
  if (branch !== '留下等雨停') assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), 'station_day');
  await p.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click(); assert.equal(await hash(), beforeReplay);
  routeReports[name] = { seenScenes, paragraphs: paragraphs.size, naturallyEndedVoices: [...voices], checkedStages: Object.fromEntries(stage), quickSaveReload: true, replayRestoredSameHash: true, physicalPhone: false, humanReadTiming: false };
  check(name, routeReports[name]); await p.close(); current = page;
}

try {
  if (!process.argv.includes('--play-only')) {
    await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); const started = performance.now();
    await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip')); await ready();
    const importMs = performance.now() - started;
    for (const r of revisions) await issue(r.scene, r.statementId, r.reason);
    for (const [sceneName, id, text] of [
      ['雨后的天明', 'stmt_ui_158', '白天到站仍是雨夜背景；同一地点补白天变体并核对三个白天站台入口。'],
      ['再一次见面', 'stmt_ui_232', '早餐/下午面馆仍是夜景；补白天面馆，并在下午下雨/回房时配合雨声起止。'],
      ['再一次见面', 'stmt_ui_248', '晚间回房仍使用晨光画室；补同一房间夜景，不改变开场和白天画面。']
    ]) await issue(sceneName, id, text, 'stage');
    check('eight-real-editor-review-notes', { importMs, humanAcceptance: false });
    await nav('素材'); await page.getByRole('button', { name: '批量导入素材', exact: true }).click(); const bulk = page.getByRole('dialog', { name: '批量导入素材' });
    await page.getByLabel('选择批量素材文件', { exact: true }).setInputFiles(newBackgrounds.map(a => path.join(root, 'assets/rain-story', a.file)));
    await page.getByLabel('批量图片用途', { exact: true }).selectOption('background');
    for (const [i, bg] of newBackgrounds.entries()) await page.getByLabel(`素材名称 ${i + 1}`, { exact: true }).fill(bg.name);
    await bulk.getByRole('button', { name: '导入所选 3 项', exact: true }).click(); await bulk.getByText('已导入 3 / 3 项', { exact: true }).waitFor(); await shot(page, 'three-backgrounds-imported'); await bulk.getByRole('button', { name: '返回素材库', exact: true }).click();
    for (const r of revisions) { await scene(r.scene); await view('写作'); await select(r.statementId); const field = page.getByLabel('旁白文本', { exact: true }); assert.equal(await field.inputValue(), r.original); await field.fill(r.text); await page.getByRole('button', { name: '应用修改', exact: true }).click(); }
    for (const change of backgroundChanges) {
      await scene(change.scene); await view('演出'); await select(change.statementId); const field = page.getByLabel('演出主资源', { exact: true }); assert.equal(await field.inputValue(), change.from);
      const properties = page.locator('.step-properties'); if (!await properties.evaluate(el => el.open)) await properties.locator(':scope > summary').click();
      const quick = properties.locator('.direction-asset-picker__list'); if (!await quick.evaluate(el => el.open)) await quick.locator('summary').click();
      await field.selectOption(change.to); await page.getByRole('button', { name: '应用演出参数', exact: true }).click();
    }
    for (const cue of audioChanges) {
      await scene(cue.scene); await view('演出'); await select(cue.after); await page.getByLabel('场景演出快捷操作').getByRole('button', { name: '添加声音', exact: true }).click(); const edit = page.getByRole('dialog');
      await edit.getByLabel('新增演出动作', { exact: true }).selectOption(cue.action); await edit.getByLabel('新增音频总线', { exact: true }).selectOption(cue.bus);
      if (cue.action === 'play') { const quick = edit.locator('.direction-asset-picker__list'); await quick.locator('summary').click(); await edit.getByLabel('新增演出资源', { exact: true }).selectOption(cue.asset); await edit.getByLabel('新增音频音量', { exact: true }).fill(cue.volume); }
      await edit.getByRole('button', { name: '插入演出', exact: true }).click(); await edit.waitFor({ state: 'hidden' });
    }
    await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill('1.6.0'); await page.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready();
    // Exercise a real user-activated beforeunload dialog, not a synthetic browser event.
    const version = page.getByLabel('发布版本', { exact: true }); await version.fill('1.6.1');
    const nextDialog = page.waitForEvent('dialog'), reload = page.reload().catch(error => error); const warning = await nextDialog; assert.equal(warning.type(), 'beforeunload'); await warning.dismiss(); await reload;
    assert.equal(await version.inputValue(), '1.6.1'); await version.fill('1.6.0'); check('native-refresh-warning-preserves-unapplied-draft');
    await nav('检查'); const board = page.getByRole('region', { name: '试玩校订清单' }); assert.equal(await board.locator('[data-review-id]').count(), 8);
    while (await board.getByRole('button', { name: '标记已修改', exact: true }).count()) await board.getByRole('button', { name: '标记已修改', exact: true }).first().click();
    assert.equal(await board.locator('[data-review-status="fixed"]').count(), 8);
    await file(() => board.getByRole('button', { name: '导出校订记录', exact: true }).click(), 'before-rain-stops.worldreview'); await shot(page, 'eight-fixed-await-human-review');
    await menu('所有项目'); await page.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await page.reload(); await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
    await file(() => menu('导出工程 ZIP'), 'before-rain-stops-project.zip'); await generate(false); await generate(true);
    check('editor-applied-five-texts-five-backgrounds-two-audio-cues-and-version');
    await writeFile(path.join(output, 'authoring-checks.json'), JSON.stringify({ passed: true, checks, errors, importMs, notes: { count: 8, status: 'fixed', humanReviewed: false }, browser: browser.version() }, null, 2));
  }
  const { source, directory, ...audit } = await auditArtifacts(output); await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(audit, null, 2)); check('source-and-both-web-artifacts', audit.story);
  const provenance = [];
  for (const bg of newBackgrounds) { const bytes = await readFile(path.join(root, 'assets/rain-story', bg.file)), reference = await readFile(path.join(root, 'assets/rain-story', bg.reference)); provenance.push({ ...bg, sha256: sha(bytes), referenceSha256: sha(reference), byteLength: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), method: 'built-in imagegen lighting-weather edit', releasePermissionConfirmed: false }); }
  await writeFile(path.join(root, 'assets/rain-story/source-manifest-v1.6.json'), JSON.stringify({ version: '1.6.0', assets: provenance }, null, 2));
  const notes = JSON.parse(await readFile(path.join(output, 'before-rain-stops.worldreview'), 'utf8')); assert.equal(notes.notes.length, 8); assert.ok(notes.notes.every(n => n.status === 'fixed' && n.checkedSourceHash === null));
  await route(pathToFileURL(path.join(output, 'before-rain-stops.html')).href, 'html-stay', '留下等雨停', '同行的约定', 1280, refinedScenes.slice(0, 6).map(s => s.name));
  server = createServer((request, response) => { const key = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = directory[key]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json' }[path.extname(key)] ?? 'application/octet-stream' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await route(`http://127.0.0.1:${server.address().port}/gal/index.html`, 'directory-leave', '去追最后一班车', '远行的约定', 390, [...refinedScenes.slice(0, 3), ...refinedScenes.slice(6)].map(s => s.name));
  await rejectOldContentSave();
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), playOnly: process.argv.includes('--play-only'), checks, errors, routes: routeReports, scope: 'UI-authored candidate; exact artifact/data checks and both complete routes; fixed author issues are not human verification; no public deployment, physical device, licensing or save-content migration acceptance' }, null, 2));
} catch (error) { const name = `failure-${new Date().toISOString().replace(/[:.]/gu, '-')}`; await shot(current, name); await writeFile(path.join(output, `${name}.json`), JSON.stringify({ checks, errors, failure: error.stack }, null, 2)); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

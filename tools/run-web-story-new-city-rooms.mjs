import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { baseline, output, auditSource, auditNotes, auditArtifacts } from './audit-rain-story-new-city-rooms.mjs';
import { roomAssets, replacements, issues, stages, version } from '../assets/rain-story/editorial-v1.12.mjs';
import { rainRouteContract } from './web-work-continuity-contract.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const root = path.resolve(import.meta.dirname, '..'), ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
const baselineMode = process.argv.includes('--baseline'), authorMode = process.argv.includes('--author');
const resumeAuthor = process.argv.includes('--resume-author'); assert.ok(!resumeAuthor || authorMode);
assert.ok(!(baselineMode && authorMode));
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine)); assert.ok(!authorMode || engine === 'chromium');
await mkdir(output, { recursive: true }); const reportPath = path.join(output, authorMode ? resumeAuthor ? 'author-final.json' : 'author.json' : `${baselineMode ? 'baseline-' : ''}${engine}.json`);
try { await access(reportPath); throw Error('Refusing to overwrite a new city room report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (authorMode) for (const name of resumeAuthor ? ['before-rain-stops.html', 'before-rain-stops-website.zip'] : ['before-rain-stops-project.zip', 'before-rain-stops.worldreview', 'before-rain-stops.html', 'before-rain-stops-website.zip']) {
  try { await access(path.join(output, name)); throw Error('Refusing to overwrite a room candidate'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const sourceBytes = await readFile(path.join(baseline, 'before-rain-stops-project.zip')), oldSource = unzipSync(sourceBytes), oldNotes = json(await readFile(path.join(baseline, 'before-rain-stops.worldreview')));
const priorFiles = ['evidence/web-story-plans-and-farewell/before-rain-stops-project.zip', 'evidence/web-story-plans-and-farewell/before-rain-stops.worldreview', 'evidence/web-reading-motion/before-rain-stops.html', 'evidence/web-reading-motion/before-rain-stops-website.zip'];
const retained = await Promise.all(priorFiles.map(async file => ({ file, sha256: sha(await readFile(path.join(root, file))) })));
const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true, args: engine === 'chromium' ? ['--mute-audio'] : [] });
const checks = [], errors = [], routes = [], productions = [], code = [];
for (const file of ['tools/run-web-story-new-city-rooms.mjs', 'tools/audit-rain-story-new-city-rooms.mjs', 'assets/rain-story/editorial-v1.12.mjs', 'assets/rain-story/source-manifest-v1.12.json']) code.push({ file, sha256: sha((await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n')) });
let current, server;
const button = (p, name) => p.getByRole('button', { name, exact: true });
const watch = p => { current = p; p.setDefaultTimeout(30000); p.on('pageerror', error => errors.push(String(error))); };
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
const shot = (p, name) => p.screenshot({ path: path.join(output, `${authorMode ? 'author' : baselineMode ? 'baseline' : engine}-${name}.png`) });

async function author() {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); watch(p);
  const ready = () => p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  const nav = name => p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
  async function menu() { await ready(); if (!await p.locator('.project-switcher').evaluate(el => el.open)) await p.getByLabel('项目菜单', { exact: true }).click(); }
  async function download(action, file) { const pending = p.waitForEvent('download'); await action(); const item = await pending, downloadPath = await item.path(), bytes = await readFile(downloadPath); if (file) await writeFile(path.join(output, file), bytes, { flag: 'wx' }); return { bytes, downloadPath }; }
  async function scene(title) { await nav('故事'); if (!await p.locator('.scene-rail').isVisible()) await button(p, '场景列表').click(); await p.locator('.scene-rail').getByRole('button').filter({ hasText: title }).click(); }
  const view = name => p.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name, exact: true }).click();
  async function next() { const before = await p.getByTestId('preview-step').getAttribute('data-statement-id'); await button(p, '继续故事').click(); await p.waitForFunction(id => document.querySelector('[data-testid="preview-step"]')?.dataset.statementId !== id, before); }
  const index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), index); const servedBuild = [];
  for (const [, file] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) { const bytes = await readFile(path.join(root, 'apps/editor/dist', file)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(file, ui))).arrayBuffer())), sha(bytes)); servedBuild.push({ file, sha256: sha(bytes) }); }
  let noteDownload;
  if (!resumeAuthor) {
  await p.goto(ui); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops-project.zip')); await ready(); await nav('检查'); await p.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops.worldreview')); await button(p, '待跟进 25').waitFor();
  for (const issue of issues) {
    await scene(issue.scene); await view('写作'); await p.locator(`#statement-card-${issue.statementId}`).click();
    if (await button(p, '打开预览').count()) await button(p, '打开预览').click(); const options = p.locator('.preview-run-options'); if (!await options.evaluate(el => el.open)) await options.locator('summary').click(); await button(p, '从当前场景运行').click();
    for (let i = 0; i < 100 && await p.getByTestId('preview-step').getAttribute('data-statement-id') !== issue.statementId; i++) await next();
    assert.equal(await p.getByTestId('preview-step').getAttribute('data-statement-id'), issue.statementId); await button(p, '记录问题').click(); await p.getByLabel('校订问题描述', { exact: true }).fill(issue.reason); await p.getByLabel('校订问题类型', { exact: true }).selectOption('stage'); await button(p, '保存校订记录').click(); await button(p, '退出试玩').click();
  }
  check('actual-three-scene-issues-recorded-with-original25-pending-records-retained', { servedBuild });
  for (const asset of roomAssets) {
    await nav('素材'); if (!await button(p, '导入与管理素材').isVisible()) await p.getByText('素材处理进度与检查', { exact: true }).click(); await button(p, '导入与管理素材').click();
    await p.getByLabel('选择资源文件', { exact: true }).setInputFiles(path.join(root, 'assets/rain-story', asset.file)); await p.getByLabel('资源 Asset ID', { exact: true }).fill(asset.assetId); await p.getByLabel('资源显示名称', { exact: true }).fill(asset.displayName); await p.getByLabel('资源类型', { exact: true }).selectOption('background'); await button(p, '导入到资源保险库').click();
    await p.getByText(new RegExp(`媒体检查通过；新 Blob 与 ${asset.assetId} 已原子写入`, 'u')).waitFor(); await button(p, '关闭资源保险库').click();
    await nav('发布'); await button(p, '核对素材来源').click(); const sources = p.getByRole('dialog', { name: '素材来源与发行准备', exact: true }); await sources.getByLabel('搜索素材', { exact: true }).fill(asset.assetId); await sources.getByRole('group', { name: '选择来源素材' }).getByRole('button').first().click(); await sources.getByLabel('来源类型', { exact: true }).selectOption('generated'); await sources.getByLabel('来源事实', { exact: true }).fill(asset.source); await sources.getByLabel('发行条件状态', { exact: true }).selectOption('pending'); await sources.getByRole('button', { name: '应用来源台账', exact: true }).click();
  }
  check('two-real-png-imports-and-pending-generation-ledger-without-replacing-original26-files');
  for (const title of [...new Set(replacements.map(row => row.scene))]) {
    await scene(title); await view('脚本'); const input = p.getByLabel('权威脚本编辑器', { exact: true }), before = await input.inputValue(); let changed = 0;
    const after = before.split('\n').map(line => { const cue = replacements.find(row => row.scene === title && (line.includes(`@id(${row.id})`) || line.includes(`@sid(${row.id})`))); if (!cue) return line; assert.ok(line.includes(`asset=${cue.from}`)); changed++; return line.replace(`asset=${cue.from}`, `asset=${cue.to}`); }).join('\n');
    assert.equal(changed, replacements.filter(row => row.scene === title).length); await input.fill(after); await input.press('Control+s'); await p.waitForFunction(() => document.querySelector('.script-editor')?.dataset.inputState === 'committed'); await p.locator('.diagnostics-console.is-clear').waitFor();
    await button(p, '撤销').click(); await p.waitForFunction(text => document.querySelector('.script-editor')?.value === text, before); await button(p, '重做').click(); await p.waitForFunction(text => document.querySelector('.script-editor')?.value === text, after);
  }
  await nav('发布'); await p.getByLabel('发布版本', { exact: true }).fill(version); await button(p, '应用发布设置').click(); const compatibility = p.locator('.web-save-compatibility'); if (!await compatibility.evaluate(el => el.open)) await compatibility.locator('summary').click(); await compatibility.getByLabel('核对上一版工程 ZIP', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops-project.zip')); await compatibility.getByText(/作品内容有变化：/u).waitFor(); await shot(p, '1.11-compatibility-refused');
  await nav('检查'); const board = p.getByRole('region', { name: '试玩校订清单', exact: true }); while (await board.getByRole('button', { name: '标记已修改', exact: true }).count()) await board.getByRole('button', { name: '标记已修改', exact: true }).first().click();
  noteDownload = await download(() => board.getByRole('button', { name: '导出校订记录', exact: true }).click(), 'before-rain-stops.worldreview'); auditNotes(oldSource, oldNotes, json(noteDownload.bytes));
  check('five-existing-background-cues-edited-with-undo-redo-version-bump-and-three-fixed-not-approved-notes');
  } else {
    const frozenSource = await readFile(path.join(output, 'before-rain-stops-project.zip')); noteDownload = { bytes: await readFile(path.join(output, 'before-rain-stops.worldreview')) };
    auditSource(oldSource, unzipSync(frozenSource)); auditNotes(oldSource, oldNotes, json(noteDownload.bytes));
    const initialReport = json(await readFile(path.join(output, 'author.json'))); assert.equal(initialReport.checks.length, 3); assert.equal(initialReport.passed, false); assert.ok(initialReport.errors.some(error => error.includes('.world-assets/bundle.json')));
    await p.goto(ui); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(output, 'before-rain-stops-project.zip')); await ready(); await nav('检查'); await p.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(output, 'before-rain-stops.worldreview')); await button(p, '待跟进 28').waitFor();
    check('actual-frozen-author-source-and28-records-reopened-after-strict-bundle-inventory-correction', { servedBuild, sourceSha256: sha(frozenSource), originalAttempt: 'author.json' });
  }
  for (const branch of [0, 1]) {
    await nav('检查'); await p.getByRole('region', { name: '结局试玩进度', exact: true }).getByRole('button', { name: '从头试玩当前版本', exact: true }).click(); const ids = [];
    for (let i = 0; i < 400 && !await p.locator('.playable-preview--ended').count(); i++) { const id = await p.getByTestId('preview-step').getAttribute('data-statement-id'); if (ids.at(-1) !== id) ids.push(id); const options = p.getByTestId('preview-step').locator('.choice-preview button'); if (await options.count()) await options.nth(branch).click(); else await next(); }
    assert.equal(await p.locator('.playable-preview--ended').count(), 1); const ending = await p.getByTestId('preview-step').innerText(); routes.push({ entry: 'editor', branch, ids, ending }); await shot(p, `route-${branch}-ending`);
  }
  await nav('检查'); await p.getByRole('region', { name: '结局试玩进度', exact: true }).getByText('当前版本已从开头到达 2 / 2 个结局', { exact: true }).waitFor(); await ready(); await p.locator('.local-save-button').click(); await p.locator('.local-save-button--saved').waitFor(); await menu(); await p.getByRole('button', { name: /所有项目/u }).click(); await p.reload(); await button(p, '打开项目：雨停之前').click(); await ready();
  await menu(); const source = await download(() => p.getByRole('button', { name: /导出工程 ZIP/u }).click(), resumeAuthor ? undefined : 'before-rain-stops-project.zip'); if (resumeAuthor) assert.equal(sha(source.bytes), sha(await readFile(path.join(output, 'before-rain-stops-project.zip')))); const story = auditSource(oldSource, unzipSync(source.bytes)); check('two-editor-entry-endings-save-close-refresh-reopen-and-exact-source-delta', story);
  await nav('发布'); await button(p, '继续：导出方式 →').click(); let actualProductionPath;
  for (const format of ['html', 'website']) {
    await p.locator(`input[name="publication-format"][value="${format}"]`).check(); for (const label of ['同时生成制作交付包', '附带校订记录', '附带试玩进度']) await p.getByLabel(label, { exact: true }).check(); await button(p, '继续：生成游戏 →').click(); await p.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(p, format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP').click();
    const link = p.getByRole('link', { name: format === 'html' ? '下载游戏' : '下载网站上传包', exact: true }); await link.waitFor({ timeout: 90000 }); await download(() => link.click(), format === 'html' ? 'before-rain-stops.html' : 'before-rain-stops-website.zip');
    const production = await download(() => p.getByRole('link', { name: '下载制作交付包', exact: true }).click()), files = unzipSync(production.bytes), manifest = json(files['delivery.json']), prep = json(files['release/preparation.json']); assert.equal(sha(files['source/project.zip']), sha(source.bytes)); assert.deepEqual(json(files[manifest.reviewEntry]), json(noteDownload.bytes)); assert.equal(json(files[manifest.progressEntry]).completions.length, 2); assert.equal(prep.review.notes.pending, 28); assert.equal(prep.review.playtest.reached, 2); assert.equal(prep.pendingAssets, 28); assert.equal(prep.documentedAssets, 0);
    productions.push({ format, bytes: production.bytes.length, sha256: sha(production.bytes), sourceSha256: sha(files['source/project.zip']), notes: 28, currentEntryCompletions: 2 }); actualProductionPath = production.downloadPath; if (format === 'html') await button(p, '← 导出方式').click();
  }
  const fresh = await browser.newContext(), restored = await fresh.newPage(); watch(restored); await restored.goto(ui); await restored.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(actualProductionPath); await restored.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); await restored.getByRole('button', { name: '合并校订记录', exact: true }).click(); await restored.getByRole('button', { name: '合并试玩进度', exact: true }).click();
  await restored.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); const summary = restored.getByRole('region', { name: '文字演出与路线准备', exact: true }); assert.ok((await summary.innerText()).includes('28 条待跟进')); assert.ok((await summary.innerText()).includes('2 / 2')); await fresh.close(); current = p;
  const { source: _source, website: _website, ...artifact } = await auditArtifacts(); await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(artifact, null, 2), { flag: 'wx' }); check('actual-dual-export-private-production-fresh-restore-and-all28-media-audit'); await p.close();
}

async function stage(p, id, expected) {
  await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), expected.background); assert.deepEqual(await p.locator('.player-stage-character').evaluateAll(els => els.map(el => el.dataset.assetId)), expected.portraits);
  const ambient = p.locator('audio[data-audio-bus="ambient"]'); if (expected.ambient === null) assert.equal(await ambient.count(), 0); else { assert.equal(Number(await ambient.getAttribute('data-volume')), expected.ambient); await p.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="ambient"]'); return a && !a.paused && a.currentTime > 0; }); }
  return { id, ...expected };
}
async function playerRoute(url, project, branch) {
  const contract = rainRouteContract(project, branch), context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), p = await context.newPage(); watch(p);
  await p.goto(url); await button(p, '打开玩家设置').click(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await p.getByLabel('静音全部声音', { exact: true }).check(); await button(p, '返回故事').click(); await button(p, '开始故事').click();
  const byText = new Map(Object.values(project.scripts).flatMap(script => script.statements).filter(row => ['narration', 'dialogue'].includes(row.kind)).map(row => [row.text, row]));
  const texts = [], voices = [], observations = [], saves = [];
  for (let i = 0; i < 260 && await p.locator('main').getAttribute('data-player-status') !== 'ended'; i++) {
    if (await p.locator('.player-choice button').count()) { await p.locator('.player-choice button').nth(branch).click(); continue; }
    await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); const text = (await p.locator('.player-dialogue__text').innerText()).trim(), row = byText.get(text); assert.ok(row); if (texts.at(-1) !== row.id) texts.push(row.id);
    const audio = p.locator('audio[data-audio-bus="voice"]'); if (await audio.count()) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); const proof = await audio.evaluate(a => ({ ended: a.ended, duration: a.duration, currentTime: a.currentTime, error: a.error?.code ?? null })); assert.equal(proof.ended, true); assert.ok(proof.duration > 0 && proof.currentTime > 0); assert.equal(proof.error, null); voices.push({ id: row.id, ...proof }); }
    if (stages[row.id]) {
      let expected = stages[row.id]; if (baselineMode && expected.background.startsWith('new_city_room_')) expected = { ...expected, background: expected.background.endsWith('night') ? 'night_studio' : 'morning_studio' };
      observations.push(await stage(p, row.id, expected));
      if (['stmt_ui_164', 'stmt_ui_203', 'stmt_ui_219', 'stmt_ui_248'].includes(row.id)) {
        for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) { await p.setViewportSize(size); await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); const ratio = await p.locator('.player-stage-world').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; }); assert.ok(Math.abs(ratio - 16 / 9) < .01); await shot(p, `route-${branch}-${row.id}-${size.width}`); } await p.setViewportSize({ width: 390, height: 844 });
      }
      if (!baselineMode && ['stmt_ui_164', 'stmt_ui_219', 'stmt_ui_248'].includes(row.id)) {
        const hash = await p.locator('main').getAttribute('data-runtime-state-hash'), cursor = await p.locator('main').getAttribute('data-history-cursor'); await button(p, '打开阅读菜单').click(); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); const menu = p.getByRole('dialog', { name: '阅读菜单', exact: true }); if (await menu.isVisible()) await menu.getByRole('button', { name: '返回故事', exact: true }).click(); await button(p, '打开阅读菜单').click(); await button(p, '后退一步').click(); await p.reload(); await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click(); if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); assert.equal(await p.locator('main').getAttribute('data-runtime-state-hash'), hash); assert.equal(await p.locator('main').getAttribute('data-history-cursor'), cursor); await stage(p, row.id, expected); saves.push({ id: row.id, hash, cursor, background: expected.background, explicitReloadLoad: true });
      }
    }
    await button(p, '继续下一句').click();
  }
  assert.deepEqual(texts, contract.texts); assert.deepEqual(voices.map(row => row.id), contract.voices); assert.equal(texts.length, 66); assert.equal(voices.length, 6); assert.equal(await p.locator('main').getAttribute('data-player-status'), 'ended'); const ending = await p.locator('.player-ending').innerText(); assert.ok(ending.includes(contract.ending)); routes.push({ entry: 'website', branch, texts, voices, observations, saves, ending }); check(`complete-route-${branch}-six-native-voices-authored-room-stages${baselineMode ? '-original' : '-and-save-reopen'}`); await context.close();
}
async function rejectOldBackup(url) {
  const p = await browser.newPage(); watch(p); await p.goto(url); await button(p, '读取存档').click(); const panel = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '备份', exact: true }).click();
  const keys = () => p.evaluate(() => new Promise((resolve, reject) => { const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots', 'readonly'), get = tx.objectStore('save-slots').getAllKeys(); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); tx.oncomplete = () => db.close(); }; }));
  const before = await keys(), file = path.join(root, 'evidence/web-reading-motion/work/original-1.11.0.worldsave'); await panel.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(file); await panel.getByRole('alert').waitFor(); const message = await panel.getByRole('alert').innerText(); assert.match(message, /版本|构建|不兼容|不同|匹配/u); assert.equal(await panel.getByRole('button', { name: '导入到所选槽位', exact: true }).count(), 0); assert.equal(await p.locator('main').getAttribute('data-player-status'), 'title'); assert.deepEqual(await keys(), before); await shot(p, 'old-1.11-backup-refused'); check('actual-1.11-backup-refused-before-slot-write-with-old-game-preserved', { backupSha256: sha(await readFile(file)), message, before }); await p.close();
}
try {
  if (authorMode) await author();
  else {
    const folder = baselineMode ? path.join(root, 'evidence/web-reading-motion') : output, website = unzipSync(await readFile(path.join(folder, 'before-rain-stops-website.zip'))), project = readGamePayload(Buffer.from(website['index.html']).toString()).project;
    assert.equal(project.manifest.preservedFields.webPublication.version, baselineMode ? '1.11.0' : version);
    server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = website[name], headers = { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.wav': 'audio/wav' })[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }, range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? ''); if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); } res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing'); }); await listenBrowserLoopback(server);
    const url = `http://127.0.0.1:${server.address().port}/gal/`; await playerRoute(url, project, 0); await playerRoute(url, project, 1); if (!baselineMode) await rejectOldBackup(url);
  }
  for (const row of retained) assert.equal(sha(await readFile(path.join(root, row.file))), row.sha256); assert.deepEqual(errors, []);
} catch (error) { errors.push(String(error?.stack ?? error)); if (current && !current.isClosed()) await shot(current, 'failure').catch(() => {}); }
finally { await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } for (const row of code) if (sha((await readFile(path.join(root, row.file), 'utf8')).replaceAll('\r\n', '\n')) !== row.sha256) errors.push(`Source changed during run: ${row.file}`); await writeFile(reportPath, JSON.stringify({ passed: errors.length === 0, baseline: baselineMode, author: authorMode, engine, checks, routes, productions, retained, code, errors, scope: authorMode ? 'Actual source/image/ledger/note authoring, two entry routes, save-close-reopen, dual game exports and private production fresh-context restore. Notes remain fixed, not approved. New 1.12 visual content deliberately refuses 1.11 saves.' : 'Actual complete website routes and native muted voice endings, authored room/character/rain states and responsive stage screenshots; candidate includes explicit save/reload/load and old-content rejection. No natural human reading/listening/timing, physical phone/Safari, public hosting, permission approval or long soak. Full format/route matrix is separate.' }, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ report: path.relative(root, reportPath), passed: errors.length === 0, checks: checks.length, errors })); }
if (errors.length) process.exitCode = 1;

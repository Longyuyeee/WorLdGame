import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { json, sha } from './audit-rain-story-refinement.mjs';
import { auditArtifacts, auditSource, auditNotes, output, baseline } from './audit-rain-story-plans-and-farewell.mjs';
import { version, revision, rainCue, issues, stages } from '../assets/rain-story/editorial-v1.11.mjs';
import { choice } from '../assets/rain-story/editorial-v1.10.mjs';
import { voiceBeats } from '../assets/rain-story/editorial-v1.7.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
await mkdir(output, { recursive: true }); const baselineOnly = process.argv.includes('--baseline-only'), playOnly = process.argv.includes('--play-only'), report = path.join(output, baselineOnly ? 'baseline.json' : playOnly ? 'player-only-checks.json' : 'browser-checks.json');
if (!baselineOnly && !playOnly) for (const name of ['before-rain-stops-project.zip', 'before-rain-stops.html', 'before-rain-stops-website.zip', 'before-rain-stops.worldreview']) {
  try { await access(path.join(output, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  throw Error('Refusing to overwrite an existing candidate. Use --play-only for those bytes or STUDIO_STORY_PLANS_OUTPUT_DIRECTORY for a fresh authoring directory.');
}
await writeFile(report, JSON.stringify({ passed: false, status: 'running' }));
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] }), page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
let current = page, server, temporary; const checks = [], errors = [], editorRoutes = [], playerRoutes = [], productions = [];
page.on('pageerror', e => errors.push(String(e))); page.setDefaultTimeout(30000);
const button = (p, name) => p.getByRole('button', { name, exact: true });
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const view = name => page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name, exact: true }).click();
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log('PASS ' + name); };
async function scene(name) { await nav('故事'); if (!await page.locator('.scene-rail').isVisible()) await button(page, '场景列表').click(); await page.locator('.scene-rail').getByRole('button').filter({ hasText: name }).click(); }
async function projectMenu(name) { await ready(); if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function download(action, filename) { const pending = page.waitForEvent('download'); await action(); const bytes = await readFile(await (await pending).path()); if (filename) await writeFile(path.join(output, filename), bytes); return bytes; }
async function nextEditor() { const before = await page.getByTestId('preview-step').getAttribute('data-statement-id'); await button(page, '继续故事').click(); await page.waitForFunction(id => document.querySelector('[data-testid="preview-step"]')?.dataset.statementId !== id, before); }
async function runSceneTo(id) {
  if (await button(page, '打开预览').count()) await button(page, '打开预览').click(); const options = page.locator('.preview-run-options'); if (!await options.evaluate(el => el.open)) await options.locator('summary').click();
  await button(page, '从当前场景运行').click(); for (let i = 0; i < 100 && await page.getByTestId('preview-step').getAttribute('data-statement-id') !== id; i++) await nextEditor();
  assert.equal(await page.getByTestId('preview-step').getAttribute('data-statement-id'), id); await page.waitForFunction(() => document.querySelector('[data-testid="preview-stage"]')?.dataset.hostCommitPending === 'false' && !document.querySelector('.stage-media-loading'));
}
async function fullEditorRoute(branch) {
  await nav('检查'); const board = page.getByRole('region', { name: '试玩校订清单', exact: true }), search = board.locator('.review-search');
  if (!await search.evaluate(el => el.open)) await search.locator('summary').click(); await page.getByLabel('搜索校订记录', { exact: true }).fill('白天到站');
  await board.locator('[data-review-id="e8ab111c-725b-469b-b03c-1efadf0ea7f7"]').getByRole('button', { name: '定位原文', exact: true }).click();
  await page.getByLabel('校订复测范围', { exact: true }).selectOption('entry');
  await page.getByRole('region', { name: '当前校订任务', exact: true }).getByRole('button', { name: /^(?:重新)?从故事开头复测$/u }).click();
  const ids = [];
  for (let i = 0; i < 400 && !await page.locator('.playable-preview--ended').count(); i++) {
    const id = await page.getByTestId('preview-step').getAttribute('data-statement-id'); if (ids.at(-1) !== id) ids.push(id);
    const options = page.getByTestId('preview-step').locator('.choice-preview button'); if (await options.count()) await options.nth(branch).click(); else await nextEditor();
  }
  assert.equal(await page.locator('.playable-preview--ended').count(), 1); editorRoutes.push({ branch, ids, ending: await page.getByTestId('preview-step').innerText() }); await shot(page, `editor-route-${branch}-ending`);
}
async function author() {
  const index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), index); const servedBuild = {};
  for (const [, asset] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) { const bytes = await readFile(path.join(root, 'apps/editor/dist', asset)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(asset, ui))).arrayBuffer())), sha(bytes)); servedBuild[asset] = sha(bytes); }
  await page.goto(ui); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops-project.zip')); await ready();
  await nav('检查'); await page.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops.worldreview')); await button(page, '待跟进 23').waitFor();
  for (const issue of issues) {
    await scene(issue.scene); await view('写作'); await page.locator(`#statement-card-${issue.statementId}`).click(); await runSceneTo(issue.statementId); await shot(page, 'editor-before-' + issue.statementId);
    await button(page, '记录问题').click(); await page.getByLabel('校订问题描述', { exact: true }).fill(issue.reason); await page.getByLabel('校订问题类型', { exact: true }).selectOption(issue.category); await button(page, '保存校订记录').click(); await button(page, '退出试玩').click();
  }
  await scene(revision.scene); await view('写作'); await page.locator(`#statement-card-${revision.statementId}`).click(); const field = page.getByLabel('旁白文本', { exact: true }); assert.equal(await field.inputValue(), revision.original); await field.fill(revision.text); await field.blur();
  await page.waitForFunction(() => document.querySelector('[aria-label="旁白文本"]')?.dataset.inputState === 'committed');
  await button(page, '撤销').click(); await page.waitForFunction(text => document.querySelector('[aria-label="旁白文本"]')?.value === text, revision.original); await button(page, '重做').click(); await page.waitForFunction(text => document.querySelector('[aria-label="旁白文本"]')?.value === text, revision.text);
  await scene('再一次见面'); await view('脚本'); const input = page.getByLabel('权威脚本编辑器', { exact: true }), before = await input.inputValue();
  const after = before.split('\n').flatMap(line => /@(?:s)?id\(stmt_ui_246\)/u.test(line) ? ['@audio ' + rainCue.summary + ' @id(' + rainCue.id + ')', line] : [line]).join('\n'); assert.notEqual(after, before);
  await input.fill(after); await input.press('Control+s'); await page.waitForFunction(() => document.querySelector('.script-editor')?.dataset.inputState === 'committed'); await page.locator('.diagnostics-console.is-clear').waitFor();
  await button(page, '撤销').click(); await page.waitForFunction(value => document.querySelector('.script-editor')?.value === value, before); await button(page, '重做').click(); await page.waitForFunction(value => document.querySelector('.script-editor')?.value === value, after);
  await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill(version); await button(page, '应用发布设置').click(); const compatibility = page.locator('.web-save-compatibility'); await compatibility.locator('summary').click();
  await compatibility.getByLabel('核对上一版工程 ZIP', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops-project.zip')); await compatibility.getByText(/作品内容有变化：/u).waitFor(); await shot(page, 'content-change-refuses-1.10-save-approval');
  await nav('检查'); const board = page.getByRole('region', { name: '试玩校订清单', exact: true }), search = board.locator('.review-search'); if (!await search.evaluate(el => el.open)) await search.locator('summary').click(); await page.getByLabel('搜索校订记录', { exact: true }).fill(''); await board.getByRole('button', { name: '待跟进 25', exact: true }).click();
  while (await board.getByRole('button', { name: '标记已修改', exact: true }).count()) await board.getByRole('button', { name: '标记已修改', exact: true }).first().click();
  const notes = await download(() => board.getByRole('button', { name: '导出校订记录', exact: true }).click(), 'before-rain-stops.worldreview'); auditNotes(json(await readFile(path.join(baseline, 'before-rain-stops.worldreview'))), json(notes));
  check('actual-editor-two-issues-own-branch-plan-and-rain-authored-with-undo-redo', { servedBuild });
  await fullEditorRoute(0); await fullEditorRoute(1); assert.notEqual(editorRoutes[0].ending, editorRoutes[1].ending); await nav('检查'); await page.getByRole('region', { name: '结局试玩进度', exact: true }).getByText('当前版本已从开头到达 2 / 2 个结局', { exact: true }).waitFor();
  await nav('故事'); await ready(); await page.locator('.local-save-button').click(); await page.locator('.local-save-button--saved').waitFor(); await projectMenu('所有项目'); await page.reload(); await button(page, '打开项目：雨停之前').click(); await ready();
  const source = await download(() => projectMenu('导出工程 ZIP'), 'before-rain-stops-project.zip'); check('both-editor-entry-routes-save-reopen-and-exact-source-delta', auditSource(unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), unzipSync(source)));
  await nav('发布'); await button(page, '继续：导出方式 →').click(); let production;
  for (const format of ['html', 'website']) {
    await page.locator(`input[name="publication-format"][value="${format}"]`).check(); for (const label of ['同时生成制作交付包', '附带校订记录', '附带试玩进度']) await page.getByLabel(label, { exact: true }).check();
    await button(page, '继续：生成游戏 →').click(); await page.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(page, format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP').click();
    const link = page.getByRole('link', { name: format === 'html' ? '下载游戏' : '下载网站上传包', exact: true }); await link.waitFor({ timeout: 90000 }); await download(() => link.click(), format === 'html' ? 'before-rain-stops.html' : 'before-rain-stops-website.zip');
    production = await download(() => page.getByRole('link', { name: '下载制作交付包', exact: true }).click()); const files = unzipSync(production), manifest = json(files['delivery.json']); assert.equal(manifest.publication.version, version); assert.equal(sha(files['source/project.zip']), sha(source)); assert.deepEqual(json(files[manifest.reviewEntry]), json(notes)); assert.equal(json(files[manifest.progressEntry]).completions.length, 2); productions.push({ format, bytes: production.length, sha256: sha(production), pendingNotes: 25, entryCompletions: 2 });
    if (format === 'html') await button(page, '← 导出方式').click();
  }
  const productionFile = path.join(temporary, 'production.zip'); await writeFile(productionFile, production); const restored = await browser.newPage(); current = restored; restored.on('pageerror', error => errors.push(String(error))); await restored.goto(ui); await restored.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(productionFile); await restored.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  const pending = restored.waitForEvent('download'); await restored.getByLabel('项目菜单', { exact: true }).click(); await restored.getByRole('button', { name: /导出工程 ZIP/u }).click(); assert.equal(sha(await readFile(await (await pending).path())), sha(source)); await restored.close(); current = page;
  check('dual-game-exports-and-private-production-roundtrip-with-25-pending-notes-and-two-entry-receipts');
}
async function quickLoad(p) {
  await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click(); if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
}
async function playerRoute(url, branch, source, baselineRun = false) {
  const phone = branch === 1, context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: phone, reducedMotion: 'reduce' }), p = await context.newPage(); current = p; p.setDefaultTimeout(30000); p.on('pageerror', e => errors.push(String(e)));
  const statements = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, b]) => json(b).statements), byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  const main = p.locator('main'), hash = () => main.getAttribute('data-runtime-state-hash'), ids = [], voices = new Set(), observations = [], saves = [];
  await p.goto(url); await button(p, '打开玩家设置').click(); await p.getByLabel('静音全部声音', { exact: true }).check(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button(p, '返回故事').click();
  if (url.startsWith('http')) { await p.locator('#offline-panel > summary').click(); await button(p, '下载离线内容').click(); await p.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 }); await context.setOffline(true); assert.equal((await p.reload()).fromServiceWorker(), true); }
  await button(p, '开始故事').click();
  for (let step = 0; step < 260 && await main.getAttribute('data-player-status') !== 'ended'; step++) {
    const options = p.locator('.player-choice button'); if (await options.count()) { assert.deepEqual((await options.allInnerTexts()).map(text => text.replace(/^\d+\s*/u, '')), choice.labels); await options.nth(branch).click(); continue; }
    await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); const text = (await p.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(text); assert.ok(statement); if (ids.at(-1) !== statement.id) ids.push(statement.id);
    if (await p.locator('audio[data-audio-bus="voice"]').count()) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(statement.id); }
    const beat = voiceBeats.find(row => row.line === statement.id); if (beat) assert.equal(ids.at(-2), beat.after);
    if (stages[statement.id] && !observations.some(row => row.id === statement.id)) {
      const expected = { ...stages[statement.id], ...(baselineRun && statement.id === 'stmt_ui_246' ? { ambient: 0.1 } : {}) };
      assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), expected.background); assert.deepEqual(await p.locator('.player-stage-character').evaluateAll(els => els.map(el => el.dataset.assetId)), expected.portraits);
      const ambient = p.locator('audio[data-audio-bus="ambient"]'); if (expected.ambient === null) assert.equal(await ambient.count(), 0); else { assert.equal(Number(await ambient.getAttribute('data-volume')), expected.ambient); assert.equal(await ambient.getAttribute('data-asset-id'), 'soft_rain'); await p.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="ambient"]'); return a && !a.paused && a.currentTime > 0; }); }
      if (statement.id === revision.statementId) { assert.equal(text, baselineRun ? revision.original : revision.text); assert.equal(ids.includes('stmt_ui_133'), false); }
      observations.push({ id: statement.id, ...expected, text });
      for (const viewport of phone ? [{ width: 390, height: 844 }, { width: 844, height: 390 }] : [{ width: 1280, height: 900 }]) { await p.setViewportSize(viewport); await shot(p, `${baselineRun ? 'baseline' : 'player-' + branch}-${statement.id}-${viewport.width}`); }
      if (phone) await p.setViewportSize({ width: 390, height: 844 });
    }
    if (!baselineRun && ['stmt_ui_137', 'stmt_ui_217', 'stmt_ui_246'].includes(statement.id) && !saves.some(s => s.id === statement.id)) {
      const saved = await hash(), cursor = await main.getAttribute('data-history-cursor'); await button(p, '打开阅读菜单').click(); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button(p, '返回故事').click(); await button(p, '打开阅读菜单').click(); await button(p, '后退一步').click(); await p.waitForFunction(value => document.querySelector('main')?.dataset.runtimeStateHash !== value, saved);
      await p.reload(); await quickLoad(p); assert.equal(await hash(), saved); assert.equal(await main.getAttribute('data-history-cursor'), cursor); await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); assert.equal((await p.locator('.player-dialogue__text').innerText()).trim(), text);
      if (statement.id === 'stmt_ui_246') { assert.equal(await p.locator('.player-stage-character').count(), 0); assert.equal(Number(await p.locator('audio[data-audio-bus="ambient"]').getAttribute('data-volume')), 0.06); await p.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="ambient"]'); return a && !a.paused && a.currentTime > 0; }); }
      saves.push({ id: statement.id, savedHash: saved, cursor });
    }
    await button(p, '继续下一句').click();
  }
  const titles = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch ? ['远行', '车窗与海', '再一次见面'] : ['留下', '灯下的回信', '雨后的天明'])];
  const scenes = Object.entries(source).filter(([name]) => name.startsWith('scenes/')).map(([, bytes]) => json(bytes));
  const scripts = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).map(([, bytes]) => json(bytes));
  assert.deepEqual(ids, titles.flatMap(title => scripts.find(s => s.sceneId === scenes.find(scene => scene.title === title).id).statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id)));
  assert.deepEqual(observations.map(row => row.id), branch ? Object.keys(stages) : []);
  if (!baselineRun) assert.deepEqual(saves.map(row => row.id), branch ? ['stmt_ui_217', 'stmt_ui_246'] : ['stmt_ui_137']);
  assert.equal(await main.getAttribute('data-player-status'), 'ended'); assert.equal(ids.length, 66); assert.equal(voices.size, 6); const ending = await p.locator('.player-ending').innerText(); await shot(p, `${baselineRun ? 'baseline' : 'player-' + branch}-ending`);
  playerRoutes.push({ branch, ids, voices: [...voices], ending, observations, saves }); check(baselineRun ? 'actual-1.10-route-lacks-own-fallback-plan-and-keeps-platform-rain-after-farewell' : `complete-${phone ? 'offline-phone-website' : 'local-html'}-route-${branch}-native-voices-and-save-reopen`, { texts: ids.length, voices: voices.size, saves, observations }); await context.close(); current = page;
}
async function rejectOldBackup(url) {
  const p = await browser.newPage(); current = p; p.on('pageerror', e => errors.push(String(e))); await p.goto(url); await button(p, '读取存档').click(); const panel = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '备份', exact: true }).click();
  const slotKeys = () => p.evaluate(async () => { const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); try { return await new Promise((resolve, reject) => { const r = db.transaction('save-slots').objectStore('save-slots').getAllKeys(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); } finally { db.close(); } });
  const before = await slotKeys(); await panel.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(path.join(root, 'evidence/web-reading-delivery/work/original-1.10.0.worldsave')); await panel.getByRole('alert').waitFor();
  assert.equal(await panel.getByRole('button', { name: '导入到所选槽位', exact: true }).count(), 0); assert.equal(await p.locator('main').getAttribute('data-player-status'), 'title'); const after = await slotKeys(); assert.deepEqual(after, before); await shot(p, '1.10-backup-refused-without-slot-write'); check('actual-1.10-backup-refused-before-slot-write-for-changed-content', { message: await panel.getByRole('alert').innerText(), before, after }); await p.close(); current = page;
}
const retainedFiles = ['evidence/web-reading-delivery/before-rain-stops.html', 'evidence/web-reading-delivery/before-rain-stops-website.zip', 'evidence/web-story-arrival-and-night/before-rain-stops-project.zip', 'evidence/web-story-arrival-and-night/before-rain-stops.worldreview'];
const retained = await Promise.all(retainedFiles.map(async file => ({ file, sha256: sha(await readFile(path.join(root, file))) })));
try {
  temporary = await mkdtemp(path.join(tmpdir(), 'world-story-plans-'));
  if (baselineOnly) await playerRoute(pathToFileURL(path.join(root, retainedFiles[0])).href, 1, unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), true);
  else {
    if (!playOnly) await author(); const { source, website, ...artifact } = await auditArtifacts(); await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(artifact, null, 2)); check('exact-source-notes-public-files-and-26-media-audit', artifact);
    await playerRoute(pathToFileURL(path.join(output, 'before-rain-stops.html')).href, 0, source);
    server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = website[name], headers = { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' })[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }, range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
      if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
      res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing'); }); await listenBrowserLoopback(server);
    const url = `http://127.0.0.1:${server.address().port}/gal/`; await playerRoute(url, 1, source); assert.notEqual(playerRoutes[0].ending, playerRoutes[1].ending); await rejectOldBackup(url);
  }
  for (const file of retained) assert.equal(sha(await readFile(path.join(root, file.file))), file.sha256); assert.deepEqual(errors, []);
  const scope = baselineOnly ? 'Unchanged original #393 1.10.0 HTML, full phone-sized travel route, native muted audio, actual missing own-branch fallback-plan context and 10% return rain. No authoring or new-candidate acceptance.' : (playOnly ? 'Revalidation of frozen candidate files only, no authoring, editor-route or private-production rerun. ' : 'Actual full-story UI content authoring, two editor entry routes and private package roundtrip. ') + 'Local HTML left route and offline phone-sized website travel route, 66 texts and six muted native voice completions each. Native environment audio state, public save/back/reload/read. Not human approval/listening/natural timing, a complete format/route/engine matrix, physical phone/Safari, old/new service-worker update, licensing, public deployment or long-soak acceptance.';
  await writeFile(report, JSON.stringify({ passed: true, baseline: baselineOnly, browser: browser.version(), checks, errors, editorRoutes, playerRoutes, productions, retained, scope }, null, 2));
} catch (error) { const stamp = new Date().toISOString().replace(/[:.]/gu, '-'); await writeFile(path.join(output, `failure-${stamp}.json`), JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); if (current && !current.isClosed()) await shot(current, 'failure-' + stamp); throw error; }
finally { await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (temporary) { assert.equal(path.dirname(temporary), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith('world-story-plans-')); await rm(temporary, { recursive: true, force: true }); } }

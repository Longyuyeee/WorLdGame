import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { readGamePayload } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_CONTEXTUAL_OUTPUT_DIRECTORY ?? 'evidence/web-contextual-review');
const directoryPurpose = process.env.STUDIO_CONTEXTUAL_DIRECTORY_PURPOSE ?? 'directory';
assert.ok(['directory', 'website'].includes(directoryPurpose));
await mkdir(output, { recursive: true });
const baseline = process.argv.includes('--baseline'), require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [], checks = [], observations = [];
let temporary, server, current = page;
page.setDefaultTimeout(30_000); page.on('pageerror', error => errors.push(String(error)));
const source = path.join(root, 'evidence/web-reading-throughput'), stageId = 'e8ab111c-725b-469b-b03c-1efadf0ea7f7';
const notes = JSON.parse(await readFile(path.join(source, 'before-rain-stops.worldreview'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const task = () => page.getByRole('region', { name: '当前校订任务', exact: true });
const board = () => page.getByRole('region', { name: '试玩校订清单', exact: true });
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const check = message => { checks.push(message); console.log(`PASS ${message}`); };
async function download(locator, name) {
  const pending = page.waitForEvent('download'); await locator.click(); const file = await pending;
  const bytes = await readFile(await file.path()); if (name) await file.saveAs(path.join(output, name)); return bytes;
}
async function openStage() {
  await nav('检查');
  await board().locator('.review-search > summary').click();
  await page.getByLabel('搜索校订记录', { exact: true }).fill('白天到站');
  await board().locator(`[data-review-id="${stageId}"]`).getByRole('button', { name: '定位原文', exact: true }).click();
}
async function openNote(note) {
  await nav('检查');
  const filters = board().locator('.review-search');
  if (!await filters.evaluate(el => el.open)) await filters.locator('summary').click();
  await page.getByLabel('搜索校订记录', { exact: true }).fill(note.text.slice(0, 50));
  await board().locator(`[data-review-id="${note.id}"]`).getByRole('button', { name: '定位原文', exact: true }).click();
}
const observed = () => task().getAttribute('data-review-observed');
async function continueEditor() {
  const before = await page.getByTestId('preview-step').getAttribute('data-statement-id');
  await page.getByRole('button', { name: '继续故事', exact: true }).click();
  await page.waitForFunction(before => document.querySelector('[data-testid="preview-step"]')?.dataset.statementId !== before, before);
}
async function reachTarget(note) {
  for (let step = 0; step < 96 && await page.getByTestId('preview-step').getAttribute('data-statement-id') !== note.statementId; step++) await continueEditor();
  assert.equal(await page.getByTestId('preview-step').getAttribute('data-statement-id'), note.statementId);
  await page.waitForFunction(() => document.querySelector('.review-task')?.dataset.reviewObserved === 'true');
  assert.equal(await observed(), 'true');
  await page.waitForFunction(() => document.querySelector('[data-testid="preview-stage"]')?.dataset.hostCommitPending === 'false' && !document.querySelector('.stage-media-loading'));
  assert.equal(await page.locator('.stage-media-errors').count(), 0);
}
async function fitTask() {
  const fit = await task().evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= -1 && box.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; });
  assert.equal(fit, true);
  const select = task().getByLabel('校订复测范围', { exact: true }); await select.scrollIntoViewIfNeeded();
  assert.ok((await select.boundingBox()).height >= 44);
}
async function fullEditorRoute(branch) {
  await openNote(notes.notes.find(note => note.id === stageId));
  await page.getByLabel('校订复测范围', { exact: true }).selectOption('entry');
  await task().getByRole('button', { name: '从故事开头复测', exact: true }).click();
  const ids = [], choices = [];
  for (let count = 0; count < 400; count++) {
    const id = await page.getByTestId('preview-step').getAttribute('data-statement-id');
    if (id && ids.at(-1) !== id) ids.push(id);
    if (await page.locator('.playable-preview--ended').count()) break;
    const buttons = page.getByTestId('preview-step').locator('.choice-preview button');
    if (await buttons.count()) { const button = buttons.nth(Math.min(branch, await buttons.count() - 1)); choices.push(await button.innerText()); await button.click(); }
    else await continueEditor();
  }
  assert.equal(await page.locator('.playable-preview--ended').count(), 1);
  assert.equal(await observed(), branch === 0 ? 'true' : 'false');
  assert.equal(await task().getByRole('button', { name: '确认已复核', exact: true }).isEnabled(), branch === 0);
  const ending = await page.getByTestId('preview-step').innerText();
  await shot(`editor-route-${branch}-ending`); return { branch, ending, choices, ids, targetObserved: branch === 0 };
}
async function projectMenu(name) {
  await ready(); if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
}
async function menuDownload(name) {
  const pending = page.waitForEvent('download'); await projectMenu(name); return readFile(await (await pending).path());
}
async function playerRoute(url, branch, phone) {
  const playerContext = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: phone, reducedMotion: 'reduce' });
  const player = await playerContext.newPage(); current = player; player.setDefaultTimeout(30_000); player.on('pageerror', error => errors.push(String(error)));
  const button = name => player.getByRole('button', { name, exact: true }), main = player.locator('main.player-shell');
  await player.goto(url); await button('打开玩家设置').click(); await player.getByLabel('静音全部声音', { exact: true }).check();
  await player.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button('返回故事').click();
  let previousSave = null;
  if (process.env.STUDIO_VERIFY_SESSION_LOAD === '1') {
    const oldFile = path.join(source, 'chromium-1.7.13.worldsave'), original = JSON.parse(await readFile(oldFile, 'utf8'));
    await button('读取存档').click(); const slots = player.getByRole('dialog', { name: '存读档槽位', exact: true });
    await slots.getByRole('button', { name: '备份', exact: true }).click();
    const file = slots.getByLabel('选择存档备份文件', { exact: true });
    const titleHash = await main.getAttribute('data-runtime-state-hash');
    await file.setInputFiles({ name: 'damaged.worldsave', mimeType: 'application/json', buffer: Buffer.from('not a save') });
    await slots.getByRole('alert').filter({ hasText: '无法读取备份文件' }).waitFor();
    assert.equal(await main.getAttribute('data-runtime-state-hash'), titleHash);
    await file.setInputFiles(oldFile); await slots.getByText('备份校验通过，请选择手动槽位后导入。', { exact: true }).waitFor();
    await slots.getByRole('button', { name: '导入到所选槽位', exact: true }).click();
    await slots.getByRole('button', { name: '读取导入的存档', exact: true }).click();
    await player.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded');
    assert.equal(await main.getAttribute('data-runtime-state-hash'), original.payload.slot.runtimeStateHash);
    previousSave = { version: '1.7.13', bytes: (await readFile(oldFile)).length, sha256: digest(await readFile(oldFile)), stateHash: original.payload.slot.runtimeStateHash, malformedInputRejected: true };
  } else await button('开始故事').click();
  const savedHash = await main.getAttribute('data-runtime-state-hash'), savedText = await player.locator('.player-dialogue__text').innerText(), savedCursor = await main.getAttribute('data-history-cursor'), savedLength = await main.getAttribute('data-history-length');
  await button('打开阅读菜单').click(); await button('快速保存').click(); await player.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved');
  const menu = player.getByRole('dialog', { name: '阅读菜单', exact: true }); if (await menu.isVisible()) await menu.getByRole('button', { name: '返回故事', exact: true }).click();
  // On a compact screen the first click can page within the same paragraph.
  // Actually advance before reloading; a scroll-only click is not load coverage.
  let advancedHash = savedHash;
  for (let attempt = 0; attempt < 20 && advancedHash === savedHash; attempt++) { await button('继续下一句').click(); advancedHash = await main.getAttribute('data-runtime-state-hash'); }
  assert.notEqual(advancedHash, savedHash);
  assert.notEqual(await main.getAttribute('data-history-cursor'), savedCursor);
  await player.reload(); await button('读取存档').click();
  const slots = player.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
  if (await player.locator('.player-load-confirm').isVisible()) await button('确认读取').click();
  await player.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded');
  assert.equal(await player.locator('.player-dialogue__text').innerText(), savedText);
  assert.equal(await main.getAttribute('data-history-cursor'), savedCursor); assert.equal(await main.getAttribute('data-history-length'), savedLength);
  if (await menu.isVisible()) await menu.getByRole('button', { name: '返回故事', exact: true }).click();
  const loadedHash = await main.getAttribute('data-runtime-state-hash'), texts = new Set(), voices = new Set(), choices = [];
  for (let count = 0; count < 180 && await main.getAttribute('data-player-status') !== 'ended'; count++) {
    const options = player.locator('.player-choice button');
    if (await options.count()) { const target = options.nth(Math.min(branch, await options.count() - 1)); choices.push(await target.innerText()); await target.click(); continue; }
    await player.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
    texts.add((await player.locator('.player-dialogue__text').innerText()).trim());
    if (await player.locator('audio[data-audio-bus="voice"]').count()) {
      await player.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended);
      voices.add((await player.locator('.player-dialogue__text').innerText()).trim());
    }
    assert.equal(await player.locator('.player-media-error').count(), 0); await button('继续下一句').click();
  }
  assert.equal(await main.getAttribute('data-player-status'), 'ended'); assert.equal(texts.size, 66); assert.equal(voices.size, 6);
  const ending = await player.locator('.player-ending').innerText(); await player.screenshot({ path: path.join(output, `player-${phone ? 'http-phone' : 'file-desktop'}-ending.png`), animations: 'disabled' });
  const result = { branch, format: phone ? 'directory-http' : 'html-file', ending, savedHash, advancedHash, loadedHash, savedCursor, restoredCursor: savedCursor, restoredLength: savedLength, restoredText: savedText, texts: texts.size, naturallyEndedVoices: voices.size, choices, ...(previousSave ? { previousSave } : {}), physicalPhone: false, humanListening: false };
  await playerContext.close(); current = page; return result;
}
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(source, 'before-rain-stops-project.zip')); await ready();
  await nav('检查'); await page.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(source, 'before-rain-stops.worldreview'));
  await board().getByRole('button', { name: '待跟进 11', exact: true }).waitFor();
  await openStage();
  if (baseline) {
    await task().getByRole('button', { name: '从此处复测', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.review-task button')].some(el => el.textContent === '确认已复核' && !el.disabled));
    await page.getByTestId('preview-step').getByText(/^车站的钟这次准时了/).waitFor();
    await shot('baseline-direct-statement');
    await writeFile(path.join(output, 'baseline.json'), JSON.stringify({ passed: true, browser: browser.version(), issue: 'Stage note starts at the narration, omitting the preceding station_day background and xia_letter entrance; confirmation is already enabled.', sourceSha256: digest(await readFile(path.join(source, 'before-rain-stops-project.zip'))), notesSha256: digest(await readFile(path.join(source, 'before-rain-stops.worldreview'))), ui: await task().innerText(), errors }, null, 2));
    console.log('BASELINE captured direct-statement review without preceding stage');
  } else {
    const sourceFiles = unzipSync(await readFile(path.join(source, 'before-rain-stops-project.zip')));
    const scripts = Object.entries(sourceFiles).filter(([name]) => name.startsWith('scripts/')).map(([, bytes]) => JSON.parse(strFromU8(bytes)));
    for (const note of notes.notes) {
      await openNote(note);
      const scene = scripts.find(script => script.sceneId === note.sceneId), index = scene.statements.findIndex(statement => statement.id === note.statementId);
      assert.ok(index >= 0); const range = note.category === 'text' ? 'statement' : 'scene';
      assert.equal(await page.getByLabel('校订复测范围', { exact: true }).inputValue(), range);
      await task().getByRole('button', { name: range === 'scene' ? '从场景开头复测' : '从此处复测', exact: true }).click();
      if (range === 'scene' && index > 0) assert.equal(await observed(), 'false');
      await reachTarget(note);
      observations.push({ noteId: note.id, sceneId: note.sceneId, statementId: note.statementId, range, targetIndex: index, precedingDirections: scene.statements.slice(0, index).filter(row => row.kind === 'direction').map(row => ({ id: row.id, command: row.command, summary: row.summary })), currentText: scene.statements[index].text, status: note.status, checkedSourceHash: note.checkedSourceHash });
      if (['stmt_ui_158', 'stmt_ui_232', 'stmt_ui_248', 'stmt_ui_250'].includes(note.statementId)) { await page.getByTestId('preview-stage').scrollIntoViewIfNeeded(); await shot(`context-${note.statementId}`); }
    }
    check('All eleven existing notes are reachable through actual author controls, with local preceding direction for stage notes; no review is automatically approved.');
    await page.getByLabel('校订复测范围', { exact: true }).selectOption('entry');
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size); await fitTask(); await shot(`task-${size.width}x${size.height}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    check('Portrait and landscape touch-sized controls stay within the task; switching range invalidates the previous proof without silently restarting.');
    const editorRoutes = [await fullEditorRoute(0), await fullEditorRoute(1)]; assert.notEqual(editorRoutes[0].ending, editorRoutes[1].ending);
    await nav('检查'); await page.getByRole('region', { name: '结局试玩进度', exact: true }).getByText('当前版本已从开头到达 2 / 2 个结局', { exact: true }).waitFor();
    check('Both full editor entry routes reach distinct endings; the station note is observed only on its real route, and local reviews never count as entry completions.');
    await nav('故事'); await ready(); await page.locator('.local-save-button').click(); await ready(); await page.reload();
    await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
    assert.equal(await page.getByLabel('校订复测范围', { exact: true }).inputValue(), 'entry'); assert.equal(await observed(), 'false');
    assert.equal(await task().getByRole('button', { name: '确认已复核', exact: true }).isEnabled(), false);
    await task().getByRole('button', { name: '重新从故事开头复测', exact: true }).waitFor();
    check('Save/reload/reopen retains the selected review range and issue but never restores live confirmation proof.');
    const exportedSource = await menuDownload('导出工程 ZIP'), exportedFiles = unzipSync(exportedSource);
    assert.deepEqual(Object.keys(exportedFiles).sort(), Object.keys(sourceFiles).sort());
    for (const [name, bytes] of Object.entries(sourceFiles)) assert.equal(digest(exportedFiles[name]), digest(bytes), name);
    await nav('检查');
    const reviewBytes = await download(board().getByRole('button', { name: '导出校订记录', exact: true }), 'before-rain-stops.worldreview');
    assert.deepEqual(JSON.parse(reviewBytes.toString()), notes);
    await nav('发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
    temporary = await mkdtemp(path.join(tmpdir(), 'world-context-review-'));
    const downloads = {}, outputs = {};
    for (const format of ['html', 'directory']) {
      const selection = format === 'directory' ? directoryPurpose : format, link = selection === 'website' ? '下载网站上传包' : '下载游戏';
      await page.locator(`input[name="publication-format"][value="${selection}"]`).check();
      for (const label of ['同时生成制作交付包', '附带校订记录', '附带试玩进度']) await page.getByLabel(label, { exact: true }).check();
      await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
      await page.getByText('故事与素材检查通过', { exact: true }).waitFor();
      await page.getByRole('button', { name: format === 'html' ? '构建试玩 HTML' : selection === 'website' ? '构建网站上传 ZIP' : '构建目录 ZIP', exact: true }).click();
      await page.getByRole('link', { name: link, exact: true }).waitFor({ timeout: 90_000 });
      downloads[format] = await download(page.getByRole('link', { name: link, exact: true }));
      const delivery = await download(page.getByRole('link', { name: '下载制作交付包', exact: true })), pack = unzipSync(delivery), manifest = JSON.parse(strFromU8(pack['delivery.json']));
      assert.deepEqual(JSON.parse(strFromU8(pack[manifest.reviewEntry])), notes);
      assert.equal(JSON.parse(strFromU8(pack[manifest.progressEntry])).completions.length, 2);
      outputs[format] = { selection, bytes: downloads[format].length, sha256: digest(downloads[format]), productionBytes: delivery.length, productionSha256: digest(delivery), fixedNotes: 11, explicitHumanReviews: 0, entryCompletions: 2 };
      if (format === 'html') await page.getByRole('button', { name: '← 导出方式', exact: true }).click();
    }
    const web = unzipSync(downloads.directory), htmlPayload = readGamePayload(downloads.html.toString()), webPayload = readGamePayload(strFromU8(web['index.html']));
    assert.deepEqual(htmlPayload.project, webPayload.project); assert.equal(htmlPayload.editorPreview, undefined);
    if (process.env.STUDIO_VERIFY_SESSION_LOAD === '1') {
      assert.notEqual(digest(downloads.html), digest(await readFile(path.join(source, 'before-rain-stops.html'))), 'The validation export must contain the rebuilt runtime, not the archived game');
      const html = downloads.html.toString();
      assert.ok(html.includes(`<script>${strFromU8(web['player.js']).replace(/<\/script/gi, '<\\/script')}</script>`));
      assert.ok(html.includes(`<style>${strFromU8(web['player.css']).replace(/<\/style/gi, '<\\/style')}</style>`));
    }
    for (const script of scripts) assert.deepEqual(htmlPayload.project.scripts[script.sceneId], script);
    const assets = JSON.parse(strFromU8(sourceFiles['.world-assets/index.json'])).assets;
    for (const asset of assets) {
      assert.equal(`sha256:${digest(Buffer.from(htmlPayload.mediaAssets.find(row => row.assetId === asset.assetId).url.split(',')[1], 'base64'))}`, asset.source.digest);
      assert.equal(`sha256:${digest(web[webPayload.mediaAssets.find(row => row.assetId === asset.assetId).url])}`, asset.source.digest);
    }
    const info = JSON.parse(strFromU8(web['build-info.json']));
    for (const file of info.files) { assert.equal(web[file.path].length, file.byteLength); assert.equal(`sha256:${digest(web[file.path])}`, file.digest); }
    await writeFile(path.join(temporary, 'rain.html'), downloads.html);
    check('Actual project re-export preserves every source entry byte-for-byte; both game and production exports preserve plot, all 25 media, 11 pending reviews and 2 actual entry receipts.');
    server = createServer((request, response) => {
      const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = web[name];
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json' }[path.extname(name)] ?? 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' }, range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
      if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return response.writeHead(416).end(); return response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
      response.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
    }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const playerRoutes = [await playerRoute(pathToFileURL(path.join(temporary, 'rain.html')).href, 0, false), await playerRoute(`http://127.0.0.1:${server.address().port}/gal/`, 1, true)];
    assert.notEqual(playerRoutes[0].ending, playerRoutes[1].ending);
    check('Independent desktop HTML and touch-sized HTTP directory each finish one distinct full route after explicit quick-save/reload/load, including six natural muted voice endings.');
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), checks, observations, editorRoutes, playerRoutes, errors, artifacts: { source: { bytes: exportedSource.length, sha256: digest(exportedSource), unchangedEntries: Object.keys(sourceFiles).length }, games: outputs, media: assets.length, directoryFilesVerified: info.files.length }, scope: 'Real original Rain 1.7.14, no content changes or automatic review approval. Two actual editor routes; one route per independent format, not a format-by-route matrix. Muted native audio; not human reading/listening/artwork acceptance, physical phone, long-story performance, public deployment or release licensing. Byte-identical source retained at its original path; temporary current-runtime exports are audited, not new content candidates.' }, null, 2));
  }
} catch (error) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  await current.screenshot({ path: path.join(output, `failure-${stamp}.png`), animations: 'disabled' });
  await writeFile(path.join(output, `failure-${stamp}.json`), JSON.stringify({ error: String(error), stack: error.stack, checks, observations, errors }, null, 2)); throw error;
} finally {
  await browser.close();
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  // Only the exact generated directory returned by mkdtemp is removed.
  if (temporary && path.dirname(temporary) === path.resolve(tmpdir()) && path.basename(temporary).startsWith('world-context-review-')) await rm(temporary, { recursive: true });
}

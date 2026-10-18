import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { json, sha } from './audit-rain-story-refinement.mjs';
import { auditArtifacts as auditContinuityArtifacts, auditSource as auditContinuitySource, auditNotes as auditContinuityNotes, output, baseline } from './audit-rain-story-arrival-and-night.mjs';
import { version as continuityVersion, revision, choice, nightCue, stages, issues as continuityIssues } from '../assets/rain-story/editorial-v1.10.mjs';
import { continuityStages as earlierStages } from '../assets/rain-story/editorial-v1.9.mjs';
const continuityTextRevisions = [revision], continuityStages = { ...earlierStages, ...stages };
import { voiceBeats } from '../assets/rain-story/editorial-v1.7.mjs';

const root = path.resolve(import.meta.dirname, '..'), ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] }), context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [], checks = [], editorRoutes = [], playerRoutes = [], snapshots = [];
let current = page, server, temporary, productionBytes, deployed;
const button = (p, name) => p.getByRole('button', { name, exact: true }), ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error)));
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const view = name => page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name, exact: true }).click();
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
async function scene(name) {
  await nav('故事'); if (!await page.locator('.scene-rail').isVisible()) await button(page, '场景列表').click();
  await page.locator('.scene-rail').getByRole('button').filter({ hasText: name }).click();
}
async function menu(name) { await ready(); if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function download(action, name) { const pending = page.waitForEvent('download'); await action(); const bytes = await readFile(await (await pending).path()); if (name) await writeFile(path.join(output, name), bytes); return bytes; }
async function continueEditor() {
  const before = await page.getByTestId('preview-step').getAttribute('data-statement-id'); await button(page, '继续故事').click();
  await page.waitForFunction(before => document.querySelector('[data-testid="preview-step"]')?.dataset.statementId !== before, before);
}
async function runSceneTo(id) {
  if (await button(page, '打开预览').count()) await button(page, '打开预览').click();
  const options = page.locator('.preview-run-options'); if (!await options.evaluate(el => el.open)) await options.locator('summary').click();
  await button(page, '从当前场景运行').click();
  for (let step = 0; step < 100 && await page.getByTestId('preview-step').getAttribute('data-statement-id') !== id; step++) await continueEditor();
  assert.equal(await page.getByTestId('preview-step').getAttribute('data-statement-id'), id);
  await page.waitForFunction(() => document.querySelector('[data-testid="preview-stage"]')?.dataset.hostCommitPending === 'false' && !document.querySelector('.stage-media-loading'));
}
async function recordIssue(revision) {
  await scene(revision.scene); await view('写作'); await page.locator(`#statement-card-${revision.statementId}`).click(); await runSceneTo(revision.statementId);
  await page.getByTestId('preview-stage').scrollIntoViewIfNeeded(); await shot(page, 'editor-before-' + revision.statementId);
  await button(page, '记录问题').click(); await page.getByLabel('校订问题描述', { exact: true }).fill(revision.reason);
  await page.getByLabel('校订问题类型', { exact: true }).selectOption(revision.category);
  await button(page, '保存校订记录').click(); await button(page, '退出试玩').click();
}
async function openNote(id) {
  await nav('检查'); const board = page.getByRole('region', { name: '试玩校订清单', exact: true }), filters = board.locator('.review-search');
  if (!await filters.evaluate(el => el.open)) await filters.locator('summary').click();
  await page.getByLabel('搜索校订记录', { exact: true }).fill('白天到站');
  await board.locator(`[data-review-id="${id}"]`).getByRole('button', { name: '定位原文', exact: true }).click();
}
async function fullEditorRoute(branch) {
  await openNote('e8ab111c-725b-469b-b03c-1efadf0ea7f7'); await page.getByLabel('校订复测范围', { exact: true }).selectOption('entry');
  const task = page.getByRole('region', { name: '当前校订任务', exact: true }); await task.getByRole('button', { name: /^(?:重新)?从故事开头复测$/u }).click();
  const ids = [], choices = [];
  for (let step = 0; step < 400; step++) {
    const id = await page.getByTestId('preview-step').getAttribute('data-statement-id'); if (id && ids.at(-1) !== id) ids.push(id);
    if (await page.locator('.playable-preview--ended').count()) break;
    const options = page.getByTestId('preview-step').locator('.choice-preview button');
    if (await options.count()) { const selected = options.nth(branch); choices.push(await selected.innerText()); await selected.click(); } else await continueEditor();
  }
  assert.equal(await page.locator('.playable-preview--ended').count(), 1); const ending = await page.getByTestId('preview-step').innerText();
  await shot(page, `editor-route-${branch}-ending`); editorRoutes.push({ branch, ending, ids, choices });
}
async function author() {
  const dist = path.join(root, 'apps/editor/dist'), html = await readFile(path.join(dist, 'index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), html);
  const build = {};
  for (const entry of [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)].map(match => match[1])) {
    const bytes = await readFile(path.join(dist, entry)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(entry, ui))).arrayBuffer())), sha(bytes)); build[entry] = sha(bytes);
  }
  await page.goto(ui); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops-project.zip')); await ready();
  await nav('检查'); await page.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops.worldreview'));
  await page.getByRole('region', { name: '试玩校订清单', exact: true }).getByRole('button', { name: '待跟进 19', exact: true }).waitFor();
  for (const revision of continuityIssues) await recordIssue(revision);
  check('four-new-issues-recorded-original-nineteen-preserved', { build });
  for (const revision of continuityTextRevisions) {
    await scene(revision.scene); await view('写作'); await page.locator(`#statement-card-${revision.statementId}`).click();
    const field = page.getByLabel('旁白文本', { exact: true }); assert.equal(await field.inputValue(), revision.original); await field.fill(revision.text); await field.blur();
    await page.waitForFunction(() => document.querySelector('[aria-label="旁白文本"]')?.dataset.inputState === 'committed');
    await page.locator(`#statement-card-${revision.statementId}`).filter({ hasText: revision.text }).waitFor();
  }
  for (const title of ['车站的雨', '车窗与海', '站台前的约定']) {
    await scene(title); await view('脚本'); const input = page.getByLabel('权威脚本编辑器', { exact: true }), before = await input.inputValue();
    let lines = before.split('\n');
    if (title === '车站的雨') { const appearance = lines.find(line => /@(?:s)?id\(stmt_ui_4\)/u.test(line)); assert.ok(appearance); lines = lines.filter(line => line !== appearance).flatMap(line => /@(?:s)?id\(stmt_ui_7\)/u.test(line) ? [appearance, line] : [line]); }
    if (title === '车窗与海') lines = lines.flatMap(line => /@(?:s)?id\(stmt_ui_219\)/u.test(line) ? ['@background ' + nightCue.summary + ' @id(' + nightCue.id + ')', line] : [line]);
    let after = lines.join('\n');
    if (title === '站台前的约定') { for (let i = 0; i < 2; i++) { assert.ok(after.includes(choice.original[i])); after = after.replace(choice.original[i], choice.labels[i]); } }
    assert.notEqual(after, before); await input.fill(after); await input.press('Control+s'); await page.waitForFunction(() => document.querySelector('.script-editor')?.dataset.inputState === 'committed'); await page.locator('.diagnostics-console.is-clear').waitFor();
    await button(page, '撤销').click(); await page.waitForFunction(value => document.querySelector('.script-editor')?.value === value, before);
    await button(page, '重做').click(); await page.waitForFunction(value => document.querySelector('.script-editor')?.value === value, after);
  }
  await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill(continuityVersion); await button(page, '应用发布设置').click();
  const compatibility = page.locator('.web-save-compatibility'); await compatibility.locator('summary').click();
  await compatibility.getByLabel('核对上一版工程 ZIP', { exact: true }).setInputFiles(path.join(baseline, 'before-rain-stops-project.zip')); await compatibility.getByText(/作品内容有变化：/u).waitFor();
  await shot(page, 'content-change-refuses-old-compatibility');
  check('appearance-night-photo-and-choice-intent-authored-with-undo-redo-and-1.9-content-compatibility-refused');
  await nav('检查'); const board = page.getByRole('region', { name: '试玩校订清单', exact: true });
  const search = board.locator('.review-search'); if (!await search.evaluate(el => el.open)) await search.locator('summary').click(); await page.getByLabel('搜索校订记录', { exact: true }).fill('');
  await board.getByRole('button', { name: '待跟进 23', exact: true }).click();
  while (await board.getByRole('button', { name: '标记已修改', exact: true }).count()) await board.getByRole('button', { name: '标记已修改', exact: true }).first().click();
  const noteBytes = await download(() => board.getByRole('button', { name: '导出校订记录', exact: true }).click(), 'before-rain-stops.worldreview');
  auditContinuityNotes(json(await readFile(path.join(baseline, 'before-rain-stops.worldreview'))), json(noteBytes));
  await fullEditorRoute(0); await fullEditorRoute(1); assert.notEqual(editorRoutes[0].ending, editorRoutes[1].ending);
  await nav('检查'); await page.getByRole('region', { name: '结局试玩进度', exact: true }).getByText('当前版本已从开头到达 2 / 2 个结局', { exact: true }).waitFor();
  await nav('故事'); await ready(); await page.locator('.local-save-button').click(); await page.locator('.local-save-button--saved').waitFor(); await menu('所有项目'); await page.reload(); await button(page, '打开项目：雨停之前').click(); await ready();
  const sourceBytes = await download(() => menu('导出工程 ZIP'), 'before-rain-stops-project.zip'); const story = auditContinuitySource(unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), unzipSync(sourceBytes));
  check('both-editor-entry-routes-two-endings-save-reopen-and-exact-planned-source-delta', story);
  await nav('发布'); await button(page, '继续：导出方式 →').click();
  for (const format of ['html', 'website']) {
    await page.locator(`input[name="publication-format"][value="${format}"]`).check();
    for (const label of ['同时生成制作交付包', '附带校订记录', '附带试玩进度']) await page.getByLabel(label, { exact: true }).check();
    await button(page, '继续：生成游戏 →').click(); await page.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(page, format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP').click();
    const link = page.getByRole('link', { name: format === 'html' ? '下载游戏' : '下载网站上传包', exact: true }); await link.waitFor({ timeout: 90000 });
    await download(() => link.click(), format === 'html' ? 'before-rain-stops.html' : 'before-rain-stops-website.zip');
    const production = await download(() => page.getByRole('link', { name: '下载制作交付包', exact: true }).click()), files = unzipSync(production), manifest = json(files['delivery.json']);
    assert.equal(manifest.publication.version, continuityVersion); assert.equal(sha(files['source/project.zip']), sha(sourceBytes)); assert.deepEqual(json(files[manifest.reviewEntry]), json(noteBytes));
    assert.equal(json(files[manifest.progressEntry]).completions.length, 2);
    snapshots.push({ kind: format, bytes: production.length, sha256: sha(production), notes: 23, realEntryCompletions: 2 }); productionBytes = production;
    if (format === 'html') await button(page, '← 导出方式').click();
  }
  const restored = await browser.newPage(); current = restored; restored.on('pageerror', error => errors.push(String(error)));
  const file = path.join(temporary, 'continuity-production.zip'); await writeFile(file, productionBytes); await restored.goto(ui); await restored.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(file);
  await restored.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); const pending = restored.waitForEvent('download');
  await restored.getByLabel('项目菜单', { exact: true }).click(); await restored.getByRole('button', { name: /导出工程 ZIP/u }).click(); assert.equal(sha(await readFile(await (await pending).path())), sha(sourceBytes));
  await restored.close(); current = page;
  check('actual-html-website-and-private-production-roundtrip-with-twenty-three-pending-notes-and-two-entry-receipts');
}
async function playerRoute(url, branch, phone, source) {
  const playerContext = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: phone, reducedMotion: 'reduce' });
  const p = await playerContext.newPage(); current = p; p.setDefaultTimeout(30000); p.on('pageerror', error => errors.push(String(error)));
  const main = p.locator('main.player-shell'), hash = () => main.getAttribute('data-runtime-state-hash');
  const statements = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => json(bytes).statements), byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  await p.goto(url); await button(p, '打开玩家设置').click(); await p.getByLabel('静音全部声音', { exact: true }).check(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button(p, '返回故事').click();
  if (url.startsWith('http')) { await p.locator('#offline-panel > summary').click(); await button(p, '下载离线内容').click(); await p.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 }); await playerContext.setOffline(true); assert.equal((await p.reload()).fromServiceWorker(), true); }
  await button(p, '开始故事').click(); const ids = [], voices = new Set(), stages = [], saves = [];
  for (let step = 0; step < 240 && await main.getAttribute('data-player-status') !== 'ended'; step++) {
    const options = p.locator('.player-choice button'); if (await options.count()) { assert.deepEqual((await options.allInnerTexts()).map(text => text.replace(/^\d+\s*/u, '')), choice.labels); await options.nth(branch).click(); continue; }
    await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
    const text = (await p.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(text); assert.ok(statement, `Unknown paragraph: ${text}`);
    if (ids.at(-1) !== statement.id) ids.push(statement.id);
    if (await p.locator('audio[data-audio-bus="voice"]').count()) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(statement.id); }
    const expected = continuityStages[statement.id];
    if (expected && !stages.some(row => row.id === statement.id)) {
      const actual = await p.locator('.player-stage-background').getAttribute('data-asset-id'), portraits = await p.locator('.player-stage-character').evaluateAll(elements => elements.map(el => el.dataset.assetId));
      assert.equal(actual, expected.background); assert.deepEqual(portraits, expected.portraits);
      const ambient = p.locator('audio[data-audio-bus="ambient"]');
      if (expected.ambient === null) assert.equal(await ambient.count(), 0); else { await ambient.waitFor({ state: 'attached' }); assert.equal(await ambient.getAttribute('data-asset-id'), 'soft_rain'); assert.equal(Number(await ambient.getAttribute('data-volume')), expected.ambient); await p.waitForFunction(() => { const audio = document.querySelector('audio[data-audio-bus="ambient"]'); return audio && !audio.paused && audio.currentTime > 0; }); }
      const ratio = await p.locator('.player-stage-world').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; }); assert.ok(Math.abs(ratio - 16 / 9) < .01);
      stages.push({ id: statement.id, ...expected, naturalPlaybackMuted: true });
      for (const size of phone ? [{ width: 390, height: 844 }, { width: 844, height: 390 }] : [{ width: 1280, height: 900 }]) { await p.setViewportSize(size); await shot(p, `player-${branch}-${statement.id}-${size.width}x${size.height}`); }
      if (phone) await p.setViewportSize({ width: 390, height: 844 });
    }
    const beat = voiceBeats.find(row => row.line === statement.id);
    if (beat) assert.equal(ids.at(-2), beat.after, 'Original dialogue beat order');
    if (['stmt_ui_137', 'stmt_ui_219', 'stmt_ui_238'].includes(statement.id) && !saves.some(row => row.id === statement.id)) {
      const savedHash = await hash(), cursor = await main.getAttribute('data-history-cursor'), length = await main.getAttribute('data-history-length'); await button(p, '打开阅读菜单').click(); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved');
      const menu = p.getByRole('dialog', { name: '阅读菜单', exact: true }); if (await menu.isVisible()) await menu.getByRole('button', { name: '返回故事', exact: true }).click();
      // Back to an already-read paragraph: no new independent read/ending
      // unlocks. Loading after a NEW unlock intentionally merges meta-progress
      // and can change the hash; that separate behavior is checked at the end.
      await button(p, '打开阅读菜单').click(); await button(p, '后退一步').click(); await p.waitForFunction(hash => document.querySelector('main.player-shell')?.dataset.runtimeStateHash !== hash, savedHash); const backedHash = await hash();
      await p.reload(); await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
      if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); assert.equal(await hash(), savedHash);
      await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), continuityStages[statement.id].background);
      assert.equal((await p.locator('.player-dialogue__text').innerText()).trim(), text); assert.equal(await main.getAttribute('data-history-cursor'), cursor); assert.equal(await main.getAttribute('data-history-length'), length);
      assert.deepEqual(await p.locator('.player-stage-character').evaluateAll(elements => elements.map(el => el.dataset.assetId)), continuityStages[statement.id].portraits);
      if (continuityStages[statement.id].ambient === null) assert.equal(await p.locator('audio[data-audio-bus="ambient"]').count(), 0); else assert.equal(Number(await p.locator('audio[data-audio-bus="ambient"]').getAttribute('data-volume')), continuityStages[statement.id].ambient);
      saves.push({ id: statement.id, savedHash, backedHash, loadedHash: await hash(), cursor, length });
    }
    assert.equal(await p.locator('.player-media-error').count(), 0); await button(p, '继续下一句').click();
  }
  assert.equal(await main.getAttribute('data-player-status'), 'ended'); assert.equal(ids.length, 66); assert.equal(voices.size, 6);
  const titles = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch === 0 ? ['留下', '灯下的回信', '雨后的天明'] : ['远行', '车窗与海', '再一次见面'])];
  const scenes = Object.entries(source).filter(([name]) => name.startsWith('scenes/')).map(([, bytes]) => json(bytes));
  assert.deepEqual(ids, titles.flatMap(title => json(source[scenes.find(s => s.title === title).scriptPath]).statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id)));
  assert.equal(stages.length, branch === 0 ? 6 : 8); assert.equal(saves.length, branch === 0 ? 1 : 2); assert.equal(await p.locator('audio').count(), 0);
  const ending = await p.locator('.player-ending').innerText(); await shot(p, `player-route-${branch}${phone && branch === 0 ? '-phone' : ''}-ending`); const endedHash = await hash();
  await button(p, '查看收藏与结局').click(); await button(p, '返回附加内容总览').click(); await button(p, '查看 场景回想').click(); await button(p, `开始回想 ${branch === 0 ? '雨后的天明' : '再一次见面'}`).click();
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.sceneReplay !== 'inactive'); await button(p, '退出回想，返回原剧情').click(); assert.equal(await hash(), endedHash);
  // A new ending/read collection must survive loading a pre-ending slot.
  await p.reload(); await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
  if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded');
  const lastSave = saves.at(-1), mergedHash = await hash(); assert.notEqual(mergedHash, lastSave.savedHash); assert.equal(await main.getAttribute('data-history-cursor'), lastSave.cursor); assert.equal(await main.getAttribute('data-history-length'), lastSave.length);
  assert.equal((await p.locator('.player-dialogue__text').innerText()).trim(), statements.find(row => row.id === lastSave.id).text);
  await button(p, '打开阅读菜单').click(); await button(p, '打开附加内容').click(); await p.getByRole('button', { name: /^查看 .*结局/u }).click(); assert.equal(await p.locator('.player-additional-content [data-unlocked="true"]').count(), 1);
  playerRoutes.push({ branch, entry: url.startsWith('file:') ? 'html-file' : 'website-offline', ending, ids, naturallyEndedVoices: voices.size, stages, saves, replayRestoredHash: endedHash, newUnlockRetainedAfterOldSlotLoad: { savedHash: lastSave.savedHash, mergedHash, reachedEndings: 1 }, humanListening: false, physicalPhone: false });
  check(`independent-player-${branch}-full-route-six-voice-beats-stage-audio-save-reopen-and-replay`, { ending, texts: ids.length, stages: stages.length });
  await playerContext.close(); current = page;
}
async function rejectPreviousSave(url) {
  const oldContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), old = await oldContext.newPage(); current = old; old.on('pageerror', error => errors.push(String(error)));
  await old.goto(pathToFileURL(path.join(root, 'evidence/web-version-retention/before-rain-stops.html')).href); await button(old, '开始故事').click(); await old.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
  const originalHash = await old.locator('main.player-shell').getAttribute('data-runtime-state-hash');
  await button(old, '打开阅读菜单').click(); await button(old, '存读档').click(); const oldSlots = old.getByRole('dialog', { name: '存读档槽位', exact: true }); await oldSlots.getByRole('button', { name: '备份', exact: true }).click(); await oldSlots.getByLabel('备份进度', { exact: true }).selectOption('current');
  const pending = old.waitForEvent('download'); await oldSlots.getByRole('button', { name: '导出备份文件', exact: true }).click(); const previous = await readFile(await (await pending).path()); await writeFile(path.join(output, 'chromium-1.9.0.worldsave'), previous);
  assert.equal(json(previous).payload.slot.runtimeStateHash, originalHash); await oldContext.close();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); current = p; p.on('pageerror', error => errors.push(String(error)));
  await p.goto(url); await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '备份', exact: true }).click();
  for (const file of [path.join(output, 'chromium-1.9.0.worldsave')]) {
    await slots.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(file); const alert = slots.getByRole('alert'); await alert.waitFor();
    assert.match(await alert.innerText(), /版本|构建|不兼容|不同|匹配/u); assert.equal(await slots.getByRole('button', { name: '导入到所选槽位', exact: true }).count(), 0); assert.equal(await p.locator('main.player-shell').getAttribute('data-player-status'), 'title');
    await shot(p, `previous-content-${path.basename(file)}-rejected-without-slot-write`); check(`original-${path.basename(file)}-refused-by-new-content-without-changing-title-or-offering-slot-write`, { message: await alert.innerText() });
  }
  await p.close(); current = page;
}
async function baselineRun() {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); current = p; p.on('pageerror', e => errors.push(String(e)));
  await p.goto(pathToFileURL(path.join(root, 'evidence/web-version-retention/before-rain-stops.html')).href);
  await button(p, '打开玩家设置').click(); await p.getByLabel('静音全部声音', { exact: true }).check(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button(p, '返回故事').click(); await button(p, '开始故事').click();
  const source = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), byText = new Map(Object.entries(source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, b]) => json(b).statements).filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  const observations = [];
  for (let i = 0; i < 180; i++) {
    const options = p.locator('.player-choice button');
    if (await options.count()) { const labels = (await options.allInnerTexts()).map(text => text.replace(/^\d+\s*/u, '')); assert.deepEqual(labels, choice.original); observations.push({ id: choice.id, labels }); await shot(p, 'baseline-choice-intent'); await options.nth(1).click(); continue; }
    await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const text = (await p.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(text); assert.ok(statement);
    if (['stmt_ui_5', 'stmt_ui_219', 'stmt_ui_238'].includes(statement.id)) { const actual = { id: statement.id, text, background: await p.locator('.player-stage-background').getAttribute('data-asset-id'), portraits: await p.locator('.player-stage-character').evaluateAll(elements => elements.map(el => el.dataset.assetId)) }; observations.push(actual); await shot(p, 'baseline-' + statement.id); }
    if (statement.id === 'stmt_ui_238') break;
    if (await p.locator('audio[data-audio-bus="voice"]').count()) await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended);
    await button(p, '继续下一句').click();
  }
  assert.equal(observations.length, 4); assert.deepEqual(observations.find(o => o.id === 'stmt_ui_5').portraits, ['xia_letter']); assert.equal(observations.find(o => o.id === 'stmt_ui_219').background, 'morning_studio'); assert.equal(observations.find(o => o.id === 'stmt_ui_238').text, revision.original); assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'baseline.json'), JSON.stringify({ passed: true, actualOriginalGame: 'evidence/web-version-retention/before-rain-stops.html', contentVersion: '1.9.0', observations, errors, scope: 'Existing actual exported HTML route through the four issue locations; muted Chromium, phone-sized, not human acceptance or a full-route result.' }, null, 2)); await p.close(); current = page;
}
async function updateOldCache(url, latest) {
  const oldFiles = unzipSync(await readFile(path.join(root, 'evidence/web-cache-management/before-rain-stops-website.zip'))), ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), p = await ctx.newPage(); current = p; p.on('pageerror', e => errors.push(String(e)));
  deployed = oldFiles; await p.goto(url); await button(p, '开始故事').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const oldEntry = p.url(), saved = await p.locator('main.player-shell').getAttribute('data-runtime-state-hash');
  await button(p, '打开阅读菜单').click(); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await button(p, '存读档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '备份', exact: true }).click(); await slots.getByLabel('备份进度', { exact: true }).selectOption('current');
  const pending = p.waitForEvent('download'); await slots.getByRole('button', { name: '导出备份文件', exact: true }).click(); const oldBackup = await readFile(await (await pending).path()); assert.equal(json(oldBackup).payload.slot.runtimeStateHash, saved); const backupFile = path.join(output, 'cached-1.9.0.worldsave'); await writeFile(backupFile, oldBackup); await button(p, '关闭存读档').click();
  if (!await p.locator('#offline-panel').isVisible()) await button(p, '打开阅读菜单').click(); await p.locator('#offline-panel > summary').click(); await button(p, '下载离线内容').click(); await p.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 });
  deployed = latest; await button(p, '检查更新').click(); await p.getByLabel('我已了解旧档可能不兼容，并已保留需要的资料', { exact: true }).check(); await button(p, '确认检查并下载').click(); await p.locator('#offline-summary').filter({ hasText: '新版等待选择' }).waitFor({ timeout: 90000 }); await p.locator('#offline-version-note').filter({ hasText: '1.10.0' }).waitFor(); await p.close();
  const retained = await ctx.newPage(); current = retained; await retained.goto(oldEntry); const load = async target => { await button(target, '读取存档').click(); const panel = target.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '快速', exact: true }).click(); await panel.getByRole('button', { name: '读取', exact: true }).click(); if (await target.locator('.player-load-confirm').isVisible()) await button(target, '确认读取').click(); await target.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); };
  await load(retained); assert.equal(await retained.locator('main.player-shell').getAttribute('data-runtime-state-hash'), saved); await ctx.setOffline(true); assert.equal((await retained.reload()).fromServiceWorker(), true); await load(retained); assert.equal(await retained.locator('main.player-shell').getAttribute('data-runtime-state-hash'), saved); await retained.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); assert.deepEqual(await retained.locator('.player-stage-character').evaluateAll(els => els.map(el => el.dataset.assetId)), ['xia_letter']); await shot(retained, 'updated-worker-keeps-original-1.9-offline-story-and-save');
  await button(retained, '打开阅读菜单').click(); await retained.locator('#offline-panel > summary').click(); await button(retained, '查看版本与备份').click(); await retained.getByLabel('我已了解旧档可能不兼容，并已保留需要的资料', { exact: true }).check(); const popup = ctx.waitForEvent('page'); await retained.getByRole('link', { name: '在新窗口打开新版', exact: true }).click(); const newer = await popup; current = newer; await newer.locator('#world-publication-version').filter({ hasText: '1.10.0' }).waitFor();
  await button(newer, '读取存档').click(); const panel = newer.getByRole('dialog', { name: '存读档槽位', exact: true }); await panel.getByRole('button', { name: '备份', exact: true }).click(); await panel.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(backupFile); await panel.getByRole('alert').waitFor(); assert.equal(await panel.getByRole('button', { name: '导入到所选槽位', exact: true }).count(), 0); assert.equal(await retained.locator('main.player-shell').getAttribute('data-runtime-state-hash'), saved); await shot(newer, 'parallel-1.10-refuses-retained-1.9-backup');
  check('actual-1.9-to-1.10-download-auto-activation-old-offline-entry-original-slot-and-parallel-strict-refusal', { oldSavedHash: saved, oldBackupSha256: sha(oldBackup), refusal: await panel.getByRole('alert').innerText() }); await ctx.close(); current = page; deployed = latest;
}
try {
  temporary = await mkdtemp(path.join(tmpdir(), 'world-story-arrival-and-night-'));
  if (process.argv.includes('--baseline-only')) { await baselineRun(); }
  else {
  const phoneLeftOnly = process.argv.includes('--phone-left-only');
  if (!process.argv.includes('--play-only') && !phoneLeftOnly) await author();
  const { source, website, ...audit } = await auditContinuityArtifacts(); await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(audit, null, 2)); check('strict-appearance-night-text-choice-source-media-notes-and-both-game-audit', audit.story);
  const htmlUrl = pathToFileURL(path.join(output, 'before-rain-stops.html')).href;
  await playerRoute(htmlUrl, 0, phoneLeftOnly, source);
  deployed = website;
  server = createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = deployed[name], type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' }[path.extname(name)] ?? 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' }, range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range ?? '');
    if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return response.writeHead(416).end(); return response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
    response.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const websiteUrl = `http://127.0.0.1:${server.address().port}/gal/`;
  if (!phoneLeftOnly) { await playerRoute(websiteUrl, 1, true, source); await rejectPreviousSave(websiteUrl); await updateOldCache(websiteUrl, website); }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, phoneLeftOnly ? 'phone-left-checks.json' : 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), playOnly: process.argv.includes('--play-only') || phoneLeftOnly, checks, errors, editorRoutes, playerRoutes, productionSnapshots: snapshots, scope: phoneLeftOnly ? 'Additional complete HTML file route 0 at 390x844, with six stage nodes also viewed at 844x390; muted native voice end, actual saves/reopen and replay. Not a physical phone.' : 'UI-authored 1.10.0 content candidate; two full editor entry routes, desktop HTML route 0 and offline phone-sized website route 1, not a full format/route matrix. Muted native audio, actual saves/reopen, old-content rejection and Chromium loopback 1.9-to-1.10 update with original offline entry/save preservation. No human approval, listening, physical phones/Safari, licensing, public HTTPS deployment or long-soak acceptance.' }, null, 2));
  }
} catch (error) {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-'); await writeFile(path.join(output, `failure-${stamp}.json`), JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); if (!current.isClosed()) await shot(current, `failure-${stamp}`); throw error;
} finally {
  await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (temporary) { assert.equal(path.dirname(temporary), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith('world-story-arrival-and-night-')); await rm(temporary, { recursive: true, force: true }); }
}

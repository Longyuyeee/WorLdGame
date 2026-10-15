import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { json, sha } from './audit-rain-story-refinement.mjs';
import { auditBeatArtifacts, beatOutput as output } from './audit-rain-story-beats.mjs';
import { textRevisions, voiceRevision, voiceBeats, montageExit, expectedScript } from '../assets/rain-story/editorial-v1.7.mjs';

const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(25000);
const checks = [], errors = [], routes = {}; let current = page, server;
const watch = p => p.on('pageerror', e => errors.push(e.message)); watch(page);
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const view = name => page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name, exact: true }).click();
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
async function scene(name) {
  await nav('故事');
  if (!await page.locator('.scene-rail').isVisible()) await page.getByRole('button', { name: '场景列表', exact: true }).click();
  await page.locator('.scene-rail').getByRole('button').filter({ hasText: name }).click();
}
async function menu(name) {
  await ready(); if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
}
async function download(trigger, name) { const event = page.waitForEvent('download'); await trigger(); const bytes = await readFile(await (await event).path()); await writeFile(path.join(output, name), bytes); return bytes; }
async function issue(name, id, text) {
  await scene(name); await view('写作'); await page.locator(`#statement-card-${id}`).click();
  if (await page.getByRole('button', { name: '打开预览', exact: true }).count()) await page.getByRole('button', { name: '打开预览', exact: true }).click();
  const options = page.locator('.preview-run-options'); if (!await options.evaluate(el => el.open)) await options.locator('summary').click();
  await page.getByRole('button', { name: '从当前语句运行', exact: true }).click(); await page.getByRole('button', { name: '记录问题', exact: true }).click();
  await page.getByLabel('校订问题描述', { exact: true }).fill(text); await page.getByLabel('校订问题类型', { exact: true }).selectOption('stage');
  await page.getByRole('button', { name: '保存校订记录', exact: true }).click(); await page.getByRole('button', { name: '退出试玩', exact: true }).click();
}
async function generate(directory) {
  if (!directory) { await nav('发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); }
  else await page.getByRole('button', { name: '← 导出方式', exact: true }).click();
  await page.getByRole('radio', { name: directory ? /网页目录 ZIP/ : /单文件 HTML/ }).check();
  await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await page.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 90000 });
  await download(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), directory ? 'before-rain-stops-web.zip' : 'before-rain-stops.html');
}
async function author() {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-story-refinement/before-rain-stops-project.zip')); await ready();
  await nav('检查'); await page.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(root, 'evidence/web-story-refinement/before-rain-stops.worldreview'));
  await page.getByRole('region', { name: '试玩校订清单' }).locator('[data-review-id]').nth(7).waitFor();
  await issue('留下', 'stmt_ui_113', '退掉次晨车票后，语音仍说“明天还要出发”。同步修订对白与实际音频；确认不再强定次晨行程。');
  await issue('雨后的天明', 'stmt_ui_167', '结尾已总结去过新城市，才出现“到了就告诉我”。移回当日下午告别，补未来行程语境，复核蒙太奇人物退场。');
  await issue('再一次见面', 'stmt_ui_250', '小夏已上车、林远独自夜归后才播放小夏的现场对白。将回应放回白天店内看画时，连同其余场景末尾配音一起对齐。');
  check('eight-existing-notes-imported-and-three-actual-issues-recorded');
  for (const r of [...textRevisions, voiceRevision]) {
    await scene(r.scene); await view('写作'); await page.locator(`#statement-card-${r.statementId}`).click();
    const input = page.locator('.writing-text-inspector textarea'); assert.equal(await input.inputValue(), r.original);
    await input.fill(r.text); await page.getByRole('button', { name: '应用修改', exact: true }).click();
    await page.locator(`#statement-card-${r.statementId}`).filter({ hasText: r.text }).waitFor();
  }
  for (const beat of voiceBeats) {
    await scene(beat.scene); await view('脚本'); const input = page.getByLabel('权威脚本编辑器', { exact: true }), before = await input.inputValue();
    const lines = before.split('\n'), hasId = (line, id) => line.includes(`@sid(${id})`) || line.includes(`@id(${id})`);
    const block = [beat.play, beat.line, beat.stop].map(id => { const hits = lines.filter(line => hasId(line, id)); assert.equal(hits.length, 1, id); return hits[0]; });
    const remaining = lines.filter(line => ![beat.play, beat.line, beat.stop].some(id => hasId(line, id)));
    const anchor = remaining.findIndex(line => hasId(line, beat.after)); assert.ok(anchor >= 0);
    remaining.splice(anchor + 1, 0, ...block, ...(beat.line === 'stmt_ui_167' ? [`@${montageExit.command} ${montageExit.summary} @id(${montageExit.id})`] : []));
    const after = remaining.join('\n');
    if (after !== before) {
      await input.fill(after); await input.press('Control+s');
      await page.waitForFunction(() => document.querySelector('.script-editor')?.dataset.inputState === 'committed');
      await page.locator('.diagnostics-console.is-clear').waitFor(); await ready();
      if (beat === voiceBeats[0]) {
        await page.getByRole('button', { name: '撤销', exact: true }).click(); await page.waitForFunction(value => document.querySelector('.script-editor')?.value === value, before);
        await page.getByRole('button', { name: '重做', exact: true }).click(); await page.waitForFunction(value => document.querySelector('.script-editor')?.value === value, after);
      }
    }
  }
  check('ten-text-revisions-and-nine-voice-beats-applied-through-editor-with-undo-redo');
  await nav('素材'); await page.getByRole('button', { name: '管理素材：林远·合成语音04', exact: true }).click();
  await page.getByLabel('选择资源文件', { exact: true }).setInputFiles(path.join(root, 'assets/rain-story', voiceRevision.file));
  await page.getByRole('button', { name: '更新此资源', exact: true }).click(); await page.getByText('资源导入完成', { exact: true }).waitFor();
  await shot(page, 'revised-voice-imported'); await page.getByRole('button', { name: '关闭资源保险库', exact: true }).click();
  await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill('1.7.0'); await page.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready();
  await nav('检查'); const board = page.getByRole('region', { name: '试玩校订清单' });
  await board.getByRole('button', { name: '全部 11', exact: true }).waitFor();
  assert.equal(await board.locator('[data-review-id]').count(), 8); // Review list is paginated, eight rows per page.
  while (await board.getByRole('button', { name: '标记已修改', exact: true }).count()) await board.getByRole('button', { name: '标记已修改', exact: true }).first().click();
  assert.equal(await board.locator('[data-review-status="fixed"]').count(), 8);
  await board.getByRole('button', { name: '下一页记录', exact: true }).click();
  assert.equal(await board.locator('[data-review-status="fixed"]').count(), 3);
  await download(() => board.getByRole('button', { name: '导出校订记录', exact: true }).click(), 'before-rain-stops.worldreview');
  await shot(page, 'eleven-fixed-await-review');
  await menu('所有项目'); await page.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await page.reload();
  await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
  await download(() => menu('导出工程 ZIP'), 'before-rain-stops-project.zip');
  const before = unzipSync(await readFile(path.join(root, 'evidence/web-story-refinement/before-rain-stops-project.zip'))), fresh = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip')));
  for (const [key, bytes] of Object.entries(before)) if (key.startsWith('scripts/')) assert.deepEqual(json(fresh[key]), expectedScript(json(bytes)));
  await generate(false); await generate(true); check('voice-replacement-save-refresh-reopen-and-real-html-directory-exports');
  await writeFile(path.join(output, 'authoring-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), checks, errors, notes: { count: 11, humanVerified: false } }, null, 2));
}
async function route(url, name, branch, ending, width, source) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, reducedMotion: 'reduce', isMobile: width < 500, hasTouch: width < 500 });
  const p = await context.newPage(); current = p; watch(p); p.setDefaultTimeout(25000);
  const main = p.locator('main.player-shell'), hash = () => main.getAttribute('data-runtime-state-hash');
  const statements = Object.keys(source).filter(k => k.startsWith('scripts/')).flatMap(k => json(source[k]).statements);
  const byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  const paragraphs = new Set(), voices = new Set(), beats = [], orderedTextIds = [], checkedStages = {}; let saved = false;
  await p.goto(url); await p.getByRole('button', { name: /^开始故事/ }).click();
  for (let step = 0; step < 500; step++) {
    if (await main.getAttribute('data-player-status') === 'ended') break;
    if (await p.locator('.player-choice button').count()) { await p.locator('.player-choice').getByRole('button', { name: branch, exact: true }).click(); continue; }
    await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
    const text = (await p.locator('.player-dialogue__text').innerText()).trim(), s = byText.get(text);
    assert.ok(s, `Unknown/missing displayed text: ${text}`);
    if (orderedTextIds.at(-1) !== s.id) orderedTextIds.push(s.id);
    if (s.kind === 'narration') paragraphs.add(s.id);
    if (s.id === 'stmt_ui_154') assert.equal(await p.locator('.player-stage-character').count(), 0, 'Xia must leave before the montage');
    const requiredStage = { stmt_ui_158: 'station_day', stmt_ui_221: 'station_day', stmt_ui_230: 'station_day', stmt_ui_232: 'day_cafe', stmt_ui_248: 'night_studio' }[s.id];
    if (requiredStage) { assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), requiredStage); checkedStages[s.id] = requiredStage; }
    if (s.id === 'stmt_ui_234') {
      await p.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="ambient"]'); return a?.dataset.assetId === 'soft_rain' && a.currentTime > 0 && !a.paused; });
      assert.equal(await p.locator('audio[data-audio-bus="ambient"]').getAttribute('data-volume'), '0.1');
    }
    if (s.id === 'stmt_ui_248') assert.equal(await p.locator('audio[data-audio-bus="ambient"]').count(), 0);
    const beat = voiceBeats.find(b => b.line === s.id);
    if (beat && !voices.has(s.id)) {
      assert.equal(orderedTextIds.at(-2), beat.after, `Voice must follow its authored beat: ${beat.line}`);
      assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), beat.background);
      const portraits = await p.locator('.player-stage-character').evaluateAll(elements => elements.map(el => el.dataset.assetId));
      assert.deepEqual(portraits, beat.portrait ? [beat.portrait] : []);
      const frame = await p.locator('.player-stage-world').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; });
      assert.ok(Math.abs(frame - 16 / 9) < .01, 'Authored stage aspect ratio must not change on a phone');
      const speakerContrast = await p.locator('.player-dialogue__speaker').evaluate(el => {
        const name = getComputedStyle(el).color, panel = getComputedStyle(el.parentElement).backgroundColor;
        const rgb = value => value.match(/[\d.]+/gu).map(Number), foreground = rgb(name), background = rgb(panel);
        // This light textbox overlays artwork. Black is the darkest possible underlay;
        // test that conservative composited panel, not an assumed white background.
        const alpha = background[3] ?? 1, composite = background.slice(0, 3).map(v => v * alpha);
        const luminance = values => values.slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const a = luminance(foreground), b = luminance(composite);
        return { name, panel, conservativeRatio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });
      assert.ok(speakerContrast.conservativeRatio >= 4.5, JSON.stringify(speakerContrast));
      const voice = p.locator('audio[data-audio-bus="voice"]'); await voice.waitFor({ state: 'attached' });
      const asset = await voice.getAttribute('data-asset-id');
      assert.equal(asset, statements.find(t => t.id === beat.play).summary.match(/asset=([^ ]+)/u)[1]);
      await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended);
      voices.add(s.id); beats.push({ line: s.id, previous: beat.after, voiceAsset: asset, background: beat.background, portraits, speakerContrast, naturalEnd: true });
      if (['stmt_ui_113', 'stmt_ui_167', 'stmt_ui_196', 'stmt_ui_250'].includes(s.id)) await shot(p, `${name}-${s.id}`);
      if (!saved && ['stmt_ui_167', 'stmt_ui_250'].includes(s.id)) {
        const before = await hash(); await p.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await p.getByRole('button', { name: '快速保存', exact: true }).click();
        await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await p.reload();
        await p.getByRole('button', { name: '读取存档', exact: true }).click(); const slots = p.getByRole('dialog', { name: '存读档槽位' });
        await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
        await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); assert.equal(await hash(), before); saved = true;
        // A restored line may restart its one-shot voice; wait for this real playback too.
        await p.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="voice"]'); return !a || a.ended; });
      }
    }
    await p.getByRole('button', { name: '继续下一句', exact: true }).click(); await p.waitForTimeout(45);
  }
  assert.equal(await main.getAttribute('data-player-status'), 'ended'); assert.match(await p.locator('.player-ending').innerText(), new RegExp(ending));
  assert.equal(paragraphs.size, 60); assert.equal(voices.size, 6); assert.ok(saved); assert.equal(await p.locator('audio').count(), 0);
  const sceneNames = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch === '留下等雨停' ? ['留下', '灯下的回信', '雨后的天明'] : ['远行', '车窗与海', '再一次见面'])];
  const scenes = Object.keys(source).filter(k => k.startsWith('scenes/')).map(k => json(source[k]));
  const expectedIds = sceneNames.flatMap(name => json(source[scenes.find(s => s.title === name).scriptPath]).statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id));
  assert.deepEqual(orderedTextIds, expectedIds, 'Read each authored text in route order without skipping after a relocated voice');
  await shot(p, `${name}-ending`);
  const original = await hash(); await p.getByRole('button', { name: '查看收藏与结局', exact: true }).click(); await p.getByRole('button', { name: '返回附加内容总览', exact: true }).click(); await p.getByRole('button', { name: '查看 场景回想', exact: true }).click();
  const last = branch === '留下等雨停' ? '雨后的天明' : '再一次见面';
  await p.getByRole('button', { name: `开始回想 ${last}`, exact: true }).click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.sceneReplay !== 'inactive');
  await p.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click(); assert.equal(await hash(), original);
  routes[name] = { ending, sceneNames, paragraphs: paragraphs.size, voiceBeats: beats, orderedTextIds, checkedStages, saveAtRelocatedDialogueReload: true, replayRestoredSameHash: true, humanReadTiming: false, humanListening: false, physicalPhone: false };
  check(name, { ending, paragraphs: paragraphs.size, naturallyEndedVoices: voices.size }); await context.close(); current = page;
}
async function rejectOldSave() {
  const old = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); current = old; watch(old);
  await old.goto(pathToFileURL(path.join(root, 'evidence/web-story-refinement/before-rain-stops.html')).href); await old.getByRole('button', { name: /^开始故事/ }).click();
  await old.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await old.getByRole('button', { name: '存读档', exact: true }).click();
  let slots = old.getByRole('dialog', { name: '存读档槽位' }); await slots.getByRole('button', { name: '备份', exact: true }).click(); await slots.getByLabel('备份进度', { exact: true }).selectOption('current');
  const event = old.waitForEvent('download'); await slots.getByRole('button', { name: '导出备份文件', exact: true }).click(); const backup = await readFile(await (await event).path()); await old.close();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); current = p; watch(p);
  await p.goto(pathToFileURL(path.join(output, 'before-rain-stops.html')).href); await p.getByRole('button', { name: '读取存档', exact: true }).click();
  slots = p.getByRole('dialog', { name: '存读档槽位' }); await slots.getByRole('button', { name: '备份', exact: true }).click();
  await slots.getByLabel('选择存档备份文件', { exact: true }).setInputFiles({ name: 'old-1.6.0.worldsave', mimeType: 'application/json', buffer: backup });
  const alert = slots.getByRole('alert'); await alert.waitFor(); const message = await alert.innerText(); assert.match(message, /版本|构建|不兼容|不同|匹配/u);
  assert.equal(await slots.getByRole('button', { name: '导入到所选槽位', exact: true }).count(), 0); assert.equal(await p.locator('main.player-shell').getAttribute('data-player-status'), 'title');
  await shot(p, 'old-1.6-save-rejected'); check('actual-1.6-backup-rejected-without-changing-title-state', { message, backupSha256: sha(backup) }); await p.close(); current = page;
}
try {
  if (!process.argv.includes('--play-only')) await author();
  const { source, directory, ...audit } = await auditBeatArtifacts(); await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(audit, null, 2)); check('strict-source-identity-order-media-and-both-artifact-audit', audit.story);
  await route(pathToFileURL(path.join(output, 'before-rain-stops.html')).href, 'html-stay', '留下等雨停', '同行的约定', 1280, source);
  server = createServer((req, res) => { const key = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = directory[key]; res.writeHead(bytes ? 200 : 404, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json' }[path.extname(key)] ?? 'application/octet-stream' }); res.end(bytes ?? 'Missing'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await route(`http://127.0.0.1:${server.address().port}/gal/index.html`, 'directory-leave', '去追最后一班车', '远行的约定', 390, source);
  await rejectOldSave(); assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), playOnly: process.argv.includes('--play-only'), checks, errors, routes, scope: 'UI authored/exported full candidate; natural audio ended is not human listening; no physical device, licensing, public URL or old-content save migration acceptance' }, null, 2));
} catch (error) { const name = `failure-${new Date().toISOString().replace(/[:.]/gu, '-')}`; await shot(current, name); await writeFile(path.join(output, `${name}.json`), JSON.stringify({ checks, errors, failure: error.stack }, null, 2)); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

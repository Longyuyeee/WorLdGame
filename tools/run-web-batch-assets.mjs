import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { editedScenes } from '../assets/rain-story/editorial-v1.5.1.mjs';

const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-batch-assets-closure');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(20000);
const checks = [], errors = [], artifacts = {}; let server, fixtureDir, servedFiles, current = page;
const url = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
const watch = p => p.on('pageerror', e => errors.push(e.message)); watch(page);
const record = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
const ready = p => p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = (p, name) => p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const dialog = p => p.getByRole('dialog', { name: '批量导入素材', exact: true });
const row = (p, index) => dialog(p).locator('[data-batch-asset-id]').nth(index);
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
async function create(p, title) {
  await p.goto(url); await p.getByRole('button', { name: '新建项目', exact: true }).click(); await p.getByLabel('项目名称', { exact: true }).fill(title);
  await p.getByRole('button', { name: '创建并开始写作', exact: true }).click(); await ready(p);
}
async function open(p) { await nav(p, '素材'); await p.getByRole('button', { name: '批量导入素材', exact: true }).click(); await dialog(p).waitFor(); }
async function choose(p, files) { await p.getByLabel('选择批量素材文件', { exact: true }).setInputFiles(files); }
async function theme(p, name) { await p.locator('.editor-preferences > summary').click(); await p.getByRole('button', { name, exact: true }).click(); await p.locator('.editor-preferences > summary').click(); }
async function fit(p) {
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await dialog(p).evaluate(el => {
    const r = el.getBoundingClientRect(), footer = el.querySelector('footer').getBoundingClientRect(), body = el.querySelector('.batch-assets-body');
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, scroll: el.scrollWidth, client: el.clientWidth,
      footer: { left: footer.left, right: footer.right, bottom: footer.bottom }, bodyScroll: body.scrollHeight, bodyClient: body.clientHeight };
  });
  assert.ok(geometry.left >= -1 && geometry.right <= geometry.w + 1 && geometry.top >= 0 && geometry.bottom <= geometry.h + 1 && geometry.scroll <= geometry.client + 1, JSON.stringify(geometry));
  assert.ok(geometry.footer.bottom <= geometry.h + 1 && geometry.footer.right <= geometry.w + 1, JSON.stringify(geometry));
  return geometry;
}
async function projectAction(p, name) {
  await ready(p); if (!await p.locator('.project-switcher').evaluate(el => el.open)) await p.getByLabel('项目菜单', { exact: true }).click();
  await p.getByRole('button', { name: new RegExp(name) }).click();
}
async function download(p, label, name) {
  const event = p.waitForEvent('download'); await p.getByRole('link', { name: label, exact: true }).click();
  const bytes = await readFile(await (await event).path()); artifacts[name] = { byteLength: bytes.length, digest: sha(bytes) }; return bytes;
}
async function insert(p, button, asset, customize = async () => {}) {
  await p.getByLabel('场景演出快捷操作', { exact: true }).getByRole('button', { name: button, exact: true }).click();
  const edit = p.getByRole('dialog'); await edit.getByRole('button', { name: `选择素材：${asset}`, exact: true }).click(); await customize(edit);
  await edit.getByRole('button', { name: '插入演出', exact: true }).click(); await edit.waitFor({ state: 'hidden' });
}
async function generate(p, artifactName = 'production.zip') {
  await nav(p, '发布'); await p.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  await p.getByRole('radio', { name: /网页目录 ZIP/ }).check(); await p.getByLabel('同时生成制作交付包', { exact: true }).check();
  await p.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await p.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await p.getByRole('button', { name: '构建目录 ZIP', exact: true }).click(); await p.getByRole('link', { name: '下载制作交付包', exact: true }).waitFor({ timeout: 90000 });
  const bytes = await download(p, '下载制作交付包', artifactName), files = unzipSync(bytes), manifest = JSON.parse(strFromU8(files['delivery.json']));
  for (const file of manifest.files) { assert.equal(files[file.path].length, file.byteLength); assert.equal(sha(files[file.path]), file.digest); }
  return { bytes, files, manifest, source: unzipSync(files['source/project.zip']) };
}
async function rainRoute(branch, ending, width, expectedScenes) {
  const p = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width < 500, isMobile: width < 500 }); current = p; watch(p); p.setDefaultTimeout(20000);
  const main = p.locator('main.player-shell'), hash = () => main.getAttribute('data-runtime-state-hash');
  await p.goto(`http://127.0.0.1:${server.address().port}/play/index.html`); await p.getByRole('button', { name: /^开始故事/ }).click();
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
  await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="ambient"]')?.dataset.assetId === 'soft_rain_2');
  const paragraphs = new Set(), voices = new Set(), visited = []; let saved = false;
  for (let step = 0; step < 450; step++) {
    if (await main.getAttribute('data-player-status') === 'ended') break;
    if (await p.locator('.player-choice button').count()) { await p.locator('.player-choice').getByRole('button', { name: branch, exact: true }).click(); continue; }
    const text = (await p.locator('.player-dialogue__text').innerText()).trim(), scene = editedScenes.find(scene => scene.prose.includes(text));
    if (scene) { paragraphs.add(text); if (visited.at(-1) !== scene.name) visited.push(scene.name); }
    if (!saved && scene?.name === '候车室的旧信') {
      const before = await hash(); await p.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await p.getByRole('button', { name: '快速保存', exact: true }).click();
      await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await p.reload();
      await p.getByRole('button', { name: '读取存档', exact: true }).click(); const slots = p.getByRole('dialog', { name: '存读档槽位' });
      await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
      await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); assert.equal(await hash(), before); saved = true;
    }
    const voice = p.locator('audio[data-audio-bus="voice"]'); if (await voice.count()) { const id = await voice.getAttribute('data-asset-id'); if (!voices.has(id)) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(id); } }
    await p.getByRole('button', { name: '继续下一句', exact: true }).click(); await p.waitForTimeout(45);
  }
  assert.equal(await main.getAttribute('data-player-status'), 'ended'); assert.ok((await p.locator('.player-ending').innerText()).includes(ending));
  assert.equal(paragraphs.size, 60); assert.equal(voices.size, 6); assert.deepEqual(visited, expectedScenes); assert.ok(saved);
  await shot(p, `rain-${width}-ending`); const beforeReplay = await hash();
  await p.getByRole('button', { name: '查看收藏与结局', exact: true }).click(); await p.getByRole('button', { name: '返回附加内容总览', exact: true }).click();
  await p.getByRole('button', { name: '查看 场景回想', exact: true }).click(); await p.getByRole('button', { name: `开始回想 ${expectedScenes.at(-1)}`, exact: true }).click();
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.sceneReplay !== 'inactive'); await shot(p, `rain-${width}-replay`);
  await p.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click(); assert.equal(await hash(), beforeReplay); assert.equal(await main.getAttribute('data-player-status'), 'ended');
  record(`rain-full-route-${width}`, { branch, ending, paragraphs: paragraphs.size, naturallyEndedVoices: voices.size, visited, saveReloadSameHash: saved, replayReturnsToSameHash: true, physicalPhone: false, humanReadTiming: false });
  await p.close(); current = page;
}
const background = await readFile(path.join(root, 'assets/rain-story/morning-studio.png'));
const actor = await readFile(path.join(root, 'assets/rain-story/xia-smile.png'));
const audio = await readFile(path.join(root, 'assets/rain-story/soft-rain.wav'));
const icon = await readFile(path.join(root, 'assets/rain-story/letter-icon.png'));
try {
  await create(page, '批量素材完整制作'); await open(page);
  await choose(page, Array.from({ length: 50 }, (_, i) => ({ name: `第${i + 1}份_长名称的角色与车站素材_${'review_'.repeat(6)}.png`, mimeType: 'image/png', buffer: icon })));
  await fit(page); await shot(page, 'desktop-fifty-files');
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); const geometry = await fit(page); await row(page, 49).scrollIntoViewIfNeeded(); await shot(page, `mobile-${width}-fifty-files`); record(`layout-${width}-long-list-light`, geometry); }
  await page.keyboard.press('Escape'); assert.equal(await dialog(page).count(), 0);
  assert.equal(await page.getByRole('button', { name: '批量导入素材', exact: true }).evaluate(el => el === document.activeElement), true);
  await theme(page, '石墨'); await open(page); await choose(page, [{ name: 'Dark.png', mimeType: 'image/png', buffer: icon }]); await fit(page); await shot(page, 'mobile-dark-confirmation');
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1440, height: 1000 }); await theme(page, '清亮');
  record('modal-escape-focus-and-dark-theme');

  await open(page); await choose(page, [
    { name: 'Station.png', mimeType: 'image/png', buffer: background }, { name: 'Station.png', mimeType: 'image/png', buffer: background },
    { name: 'Hero.png', mimeType: 'image/png', buffer: actor }, { name: 'Rain.wav', mimeType: 'audio/wav', buffer: audio },
    { name: 'Broken.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') }
  ]);
  await page.getByLabel('批量图片用途', { exact: true }).selectOption('background');
  assert.equal(await page.getByLabel('素材用途 4', { exact: true }).inputValue(), 'audio');
  for (const [i, name] of ['主背景', '重复背景', '主角立绘', '雨声音轨', '坏图'].entries()) await page.getByLabel(`素材名称 ${i + 1}`, { exact: true }).fill(name);
  await page.getByLabel('素材用途 3', { exact: true }).selectOption('character');
  await dialog(page).getByRole('button', { name: '导入所选 5 项', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-batch-state="success"]').length === 4 && document.querySelectorAll('[data-batch-state="error"]').length === 1);
  assert.match(await row(page, 4).innerText(), /无法|文件|不完整|格式/);
  await dialog(page).getByRole('button', { name: '定位失败项', exact: true }).click(); assert.ok(await page.getByLabel('素材名称 5', { exact: true }).evaluate(el => el === document.activeElement));
  await page.setViewportSize({ width: 390, height: 844 }); await dialog(page).getByRole('button', { name: '定位失败项', exact: true }).click(); await fit(page); await shot(page, 'mobile-locate-failed-file');
  await page.setViewportSize({ width: 1440, height: 1000 }); await dialog(page).getByRole('button', { name: '定位失败项', exact: true }).click(); await shot(page, 'mixed-success-and-failure');
  await dialog(page).getByRole('button', { name: '导入所选 1 项', exact: true }).click(); await dialog(page).getByText(/本批处理完成：本次成功 0 项，失败 1 项/).waitFor();
  assert.equal(await dialog(page).locator('[data-batch-state="success"]').count(), 4);
  await dialog(page).getByRole('button', { name: '返回素材库', exact: true }).click();
  assert.equal(await page.locator('.asset-library-grid .asset-library-card').count(), 4);
  record('mixed-import-metadata-duplicates-failure-and-retry');
  await open(page); await choose(page, [{ name: 'Station.png', mimeType: 'image/png', buffer: background }]);
  await page.getByLabel('素材名称 1', { exact: true }).fill('另一次背景'); await dialog(page).getByRole('button', { name: '导入所选 1 项', exact: true }).click();
  await dialog(page).getByText('已导入 1 / 1 项', { exact: true }).waitFor(); await dialog(page).getByRole('button', { name: '查看素材', exact: true }).click();
  await page.getByRole('heading', { name: '另一次背景', exact: true }).waitFor();
  record('second-batch-does-not-overwrite-and-opens-actual-detail');

  // Close the actual asset manager before returning to story.
  await page.getByRole('button', { name: '关闭资源保险库', exact: true }).click();
  await nav(page, '故事'); await page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '脚本', exact: true }).click();
  const editor = page.getByLabel('权威脚本编辑器', { exact: true }), original = await editor.inputValue();
  await editor.fill(original.replace(/^end .+$/mu, line => `narrate "先准备新导入的画面和声音。" @sid(batch_open) @id(batch_open_text)\nnarrate "批量导入的素材已经进入故事。" @sid(batch_read) @id(batch_read_text)\n${line}`));
  await editor.press('Control+s'); await ready(page);
  await page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '演出', exact: true }).click();
  await page.locator('#statement-card-batch_open').click(); await insert(page, '添加背景', '主背景');
  await insert(page, '添加角色', '主角立绘', async edit => { await edit.getByLabel('新增角色位置', { exact: true }).selectOption('left'); });
  await insert(page, '添加声音', '雨声音轨', async edit => { await edit.getByLabel('新增音频总线', { exact: true }).selectOption('ambient'); });
  await ready(page); await projectAction(page, '所有项目'); await page.getByRole('button', { name: '打开项目：批量素材完整制作', exact: true }).click(); await ready(page);
  await page.reload(); await page.getByRole('button', { name: '打开项目：批量素材完整制作', exact: true }).click(); await ready(page);
  const delivery = await generate(page), index = JSON.parse(strFromU8(delivery.source['.world-assets/index.json']));
  assert.equal(index.assets.length, 5); assert.deepEqual(index.assets.map(x => x.assetId).sort(), ['hero', 'rain', 'station', 'station_2', 'station_3']);
  assert.deepEqual(index.assets.map(x => x.displayName).sort(), ['主背景', '重复背景', '主角立绘', '雨声音轨', '另一次背景'].sort());
  const scripts = Object.entries(delivery.source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => JSON.parse(strFromU8(bytes)).statements);
  for (const id of ['station', 'hero', 'rain']) assert.ok(scripts.some(s => s.kind === 'direction' && s.summary.includes(`asset=${id}`)));
  for (const expected of [background, actor, audio]) assert.ok(Object.entries(delivery.source).some(([name, bytes]) => name.startsWith('.world-assets/blobs/') && sha(bytes) === sha(expected)));
  record('real-direction-save-reopen-and-production-manifest', { sourceAssets: index.assets.length, sourceBlobs: Object.keys(delivery.source).filter(k => k.includes('/blobs/')).length });
  servedFiles = delivery.files; server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://local').pathname, key = pathname.startsWith('/play/') ? 'game/' + pathname.slice(6) : '';
    const bytes = servedFiles[key]; if (!bytes) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' }[path.extname(key)] ?? 'application/octet-stream' }); response.end(bytes);
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const player = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); watch(player);
  await player.goto(`http://127.0.0.1:${server.address().port}/play/index.html`); await player.getByRole('button', { name: /^开始故事/ }).click();
  for (let i = 0; i < 12 && !/批量导入的素材已经进入故事/.test(await player.locator('.player-dialogue__text').innerText()); i++) await player.getByRole('button', { name: '继续下一句', exact: true }).click();
  await player.waitForFunction(() => { const bg = document.querySelector('.player-stage-background'); return bg && (bg.naturalWidth > 0 || bg.dataset.canvasSampling === 'ready'); });
  await player.waitForFunction(() => { const a = document.querySelector('audio[data-audio-bus="ambient"]'); return a && a.currentTime > 0 && !a.paused; });
  await shot(player, 'independent-mobile-player-new-assets'); await player.getByRole('button', { name: '继续下一句', exact: true }).click(); await player.locator('main[data-player-status="ended"]').waitFor(); await player.close();
  record('downloaded-directory-player-displays-assets-plays-audio-and-ends');

  const stopPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); watch(stopPage); stopPage.setDefaultTimeout(30000);
  await create(stopPage, '批量停止与恢复'); await open(stopPage);
  const wav = Buffer.alloc(60 * 1024 * 1024); wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(192000, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  // Playwright limits in-memory payloads to 50 MiB; use actual temporary files for the 60 MiB native read.
  fixtureDir = await mkdtemp(path.join(tmpdir(), 'world-batch-assets-'));
  await writeFile(path.join(fixtureDir, 'Completed.png'), icon); await writeFile(path.join(fixtureDir, 'Long.wav'), wav);
  await choose(stopPage, [path.join(fixtureDir, 'Completed.png'), path.join(fixtureDir, 'Long.wav')]);
  await dialog(stopPage).getByRole('button', { name: '导入所选 2 项', exact: true }).click();
  await stopPage.waitForFunction(() => document.querySelector('[data-batch-asset-id="completed"]')?.dataset.batchState === 'success' && document.querySelector('[data-batch-asset-id="long"]')?.dataset.batchState === 'importing', { }, { polling: 5 });
  const phaseAtStop = await dialog(stopPage).locator('footer').innerText(); await stopPage.keyboard.press('Escape');
  await dialog(stopPage).getByText(/本批已停止/).waitFor(); assert.equal(await dialog(stopPage).locator('[data-batch-state="success"]').count(), 1); await fit(stopPage); await shot(stopPage, 'real-file-cancel-retains-success');
  await dialog(stopPage).getByRole('button', { name: '导入所选 1 项', exact: true }).click(); await dialog(stopPage).getByText('已导入 2 / 2 项', { exact: true }).waitFor({ timeout: 90000 });
  record('real-large-file-escape-cancel-and-retry', { bytes: wav.length, phaseAtStop, retained: 1, finalSuccess: 2, mocks: false }); await stopPage.close();

  // Work on an isolated imported copy of the full work. Never rewrite the retained 1.5.4 candidate.
  const rainPath = path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip'), originalRain = unzipSync(await readFile(rainPath));
  await projectAction(page, '所有项目'); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(rainPath); await ready(page); await open(page);
  await choose(page, [
    { name: 'Sample_Station.png', mimeType: 'image/png', buffer: await readFile(path.join(root, 'assets/rain-story/station-night-v2.png')) },
    { name: 'Xia_Letter.png', mimeType: 'image/png', buffer: await readFile(path.join(root, 'assets/rain-story/xia-letter.png')) },
    { name: 'Soft_Rain.wav', mimeType: 'audio/wav', buffer: audio }
  ]);
  await page.getByLabel('素材用途 1', { exact: true }).selectOption('background'); await page.getByLabel('素材用途 2', { exact: true }).selectOption('character');
  await dialog(page).getByRole('button', { name: '导入所选 3 项', exact: true }).click(); await dialog(page).getByText('已导入 3 / 3 项', { exact: true }).waitFor(); await dialog(page).getByRole('button', { name: '返回素材库', exact: true }).click();
  await nav(page, '故事'); await page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '脚本', exact: true }).click();
  const opening = await editor.inputValue(); assert.match(opening, /asset=sample_station\b/); assert.match(opening, /asset=xia_letter\b/); assert.match(opening, /asset=soft_rain\b/);
  await editor.fill(opening.replace(/asset=(sample_station|xia_letter|soft_rain)\b/gu, 'asset=$1_2')); await editor.press('Control+s'); await ready(page);
  await projectAction(page, '所有项目'); await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready(page);
  const rain = await generate(page, 'rain-production.zip'), rainIndex = JSON.parse(strFromU8(rain.source['.world-assets/index.json'])); assert.equal(rainIndex.assets.length, 25);
  for (const id of ['sample_station_2', 'xia_letter_2', 'soft_rain_2']) assert.ok(rainIndex.assets.some(a => a.assetId === id));
  let originalBlobs = 0;
  for (const [name, bytes] of Object.entries(originalRain)) {
    if (name.startsWith('.world-assets/blobs/')) { assert.deepEqual(rain.source[name], bytes); originalBlobs++; }
    if (name.startsWith('scripts/')) {
      const expected = JSON.parse(strFromU8(bytes));
      if (expected.statements.some(s => s.id === 'stmt_ui_1')) expected.statements = expected.statements.map(s => s.kind === 'direction' ? { ...s, summary: s.summary.replace(/asset=(sample_station|xia_letter|soft_rain)\b/gu, 'asset=$1_2') } : s);
      assert.deepEqual(JSON.parse(strFromU8(rain.source[name])), expected);
    }
  }
  assert.equal(originalBlobs, 22); assert.equal(Object.keys(rain.source).filter(k => k.startsWith('.world-assets/blobs/')).length, 22);
  record('rain-full-project-new-ids-no-original-media-or-story-loss', { assets: 25, originalBlobs, sourceCandidateDigest: sha(await readFile(rainPath)), formalCandidateReplaced: false });
  servedFiles = rain.files;
  await rainRoute('留下等雨停', '同行的约定', 1280, editedScenes.slice(0, 6).map(scene => scene.name));
  await rainRoute('去追最后一班车', '远行的约定', 390, [...editedScenes.slice(0, 3), ...editedScenes.slice(6)].map(scene => scene.name));
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), editorBundle: await page.locator('script[type="module"][src]').getAttribute('src'), checks, errors, artifacts, scope: 'actual native batch import + short creation chain + isolated full Rain copy with both routes, actual voice completion, save/reload and replay; viewport checks not physical phones; no public deployment, licensing, human reading/listening or final Rain acceptance' }, null, 2));
} catch (error) {
  const name = `failure-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}`;
  await shot(current, name); await writeFile(path.join(output, `${name}.json`), JSON.stringify({ checks, errors, failure: error.stack }, null, 2)); throw error;
} finally {
  await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
  if (fixtureDir) { for (const name of ['Completed.png', 'Long.wav']) await unlink(path.join(fixtureDir, name)).catch(() => {}); await rmdir(fixtureDir); }
}

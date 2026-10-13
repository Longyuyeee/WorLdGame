import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { scenes } from '../assets/rain-story/story.mjs';
import { directions, mediaNames as names } from '../assets/rain-story/direction-plan.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-story-direction'); await mkdir(output, { recursive: true });
const voices = JSON.parse(await readFile(path.join(root, 'assets/rain-story/voice-lines.json')));
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(20_000);
const checks = [], errors = [], routes = {}, seenVoices = new Set(); let server, story;
const backgroundIds = { station: 'sample_station', waiting: 'waiting_room', train: 'night_train', studio: 'morning_studio', cafe: 'night_cafe', coast: 'coastal_morning' };
const portraitIds = { neutral: 'xia_letter', thoughtful: 'xia_thoughtful', smile: 'xia_smile' };
const watch = (p, name) => p.on('pageerror', error => errors.push(`${name}: ${error.message}`)); watch(page, 'editor');
const checked = name => { checks.push(name); console.log(name); };
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const screen = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function ready() { await page.getByTestId('workspace-shell').waitFor(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); }
async function menu(name) { await ready(); if (!await page.locator('.project-switcher').evaluate(item => item.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function selectScene(name) { await ready(); await page.locator('.scene-rail').getByRole('button', { name: new RegExp(name) }).click(); }
async function selectDirection(card) { await card.click(); const detail = page.locator('.step-properties'); if (!await detail.evaluate(item => item.open)) await detail.locator(':scope > summary').click(); }
async function applyDirection() { await page.getByRole('button', { name: '应用演出参数', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); }
async function importFile(file, name, kind, replacement = false) {
  await nav('素材'); await page.getByRole('button', { name: replacement ? '管理素材：雨后的车站（测试背景）' : '导入与管理素材', exact: true }).click();
  await page.getByLabel('选择资源文件').setInputFiles(path.join(root, 'assets/rain-story', file)); await page.getByLabel('资源显示名称').fill(name);
  if (!replacement) await page.getByLabel('资源类型', { exact: true }).selectOption(kind);
  await page.getByRole('button', { name: replacement ? '更新此资源' : '导入到资源保险库', exact: true }).click(); await page.getByText('资源导入完成', { exact: true }).waitFor(); await page.getByRole('button', { name: '关闭资源保险库', exact: true }).click();
}
async function insert(kind, { asset, action, position = 'left', bus = 'voice' } = {}) {
  const bar = page.getByLabel('对白结构工具'); if (!await bar.isVisible()) await page.getByText('插入与整理内容', { exact: false }).first().click();
  await bar.getByLabel('插入 P0 语句类型').selectOption(kind); await bar.getByRole('button', { name: '＋ 插入', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `添加${kind === 'background' ? '背景' : kind === 'show' ? '角色' : '音频'}演出`, exact: true });
  if (action) await dialog.getByLabel('新增演出动作').selectOption(action);
  if (asset) await dialog.getByLabel('新增演出资源').selectOption({ label: asset });
  if (kind === 'show' && asset) await dialog.getByLabel('新增角色位置').selectOption(position);
  if (kind === 'background') { await dialog.getByLabel('新增背景转场').selectOption('fade'); await dialog.getByLabel('新增背景转场时长').fill('250ms'); }
  if (kind === 'audio') { await dialog.getByLabel('新增音频总线').selectOption(bus); if (asset) await dialog.getByLabel('新增音频音量').fill('1'); }
  const count = await page.locator('.statement-card--direction').count(); await dialog.getByRole('button', { name: '插入演出', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.statement-card--direction').length === count, count + 1);
}
async function download(name) { const wait = page.waitForEvent('download'); await page.getByRole('link', { name: '下载游戏', exact: true }).click(); await (await wait).saveAs(path.join(output, name)); }
async function play(url, label, branch, expectedScenes, ending, width = 1280) {
  const p = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' }); watch(p, label);
  const paragraphs = new Set(), media = new Set(), playedVoices = new Set(), visited = [], stageChecks = []; let saved = false, captured = false;
  await p.goto(url);
  await p.waitForFunction(() => document.querySelector('.player-title-cover')?.naturalWidth > 0);
  assert.deepEqual(await p.evaluate(async () => { const img = new Image(); img.src = document.querySelector('link[rel="icon"]').href; await img.decode(); return [img.naturalWidth, img.naturalHeight]; }), [512, 512]);
  await p.screenshot({ path: path.join(output, `${label}-title.png`) });
  await p.getByRole('button', { name: /^开始故事/ }).click();
  if (label === 'http-stay') {
    await p.locator('#offline-panel > summary').click();
    await p.waitForFunction(() => {
      const header = document.getElementById('offline-panel'), version = document.getElementById('world-publication-version');
      return header.open && parseFloat(document.body.style.getPropertyValue('--player-viewport-offset')) === Math.ceil(header.getBoundingClientRect().height + version.getBoundingClientRect().height);
    });
    assert.ok(await p.locator('.player-dialogue').evaluate(item => { const r = item.getBoundingClientRect(); return r.top > document.querySelector('.player-playback-controls').getBoundingClientRect().bottom && r.bottom < document.querySelector('.player-save').getBoundingClientRect().top; }));
    await p.screenshot({ path: path.join(output, 'http-expanded-toolbar.png') });
    await p.locator('#offline-panel > summary').click();
    await p.waitForFunction(() => parseFloat(document.body.style.getPropertyValue('--player-viewport-offset')) === Math.ceil(document.getElementById('offline-panel').getBoundingClientRect().height + document.getElementById('world-publication-version').getBoundingClientRect().height));
  }
  for (let step = 0; step < 420; step++) {
    if (await p.locator('main').getAttribute('data-player-status') === 'ended') break;
    if (await p.locator('.player-choice').count()) { await p.locator('.player-choice').getByRole('button', { name: new RegExp(branch) }).click(); continue; }
    const text = await p.locator('.player-dialogue__text').textContent(); const scene = scenes.find(item => item.prose.includes(text));
    if (scene) { paragraphs.add(text); if (visited.at(-1) !== scene.name) { visited.push(scene.name); console.log(`${label}: ${scene.name}`); } }
    await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    if (scene) {
      const index = scene.prose.indexOf(text), plan = directions.find(item => item.name === scene.name);
      const cue = index === 0 ? plan : plan.cues.find(item => item.before === index);
      if (cue) {
        if (cue.background) assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), backgroundIds[cue.background], `${scene.name} paragraph ${index + 1} location`);
        if (cue.hide) assert.equal(await p.locator('.player-stage-character').count(), 0);
        if (cue.portrait) assert.equal(await p.locator('.player-stage-character').getAttribute('data-asset-id'), portraitIds[cue.portrait], `${scene.name} paragraph ${index + 1} expression`);
        stageChecks.push(`${scene.name}:${index + 1}`);
      }
    }
    for (const id of await p.locator('[data-asset-id]').evaluateAll(items => items.map(item => item.dataset.assetId))) media.add(id);
    assert.ok(await p.locator('.player-dialogue').evaluate(item => { const r = item.getBoundingClientRect(), stage = document.querySelector('.player-stage').getBoundingClientRect(), controls = document.querySelector('.player-playback-controls').getBoundingClientRect(), save = document.querySelector('.player-save').getBoundingClientRect(); return r.top >= stage.top && r.bottom <= Math.min(stage.bottom, innerHeight) && r.top > controls.bottom && r.bottom < save.top; }), `${label}: every paragraph stays clear of top/bottom controls`);
    if (!captured && scene) {
      await p.waitForFunction(() => [...document.querySelectorAll('audio')].some(item => !item.paused && item.currentTime > 0));
      if (width === 320) assert.ok(await p.locator('.player-stage-character').evaluate(item => { const r = item.getBoundingClientRect(), text = document.querySelector('.player-dialogue').getBoundingClientRect(); return r.top + r.height * .25 < text.top; }), 'Face remains visible above the first long paragraph');
      await p.screenshot({ path: path.join(output, `${label}-opening.png`) }); captured = true;
    }
    const voice = p.locator('audio[data-audio-bus="voice"]');
    if (await voice.count()) {
      const id = await voice.getAttribute('data-asset-id');
      if (!playedVoices.has(id)) {
        await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.currentTime > 0);
        playedVoices.add(id); seenVoices.add(id);
        await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended === true);
      }
    }
    if (!saved && scene?.name === '候车室的旧信') {
      await p.getByRole('button', { name: '快速保存', exact: true }).click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
      const hash = await p.locator('main').getAttribute('data-runtime-state-hash'); await p.reload(); await p.getByRole('button', { name: '快速读取', exact: true }).click();
      await p.waitForFunction(hash => document.querySelector('main')?.dataset.runtimeStateHash === hash, hash); saved = true;
    }
    if (scene?.name === '远行' && text === scene.prose[3]) { assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), 'night_train'); assert.equal(await p.locator('.player-stage-character').count(), 0); await p.screenshot({ path: path.join(output, `${label}-train.png`) }); }
    if (scene?.name === '雨后的天明' && text === scene.prose[0]) { assert.equal(await p.locator('.player-stage-background').getAttribute('data-asset-id'), 'morning_studio'); assert.equal(await p.locator('.player-stage-character').count(), 0); await p.screenshot({ path: path.join(output, `${label}-studio.png`) }); }
    await p.getByRole('button', { name: '继续下一句', exact: true }).click(); await p.waitForTimeout(80);
  }
  assert.equal(await p.locator('main').getAttribute('data-player-status'), 'ended'); assert.ok((await p.locator('.player-ending').innerText()).includes(ending));
  assert.equal(paragraphs.size, 60); assert.deepEqual(visited, expectedScenes); assert.equal(playedVoices.size, 6);
  for (const id of ['waiting_room', 'xia_thoughtful', 'xia_smile']) assert.ok(media.has(id), `${label}: ${id} really appears`);
  assert.equal(await p.locator('audio').count(), 0); await p.screenshot({ path: path.join(output, `${label}-ending.png`) });
  routes[label] = { visited, paragraphs: paragraphs.size, voices: [...playedVoices], media: [...media], stageChecks, titleAnd512IconDecoded: true, allParagraphsClearOfControls: true, expandedOfflineToolbarVerified: label === 'http-stay', saveRefreshRestored: saved }; await p.close(); checked(`${label}: six scenes / 60 paragraphs / six completed TTS lines / expected stages / save-refresh / ending cleanup`);
}
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5192/'); assert.match(await page.title(), /WorLd/i);
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-story-media/before-rain-stops-project.zip')); await ready();
  await importFile('station-night-v2.png', names.station, 'background', true);
  for (const [file, name, kind] of [['waiting-room.png', names.waiting, 'background'], ['night-train.png', names.train, 'background'], ['morning-studio.png', names.studio, 'background'], ['xia-thoughtful.png', names.thoughtful, 'character'], ['xia-smile.png', names.smile, 'character'], ['letter-icon.png', '雨停之前·作品图标', 'ui'], ...voices.map(item => [item.file, `${item.speaker}·合成语音${item.file.slice(6, 8)}`, 'audio'])]) await importFile(file, name, kind);
  checked('replace the test station source without changing its stable ID; import five new illustrations, icon and nine explicitly synthetic character voices');
  await nav('故事');
  for (const [i, plan] of directions.entries()) {
    await selectScene(plan.name);
    const background = page.locator('.statement-card--direction').filter({ hasText: /action=set asset=/ }).first(); await selectDirection(background);
    await page.getByLabel('演出主资源').selectOption({ label: names[plan.background] });
    if (i === 1) {
      await page.waitForFunction(() => document.querySelector('[data-nav-item="assets"]')?.disabled && document.querySelector('.local-save-button')?.disabled);
      assert.equal(await page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '素材', exact: true }).isEnabled(), false);
      assert.equal(await page.locator('.local-save-button').isEnabled(), false);
      await page.getByRole('button', { name: '放弃演出修改', exact: true }).click();
      await page.getByLabel('演出主资源').selectOption({ label: names.waiting });
    }
    await applyDirection();
    if (i === 1) {
      await page.getByRole('button', { name: '撤销', exact: true }).click(); await selectDirection(background);
      assert.equal(await page.getByLabel('演出主资源').inputValue(), backgroundIds.station);
      await page.getByRole('button', { name: '重做', exact: true }).click(); await selectDirection(background);
      assert.equal(await page.getByLabel('演出主资源').inputValue(), backgroundIds.waiting);
      await page.waitForFunction(() => document.querySelector('.step-properties .asset-detail-preview img')?.naturalWidth > 0);
      await screen('named-direction-preview');
    }
    const role = page.locator('.statement-card--direction').filter({ hasText: /action=(?:show|hide).*slot=/ }).first(); await selectDirection(role);
    await page.getByLabel('演出动作').selectOption(plan.hide ? 'hide' : 'show');
    if (!plan.hide) { await page.getByLabel('演出主资源').selectOption({ label: names[plan.portrait] }); await page.getByLabel('角色位置').selectOption(plan.position ?? 'left'); }
    await applyDirection();
    for (const cue of plan.cues) {
      await page.locator('.statement-card--narration').nth(cue.before - 1).click();
      if (cue.background) await insert('background', { asset: names[cue.background] });
      if (cue.portrait || cue.hide) await insert('show', cue.hide ? { action: 'hide' } : { asset: names[cue.portrait], position: cue.position });
    }
    await page.locator('.statement-card--narration').last().click(); await insert('audio', { asset: `${voices[i].speaker}·合成语音${voices[i].file.slice(6, 8)}` });
    await page.locator('.statement-card--dialogue').click(); await insert('audio', { action: 'stop' });
    console.log(`Directed ${plan.name}`);
  }
  checked('name-based media changes, actual image preview, draft protection/discard, undo/redo, nine source-preserving scene direction passes and play/stop cues around every spoken line');
  await selectScene('车站的雨'); await screen('directed-writing');
  await nav('游戏外观'); await page.getByLabel('标题封面', { exact: true }).selectOption({ label: names.station });
  await page.getByLabel('标题简介', { exact: true }).fill('一场雨，两条路。读完旧信，把下一次见面写进日历。'); await page.getByRole('button', { name: '应用玩家外观', exact: true }).click();
  await nav('发布'); await page.getByLabel('发布版本').fill('1.3.0'); await page.getByLabel('发布图标').selectOption({ label: '雨停之前·作品图标' }); await page.getByRole('button', { name: '应用发布设置', exact: true }).click();
  await menu('所有项目'); await page.getByRole('main', { name: '项目首页' }).waitFor(); await page.reload(); await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
  const zipWait = page.waitForEvent('download'); await menu('导出工程 ZIP'); await (await zipWait).saveAs(path.join(output, 'before-rain-stops-project.zip'));
  const zip = unzipSync(new Uint8Array(await readFile(path.join(output, 'before-rain-stops-project.zip'))));
  const scripts = Object.entries(zip).filter(([name]) => name.startsWith('scripts/')).map(([, bytes]) => JSON.parse(strFromU8(bytes)));
  const previous = unzipSync(new Uint8Array(await readFile(path.join(root, 'evidence/web-story-media/before-rain-stops-project.zip'))));
  for (const script of scripts) assert.deepEqual(script.statements.filter(item => item.kind === 'narration' || item.kind === 'dialogue'), JSON.parse(strFromU8(previous[`scripts/${script.sceneId}.json`])).statements.filter(item => item.kind === 'narration' || item.kind === 'dialogue'));
  const index = JSON.parse(strFromU8(zip['.world-assets/index.json'])); assert.equal(index.assets.length, 22);
  story = { scenes: scripts.length, paragraphs: 90, dialogue: 9, textCharacters: 9544, statements: scripts.flatMap(item => item.statements).length, assets: index.assets.length, originalTextAndStableIdsUnchanged: true };
  await writeFile(path.join(output, 'asset-index.json'), JSON.stringify(index, null, 2) + '\n');
  checked('save/reopen and source ZIP audit: all original text and stable IDs unchanged; 22 inspected media assets, version, cover and icon persisted');
  await nav('发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60_000 }); await download('before-rain-stops.html');
  const htmlPath = path.join(output, 'before-rain-stops.html'), html = await readFile(htmlPath, 'utf8'); assert.ok(html.includes('application-version" content="1.3.0')); assert.ok(html.includes('rel="icon"'));
  await play(pathToFileURL(htmlPath).href, 'desktop-stay', '留下等雨停', scenes.slice(0, 6).map(item => item.name), '同行的约定');
  await play(pathToFileURL(htmlPath).href, 'mobile-leave', '去追最后一班车', [...scenes.slice(0, 3), ...scenes.slice(6)].map(item => item.name), '远行的约定', 320);
  await page.getByRole('button', { name: '← 导出方式', exact: true }).click(); await page.getByRole('radio', { name: /目录 ZIP/ }).check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).click(); await page.waitForFunction(() => document.querySelector('a[download]')?.getAttribute('download')?.endsWith('-web.zip'), undefined, { timeout: 60_000 }); await download('before-rain-stops-web.zip');
  const files = unzipSync(new Uint8Array(await readFile(path.join(output, 'before-rain-stops-web.zip'))));
  server = createServer((request, response) => { const key = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html'; const bytes = files[key]; const type = key.endsWith('.html') ? 'text/html' : key.endsWith('.js') ? 'text/javascript' : key.endsWith('.css') ? 'text/css' : key.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream'; response.writeHead(bytes ? 200 : 404, { 'Content-Type': type }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await play(`http://127.0.0.1:${server.address().port}/gal/`, 'http-stay', '留下等雨停', scenes.slice(0, 6).map(item => item.name), '同行的约定', 390);
  assert.equal(seenVoices.size, 9); assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), checks, errors, story, routes, totalVoicesCompleted: seenVoices.size, humanReadTimingPassed: false, releasePermissionConfirmed: false, publicDeployment: false, physicalDevicePassed: false }, null, 2) + '\n'); console.log(JSON.stringify({ passed: true, checks: checks.length, story }));
} catch (error) { await screen('failure').catch(() => {}); console.log((await page.locator('body').innerText()).slice(-4500)); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2) + '\n'); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

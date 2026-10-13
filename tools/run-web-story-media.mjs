import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { scenes } from '../assets/rain-story/story.mjs';

// Only UI actions author the validation project. ZIP reads below audit the result.
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-story-media');
await mkdir(output, { recursive: true });
const chrome = process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(20_000);
const checks = [], errors = [], media = {}, routes = {};
let server, story;
const checked = label => { checks.push(label); console.log(label); };
const watch = (target, label) => target.on('pageerror', error => errors.push(`${label}: ${error.message}`));
watch(page, 'editor');
const screen = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const nav = label => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: label, exact: true }).click();
async function ready() { await page.getByTestId('workspace-shell').waitFor(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); }
async function projectAction(name) { await ready(); if (!await page.locator('.project-switcher').evaluate(menu => menu.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function tools() { if (!await page.getByLabel('对白结构工具').isVisible()) await page.getByText('插入与整理内容', { exact: false }).first().click(); return page.getByLabel('对白结构工具'); }
async function insert(kind) { const bar = await tools(); await bar.getByLabel('插入 P0 语句类型').selectOption(kind); await bar.getByRole('button', { name: '＋ 插入', exact: true }).click(); }
async function selectScene(name) { await ready(); await page.locator('.scene-rail').getByRole('button', { name: new RegExp(name) }).click(); await page.getByRole('heading', { name, exact: true }).waitFor(); }
async function remove(selector) { while (await page.locator(selector).count()) { await page.locator(selector).first().click(); await (await tools()).getByRole('button', { name: '删除所选', exact: true }).click(); } }
async function bulk(lines, { speaker, audit = false } = {}) {
  const before = await page.locator('.statement-card--narration, .statement-card--dialogue').count();
  await page.getByRole('button', { name: '添加成段文字', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '添加成段文字', exact: true });
  if (speaker) { await dialog.getByLabel('成段文字类型').selectOption('dialogue'); await dialog.getByLabel('成段文字说话人').selectOption({ label: speaker }); }
  await dialog.getByLabel('成段文字', { exact: true }).fill(lines.join('\n'));
  if (audit) {
    await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
    await page.keyboard.press('Control+Enter'); await page.keyboard.press('Alt+1');
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await page.locator('.statement-card--narration, .statement-card--dialogue').count(), before);
    assert.equal(await dialog.getByLabel('成段文字', { exact: true }).inputValue(), lines.join('\n'));
  }
  await dialog.getByRole('button', { name: '添加到故事', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.statement-card--narration,.statement-card--dialogue').length === count, before + lines.length);
  if (audit) {
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await page.waitForFunction(count => document.querySelectorAll('.statement-card--narration,.statement-card--dialogue').length === count, before);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await page.waitForFunction(count => document.querySelectorAll('.statement-card--narration,.statement-card--dialogue').length === count, before + lines.length);
    // General undo/redo preserves any still-valid selection, not a historical cursor.
    await page.locator('.statement-card--narration, .statement-card--dialogue').last().click();
    checked('bulk text: dirty Escape and shortcut isolation, ordered insertion and one-step undo/redo through the writing UI');
  }
}
async function direction(kind, { asset, bus, volume = '.3', loop = false, action, position = 'left' } = {}) {
  await insert(kind);
  const dialog = page.getByRole('dialog', { name: `添加${kind === 'background' ? '背景' : kind === 'show' ? '角色' : '音频'}演出`, exact: true });
  if (action) await dialog.getByLabel('新增演出动作').selectOption(action);
  if (asset) await dialog.getByLabel('新增演出资源').selectOption({ label: asset });
  if (kind === 'background') { await dialog.getByLabel('新增背景转场').selectOption('fade'); await dialog.getByLabel('新增背景转场时长').fill('300ms'); }
  if (kind === 'show' && asset) await dialog.getByLabel('新增角色位置').selectOption(position);
  if (kind === 'audio') {
    await dialog.getByLabel('新增音频总线').selectOption(bus);
    if (asset) {
      if (asset === '夜行与回信（原创合成音乐）' && !media.volumeChecked) {
        await dialog.getByLabel('新增音频音量').fill('1.2');
        assert.equal(await dialog.getByRole('button', { name: '插入演出', exact: true }).isEnabled(), false);
        await dialog.getByText('音量需要在 0–1 之间，最多三位小数。', { exact: true }).waitFor();
        await dialog.getByLabel('新增音频音量').fill('0.1234'); assert.equal(await dialog.getByRole('button', { name: '插入演出', exact: true }).isEnabled(), false); media.volumeChecked = true;
      }
      await dialog.getByLabel('新增音频音量').fill(volume);
      if (loop) await dialog.getByLabel('循环播放音频').check();
      await dialog.getByLabel(`试听 ${asset}`, { exact: true }).waitFor();
    }
  }
  const count = await page.locator('.statement-card--direction').count();
  await dialog.getByRole('button', { name: '插入演出', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.statement-card--direction').length === count, count + 1);
}
async function apply() { await page.locator('.sequence-inspector').getByRole('button', { name: '应用修改', exact: true }).click(); }
async function ending(name) { await page.locator('.statement-card--end').click(); await page.getByLabel('结局名称', { exact: true }).fill(name); await apply(); }
async function download(filename) { const waiting = page.waitForEvent('download'); await page.getByRole('link', { name: '下载游戏', exact: true }).click(); await (await waiting).saveAs(path.join(output, filename)); return path.join(output, filename); }
const backgrounds = { station: '雨后的车站（测试背景）', cafe: '雨夜面馆', coast: '雨后的海边街道' };
const music = '夜行与回信（原创合成音乐）', rain = '屋檐雨声（原创合成）', chime = '进站提示音（原创合成）', portrait = '小夏·手中的信';

// A route runs every displayed paragraph; media must really decode/play, not just exist in the ZIP.
async function playRoute(target, label, choice, expectedScenes, endingName, save = false, url = pathToFileURL(path.join(output, 'before-rain-stops.html')).href) {
  const observed = [], resources = new Set(), paragraphs = new Set(); let saved = false, first = true, cafe = false;
  await target.goto(url);
  await target.getByRole('button', { name: /^开始故事/ }).click();
  for (let step = 0; step < 260; step++) {
    const state = await target.locator('main[data-player-status]').getAttribute('data-player-status');
    const text = await target.locator('.player-dialogue__text').textContent().catch(() => '');
    const scene = scenes.find(item => item.prose.includes(text));
    if (scene) paragraphs.add(text);
    if (scene && observed.at(-1) !== scene.name) { observed.push(scene.name); console.log(`${label}: ${scene.name}`); }
    if (text) assert.ok(await target.locator('.player-dialogue').evaluate(item => { const r = item.getBoundingClientRect(), stage = document.querySelector('.player-stage').getBoundingClientRect(); return r.top >= Math.max(0, stage.top) && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= Math.min(innerHeight, stage.bottom); }), 'Paragraph is inside both viewport AND its clipping stage');
    for (const id of await target.locator('[data-asset-id]').evaluateAll(items => items.map(item => item.dataset.assetId))) resources.add(id);
    if (first && text) {
      await target.waitForFunction(() => { const portrait = document.querySelector('.player-stage-character'); return portrait && (portrait.naturalWidth > 0 || portrait.dataset.canvasSampling === 'ready') && [...document.querySelectorAll('audio[data-audio-bus]')].filter(item => !item.paused && item.currentTime > 0).length >= 2; });
      media[label] = await target.locator('audio[data-audio-bus]').evaluateAll(items => items.map(item => ({ bus: item.dataset.audioBus, volume: item.volume, loop: item.loop, currentTime: item.currentTime, paused: item.paused })));
      assert.ok(media[label].some(item => item.bus === 'bgm' && item.volume > 0 && item.loop));
      assert.equal(await target.locator('.player-stage-character').evaluate(item => item.style.left), '20%');
      await target.screenshot({ path: path.join(output, `${label}-station.png`), animations: 'disabled' }); first = false;
    }
    if (await target.locator('.player-stage-background[data-asset-id="night_cafe"]').count() && !cafe) { await target.waitForFunction(() => { const bg = document.querySelector('.player-stage-background'); return bg && (bg.naturalWidth > 0 || bg.dataset.canvasSampling === 'ready'); }); await target.screenshot({ path: path.join(output, `${label}-cafe.png`), animations: 'disabled' }); cafe = true; }
    if (await target.locator('audio[data-audio-bus="sfx"]').count() && !media.chimePlayed) { await target.waitForFunction(() => document.querySelector('audio[data-audio-bus="sfx"]')?.currentTime > 0); media.chimePlayed = true; }
    if (save && scene?.name === '候车室的旧信' && !saved) {
      await target.getByRole('button', { name: '快速保存', exact: true }).click();
      await target.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
      const hash = await target.locator('main').getAttribute('data-runtime-state-hash');
      await target.reload(); await target.getByRole('button', { name: '快速读取', exact: true }).click();
      await target.waitForFunction(value => document.querySelector('main')?.dataset.runtimeStateHash === value, hash);
      await target.waitForFunction(() => [...document.querySelectorAll('audio[data-audio-bus]')].some(item => !item.paused && item.currentTime > 0));
      saved = true; checked('mid-story quick save / page refresh / load restores exactly the same runtime state and resumes actual audio');
    }
    if (state === 'ended') break;
    if (await target.locator('.player-choice button').count()) await target.locator('.player-choice').getByRole('button', { name: new RegExp(choice) }).click();
    else { await target.getByRole('button', { name: '继续下一句', exact: true }).click(); await target.waitForTimeout(70); }
  }
  assert.equal(await target.locator('main').getAttribute('data-player-status'), 'ended');
  assert.ok((await target.locator('.player-ending').innerText()).includes(endingName));
  assert.deepEqual(observed, expectedScenes);
  assert.equal(paragraphs.size, 60, 'Every paragraph on this route must actually be presented');
  assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(await target.locator('audio[data-audio-bus]').count(), 0, 'Ending stops both music and ambience');
  await target.screenshot({ path: path.join(output, `${label}-ending.png`), animations: 'disabled' });
  routes[label] = { observed, paragraphsSeen: paragraphs.size, resources: [...resources], savedAndReloaded: saved };
  checked(`${label}: all six scenes, selected ending, decoded portrait/background, audible music/rain and ending cleanup`);
}

try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5191/'); assert.match(await page.title(), /WorLd/i);
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-writing-appearance/before-rain-stops-project.zip')); await ready();
  await projectAction('章节与角色'); await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByRole('button', { name: '编辑角色：旅人', exact: true }).click();
  await page.getByLabel('角色显示名').fill('林远'); await page.getByRole('button', { name: '保存角色', exact: true }).click();
  await page.getByRole('button', { name: '返回创作', exact: true }).click(); await ready();
  for (const scene of scenes.filter(item => !['车站的雨', '留下', '远行'].includes(item.name))) {
    await page.getByRole('button', { name: '添加内容', exact: true }).click(); await page.getByRole('button', { name: '添加场景', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '创建场景', exact: true }); await dialog.getByLabel('新场景名称').fill(scene.name);
    await dialog.getByRole('button', { name: '创建并写作', exact: true }).click(); await ready();
  }
  checked('import prior editable work, rename protagonist and create six connected writing scenes through ordinary authoring UI');
  for (const [file, name, kind] of [['xia-letter.png', portrait, 'character'], ['night-cafe.png', backgrounds.cafe, 'background'], ['coastal-morning.png', backgrounds.coast, 'background'], ['night-travel-theme.wav', music, 'audio'], ['soft-rain.wav', rain, 'audio'], ['station-chime.wav', chime, 'audio']]) {
    await nav('素材'); await page.getByRole('button', { name: '导入与管理素材', exact: true }).click();
    await page.getByLabel('选择资源文件').setInputFiles(path.join(root, 'assets/rain-story', file)); await page.getByLabel('资源显示名称').fill(name); await page.getByLabel('资源类型', { exact: true }).selectOption(kind);
    await page.getByRole('button', { name: '导入到资源保险库', exact: true }).click(); await page.getByText('资源导入完成', { exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭资源保险库', exact: true }).click();
  }
  await page.getByRole('button', { name: `管理素材：${music}`, exact: true }).click();
  const audition = page.getByLabel(`试听 ${music}`, { exact: true }); await audition.waitFor();
  await audition.click({ position: { x: 22, y: 27 } }); await page.waitForFunction(() => [...document.querySelectorAll('.asset-audio-preview audio')].some(item => !item.paused && item.currentTime > 0));
  await screen('audio-audition'); await page.getByRole('button', { name: '关闭资源保险库', exact: true }).click();
  assert.equal(await page.locator('.asset-audio-preview audio').count(), 0);
  checked('import all six original media files with inspections; actively audition music and close/release the audio preview');
  await nav('故事');
  for (const [index, scene] of scenes.entries()) {
    await selectScene(scene.name);
    await remove('.statement-card--dialogue, .statement-card--narration, .statement-card--choice, .statement-card--set');
    // Existing background can remain first; fresh scenes get one through the insert form.
    if (!await page.locator('.statement-card--direction').count()) await direction('background', { asset: backgrounds[scene.background] });
    else await page.locator('.statement-card--direction').last().click();
    if (scene.name === '车站的雨') { await direction('audio', { asset: music, bus: 'bgm', loop: true }); await direction('audio', { asset: rain, bus: 'ambient', volume: '.2', loop: true }); }
    if (scene.name === '车窗与海' || scene.ending) await direction('audio', { bus: 'ambient', action: 'stop' });
    if (scene.name === '站台前的约定') await direction('audio', { asset: chime, bus: 'sfx', volume: '.35' });
    if (scene.name === '车窗与海') await direction('show', { action: 'hide' });
    else await direction('show', { asset: portrait, position: scene.background === 'cafe' ? 'right' : 'left' });
    await bulk(scene.prose, { audit: index === 0 });
    if (scene.name === '留下') {
      await page.locator('.statement-card--narration').nth(3).click(); await direction('background', { asset: backgrounds.cafe });
      await direction('audio', { asset: rain, bus: 'ambient', volume: '.12', loop: true });
      await page.locator('.statement-card--narration').last().click();
    }
    if (scene.name === '雨后的天明') {
      await page.locator('.statement-card--narration').nth(6).click(); await direction('background', { asset: backgrounds.coast });
      await page.locator('.statement-card--narration').last().click();
    }
    if (scene.name === '远行') {
      await page.locator('.statement-card--narration').nth(2).click(); await direction('show', { action: 'hide' });
      await direction('audio', { bus: 'ambient', action: 'stop' });
      await page.locator('.statement-card--narration').last().click();
    }
    const closing = [
      ['林远', '进去读吧。我想先把今天的话说完。'], ['小夏', '把那个日期圈起来，变化了我们提前说。'], ['林远', '这次我不会只回答一句以后。'],
      ['林远', '明天还要出发，可今晚的回信不用再等。'], ['小夏', '信可以有下一封，闹钟也记得设好。'], ['小夏', '到了就告诉我实际的样子，不用只讲顺利的事。'],
      ['小夏', '先吃一顿热饭，信里的故事慢慢回。'], ['林远', '下次一起走这条路，我们穿舒服的鞋。'], ['小夏', '我们有时间，把上次的故事继续讲完。']
    ][index];
    await bulk([closing[1]], { speaker: closing[0] });
    if (scene.next) {
      await insert('jump'); await page.getByRole('form', { name: '跳转类型化参数' }).getByLabel('接下来进入').selectOption({ label: `场景：${scene.next}` }); await apply();
      await remove('.statement-card--end');
    } else if (scene.ending) {
      await direction('audio', { bus: 'bgm', action: 'stop' }); await direction('audio', { bus: 'ambient', action: 'stop' }); await direction('audio', { bus: 'sfx', action: 'stop' }); await ending(scene.ending);
    } else {
      await insert('choice'); const form = page.getByRole('form', { name: '选择类型化参数' });
      await form.getByLabel('选择提示').fill('最后一班车到了，你准备怎样继续这个约定？');
      for (const [i, label, destination] of [[0, '留下等雨停', '留下'], [1, '去追最后一班车', '远行']]) { await form.getByLabel('选项文本').nth(i).fill(label); await form.getByLabel('接下来进入').nth(i).selectOption({ label: `场景：${destination}` }); }
      await apply(); await remove('.statement-card--end');
    }
    console.log(`Authored ${scene.name}: ${scene.prose.length} paragraphs + dialogue`);
  }
  checked('author nine scenes with 90 original paragraphs, character lines, six-scene routes, position/volume/loops, transitions and media stops before endings');
  await selectScene('车站的雨'); await screen('full-story-writing');
  await page.getByRole('button', { name: '试玩完整流程', exact: true }).click();
  for (let step = 0; step < 200; step++) {
    if (await page.getByText('流程完成：同行的约定', { exact: true }).count()) break;
    const route = page.getByRole('button', { name: '选择路线：留下等雨停', exact: true });
    if (await route.count()) await route.click(); else await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await page.getByText('流程完成：同行的约定', { exact: true }).waitFor(); await screen('author-preview-ending'); await page.getByRole('button', { name: '退出试玩', exact: true }).click();
  checked('writer full preview follows the complete six-scene stay route to its authored ending');
  await selectScene('车站的雨'); await projectAction('所有项目'); await page.getByRole('main', { name: '项目首页' }).waitFor(); await page.reload();
  await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
  assert.equal(await page.locator('.scene-item').count(), 9); assert.equal(await page.locator('.statement-card--narration').count(), 10);
  await nav('游戏外观'); assert.equal(await page.getByLabel('玩家主题', { exact: true }).inputValue(), 'paper');
  await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill('1.2.0'); await page.getByRole('button', { name: '应用发布设置', exact: true }).click();
  const zipWait = page.waitForEvent('download'); await projectAction('导出工程 ZIP'); await (await zipWait).saveAs(path.join(output, 'before-rain-stops-project.zip'));
  const files = unzipSync(new Uint8Array(await readFile(path.join(output, 'before-rain-stops-project.zip'))));
  const scripts = Object.entries(files).filter(([name]) => name.endsWith('.json')).map(([, bytes]) => { try { return JSON.parse(strFromU8(bytes)); } catch { return null; } }).filter(value => value?.sceneId && Array.isArray(value.statements));
  const text = scripts.flatMap(item => item.statements).filter(item => item.kind === 'narration' || item.kind === 'dialogue');
  story = { scenes: scripts.length, paragraphs: text.filter(item => item.kind === 'narration').length, dialogueLines: text.filter(item => item.kind === 'dialogue').length, textCharacters: text.reduce((total, item) => total + item.text.length, 0), originalProseCharacters: scenes.flatMap(item => item.prose).join('').length, routeProseCharacters: { stay: scenes.slice(0, 6).flatMap(item => item.prose).join('').length, leave: [...scenes.slice(0, 3), ...scenes.slice(6)].flatMap(item => item.prose).join('').length } };
  assert.equal(story.scenes, 9); assert.equal(story.paragraphs, 90); assert.equal(story.dialogueLines, 9);
  for (const script of scripts) {
    const transfer = script.statements.findIndex(item => item.kind === 'jump' || item.kind === 'choice' || item.kind === 'end');
    assert.ok(transfer > 0 && script.statements.slice(transfer + 1).every(item => item.kind !== 'narration' && item.kind !== 'dialogue'), 'Authored text must precede its scene transfer/ending');
  }
  checked('save/reopen all nine scenes, preserve appearance, apply 1.2.0 and audit actual exported source counts');
  await nav('发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60_000 });
  await download('before-rain-stops.html');
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }); watch(desktop, 'desktop player');
  await playRoute(desktop, 'desktop-stay', '留下等雨停', scenes.slice(0, 6).map(item => item.name), '同行的约定', true);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); watch(mobile, 'mobile player');
  await playRoute(mobile, 'mobile-leave', '去追最后一班车', [...scenes.slice(0, 3), ...scenes.slice(6)].map(item => item.name), '远行的约定');
  await page.getByRole('button', { name: '← 导出方式', exact: true }).click(); await page.getByRole('radio', { name: /目录 ZIP/ }).check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).click(); await page.waitForFunction(() => document.querySelector('a[download]')?.getAttribute('download')?.endsWith('-web.zip'), undefined, { timeout: 60_000 });
  const archive = unzipSync(new Uint8Array(await readFile(await download('before-rain-stops-web.zip'))));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav' };
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html'; const bytes = archive[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': types[path.extname(name)] ?? 'application/octet-stream' }); response.end(bytes ?? 'Not found'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const hosted = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }); watch(hosted, 'HTTP player');
  const hostedURL = `http://127.0.0.1:${server.address().port}/gal/`;
  await playRoute(hosted, 'http-stay', '留下等雨停', scenes.slice(0, 6).map(item => item.name), '同行的约定', true, hostedURL);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), checks, errors, story, media, routes, localDeployment: true, publicDeployment: false, humanReadTimingPassed: false, physicalDevicePassed: false, fullLengthWork: false }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, story, errors }));
} catch (error) {
  await screen('failure').catch(() => {});
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: false, checks, errors, story, media, routes, failure: error.stack }, null, 2) + '\n');
  console.log((await page.locator('body').innerText()).slice(-6000)); throw error;
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

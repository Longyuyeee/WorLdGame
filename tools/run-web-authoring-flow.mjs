import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { extendWriting, configureAppearance, verifyTitle } from './web-writing-extension.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..');
const nextBatch = process.argv.includes('--writing-appearance');
const output = path.join(root, nextBatch ? 'evidence/web-writing-appearance' : 'evidence/web-authoring-flow');
await mkdir(output, { recursive: true });
const chrome = process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15_000);
const checks = [], errors = [];
let server;
let story = null;
const watch = (target, prefix) => target.on('pageerror', error => errors.push(`${prefix}: ${error.message}`));
watch(page, 'editor');
page.on('console', message => { if (message.text().startsWith('WORLD_SAVE_TRACE')) console.log(message.text()); });
const screen = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const checked = label => { checks.push(label); console.log(label); };
async function trace(label) { console.log(JSON.stringify({ label, ...await page.evaluate(() => ({ scenes: [...document.querySelectorAll('.scene-item strong')].map(item => item.textContent), sceneId: document.querySelector('[data-testid=workspace-shell]')?.dataset.contextSceneId, save: document.querySelector('.local-save-button')?.textContent })) })); }
const nav = label => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: label, exact: true }).click();
async function ready() { await page.getByTestId('workspace-shell').waitFor(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); }
async function projectAction(name) { await ready(); if (!await page.locator('.project-switcher').evaluate(menu => menu.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function create(kind, name) {
  await ready(); await page.getByRole('button', { name: '添加内容', exact: true }).click();
  await page.getByRole('button', { name: `添加${kind}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `创建${kind}`, exact: true });
  await dialog.getByLabel(kind === '角色' ? '角色显示名' : kind === '变量' ? '变量名称' : '新场景名称', { exact: true }).fill(name);
  return dialog;
}
async function tools() { if (!await page.getByLabel('对白结构工具').isVisible()) await page.getByText('插入与整理内容', { exact: false }).first().click(); return page.getByLabel('对白结构工具'); }
async function insert(kind) { const bar = await tools(); await bar.getByLabel('插入 P0 语句类型').selectOption(kind); await bar.getByRole('button', { name: '＋ 插入', exact: true }).click(); }
async function ending(name) { await page.locator('.statement-card--end').click(); await page.getByLabel('结局名称', { exact: true }).fill(name); await page.locator('.sequence-inspector').getByRole('button', { name: '应用修改', exact: true }).click(); }
async function reachChoice(target) { for (let step = 0; step < 80; step++) { if (await target.locator('.player-choice button').count()) return; await target.getByRole('button', { name: '继续下一句', exact: true }).click(); await target.waitForTimeout(100); } throw new Error('Player did not reach the authored choice'); }
async function finish(target, route, name) {
  await target.locator('.player-choice').getByRole('button', { name: new RegExp(route) }).click();
  for (let step = 0; step < 80; step++) {
    if (await target.locator('main[data-player-status]').getAttribute('data-player-status') === 'ended') break;
    await target.getByRole('button', { name: '继续下一句', exact: true }).click(); await target.waitForTimeout(100);
  }
  await target.waitForFunction(() => document.querySelector('main[data-player-status]')?.dataset.playerStatus === 'ended');
  assert.ok((await target.locator('.player-ending').innerText()).includes(name));
}
async function download(name, filename) { const waiting = page.waitForEvent('download'); await page.getByRole('link', { name: name, exact: true }).click(); const item = await waiting; const file = path.join(output, filename); await item.saveAs(file); return file; }
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5173');
  assert.match(await page.title(), /WorLd/i, 'STUDIO_UI_URL must point to the WorLd editor');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('雨停之前');
  await page.getByRole('button', { name: '创建并开始写作', exact: true }).click();
  await ready();
  const entry = await page.getByTestId('workspace-shell').getAttribute('data-context-scene-id');
  await page.getByRole('button', { name: '创建角色', exact: true }).click();
  const role = page.getByRole('dialog', { name: '创建角色', exact: true });
  await role.getByLabel('角色显示名').fill('小夏');
  await page.keyboard.press('Escape');
  assert.equal(await role.isVisible(), true); assert.equal(await role.getByLabel('角色显示名').inputValue(), '小夏');
  await screen('create-character');
  await role.getByRole('button', { name: '创建角色', exact: true }).click(); await ready();
  assert.equal(await page.getByTestId('workspace-shell').getAttribute('data-context-scene-id'), entry);
  checked('blank-project guidance creates a character and returns to the original writing scene; dirty Escape preserves input');
  await projectAction('章节与角色');
  await page.getByRole('button', { name: '修改场景：Start', exact: true }).click();
  await page.getByLabel('新场景名称').fill('车站的雨');
  await page.getByRole('button', { name: '保存场景', exact: true }).click();
  await page.getByRole('button', { name: '新增章节', exact: true }).click();
  await page.getByLabel('新章节名称').fill('结局');
  await page.getByRole('button', { name: '创建章节', exact: true }).click();
  await screen('chapters'); await page.getByRole('button', { name: '返回创作', exact: true }).click(); await ready();
  const variable = await create('变量', '好感度');
  await variable.getByLabel('变量类型').selectOption('number');
  assert.equal(await variable.getByLabel('变量默认值').inputValue(), '0');
  await screen('create-variable'); await variable.getByRole('button', { name: '创建变量', exact: true }).click(); await ready();
  for (const [scene, name] of [['留下', '同行的约定'], ['远行', '远行的约定']]) {
    const dialog = await create('场景', scene);
    await dialog.getByLabel('新场景所属章节').selectOption({ label: '结局' });
    await dialog.getByRole('button', { name: '创建并写作', exact: true }).click(); await ready();
    assert.equal(await page.locator('.authoring-heading h2').innerText(), scene);
    await ending(name);
    await trace(`created ${scene}`);
  }
  checked('create number variable and two ending scenes directly from writing; new scenes enter writing without changing the opening scene');
  await nav('素材'); await page.getByRole('button', { name: '导入与管理素材', exact: true }).click();
  await page.getByLabel('选择资源文件').setInputFiles(path.join(root, 'docs/design/2026-10-12-system-redesign/images/sample-station.png'));
  await page.getByLabel('资源显示名称').fill('雨后的车站（测试背景）');
  await page.getByLabel('资源类型', { exact: true }).selectOption('background');
  await page.getByRole('button', { name: '导入到资源保险库', exact: true }).click();
  await page.getByText('资源导入完成', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭资源保险库', exact: true }).click();
  await nav('故事');
  await page.locator('.scene-rail').getByRole('button', { name: /车站的雨/ }).click();
  await insert('background');
  const background = page.getByRole('dialog', { name: '添加背景演出', exact: true });
  await background.getByLabel('新增演出资源').selectOption({ label: '雨后的车站（测试背景）' });
  await background.getByRole('button', { name: '插入演出', exact: true }).click();
  assert.equal(await page.locator('.statement-card--direction').count(), 1);
  await insert('dialogue');
  await page.getByLabel('对白内容', { exact: true }).fill('雨还没有停。你愿意留下来，等下一班列车吗？');
  await page.getByLabel('对白内容', { exact: true }).blur();
  await insert('set');
  assert.equal(await page.getByLabel('新的值或计算式', { exact: true }).inputValue(), '0');
  await page.getByLabel('新的值或计算式', { exact: true }).fill('1');
  await page.locator('.sequence-inspector').getByRole('button', { name: '应用修改', exact: true }).click();
  await insert('choice');
  const choice = page.getByRole('form', { name: '选择类型化参数' });
  await choice.getByLabel('选择提示').fill('最后一班车到了，你的决定是？');
  assert.equal(await page.getByRole('button', { name: '添加内容', exact: true }).isEnabled(), false);
  assert.equal(await page.locator('.scene-item').first().isEnabled(), false);
  await choice.getByLabel('选项文本').nth(0).fill('留下等雨停');
  await choice.getByLabel('选项文本').nth(1).fill('去追最后一班车');
  await choice.getByLabel('接下来进入').nth(0).selectOption({ label: '场景：留下' });
  await choice.getByLabel('接下来进入').nth(1).selectOption({ label: '场景：远行' });
  await choice.getByRole('button', { name: '应用修改', exact: true }).click();
  await page.locator('.statement-card--end').click();
  await (await tools()).getByRole('button', { name: '删除所选', exact: true }).click();
  await page.locator('.statement-card--choice').click();
  await screen('write-branches');
  await trace('before preview');
  checked('write real dialogue, assign a numeric variable with a valid default, and connect named choices to two authored endings without script editing');
  if (nextBatch) story = await extendWriting(page, { ready, create, projectAction, checked, screen });
  await page.getByRole('button', { name: '试玩完整流程', exact: true }).click();
  for (let step = 0; step < 80; step++) { if (await page.getByRole('button', { name: '选择路线：留下等雨停', exact: true }).count()) break; await page.getByRole('button', { name: 'Continue', exact: true }).click(); }
  await page.getByRole('button', { name: '选择路线：留下等雨停', exact: true }).click();
  if (nextBatch) for (let step = 0; step < 80; step++) { if (await page.getByText('流程完成：同行的约定', { exact: true }).count()) break; await page.getByRole('button', { name: 'Continue', exact: true }).click(); }
  await page.getByText('流程完成：同行的约定', { exact: true }).waitFor();
  await page.getByRole('button', { name: '退出试玩', exact: true }).click();
  await trace('after exit preview');
  await page.locator('.scene-rail').getByRole('button', { name: /车站的雨/ }).click();
  await trace('selected entry');
  if (nextBatch) await configureAppearance(page, { nav, screen, checked });
  await projectAction('所有项目'); await page.getByRole('main', { name: '项目首页' }).waitFor(); await page.reload();
  await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
  await trace('reopened');
  await page.locator('.scene-rail').getByRole('button', { name: /车站的雨/ }).click();
  assert.equal(await page.getByTestId('workspace-shell').getAttribute('data-context-scene-id'), entry);
  await page.locator('.statement-card--choice').click();
  assert.equal(await page.getByLabel('选择提示').inputValue(), '最后一班车到了，你的决定是？');
  await screen('reopened-writing');
  checked('preview a complete route, save before returning home, and reopen the original scene with persisted choices');
  if (nextBatch) {
    await nav('游戏外观');
    assert.equal(await page.getByLabel('玩家主题', { exact: true }).inputValue(), 'paper');
    assert.equal(await page.getByLabel('玩家强调色', { exact: true }).inputValue(), 'rose');
    await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill('1.1.0');
    await page.getByRole('button', { name: '应用发布设置', exact: true }).click();
    checked('reopened appearance stays intact; apply the release version before exporting the editable project');
  }
  const engineeringDownload = page.waitForEvent('download');
  await projectAction('导出工程 ZIP');
  await (await engineeringDownload).saveAs(path.join(output, 'before-rain-stops-project.zip'));
  await nav('发布');
  await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click();
  await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60_000 });
  const html = await download('下载游戏', 'before-rain-stops.html');
  await screen('published-game');
  const player = await browser.newPage({ viewport: { width: 1280, height: 800 } }); watch(player, 'HTML player');
  await player.goto(pathToFileURL(html).href); if (nextBatch) await verifyTitle(player, path.join(output, 'player-title.png')); await player.getByRole('button', { name: /^开始故事/ }).click(); await reachChoice(player);
  await player.getByRole('button', { name: '快速保存', exact: true }).click();
  await player.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '快速读取' && !button.disabled));
  const savedHash = await player.locator('main[data-player-status]').getAttribute('data-runtime-state-hash');
  if (nextBatch) {
    await player.getByRole('button', { name: '存读档', exact: true }).click();
    await player.locator('.player-save__panel').waitFor();
    assert.equal(await player.locator('.player-save__panel').evaluate(element => {
      const panel = element.getBoundingClientRect(), stage = document.querySelector('.player-stage').getBoundingClientRect();
      return panel.top >= stage.top && panel.bottom <= stage.bottom && panel.height > 120;
    }), true, 'Save header must remain inside the game stage');
    await player.screenshot({ path: path.join(output, 'player-saves.png'), animations: 'disabled' });
    assert.equal(await player.locator('.player-save__panel').evaluate(element => getComputedStyle(element).color), 'rgb(48, 43, 49)');
    await player.getByRole('button', { name: '存读档', exact: true }).click();
    await player.getByRole('button', { name: '打开剧情历史', exact: true }).click();
    await player.screenshot({ path: path.join(output, 'player-history.png'), animations: 'disabled' });
    await player.getByRole('button', { name: '关闭剧情历史', exact: true }).first().click();
    checked('paper palette applies to actual save/history panels while quick save persists the authored route');
  }
  await player.reload(); await player.getByRole('button', { name: '快速读取', exact: true }).click();
  await player.waitForFunction(hash => document.querySelector('main[data-player-status]')?.dataset.runtimeStateHash === hash, savedHash);
  await finish(player, '留下等雨停', '同行的约定');
  await player.screenshot({ path: path.join(output, 'player-first-ending.png'), animations: 'disabled' });
  const alternate = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(alternate, 'mobile HTML player');
  await alternate.goto(pathToFileURL(html).href); if (nextBatch) await verifyTitle(alternate, path.join(output, 'player-mobile-title.png')); await alternate.getByRole('button', { name: /^开始故事/ }).click(); await reachChoice(alternate);
  if (nextBatch) {
    await alternate.getByRole('button', { name: '存读档', exact: true }).click();
    assert.equal(await alternate.locator('.player-save__panel').evaluate(element => { const r = element.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true);
    await alternate.screenshot({ path: path.join(output, 'player-mobile-saves.png'), animations: 'disabled' });
    await alternate.getByRole('button', { name: '存读档', exact: true }).click();
  }
  await finish(alternate, '去追最后一班车', '远行的约定');
  await alternate.screenshot({ path: path.join(output, 'player-mobile-ending.png'), animations: 'disabled' });
  assert.ok(await alternate.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  checked('export standalone HTML; complete both endings on desktop/mobile sizes; quick save and reload restore the same state hash');
  await page.getByRole('button', { name: '← 导出方式', exact: true }).click();
  await page.getByRole('radio', { name: /目录 ZIP/ }).check();
  await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('a[download]')?.getAttribute('download')?.endsWith('-web.zip'), undefined, { timeout: 60_000 });
  const archive = await download('下载游戏', 'before-rain-stops-web.zip');
  const files = unzipSync(new Uint8Array(await readFile(archive)));
  assert.ok(files['index.html']); assert.ok(Object.keys(files).some(key => key.startsWith('media/')));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  server = createServer((request, response) => { const uri = new URL(request.url, 'http://localhost'); const name = decodeURIComponent(uri.pathname).replace(/^\/gal\//, '') || 'index.html'; const bytes = files[name]; if (!bytes) { response.writeHead(404); response.end('Not found'); return; } response.writeHead(200, { 'Content-Type': types[path.extname(name)] ?? 'application/octet-stream' }); response.end(bytes); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const deployed = `http://127.0.0.1:${server.address().port}/gal/`;
  const hosted = await browser.newPage({ viewport: { width: 1280, height: 800 } }); watch(hosted, 'directory player');
  await hosted.goto(deployed); if (nextBatch) await verifyTitle(hosted, path.join(output, 'hosted-title.png')); await hosted.getByRole('button', { name: /^开始故事/ }).click(); await reachChoice(hosted); await finish(hosted, '留下等雨停', '同行的约定');
  await hosted.screenshot({ path: path.join(output, 'local-deployment-ending.png'), animations: 'disabled' });
  checked('export directory ZIP and complete a route through a real local HTTP deployment under /gal/');
  await nav('故事'); await projectAction('章节与角色');
  await page.getByRole('button', { name: '角色', exact: true }).click(); await screen('characters');
  for (const width of [736, 390, 320]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
  await page.getByRole('button', { name: '新增角色', exact: true }).click();
  assert.ok(await page.evaluate(() => { const box = document.querySelector('.entity-edit-dialog').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1; }));
  await screen('mobile-create-character'); await page.getByRole('button', { name: '取消', exact: true }).click();
  checked('structure lists and native creation dialog fit 736/390/320px widths');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), checks, errors, localDeployment: true, publicDeployment: false, fullLengthWork: false, story }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length, errors }));
} catch (error) {
  const storage = await page.evaluate(async () => {
    const result = [];
    for (const name of ['world-studio-local-projects', 'world-studio-managed-project-workspaces']) {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const storeName = name.includes('managed') ? 'source-files' : 'project-files';
      if (db.objectStoreNames.contains(storeName)) {
        const store = db.transaction(storeName).objectStore(storeName);
        const keys = await new Promise(resolve => { const request = store.getAllKeys(); request.onsuccess = () => resolve(request.result); });
        const values = await new Promise(resolve => { const request = db.transaction(storeName).objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result); });
        for (let index = 0; index < keys.length; index++) if (String(keys[index]).endsWith('project.json') || String(keys[index]).includes('\0chapters/')) { try { result.push({ db: name, key: keys[index], manifest: JSON.parse(values[index]) }); } catch {} }
      }
      db.close();
    }
    return result;
  }).catch(() => []);
  await writeFile(path.join(output, 'failure-storage.json'), JSON.stringify(storage, null, 2));
  await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2));
  throw error;
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

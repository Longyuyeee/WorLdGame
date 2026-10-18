import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'evidence/web-info-ending-layout'); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true }), editor = await context.newPage();
const checks = [], errors = [], screenshots = [], run = new Date().toISOString().replace(/[:.]/g, '-'), labels = { preferences: '玩家设置', credits: '制作名单', ending: '结局' };
let current = editor, server;
const watch = page => { page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); }; watch(editor);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const payload = bytes => { const text = Buffer.from(bytes).toString('utf8'), tag = '<script id="world-project" type="application/json">', start = text.indexOf(tag); assert.ok(start >= 0); return JSON.parse(text.slice(start + tag.length, text.indexOf('</script>', start))); };
const checked = value => { checks.push(value); console.log(value); };
const button = (name, page = editor) => page.getByRole('button', { name, exact: true });
const ready = async () => { await editor.getByTestId('workspace-shell').waitFor(); await editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); };
const nav = name => editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const section = name => editor.getByRole('navigation', { name: '游戏界面分区' }).getByRole('button', { name: new RegExp(name) }).click();
async function action(name) { await ready(); if (!await editor.locator('.project-switcher').evaluate(e => e.open)) await editor.getByLabel('项目菜单', { exact: true }).click(); await editor.getByRole('button', { name: new RegExp(name) }).click(); }
async function download(page, trigger, name) { const pending = page.waitForEvent('download'); await trigger(); const file = path.join(out, name); await (await pending).saveAs(file); return file; }
async function shot(page, name) {
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.effect?.getComputedTiming().endTime <= 2000).map(animation => animation.finished.catch(() => {}))); });
  await page.screenshot({ path: path.join(out, name), animations: 'allow' }); screenshots.push(name);
}
async function pageLayout(surface) { await editor.getByLabel('正在编辑的界面', { exact: true }).selectOption(surface); const summary = editor.getByText(`${labels[surface]}自由组件与响应式布局`, { exact: true }); if (!await summary.locator('..').evaluate(e => e.open)) await summary.click(); await editor.getByLabel(`启用${labels[surface]}自由布局`, { exact: true }).check(); }
async function box(anchor, width, height, x = 0, y = 0) { await editor.getByLabel('组件锚点', { exact: true }).selectOption(anchor); for (const [label, value] of [['水平偏移', x], ['垂直偏移', y], ['组件宽度', width], ['组件高度', height]]) await editor.getByLabel(label, { exact: true }).fill(String(value)); }
const numbers = () => Promise.all(['组件锚点', '水平偏移', '垂直偏移', '组件宽度', '组件高度'].map(name => editor.getByLabel(name, { exact: true }).inputValue()));
async function editing() { if (await button('编辑预览布局').count()) await button('编辑预览布局').click(); await editor.getByRole('group', { name: '真实预览布局编辑画布', exact: true }).waitFor(); }
async function aligned(surface) {
  await editor.waitForFunction(surface => {
    const iframe = document.querySelector('iframe[title="游戏界面真实预览"]'), panel = iframe?.contentDocument?.querySelector(`[data-panel-layout="${surface}"]`), node = panel?.querySelector('[data-panel-region="primary"]'), outline = document.querySelector('[data-layout-handle="primary"]')?.parentElement;
    if (!node || !outline) return false;
    const host = iframe.getBoundingClientRect(), actual = node.getBoundingClientRect(), overlay = outline.getBoundingClientRect(), scale = host.width / iframe.clientWidth;
    return Math.abs(overlay.left - host.left - actual.left * scale) < 1.5 && Math.abs(overlay.top - host.top - actual.top * scale) < 1.5 && Math.abs(overlay.width - actual.width * scale) < 1.5 && Math.abs(overlay.height - actual.height * scale) < 1.5;
  }, surface);
}
async function fit(page, surface) {
  await page.waitForFunction(surface => {
    const root = document.querySelector(`[data-panel-layout="${surface}"]`); if (!root) return false;
    const nodes = [...root.querySelectorAll(':scope > [data-panel-region],:scope > .player-layout-component:not(.player-layout-component--inline),:scope > [data-panel-region="secondary"] header > button')].filter(node => getComputedStyle(node).display !== 'none');
    return nodes.length >= 3 && nodes.every(node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; });
  }, surface);
}
const text = page => page.locator('.player-dialogue__text').innerText();
async function openMenu(page, mobile) { if (mobile) await button('打开阅读菜单', page).tap(); else await button('打开阅读菜单', page).click(); await fit(page, 'menu'); }
async function openSave(page, mobile) { await openMenu(page, mobile); await page.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '存读档', exact: true }).click(); await fit(page, 'save'); }
async function advance(page) { const old = await text(page); await button('继续下一句', page).click(); await page.waitForFunction(old => document.querySelector('.player-dialogue__text')?.textContent !== old, old); }
async function completeRoute(page, mobile) {
  let choice = '';
  for (let index = 0; index < 150 && await page.locator('main').getAttribute('data-player-status') !== 'ended'; index++) {
    if (await page.locator('.player-choice').isVisible()) { const options = page.locator('.player-choice button'), target = mobile && await options.count() > 1 ? options.nth(1) : options.first(); choice = await target.innerText(); await target.click(); }
    else if (await button('继续下一句', page).isVisible()) await button('继续下一句', page).click();
    await page.waitForTimeout(70);
  }
  assert.equal(await page.locator('main').getAttribute('data-player-status'), 'ended'); await fit(page, 'ending'); return choice;
}
async function play(page, url, mobile) {
  current = page; watch(page); const prefix = mobile ? 'phone' : 'desktop'; await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.locator('.player-title-screen').waitFor();
  const sizes = mobile ? [{ width: 844, height: 390 }, { width: 390, height: 480 }, { width: 390, height: 844 }] : [{ width: 900, height: 850 }, { width: 1280, height: 900 }];
  await button('打开玩家设置', page).click(); await fit(page, 'preferences');
  const preferences = page.getByRole('dialog', { name: '玩家设置', exact: true }), font = page.getByLabel('个人字号', { exact: true });
  assert.equal(await preferences.locator('[data-layout-kind="image"]').count(), mobile ? 0 : 1);
  await font.press('End'); for (let i = 0; i < 3; i++) await font.press('ArrowLeft'); assert.equal(await font.inputValue(), '125');
  await page.getByLabel('高对比阅读', { exact: true }).check(); await page.getByLabel('总音量', { exact: true }).press('Home');
  for (const size of sizes) { await page.setViewportSize(size); await fit(page, 'preferences'); assert.equal(await font.inputValue(), '125'); assert.equal(await page.getByLabel('总音量', { exact: true }).inputValue(), '0'); assert.equal(await page.getByLabel('高对比阅读', { exact: true }).isChecked(), true); }
  await shot(page, prefix + '-preferences.png'); await button('恢复作品默认', page).click(); assert.equal(await font.inputValue(), '100'); assert.equal(await page.getByLabel('总音量', { exact: true }).inputValue(), '100');
  await font.press('End'); for (let i = 0; i < 3; i++) await font.press('ArrowLeft'); await page.getByLabel('静音全部声音', { exact: true }).check(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant');
  await button('回到玩家设置之前', page).click(); assert.equal(await page.locator('main').getAttribute('data-player-status'), 'title'); await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '打开玩家设置');
  const titleCredits = page.locator('.player-title-screen').getByRole('button', { name: '制作名单', exact: true }); await titleCredits.click(); await fit(page, 'credits');
  const credits = page.getByRole('dialog', { name: '制作名单与致谢', exact: true }), content = await credits.locator('[data-panel-region="primary"]').innerText();
  assert.ok(content.length > 20); for (const link of await credits.getByRole('link').all()) { assert.equal(await link.getAttribute('rel'), 'noopener noreferrer'); assert.match(await link.getAttribute('href'), /^https?:/); }
  for (const size of sizes) { await page.setViewportSize(size); await fit(page, 'credits'); assert.equal(await credits.locator('[data-panel-region="primary"]').innerText(), content); }
  await credits.locator('[data-panel-region="primary"]').evaluate(e => e.scrollTop = e.scrollHeight); await fit(page, 'credits'); await shot(page, prefix + '-credits.png'); await button('回到制作名单之前', page).click(); assert.equal(await titleCredits.evaluate(e => e === document.activeElement), true);
  await page.locator('.player-title-screen button').filter({ hasText: '打开这封回信' }).click(); await page.locator('.player-dialogue').waitFor(); const first = await text(page);
  await openMenu(page, mobile); await page.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '打开玩家设置', exact: true }).click(); await fit(page, 'preferences'); assert.equal(await font.inputValue(), '125');
  await button('回到玩家设置之前', page).click(); assert.equal(await text(page), first); await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '打开阅读菜单');
  await openSave(page, mobile); const save = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await save.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '保存', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); await button('回到存读档之前', page).click();
  const choice = await completeRoute(page, mobile), ending = page.locator('.player-ending'), name = await ending.locator('h2').innerText(), progress = await ending.locator('.player-ending-progress').innerText(); assert.equal(await page.locator('.player-compact-toolbar').isVisible(), false);
  for (const size of sizes) { await page.setViewportSize(size); await fit(page, 'ending'); assert.equal(await ending.locator('h2').innerText(), name); assert.equal(await ending.locator('.player-ending-progress').innerText(), progress); }
  assert.equal(await ending.locator('[data-layout-kind="image"]').count(), mobile ? 0 : 1); await shot(page, prefix + '-ending.png');
  const endingCredits = ending.getByRole('button', { name: '制作名单', exact: true }); await endingCredits.click(); await fit(page, 'credits'); await button('返回游戏', page).click(); assert.equal(await endingCredits.evaluate(e => e === document.activeElement), true); assert.equal(await ending.locator('h2').innerText(), name);
  await ending.getByRole('button', { name: '查看收藏与结局', exact: true }).click(); const collection = page.getByRole('dialog', { name: '附加内容', exact: true }); await collection.waitFor(); assert.equal(await ending.isVisible(), false); await shot(page, prefix + '-ending-collection.png'); await button('返回剧情', page).click(); assert.equal(await ending.isVisible(), true); assert.equal(await ending.locator('.player-ending-progress').innerText(), progress);
  await ending.getByRole('button', { name: '读取存档探索其他路线', exact: true }).click(); await fit(page, 'save'); await save.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '读取', exact: true }).click(); await button('取消读取', page).click(); await button('回到存读档之前', page).click(); assert.equal(await ending.locator('h2').innerText(), name);
  await ending.getByRole('button', { name: '读取存档探索其他路线', exact: true }).click(); await save.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '读取', exact: true }).click(); await button('确认读取', page).click(); await save.waitFor({ state: 'hidden' }); assert.equal(await text(page), first);
  await completeRoute(page, mobile); await ending.locator('[data-panel-region="secondary"] button').click(); await page.locator('.player-title-screen').waitFor();
  await titleCredits.click(); await fit(page, 'credits'); await button('回到制作名单之前', page).click(); await page.locator('.player-title-screen button').filter({ hasText: '打开这封回信' }).click(); await completeRoute(page, mobile); await button('回到标题继续探索', page).click(); await page.locator('.player-title-screen').waitFor();
  await button('打开玩家设置', page).click(); await fit(page, 'preferences'); assert.equal(await font.inputValue(), '125'); assert.equal(await page.getByLabel('静音全部声音', { exact: true }).isChecked(), true); await button('返回故事', page).click();
  assert.equal(await page.locator('.skin-layout-canvas').count(), 0); await page.reload(); await button('打开玩家设置', page).click(); assert.equal(await font.inputValue(), '125'); await button('返回故事', page).click();
  return { choice, ending: name, progress };
}
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-panel-layout/tomorrow-letter-0.7.0-project.zip')); await ready(); await nav('游戏外观'); await section('其他页面');
  for (const surface of ['preferences', 'credits', 'ending']) {
    await pageLayout(surface); await editor.getByLabel('布局调整设备', { exact: true }).selectOption('desktop'); await editor.getByLabel('选择布局组件', { exact: true }).selectOption('primary'); await box('bottom-left', 64, 68);
    await editor.getByLabel('选择布局组件', { exact: true }).selectOption('secondary'); await box('top-center', 90, 20);
    await button('添加图片组件').click(); await editor.getByLabel('组件文字', { exact: true }).fill(`${labels[surface]}插画`); const imageId = await editor.getByLabel('组件图片', { exact: true }).locator('option').evaluateAll(options => options.find(option => option.value)?.value); await editor.getByLabel('组件图片', { exact: true }).selectOption(imageId); await editor.getByLabel('组件显示设备', { exact: true }).selectOption('desktop'); await box('middle-right', 28, 40);
    await button('添加功能按钮').click(); await editor.getByLabel('组件文字', { exact: true }).fill(surface === 'ending' ? '回到标题继续探索' : `回到${labels[surface]}之前`); await box('bottom-right', 28, 12);
    assert.equal(await editor.getByLabel('按钮动作', { exact: true }).locator('option').count(), 1);
    assert.equal(await editor.getByLabel('本页宽度', { exact: true }).isDisabled(), true);
    await editing(); await editor.getByLabel('预览布局组件', { exact: true }).selectOption('primary'); await aligned(surface); const original = await numbers(), target = editor.locator('[data-layout-handle="primary"]'); await target.scrollIntoViewIfNeeded(); const rect = await target.boundingBox();
    await editor.mouse.move(rect.x + 24, rect.y + 24); await editor.mouse.down(); await editor.mouse.move(rect.x + 36, rect.y + 16, { steps: 6 }); assert.deepEqual(await numbers(), original); await editor.mouse.up(); assert.notDeepEqual(await numbers(), original); await button('撤销外观调整').click(); assert.deepEqual(await numbers(), original); await target.press('ArrowUp'); await aligned(surface); await shot(editor, `author-${surface}-desktop.png`);
    await editor.getByLabel('外观预览设备', { exact: true }).selectOption('phone'); await editing(); await editor.getByLabel('预览布局组件', { exact: true }).selectOption('primary'); await box('bottom-center', 100, 76); await editor.getByLabel('选择布局组件', { exact: true }).selectOption('secondary'); await box('top-center', 100, 16); await editor.getByLabel('选择布局组件', { exact: true }).selectOption('primary'); await aligned(surface); await shot(editor, `author-${surface}-phone.png`); await button('结束布局编辑').click();
  }
  checked('The actual main story authors preferences/credits/ending viewport layouts with isolated content and return regions, real-preview drag/one undo/keyboard, matching desktop/phone geometry, safe action lists and phone-hidden art.');
  await button('应用玩家外观').click(); await ready(); await button('保存到本机').click(); await ready(); await action('所有项目'); await editor.reload(); await button('打开项目：给明天的回信').click(); await ready(); await nav('游戏外观'); await section('其他页面');
  for (const surface of ['preferences', 'credits', 'ending']) { await pageLayout(surface); await editor.getByLabel('选择布局组件', { exact: true }).selectOption('layout_1'); assert.equal(await editor.getByLabel('组件显示设备', { exact: true }).inputValue(), 'desktop'); }
  await section('皮肤与动效'); await download(editor, () => button('导出皮肤配置').click(), 'letter-info-ending.worldskin.json'); await button('导出皮肤与素材').click(); const skinPack = await download(editor, () => editor.getByRole('dialog', { name: '导出带素材皮肤', exact: true }).getByRole('button', { name: '生成皮肤包', exact: true }).click(), 'letter-info-ending.worldskin.zip'); await button('关闭').click();
  await nav('发布'); await editor.getByLabel('发布版本', { exact: true }).fill('0.8.0'); await button('应用发布设置').click(); const projectFile = await download(editor, () => action('导出工程 ZIP'), 'tomorrow-letter-0.8.0-project.zip');
  await button('继续：导出方式 →').click(); await editor.locator('input[name="publication-format"][value="html"]').check(); await button('继续：生成游戏 →').click(); await button('构建试玩 HTML').click(); await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 }); const html = await download(editor, () => editor.getByRole('link', { name: '下载游戏', exact: true }).click(), 'tomorrow-letter-0.8.0.html');
  await button('← 导出方式').click(); await editor.locator('input[name="publication-format"][value="directory"]').check(); await button('继续：生成游戏 →').click(); await button('构建目录 ZIP').click(); await editor.waitForFunction(() => document.querySelector('a[download$="-web.zip"]')); const zip = await download(editor, () => editor.getByRole('link', { name: '下载游戏', exact: true }).click(), 'tomorrow-letter-0.8.0-web.zip');
  const actual = payload(await readFile(html)), previous = payload(await readFile(path.join(root, 'evidence/web-panel-layout/tomorrow-letter-0.7.0.html'))), web = unzipSync(await readFile(zip)), source = unzipSync(await readFile(projectFile));
  assert.deepEqual(actual.project.scripts, previous.project.scripts); assert.deepEqual(actual.project.characters, previous.project.characters); assert.deepEqual(actual.project.assets, previous.project.assets); for (const surface of ['title', 'reading', 'menu', 'save', 'history']) assert.deepEqual(actual.project.ui.preservedFields.webPlayerAppearance.skin.layout[surface], previous.project.ui.preservedFields.webPlayerAppearance.skin.layout[surface]); assert.equal(actual.editorPreview, undefined); assert.deepEqual(payload(web['index.html']).project, actual.project); assert.deepEqual(JSON.parse(Buffer.from(source['ui/screens.json']).toString('utf8')).webPlayerAppearance, actual.project.ui.preservedFields.webPlayerAppearance);
  checked('Save/reopen, source project, portable configuration/skin bytes and both formal exports retain all three layouts without changing story, characters, seven assets or the existing title/reading/menu/save/history layouts.');
  const desktop = await play(await context.newPage(), pathToFileURL(html).href, false);
  checked('Independent desktop file:// Player adjusts/resets/restores personal preferences, retains native credits and focus, saves and explicitly reads from ending, opens collection, finishes the first route, and uses both native/custom ending returns without losing personal settings.');
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = web[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': name.endsWith('.html') ? 'text/html' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const phone = await play(await phoneContext.newPage(), `http://127.0.0.1:${server.address().port}/gal/`, true); assert.notEqual(phone.choice, desktop.choice); await phoneContext.close();
  checked('Touch-enabled directory Player checks the three pages at 390×844, 844×390 and 390×480, retains preference values and credits while resizing, returns from native ending collection/credits/load, and finishes the other route.');
  current = editor; await action('所有项目'); await button('新建项目').click(); await editor.getByLabel('项目名称', { exact: true }).fill('功能页布局复用'); await button('创建并开始写作').click(); await ready();
  const empty = unzipSync(await readFile(await download(editor, () => action('导出工程 ZIP'), 'reuse-before-project.zip'))); await nav('游戏外观'); await section('皮肤与动效'); await editor.getByLabel('导入皮肤与素材', { exact: true }).setInputFiles(skinPack); const imported = editor.getByRole('dialog', { name: '对应皮肤素材并预览', exact: true }); await imported.getByRole('button', { name: '检查并预览皮肤', exact: true }).click(); await imported.getByText(/检查通过：新增/).waitFor(); await imported.getByRole('button', { name: '导入皮肤与素材到工程', exact: true }).click(); await imported.waitFor({ state: 'hidden' }); await ready();
  const reused = unzipSync(await readFile(await download(editor, () => action('导出工程 ZIP'), 'reused-info-ending-project.zip'))); for (const name of Object.keys(empty).filter(name => name.startsWith('scripts/') || name === 'domain/characters.json')) assert.deepEqual(reused[name], empty[name]);
  const reusedAppearance = JSON.parse(Buffer.from(reused['ui/screens.json']).toString('utf8')).webPlayerAppearance; for (const surface of ['preferences', 'credits', 'ending']) assert.equal(reusedAppearance.skin.layout[surface].components[0].visibility, 'desktop'); await section('其他页面'); await pageLayout('credits'); await editing(); await aligned('credits'); await shot(editor, 'author-reused-credits.png');
  checked('A second blank project reuses all three page layouts, hidden-device image references and actual media bytes without copying scripts or characters; its actual credits preview remains editable.');
  const build = JSON.parse(Buffer.from(web['build-info.json']).toString('utf8')); for (const file of build.files) { assert.equal(sha(web[file.path]), file.digest.slice(7)); assert.equal(web[file.path].byteLength, file.byteLength); } assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), browser: browser.version(), checks, errors, screenshots, formalEndingCoverage: '2/2 combined: HTML first route, directory other route; not all format×route combinations', editorFullRouteCoverage: 'not run', realDevice: false, publicDeployment: false, desktopRoute: desktop, phoneRoute: phone, siteFiles: build.files.length, artifacts: await Promise.all(['tomorrow-letter-0.8.0-project.zip', 'tomorrow-letter-0.8.0.html', 'tomorrow-letter-0.8.0-web.zip', 'letter-info-ending.worldskin.json', 'letter-info-ending.worldskin.zip', 'reused-info-ending-project.zip'].map(async name => { const bytes = await readFile(path.join(out, name)); return { name, bytes: bytes.length, sha256: sha(bytes) }; })) }, null, 2));
} catch (error) {
  await current.screenshot({ path: path.join(out, `failure-${run}.png`), animations: 'allow' }).catch(() => {}); await writeFile(path.join(out, `failure-${run}.json`), JSON.stringify({ checks, errors, failure: error.stack, text: await current.locator('body').innerText().catch(() => '') }, null, 2)); throw error;
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

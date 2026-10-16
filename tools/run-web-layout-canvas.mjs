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
const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'evidence/web-layout-canvas'); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
const editor = await context.newPage(), checks = [], errors = [], screenshots = [], run = new Date().toISOString().replace(/[:.]/g, '-');
let current = editor, server;
const watch = page => { page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); }; watch(editor);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const payload = bytes => { const text = Buffer.from(bytes).toString('utf8'), tag = '<script id="world-project" type="application/json">', start = text.indexOf(tag); assert.ok(start >= 0); return JSON.parse(text.slice(start + tag.length, text.indexOf('</script>', start))); };
const checked = text => { checks.push(text); console.log(text); };
const button = (name, page = editor) => page.getByRole('button', { name, exact: true });
const ready = async () => { await editor.getByTestId('workspace-shell').waitFor(); await editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); };
const nav = name => editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const section = name => editor.getByRole('navigation', { name: '游戏界面分区' }).getByRole('button', { name: new RegExp(name) }).click();
async function action(name) { await ready(); if (!await editor.locator('.project-switcher').evaluate(e => e.open)) await editor.getByLabel('项目菜单', { exact: true }).click(); await editor.getByRole('button', { name: new RegExp(name) }).click(); }
async function download(trigger, name) { const pending = editor.waitForEvent('download'); await trigger(); const file = path.join(out, name); await (await pending).saveAs(file); return file; }
async function shot(page, name) { for (const frame of page.frames()) await frame.waitForFunction(() => [...document.querySelectorAll('.player-dialogue__text,.player-title-screen')].every(e => !e.getClientRects().length || Number(getComputedStyle(e).opacity) >= .95), undefined, { timeout: 4000 }).catch(() => {}); await page.screenshot({ path: path.join(out, name), animations: 'allow' }); screenshots.push(name); }
async function layout(surface) { await section(surface === 'title' ? '标题画面' : '阅读与选项'); const summary = editor.getByText(`${surface === 'title' ? '标题' : '阅读'}自由组件与响应式布局`, { exact: true }); if (!await summary.locator('..').evaluate(e => e.open)) await summary.click(); }
async function setBox(anchor, width, height, x = 0, y = 0) { await editor.getByLabel('组件锚点', { exact: true }).selectOption(anchor); for (const [label, value] of [['水平偏移', x], ['垂直偏移', y], ['组件宽度', width], ['组件高度', height]]) await editor.getByLabel(label, { exact: true }).fill(String(value)); }
async function numbers() { return Promise.all(['组件锚点', '水平偏移', '垂直偏移', '组件宽度', '组件高度'].map(name => editor.getByLabel(name, { exact: true }).inputValue())); }
const handle = id => editor.locator(`[data-layout-handle="${id}"]`);
async function editing() { if (await button('编辑预览布局').count()) await button('编辑预览布局').click(); await editor.getByRole('group', { name: '真实预览布局编辑画布', exact: true }).waitFor(); }
async function select(id) { await editor.getByLabel('预览布局组件', { exact: true }).selectOption(id); }
async function drag(target, dx, dy, cancel = false) {
  await target.scrollIntoViewIfNeeded(); const box = await target.boundingBox(); assert.ok(box);
  const x = box.x + Math.min(30, box.width / 2), y = box.y + Math.min(30, box.height / 2);
  const before = await numbers(); await editor.mouse.move(x, y); await editor.mouse.down(); await editor.mouse.move(x + dx, y + dy, { steps: 8 });
  assert.deepEqual(await numbers(), before, 'drag must remain transient until release');
  if (cancel) await editor.keyboard.press('Escape'); await editor.mouse.up(); return before;
}
async function previewFrame() {
  const frame = await (await editor.locator('iframe[title="游戏界面真实预览"]').elementHandle()).contentFrame();
  await frame.waitForFunction(() => document.querySelector('main')?.dataset.layoutTitle === 'true' || document.querySelector('main')?.dataset.layoutReading === 'true'); return frame;
}
async function aligned(id, selector) {
  await editor.waitForFunction(({ id, selector }) => {
    const iframe = document.querySelector('iframe[title="游戏界面真实预览"]'), node = iframe?.contentDocument?.querySelector(selector), outline = document.querySelector(`[data-layout-handle="${id}"]`)?.parentElement;
    if (!node || !outline) return false;
    const host = iframe.getBoundingClientRect(), actual = node.getBoundingClientRect(), overlay = outline.getBoundingClientRect(), scale = host.width / iframe.clientWidth;
    return Math.abs(overlay.left - host.left - actual.left * scale) < 1.5 && Math.abs(overlay.top - host.top - actual.top * scale) < 1.5 && Math.abs(overlay.width - actual.width * scale) < 1.5 && Math.abs(overlay.height - actual.height * scale) < 1.5;
  }, { id, selector });
}
async function outputGame(page, url, mobile) {
  current = page; watch(page); await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('main')?.dataset.layoutTitle === 'true');
  assert.equal(await page.locator('.skin-layout-canvas').count(), 0);
  assert.equal(await page.locator('[data-layout-component="layout_2"]').count(), mobile ? 0 : 1);
  assert.equal(await page.locator('[data-layout-component="layout_3"]').count(), mobile ? 1 : 0);
  assert.ok(await button('读取存档', page).isEnabled());
  await button('打开玩家设置', page).click(); await page.getByLabel('静音全部声音', { exact: true }).check(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button('返回故事', page).click();
  await shot(page, mobile ? 'phone-title.png' : 'desktop-title.png');
  await page.locator('.player-title-screen button').filter({ hasText: '打开这封回信' }).click();
  await page.locator('.player-dialogue').waitFor(); await page.waitForFunction(() => document.querySelector('main')?.dataset.layoutReading === 'true');
  assert.equal(await page.locator('[data-layout-component="layout_2"]').count(), mobile ? 0 : 1);
  const first = await page.locator('.player-dialogue__text').innerText(); await button('记住这一句', page).click();
  const dialog = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await dialog.waitFor(); await dialog.locator('[data-save-slot="manual-1"]').getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved'); assert.equal(await dialog.locator('[data-save-slot="manual-1"] .player-save-card__excerpt').innerText(), first);
  await button('关闭存读档', page).click(); assert.equal(await page.evaluate(() => document.activeElement?.textContent), '记住这一句'); assert.equal(await page.locator('.player-dialogue__text').innerText(), first);
  if (mobile) {
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-layout-component="layout_2"]').count(), 0); await shot(page, 'phone-landscape.png'); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
  }
  await shot(page, mobile ? 'phone-reading.png' : 'desktop-reading.png');
  let choice = '';
  for (let i = 0; i < 150 && await page.locator('main').getAttribute('data-player-status') !== 'ended'; i++) {
    if (await page.locator('.player-choice').isVisible()) { const options = page.locator('.player-choice button'), target = mobile && await options.count() > 1 ? options.nth(1) : options.first(); choice = await target.innerText(); await target.click(); }
    else if (await button('继续下一句', page).isVisible()) await button('继续下一句', page).click();
    await page.waitForTimeout(70);
  }
  assert.equal(await page.locator('main').getAttribute('data-player-status'), 'ended'); await shot(page, mobile ? 'phone-ending.png' : 'desktop-ending.png'); return choice;
}
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-responsive-layout/tomorrow-letter-0.5.0-project.zip')); await ready(); await nav('游戏外观'); await layout('title'); await editing(); await select('layout_2');
  const original = await drag(handle('layout_2'), 35, 18); assert.notDeepEqual(await numbers(), original);
  const moved = await numbers(); await button('撤销外观调整').click(); assert.deepEqual(await numbers(), original); await button('重做外观调整').click(); assert.deepEqual(await numbers(), moved);
  await drag(handle('layout_2'), 40, 15, true); assert.deepEqual(await numbers(), moved);
  await handle('layout_2').press('ArrowRight'); const nudged = await numbers(); assert.equal(Number(nudged[1]), Number(moved[1]) + 1);
  await handle('layout_2').press('Shift+ArrowDown'); const stepped = await numbers(); assert.equal(Number(stepped[2]), Number(nudged[2]) + 5);
  await handle('layout_2').press('Alt+ArrowRight'); assert.equal(Number((await numbers())[3]), Number(stepped[3]) + 1);
  const beforeResize = await drag(button('调整布局尺寸：回信插画'), 15, 10); assert.ok(Number((await numbers())[3]) > Number(beforeResize[3]));
  await aligned('layout_2', '[data-layout-component="layout_2"]');
  const frame = await previewFrame(); assert.equal(await frame.locator('main').getAttribute('data-player-status'), 'title');
  await shot(editor, 'author-drag-and-resize.png');
  checked('The actual 0.5.0 main story is edited over the formal Player: scaled drag commits once, one undo/redo restores it, Escape leaves the draft unchanged, keyboard move/resize and pointer resize work without starting the game.');

  await editor.getByLabel('组件显示设备', { exact: true }).selectOption('desktop');
  await editor.getByLabel('布局调整设备', { exact: true }).selectOption('mobile'); assert.equal(await editor.getByLabel('外观预览设备', { exact: true }).inputValue(), 'phone'); await editing(); await select('layout_2');
  assert.equal(await handle('layout_2').count(), 0); await editor.getByText('所选组件在当前设备隐藏。', { exact: false }).waitFor();
  await button('恢复此组件在所有设备显示').click(); await handle('layout_2').waitFor(); await button('撤销外观调整').click(); assert.equal(await handle('layout_2').count(), 0);
  await editor.getByLabel('外观预览设备', { exact: true }).selectOption('desktop'); assert.equal(await editor.getByLabel('布局调整设备', { exact: true }).inputValue(), 'desktop');
  await select('layout_3'); await editor.getByLabel('组件显示设备', { exact: true }).selectOption('mobile');
  await editor.getByLabel('外观预览设备', { exact: true }).selectOption('phone'); await editing(); await select('layout_3'); await handle('layout_3').press('ArrowDown'); assert.equal(await editor.getByLabel('手机独立布局', { exact: true }).isChecked(), true);
  await shot(editor, 'author-phone-hidden-and-conflicts.png');
  checked('Inspector and actual-preview device/selection stay synchronized; hidden mobile decoration is still selectable and can be restored/undone, while a phone-only button receives a separate mobile geometry edit.');

  await editor.getByLabel('外观预览设备', { exact: true }).selectOption('desktop');
  await editor.getByLabel('选择布局组件', { exact: true }).selectOption('primary'); await setBox('bottom-right', 48, 62); await editing();
  const mainIssue = editor.locator('.skin-layout-issues li').filter({ has: button('定位：作品信息') }); await mainIssue.waitFor(); await mainIssue.getByRole('button', { name: '定位：作品信息', exact: true }).click(); assert.equal(await editor.getByLabel('选择布局组件', { exact: true }).inputValue(), 'primary');
  await shot(editor, 'author-main-overlap.png'); await mainIssue.getByRole('button', { name: '恢复两组安全布局', exact: true }).click();
  assert.equal(await editor.locator('.skin-layout-issues li').filter({ has: button('定位：作品信息') }).count(), 0);
  await editor.getByLabel('选择布局组件', { exact: true }).selectOption('primary'); await setBox('top-left', 58, 30); await editor.getByLabel('选择布局组件', { exact: true }).selectOption('secondary'); await setBox('bottom-right', 48, 62);
  await editor.getByLabel('选择布局组件', { exact: true }).selectOption('layout_4'); await setBox('top-left', 30, 12); await editing();
  const customIssue = editor.locator('.skin-layout-issues li').filter({ has: button('定位：阅读之前设置') }); await customIssue.waitFor(); assert.equal(await customIssue.getByRole('button', { name: '寻找可用位置', exact: true }).isEnabled(), true); await customIssue.getByRole('button', { name: '寻找可用位置', exact: true }).click();
  assert.equal(await editor.locator('.skin-layout-issues li').filter({ has: button('定位：阅读之前设置') }).count(), 0);
  await shot(editor, 'author-repaired-title.png'); await button('结束布局编辑').click();
  checked('Real overlap diagnostics locate the responsible component, safely repair the essential pair in one edit and find an actually non-overlapping custom-button position; unavailable mobile space is reported without removing native entry points.');

  await layout('reading'); await editor.getByLabel('布局调整设备', { exact: true }).selectOption('desktop'); await editor.getByLabel('选择布局组件', { exact: true }).selectOption('layout_2'); await editor.getByLabel('组件显示设备', { exact: true }).selectOption('desktop');
  await editing(); await select('primary'); await handle('primary').press('ArrowUp'); await aligned('primary', '.player-dialogue'); await shot(editor, 'author-reading-layout.png');
  await button('放大预览').click(); await editing(); await select('primary'); await aligned('primary', '.player-dialogue');
  const beforeTouch = await numbers(), touchTarget = await handle('primary').boundingBox();
  const touch = await context.newCDPSession(editor), point = { x: touchTarget.x + touchTarget.width / 2, y: touchTarget.y + 24 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }); await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - 30 }] }); await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.notDeepEqual(await numbers(), beforeTouch); await aligned('primary', '.player-dialogue'); await shot(editor, 'author-expanded-touch-layout.png'); await touch.detach();
  await button('收起预览').click(); await button('撤销外观调整').click(); assert.deepEqual(await numbers(), beforeTouch);
  if (await button('结束布局编辑').count()) await button('结束布局编辑').click();
  await button('应用玩家外观').click(); await ready(); await button('保存到本机').click(); await ready(); await action('所有项目'); await editor.reload(); await button('打开项目：给明天的回信').click(); await ready(); await nav('游戏外观'); await layout('title');
  await editor.getByLabel('选择布局组件', { exact: true }).selectOption('layout_2'); assert.equal(await editor.getByLabel('组件显示设备', { exact: true }).inputValue(), 'desktop');
  await section('皮肤与动效'); const skinJson = await download(() => button('导出皮肤配置').click(), 'letter-canvas.worldskin.json');
  await button('导出皮肤与素材').click(); const skinPack = await download(() => editor.getByRole('dialog', { name: '导出带素材皮肤', exact: true }).getByRole('button', { name: '生成皮肤包', exact: true }).click(), 'letter-canvas.worldskin.zip'); await button('关闭').click();
  await nav('发布'); await editor.getByLabel('发布版本', { exact: true }).fill('0.6.0'); await button('应用发布设置').click(); const projectFile = await download(() => action('导出工程 ZIP'), 'tomorrow-letter-0.6.0-project.zip');
  await button('继续：导出方式 →').click(); await editor.locator('input[name="publication-format"][value="html"]').check(); await button('继续：生成游戏 →').click(); await button('构建试玩 HTML').click(); await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 }); const html = await download(() => editor.getByRole('link', { name: '下载游戏', exact: true }).click(), 'tomorrow-letter-0.6.0.html');
  await button('← 导出方式').click(); await editor.locator('input[name="publication-format"][value="directory"]').check(); await button('继续：生成游戏 →').click(); await button('构建目录 ZIP').click(); await editor.waitForFunction(() => document.querySelector('a[download$="-web.zip"]')); const zip = await download(() => editor.getByRole('link', { name: '下载游戏', exact: true }).click(), 'tomorrow-letter-0.6.0-web.zip');
  const actual = payload(await readFile(html)), previous = payload(await readFile(path.join(root, 'evidence/web-responsive-layout/tomorrow-letter-0.5.0.html'))), web = unzipSync(await readFile(zip));
  assert.deepEqual(actual.project.scripts, previous.project.scripts); assert.deepEqual(actual.project.characters, previous.project.characters); assert.deepEqual(actual.project.assets, previous.project.assets); assert.equal(actual.editorPreview, undefined); assert.deepEqual(payload(web['index.html']).project, actual.project);
  const source = unzipSync(await readFile(projectFile)), appearance = JSON.parse(Buffer.from(source['ui/screens.json']).toString('utf8')).webPlayerAppearance; assert.deepEqual(appearance, actual.project.ui.preservedFields.webPlayerAppearance);
  checked('Author reading edits, local save/reopen, source ZIP, portable configuration, skin bytes and both formal game exports retain the new layout/visibility. Plot, characters and seven original assets remain unchanged.');

  const desktopRoute = await outputGame(await context.newPage(), pathToFileURL(html).href, false);
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = web[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': name.endsWith('.html') ? 'text/html' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), phone = await phoneContext.newPage();
  const phoneRoute = await outputGame(phone, `http://127.0.0.1:${server.address().port}/gal/`, true); assert.notEqual(phoneRoute, desktopRoute); await phoneContext.close();
  const build = JSON.parse(Buffer.from(web['build-info.json']).toString('utf8')); for (const file of build.files) { assert.equal(sha(web[file.path]), file.digest.slice(7)); assert.equal(web[file.path].byteLength, file.byteLength); }
  checked('Independent file:// HTML and touch-enabled directory Player apply device visibility, retain native load/settings and save focus/current sentence, survive portrait/landscape rotation and reach two different endings; no author canvas appears in exports.');

  current = editor; await action('所有项目'); await button('新建项目').click(); await editor.getByLabel('项目名称', { exact: true }).fill('画布皮肤复用'); await button('创建并开始写作').click(); await ready();
  const empty = unzipSync(await readFile(await download(() => action('导出工程 ZIP'), 'reuse-before-project.zip'))); await nav('游戏外观'); await section('皮肤与动效'); await editor.getByLabel('导入皮肤与素材', { exact: true }).setInputFiles(skinPack);
  const imported = editor.getByRole('dialog', { name: '对应皮肤素材并预览', exact: true }); await imported.getByRole('button', { name: '检查并预览皮肤', exact: true }).click(); await imported.getByText(/检查通过：新增/).waitFor(); await imported.getByRole('button', { name: '导入皮肤与素材到工程', exact: true }).click(); await imported.waitFor({ state: 'hidden' }); await ready();
  const reused = unzipSync(await readFile(await download(() => action('导出工程 ZIP'), 'reused-canvas-project.zip')));
  for (const name of Object.keys(empty).filter(name => name.startsWith('scripts/') || name === 'domain/characters.json')) assert.deepEqual(reused[name], empty[name]);
  const reusedSkin = JSON.parse(Buffer.from(reused['ui/screens.json']).toString('utf8')).webPlayerAppearance.skin; assert.equal(reusedSkin.layout.title.components.find(row => row.id === 'layout_2').visibility, 'desktop'); assert.equal(reusedSkin.layout.title.components.find(row => row.id === 'layout_3').visibility, 'mobile');
  await layout('title'); await editing(); await select('layout_2'); await shot(editor, 'author-reused-canvas.png');
  checked('A blank second project reuses actual skin bytes, device visibility and canvas coordinates without copying source scripts or characters.');
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), browser: browser.version(), checks, errors, screenshots, desktopRoute, phoneRoute, siteFiles: build.files.length, formalEndingCoverage: '2/2 combined: HTML first route, directory other route; not all format×route combinations', editorFullRouteCoverage: 'not run', realDevice: false, publicDeployment: false, artifacts: await Promise.all(['tomorrow-letter-0.6.0-project.zip', 'tomorrow-letter-0.6.0.html', 'tomorrow-letter-0.6.0-web.zip', 'letter-canvas.worldskin.json', 'letter-canvas.worldskin.zip', 'reused-canvas-project.zip'].map(async name => { const bytes = await readFile(path.join(out, name)); return { name, bytes: bytes.length, sha256: sha(bytes) }; })) }, null, 2));
} catch (error) {
  await current.screenshot({ path: path.join(out, `failure-${run}.png`), animations: 'allow' }).catch(() => {});
  await writeFile(path.join(out, `failure-${run}.json`), JSON.stringify({ checks, errors, failure: error.stack, text: await current.locator('body').innerText().catch(() => '') }, null, 2)); throw error;
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

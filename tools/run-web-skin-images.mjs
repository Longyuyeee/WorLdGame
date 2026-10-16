// Real author controls/downloads and public player input. Canvas produces new procedural test fixtures only.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'evidence/web-skin-images'); await mkdir(out, { recursive: true });
const surfaces = ['title', 'reading', 'menu', 'save', 'history', 'preferences', 'additional', 'credits', 'ending'];
const states = ['normal', 'hover', 'pressed', 'disabled'], stateLabels = ['普通按钮图片', '悬停与焦点图片', '按下按钮图片', '禁用按钮图片'];
const labels = { menu: '阅读菜单', save: '存读档槽位', history: '剧情历史', preferences: '玩家设置', additional: '附加内容', credits: '制作名单与致谢' };
const checks = [], errors = [], shots = [], run = new Date().toISOString().replace(/[:.]/g, '-');
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(); page.setDefaultTimeout(16000);
const watch = p => p.on('pageerror', e => errors.push(e.message)); watch(page); let server, current = page;
const ready = async () => { await page.getByTestId('workspace-shell').waitFor(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); };
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const section = name => page.getByRole('navigation', { name: '游戏界面分区' }).getByRole('button', { name: new RegExp(name) }).click();
const checked = text => { checks.push(text); console.log(text); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function action(name) { await ready(); if (!await page.locator('.project-switcher').evaluate(e => e.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function download(trigger, name) { const pending = page.waitForEvent('download'); await trigger(); const result = await pending, file = path.join(out, name); await result.saveAs(file); return file; }
async function shot(p, name) {
  for (const frame of p.frames()) await frame.waitForFunction(() => [...document.querySelectorAll('[data-skin-screen],.player-title-screen')].every(e => !e.getClientRects().length || Number(getComputedStyle(e).opacity) >= .95), undefined, { timeout: 4000 }).catch(() => {});
  await p.screenshot({ path: path.join(out, name), animations: 'allow' }); shots.push(name);
}
async function frameReady(surface) {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    const frame = await (await page.locator('iframe[title="游戏界面真实预览"]').elementHandle())?.contentFrame();
    if (frame && await frame.evaluate(surface => {
      const root = document.querySelector('main'), payload = JSON.parse(document.getElementById('world-project')?.textContent ?? '{}'), images = payload.project?.ui?.preservedFields?.webPlayerAppearance?.skin?.images;
      const target = surface === 'title' || surface === 'reading' ? document.querySelector('.player-stage') : document.querySelector(`[data-skin-screen="${surface}"]`);
      return root?.dataset.playerMuted === 'true' && images?.backgrounds[surface]?.assetId && target && getComputedStyle(target).backgroundImage.includes('url(') && (surface !== 'title' || Number(getComputedStyle(document.querySelector('.player-title-screen')).opacity) >= .95);
    }, surface).catch(() => false)) return frame;
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  throw Error(`Actual preview not ready for ${surface}`);
}
async function selectBackground(surface) {
  await section(surface === 'title' ? '标题画面' : surface === 'reading' ? '阅读与选项' : '其他页面');
  if (!['title', 'reading'].includes(surface)) await page.getByLabel('正在编辑的界面', { exact: true }).selectOption(surface);
  await page.getByLabel('本页背景图片', { exact: true }).selectOption({ label: `验证底图_${surface}` });
  await page.getByLabel('背景图片适配', { exact: true }).selectOption(surface === 'save' ? 'contain' : 'cover');
  await page.getByLabel('背景图片不透明度', { exact: true }).fill(surface === 'title' ? '90' : '45');
}
const payload = bytes => { const text = strFromU8(bytes), tag = '<script id="world-project" type="application/json">', start = text.indexOf(tag); assert.ok(start >= 0); return JSON.parse(text.slice(start + tag.length, text.indexOf('</script>', start))); };
async function game(target, url, mobile) {
  current = target; watch(target); await target.goto(url); const main = target.locator('main.player-shell');
  const image = element => element.evaluate(e => getComputedStyle(e).backgroundImage);
  const variable = key => main.evaluate((e, key) => { const value = e.style.getPropertyValue(key); return value.startsWith('url(') ? `url(${JSON.stringify(new URL(JSON.parse(value.slice(4, -1)), document.baseURI).href)})` : value; }, key);
  assert.ok((await image(target.locator('.player-stage'))).includes('url('));
  assert.equal(await target.locator('.player-title-backdrop').isVisible(), false);
  for (const [button, surface] of [['打开玩家设置', 'preferences'], ['制作名单', 'credits'], ['打开附加内容', 'additional']]) {
    await target.getByRole('button', { name: button, exact: true }).click(); const panel = target.locator(`[data-skin-screen="${surface}"]`); await panel.waitFor(); assert.ok((await image(panel)).includes('url('));
    if (surface === 'preferences') { await target.getByLabel('静音全部声音').check(); await target.getByLabel('文字显示', { exact: true }).selectOption('instant'); }
    await panel.getByRole('button', { name: surface === 'additional' ? '返回剧情' : surface === 'credits' ? '返回游戏' : '返回故事', exact: true }).click();
  }
  const start = target.getByRole('button', { name: '打开这封回信', exact: true });
  await target.mouse.move(0, 0); await target.keyboard.press('Escape'); await start.evaluate(e => e.blur());
  assert.equal(await image(start), await variable('--skin-button-normal'));
  if (!mobile) { await start.hover(); assert.equal(await image(start), await variable('--skin-button-hover')); await target.keyboard.press('Tab'); await start.focus(); assert.equal(await image(start), await variable('--skin-button-hover')); }
  if (mobile) {
    const cdp = await target.context().newCDPSession(target), box = await start.boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    assert.equal(await image(start), await variable('--skin-button-pressed'));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
  } else { await target.mouse.down(); assert.equal(await image(start), await variable('--skin-button-pressed')); await target.mouse.up(); }
  await main.locator('[aria-label="继续下一句"]').waitFor(); await target.waitForFunction(() => document.querySelector('main')?.dataset.playerFont === 'ready');
  const dialogueImage = await image(target.locator('.player-dialogue')); for (const state of states) assert.notEqual(dialogueImage, await variable(`--skin-button-${state}`), 'Dialogue retains its own window, not action-button artwork');
  await target.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); assert.ok((await image(target.locator('[data-skin-screen="menu"]'))).includes('url('));
  await target.getByRole('button', { name: '存读档', exact: true }).click(); const save = target.getByRole('dialog', { name: '存读档槽位' }); await save.waitFor(); assert.ok((await image(save)).includes('url('));
  const disabled = save.locator('button:disabled').first(); await disabled.waitFor(); assert.equal(await image(disabled), await variable('--skin-button-disabled'));
  await shot(target, mobile ? 'game-phone-save.png' : 'game-desktop-save.png');
  await save.getByRole('button', { name: '关闭存读档', exact: true }).click();
  await target.getByRole('button', { name: '继续下一句', exact: true }).click();
  await target.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await target.getByRole('button', { name: '打开剧情历史', exact: true }).click();
  const history = target.locator('[data-skin-screen="history"]'); assert.ok((await image(history)).includes('url(')); const historyButtons = history.locator('.player-history-list button'); assert.ok(await historyButtons.count() > 0); for (const entry of await historyButtons.all()) assert.notEqual(await image(entry), await variable('--skin-button-normal')); await history.getByRole('button', { name: '关闭剧情历史', exact: true }).click();
  await target.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await target.getByRole('button', { name: '打开玩家设置', exact: true }).click();
  await target.getByLabel('高对比阅读', { exact: true }).check(); const preferences = target.locator('[data-skin-screen="preferences"]');
  assert.equal(await image(preferences), 'none'); assert.equal(await image(preferences.getByRole('button', { name: '返回故事', exact: true })), 'none');
  await target.getByLabel('高对比阅读', { exact: true }).uncheck(); await preferences.getByRole('button', { name: '返回故事', exact: true }).click();
  await shot(target, mobile ? 'game-phone-reading.png' : 'game-desktop-reading.png');
  for (let n = 0; n < 30 && await main.getAttribute('data-player-status') !== 'ended'; n++) { await target.getByRole('button', { name: '继续下一句', exact: true }).click(); await target.waitForTimeout(60); }
  assert.equal(await main.getAttribute('data-player-status'), 'ended'); assert.ok((await image(target.locator('[data-skin-screen="ending"]'))).includes('url('));
  assert.ok((await target.locator('.player-ending').innerText()).includes('页面复用完成')); assert.equal(await main.getAttribute('data-player-muted'), 'true');
}
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-skin-bundles/skin-reuse-project.zip')); await ready();
  // Newly generated color/line fixtures, not edits to retained artwork or proof of final visual design.
  const fixtures = await page.evaluate(({ surfaces, states }) => [...surfaces.map((id, index) => ({ name: `bg_${id}`, index, button: false })), ...states.map((id, index) => ({ name: `button_${id}`, index: index + 9, button: true }))].map(({ name, index, button }) => {
    const canvas = document.createElement('canvas'); canvas.width = button ? 128 : 960; canvas.height = button ? 64 : 540; const ctx = canvas.getContext('2d');
    ctx.fillStyle = `hsl(${185 + index * 7} 30% ${button ? 18 + (index - 9) * 4 : 16}%)`; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = `hsl(${185 + index * 7} 35% 56%)`; ctx.lineWidth = button ? 3 : 2; ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    if (!button) { ctx.globalAlpha = .25; for (let x = 25 + index; x < 960; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 540); ctx.stroke(); } }
    return { name, data: canvas.toDataURL('image/png').split(',')[1] };
  }), { surfaces, states });
  await mkdir(path.join(out, 'fixtures'), { recursive: true }); for (const fixture of fixtures) await writeFile(path.join(out, 'fixtures', `${fixture.name}.png`), Buffer.from(fixture.data, 'base64'));
  await nav('素材'); await page.getByRole('button', { name: '批量导入素材', exact: true }).click(); const batch = page.getByRole('dialog', { name: '批量导入素材' });
  await page.getByLabel('选择批量素材文件', { exact: true }).setInputFiles(fixtures.map(f => path.join(out, 'fixtures', `${f.name}.png`)));
  for (let i = 0; i < fixtures.length; i++) await page.getByLabel(`素材名称 ${i + 1}`, { exact: true }).fill(i < 9 ? `验证底图_${surfaces[i]}` : `验证按钮_${states[i - 9]}`);
  await batch.getByRole('button', { name: '导入所选 13 项', exact: true }).click(); await batch.getByText('已导入 13 / 13 项', { exact: true }).waitFor(); await batch.getByRole('button', { name: '返回素材库', exact: true }).click();
  await nav('游戏外观'); for (const surface of surfaces) await selectBackground(surface);
  await section('皮肤与动效'); for (let i = 0; i < states.length; i++) await page.getByLabel(stateLabels[i], { exact: true }).selectOption({ label: `验证按钮_${states[i]}` });
  await page.getByLabel('主按钮文字值', { exact: true }).fill('#ffffff');
  await page.getByRole('button', { name: '应用玩家外观', exact: true }).click();
  for (const device of ['desktop', 'phone']) for (const surface of surfaces) {
    await page.getByLabel('外观预览设备', { exact: true }).selectOption(device); await page.getByLabel('外观预览页面', { exact: true }).selectOption(surface); await frameReady(surface);
    if (device === 'desktop' && surface === 'title' || device === 'phone' && surface === 'save') { await page.locator('.player-appearance-editor').scrollIntoViewIfNeeded(); await shot(page, `author-${device}-${surface}.png`); }
  }
  checked('Author imports thirteen procedural PNG fixtures, selects nine independent backgrounds and four button states, and previews all nine pages at desktop/phone sizes using the muted formal Player.');
  await section('皮肤与动效'); await page.getByLabel('皮肤名称', { exact: true }).fill('页面素材复用模板'); await page.getByRole('button', { name: '导出皮肤与素材', exact: true }).click();
  const pack = await download(() => page.getByRole('dialog', { name: '导出带素材皮肤' }).getByRole('button', { name: '生成皮肤包', exact: true }).click(), 'page-images.worldskin.zip'); await page.getByRole('button', { name: '关闭', exact: true }).click();
  const descriptor = JSON.parse(strFromU8(unzipSync(await readFile(pack))['skin.json'])); assert.equal(descriptor.assets.length, 15); assert.ok(!JSON.stringify(descriptor).includes('SKIN_PRIVATE_EVIDENCE_LOCAL_TEST_ONLY'));
  await action('所有项目'); await page.getByRole('button', { name: '新建项目', exact: true }).click(); await page.getByLabel('项目名称', { exact: true }).fill('页面素材复用验证'); await page.getByRole('button', { name: '创建并开始写作', exact: true }).click(); await ready();
  await page.getByRole('button', { name: '添加成段文字', exact: true }).click(); const prose = page.getByRole('dialog', { name: '添加成段文字' }); await prose.getByLabel('成段文字', { exact: true }).fill('每一页都有自己的底图，按钮也会回应操作。\n字体和图片随模板来到新的故事。\n旧故事没有被复制，新的篇章现在开始。'); await prose.getByRole('button', { name: '添加到故事', exact: true }).click();
  await page.locator('.statement-card--end').click(); await page.getByLabel('结局名称', { exact: true }).fill('页面复用完成'); await page.locator('.sequence-inspector').getByRole('button', { name: '应用修改', exact: true }).click();
  await nav('游戏外观'); await section('皮肤与动效'); await page.getByLabel('导入皮肤与素材', { exact: true }).setInputFiles(pack); const mapping = page.getByRole('dialog', { name: '对应皮肤素材并预览' });
  await mapping.getByRole('button', { name: '检查并预览皮肤', exact: true }).click(); await mapping.getByText(/检查通过：新增 15 项素材/).waitFor();
  await mapping.getByRole('button', { name: '导入皮肤与素材到工程', exact: true }).click(); await mapping.waitFor({ state: 'hidden' });
  await ready(); await page.getByRole('button', { name: '保存到本机', exact: true }).click(); await ready(); await action('所有项目'); await page.reload(); await page.getByRole('button', { name: '打开项目：页面素材复用验证', exact: true }).click(); await ready();
  await nav('游戏外观'); assert.notEqual(await page.getByLabel('本页背景图片', { exact: true }).inputValue(), ''); await section('皮肤与动效'); assert.notEqual(await page.getByLabel('按下按钮图片', { exact: true }).inputValue(), '');
  checked('Actual portable package carries fifteen referenced assets, imports the whole batch into a newly authored project and preserves all page/button selections after save/reload/reopen; default package excludes private provenance.');
  await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill('0.1.0'); await page.getByRole('button', { name: '应用发布设置', exact: true }).click();
  const source = await download(() => action('导出工程 ZIP'), 'page-images-project.zip');
  await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); await page.locator('input[name="publication-format"][value="html"]').check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const html = await download(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), 'page-images.html'), desktop = await context.newPage(); await game(desktop, pathToFileURL(html).href, false);
  checked('Downloaded HTML runs from file://, shows page artwork and real normal/hover/keyboard-focus/pressed/disabled button textures, honors high contrast and reaches the new ending, muted.');
  await page.getByRole('button', { name: '← 导出方式', exact: true }).click(); await page.locator('input[name="publication-format"][value="directory"]').check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).click(); await page.waitForFunction(() => document.querySelector('a[download]')?.getAttribute('download')?.endsWith('-web.zip'), undefined, { timeout: 60000 });
  const zip = await download(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), 'page-images-web.zip'), web = unzipSync(await readFile(zip));
  server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = web[name]; res.writeHead(bytes ? 200 : 404, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(name)] ?? 'application/octet-stream' }); res.end(bytes ?? 'Not found'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), mobile = await phone.newPage(); await game(mobile, `http://127.0.0.1:${server.address().port}/gal/`, true);
  checked('Actual directory game under /gal/ works at a 390×844 touch-enabled viewport, including real touch-down pressed artwork, panel controls, accessibility and the ending; this is not a physical phone.');
  const sourceFiles = unzipSync(await readFile(source)), single = payload(await readFile(html)), directory = payload(web['index.html']); assert.deepEqual(single.project, directory.project); assert.equal(single.editorPreview, undefined); assert.equal(directory.editorPreview, undefined);
  const sourceAppearance = JSON.parse(strFromU8(sourceFiles['ui/screens.json'])).webPlayerAppearance; assert.deepEqual(single.project.ui.preservedFields.webPlayerAppearance, sourceAppearance);
  const assets = JSON.parse(strFromU8(sourceFiles['.world-assets/index.json'])).assets; assert.equal(assets.length, 15);
  for (const asset of assets) { const hash = asset.source.digest.slice(7); assert.equal(sha(sourceFiles[`.world-assets/blobs/sha256/${hash.slice(0, 2)}/${hash.slice(2)}`]), hash); }
  const build = JSON.parse(strFromU8(web['build-info.json'])); for (const file of build.files) { assert.equal(sha(web[file.path]), file.digest.slice(7)); assert.equal(web[file.path].byteLength, file.byteLength); }
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), checks, errors, screenshots: shots, assets: assets.length, validatedSiteFiles: build.files.length, formalPlayerEndingCoverage: '1/1 each format; new functional mini-project, not the retained story', editorFullRouteCoverage: 'not run', realDevice: false, publicDeployment: false, proceduralFixturesNotFinalArtwork: true, artifacts: await Promise.all(['page-images.worldskin.zip', 'page-images-project.zip', 'page-images.html', 'page-images-web.zip'].map(async name => { const bytes = await readFile(path.join(out, name)); return { name, bytes: bytes.byteLength, sha256: sha(bytes) }; })) }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length, assets: assets.length, siteFiles: build.files.length }));
} catch (error) { await current.screenshot({ path: path.join(out, `failure-${run}.png`), animations: 'allow' }).catch(() => {}); await writeFile(path.join(out, `failure-${run}.json`), JSON.stringify({ passed: false, checks, errors, error: error.stack, pages: await Promise.all(browser.contexts().flatMap(c => c.pages()).map(async p => ({ url: p.url(), text: (await p.locator('body').innerText().catch(() => '')).slice(-6000) }))) }, null, 2)); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

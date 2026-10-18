// Author UI, actual downloads and public player controls only; no private state injection.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strFromU8 } from 'fflate';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'evidence/web-skin-bundles'); await mkdir(out, { recursive: true });
const run = new Date().toISOString().replace(/[:.]/g, '-'), checks = [], errors = [], marker = 'SKIN_PRIVATE_EVIDENCE_LOCAL_TEST_ONLY';
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] }), context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(`Editor: ${e.message}`)); let server;
const checked = text => { checks.push(text); console.log(text); };
const ready = async () => { await page.getByTestId('workspace-shell').waitFor(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); };
const nav = label => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: label, exact: true }).click();
const action = async name => { await ready(); if (!await page.locator('.project-switcher').evaluate(e => e.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); };
const skinPage = async () => { await nav('游戏外观'); await page.getByRole('navigation', { name: '游戏界面分区' }).getByRole('button', { name: /皮肤与动效/ }).click(); };
async function download(trigger, name) { const pending = page.waitForEvent('download'); await trigger(); const item = await pending, file = path.join(out, name); await item.saveAs(file); return file; }
async function preview(dialog, font = false) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const element = await dialog.locator('iframe').elementHandle(), frame = await element?.contentFrame();
    if (await frame?.evaluate(font => { const main = document.querySelector('main'), title = document.querySelector('.player-title-screen'); return main?.dataset.playerMuted === 'true' && (!font || main?.dataset.playerFont === 'ready') && (!title || Number(getComputedStyle(title).opacity) >= .95) && [...document.querySelectorAll('audio,video')].every(e => e.muted || e.volume === 0); }, font).catch(() => false)) return frame;
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  throw Error('Formal skin preview did not become ready/muted');
}
async function importPackage(file) { await page.getByLabel('导入皮肤与素材', { exact: true }).setInputFiles(file); const dialog = page.getByRole('dialog', { name: '对应皮肤素材并预览', exact: true }); await dialog.waitFor(); return dialog; }
async function checkPreview(dialog, font = true) { await dialog.getByRole('button', { name: '检查并预览皮肤', exact: true }).click(); await dialog.getByText(/检查通过：新增/).waitFor(); return preview(dialog, font); }
async function play(target, url, imageName) {
  target.on('pageerror', e => errors.push(`Player: ${e.message}`)); await target.goto(url);
  await target.getByRole('button', { name: '打开玩家设置', exact: true }).click(); await target.getByLabel('静音全部声音').check(); await target.getByLabel('文字显示', { exact: true }).selectOption('instant'); await target.getByRole('button', { name: '返回故事', exact: true }).click();
  assert.ok((await target.locator('.player-title-screen').innerText()).includes('来信皮肤复用验证'));
  await target.getByRole('button', { name: '打开这封回信', exact: true }).click();
  await target.waitForFunction(() => document.querySelector('main')?.dataset.playerFont === 'ready');
  assert.ok((await target.locator('.player-dialogue__text').innerText()).includes('这是一部新的故事'));
  await target.screenshot({ path: path.join(out, imageName), animations: 'disabled' });
  for (let n = 0; n < 30 && await target.locator('main').getAttribute('data-player-status') !== 'ended'; n++) { await target.getByRole('button', { name: '继续下一句', exact: true }).click(); await target.waitForTimeout(70); }
  assert.equal(await target.locator('main').getAttribute('data-player-status'), 'ended'); assert.ok((await target.locator('.player-ending').innerText()).includes('新的开始'));
  assert.equal(await target.locator('main').getAttribute('data-player-muted'), 'true');
}
function payload(bytes) { const text = strFromU8(bytes), marker = '<script id="world-project" type="application/json">', start = text.indexOf(marker); assert.ok(start >= 0); return JSON.parse(text.slice(start + marker.length, text.indexOf('</script>', start + marker.length))); }
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-motion-presets/tomorrow-letter-0.4.0-project.zip')); await ready();
  await nav('发布'); await page.getByRole('button', { name: '核对素材来源', exact: true }).first().click();
  const sources = page.getByRole('dialog', { name: '素材来源与发行准备' }); await sources.getByRole('group', { name: '选择来源素材' }).getByRole('button').filter({ hasText: '文楷' }).click();
  await sources.getByLabel('来源类型', { exact: true }).selectOption('third-party'); await sources.getByLabel('来源事实', { exact: true }).fill('本地皮肤复用验证记录；不是新的授权或发行确认'); await sources.getByLabel('确认依据', { exact: true }).fill(marker); await sources.getByRole('button', { name: '应用来源台账', exact: true }).click();
  await skinPage(); await page.getByLabel('皮肤名称', { exact: true }).fill('回信全页皮肤');
  await page.getByRole('button', { name: '导出皮肤与素材', exact: true }).click(); let dialog = page.getByRole('dialog', { name: '导出带素材皮肤' });
  assert.equal(await dialog.getByLabel('附带内部来源台账', { exact: true }).isChecked(), false);
  const publicPack = await download(() => dialog.getByRole('button', { name: '生成皮肤包', exact: true }).click(), 'letter-public.worldskin.zip');
  assert.ok(!strFromU8(unzipSync(await readFile(publicPack))['skin.json']).includes(marker));
  await dialog.getByLabel('附带内部来源台账', { exact: true }).check();
  const collaboration = await download(() => dialog.getByRole('button', { name: '生成皮肤包', exact: true }).click(), 'letter-collaboration.worldskin.zip');
  const files = unzipSync(await readFile(collaboration)), descriptor = JSON.parse(strFromU8(files['skin.json']));
  assert.equal(descriptor.assets.length, 2); assert.ok(strFromU8(files['skin.json']).includes(marker)); assert.ok(descriptor.publicCredits.includes('THE FONT SOFTWARE IS PROVIDED'));
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  checked('Export actual referenced cover/font bytes; public package excludes internal evidence by default, explicit collaboration package retains it with public license text.');
  const font = descriptor.assets.find(a => a.kind === 'font'), fontKey = `blobs/${font.source.digest.slice(7)}`, repairFile = path.join(out, 'repair-font.woff2');
  await writeFile(repairFile, files[fontKey]); delete files[fontKey];
  const missingFile = path.join(out, 'missing-font.worldskin.zip'); await writeFile(missingFile, zipSync(files, { level: 0 })); // Deliberate missing-member fixture derived from the real UI export.
  await action('所有项目'); await page.getByRole('button', { name: '新建项目', exact: true }).click(); await page.getByLabel('项目名称', { exact: true }).fill('来信皮肤复用验证'); await page.getByRole('button', { name: '创建并开始写作', exact: true }).click(); await ready();
  await page.getByRole('button', { name: '添加成段文字', exact: true }).click(); dialog = page.getByRole('dialog', { name: '添加成段文字' }); await dialog.getByLabel('成段文字', { exact: true }).fill('这是一部新的故事，借用信纸的风格，不带走原来的剧情。\n窗体与字体随皮肤一起到来。\n写下最后一句，明天就是新的开始。'); await dialog.getByRole('button', { name: '添加到故事', exact: true }).click();
  await page.locator('.statement-card--end').click(); await page.getByLabel('结局名称', { exact: true }).fill('新的开始'); await page.locator('.sequence-inspector').getByRole('button', { name: '应用修改', exact: true }).click();
  await nav('游戏外观'); await page.getByLabel('标题简介', { exact: true }).fill('保留本作品简介，不替换成来源作品文案。'); await page.getByRole('button', { name: '应用玩家外观', exact: true }).click();
  await skinPage(); dialog = await importPackage(collaboration); await checkPreview(dialog);
  assert.equal(await dialog.getByRole('button', { name: '导入皮肤与素材到工程', exact: true }).isEnabled(), true);
  await dialog.getByRole('button', { name: '取消导入', exact: true }).click();
  const cancelled = await download(() => action('导出工程 ZIP'), 'cancelled-target-project.zip'); const cancelledFiles = unzipSync(await readFile(cancelled)); assert.equal(JSON.parse(strFromU8(cancelledFiles['.world-assets/index.json'])).assets.length, 0);
  checked('Create another real project and preview the full package, then cancel: its actual exported source still has zero assets.');
  dialog = await importPackage(missingFile); await dialog.getByText(/包内缺少文件/).waitFor();
  await dialog.getByRole('button', { name: '检查并预览皮肤', exact: true }).click(); await dialog.getByText(/请为“/).waitFor();
  await dialog.getByLabel(`对应素材：${font.displayName}`, { exact: true }).selectOption('fallback'); await checkPreview(dialog, false);
  await dialog.getByLabel(`替代文件：${font.displayName}`, { exact: true }).setInputFiles(repairFile); await dialog.getByLabel(`对应素材：${font.displayName}`, { exact: true }).getByRole('option', { name: /替代文件/ }).waitFor({ state: 'attached' });
  await checkPreview(dialog); assert.ok(await dialog.evaluate(e => e.getBoundingClientRect().width >= 1000)); await page.screenshot({ path: path.join(out, 'import-mapping-desktop.png'), animations: 'allow' });
  for (const width of [736, 390, 320]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await dialog.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && e.scrollWidth <= e.clientWidth + 1; })); if (width === 390) await page.screenshot({ path: path.join(out, 'import-mapping-phone.png'), animations: 'disabled' }); }
  await page.setViewportSize({ width: 1440, height: 1000 }); await dialog.getByRole('button', { name: '导入皮肤与素材到工程', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  checked('A missing font blocks import until explicitly mapped; system-font fallback previews safely, then a replacement file restores the actual font; the mapping dialog fits 736/390/320px and commits the full skin.');
  await ready(); await page.getByRole('button', { name: '保存到本机', exact: true }).click(); await ready(); await action('所有项目'); await page.reload(); await page.getByRole('button', { name: '打开项目：来信皮肤复用验证', exact: true }).click(); await ready();
  await nav('游戏外观'); assert.equal(await page.getByLabel('标题简介', { exact: true }).inputValue(), '保留本作品简介，不替换成来源作品文案。');
  await skinPage(); dialog = await importPackage(collaboration); await checkPreview(dialog); await dialog.getByText(/新增 0 项素材/).waitFor(); await dialog.getByRole('button', { name: '导入皮肤与素材到工程', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  checked('Save, return home, reload and reopen the new project; retain its own title/tagline and reuse the same content on a second import without duplicate asset entries.');
  await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill('0.1.0'); await page.getByRole('button', { name: '应用发布设置', exact: true }).click();
  const source = await download(() => action('导出工程 ZIP'), 'skin-reuse-project.zip');
  await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); await page.locator('input[name="publication-format"][value="html"]').check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const html = await download(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), 'skin-reuse.html'); const desktop = await context.newPage(); await play(desktop, pathToFileURL(html).href, 'player-desktop.png');
  await page.getByRole('button', { name: '← 导出方式', exact: true }).click(); await page.locator('input[name="publication-format"][value="directory"]').check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).click(); await page.waitForFunction(() => document.querySelector('a[download]')?.getAttribute('download')?.endsWith('-web.zip'), undefined, { timeout: 60000 });
  const zip = await download(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), 'skin-reuse-web.zip'), web = unzipSync(await readFile(zip));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
  server = createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = web[name]; res.writeHead(bytes ? 200 : 404, { 'Content-Type': types[path.extname(name)] ?? 'application/octet-stream' }); res.end(bytes ?? 'Not found'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const mobile = await context.newPage(); await mobile.setViewportSize({ width: 390, height: 844 }); await play(mobile, `http://127.0.0.1:${server.address().port}/gal/`, 'player-phone.png');
  checked('Actual HTML file:// desktop and directory HTTP phone games load the imported font/style and complete the new project’s ending using ordinary controls, muted.');
  const sourceFiles = unzipSync(await readFile(source)), sourceManifest = JSON.parse(strFromU8(sourceFiles['world.project.json'])), targetAssets = JSON.parse(strFromU8(sourceFiles['.world-assets/index.json'])).assets;
  assert.equal(targetAssets.length, 2); assert.ok(JSON.stringify(sourceManifest).includes(marker)); assert.ok(sourceManifest.webAssetSources.records.every(row => row.permission === 'pending'));
  const single = payload(await readFile(html)), hosted = payload(web['index.html']); assert.deepEqual(single.project, hosted.project); assert.equal(single.editorPreview, undefined);
  assert.ok(!strFromU8(await readFile(html)).includes(marker)); assert.ok(!strFromU8(web['index.html']).includes(marker)); assert.ok(strFromU8(web['credits.txt']).includes('THE FONT SOFTWARE IS PROVIDED'));
  for (const asset of descriptor.assets) { const wanted = asset.source.digest.slice(7), current = targetAssets.find(row => row.source.digest === asset.source.digest); assert.ok(current); const blob = sourceFiles[`.world-assets/blobs/sha256/${wanted.slice(0,2)}/${wanted.slice(2)}`]; assert.equal(digest(blob), wanted); }
  const build = JSON.parse(strFromU8(web['build-info.json'])); for (const file of build.files) { assert.equal(digest(web[file.path]), file.digest.slice(7)); assert.equal(web[file.path].byteLength, file.byteLength); }
  assert.deepEqual(errors, []);
  const report = { passed: true, checkedAt: new Date().toISOString(), checks, errors, assets: 2, validatedSiteFiles: build.files.length, targetEndingCoverage: '1/1 in both formats; independent Player only', sourceStoryVersion: '0.4.0 unchanged', editorFullRouteCoverage: 'not run', realDevice: false, publicDeployment: false, privateEvidenceInSourceOnly: true, publicFontLicensePreserved: true, artifacts: await Promise.all(['letter-public.worldskin.zip', 'letter-collaboration.worldskin.zip', 'skin-reuse-project.zip', 'skin-reuse.html', 'skin-reuse-web.zip'].map(async name => { const bytes = await readFile(path.join(out, name)); return { name, bytes: bytes.byteLength, sha256: digest(bytes) }; })) };
  await writeFile(path.join(out, 'browser-checks.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: true, checks: checks.length, assets: 2 }));
} catch (error) {
  await page.screenshot({ path: path.join(out, `failure-${run}.png`), animations: 'disabled' }).catch(() => {});
  const pages = await Promise.all(context.pages().map(async p => ({ url: p.url(), text: (await p.locator('body').innerText().catch(() => '')).slice(-6500) })));
  await writeFile(path.join(out, `failure-${run}.json`), JSON.stringify({ passed: false, checks, errors, failure: error.stack, pages }, null, 2)); console.error(error); throw error;
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

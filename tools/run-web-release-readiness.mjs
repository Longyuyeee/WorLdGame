import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-release-readiness');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'world-release-readiness-'));
const sourcePath = path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip');
const files = unzipSync(await readFile(sourcePath));
const manifest = JSON.parse(strFromU8(files['world.project.json']));
const entry = JSON.parse(strFromU8(files[`scenes/${manifest.entrySceneId}.json`]));
const script = JSON.parse(strFromU8(files[entry.scriptPath]));
const firstDirection = script.statements.find(item => item.kind === 'direction' && /\basset=/.test(item.summary));
const originalAsset = firstDirection.summary.match(/\basset=(\S+)/)[1];
const broken = structuredClone(script);
broken.statements.find(item => item.id === firstDirection.id).summary = firstDirection.summary.replace(`asset=${originalAsset}`, 'asset=release_missing_background');
const brokenPath = path.join(temporary, 'broken-reference-project.zip');
await writeFile(brokenPath, zipSync({ ...files, [entry.scriptPath]: strToU8(JSON.stringify(broken)) }, { level: 0 }));
const index = JSON.parse(strFromU8(files['.world-assets/index.json']));
const missingAssets = index.assets.filter(item => item.kind === 'background').slice(0, 2);
const blobBytes = asset => files[`.world-assets/blobs/sha256/${asset.source.digest.slice(7, 9)}/${asset.source.digest.slice(9)}`];
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const checks = [], errors = [], artifacts = {};
const watch = page => page.on('pageerror', error => errors.push(error.message));
const check = detail => { checks.push(detail); console.log(JSON.stringify(detail)); };
const ready = page => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = (page, name) => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function importProject(page, source = sourcePath) {
  watch(page); page.setDefaultTimeout(20000);
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/');
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(source);
  try { await ready(page); } catch (error) { await shot(page, 'import-failure'); console.log('import state:', (await page.locator('body').innerText()).slice(0, 3000)); throw error; }
}
async function generation(page, directory = false) {
  await nav(page, '发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  await page.getByRole('radio', { name: directory ? /网页目录 ZIP/ : /单文件 HTML/ }).check();
  await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByRole('region', { name: '生成前检查' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.release-check')?.getAttribute('aria-busy') === 'false');
}
async function fit(page, selector) {
  const result = await page.locator(selector).evaluate(item => {
    const r = item.getBoundingClientRect();
    return { left: r.left, right: r.right, viewport: innerWidth, scrollWidth: item.scrollWidth, width: item.clientWidth };
  });
  assert.ok(result.left >= -1 && result.right <= result.viewport + 1 && result.scrollWidth <= result.width + 1, JSON.stringify(result));
}
async function fault(page, assets, remove) {
  // Fault injection only in this script's fresh isolated Chromium context.
  const rows = assets.map(asset => ({ key: `${manifest.projectId}/${asset.source.digest}`, base64: remove ? null : Buffer.from(blobBytes(asset)).toString('base64') }));
  await page.evaluate(async ({ rows, remove }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('world-studio-local-projects'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await new Promise((resolve, reject) => {
      const transaction = db.transaction('asset-blobs', 'readwrite');
      for (const row of rows) { if (remove) transaction.objectStore('asset-blobs').delete(row.key); else transaction.objectStore('asset-blobs').put(Uint8Array.from(atob(row.base64), c => c.charCodeAt(0)), row.key); }
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    }); } finally { db.close(); }
  }, { rows, remove });
}
async function build(page, directory) {
  await page.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click();
  await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: '下载游戏', exact: true }).click();
  const target = path.join(temporary, directory ? 'current-web.zip' : 'current.html'); await (await pending).saveAs(target);
  const bytes = await readFile(target); artifacts[directory ? 'directory' : 'html'] = { byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  return { target, bytes };
}
function sameHtmlPayload(actual, expected) {
  const pattern = /(<script id="world-project" type="application\/json">)([\s\S]*?)(<\/script>)/;
  const current = actual.match(pattern), previous = expected.match(pattern);
  assert.ok(current && previous); assert.deepEqual(JSON.parse(current[2]), JSON.parse(previous[2]));
  assert.equal(actual.replace(pattern, '$1PROJECT$3'), expected.replace(pattern, '$1PROJECT$3'));
}
try {
  const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await importProject(editor); await generation(editor, true);
  assert.match(await editor.getByRole('region', { name: '生成前检查' }).innerText(), /22 项素材已核对源文件、大小和摘要/);
  await editor.getByRole('button', { name: '构建目录 ZIP', exact: true }).waitFor(); assert.ok(await editor.getByRole('button', { name: '构建目录 ZIP', exact: true }).isEnabled());
  await shot(editor, 'desktop-ready');
  await editor.locator('.editor-preferences > summary').click(); await editor.getByRole('button', { name: '石墨', exact: true }).click(); await editor.locator('.editor-preferences > summary').click(); await shot(editor, 'dark-ready');
  await editor.locator('.editor-preferences > summary').click(); await editor.getByRole('button', { name: '清亮', exact: true }).click(); await editor.locator('.editor-preferences > summary').click();
  for (const width of [1180, 800, 390]) { await editor.setViewportSize({ width, height: width < 500 ? 844 : 1000 }); await fit(editor, '.release-check'); await fit(editor, '.release-playtest'); await shot(editor, `ready-${width}`); }
  await editor.getByRole('button', { name: '构建目录 ZIP', exact: true }).scrollIntoViewIfNeeded(); await shot(editor, 'mobile-generate-actions');
  await editor.setViewportSize({ width: 1440, height: 1000 });
  await editor.getByRole('button', { name: '查看路线', exact: true }).click(); await fit(editor, '.release-return'); await shot(editor, 'route-return');
  await editor.getByRole('button', { name: '返回生成游戏', exact: true }).click();
  await editor.getByRole('button', { name: '构建目录 ZIP', exact: true }).waitFor(); await editor.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await editor.getByRole('button', { name: '回到故事试玩', exact: true }).click();
  await editor.getByRole('button', { name: '试玩完整流程', exact: true }).click();
  await editor.getByTestId('preview-visual-host').waitFor(); await editor.waitForFunction(() => document.querySelector('[data-testid="preview-visual-host"]')?.dataset.renderStatus === 'ready');
  await editor.getByRole('button', { name: '返回生成游戏', exact: true }).click();
  console.log('playtest receipt:', await editor.getByRole('region', { name: '作品试玩状态' }).innerText());
  await shot(editor, 'partial-playtest-receipt');
  await editor.getByText('最近一次试玩尚未从入口完成全程', { exact: true }).waitFor();
  check('22 actual sources inspected; light/dark and 1180/800/390 layout; route/preview return retains directory format; partial playtest is not marked complete');
  const directory = await build(editor, true), delivered = unzipSync(directory.bytes), previous = unzipSync(await readFile(path.join(root, 'evidence/web-save-backup/before-rain-stops-web.zip')));
  assert.deepEqual(Object.keys(delivered).sort(), Object.keys(previous).sort());
  for (const name of Object.keys(previous).filter(name => !['index.html', 'build-info.json', 'sw.js'].includes(name))) {
    if (name.endsWith('.json')) assert.deepEqual(JSON.parse(strFromU8(delivered[name])), JSON.parse(strFromU8(previous[name])), name);
    else assert.deepEqual(delivered[name], previous[name], name);
  }
  sameHtmlPayload(strFromU8(delivered['index.html']), strFromU8(previous['index.html']));
  const info = JSON.parse(strFromU8(delivered['build-info.json']));
  assert.equal(info.projectDigest, JSON.parse(strFromU8(previous['build-info.json'])).projectDigest);
  for (const file of info.files) assert.equal('sha256:' + createHash('sha256').update(delivered[file.path]).digest('hex'), file.digest);
  const inventory = JSON.parse(strFromU8(delivered['sw.js']).match(/^const inventory = (.*);$/m)[1]);
  for (const [name, hash] of Object.entries(inventory)) assert.equal('sha256:' + createHash('sha256').update(delivered[name]).digest('hex'), hash);
  await editor.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/ }).click();
  await editor.getByRole('radio', { name: /单文件 HTML/ }).check();
  assert.equal(await editor.getByRole('link', { name: '下载游戏', exact: true }).count(), 0);
  await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await editor.getByText('故事与素材检查通过', { exact: true }).waitFor();
  const html = await build(editor, false); sameHtmlPayload(html.bytes.toString('utf8'), (await readFile(path.join(root, 'evidence/web-save-backup/before-rain-stops.html'))).toString('utf8'));
  await editor.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /作品信息/ }).click();
  await editor.getByLabel('发布版本', { exact: true }).fill('1.5.5-draft');
  assert.equal(await editor.getByRole('link', { name: '下载游戏', exact: true }).count(), 0); assert.equal(await editor.getByRole('link', { name: /打开试玩/ }).count(), 0);
  await editor.getByRole('button', { name: '放弃修改', exact: true }).click();
  await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor();
  assert.equal(await editor.getByRole('link', { name: '下载游戏', exact: true }).count(), 1);
  const player = await browser.newPage(); watch(player); await player.goto(pathToFileURL(html.target).href); await player.getByRole('button', { name: /^开始故事/ }).click();
  await player.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  assert.ok(await player.locator('.player-dialogue__text').innerText()); await shot(player, 'exported-player-entry'); await player.close();
  check('real HTML/directory exports preserve semantic project identity, full payload, player bundles and media of 1.5.4; inventory hashes valid; JSON key order may differ; format changes invalidate links and draft settings hide both links; local HTML starts');
  const brokenPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await importProject(brokenPage, brokenPath); await generation(brokenPage, true);
  const ref = brokenPage.getByRole('region', { name: '生成前检查' }).locator('li').filter({ hasText: '演出引用的素材未登记' });
  assert.ok(await brokenPage.getByRole('button', { name: '构建目录 ZIP', exact: true }).isDisabled()); await shot(brokenPage, 'reference-blocker');
  await ref.getByRole('button', { name: '定位并修复', exact: true }).click();
  assert.equal(await brokenPage.getByTestId('workspace-shell').getAttribute('data-context-statement-id'), firstDirection.id);
  await brokenPage.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '脚本', exact: true }).click();
  const input = brokenPage.getByLabel('权威脚本编辑器', { exact: true }), value = await input.inputValue();
  await input.fill(value.replace('release_missing_background', originalAsset)); await input.blur();
  await brokenPage.getByRole('button', { name: '返回生成游戏', exact: true }).click();
  await brokenPage.getByText('故事与素材检查通过', { exact: true }).waitFor(); assert.ok(await brokenPage.getByRole('button', { name: '构建目录 ZIP', exact: true }).isEnabled());
  check('broken asset reference prevents generation, navigates to exact stable statement; Script correction returns directly to generation with directory format and fresh clear inspection');
  const faults = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await importProject(faults); await generation(faults);
  await fault(faults, missingAssets, true); await faults.getByRole('button', { name: '重新检查', exact: true }).click();
  await faults.getByText('2 项问题需要修复', { exact: true }).waitFor(); assert.ok(await faults.getByRole('button', { name: '构建试玩 HTML', exact: true }).isDisabled());
  await shot(faults, 'missing-sources'); await faults.setViewportSize({ width: 390, height: 844 }); await fit(faults, '.release-check'); await shot(faults, 'mobile-missing-sources');
  await faults.setViewportSize({ width: 1440, height: 1000 });
  for (const asset of missingAssets) {
    const row = faults.getByRole('region', { name: '生成前检查' }).locator('li').filter({ hasText: `素材“${asset.displayName}”缺失或不完整` });
    await row.getByRole('button', { name: '修复素材', exact: true }).click();
    assert.equal(await faults.getByLabel('资源 Asset ID', { exact: true }).inputValue(), asset.assetId);
    assert.ok(await faults.getByLabel('资源 Asset ID', { exact: true }).isDisabled()); await shot(faults, `repair-${asset.assetId}`);
    await faults.getByLabel('选择资源文件', { exact: true }).setInputFiles({ name: `${asset.assetId}.png`, mimeType: 'image/png', buffer: Buffer.from(blobBytes(asset)) });
    await faults.locator('.asset-import-actions').getByRole('button', { name: '更新此资源', exact: true }).click();
    await faults.getByText('资源导入完成', { exact: true }).waitFor(); await faults.getByRole('button', { name: '关闭资源保险库', exact: true }).click(); await ready(faults);
    await faults.getByRole('button', { name: '返回生成游戏', exact: true }).click();
    await faults.waitForFunction(() => document.querySelector('.release-check')?.getAttribute('aria-busy') === 'false');
  }
  await faults.getByText('故事与素材检查通过', { exact: true }).waitFor();
  check('isolated storage deletion reports both missing sources, 390px list fits; each repair opens correct locked Asset ID and original-file replacement clears blockers');
  await fault(faults, [missingAssets[0]], true);
  await faults.getByRole('button', { name: '构建试玩 HTML', exact: true }).click();
  await faults.getByText('1 项问题需要修复', { exact: true }).waitFor();
  assert.equal(await faults.getByRole('link', { name: '下载游戏', exact: true }).count(), 0);
  await shot(faults, 'changed-after-inspection');
  await fault(faults, [missingAssets[0]], false); await faults.getByRole('button', { name: '重新检查', exact: true }).click();
  await faults.getByText('故事与素材检查通过', { exact: true }).waitFor(); assert.ok(await faults.getByRole('button', { name: '构建试玩 HTML', exact: true }).isEnabled());
  check('source removed after preflight is caught by actual build, reveals actionable blocker and produces no download; fresh restoration/recheck permits retry');
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: errors.length === 0, checks, browser: browser.version(), artifacts, errors, playerRuntimeChanged: false, fullEndingsRerun: false, physicalPhone: false }, null, 2));
  process.exitCode = errors.length ? 1 : 0;
} catch (error) {
  const last = browser.contexts().flatMap(context => context.pages()).at(-1);
  if (last) { await shot(last, 'failure-last-page'); console.log('failure page:', (await last.locator('body').innerText()).slice(-5000)); }
  await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2));
  throw error;
} finally { await browser.close(); }

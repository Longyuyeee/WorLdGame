import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { revisions, editedScenes } from '../assets/rain-story/editorial-v1.5.1.mjs';
import { checkWebReleaseUpdate } from './check-web-release-update.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-authoring-polish');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
editor.setDefaultTimeout(20000);
const checks = [], errors = [], routes = {};
let server;
const watch = page => page.on('pageerror', error => errors.push(error.message)); watch(editor);
const check = detail => { checks.push(detail); console.log(JSON.stringify(detail)); };
const ready = () => editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = name => editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
async function shot(name) { await editor.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' }); }
async function fit(page, selector) {
  const result = await page.locator(selector).evaluate(item => {
    const r = item.getBoundingClientRect();
    return { left: r.left, right: r.right, viewport: innerWidth, scrollWidth: item.scrollWidth, width: item.clientWidth };
  });
  assert.ok(result.left >= -1 && result.right <= result.viewport + 1 && result.scrollWidth <= result.width + 1, JSON.stringify(result));
}
async function exportGame(directory, download = true) {
  await nav('故事'); await nav('发布');
  await editor.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  await editor.getByRole('radio', { name: directory ? /目录 ZIP/ : /单文件 HTML/ }).check();
  await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await editor.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click();
  await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  if (download) {
    const pending = editor.waitForEvent('download'); await editor.getByRole('link', { name: '下载游戏', exact: true }).click();
    await (await pending).saveAs(path.join(output, directory ? 'before-rain-stops-web.zip' : 'before-rain-stops.html'));
  }
  await editor.getByRole('button', { name: '继续：试玩与部署 →', exact: true }).click();
  await editor.getByRole('region', { name: '试玩与部署说明' }).waitFor();
  assert.ok(await editor.getByRole('complementary', { name: '游戏导出结果' }).textContent().then(text => text.includes('还未上传')));
  await shot(directory ? 'directory-handoff' : 'html-handoff');
}
async function quick(page, name) {
  if (await page.getByRole('button', { name: '打开阅读菜单' }).count()) await page.getByRole('button', { name: '打开阅读菜单' }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(name => document.querySelector('main')?.dataset.saveOperation === (name === '快速保存' ? 'saved' : 'loaded'), name);
  if (await page.getByRole('dialog', { name: '阅读菜单' }).count()) await page.getByRole('dialog', { name: '阅读菜单' }).getByRole('button', { name: '返回故事' }).click();
}
async function route(url, label, branch, width, names, ending) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500, isMobile: width < 500, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(20000); watch(page);
  const paragraphs = new Set(), visited = [], voices = new Set(); let saved = false;
  await page.goto(url); await page.getByRole('button', { name: /^开始故事/ }).click();
  for (let step = 0; step < 450; step++) {
    if (await page.locator('main').getAttribute('data-player-status') === 'ended') break;
    if (await page.locator('.player-choice').count()) { await page.locator('.player-choice').getByRole('button', { name: new RegExp(branch) }).click(); continue; }
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    const text = await page.locator('.player-dialogue__text').textContent(), scene = editedScenes.find(item => item.prose.includes(text));
    if (scene) { paragraphs.add(text); if (visited.at(-1) !== scene.name) visited.push(scene.name); }
    const voice = page.locator('audio[data-audio-bus="voice"]');
    if (await voice.count()) { const id = await voice.getAttribute('data-asset-id'); if (!voices.has(id)) { await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(id); } }
    if (scene && scene.prose[0] === text) {
      await page.screenshot({ path: path.join(output, `${label}-${visited.length}.png`) });
      const frame = await page.locator('.player-stage-world').evaluate(item => { const r = item.getBoundingClientRect(); return r.width / r.height; });
      assert.ok(Math.abs(frame - 16 / 9) < .01);
    }
    if (!saved && scene?.name === '候车室的旧信') {
      await quick(page, '快速保存'); const hash = await page.locator('main').getAttribute('data-runtime-state-hash');
      await page.reload(); await quick(page, '快速读取'); assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash); saved = true;
    }
    await page.getByRole('button', { name: '继续下一句', exact: true }).click();
    await page.waitForTimeout(60);
  }
  assert.equal(await page.locator('main').getAttribute('data-player-status'), 'ended');
  assert.ok((await page.locator('.player-ending').textContent()).includes(ending));
  assert.equal(paragraphs.size, 60); assert.deepEqual(visited, names); assert.equal(voices.size, 6); assert.ok(saved);
  await page.screenshot({ path: path.join(output, `${label}-ending.png`) });
  routes[label] = { paragraphs: paragraphs.size, visited, voices: voices.size, saveRefresh: saved, humanReadTiming: false, physicalPhone: false };
  await context.close(); check({ route: label, ...routes[label] });
}
function scriptRows(files) {
  return Object.entries(files).filter(([name]) => name.startsWith('scenes/')).map(([, bytes]) => { const scene = JSON.parse(strFromU8(bytes)); return { scene, script: JSON.parse(strFromU8(files[scene.scriptPath])) }; });
}
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/'); assert.match(await editor.title(), /WorLd/i);
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(process.env.STUDIO_POLISH_REVIEW_ONLY === '1' ? path.join(output, 'before-rain-stops-project.zip') : path.join(root, 'evidence/web-player-settings/before-rain-stops-project.zip')); await ready();
  const directions = editor.locator('.statement-card--direction');
  assert.match(await directions.first().textContent(), /切换背景/); assert.ok(!(await directions.first().textContent()).includes('asset='));
  await directions.first().click(); await editor.getByText(/^编辑演出 ·/).click();
  assert.equal(await editor.getByText('查看脚本参数', { exact: true }).evaluate(item => item.parentElement.open), false);
  await editor.getByText('查看脚本参数', { exact: true }).click(); assert.ok(await editor.locator('.direction-source-details code').textContent().then(text => text.includes('asset=')));
  await editor.locator('.statement-card--narration').first().click();
  await shot('writing-readable');
  await editor.getByRole('button', { name: '试玩完整流程', exact: true }).click();
  await editor.getByTestId('preview-visual-host').waitFor();
  await editor.waitForFunction(() => document.querySelector('[data-testid="preview-visual-host"]')?.dataset.renderStatus === 'ready');
  assert.equal(await editor.locator('.preview-control-dock').isVisible(), false);
  assert.equal(await editor.getByRole('button', { name: '运行到选中步骤', exact: true }).isVisible(), false);
  for (const width of [1440, 1280]) { await editor.setViewportSize({ width, height: 1000 }); await fit(editor, '.runtime-debug-actions'); await shot(`preview-${width}`); }
  await editor.getByRole('button', { name: '继续故事', exact: true }).click();
  await editor.getByText('更多调试操作', { exact: true }).click(); assert.ok(await editor.getByRole('button', { name: '运行到选中步骤', exact: true }).isVisible());
  await editor.getByText('更多调试操作', { exact: true }).click();
  await editor.locator('.editor-preferences > summary').click(); await editor.getByRole('button', { name: '石墨', exact: true }).click(); await editor.locator('.editor-preferences > summary').click(); await shot('preview-dark');
  await editor.locator('.editor-preferences > summary').click(); await editor.getByRole('button', { name: '清亮', exact: true }).click(); await editor.locator('.editor-preferences > summary').click();
  await editor.getByRole('button', { name: '退出试玩', exact: true }).click();
  check('readable direction summaries, retained raw detail, separated preview/playing controls, 1280/1440 fitting and dark theme');
  if (process.env.STUDIO_POLISH_REVIEW_ONLY === '1') {
    await exportGame(true, false);
    await editor.setViewportSize({ width: 390, height: 844 }); await fit(editor, '.publication-steps'); await shot('final-mobile-guide');
    assert.ok(await editor.getByRole('link', { name: '下载游戏', exact: true }).evaluate(item => item.getBoundingClientRect().bottom < innerHeight - 64));
    check(await checkWebReleaseUpdate(browser, root, output));
    await writeFile(path.join(output, 'ui-review.json'), JSON.stringify({ passed: errors.length === 0, checks, editorUrl: process.env.STUDIO_UI_URL, browser: browser.version(), errors, artifactReexported: false }, null, 2));
    await browser.close(); process.exitCode = errors.length ? 1 : 0;
  } else {
  for (const revision of revisions) {
    await editor.locator('.scene-rail').getByRole('button').filter({ hasText: revision.scene }).click();
    const card = editor.locator('.statement-card--narration').filter({ hasText: revision.original }); await card.click();
    await editor.getByLabel('旁白文本', { exact: true }).fill(revision.text); await editor.getByRole('button', { name: '应用修改', exact: true }).click();
    await editor.locator('.statement-card--narration').filter({ hasText: revision.text }).waitFor();
  }
  await nav('发布'); await editor.getByLabel('发布版本', { exact: true }).fill('1.5.1'); await editor.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready();
  assert.equal(await editor.locator('.publication-platform.is-unavailable').count(), 0);
  await editor.getByLabel('项目菜单', { exact: true }).click(); const sourceDownload = editor.waitForEvent('download');
  await editor.getByRole('button', { name: /导出工程 ZIP/ }).click(); await (await sourceDownload).saveAs(path.join(output, 'before-rain-stops-project.zip'));
  await exportGame(false); await exportGame(true);
  await editor.setViewportSize({ width: 390, height: 844 }); await fit(editor, '.publication-steps'); await shot('mobile-publication');
  await editor.getByRole('button', { name: '更换导出方式', exact: true }).click(); await fit(editor, '.publication-main'); await shot('mobile-formats');
  await editor.setViewportSize({ width: 1440, height: 1000 }); await nav('故事'); await ready();
  await editor.getByLabel('项目菜单', { exact: true }).click(); await editor.getByRole('button', { name: /所有项目/ }).click(); await editor.getByRole('main', { name: '项目首页' }).waitFor();
  await editor.reload(); await editor.getByRole('button', { name: /^打开项目：雨停之前/ }).click(); await ready();
  await editor.locator('.scene-rail').getByRole('button').filter({ hasText: revisions[0].scene }).click();
  assert.ok(await editor.locator('.statement-card--narration').filter({ hasText: revisions[0].text }).isVisible());
  check('four UI editorial changes, version 1.5.1, three exported artifacts, mobile release steps and saved project reopen');
  const before = unzipSync(await readFile(path.join(root, 'evidence/web-player-settings/before-rain-stops-project.zip')));
  const after = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip')));
  let changedStatements = 0;
  const beforeRows = scriptRows(before), afterRows = scriptRows(after);
  for (const old of beforeRows) {
    const fresh = afterRows.find(row => row.scene.id === old.scene.id); assert.deepEqual(fresh.scene, old.scene);
    assert.equal(fresh.script.statements.length, old.script.statements.length);
    for (let i = 0; i < old.script.statements.length; i++) {
      const original = old.script.statements[i], revised = fresh.script.statements[i];
      const change = revisions.find(item => item.scene === old.scene.title && original.kind === 'narration' && original.text === item.original);
      assert.deepEqual(revised, change ? { ...original, text: change.text } : original); if (change) changedStatements++;
    }
  }
  assert.equal(changedStatements, 4);
  for (const name of Object.keys(before).filter(name => name.startsWith('.world-assets/blobs/'))) assert.deepEqual(after[name], before[name]);
  check('scene/statement/text IDs, choices, directions and all source media preserved; only four narration statements revised');
  const htmlUrl = pathToFileURL(path.join(output, 'before-rain-stops.html')).href;
  await route(htmlUrl, 'desktop-stay', '留下等雨停', 1280, editedScenes.slice(0, 6).map(scene => scene.name), '同行的约定');
  const files = unzipSync(await readFile(path.join(output, 'before-rain-stops-web.zip')));
  let servedFiles = files;
  const manifest = JSON.parse(strFromU8(files['build-info.json']));
  for (const file of manifest.files) assert.equal('sha256:' + createHash('sha256').update(files[file.path]).digest('hex'), file.digest);
  server = createServer((request, response) => {
    const key = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html';
    const bytes = servedFiles[key]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': key.endsWith('.js') ? 'text/javascript' : key.endsWith('.css') ? 'text/css' : key.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes ?? 'Missing');
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await route(`http://127.0.0.1:${server.address().port}/gal/`, 'directory-leave', '去追最后一班车', 390, [...editedScenes.slice(0, 3), ...editedScenes.slice(6)].map(scene => scene.name), '远行的约定');
  check(await checkWebReleaseUpdate(browser, root, output));
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), checks, routes, errors, browser: browser.version(), version: '1.5.1', publicDeployment: false, physicalDevicePassed: false, humanReadTimingPassed: false, releasePermissionConfirmed: false }, null, 2));
  }
} catch (error) {
  await editor.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await writeFile(path.join(output, 'failure-checks.json'), JSON.stringify({ passed: false, checks, errors, error: String(error), stack: error.stack }, null, 2)); throw error;
} finally { server?.close(); await browser.close(); }

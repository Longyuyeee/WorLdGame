import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, mkdtemp, copyFile, unlink, rmdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

import { createServer } from 'node:http';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-playtest-progress'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', timezoneId: 'Asia/Hong_Kong' }); page.setDefaultTimeout(20000);
const checks = [], errors = [], artifacts = {}; let server, current = page;
const watch = p => p.on('pageerror', e => errors.push(e.message)); watch(page);
const check = detail => { checks.push(detail); console.log(detail); };
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const clean = () => page.waitForFunction(() => document.querySelector('[data-nav-item="checks"]')?.disabled === false);
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const board = () => page.getByRole('region', { name: '结局试玩进度', exact: true });
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function count(value) { await board().getByText(`当前版本已从开头到达 ${value} / 2 个结局`, { exact: true }).waitFor(); }
async function details() { if (!await board().locator('details').evaluate(el => el.open)) await board().locator('summary').click(); }
async function fit() { const r = await board().evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth, scroll: el.scrollWidth, client: el.clientWidth }; }); assert.ok(r.left >= -1 && r.right <= r.width + 1 && r.scroll <= r.client + 1, JSON.stringify(r)); }
async function run(right = false) {
  for (let i = 0; i < 20; i++) {
    if (await page.locator('.playable-preview--ended').count()) return;
    const choice = page.getByRole('button', { name: `选择路线：${right ? '乘车出发' : '留在车站'}`, exact: true });
    if (await choice.isVisible()) await choice.click(); else await page.getByRole('button', { name: '继续故事', exact: true }).click();
  }
  throw Error('Short fixture did not reach an ending');
}
async function publish(directory = false) {
  await nav('发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); if (directory) await page.getByRole('radio', { name: /网页目录 ZIP/ }).check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await page.getByText('故事与素材检查通过', { exact: true }).waitFor();
}
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/'); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-playtest-revision/revised-source.zip')); await ready();
  await nav('检查'); await count(0); await board().getByRole('button', { name: '从头试玩当前版本', exact: true }).click(); await run(false);
  await nav('检查'); await count(1); await details(); await fit(); await board().scrollIntoViewIfNeeded(); await shot('desktop-one-ending');
  await publish(true); await count(1); assert.ok(await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).isEnabled());
  await board().getByRole('button', { name: '从头试玩当前版本', exact: true }).click(); await page.getByTestId('preview-step').getByText('雨停后，站台终于安静了。', { exact: true }).waitFor(); await run(true);
  await page.getByRole('button', { name: '返回生成游戏', exact: true }).click(); await count(2); await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).waitFor(); await details(); await board().scrollIntoViewIfNeeded(); await shot('desktop-release-two-endings');
  check('actual short project: checks starts at entry, first ending counts 1/2; publishing with directory selected permits export before all endings; fresh start reaches the other ending, return retains directory format and counts 2/2; disconnected draft ending is excluded by Compiler');
  await ready(); await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: /所有项目/ }).click(); await page.reload(); await page.getByRole('button', { name: /^打开项目：分支创作流程/ }).first().click(); await ready();
  await nav('检查'); await count(2); await details();
  await page.locator('.editor-preferences > summary').click(); await page.getByRole('button', { name: '石墨', exact: true }).click(); await page.locator('.editor-preferences > summary').click(); await board().scrollIntoViewIfNeeded(); await shot('desktop-progress-dark');
  await page.setViewportSize({ width: 390, height: 844 }); await board().scrollIntoViewIfNeeded(); await fit(); await shot('mobile-progress-dark'); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.editor-preferences > summary').click(); await page.getByRole('button', { name: '清亮', exact: true }).click(); await page.locator('.editor-preferences > summary').click();
  check('home/reload/reopen retains both completion records; actual dark theme and 390px progress/list fit');
  await board().getByRole('button', { name: '从头试玩当前版本', exact: true }).click(); await page.getByRole('button', { name: '记录问题', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '记录试玩问题' }); await dialog.getByLabel('校订问题描述').fill('私有试玩意见：核对新版开场'); await dialog.getByRole('button', { name: '保存校订记录', exact: true }).click();
  await page.getByRole('button', { name: '修改当前内容', exact: true }).click(); await page.getByLabel('旁白文本', { exact: true }).fill('雨声消失后，站台终于安静下来。'); await page.getByRole('button', { name: '应用修改', exact: true }).click(); await clean(); await page.getByRole('button', { name: '返回试玩', exact: true }).click(); await run(false);
  await nav('检查'); await count(0); await board().getByText(/本次中途修改过作品/).waitFor(); await details(); await board().getByText('2 条旧版本到达记录已保留；不计入当前版本。', { exact: true }).waitFor(); await board().scrollIntoViewIfNeeded(); await shot('changed-source-needs-replay');
  await page.getByRole('region', { name: '试玩校订清单' }).getByRole('button', { name: '从此处复测', exact: true }).click(); await run(false); await nav('检查'); await count(0); await board().getByText(/最近一次为局部复测/).waitFor();
  await board().getByRole('button', { name: '从头试玩当前版本', exact: true }).click(); await run(false); await nav('检查'); await count(1);
  check('editing narration through the actual revision flow preserves old-version receipts but resets current count; compatible hot replay and note-driven partial replay do not count; a fresh entry run of the new version counts 1/2');
  await board().getByRole('button', { name: '从头试玩当前版本', exact: true }).click(); await run(true); await publish(true); await count(2); await details();
  await page.setViewportSize({ width: 390, height: 844 }); await board().scrollIntoViewIfNeeded(); await fit(); await shot('mobile-release-progress-light'); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 }); const pending = page.waitForEvent('download'); await page.getByRole('link', { name: '下载游戏', exact: true }).click(); const bytes = await readFile(await (await pending).path()), files = unzipSync(bytes); artifacts.directory = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.ok(!Object.keys(files).some(name => name.includes('playtest-progress'))); assert.ok(!bytes.includes(Buffer.from('私有试玩意见：核对新版开场'))); assert.ok(!Buffer.from(files['player.js']).includes(Buffer.from('world-studio:playtest-progress')));
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/game\//, '') || 'index.html', data = files[name]; response.writeHead(data ? 200 : 404, { 'Content-Type': mime[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(data ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const player = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); current = player; watch(player); await player.goto(`http://127.0.0.1:${server.address().port}/game/index.html`); await player.getByRole('button', { name: /^开始故事/ }).click(); await player.getByRole('button', { name: '继续下一句', exact: true }).click(); await player.locator('.player-choice').getByRole('button', { name: /留在车站/ }).click(); await player.getByRole('button', { name: '继续下一句', exact: true }).click(); await player.locator('main[data-player-status="ended"]').waitFor(); await player.screenshot({ path: path.join(output, 'exported-game-ending.png'), animations: 'disabled' });
  check('new version reaches both endings and remains exportable; real directory download excludes private progress and notes, and its HTTP game plays the revised short route to an ending');
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), checks, errors, artifacts, scope: 'Existing short branch fixture, actual editor UI, no injected completion records; no full Rain rerun, physical phone, human acceptance, full backup/offline lifecycle or public deployment' }, null, 2));
} catch (error) { await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ checks, errors, error: String(error), stack: error.stack }, null, 2)); await current.screenshot({ path: path.join(output, 'failure.png') }); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

// Actual author actions and UI downloads; no IndexedDB, private History or project writes.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-motion-presets');
await mkdir(output, { recursive: true });
const run = new Date().toISOString().replace(/[:.]/g, '-'), checks = [], errors = [];
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
const page = await context.newPage(); page.setDefaultTimeout(12000);
const watch = (target, label) => target.on('pageerror', error => errors.push(`${label}: ${error.message}`)); watch(page, 'Editor');
let server;
const checked = text => { checks.push(text); console.log(text); };
const ready = async () => { await page.getByTestId('workspace-shell').waitFor(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); };
const nav = label => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: label, exact: true }).click();
const action = async name => { await ready(); if (!await page.locator('.project-switcher').evaluate(e => e.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); };
const openMotion = async () => { await page.getByRole('button', { name: '动效预设 · 试看并应用', exact: true }).click(); return page.getByRole('dialog', { name: '剧情动效预设' }); };
async function preview(kind, duration) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const iframe = await page.locator('.motion-preset-dialog iframe').elementHandle();
    const frame = await iframe?.contentFrame();
    const state = await frame?.evaluate(({ kind, duration }) => {
      const element = document.querySelector(`[data-story-motion="${kind}"]`);
      return !!element && element.style.animationDuration === `${duration}ms` && document.querySelector('main')?.dataset.playerMuted === 'true' && [...document.querySelectorAll('audio,video')].every(e => e.muted || e.volume === 0);
    }, { kind, duration }).catch(() => false);
    if (state) return frame;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw Error(`Formal preview did not show ${kind}/${duration}`);
}
async function saveDownload(trigger, filename) {
  const pending = page.waitForEvent('download'); await trigger(); const download = await pending;
  const destination = path.join(output, filename); await download.saveAs(destination); return destination;
}
async function silentPlayer(target, url) {
  watch(target, 'Player'); await target.goto(url);
  await target.getByRole('button', { name: '打开玩家设置', exact: true }).click();
  await target.getByLabel('静音全部声音', { exact: true }).check();
  await target.getByLabel('文字显示', { exact: true }).selectOption('instant');
  await target.getByRole('button', { name: '返回故事', exact: true }).click();
  await target.getByRole('button', { name: '打开这封回信', exact: true }).click();
}
async function advance(target) {
  await target.getByRole('button', { name: '继续下一句', exact: true }).click();
  await target.waitForTimeout(60);
}
async function route(target, option, ending, screenshot) {
  let sawCharacter = false, sawText = false;
  for (let n = 0; n < 90 && !await target.locator('.player-choice button').count(); n++) {
    assert.equal(await target.locator('main').getAttribute('data-player-muted'), 'true');
    sawCharacter ||= await target.locator('[data-stage-slot][data-story-motion="rise-in"]').count() > 0;
    if (await target.locator('.player-story-text-motion[data-story-motion="text-ink"]').count()) {
      sawText = true;
      await target.screenshot({ path: path.join(output, screenshot), animations: 'disabled' });
    }
    await advance(target);
  }
  assert.ok(sawCharacter && sawText, 'Export must actually reach both authored motions');
  await target.locator('.player-choice').getByRole('button', { name: new RegExp(option) }).click();
  for (let n = 0; n < 90; n++) {
    if (await target.locator('main').getAttribute('data-player-status') === 'ended') break;
    await advance(target);
  }
  assert.equal(await target.locator('main').getAttribute('data-player-status'), 'ended');
  assert.ok((await target.locator('.player-ending').innerText()).includes(ending));
  assert.ok(await target.evaluate(() => [...document.querySelectorAll('audio,video')].every(e => e.muted || e.volume === 0)));
}
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-player-pages/tomorrow-letter-0.3.0-project.zip'));
  await ready();
  const entryId = await page.getByTestId('workspace-shell').getAttribute('data-context-scene-id');
  await page.locator('.statement-card--direction').filter({ hasText: '角色入场' }).click();
  let dialog = await openMotion();
  for (const [label, kind, duration] of [['柔和入场','fade-in',700], ['人物强调','pulse',600], ['轻柔呼吸','breathe',2400], ['渐隐退场','fade-out',700]]) {
    await dialog.getByRole('button', { name: label, exact: true }).click(); await preview(kind, duration);
  }
  await dialog.getByRole('button', { name: '轻步入场', exact: true }).click();
  await dialog.getByLabel('动效时长', { exact: true }).fill('1200');
  await dialog.getByLabel('动效强度', { exact: true }).selectOption('1.25');
  await dialog.getByLabel('动效预设名称', { exact: true }).fill('回信·轻步入场');
  await dialog.getByRole('button', { name: '保存为工程预设', exact: true }).click();
  const config = await saveDownload(() => dialog.getByRole('button', { name: '导出动效配置', exact: true }).click(), 'letter-entrance.worldmotion.json');
  await dialog.getByLabel('导入动效配置', { exact: true }).setInputFiles({ name: 'invalid.worldmotion.json', mimeType: 'application/json', buffer: Buffer.from('{"script":"alert(1)"}') });
  await dialog.getByText('配置格式或参数无效；当前草稿未更改。', { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('动效时长', { exact: true }).inputValue(), '1200');
  await dialog.getByLabel('导入动效配置', { exact: true }).setInputFiles(config);
  await preview('rise-in', 1200);
  await page.screenshot({ path: path.join(output, 'author-character-motion.png'), animations: 'disabled' });
  await dialog.getByLabel('外观预览设备', { exact: true }).selectOption('phone'); await preview('rise-in', 1200);
  await page.screenshot({ path: path.join(output, 'author-phone-preview.png'), animations: 'disabled' });
  for (const width of [736, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await dialog.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && e.scrollWidth <= e.clientWidth + 1; }), `Author dialog overflows at ${width}px`);
    if (width === 390) await page.screenshot({ path: path.join(output, 'author-editor-phone.png'), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole('button', { name: '应用到当前剧情', exact: true }).click();
  await page.locator('.statement-card--direction').filter({ hasText: '轻步入场' }).waitFor();
  checked('Browse character entrance/emphasis/breathing/exit in the real muted Player; save/export/import a custom entrance and apply it to the original cue; the author dialog fits 736/390/320px.');
  await page.locator('.statement-card--narration').filter({ hasText: '信封写着' }).click();
  const directionCount = await page.locator('.statement-card--direction').count();
  dialog = await openMotion(); await dialog.getByRole('button', { name: '文字墨色强调', exact: true }).click();
  await dialog.getByLabel('动效时长', { exact: true }).fill('1100'); await dialog.getByLabel('动效重复次数', { exact: true }).fill('2');
  await dialog.getByLabel('动效预设名称', { exact: true }).fill('回信·文字强调');
  await dialog.getByRole('button', { name: '保存为工程预设', exact: true }).click(); await preview('text-ink', 1100);
  await saveDownload(() => dialog.getByRole('button', { name: '导出动效配置', exact: true }).click(), 'letter-text.worldmotion.json');
  await page.screenshot({ path: path.join(output, 'author-text-motion.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: '应用到当前剧情', exact: true }).click();
  assert.equal(await page.locator('.statement-card--direction').count(), directionCount + 2);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await page.locator('.statement-card--direction').count(), directionCount);
  await page.getByRole('button', { name: '重做', exact: true }).click(); assert.equal(await page.locator('.statement-card--direction').count(), directionCount + 2);
  checked('Apply a text effect with its restoration as one source transaction; the normal toolbar Undo/Redo removes/restores the whole pair.');
  await page.locator('.scene-rail').getByRole('button', { name: /寄往远方/ }).click();
  await page.locator('.statement-card--narration').first().click(); dialog = await openMotion();
  await dialog.getByLabel('我的工程动效预设', { exact: true }).selectOption('回信·文字强调');
  assert.equal(await dialog.getByLabel('动效时长', { exact: true }).inputValue(), '1100');
  await preview('text-ink', 1100); await dialog.getByRole('button', { name: '应用到当前剧情', exact: true }).click();
  await ready(); await page.getByRole('button', { name: '保存到本机', exact: true }).click(); await ready();
  await action('所有项目'); await page.getByRole('main', { name: '项目首页' }).waitFor(); await page.reload();
  await page.getByRole('button', { name: '打开项目：给明天的回信', exact: true }).click(); await ready();
  await page.locator('.scene-rail').getByRole('button', { name: /候车室的来信/ }).click();
  assert.equal(await page.getByTestId('workspace-shell').getAttribute('data-context-scene-id'), entryId);
  await page.locator('.statement-card--direction').filter({ hasText: '轻步入场' }).click(); dialog = await openMotion();
  assert.equal(await dialog.getByLabel('动效时长', { exact: true }).inputValue(), '1200');
  await dialog.getByLabel('我的工程动效预设', { exact: true }).selectOption('回信·文字强调');
  assert.equal(await dialog.getByLabel('动效重复次数', { exact: true }).inputValue(), '2');
  await dialog.getByRole('button', { name: '放弃草稿并关闭', exact: true }).click();
  checked('Reuse the named preset in another scene, save locally, return home/reload/reopen, and recover both library and actual scene cues.');
  await nav('发布'); await page.getByLabel('发布版本', { exact: true }).fill('0.4.0'); await page.getByRole('button', { name: '应用发布设置', exact: true }).click();
  await saveDownload(() => action('导出工程 ZIP'), 'tomorrow-letter-0.4.0-project.zip');
  await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  await page.locator('input[name="publication-format"][value="html"]').check();
  await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click();
  await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const html = await saveDownload(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), 'tomorrow-letter-0.4.0.html');
  const desktop = await context.newPage(); await silentPlayer(desktop, pathToFileURL(html).href);
  await route(desktop, '留下来', '有人等你回来', 'player-desktop-motion.png');
  await desktop.screenshot({ path: path.join(output, 'player-desktop-ending.png'), animations: 'disabled' });
  checked('The actual standalone HTML runs from file://, reaches authored character/text cues and the first ending through ordinary player inputs, muted.');
  await page.getByRole('button', { name: '← 导出方式', exact: true }).click();
  await page.locator('input[name="publication-format"][value="directory"]').check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('a[download]')?.getAttribute('download')?.endsWith('-web.zip'), undefined, { timeout: 60000 });
  const archive = await saveDownload(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), 'tomorrow-letter-0.4.0-web.zip');
  const files = unzipSync(await readFile(archive));
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.woff2':'font/woff2', '.wav':'audio/wav' };
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html'; const bytes = files[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': types[path.extname(name)] ?? 'application/octet-stream' }); response.end(bytes ?? 'Not found'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const mobile = await context.newPage(); await mobile.setViewportSize({ width: 390, height: 844 });
  await silentPlayer(mobile, `http://127.0.0.1:${server.address().port}/gal/`);
  await route(mobile, '下一座城市', '把明天写进信里', 'player-phone-motion.png');
  await mobile.screenshot({ path: path.join(output, 'player-phone-ending.png'), animations: 'disabled' });
  checked('The actual directory ZIP runs under /gal/ over HTTP at 390×844 and reaches the second ending with authored motion, muted.');
  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const reduced = await reducedContext.newPage();
  await silentPlayer(reduced, `http://127.0.0.1:${server.address().port}/gal/`);
  for (let n = 0; n < 30 && !await reduced.locator('[data-stage-slot][data-story-motion="rise-in"]').count(); n++) await advance(reduced);
  assert.equal(await reduced.locator('[data-stage-slot][data-story-motion="rise-in"]').evaluate(e => getComputedStyle(e).animationName), 'none');
  assert.ok((await reduced.locator('.player-dialogue__text').innerText()).length > 0);
  await reduced.screenshot({ path: path.join(output, 'player-reduced-motion.png'), animations: 'disabled' });
  checked('OS reduced-motion disables cue animation without hiding the entered character or readable dialogue.');
  assert.deepEqual(errors, []);
  const report = { passed: true, checkedAt: new Date().toISOString(), checks, errors, audioMuted: true, independentEndingCoverage: '2/2 across HTML desktop and directory mobile (not every format×route combination)', editorFullRouteCoverage: '0/2; preview is not full playthrough', realDevice: false, publicDeployment: false };
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length }));
} catch (error) {
  await page.screenshot({ path: path.join(output, `failure-${run}.png`), animations: 'disabled' }).catch(() => {});
  const pages = await Promise.all(context.pages().map(async p => ({ url: p.url(), text: (await p.locator('body').innerText().catch(() => '')).slice(-4000) })));
  await writeFile(path.join(output, `failure-${run}.json`), JSON.stringify({ passed: false, checks, errors, failure: error.stack, pages }, null, 2));
  console.error((await page.locator('body').innerText()).slice(-8000)); throw error;
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

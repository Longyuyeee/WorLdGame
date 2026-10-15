import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-collection-progress'); await mkdir(output, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'world-collection-progress-'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); editor.setDefaultTimeout(20000);
const checks = [], errors = [], exports = {}; let server, current = editor;
const watch = p => p.on('pageerror', error => errors.push(error.message)); watch(editor);
const check = text => { checks.push(text); console.log(text); };
const main = p => p.locator('main.player-shell'), dialog = p => p.getByRole('dialog', { name: '存读档槽位', exact: true });
const card = (p, id) => p.locator(`[data-save-slot="${id}"]`);
const hash = p => main(p).getAttribute('data-runtime-state-hash');
const text = p => p.locator('.player-dialogue__text').innerText();
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function fit(p, selector) { const r = await p.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, scroll: el.scrollWidth, client: el.clientWidth }; }); assert.ok(r.left >= -1 && r.right <= r.width + 1 && r.top >= -1 && r.bottom <= r.height + 1 && r.scroll <= r.client + 1, JSON.stringify(r)); }
async function advance(p) { await p.waitForFunction(() => { const voice = document.querySelector('audio[data-audio-bus="voice"]'); return !voice || voice.ended || voice.error || voice.dataset.voiceCompleted === 'true' || voice.dataset.voiceFailed === 'true' || voice.dataset.shouldPlay !== 'true'; }, null, { timeout: 60000 }); const before = await hash(p); for (let i = 0; i < 10; i++) { await p.getByRole('button', { name: '继续下一句', exact: true }).click(); await p.waitForTimeout(40); if (await hash(p) !== before) return; } throw Error('Paragraph did not advance after reading below-fold text'); }
async function open(p, load = false) { if (!await p.getByRole('button', { name: '存读档', exact: true }).isVisible()) await p.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await p.getByRole('button', { name: '存读档', exact: true }).click(); if (load) await dialog(p).getByRole('button', { name: '读取进度', exact: true }).click(); }
async function save(p, id, overwrite = false) { await open(p); await card(p, id).getByRole('button', { name: '保存', exact: true }).click(); if (overwrite) await card(p, id).getByRole('button', { name: '确认覆盖', exact: true }).click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await dialog(p).getByRole('button', { name: '关闭存读档', exact: true }).click(); }
async function requestRead(p, id) { await open(p, true); await card(p, id).getByRole('button', { name: '读取', exact: true }).click(); await p.getByRole('region', { name: '确认读取存档', exact: true }).waitFor(); }
async function confirm(p) { await p.getByRole('button', { name: '确认读取', exact: true }).click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); }
async function exportGame(directory) {
  if (directory) await editor.getByRole('button', { name: '← 导出方式', exact: true }).click(); else { await editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await editor.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); }
  await editor.getByRole('radio', { name: directory ? /网页目录 ZIP/ : /单文件 HTML/ }).check(); await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await editor.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await editor.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click(); await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  const pending = editor.waitForEvent('download'); await editor.getByRole('link', { name: '下载游戏', exact: true }).click(); const bytes = await readFile(await (await pending).path()), name = directory ? 'rain-web.zip' : 'rain.html';
  exports[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; await writeFile(path.join(temporary, name), bytes); return bytes;
}

async function start(p) {
  await p.getByRole('button', { name: /^开始故事/ }).click();
  if (await p.getByRole('button', { name: '确认开始新故事', exact: true }).isVisible()) await p.getByRole('button', { name: '确认开始新故事', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.playerStatus !== 'title');
}
async function finish(p, branch, ending) {
  for (let i = 0; i < 300 && await main(p).getAttribute('data-player-status') !== 'ended'; i++) {
    if (i % 30 === 0) console.log(`route ${branch}: step ${i}`);
    if (await p.locator('.player-choice button').count()) await p.locator('.player-choice').getByRole('button', { name: branch, exact: true }).click();
    else await advance(p);
  }
  assert.equal(await main(p).getAttribute('data-player-status'), 'ended');
  assert.ok((await p.locator('.player-ending h2').innerText()).includes(ending));
}
async function overview(p) { await p.getByRole('button', { name: '返回附加内容总览', exact: true }).click(); }
async function endingCount(p, count) {
  const region = p.getByRole('region', { name: '结局内容', exact: true });
  await region.waitFor(); assert.ok((await region.innerText()).includes(`${count} / 2 已达成`));
}
async function titleCollections(p, count) {
  await p.getByRole('button', { name: '打开附加内容', exact: true }).click();
  assert.ok((await p.getByRole('group', { name: '结局', exact: true }).innerText()).includes(`${count} / 2 已发现`));
  await p.getByRole('button', { name: '查看 场景回想', exact: true }).click();
  await p.getByText(/仅有收藏记录时无法直接回想/).waitFor();
  const buttons = p.getByRole('button', { name: /^开始回想/ }); assert.ok(await buttons.count());
  for (const button of await buttons.all()) assert.ok(await button.isDisabled());
}
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/'); await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip')); await editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await exportGame(false); const files = unzipSync(await exportGame(true));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); current = page; watch(page); page.setDefaultTimeout(20000);
  await page.goto(pathToFileURL(path.join(temporary, 'rain.html')).href); await start(page); await save(page, 'manual-1');
  await finish(page, '留下等雨停', '同行的约定'); await page.getByText('已达成 1 / 2 个结局', { exact: true }).waitFor(); await fit(page, '.player-ending'); await shot(page, 'desktop-ending');
  await page.getByRole('button', { name: '查看收藏与结局', exact: true }).click(); await endingCount(page, 1); await fit(page, '.player-additional-content'); await shot(page, 'desktop-ending-collection');
  await overview(page); await page.getByRole('button', { name: '查看 CG 画廊', exact: true }).click(); const gallery = page.getByRole('button', { name: /^查看画面 / }); assert.ok(await gallery.count()); await gallery.first().click(); await page.getByRole('button', { name: '关闭画面预览', exact: true }).click();
  await overview(page); await page.getByRole('button', { name: '查看 音乐室', exact: true }).click(); assert.ok(await page.getByRole('region', { name: '音乐室内容', exact: true }).locator('audio').count());
  await overview(page); await page.getByRole('button', { name: '查看 场景回想', exact: true }).click(); const available = page.getByRole('button', { name: /^开始回想/ });
  const originalHash = await hash(page), originalCursor = await main(page).getAttribute('data-history-cursor'); let replayed = false;
  for (const button of await available.all()) { if (await button.isEnabled()) { await button.click(); replayed = true; break; } }
  if (replayed) {
    await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.sceneReplay !== 'inactive'); await page.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click();
  } else {
    await page.getByText(/仅有收藏记录时无法直接回想/).waitFor();
    assert.ok(await available.count()); for (const button of await available.all()) assert.ok(await button.isDisabled());
    await shot(page, 'desktop-missing-replay-entry'); await page.getByRole('button', { name: '返回剧情', exact: true }).click();
  }
  assert.equal(await hash(page), originalHash); assert.equal(await main(page).getAttribute('data-history-cursor'), originalCursor); assert.equal(await main(page).getAttribute('data-player-status'), 'ended');
  check({ replayed, limitation: replayed ? null : 'Rain authored replay has no safe scene entrance in current History; disabled guidance checked, actual replay not claimed' });
  await page.getByRole('button', { name: '回到标题', exact: true }).click(); await titleCollections(page, 1); await shot(page, 'desktop-title-replay-context'); await page.getByRole('button', { name: '返回剧情', exact: true }).click();
  await page.reload(); await titleCollections(page, 1); await page.getByRole('button', { name: '返回剧情', exact: true }).click();
  check('desktop HTML: first full route unlocks one ending, real gallery image and music remain available; replay availability is checked without changing the ending hash/cursor; title and refresh retain collection without loading a story save; missing route contexts are explained and disabled');
  await start(page); await finish(page, '去追最后一班车', '远行的约定'); await page.getByText('已达成 2 / 2 个结局', { exact: true }).waitFor(); await shot(page, 'desktop-both-endings');
  await page.getByRole('button', { name: '读取存档探索其他路线', exact: true }).click(); await card(page, 'manual-1').getByRole('button', { name: '读取', exact: true }).click(); await confirm(page);
  await page.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await page.getByRole('button', { name: '打开附加内容', exact: true }).click();
  assert.ok((await page.getByRole('group', { name: '结局', exact: true }).innerText()).includes('2 / 2 已发现'));
  await page.getByRole('button', { name: '返回剧情', exact: true }).click(); await page.reload(); await titleCollections(page, 2); await shot(page, 'desktop-refreshed-both');
  check('desktop HTML: a fresh execution reaches the other ending and unions both route collections; reading the older opening save keeps both endings; another reload still shows both');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = files[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': mime[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }); current = mobile; watch(mobile); mobile.setDefaultTimeout(20000);
  await mobile.goto(`http://127.0.0.1:${server.address().port}/gal/index.html`); await start(mobile); await finish(mobile, '去追最后一班车', '远行的约定');
  await mobile.getByText('已达成 1 / 2 个结局', { exact: true }).waitFor(); await fit(mobile, '.player-ending'); await shot(mobile, 'mobile-ending');
  await mobile.setViewportSize({ width: 844, height: 390 }); await fit(mobile, '.player-ending'); await shot(mobile, 'mobile-landscape-ending'); await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.getByRole('button', { name: '查看收藏与结局', exact: true }).click(); await endingCount(mobile, 1); await fit(mobile, '.player-additional-content'); await shot(mobile, 'mobile-collection'); await mobile.getByRole('button', { name: '返回剧情', exact: true }).click();
  await mobile.getByRole('button', { name: '回到标题', exact: true }).click(); await mobile.reload(); await titleCollections(mobile, 1); await fit(mobile, '.player-additional-content'); await shot(mobile, 'mobile-refreshed-replay-context');
  await mobile.getByRole('button', { name: '读取路线存档', exact: true }).click(); await dialog(mobile).waitFor(); await fit(mobile, '.player-save__panel'); assert.ok(await dialog(mobile).getByRole('button', { name: '读取进度', exact: true }).getAttribute('aria-pressed') === 'true');
  check('390px HTTP directory: full other route reaches ending; portrait and 844x390 ending card fit; collection and refreshed title persist one ending in the independent browser storage; replay guidance opens native read mode');
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), checks, errors, exports, artifactsRetained: false, scope: 'Rain 1.5.4 real UI exports; desktop both branches sequentially, mobile one branch; manual fast reading, no human text/voice acceptance, physical phone, service-worker lifecycle, cross-version collection migration or public deployment' }, null, 2));
} catch (error) { await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ checks, errors, error: String(error), stack: error.stack }, null, 2)); await shot(current, 'failure'); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); const resolved = path.resolve(temporary); assert.equal(path.dirname(resolved), path.resolve(tmpdir())); assert.ok(path.basename(resolved).startsWith('world-collection-progress-')); await rm(resolved, { recursive: true, force: true }); }

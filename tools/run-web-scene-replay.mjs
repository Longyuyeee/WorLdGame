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
const layoutOnly = process.env.STUDIO_REPLAY_LAYOUT_ONLY === '1';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-scene-replay'); await mkdir(output, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'world-scene-replay-'));
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

async function extras(p, fromEnding = false) {
  if (fromEnding) { await p.getByRole('button', { name: '查看收藏与结局', exact: true }).click(); await p.getByRole('button', { name: '返回附加内容总览', exact: true }).click(); }
  else await p.getByRole('button', { name: '打开附加内容', exact: true }).click();
  await p.getByRole('button', { name: '查看 场景回想', exact: true }).click(); await fit(p, '.player-additional-content');
}
async function enter(p, title) {
  const button = p.getByRole('button', { name: `开始回想 ${title}`, exact: true }); assert.ok(await button.isEnabled()); await button.click();
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.sceneReplay !== 'inactive');
  assert.equal(await p.getByRole('button', { name: '存读档', exact: true }).isVisible(), false);
}
async function parent(p) { return { runtime: await hash(p), host: await main(p).getAttribute('data-runtime-host-snapshot-hash'), cursor: await main(p).getAttribute('data-history-cursor'), status: await main(p).getAttribute('data-player-status') }; }
async function returned(p, before) { assert.deepEqual(await parent(p), before); assert.equal(await main(p).getAttribute('data-scene-replay'), 'inactive'); }
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/'); await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip')); await editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await exportGame(false); const files = unzipSync(await exportGame(true));
  if (layoutOnly) {
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = files[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': mime[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }); current = mobile; watch(mobile); mobile.setDefaultTimeout(20000);
    await mobile.goto(`http://127.0.0.1:${server.address().port}/gal/index.html`); await start(mobile);
    const skip = async () => { await mobile.getByRole('button', { name: '打开阅读菜单', exact: true }).click(); await mobile.getByRole('button', { name: '快进全部', exact: true }).click(); };
    await skip();
    for (let i = 0; i < 500 && await main(mobile).getAttribute('data-player-status') !== 'ended'; i++) {
      if (await mobile.locator('.player-choice button').count()) { await mobile.locator('.player-choice').getByRole('button', { name: '去追最后一班车', exact: true }).click(); await skip(); }
      else await mobile.waitForTimeout(100);
    }
    assert.equal(await main(mobile).getAttribute('data-player-status'), 'ended'); const original = await parent(mobile);
    await extras(mobile, true); await enter(mobile, '再一次见面'); await fit(mobile, '.player-replay-status');
    assert.ok(await mobile.locator('.player-replay-status strong').evaluate(el => el.scrollWidth <= el.clientWidth + 1)); await shot(mobile, 'mobile-replay-final');
    await mobile.setViewportSize({ width: 844, height: 390 }); await fit(mobile, '.player-replay-status');
    const separated = await mobile.evaluate(() => { const banner = document.querySelector('.player-replay-status').getBoundingClientRect(), text = document.querySelector('.player-dialogue').getBoundingClientRect(); return { bottom: banner.bottom, textTop: text.top }; }); assert.ok(separated.bottom <= separated.textTop, JSON.stringify(separated)); await shot(mobile, 'mobile-landscape-replay-final');
    await mobile.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click(); await returned(mobile, original);
    check('final layout only: actual Rain UI skip-all reaches other ending; portrait scene title fits, 844x390 banner stays above dialogue, exit retains parent; no repeat of full natural/manual route validation');
    assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-layout-final.json'), JSON.stringify({ passed: true, browser: browser.version(), checks, errors, exports, artifactsRetained: false, layoutOnly: true }, null, 2));
  } else {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); current = page; watch(page); page.setDefaultTimeout(20000);
  await page.goto(pathToFileURL(path.join(temporary, 'rain.html')).href); await start(page); await finish(page, '留下等雨停', '同行的约定'); await save(page, 'manual-2');
  const before = await parent(page); await extras(page, true); await shot(page, 'desktop-replay-ready'); await enter(page, '雨后的天明'); await shot(page, 'desktop-replay-start');
  await finish(page, '留下等雨停', '同行的约定'); await page.getByText('回想结束', { exact: true }).waitFor(); await shot(page, 'desktop-replay-ended'); await page.keyboard.press('Space'); await returned(page, before);
  check('desktop HTML: full stay route creates the actual Rain replay entry; replay starts, reaches its ending, and Space restores exactly the parent Runtime hash, host hash, history cursor and ending; save entry stays hidden during replay');
  await page.getByRole('button', { name: '回到标题', exact: true }).click(); await page.reload(); const title = await parent(page); await extras(page); await enter(page, '雨后的天明'); await page.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click(); await returned(page, title);
  // Remove only the isolated test profile's new archive, to reproduce a pre-feature browser with its real slot and collection intact.
  const removed = await page.evaluate(() => { const keys = Object.keys(localStorage).filter(key => key.startsWith('world-player.replay.v1:')); for (const key of keys) localStorage.removeItem(key); return keys.length; }); assert.ok(removed > 0);
  await page.reload(); await extras(page); await page.getByText(/这段回想尚未保留路线入口/).waitFor(); await page.getByRole('button', { name: '读取路线存档', exact: true }).click(); await card(page, 'manual-2').getByRole('button', { name: '读取', exact: true }).click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded');
  const loaded = await parent(page); await extras(page, true); await enter(page, '雨后的天明'); await page.keyboard.press('Escape'); await returned(page, loaded);
  check('desktop HTML: refreshed title starts replay directly and returns to title; after deliberately removing only new replay records in the test profile, reading the actual existing ending slot rebuilds the entrance without replay data in that slot; Escape restores the loaded ending exactly');
  await page.getByRole('button', { name: '回到标题', exact: true }).click(); await start(page); await finish(page, '去追最后一班车', '远行的约定'); await page.getByText('已达成 2 / 2 个结局', { exact: true }).waitFor();
  await page.getByRole('button', { name: '回到标题', exact: true }).click(); await page.reload(); const both = await parent(page); await extras(page);
  assert.ok(await page.getByRole('button', { name: '开始回想 雨后的天明', exact: true }).isEnabled()); assert.ok(await page.getByRole('button', { name: '开始回想 再一次见面', exact: true }).isEnabled()); await shot(page, 'desktop-both-replays');
  await enter(page, '雨后的天明'); await page.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click(); await returned(page, both);
  check('desktop HTML: both real routes accumulate independently; after restart and refresh both ending-scene replays remain available, including replaying the earlier route after finishing the other');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/gal\//, '') || 'index.html', bytes = files[name]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': mime[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }); current = mobile; watch(mobile); mobile.setDefaultTimeout(20000);
  await mobile.goto(`http://127.0.0.1:${server.address().port}/gal/index.html`); await start(mobile); await finish(mobile, '去追最后一班车', '远行的约定'); const mobileParent = await parent(mobile);
  await extras(mobile, true); await shot(mobile, 'mobile-replay-ready'); await enter(mobile, '再一次见面'); await fit(mobile, '.player-replay-status'); await shot(mobile, 'mobile-replay');
  await mobile.setViewportSize({ width: 844, height: 390 }); await fit(mobile, '.player-replay-status'); await shot(mobile, 'mobile-landscape-replay'); await mobile.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click(); await returned(mobile, mobileParent);
  await mobile.setViewportSize({ width: 390, height: 844 }); await mobile.getByRole('button', { name: '回到标题', exact: true }).click(); await mobile.reload(); const mobileTitle = await parent(mobile); await extras(mobile); await enter(mobile, '再一次见面'); await mobile.getByRole('button', { name: '退出回想，返回原剧情', exact: true }).click(); await returned(mobile, mobileTitle);
  check('390px HTTP directory: full go route, actual replay and 844x390 banner/exit, original ending restored exactly; refreshed title starts the saved replay without a story load and exits back to title');
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), checks, errors, exports, artifactsRetained: false, scope: 'Rain 1.5.4 real UI HTML/directory exports; desktop both routes and complete stay replay, title/reload and native-slot entrance rebuilding; mobile other route/replay/layout; isolated test archive removed to simulate old data; no injected unlocks, human reading/listening acceptance, physical phone, service-worker lifecycle, cross-device archive migration or public deployment' }, null, 2));
  }
} catch (error) { await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ checks, errors, error: String(error), stack: error.stack }, null, 2)); await shot(current, 'failure'); throw error; }
finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); const resolved = path.resolve(temporary); assert.equal(path.dirname(resolved), path.resolve(tmpdir())); assert.ok(path.basename(resolved).startsWith('world-scene-replay-')); await rm(resolved, { recursive: true, force: true }); }

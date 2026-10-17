import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { readGamePayload } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-publication-reading');
const baseline = path.join(root, 'evidence/web-story-continuity'), ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), json = bytes => JSON.parse(strFromU8(bytes));
const button = (p, name) => p.getByRole('button', { name, exact: true });
const main = p => p.locator('main.player-shell'), hash = p => main(p).getAttribute('data-runtime-state-hash');
const stable = p => p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
const checks = [], errors = [], measurements = [], routes = [], artifacts = {};
let browser, current, server, served, blocked;
await mkdir(output, { recursive: true });
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log('PASS ' + name); };
const sourcePath = path.join(baseline, 'before-rain-stops-project.zip'), sourceBytes = await readFile(sourcePath), source = unzipSync(sourceBytes);
const oldHtml = await readFile(path.join(baseline, 'before-rain-stops.html'), 'utf8'), oldFiles = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-website.zip')));
async function download(p, action) { const pending = p.waitForEvent('download'); await action(); return readFile(await (await pending).path()); }
async function openMenu(p) { await button(p, '打开阅读菜单').click(); }
async function closeMenu(p) { await p.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '返回故事', exact: true }).click(); }
async function offline(p) { if (!await p.locator('#offline-panel').isVisible()) await openMenu(p); if (!await p.locator('#offline-panel').evaluate(el => el.open)) await p.locator('#offline-panel > summary').click(); }
async function quickLoad(p) {
  if (await button(p, '读取存档').isVisible()) await button(p, '读取存档').click(); else { await openMenu(p); await button(p, '存读档').click(); }
  const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
  if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click();
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); await stable(p);
}
async function geometry(p, name) {
  const value = await p.evaluate(() => {
    const shell = document.querySelector('main.player-shell').getBoundingClientRect(), stage = document.querySelector('.player-stage-world').getBoundingClientRect();
    return { viewport: [innerWidth, innerHeight], offset: parseFloat(getComputedStyle(document.body).getPropertyValue('--player-viewport-offset')) || 0, shellTop: shell.top, stage: stage.toJSON(), ratio: stage.width / stage.height, width: document.documentElement.scrollWidth, visibleTools: document.getElementById('world-publication-tools').getBoundingClientRect().height };
  });
  assert.equal(value.offset, 0); assert.equal(value.shellTop, 0); assert.equal(value.visibleTools, 0); assert.ok(Math.abs(value.ratio - 16 / 9) < .01); assert.ok(value.width <= value.viewport[0]);
  measurements.push({ name, ...value }); await shot(p, name);
}
try {
  const dist = path.join(root, 'apps/editor/dist'), editorHtml = await readFile(path.join(dist, 'index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), editorHtml); artifacts.editor = {};
  for (const [, name] of editorHtml.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) { const bytes = await readFile(path.join(dist, name)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(name, ui))).arrayBuffer())), sha(bytes)); artifacts.editor[name] = sha(bytes); }
  browser = await engines.chromium.launch({ headless: true, args: ['--mute-audio'] });
  const author = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); current = author; author.on('pageerror', error => errors.push(String(error)));
  await author.goto(ui); await author.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(sourcePath); await author.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await author.getByLabel('项目菜单', { exact: true }).click(); const roundtrip = unzipSync(await download(author, () => author.getByRole('button', { name: /导出工程 ZIP/u }).click()));
  assert.deepEqual(Object.keys(roundtrip).sort(), Object.keys(source).sort()); for (const [name, bytes] of Object.entries(source)) assert.equal(sha(roundtrip[name]), sha(bytes), name);
  await author.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await button(author, '继续：导出方式 →').click();
  let htmlBytes, files;
  for (const format of ['html', 'website', 'directory']) {
    if (format !== 'html') await author.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/u }).click();
    await author.locator(`input[name="publication-format"][value="${format}"]`).check(); await author.getByLabel('同时生成制作交付包', { exact: true }).uncheck(); await button(author, '继续：生成游戏 →').click();
    await author.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(author, format === 'html' ? '构建试玩 HTML' : format === 'website' ? '构建网站上传 ZIP' : '构建目录 ZIP').click();
    const name = format === 'website' ? '下载网站上传包' : '下载游戏', link = author.getByRole('link', { name, exact: true }); await link.waitFor({ timeout: 90000 }); const bytes = await download(author, () => link.click());
    if (format === 'html') { htmlBytes = bytes; await writeFile(path.join(output, 'before-rain-stops.html'), bytes); }
    else if (format === 'website') { files = unzipSync(bytes); await writeFile(path.join(output, 'before-rain-stops-website.zip'), bytes); }
    else { const local = unzipSync(bytes); for (const [name, data] of Object.entries(files)) assert.equal(sha(local[name]), sha(data), name); assert.equal(Object.keys(local).length - Object.keys(files).length, 5); assert.match(strFromU8(local['使用说明.txt']), /标题页或阅读菜单/u); }
    artifacts[format] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  const payload = readGamePayload(strFromU8(htmlBytes)); assert.deepEqual(payload.project, readGamePayload(oldHtml).project); assert.deepEqual(payload.project, readGamePayload(strFromU8(files['index.html'])).project);
  const oldMedia = readGamePayload(oldHtml).mediaAssets; assert.deepEqual(payload.mediaAssets, oldMedia);
  const info = json(files['build-info.json']); assert.equal(info.publication.version, '1.8.0'); assert.equal(info.projectDigest, json(oldFiles['build-info.json']).projectDigest);
  assert.equal(Object.keys(files).length, 36); for (const row of info.files) { assert.equal(sha(files[row.path]), row.digest.replace('sha256:', '')); assert.equal(files[row.path].length, row.byteLength); }
  artifacts.source = { sha256: sha(sourceBytes), unchangedEntries: Object.keys(source).length, unchangedMedia: oldMedia.length, version: '1.8.0', projectDigest: info.projectDigest };
  check('actual-editor-source-roundtrip-and-three-export-formats-exact-story-media-and-public-inventory');
  await author.close();
  served = oldFiles;
  server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname), name = pathname.replace(/^\/game\//u, '') || 'index.html', data = served[name];
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml' }[path.extname(name)] ?? 'application/octet-stream';
    if (name === blocked) return res.writeHead(503).end('Deliberate update failure');
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' }, range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
    if (data && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : data.length - 1, data.length - 1); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }).end(data.subarray(start, end + 1)); }
    res.writeHead(data ? 200 : 404, headers).end(data ?? 'Missing');
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = `http://127.0.0.1:${server.address().port}/game/`;
  // Establish the real previous 1.8.0 cache, progress and viewport before upgrading shell bytes.
  const upgrade = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' }); let p = await upgrade.newPage(); current = p; p.on('pageerror', error => errors.push(String(error)));
  await p.goto(url); await button(p, '开始故事').click(); await stable(p); const oldHash = await hash(p);
  measurements.push({ name: 'before-844x390', ...(await p.evaluate(() => ({ offset: parseFloat(document.body.style.getPropertyValue('--player-viewport-offset')), shellTop: document.querySelector('main.player-shell').getBoundingClientRect().top }))) }); await shot(p, 'before-844x390');
  await openMenu(p); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await closeMenu(p);
  await offline(p); await button(p, '下载离线内容').click(); await p.locator('#offline-status').filter({ hasText: '离线内容已就绪' }).waitFor({ timeout: 90000 }); await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
  served = files; await button(p, '检查更新').click(); await p.locator('#offline-status').filter({ hasText: '新版已下载' }).waitFor({ timeout: 90000 }); assert.equal(await hash(p), oldHash);
  await p.close(); p = await upgrade.newPage(); current = p; p.on('pageerror', error => errors.push(String(error))); await p.goto(url); await p.locator('.player-title-screen #world-publication-version').waitFor();
  await quickLoad(p); assert.equal(await hash(p), oldHash); await geometry(p, 'updated-844x390');
  await offline(p); await p.locator('#offline-status').filter({ hasText: '离线内容已就绪' }).waitFor(); await closeMenu(p);
  await upgrade.setOffline(true); const response = await p.reload(); assert.equal(response.fromServiceWorker(), true); await quickLoad(p); assert.equal(await hash(p), oldHash); await geometry(p, 'offline-restored-844x390');
  await offline(p); await p.locator('#offline-status').filter({ hasText: '离线内容已就绪' }).waitFor(); await shot(p, 'offline-menu-landscape'); await closeMenu(p);
  await upgrade.setOffline(false); await upgrade.close(); check('actual-previous-1.8.0-cache-update-waits-for-close-and-restores-same-progress-offline', { oldHash, storyVersionChanged: false, loopbackOnly: true });
  // Exercise new-shell update failure/retry/waiting without manufacturing another story version.
  const updates = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); p = await updates.newPage(); current = p; p.on('pageerror', error => errors.push(String(error)));
  await p.goto(url); await offline(p); await shot(p, 'title-publication-tools');
  await p.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.installPromptCalls = (window.installPromptCalls ?? 0) + 1; }; event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    dispatchEvent(event); window.installEventPrevented = event.defaultPrevented;
  });
  await button(p, '下载离线内容').click();
  await button(p, '开始故事').click(); await stable(p); const beforeUpdateHash = await hash(p); await offline(p);
  await p.locator('#offline-status').filter({ hasText: '离线内容已就绪' }).waitFor({ timeout: 90000 });
  await button(p, '安装游戏').click(); await button(p, '安装游戏').waitFor({ state: 'hidden' });
  assert.deepEqual(await p.evaluate(() => [window.installEventPrevented, window.installPromptCalls]), [true, 1]);
  check('download-continues-title-to-reading-to-menu-and-retains-browser-install-callback', { installPromptMock: true, realInstallation: false });
  served = oldFiles; blocked = 'player.js'; await button(p, '检查更新').click(); await p.locator('#offline-summary').filter({ hasText: '更新失败' }).waitFor({ timeout: 90000 }); assert.equal(await hash(p), beforeUpdateHash);
  await closeMenu(p); await openMenu(p); await offline(p); await button(p, '重试更新').waitFor(); blocked = undefined; await button(p, '重试更新').click(); await p.locator('#offline-summary').filter({ hasText: '新版等待重开' }).waitFor({ timeout: 90000 });
  await closeMenu(p); await openMenu(p); await offline(p); await p.locator('#offline-status').filter({ hasText: '不会自动打断' }).waitFor(); assert.equal(await hash(p), beforeUpdateHash); await shot(p, 'update-waiting-in-menu');
  await updates.close(); served = files; check('new-menu-keeps-live-update-failure-retry-and-waiting-state-across-close-reopen', { reverseShellBytesOnly: true, storyContentChanged: false });
  await browser.close(); browser = undefined;
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    browser = await engines[engine].launch({ headless: true, args: engine === 'chromium' ? ['--mute-audio'] : [] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); p = await ctx.newPage(); current = p; p.on('pageerror', error => errors.push(`${engine}:${error.message}`));
    await p.goto(url); await offline(p); const summary = p.locator('#offline-panel > summary'); await summary.focus(); await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); assert.equal(await main(p).getAttribute('data-player-status'), 'title');
    await button(p, '开始故事').click(); await stable(p); const savedHash = await hash(p);
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 740 }, { width: 1280, height: 900 }]) {
      await p.setViewportSize(size); await geometry(p, `${engine}-reading-${size.width}x${size.height}`); await openMenu(p); await offline(p);
      await p.locator('#offline-status').evaluate(el => { el.textContent = '状态说明很长。'.repeat(70); }); await p.locator('#offline-status').scrollIntoViewIfNeeded(); assert.equal(await hash(p), savedHash);
      assert.ok(await p.getByRole('dialog', { name: '阅读菜单', exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1; }));
      await summary.focus(); await p.keyboard.press('Tab'); if (!await button(p, '下载离线内容').isHidden()) assert.ok(await button(p, '下载离线内容').evaluate(el => el === document.activeElement));
      await p.keyboard.press('Escape'); assert.ok(await button(p, '打开阅读菜单').evaluate(el => el === document.activeElement)); assert.equal(await hash(p), savedHash);
    }
    check(`${engine}-title-keyboard-menu-long-status-four-viewports-and-exact-story-return`, { browser: browser.version(), physicalPhone: false, safari: false });
    await ctx.close(); await browser.close(); browser = undefined;
  }
  browser = await engines.chromium.launch({ headless: true, args: ['--mute-audio'] });
  const statements = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => json(bytes).statements), byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  for (const branch of [0, 1]) {
    const ctx = await browser.newContext({ viewport: branch ? { width: 390, height: 844 } : { width: 1280, height: 900 }, reducedMotion: 'reduce' }); p = await ctx.newPage(); current = p; p.on('pageerror', error => errors.push(String(error)));
    await p.goto(branch ? url : pathToFileURL(path.join(output, 'before-rain-stops.html')).href); await button(p, '打开玩家设置').click(); await p.getByLabel('静音全部声音', { exact: true }).check(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button(p, '返回故事').click(); await button(p, '开始故事').click();
    const ids = [], voices = new Set();
    for (let step = 0; step < 260 && await main(p).getAttribute('data-player-status') !== 'ended'; step++) {
      const options = p.locator('.player-choice button'); if (await options.count()) { await options.nth(branch).click(); continue; }
      await stable(p); const text = (await p.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(text); assert.ok(statement, text); if (ids.at(-1) !== statement.id) ids.push(statement.id);
      if (await p.locator('audio[data-audio-bus="voice"]').count()) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(statement.id); }
      if (ids.length === 3 && !routes.some(r => r.pendingBranch === branch)) {
        const saved = await hash(p); await openMenu(p); if (branch) await offline(p); await button(p, '快速保存').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await closeMenu(p); await p.reload(); await quickLoad(p); assert.equal(await hash(p), saved); routes.push({ pendingBranch: branch });
      }
      assert.equal(await p.locator('.player-media-error').count(), 0); assert.equal(await p.locator('#world-publication-tools').isVisible(), false); await button(p, '继续下一句').click();
    }
    assert.equal(await main(p).getAttribute('data-player-status'), 'ended'); assert.equal(ids.length, 66); assert.equal(voices.size, 6);
    const scenes = Object.entries(source).filter(([name]) => name.startsWith('scenes/')).map(([, bytes]) => json(bytes)), titles = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch ? ['远行', '车窗与海', '再一次见面'] : ['留下', '灯下的回信', '雨后的天明'])];
    assert.deepEqual(ids, titles.flatMap(title => json(source[scenes.find(scene => scene.title === title).scriptPath]).statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id)));
    const ending = await p.locator('.player-ending').innerText(); await shot(p, `route-${branch}-ending`); routes.splice(routes.findIndex(r => r.pendingBranch === branch), 1, { branch, entry: branch ? 'website-http' : 'html-file', ids, ending, mutedNativeVoices: voices.size });
    await ctx.close(); check(`chromium-${branch ? 'website-phone' : 'html-desktop'}-full-route-save-reload-load-and-ending`, { texts: ids.length, voices: voices.size, humanListening: false });
  }
  // Existing authored layouts must keep their independent return area and scrollable content.
  const layoutAuthor = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); current = layoutAuthor;
  layoutAuthor.on('pageerror', error => errors.push(String(error)));
  await layoutAuthor.goto(ui); await layoutAuthor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-additional-layout/tomorrow-letter-0.9.0-project.zip'));
  await layoutAuthor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await layoutAuthor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await button(layoutAuthor, '继续：导出方式 →').click();
  await layoutAuthor.locator('input[name="publication-format"][value="website"]').check(); await layoutAuthor.getByLabel('同时生成制作交付包', { exact: true }).uncheck(); await button(layoutAuthor, '继续：生成游戏 →').click();
  await layoutAuthor.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(layoutAuthor, '构建网站上传 ZIP').click(); const layoutLink = layoutAuthor.getByRole('link', { name: '下载网站上传包', exact: true }); await layoutLink.waitFor({ timeout: 90000 });
  const layoutBytes = await download(layoutAuthor, () => layoutLink.click()), layoutFiles = unzipSync(layoutBytes);
  assert.deepEqual(readGamePayload(strFromU8(layoutFiles['index.html'])).project, readGamePayload(await readFile(path.join(root, 'evidence/web-additional-layout/tomorrow-letter-0.9.0.html'), 'utf8')).project);
  served = layoutFiles; await layoutAuthor.close();
  const layoutContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), layoutPlayer = await layoutContext.newPage(); current = layoutPlayer;
  layoutPlayer.on('pageerror', error => errors.push(String(error))); await layoutPlayer.goto(url); await layoutPlayer.locator('.player-title-screen #world-publication-version').waitFor();
  await layoutPlayer.locator('.player-title-screen button').filter({ hasText: '打开这封回信' }).click(); await stable(layoutPlayer); const layoutHash = await hash(layoutPlayer);
  for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await layoutPlayer.setViewportSize(size); await openMenu(layoutPlayer); await offline(layoutPlayer);
    await layoutPlayer.locator('#offline-status').scrollIntoViewIfNeeded();
    assert.equal(await layoutPlayer.locator('#world-publication-tools').evaluate(el => el.closest('[data-panel-region]')?.dataset.panelRegion), 'primary');
    assert.ok(await layoutPlayer.getByRole('dialog', { name: '阅读菜单', exact: true }).evaluate(el => el.dataset.panelLayout === 'menu'));
    await shot(layoutPlayer, `authored-menu-${size.width}x${size.height}`); await layoutPlayer.keyboard.press('Escape'); assert.equal(await hash(layoutPlayer), layoutHash);
  }
  artifacts.authoredLayout = { sourceUnchanged: true, version: '0.9.0', temporaryWebsiteBytes: layoutBytes.length, sha256: sha(layoutBytes) };
  await layoutContext.close(); served = files; check('unchanged-0.9.0-authored-title-menu-primary-scroll-and-independent-return-three-viewports');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checks, errors, measurements, routes, artifacts, scope: 'Actual unmodified 1.8.0 source and three exports; three desktop engines for title/menu/keyboard/viewport only; Chromium two complete routes (not format × route matrix), same-story shell update/failure/retry/offline saved-position checks on loopback. No physical phone/Safari/public HTTPS/licensing/human listening or full-reading timing acceptance.' }, null, 2));
} catch (error) {
  await writeFile(path.join(output, `failure-${new Date().toISOString().replaceAll(':', '-')}.json`), JSON.stringify({ passed: false, checks, measurements, errors, error: String(error), stack: error.stack }, null, 2)); if (current && !current.isClosed()) await shot(current, 'failure'); throw error;
} finally {
  if (browser) await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { sha, json, readGamePayload } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-version-retention'), require = createRequire(import.meta.url);
let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
await mkdir(output, { recursive: true });
let files = unzipSync(await readFile(path.join(root, 'evidence/web-reading-position/before-rain-stops-website.zip')));
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/game\//u, '') || 'index.html', bytes = files[name], headers = { 'Cache-Control': 'no-store', 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json' }[path.extname(name)] ?? 'application/octet-stream' };
  const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = `http://127.0.0.1:${server.address().port}/game/`;
const browser = await engines.chromium.launch({ headless: true, args: ['--mute-audio'] }), context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
let page = await context.newPage(); const errors = [], checks = [];
const button = (name, p = page) => p.getByRole('button', { name, exact: true });
const offline = async () => { if (!await page.locator('#offline-panel').isVisible()) await button('打开阅读菜单').click(); if (!await page.locator('#offline-panel').evaluate(el => el.open)) await page.locator('#offline-panel > summary').click(); };
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const hash = () => page.locator('main.player-shell').getAttribute('data-runtime-state-hash');
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log('PASS ' + name); };
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
async function download(p, action) { const pending = p.waitForEvent('download'); await action(); return readFile(await (await pending).path()); }
async function author() {
  const index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), index);
  for (const [, name] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) assert.equal(sha(await readFile(path.join(root, 'apps/editor/dist', name))), sha(new Uint8Array(await (await fetch(new URL(name, ui))).arrayBuffer())));
  const result = [];
  for (const [version, folder, previousGame] of [['1.8.0', 'web-story-continuity', 'web-reading-position'], ['1.9.0', 'web-story-branch-context', 'web-offline-download']]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); p.on('pageerror', e => errors.push(String(e)));
    const sourcePath = path.join(root, 'evidence', folder, 'before-rain-stops-project.zip'), sourceBytes = await readFile(sourcePath), source = unzipSync(sourceBytes);
    await p.goto(ui); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(sourcePath); await p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
    await p.getByLabel('项目菜单', { exact: true }).click(); const restored = unzipSync(await download(p, () => p.getByRole('button', { name: /导出工程 ZIP/u }).click()));
    assert.deepEqual(Object.keys(restored).sort(), Object.keys(source).sort()); for (const [name, data] of Object.entries(source)) assert.equal(sha(restored[name]), sha(data), name);
    await p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await button('继续：导出方式 →', p).click();
    for (const format of version === '1.9.0' ? ['html', 'website'] : ['website']) {
      if (format === 'website' && version === '1.9.0') await p.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/u }).click();
      await p.locator(`input[name="publication-format"][value="${format}"]`).check(); await p.getByLabel('同时生成制作交付包', { exact: true }).uncheck(); await button('继续：生成游戏 →', p).click();
      await p.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP', p).click();
      const link = p.getByRole('link', { name: format === 'html' ? '下载游戏' : '下载网站上传包', exact: true }); await link.waitFor({ timeout: 90000 }); const bytes = await download(p, () => link.click());
      const name = format === 'html' ? 'before-rain-stops.html' : version === '1.8.0' ? 'prepared-1.8.0-website.zip' : 'before-rain-stops-website.zip'; await writeFile(path.join(output, name), bytes);
      if (format === 'website') {
        const website = unzipSync(bytes), oldWebsite = unzipSync(await readFile(path.join(root, 'evidence', previousGame, 'before-rain-stops-website.zip')));
        assert.deepEqual(readGamePayload(Buffer.from(website['index.html']).toString()).project, readGamePayload(Buffer.from(oldWebsite['index.html']).toString()).project);
        for (const [file, data] of Object.entries(oldWebsite).filter(([file]) => file.startsWith('media/'))) assert.equal(sha(website[file]), sha(data), file);
        const info = json(website['build-info.json']); for (const file of info.files) { assert.equal(website[file.path].length, file.byteLength); assert.equal('sha256:' + sha(website[file.path]), file.digest); }
        const payload = readGamePayload(Buffer.from(website['index.html']).toString());
        for (const [file, data] of Object.entries(source).filter(([file]) => file.startsWith('scripts/'))) { const script = json(data); assert.deepEqual(payload.project.scripts[script.sceneId], script, file); }
        for (const asset of json(source['.world-assets/index.json']).assets) { const media = payload.mediaAssets.find(a => a.assetId === asset.assetId); assert.equal('sha256:' + sha(website[media.url]), asset.source.digest); }
        if (version === '1.9.0') {
          const htmlBytes = await readFile(path.join(output, 'before-rain-stops.html')), inline = readGamePayload(htmlBytes.toString()); assert.deepEqual(inline.project, payload.project);
          for (const asset of json(source['.world-assets/index.json']).assets) { const media = inline.mediaAssets.find(a => a.assetId === asset.assetId); assert.equal('sha256:' + sha(Buffer.from(media.url.split(',')[1], 'base64')), asset.source.digest); }
          result.push({ version, filename: 'before-rain-stops.html', byteLength: htmlBytes.length, sha256: sha(htmlBytes), originalMedia: inline.mediaAssets.length, identicalProjectAndOriginalMedia: true });
        }
        result.push({ version, filename: name, byteLength: bytes.length, sha256: sha(bytes), sourcePath: path.relative(root, sourcePath).replaceAll('\\', '/'), sourceSha256: sha(sourceBytes), sourceEntries: Object.keys(source).length, publicFiles: Object.keys(website).length, originalMedia: Object.keys(website).filter(n => n.startsWith('media/')).length, releaseId: Buffer.from(website['index.html']).toString().match(/name="world-release" content="([^"]+)"/u)[1] });
      }
    }
    await p.close();
  }
  await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify({ passed: true, sourcesUnchanged: true, oldAndCurrentContentUnchanged: true, artifacts: result }, null, 2)); check('actual-editor-exports-both-original-projects-without-content-media-or-source-changes', result);
}
async function loadQuick() {
  await button('读取存档').click(); const slots = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
  if (await page.locator('.player-load-confirm').isVisible()) await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
}
async function retainedFlow() {
  files = unzipSync(await readFile(path.join(output, 'prepared-1.8.0-website.zip'))); await page.goto(url, { waitUntil: 'commit' }); await button('开始故事').waitFor(); const oldEntry = page.url(), oldRelease = new URL(oldEntry).searchParams.get('world-release'); assert.ok(oldRelease);
  await button('开始故事').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const savedHash = await hash();
  await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await offline(); await button('下载离线内容').click(); await page.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 });
  files = unzipSync(await readFile(path.join(output, 'before-rain-stops-website.zip'))); await button('检查更新').click(); const plan = page.getByRole('region', { name: '更新前准备', exact: true }); await plan.waitFor(); assert.equal(await button('确认检查并下载').isEnabled(), false);
  await button('备份游玩进度').click(); const slots = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByLabel('备份进度', { exact: true }).selectOption('current');
  const backup = await download(page, () => slots.getByRole('button', { name: '导出备份文件', exact: true }).click()); await writeFile(path.join(output, 'prepared-1.8.0.worldsave'), backup); assert.equal(json(backup).payload.slot.runtimeStateHash, savedHash); await button('关闭存读档').click();
  await offline(); await button('显示本版入口').click(); assert.equal(await page.getByLabel('本版浏览器内入口', { exact: true }).inputValue(), oldEntry); await button('稍后，继续本版').click(); assert.equal(await hash(), savedHash);
  await button('检查更新').click(); await page.getByLabel('我已了解旧档可能不兼容，并已保留需要的资料', { exact: true }).check(); await button('确认检查并下载').click(); await page.locator('#offline-summary').filter({ hasText: '新版等待选择' }).waitFor({ timeout: 90000 }); await page.locator('#offline-version-note').filter({ hasText: '1.9.0' }).waitFor(); assert.equal(await hash(), savedHash); await shot('backup-before-content-update');
  // No explicit activation: a browser may activate after all windows close,
  // but the old pinned entry must still select the original cached bytes.
  await page.close(); page = await context.newPage(); page.on('pageerror', e => errors.push(String(e))); await page.goto(oldEntry); await loadQuick(); assert.equal(await hash(), savedHash); assert.equal(await page.locator('#world-publication-version').innerText(), '版本 1.8.0');
  await context.setOffline(true); assert.equal((await page.reload()).fromServiceWorker(), true); await loadQuick(); assert.equal(await hash(), savedHash); await shot('old-entry-offline-after-new-worker-activation');
  await offline(); await button('查看版本与备份').click(); await page.getByLabel('我已了解旧档可能不兼容，并已保留需要的资料', { exact: true }).check(); const popup = context.waitForEvent('page'); await page.getByRole('link', { name: '在新窗口打开新版', exact: true }).click(); const newer = await popup; newer.on('pageerror', e => errors.push(String(e))); await newer.waitForLoadState();
  assert.equal(await newer.locator('#world-publication-version').innerText(), '版本 1.9.0'); assert.equal(await hash(), savedHash);
  await button('读取存档', newer).click(); const target = newer.getByRole('dialog', { name: '存读档槽位', exact: true }); await target.getByRole('button', { name: '备份', exact: true }).click(); await target.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(path.join(output, 'prepared-1.8.0.worldsave')); await target.getByRole('alert').waitFor(); assert.equal(await target.getByRole('button', { name: '导入到所选槽位', exact: true }).count(), 0);
  const rejection = await target.getByRole('alert').innerText(); assert.match(rejection, /版本/u); await newer.screenshot({ path: path.join(output, 'new-version-refuses-old-save.png') }); await newer.close();
  await page.reload(); await loadQuick(); assert.equal(await hash(), savedHash); check('backup-later-auto-activation-old-offline-entry-parallel-new-version-and-strict-old-save-refusal', { savedHash, oldRelease, backupSha256: sha(backup), rejection });
  const keys = await page.evaluate(() => caches.keys()); assert.equal(keys.length, 2);
  const verified = [];
  for (const filename of ['prepared-1.8.0-website.zip', 'before-rain-stops-website.zip']) {
    const game = unzipSync(await readFile(path.join(output, filename))), worker = Buffer.from(game['sw.js']).toString(), inventory = JSON.parse(worker.match(/^const inventory = (.*);$/mu)[1]), release = JSON.parse(worker.match(/^const version = (.*);$/mu)[1]);
    const actual = await page.evaluate(async ({ release, paths }) => { const key = (await caches.keys()).find(key => key.endsWith(':' + release)), cache = await caches.open(key), digests = {}; for (const name of paths) { const response = await cache.match(new URL(name, location.href)); if (!response) throw Error('Missing cached ' + name); digests[name] = 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join(''); } return digests; }, { release, paths: Object.keys(inventory) });
    assert.deepEqual(actual, inventory); verified.push({ filename, release, cachedFiles: Object.keys(actual).length, allBytesMatchExportedInventory: true });
  }
  check('both-retained-game-caches-match-every-exported-inventory-digest', verified);
  await page.evaluate(async release => { const key = (await caches.keys()).find(n => n.endsWith(':' + release)); await (await caches.open(key)).delete(new URL('player.js', location.href)); }, oldRelease);
  const gone = await page.reload(); assert.equal(gone.status(), 410); await page.getByRole('alert').filter({ hasText: '未替换为新版' }).waitFor(); assert.equal(await page.locator('main.player-shell').count(), 0); await shot('partial-old-cache-does-not-open-new-game');
  await page.getByRole('link', { name: '查看当前线上版本（旧档可能不兼容）', exact: true }).click(); await button('开始故事').waitFor(); assert.equal(await page.locator('#world-publication-version').innerText(), '版本 1.9.0'); assert.notEqual(page.url(), oldEntry);
  await context.setOffline(false); const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } }), missing = await fresh.newPage(); await missing.goto(oldEntry); await missing.locator('#player-root[data-startup-state="release-missing"]').waitFor(); assert.equal(await missing.locator('main.player-shell').count(), 0); await missing.screenshot({ path: path.join(output, 'old-entry-in-fresh-browser-is-not-new-game.png') }); await fresh.close();
  check('partially-evicted-cache-and-fresh-browser-refuse-silent-version-substitution');
}
async function sameContentUpgrade() {
  const previous = page, ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e)));
  files = unzipSync(await readFile(path.join(root, 'evidence/web-offline-download/before-rain-stops-website.zip'))); await page.goto(url); await button('开始故事').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const originalHash = await hash();
  await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved');
  files = unzipSync(await readFile(path.join(output, 'before-rain-stops-website.zip'))); await page.reload(); await loadQuick(); assert.equal(await hash(), originalHash); assert.ok(new URL(page.url()).searchParams.get('world-release'));
  check('existing-unprotected-1.9-save-loads-in-new-same-content-player', { originalHash }); await ctx.close(); page = previous;
}
async function explicitActivation() {
  const previous = page, ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' }); page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e)));
  files = unzipSync(await readFile(path.join(output, 'prepared-1.8.0-website.zip'))); await page.goto(url, { waitUntil: 'commit' }); await button('开始故事').waitFor(); const oldEntry = page.url(); await button('开始故事').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const originalHash = await hash();
  await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await offline(); await button('下载离线内容').click(); await page.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 });
  const other = await ctx.newPage(); await other.goto(oldEntry); files = unzipSync(await readFile(path.join(output, 'before-rain-stops-website.zip')));
  await button('检查更新').click(); await page.getByLabel('我已了解旧档可能不兼容，并已保留需要的资料', { exact: true }).check(); await button('确认检查并下载').click(); await page.locator('#offline-summary').filter({ hasText: '新版等待选择' }).waitFor({ timeout: 90000 }); await page.locator('#offline-version-note').filter({ hasText: '1.9.0' }).waitFor();
  assert.equal(await button('启用已下载新版（本版仍保留）').isEnabled(), false); await page.getByLabel('我已了解旧档可能不兼容，并已保留需要的资料', { exact: true }).check(); await button('启用已下载新版（本版仍保留）').click(); await page.locator('#offline-status').filter({ hasText: '本机另有新版' }).waitFor(); assert.equal(await hash(), originalHash);
  const servedOldIndex = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(new URL('index.html', location.href))).arrayBuffer()))); assert.equal(sha(new Uint8Array(servedOldIndex)), sha(unzipSync(await readFile(path.join(output, 'prepared-1.8.0-website.zip')))['index.html'])); await shot('explicit-activation-keeps-current-story');
  await other.reload(); assert.equal(await other.locator('#world-publication-version').innerText(), '版本 1.8.0'); await page.reload(); await loadQuick(); assert.equal(await hash(), originalHash);
  check('explicit-activation-with-two-open-old-version-windows-keeps-pinned-bytes-and-original-quick-slot', { originalHash }); await ctx.close(); page = previous;
}
async function fullRoute(branch, website) {
  const previous = page, ctx = await browser.newContext({ viewport: website ? { width: 390, height: 844 } : { width: 1280, height: 900 }, reducedMotion: 'reduce' }); page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e)));
  files = unzipSync(await readFile(path.join(output, 'before-rain-stops-website.zip'))); await page.goto(website ? url : pathToFileURL(path.join(output, 'before-rain-stops.html')).href);
  if (website) { await offline(); await button('下载离线内容').click(); await page.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 }); await ctx.setOffline(true); assert.equal((await page.reload()).fromServiceWorker(), true); }
  await button('打开玩家设置').click(); await page.getByLabel('静音全部声音', { exact: true }).check(); await page.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button('返回故事').click(); await button('开始故事').click();
  const source = unzipSync(await readFile(path.join(root, 'evidence/web-story-branch-context/before-rain-stops-project.zip'))), statements = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => json(bytes).statements), byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  const ids = [], voices = new Set(); let restored = false;
  for (let step = 0; step < 300 && await page.locator('main.player-shell').getAttribute('data-player-status') !== 'ended'; step++) {
    const choices = page.locator('.player-choice button'); if (await choices.count()) { await choices.nth(branch).click(); continue; }
    await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const statement = byText.get((await page.locator('.player-dialogue__text').innerText()).trim()); assert.ok(statement); if (ids.at(-1) !== statement.id) ids.push(statement.id);
    if (await page.locator('audio[data-audio-bus="voice"]').count()) { await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(statement.id); }
    if (!restored && statement.id === (branch ? 'stmt_ui_238' : 'stmt_ui_137')) {
      const saved = await hash(); await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await page.reload(); await loadQuick(); assert.equal(await hash(), saved); restored = true;
    }
    assert.equal(await page.locator('.player-media-error').count(), 0); await button('继续下一句').click();
  }
  assert.equal(ids.length, 66); assert.equal(voices.size, 6); assert.equal(restored, true); assert.equal(await page.locator('main.player-shell').getAttribute('data-player-status'), 'ended');
  const titles = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch ? ['远行', '车窗与海', '再一次见面'] : ['留下', '灯下的回信', '雨后的天明'])], scenes = Object.entries(source).filter(([name]) => name.startsWith('scenes/')).map(([, bytes]) => json(bytes));
  assert.deepEqual(ids, titles.flatMap(title => json(source[scenes.find(s => s.title === title).scriptPath]).statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id)));
  await shot(website ? 'current-website-offline-ending' : 'current-html-ending'); check(website ? 'current-website-offline-phone-stay-complete-route' : 'current-html-desktop-remote-complete-route', { ids, naturallyEndedVoices: voices.size, ending: await page.locator('.player-ending').innerText(), sameVersionSaveReloadRestored: restored, humanListening: false, physicalPhone: false }); await ctx.close(); page = previous;
}
async function baseline() {
  page.on('pageerror', e => errors.push(String(e))); await page.goto(url); await button('开始故事').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const savedHash = await hash();
  await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved');
  await button('存读档').click(); const slots = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '备份', exact: true }).click(); await slots.getByLabel('备份进度', { exact: true }).selectOption('current');
  const event = page.waitForEvent('download'); await slots.getByRole('button', { name: '导出备份文件', exact: true }).click(); const backup = await readFile(await (await event).path()); await writeFile(path.join(output, 'original-1.8.0.worldsave'), backup); await button('关闭存读档').click();
  await offline(); await button('下载离线内容').click(); await page.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 }); const oldCaches = await page.evaluate(() => caches.keys());
  files = unzipSync(await readFile(path.join(root, 'evidence/web-offline-download/before-rain-stops-website.zip'))); await button('检查更新').click(); await page.locator('#offline-summary').filter({ hasText: '新版等待重开' }).waitFor({ timeout: 90000 }); await page.close();
  page = await context.newPage(); page.on('pageerror', e => errors.push(String(e))); await page.goto(url); await button('读取存档').click(); const target = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await target.getByRole('button', { name: '备份', exact: true }).click(); await target.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(path.join(output, 'original-1.8.0.worldsave')); await target.getByRole('alert').waitFor();
  const newCaches = await page.evaluate(() => caches.keys()), rejected = await target.getByRole('alert').innerText(); assert.match(rejected, /版本/u); assert.ok(oldCaches.every(n => !newCaches.includes(n))); await shot('baseline-old-backup-without-old-game');
  await writeFile(path.join(output, 'baseline.json'), JSON.stringify({ passed: true, from: '1.8.0', to: '1.9.0', savedHash, backupSha256: sha(backup), oldCaches, newCaches, oldCachesDeleted: true, rejection: rejected, errors, loopbackOnly: true }, null, 2)); console.log('PASS actual-1.8-to-1.9-baseline-deletes-old-game-cache-and-refuses-old-backup');
}
try {
  if (process.argv.includes('--baseline-only')) await baseline();
  else if (process.argv.includes('--activation-only')) await explicitActivation();
  else { if (!process.argv.includes('--play-only')) await author(); await retainedFlow(); await sameContentUpgrade(); await explicitActivation(); await fullRoute(0, true); await fullRoute(1, false); assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checks, errors, scope: 'Actual current-code exports of original 1.8.0 and 1.9.0 content, not retroactive upgrades of old cached UI. Chromium loopback; old retained link, explicit activation with two old windows and parallel new version; strict backups and no source/media changes. Current full website offline phone-size stay route and HTML desktop remote route, not full matrix. Browser cache is not a portable or permanent full-game backup.' }, null, 2)); }
} catch (error) { const workerStatus = !page.isClosed() ? await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); if (!reg?.active) return null; return new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = event => resolve({ response: event.data, url: location.href, active: reg.active.state, controller: navigator.serviceWorker.controller?.state }); reg.active.postMessage({ type: 'STATUS' }, [channel.port2]); }); }).catch(() => null) : null; await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, status: !page.isClosed() ? await page.locator('#offline-status').textContent().catch(() => null) : null, workerStatus, checks, errors }, null, 2)); if (!page.isClosed()) await shot('failure'); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

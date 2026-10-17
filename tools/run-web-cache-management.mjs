import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { sha, json, readGamePayload } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-cache-management'), require = createRequire(import.meta.url);
let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
await mkdir(output, { recursive: true });
let files = unzipSync(await readFile(path.join(root, 'evidence/web-version-retention/prepared-1.8.0-website.zip')));
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
  for (const [version, folder, previousGame] of [['1.9.0', 'web-story-branch-context', 'web-version-retention']]) {
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
      const name = format === 'html' ? 'before-rain-stops.html' : version === '1.8.0' ? 'prepared-1.8.0-website.zip' : 'before-rain-stops-website.zip'; if (format === 'website') await writeFile(path.join(output, name), bytes); else assert.equal(sha(bytes), sha(await readFile(path.join(root, 'evidence/web-version-retention/before-rain-stops.html'))));
      if (format === 'website') {
        const website = unzipSync(bytes), oldWebsite = unzipSync(await readFile(path.join(root, 'evidence', previousGame, 'before-rain-stops-website.zip')));
        assert.deepEqual(readGamePayload(Buffer.from(website['index.html']).toString()).project, readGamePayload(Buffer.from(oldWebsite['index.html']).toString()).project);
        for (const [file, data] of Object.entries(oldWebsite).filter(([file]) => file.startsWith('media/'))) assert.equal(sha(website[file]), sha(data), file);
        const info = json(website['build-info.json']); for (const file of info.files) { assert.equal(website[file.path].length, file.byteLength); assert.equal('sha256:' + sha(website[file.path]), file.digest); }
        const payload = readGamePayload(Buffer.from(website['index.html']).toString());
        for (const [file, data] of Object.entries(source).filter(([file]) => file.startsWith('scripts/'))) { const script = json(data); assert.deepEqual(payload.project.scripts[script.sceneId], script, file); }
        for (const asset of json(source['.world-assets/index.json']).assets) { const media = payload.mediaAssets.find(a => a.assetId === asset.assetId); assert.equal('sha256:' + sha(website[media.url]), asset.source.digest); }
        if (version === '1.9.0') {
          const htmlBytes = await readFile(path.join(root, 'evidence/web-version-retention/before-rain-stops.html')), inline = readGamePayload(htmlBytes.toString()); assert.deepEqual(inline.project, payload.project);
          for (const asset of json(source['.world-assets/index.json']).assets) { const media = inline.mediaAssets.find(a => a.assetId === asset.assetId); assert.equal('sha256:' + sha(Buffer.from(media.url.split(',')[1], 'base64')), asset.source.digest); }
          result.push({ version, filename: '../web-version-retention/before-rain-stops.html', byteLength: htmlBytes.length, sha256: sha(htmlBytes), originalMedia: inline.mediaAssets.length, identicalProjectAndOriginalMedia: true });
        }
        result.push({ version, filename: name, byteLength: bytes.length, sha256: sha(bytes), sourcePath: path.relative(root, sourcePath).replaceAll('\\', '/'), sourceSha256: sha(sourceBytes), sourceEntries: Object.keys(source).length, publicFiles: Object.keys(website).length, originalMedia: Object.keys(website).filter(n => n.startsWith('media/')).length, releaseId: Buffer.from(website['index.html']).toString().match(/name="world-release" content="([^"]+)"/u)[1] });
      }
    }
    await p.close();
  }
  await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify({ passed: true, sourcesUnchanged: true, oldAndCurrentContentUnchanged: true, artifacts: result }, null, 2)); check('actual-editor-source-and-game-exports-retain-all-original-content-and-media', result);
}
async function loadQuick() {
  await button('读取存档').click(); const slots = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
  if (await page.locator('.player-load-confirm').isVisible()) await button('确认读取').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
}

const game = async file => unzipSync(await readFile(path.join(root, file)));
const gameEntry = files => url + '?world-release=' + encodeURIComponent(Buffer.from(files['index.html']).toString().match(/name="world-release" content="([^"]+)"/u)[1]);
const visit = async (p, target) => { await p.goto(target, { waitUntil: 'commit' }); await p.locator('main.player-shell').waitFor(); await p.waitForLoadState('networkidle'); };
const cacheRow = version => page.locator('#offline-storage-list article').filter({ hasText: '版本 ' + version });
const refresh = async () => { await button('刷新缓存列表').click(); await page.locator('#offline-storage-status').filter({ hasText: /本游戏 \d 份缓存/u }).waitFor(); };
async function snapshotSlots() {
  const snapshot = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('world-player-saves'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const read = name => new Promise((resolve, reject) => { const r = db.transaction(name, 'readonly').objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const normalize = async value => {
      if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) { const bytes = value instanceof Blob ? await value.arrayBuffer() : value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength); return { binarySha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('') }; }
      if (Array.isArray(value)) return Promise.all(value.map(normalize));
      if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.keys(value).sort().map(async key => [key, await normalize(value[key])])));
      return value;
    };
    try { return JSON.stringify(await normalize({ slots: await read('save-slots'), previews: await read('save-previews') })); } finally { db.close(); }
  });
  return sha(snapshot);
}
async function quickSave() { await button('打开阅读菜单').click(); await button('快速保存').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); }
async function updateTo(next) {
  files = next; await offline(); await button('检查更新').click(); await page.getByLabel('我已了解旧档可能不兼容，并已保留需要的资料', { exact: true }).check(); await button('确认检查并下载').click(); await page.locator('#offline-summary').filter({ hasText: '新版等待选择' }).waitFor({ timeout: 90000 });
  await page.close(); page = await context.newPage(); page.on('pageerror', e => errors.push(String(e))); await visit(page, gameEntry(next));
}
async function management() {
  const old = await game('evidence/web-version-retention/prepared-1.8.0-website.zip'), previous = await game('evidence/web-version-retention/before-rain-stops-website.zip'), current = await game('evidence/web-cache-management/before-rain-stops-website.zip');
  files = old; await visit(page, url); const oldEntry = page.url(); await button('开始故事').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); await quickSave(); await offline(); await button('下载离线内容').click(); await page.locator('#offline-summary').filter({ hasText: '文件已缓存' }).waitFor({ timeout: 90000 });
  // Preserve an actual incompatible old backup before shared quick slots change.
  await button('检查更新').click(); await button('备份游玩进度').click(); let dialog = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await dialog.getByLabel('备份进度', { exact: true }).selectOption('current');
  const oldBackup = await download(page, () => dialog.getByRole('button', { name: '导出备份文件', exact: true }).click()); await writeFile(path.join(output, 'old-1.8.0.worldsave'), oldBackup); await button('关闭存读档').click();
  await updateTo(previous); const previousEntry = page.url(); await button('开始故事').click(); await button('确认开始新故事').click(); await button('打开阅读菜单').waitFor(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); const saved = await hash(); await quickSave(); await updateTo(current); await loadQuick(); assert.equal(await hash(), saved);
  await offline(); await button('查看缓存与空间').click(); await page.locator('#offline-storage-status').filter({ hasText: '本游戏 3 份缓存' }).waitFor();
  const older = await context.newPage(), middle = await context.newPage(); await visit(older, oldEntry); await visit(middle, previousEntry); await refresh();
  assert.equal(await cacheRow('1.9.0').count(), 2); assert.equal(await page.locator('#offline-storage-list button:enabled').count(), 0); await shot('three-builds-in-use-protected');
  const expected = [old, previous, current].map(files => { const inventory = JSON.parse(Buffer.from(files['sw.js']).toString().match(/^const inventory = (.*);$/mu)[1]); return { id: new URL(gameEntry(files)).searchParams.get('world-release'), fileCount: Object.keys(inventory).length, byteLength: Object.keys(inventory).reduce((n, file) => n + files[file].length, 0) }; });
  const actual = await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return new Promise((resolve, reject) => { const channel = new MessageChannel(), timer = setTimeout(() => reject(Error('storage timeout')), 10000); channel.port1.onmessage = event => { clearTimeout(timer); resolve(event.data); }; registration.active.postMessage({ type: 'STORAGE' }, [channel.port2]); }); });
  assert.equal(actual.releases.length, 3); assert.equal(actual.byteLength, expected.reduce((n, row) => n + row.byteLength, 0)); for (const row of expected) { const found = actual.releases.find(r => r.releaseId === row.id); assert.equal(found.byteLength, row.byteLength); assert.equal(found.fileCount, row.fileCount); assert.equal(found.complete, true); }
  check('real-three-builds-same-version-identities-exact-payload-space-and-open-window-protection', { expected, totalPayloadBytes: actual.byteLength, actualDiskUsageClaimed: false });
  await older.close(); await refresh(); const oldRow = cacheRow('1.8.0'); assert.equal(await oldRow.getByRole('button', { name: '清理这个版本', exact: true }).isEnabled(), true);
  await oldRow.getByRole('button', { name: '清理这个版本', exact: true }).click(); assert.equal(await button('确认清理所选版本').isEnabled(), false); await page.getByLabel('我已保留需要的原版游戏与进度备份', { exact: true }).check(); await shot('cleanup-confirmation-before-submit'); await button('取消清理').click(); assert.equal(await page.locator('#offline-storage-confirm').isVisible(), false); assert.equal(await page.evaluate(() => document.activeElement?.textContent), '清理这个版本'); assert.equal((await page.evaluate(() => caches.keys())).length, 3);
  await oldRow.getByRole('button', { name: '清理这个版本', exact: true }).click(); const reopened = await context.newPage(); await visit(reopened, oldEntry);
  await page.getByLabel('我已保留需要的原版游戏与进度备份', { exact: true }).check(); await button('确认清理所选版本').click(); await page.locator('#offline-storage-status').filter({ hasText: '其他游戏窗口正在使用' }).waitFor(); assert.equal((await page.evaluate(() => caches.keys())).length, 3); await shot('confirmation-rechecks-newly-opened-window'); await reopened.close();
  check('cancel-is-non-destructive-and-confirmation-rechecks-new-old-version-window');
  await refresh(); await button('先备份游玩进度').click(); dialog = page.getByRole('dialog', { name: '存读档槽位', exact: true }); await dialog.getByLabel('备份进度', { exact: true }).selectOption('current');
  const backup = await download(page, () => dialog.getByRole('button', { name: '导出备份文件', exact: true }).click()); assert.equal(json(backup).payload.slot.runtimeStateHash, saved); await writeFile(path.join(output, 'current-1.9.0.worldsave'), backup); await button('关闭存读档').click(); await offline(); await button('查看缓存与空间').click(); await page.locator('#offline-storage-status').filter({ hasText: '本游戏 3 份缓存' }).waitFor();
  const beforeSlots = await snapshotSlots(); await cacheRow('1.8.0').getByRole('button', { name: '清理这个版本', exact: true }).click(); await page.getByLabel('我已保留需要的原版游戏与进度备份', { exact: true }).check(); await button('确认清理所选版本').click(); await page.locator('#offline-storage-status').filter({ hasText: '本游戏 2 份缓存' }).waitFor(); assert.equal(await snapshotSlots(), beforeSlots); assert.equal(await hash(), saved); assert.equal(sha(await readFile(path.join(output, 'old-1.8.0.worldsave'))), sha(oldBackup)); await shot('selected-old-cache-removed-with-saves-unchanged');
  await context.setOffline(true); assert.equal((await page.reload()).fromServiceWorker(), true); await loadQuick(); assert.equal(await hash(), saved); await shot('current-offline-save-after-cleanup');
  const missing = await context.newPage(); const gone = await missing.goto(oldEntry); assert.equal(gone.status(), 410); assert.equal(await missing.locator('main.player-shell').count(), 0); await missing.screenshot({ path: path.join(output, 'removed-old-entry-clearly-unavailable.png') }); await missing.close();
  await middle.reload(); assert.equal(middle.url(), previousEntry); const oldBytes = await middle.evaluate(async () => Array.from(new Uint8Array(await (await fetch(new URL('index.html', location.href))).arrayBuffer()))); assert.equal(sha(new Uint8Array(oldBytes)), sha(previous['index.html']));
  check('delete-only-selected-1.8-cache-preserves-save-and-preview-bytes-backups-current-and-other-old-game', { savedHash: saved, unchangedSlotsAndPreviewsSha256: beforeSlots, oldBackupSha256: sha(oldBackup), currentBackupSha256: sha(backup), removedEntryStatus: gone.status() });
  await middle.close(); await offline(); await button('查看缓存与空间').click(); await page.locator('#offline-storage-status').filter({ hasText: '本游戏 2 份缓存' }).waitFor(); const eligible = page.locator('#offline-storage-list article').filter({ has: page.getByRole('button', { name: '清理这个版本', exact: true, disabled: false }) }); assert.equal(await eligible.count(), 1);
  await eligible.getByRole('button', { name: '清理这个版本', exact: true }).click(); await page.getByLabel('我已保留需要的原版游戏与进度备份', { exact: true }).check(); await button('确认清理所选版本').click(); await page.locator('#offline-storage-status').filter({ hasText: '本游戏 1 份缓存' }).waitFor(); assert.equal(await page.locator('#offline-storage-list button:enabled').count(), 0); await shot('only-current-default-cache-remains');
  const key = (await page.evaluate(() => caches.keys()))[0], expectedCurrent = expected[2]; assert.ok(key.endsWith(':' + expectedCurrent.id)); assert.equal((await page.evaluate(() => caches.keys())).length, 1);
  check('offline-cleanup-of-second-inactive-build-leaves-current-default-protected', { remaining: expectedCurrent, savedHash: await hash() }); await context.setOffline(false);
}
async function fullRoute(branch, website) {
  const previous = page, ctx = await browser.newContext({ viewport: website ? { width: 390, height: 844 } : { width: 1280, height: 900 }, reducedMotion: 'reduce' }); page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e)));
  files = unzipSync(await readFile(path.join(output, 'before-rain-stops-website.zip'))); await page.goto(website ? url : pathToFileURL(path.join(root, 'evidence/web-version-retention/before-rain-stops.html')).href);
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

try {
  if (!process.argv.includes('--play-only')) await author();
  await management(); await fullRoute(0, true); await fullRoute(1, false); assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checks, errors, scope: 'Actual historical 1.8.0 and 1.9.0 packages plus current editor export; Chromium loopback, three-build update and selected cleanup, browser caches only. Real save slots and previews remain byte-identical. Offline phone-size website stay route plus unchanged standalone desktop remote route; muted natural voice completion, not physical-phone, human listening, public HTTPS or full format matrix.' }, null, 2));
} catch (error) { await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, checks, errors }, null, 2)); if (!page.isClosed()) await shot('failure'); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

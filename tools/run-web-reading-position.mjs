import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { unzipSync, strFromU8 } from 'fflate';
import { readGamePayload } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-reading-position');
const require = createRequire(import.meta.url); let engines;
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(strFromU8(bytes));
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const button = (p, name) => p.getByRole('button', { name, exact: true });
// Independent, exhaustive browser oracle, not the implementation's anchor search.
async function position(p) {
  return p.locator('.player-dialogue').evaluate(el => {
    const text = el.querySelector('.player-dialogue__text'), box = el.getBoundingClientRect(), top = box.top + el.clientTop;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT), lines = []; let node, index = 0;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('rt,rp')) continue;
      for (let offset = 0; offset < node.length; offset++, index++) {
        const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1); const rect = range.getBoundingClientRect();
        if (rect.height > 0 && (!lines.length || Math.abs(lines.at(-1).top - rect.top) > 2)) lines.push({ index, top: rect.top, bottom: rect.bottom });
      }
    }
    const first = lines.find(line => line.top >= top - 1);
    return { first: first?.index ?? null, excerpt: text.textContent.slice(first?.index ?? 0, (first?.index ?? 0) + 30), scrollTop: el.scrollTop, maxScroll: el.scrollHeight - el.clientHeight, client: [el.clientWidth, el.clientHeight], top, bottom: top + el.clientHeight, lines, hash: document.querySelector('main').dataset.runtimeStateHash };
  });
}
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
await mkdir(output, { recursive: true });
async function baseline() {
 const browser = await engines.chromium.launch({ headless: true, args: ['--mute-audio'] });
 try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await p.goto(pathToFileURL(path.join(root, 'evidence/web-publication-reading/before-rain-stops.html')).href);
  await button(p, '打开玩家设置').click(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); const font = p.getByLabel('个人字号', { exact: true }); await font.focus(); await font.press('End'); assert.equal(await font.inputValue(), '140'); await button(p, '返回故事').click();
  await button(p, '开始故事').click(); await p.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
  await p.locator('.player-dialogue').hover(); await p.mouse.wheel(0, 220); await p.waitForFunction(() => document.querySelector('.player-dialogue').scrollTop > 100);
  const before = await position(p); await shot(p, 'before-rotation-portrait');
  await p.setViewportSize({ width: 844, height: 390 }); const landscape = await position(p); await shot(p, 'before-rotation-landscape');
  await p.setViewportSize({ width: 390, height: 844 }); const returned = await position(p); await shot(p, 'before-rotation-returned');
  assert.equal(before.hash, returned.hash);
  const report = { before, landscape, returned, oldVersion: '1.8.0', previousShell: '378', physicalPhone: false };
  await writeFile(path.join(output, 'baseline.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ before: before.first, landscape: landscape.first, returned: returned.first, pixels: [before.scrollTop, landscape.scrollTop, returned.scrollTop] }));
 } finally { await browser.close(); }
}
if (process.argv.includes('--baseline')) { await baseline(); process.exit(0); }

const checks = [], errors = [], snapshots = [], routes = [], artifacts = {};
let browser, server, current;
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log('PASS ' + name); };
const settle = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function settleScroll(p) {
  let previous = NaN, equal = 0;
  for (let frame = 0; frame < 60; frame++) {
    await settle(p); const value = await p.locator('.player-dialogue').evaluate(el => el.scrollTop);
    equal = Math.abs(value - previous) < .5 ? equal + 1 : 0; if (equal >= 4) return;
    previous = value;
  }
  throw Error('Scroll did not settle');
}
const hash = p => p.locator('main.player-shell').getAttribute('data-runtime-state-hash');
const stable = p => p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
const openMenu = p => button(p, '打开阅读菜单').click();
const closeMenu = p => p.getByRole('dialog', { name: '阅读菜单', exact: true }).getByRole('button', { name: '返回故事', exact: true }).click();
const watch = p => { current = p; p.setDefaultTimeout(30000); p.on('pageerror', error => errors.push(String(error))); };
async function download(p, action) { const pending = p.waitForEvent('download'); await action(); return readFile(await (await pending).path()); }
async function preferences(p, size = 'End') {
  if (!await button(p, '打开玩家设置').isVisible()) await openMenu(p);
  await button(p, '打开玩家设置').click(); const font = p.getByLabel('个人字号', { exact: true }); await font.focus(); await font.press(size);
  await p.getByLabel('静音全部声音', { exact: true }).check(); await p.getByLabel('文字显示', { exact: true }).selectOption('instant'); await button(p, '返回故事').click(); await settle(p);
}
function containsAnchor(snapshot, offset) {
  const line = snapshot.lines.find((row, index) => row.index <= offset && (snapshot.lines[index + 1]?.index ?? Infinity) > offset);
  return line && line.top >= snapshot.top - 1 && line.bottom <= snapshot.bottom + 1;
}
async function verifyAnchor(p, offset, name, expectedHash) {
  await settle(p); const snapshot = await position(p); assert.equal(snapshot.hash, expectedHash, name); assert.ok(containsAnchor(snapshot, offset), `${name}: lost ${offset}, first ${snapshot.first}`);
  snapshots.push({ name, offset, ...snapshot }); await shot(p, name); return snapshot;
}
async function quickLoad(p) {
  await button(p, '读取存档').click(); const slots = p.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click();
  if (await p.locator('.player-load-confirm').isVisible()) await button(p, '确认读取').click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); await stable(p);
}
try {
  const dist = path.join(root, 'apps/editor/dist'), editorHtml = await readFile(path.join(dist, 'index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), editorHtml);
  artifacts.editor = {};
  for (const [, name] of editorHtml.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) { const bytes = await readFile(path.join(dist, name)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(name, ui))).arrayBuffer())), sha(bytes)); artifacts.editor[name] = sha(bytes); }
  browser = await engines.chromium.launch({ headless: true, args: ['--mute-audio'] }); const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); watch(p);
  const sourcePath = path.join(root, 'evidence/web-story-continuity/before-rain-stops-project.zip'), sourceBytes = await readFile(sourcePath), source = unzipSync(sourceBytes);
  await p.goto(ui); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(sourcePath); await p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await p.getByLabel('项目菜单', { exact: true }).click(); const roundtrip = unzipSync(await download(p, () => p.getByRole('button', { name: /导出工程 ZIP/u }).click()));
  assert.deepEqual(Object.keys(roundtrip).sort(), Object.keys(source).sort()); for (const [name, bytes] of Object.entries(source)) assert.equal(sha(roundtrip[name]), sha(bytes), name);
  await p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await button(p, '继续：导出方式 →').click();
  let files, htmlBytes;
  for (const format of ['html', 'website']) {
    if (format === 'website') await p.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/u }).click();
    await p.locator(`input[name="publication-format"][value="${format}"]`).check(); await p.getByLabel('同时生成制作交付包', { exact: true }).uncheck(); await button(p, '继续：生成游戏 →').click(); await p.getByText('故事与素材检查通过', { exact: true }).waitFor();
    await button(p, format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP').click(); const link = p.getByRole('link', { name: format === 'html' ? '下载游戏' : '下载网站上传包', exact: true }); await link.waitFor({ timeout: 90000 }); const bytes = await download(p, () => link.click());
    artifacts[format] = { bytes: bytes.length, sha256: sha(bytes) }; await writeFile(path.join(output, format === 'html' ? 'before-rain-stops.html' : 'before-rain-stops-website.zip'), bytes);
    if (format === 'html') htmlBytes = bytes; else files = unzipSync(bytes);
  }
  const payload = readGamePayload(strFromU8(htmlBytes)), oldPayload = readGamePayload(await readFile(path.join(root, 'evidence/web-publication-reading/before-rain-stops.html'), 'utf8'));
  assert.deepEqual(payload.project, oldPayload.project); assert.deepEqual(payload.mediaAssets, oldPayload.mediaAssets); assert.deepEqual(readGamePayload(strFromU8(files['index.html'])).project, payload.project);
  const info = json(files['build-info.json']); assert.equal(info.publication.version, '1.8.0'); assert.equal(Object.keys(files).length, 36); for (const row of info.files) assert.equal(sha(files[row.path]), row.digest.replace('sha256:', ''));
  artifacts.source = { sha256: sha(sourceBytes), entries: Object.keys(source).length, media: payload.mediaAssets.length, version: info.publication.version, projectDigest: info.projectDigest };
  check('actual-editor-roundtrip-and-two-exports-preserve-65-source-entries-story-and-25-media'); await p.close();
  server = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/game\//u, '') || 'index.html', data = files[name];
    const headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
    const range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? ''); if (data && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : data.length - 1, data.length - 1); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }).end(data.subarray(start, end + 1)); }
    res.writeHead(data ? 200 : 404, headers).end(data ?? 'Missing');
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = `http://127.0.0.1:${server.address().port}/game/`; await browser.close(); browser = undefined;
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    browser = await engines[engine].launch({ headless: true, args: engine === 'chromium' ? ['--mute-audio'] : [] }); const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), page = await ctx.newPage(); watch(page);
    await page.goto(engine === 'chromium' ? pathToFileURL(path.join(output, 'before-rain-stops.html')).href : url); await preferences(page); await button(page, '开始故事').click(); await stable(page);
    await page.locator('.player-dialogue').hover(); await page.mouse.wheel(0, 220); await page.waitForFunction(() => document.querySelector('.player-dialogue').scrollTop > 100); await settleScroll(page);
    const before = await position(page), offset = before.first, initialHash = before.hash; assert.ok(offset > 0); snapshots.push({ name: `${engine}-initial`, ...before });
    await page.setViewportSize({ width: 844, height: 390 }); await verifyAnchor(page, offset, `${engine}-rotated-landscape`, initialHash);
    await page.setViewportSize({ width: 390, height: 844 }); const returned = await verifyAnchor(page, offset, `${engine}-returned-portrait`, initialHash); assert.ok(Math.abs(returned.scrollTop - before.scrollTop) <= 2);
    await openMenu(page); await closeMenu(page); await verifyAnchor(page, offset, `${engine}-menu-return`, initialHash);
    await preferences(page, 'Home'); await preferences(page, 'End'); await verifyAnchor(page, offset, `${engine}-font-size-return`, initialHash);
    if (engine === 'chromium') {
      await openMenu(page); await button(page, '打开玩家设置').click(); await button(page, '进入游戏全屏').click();
      await page.waitForFunction(() => document.fullscreenElement?.matches('main.player-shell'));
      await button(page, '返回故事').click(); await verifyAnchor(page, offset, 'chromium-fullscreen-reading', initialHash);
      await openMenu(page); await button(page, '打开玩家设置').click(); await button(page, '退出游戏全屏').click(); await page.waitForFunction(() => document.fullscreenElement === null);
      await button(page, '返回故事').click(); await verifyAnchor(page, offset, 'chromium-exit-fullscreen-reading', initialHash);
      check('chromium-voluntary-native-fullscreen-and-return-retain-text-anchor', { physicalPhone: false });
    }
    // An actual later scroll must replace the old anchor.
    await page.locator('.player-dialogue').hover(); await page.mouse.wheel(0, -100); await page.waitForFunction(before => document.querySelector('.player-dialogue').scrollTop < before - 50, returned.scrollTop); await settleScroll(page);
    const changed = await position(page); snapshots.push({ name: `${engine}-later-user-scroll`, ...changed }); assert.ok(changed.first < offset);
    await page.setViewportSize({ width: 844, height: 390 }); await verifyAnchor(page, changed.first, `${engine}-later-scroll-rotated`, initialHash);
    await page.setViewportSize({ width: 390, height: 844 }); await verifyAnchor(page, changed.first, `${engine}-later-scroll-returned`, initialHash);
    // Explicitly read the end; it stays the end, while the next paragraph starts at zero.
    await page.locator('.player-dialogue').hover(); await page.mouse.wheel(0, 10000); await settleScroll(page); const end = await position(page); assert.ok(end.maxScroll - end.scrollTop <= 2);
    await page.setViewportSize({ width: 844, height: 390 }); await settle(page); const rotatedEnd = await position(page); assert.ok(rotatedEnd.maxScroll - rotatedEnd.scrollTop <= 2); assert.equal(rotatedEnd.hash, initialHash);
    await button(page, '继续下一句').click(); await page.waitForFunction(before => document.querySelector('main.player-shell')?.dataset.runtimeStateHash !== before, initialHash); assert.equal((await position(page)).scrollTop, 0);
    await openMenu(page); await button(page, '后退一步').click(); await stable(page); assert.equal((await position(page)).scrollTop, 0);
    await page.clock.install(); await openMenu(page); await button(page, '自动播放').click(); await closeMenu(page); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.autoPlayback === 'waiting-reading');
    const autoHash = await hash(page); await page.clock.fastForward(120000); assert.equal(await hash(page), autoHash); await button(page, '停止自动阅读').click();
    check(`${engine}-rotation-font-menu-later-scroll-end-next-paragraph-back-and-auto-unread`, { browser: browser.version(), beforeOffset: offset, returnedOffset: returned.first, clockAdvancedMilliseconds: 120000, naturalReadingTimed: false, physicalPhone: false, safari: false });
    await ctx.close(); await browser.close(); browser = undefined;
  }
  browser = await engines.chromium.launch({ headless: true, args: ['--mute-audio'] });
  const statements = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => json(bytes).statements), byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  for (const branch of [0, 1]) {
    const ctx = await browser.newContext({ viewport: branch ? { width: 390, height: 844 } : { width: 1280, height: 900 }, reducedMotion: 'reduce' }), page = await ctx.newPage(); watch(page);
    await page.goto(branch ? url : pathToFileURL(path.join(output, 'before-rain-stops.html')).href); await preferences(page); await button(page, '开始故事').click(); const ids = [], voices = new Set(); let saved = false;
    for (let step = 0; step < 350 && await page.locator('main.player-shell').getAttribute('data-player-status') !== 'ended'; step++) {
      const options = page.locator('.player-choice button'); if (await options.count()) { await options.nth(branch).click(); continue; } await stable(page);
      const words = (await page.locator('.player-dialogue__text').innerText()).trim(), statement = byText.get(words); assert.ok(statement, words); if (ids.at(-1) !== statement.id) ids.push(statement.id);
      if (await page.locator('audio[data-audio-bus="voice"]').count()) { await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(statement.id); }
      if (ids.length === 3 && !saved) { const saveHash = await hash(page); await openMenu(page); await button(page, '快速保存').click(); await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); await closeMenu(page); await page.reload(); await quickLoad(page); assert.equal(await hash(page), saveHash); saved = true; }
      assert.equal(await page.locator('.player-media-error').count(), 0); await button(page, '继续下一句').click();
    }
    assert.equal(await page.locator('main.player-shell').getAttribute('data-player-status'), 'ended'); assert.equal(ids.length, 66); assert.equal(voices.size, 6);
    const scenes = Object.entries(source).filter(([name]) => name.startsWith('scenes/')).map(([, bytes]) => json(bytes)), titles = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch ? ['远行', '车窗与海', '再一次见面'] : ['留下', '灯下的回信', '雨后的天明'])];
    assert.deepEqual(ids, titles.flatMap(title => json(source[scenes.find(scene => scene.title === title).scriptPath]).statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id)));
    routes.push({ branch, entry: branch ? 'website-phone' : 'html-desktop', ids, mutedNativeVoices: voices.size, ending: await page.locator('.player-ending').innerText(), fontPercent: 140 }); await shot(page, `route-${branch}-ending`);
    check(`chromium-${branch ? 'website-phone' : 'html-desktop'}-140-percent-full-route-six-voice-lines-save-reload-and-ending`); await ctx.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checks, errors, snapshots, routes, artifacts, scope: 'Same 1.8.0 story/media. Three desktop engines for rotation, fonts, menu, user scroll, end/start and virtual-clock Auto only. Chromium actual editor exports and 140% complete routes (HTML desktop + HTTP phone viewport), save/reload/load. No physical phone/Safari/natural reading timing/human listening/public HTTPS or offline upgrade acceptance. Reading anchors are transient, not serialized in saves.' }, null, 2));
} catch (error) {
  await writeFile(path.join(output, `failure-${new Date().toISOString().replaceAll(':', '-')}.json`), JSON.stringify({ passed: false, checks, snapshots, errors, error: String(error), stack: error.stack }, null, 2)); if (current && !current.isClosed()) await shot(current, 'failure'); throw error;
} finally {
  if (browser) await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

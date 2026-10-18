import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { inspectLocalSite, inspectDeployedSite } from '../apps/editor/src/export-deployment-check.mjs';
import { readGamePayload } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-website-export');
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', require = createRequire(import.meta.url);
let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const source = path.join(root, 'evidence/web-reading-throughput/before-rain-stops-project.zip'), sourceFiles = unzipSync(await readFile(source));
const json = bytes => JSON.parse(strFromU8(bytes)), originalManifest = json(sourceFiles['world.project.json']), marker = 'PRIVATE_WEBSITE_TEST_375';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [], errors = [], results = [], artifacts = {};
let browser, server, current;
const ready = p => p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const button = (p, name) => p.getByRole('button', { name, exact: true });
const nav = (p, name) => p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function download(p, action) { const pending = p.waitForEvent('download'); await action(); return readFile(await (await pending).path()); }
async function menu(p, name) { await ready(p); if (!await p.locator('.project-switcher').evaluate(el => el.open)) await p.getByLabel('项目菜单', { exact: true }).click(); await p.getByRole('button', { name: new RegExp(name) }).click(); }
async function saveReopen(p) {
  await ready(p); await p.locator('.local-save-button').click(); await p.locator('.local-save-button--saved').waitFor(); await menu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await p.reload(); await button(p, '打开项目：雨停之前').click(); await ready(p);
}
async function generate(p, purpose, production) {
  await p.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/ }).click(); await p.locator(`input[name="publication-format"][value="${purpose}"]`).check();
  await p.getByLabel('同时生成制作交付包', { exact: true }).setChecked(production); await button(p, '继续：生成游戏 →').click(); await p.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await button(p, purpose === 'website' ? '构建网站上传 ZIP' : '构建目录 ZIP').click(); const link = purpose === 'website' ? '下载网站上传包' : '下载游戏'; await p.getByRole('link', { name: link, exact: true }).waitFor({ timeout: 90000 });
  return download(p, () => p.getByRole('link', { name: link, exact: true }).click());
}
await mkdir(output, { recursive: true });
const dist = path.join(root, 'apps/editor/dist'), html = await readFile(path.join(dist, 'index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), html);
artifacts.editor = {};
for (const entry of [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)].map(match => match[1])) {
  const bytes = await readFile(path.join(dist, entry)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(entry, ui))).arrayBuffer())), sha(bytes)); artifacts.editor[entry] = sha(bytes);
}
const temporary = await mkdtemp(path.join(tmpdir(), 'world-website-export-'));
try {
  for (const engine of (process.env.STUDIO_BROWSER_ENGINES ?? 'chromium,firefox,webkit').split(',')) {
    assert.ok(['chromium', 'firefox', 'webkit'].includes(engine)); browser = await engines[engine].launch({ headless: true, args: engine === 'chromium' ? ['--mute-audio'] : [] });
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); current = p; p.setDefaultTimeout(30000); p.on('pageerror', error => errors.push(`${engine}: ${error.message}`));
    await p.goto(ui); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(source); await ready(p); await nav(p, '发布');
    if (engine === 'chromium') {
      await button(p, '核对素材来源').click(); const dialog = p.getByRole('dialog', { name: '素材来源与发行准备', exact: true }); await dialog.getByLabel('确认依据', { exact: true }).fill(marker); await dialog.getByRole('button', { name: '应用来源台账', exact: true }).click();
    }
    await button(p, '继续：导出方式 →').click(); await p.locator('input[name="publication-format"][value="website"]').check();
    for (const size of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await p.setViewportSize(size); const card = p.getByRole('radio', { name: /^网站上传 ZIP/u }).locator('..'); await card.scrollIntoViewIfNeeded();
      await p.waitForFunction(() => { const el = document.querySelector('input[name="publication-format"][value="website"]')?.closest('label'), r = el?.getBoundingClientRect(); return r && r.x >= -1 && r.right <= innerWidth + 1 && r.height >= 44; });
      assert.equal(await p.locator('input[value="website"]').isChecked(), true); await shot(p, `${engine}-format-${size.width}x${size.height}`);
    }
    await p.setViewportSize({ width: 1440, height: 1000 }); await button(p, '继续：生成游戏 →').click(); await saveReopen(p);
    await button(p, '构建网站上传 ZIP').waitFor(); assert.equal(await p.getByRole('link', { name: '下载网站上传包', exact: true }).count(), 0); await nav(p, '检查'); await nav(p, '发布'); await button(p, '构建网站上传 ZIP').waitFor();
    check(`${engine}-purpose-three-viewports-save-reopen-and-checks-return-without-expired-links`, { version: browser.version(), physicalPhone: false });
    if (engine === 'chromium') {
      const webBytes = await generate(p, 'website', true), files = unzipSync(webBytes), info = json(files['build-info.json']);
      assert.deepEqual(Object.keys(files).sort(), ['build-info.json', ...info.files.map(row => row.path)].sort()); assert.equal(json(files['manifest.webmanifest']).start_url, './index.html');
      for (const row of info.files) { assert.equal(files[row.path].length, row.byteLength); assert.equal(`sha256:${sha(files[row.path])}`, row.digest); }
      for (const data of Object.values(files)) { assert.ok(!strFromU8(data).includes(marker)); for (const record of originalManifest.webAssetSources.records) assert.ok(!strFromU8(data).includes(record.source)); }
      const payload = readGamePayload(strFromU8(files['index.html'])); assert.equal(payload.project.manifest.preservedFields.webAssetSources, undefined);
      const deliveryBytes = await download(p, () => p.getByRole('link', { name: '下载制作交付包', exact: true }).click()), delivery = unzipSync(deliveryBytes), sourceRoundtrip = unzipSync(delivery['source/project.zip']), actualManifest = json(sourceRoundtrip['world.project.json']);
      for (const [name, bytes] of Object.entries(sourceFiles)) if (name !== 'world.project.json') assert.equal(sha(sourceRoundtrip[name]), sha(bytes), name);
      const expected = structuredClone(originalManifest); expected.webAssetSources.records[0].evidence = marker; const normalize = value => ({ ...value, webAssetSources: { ...value.webAssetSources, records: value.webAssetSources.records.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)) } }); assert.deepEqual(normalize(actualManifest), normalize(expected));
      for (const [name, bytes] of Object.entries(files)) assert.equal(sha(delivery[`game/${name}`]), sha(bytes)); const report = json(delivery['release/preparation.json']); assert.equal(report.pendingAssets, 25); assert.equal(report.documentedAssets, 0); assert.equal(report.deploymentUrl, null); assert.equal(report.assets.find(row => row.assetId === originalManifest.webAssetSources.records[0].assetId).record.evidence, marker);
      const help = strFromU8(delivery['开始使用.txt']); assert.ok(help.includes('不可整包上传') && help.includes('同版纯网站内容')); assert.equal(delivery['game/使用说明.txt'], undefined);
      await p.setViewportSize({ width: 390, height: 844 }); const result = p.getByRole('complementary', { name: '游戏导出结果', exact: true }); await result.scrollIntoViewIfNeeded(); await shot(p, 'website-result-private-production-distinction');
      await p.setViewportSize({ width: 1440, height: 1000 }); const localBytes = await generate(p, 'directory', false), local = unzipSync(localBytes);
      for (const [name, bytes] of Object.entries(files)) assert.equal(sha(local[name]), sha(bytes), name); assert.equal(Object.keys(local).length - Object.keys(files).length, 5);
      assert.ok(local['deployment-check.mjs'] && local['preview.mjs']); assert.equal(await p.getByRole('link', { name: '下载网站上传包', exact: true }).count(), 0);
      artifacts.website = { bytes: webBytes.length, sha256: sha(webBytes), files: Object.keys(files).length, projectDigest: info.projectDigest, version: info.publication.version };
      artifacts.local = { bytes: localBytes.length, sha256: sha(localBytes), publicFilesExactlyEqual: true, extraAuthorHelpers: 5 };
      artifacts.production = { bytes: deliveryBytes.length, sha256: sha(deliveryBytes), unchangedNonManifestSourceEntries: 64, pendingAssets: 25, confirmedAssets: 0 };
      const siteRoot = path.join(temporary, 'website'); await mkdir(siteRoot); for (const [name, bytes] of Object.entries(files)) { await mkdir(path.dirname(path.join(siteRoot, name)), { recursive: true }); await writeFile(path.join(siteRoot, name), bytes); }
      const checked = await inspectLocalSite(siteRoot); assert.equal(checked.checkedFiles, Object.keys(files).length); assert.equal(checked.permissionVerified, false);
      check('actual-website-zip-has-only-same-build-public-bytes-private-data-only-in-restorable-source-and-production', { publicFiles: checked.checkedFiles, noNodeRequiredByExport: true, originalStoryVersion: '1.7.14' });
      const requests = [];
      server = createServer((req, res) => {
        const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html'; requests.push({ method: req.method, name }); const data = files[name];
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.txt': 'text/plain' }[path.extname(name)] ?? 'application/octet-stream', headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' }, range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
        if (data && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : data.length - 1, data.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }).end(data.subarray(start, end + 1)); }
        res.writeHead(data ? 200 : 404, headers).end(data ?? 'Missing');
      }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const siteUrl = `http://127.0.0.1:${server.address().port}/gal/`, remote = await inspectDeployedSite(siteRoot, siteUrl);
      assert.equal(remote.loopback, true); assert.equal(remote.checkedFiles, checked.checkedFiles); assert.equal((await fetch(new URL('source/project.zip', siteUrl))).status, 404);
      const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }), player = await playerContext.newPage(); current = player; player.on('pageerror', error => errors.push(`player:${error.message}`));
      await player.goto(siteUrl); await button(player, '开始故事').click(); const main = player.locator('main.player-shell'); await player.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
      const savedHash = await main.getAttribute('data-runtime-state-hash'); await button(player, '打开阅读菜单').click(); await button(player, '快速保存').click(); await player.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved');
      const readingMenu = player.getByRole('dialog', { name: '阅读菜单', exact: true }); if (await readingMenu.isVisible()) await readingMenu.getByRole('button', { name: '返回故事', exact: true }).click();
      await player.locator('#offline-panel > summary').click(); await button(player, '下载离线内容').click(); await player.locator('#offline-status').filter({ hasText: '离线内容已就绪' }).waitFor({ timeout: 90000 }); await player.waitForFunction(() => navigator.serviceWorker.controller !== null);
      await playerContext.setOffline(true); const response = await player.reload(); assert.equal(response.fromServiceWorker(), true); await button(player, '读取存档').click(); const slots = player.getByRole('dialog', { name: '存读档槽位', exact: true }); await slots.getByRole('button', { name: '快速', exact: true }).click(); await slots.getByRole('button', { name: '读取', exact: true }).click(); if (await player.locator('.player-load-confirm').isVisible()) await button(player, '确认读取').click();
      await player.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); assert.equal(await main.getAttribute('data-runtime-state-hash'), savedHash);
      await player.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false'); await shot(player, 'website-loopback-offline-read-saved-position');
      await playerContext.setOffline(false); await playerContext.close(); await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); server = null; current = p;
      assert.ok(requests.every(row => row.method === 'GET')); artifacts.localSite = { checkedFiles: remote.checkedFiles, loopback: true, offlineReloadFromServiceWorker: true, offlineStageImagesReady: true, savedHash, loadedHash: savedHash, publicDeployment: false, naturalAudioAcceptance: false };
      check('pure-website-local-byte-check-http-check-offline-cache-disconnect-reload-and-explicit-save-load', { physicalPhone: false, publicHttps: false, strictUpgradeLifecycle: false });
      const productionPath = path.join(temporary, 'verification-production.zip'); await writeFile(productionPath, deliveryBytes); const fresh = await browser.newPage(); current = fresh; fresh.on('pageerror', error => errors.push(`restore:${error.message}`)); await fresh.goto(ui); await fresh.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(productionPath); await ready(fresh); await nav(fresh, '发布'); await button(fresh, '核对素材来源').click(); assert.equal(await fresh.getByLabel('确认依据', { exact: true }).inputValue(), marker); await fresh.close(); current = p;
      check('website-production-restores-editable-source-and-private-evidence-in-fresh-author-profile');
    }
    results.push({ engine, version: browser.version(), passed: true }); await browser.close(); browser = null;
  }
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checks, errors, results, artifacts, scope: 'Three desktop engines for author choice/resize/reopen only; Chromium actual local/website/production exports, original 1.7.14 source and loopback offline saved-position checks. No public hosting, physical devices/Safari, permission approval, human listening or full offline update lifecycle. Temporary validation downloads cleaned; original source/media unmodified.' }, null, 2));
} catch (error) {
  await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ passed: false, checks, errors, error: String(error), stack: error.stack }, null, 2)); if (current && !current.isClosed()) await shot(current, 'failure'); throw error;
} finally {
  if (browser) await browser.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  assert.equal(path.dirname(temporary), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith('world-website-export-')); await rm(temporary, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { unzipSync } from 'fflate';
import { sha, json, readGamePayload } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.SOURCE_PREVIEW_OUTPUT ?? 'evidence/web-source-preview');
const baseline = process.argv.includes('--baseline'), engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
await mkdir(output, { recursive: true }); const label = baseline ? 'baseline' : engine;
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
const index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), index);
const build = {};
for (const [, asset] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) { build[asset] = sha(await readFile(path.join(root, 'apps/editor/dist', asset))); assert.equal(sha(new Uint8Array(await (await fetch(new URL(asset, ui))).arrayBuffer())), build[asset]); }
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const temporary = await mkdtemp(path.join(tmpdir(), 'world-source-preview-'));
await page.addInitScript(() => {
  const revoke = URL.revokeObjectURL, create = URL.createObjectURL; window.previewRevoked = []; window.previewCreated = [];
  URL.createObjectURL = function(blob) { const url = create.call(this, blob); window.previewCreated.push({ url, type: blob.type }); return url; };
  URL.revokeObjectURL = function(url) { window.previewRevoked.push(url); return revoke.call(this, url); };
});
const checks = [], errors = []; page.on('pageerror', e => errors.push(String(e))); page.setDefaultTimeout(30000);
const button = name => page.getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog', { name: '素材来源与发行准备', exact: true });
const choose = async id => { const toggle = dialog().getByRole('button', { name: /^选择其他素材/u }); if (await toggle.isVisible()) await toggle.click(); await dialog().getByLabel('搜索素材', { exact: true }).fill(id); await dialog().getByRole('group', { name: '选择来源素材', exact: true }).getByRole('button').click(); };
const retainedNames = ['evidence/web-story-plans-and-farewell/before-rain-stops-project.zip', 'evidence/web-story-plans-and-farewell/before-rain-stops.worldreview', 'evidence/web-reading-press/before-rain-stops.html', 'evidence/web-reading-press/before-rain-stops-website.zip'];
const retained = await Promise.all(retainedNames.map(async file => ({ file, sha256: sha(await readFile(path.join(root, file))) })));
const original = unzipSync(await readFile(path.join(root, retainedNames[0]))), manifest = json(original['world.project.json']), assetIndex = json(original['.world-assets/index.json']);
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const download = async (p, action) => { const pending = p.waitForEvent('download'); await action(); return readFile(await (await pending).path()); };
async function projectMenu(name) { if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function preview(kind) {
  await button(kind === 'audio' ? '试听当前音频' : '查看当前图片').click();
  const el = dialog().locator(kind === 'audio' ? 'audio' : '.web-source-preview img'); await el.waitFor();
  if (kind === 'image') await page.waitForFunction(() => document.querySelector('.web-source-preview img')?.naturalWidth > 0);
  return el;
}
async function fit(name) {
  await page.waitForFunction(() => { const e = document.querySelector('.web-sources-editor'), r = e?.getBoundingClientRect(); return r && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
  const control = button(name); await control.scrollIntoViewIfNeeded();
  const result = await control.evaluate(el => { const r = el.getBoundingClientRect(), body = el.closest('.web-credits-editor__body').getBoundingClientRect(); return { height: r.height, visible: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= body.top - 1 && r.bottom <= body.bottom + 1, horizontalOverflow: el.closest('dialog').scrollWidth > el.closest('dialog').clientWidth + 1 }; });
  assert.ok(result.height >= 44 && result.visible && !result.horizontalOverflow, JSON.stringify(result));
  await page.screenshot({ path: path.join(output, `${label}-${name.startsWith('关闭') ? 'image' : 'audio'}-${page.viewportSize().width}.png`), animations: 'disabled' }); return result;
}
async function fitMedia(element, kind) {
  await element.scrollIntoViewIfNeeded();
  const geometry = await element.evaluate(el => { const r = el.getBoundingClientRect(), body = el.closest('.web-credits-editor__body').getBoundingClientRect(); return { width: r.width, height: r.height, fullyVisible: r.left >= body.left - 1 && r.right <= body.right + 1 && r.top >= body.top - 1 && r.bottom <= body.bottom + 1 }; });
  assert.ok(geometry.width > 0 && geometry.height > 0 && geometry.fullyVisible, JSON.stringify(geometry));
  await page.screenshot({ path: path.join(output, `${label}-${kind}-media-${page.viewportSize().width}.png`), animations: 'disabled' }); return geometry;
}
try {
  await page.goto(ui); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-story-plans-and-farewell/before-rain-stops-project.zip')); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
  await page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await button('核对素材来源').click(); await choose('voice_04');
  if (baseline) { assert.equal(await dialog().locator('audio,img').count(), 0); assert.equal(await dialog().getByRole('button', { name: '试听当前音频', exact: true }).count(), 0); checks.push({ name: 'actual-source-review-has-no-current-audio-or-image-preview', selected: await dialog().getByRole('heading', { level: 3 }).innerText() }); }
  else {
    const marker = process.env.SOURCE_PREVIEW_MARKER ?? 'PRIVATE_SOURCE_PREVIEW_396'; await dialog().getByLabel('确认依据', { exact: true }).fill(marker);
    assert.equal(await dialog().locator('audio,img').count(), 0);
    const audio = await preview('audio'), sourceUrl = await audio.getAttribute('src'), handle = await audio.elementHandle();
    assert.equal(await audio.getAttribute('preload'), 'none'); assert.equal(await audio.getAttribute('autoplay'), null);
    const state = await audio.evaluate(el => ({ paused: el.paused, time: el.currentTime, url: el.src })); assert.equal(state.paused, true); assert.equal(state.time, 0);
    await dialog().locator('.web-source-preview details summary').click();
    await dialog().locator('.web-source-preview li p').filter({ hasText: '出发的事明早确认，今晚的回信不用再等。' }).waitFor();
    assert.ok((await dialog().locator('.web-source-preview details').innerText()).includes('林远')); assert.equal(await dialog().getByLabel('发行条件状态', { exact: true }).inputValue(), 'pending');
    const bounds = await audio.boundingBox(); await audio.click({ position: { x: 20, y: bounds.height / 2 } });
    let nativePlayback = true;
    try { await page.waitForFunction(() => { const a = document.querySelector('.web-source-preview audio'); return a && a.currentTime > 0 && !a.paused && a.readyState >= 2; }, undefined, { timeout: 5000 }); }
    catch (error) { if (engine !== 'webkit') throw error; nativePlayback = false; }
    checks.push({ name: 'current-voice-revision-exact-source-line-no-autoplay-and-native-playback', sourceUrl, state, nativePlayback, physicalDevice: false, naturalListeningApproved: false });
    await choose('xia_letter'); await page.waitForFunction(url => window.previewRevoked.includes(url), sourceUrl);
    assert.deepEqual(await handle.evaluate(el => ({ paused: el.paused, src: el.getAttribute('src') })), { paused: true, src: null });
    const img = await preview('image'), imageUrl = await img.getAttribute('src');
    const digest = await img.evaluate(async el => { const bytes = await (await fetch(el.src)).arrayBuffer(); return 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''); });
    assert.equal(digest, assetIndex.assets.find(row => row.assetId === 'xia_letter').source.digest);
    const images = [];
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) { await page.setViewportSize(viewport); await fit('关闭当前素材预览'); images.push({ viewport, media: await fitMedia(img, 'image') }); }
    await button('关闭当前素材预览').click(); await page.waitForFunction(url => window.previewRevoked.includes(url), imageUrl);
    checks.push({ name: 'selection-stops-native-audio-and-current-image-has-exact-file-digest-three-viewports', digest, images });
    await choose('voice_04'); assert.equal(await dialog().getByLabel('确认依据', { exact: true }).inputValue(), marker); assert.equal(await dialog().locator('audio').count(), 0); await preview('audio');
    const audioLayouts = [];
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) { await page.setViewportSize(viewport); await fit('重新准备试听'); audioLayouts.push({ viewport, media: await fitMedia(dialog().locator('audio'), 'audio') }); }
    await page.setViewportSize({ width: 390, height: 844 }); const secondUrl = await page.evaluate(() => window.previewCreated.filter(row => row.type.startsWith('audio/')).at(-1).url);
    await button('选择其他素材（26）').click(); await page.waitForFunction(url => window.previewRevoked.includes(url), secondUrl); await button('查看当前素材详情').click(); assert.equal(await dialog().locator('audio').count(), 0);
    await preview('audio'); const bad = dialog().locator('audio'); await bad.evaluate(el => { el.src = 'data:audio/wav;base64,AA=='; el.load(); }); await dialog().getByText(/音频无法播放/).waitFor();
    const retryUrl = await page.evaluate(() => window.previewCreated.filter(row => row.type.startsWith('audio/')).at(-1).url); await button('重新准备试听').click();
    await page.waitForFunction(url => window.previewCreated.filter(row => row.type.startsWith('audio/')).at(-1)?.url !== url && document.querySelector('.web-source-preview audio'), retryUrl); assert.equal(await dialog().getByLabel('确认依据', { exact: true }).inputValue(), marker);
    checks.push({ name: 'mobile-list-stops-preview-no-auto-resume-native-decode-error-retry-and-draft-preserved', audioLayouts, injectedFault: 'invalid native audio source only; indexed file and narrative unchanged' });
    await button('应用来源台账').click(); await ready(); await page.locator('.local-save-button').click(); await page.locator('.local-save-button--saved').waitFor(); await projectMenu('所有项目'); await page.reload(); await button('打开项目：雨停之前').click(); await ready(); await nav('发布'); await button('核对素材来源').click(); await choose('voice_04'); assert.equal(await dialog().getByLabel('确认依据', { exact: true }).inputValue(), marker); assert.equal(await dialog().getByLabel('发行条件状态', { exact: true }).inputValue(), 'pending'); await button('取消').click();
    checks.push({ name: 'explicit-source-apply-save-reopen-keeps-only-pending-private-draft', pending: 26, approved: 0 });
    const sourceBytes = await download(page, () => projectMenu('导出工程 ZIP')), source = unzipSync(sourceBytes), actual = json(source['world.project.json']);
    assert.deepEqual(Object.keys(source).sort(), Object.keys(original).sort()); for (const [name, bytes] of Object.entries(original)) if (name !== 'world.project.json') assert.equal(sha(source[name]), sha(bytes), name);
    const expected = structuredClone(manifest); expected.webAssetSources.records.find(row => row.assetId === 'voice_04').evidence = marker;
    const normalize = value => ({ ...value, webAssetSources: { ...value.webAssetSources, records: value.webAssetSources.records.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)) } }); assert.deepEqual(normalize(actual), normalize(expected));
    if (engine === 'chromium') {
      await nav('检查'); await page.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(root, retainedNames[1])); await button('待跟进 25').waitFor(); await nav('发布'); await button('继续：导出方式 →').click();
      const production = [];
      const oldGame = readGamePayload(await readFile(path.join(root, retainedNames[2]), 'utf8'));
      for (const format of ['html', 'website']) {
        await page.locator(`input[name="publication-format"][value="${format}"]`).check(); await page.getByLabel('同时生成制作交付包', { exact: true }).check(); await page.getByLabel('附带校订记录', { exact: true }).check();
        await button('继续：生成游戏 →').click(); await page.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP').click();
        const link = page.getByRole('link', { name: format === 'html' ? '下载游戏' : '下载网站上传包', exact: true }); await link.waitFor({ timeout: 90000 });
        const gameBytes = await download(page, () => link.click()), publicFiles = format === 'html' ? { 'index.html': gameBytes } : unzipSync(gameBytes), payload = readGamePayload(Buffer.from(publicFiles['index.html']).toString());
        assert.deepEqual(payload.project, oldGame.project); assert.equal(payload.project.manifest.preservedFields.webAssetSources, undefined);
        if (format === 'html') assert.deepEqual(payload.mediaAssets, oldGame.mediaAssets); else for (const asset of payload.mediaAssets) assert.equal(sha(publicFiles[asset.url]), sha(Buffer.from(oldGame.mediaAssets.find(row => row.assetId === asset.assetId).url.split(',')[1], 'base64')));
        for (const [name, bytes] of Object.entries(publicFiles)) { assert.ok(!Buffer.from(bytes).includes(Buffer.from(marker)), name); assert.ok(!/worldreview|worldsave|world\.project|(?:^|\/)source\/|\.world-assets/u.test(name)); }
        const bundleBytes = await download(page, () => page.getByRole('link', { name: '下载制作交付包', exact: true }).click()), files = unzipSync(bundleBytes), delivery = json(files['delivery.json']), report = json(files['release/preparation.json']);
        assert.equal(sha(files['source/project.zip']), sha(sourceBytes)); assert.equal(report.pendingAssets, 26); assert.equal(report.documentedAssets, 0); assert.equal(report.deploymentUrl, null); assert.equal(report.assets.find(row => row.assetId === 'voice_04').record.evidence, marker); assert.deepEqual(json(files[delivery.reviewEntry]), json(await readFile(path.join(root, retainedNames[1]))));
        const filename = path.join(temporary, `${format}-production.zip`); await writeFile(filename, bundleBytes); const restored = await browser.newPage(); restored.on('pageerror', e => errors.push(String(e))); await restored.goto(ui); await restored.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(filename); await restored.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); await restored.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click(); await restored.getByRole('button', { name: '核对素材来源', exact: true }).click(); await restored.getByLabel('搜索素材', { exact: true }).fill('voice_04'); await restored.getByRole('group', { name: '选择来源素材', exact: true }).getByRole('button').click(); assert.equal(await restored.getByLabel('确认依据', { exact: true }).inputValue(), marker); await restored.close();
        production.push({ format, gameSha256: sha(gameBytes), bundleSha256: sha(bundleBytes), restoredPendingRecord: true }); if (format === 'html') await button('← 导出方式').click();
      }
      checks.push({ name: 'actual-dual-production-export-public-private-boundary-and-fresh-ui-restore', sourceSha256: sha(sourceBytes), unchangedSourceEntries: Object.keys(original).length - 1, production, sourceAndPlayerVersion: '1.11.0', pendingNotes: 25 });
    }
  }
  await page.screenshot({ path: path.join(output, label + '.png'), animations: 'disabled' }); assert.deepEqual(errors, []);
  for (const file of retained) assert.equal(sha(await readFile(path.join(root, file.file))), file.sha256);
  await writeFile(path.join(output, label + '.json'), JSON.stringify({ passed: true, baseline, browser: browser.version(), build, checks, errors, retained, scope: baseline ? 'Actual original production editor, selected current voice has no inline media preview.' : 'Actual complete project, source preview and pending private verification marker, native controls, phone-sized geometry, apply/save/reopen. Chromium also exports/restores both private production formats and compares public project/media. Not an authorization, human listening, full player routes, physical phone/Safari or public-deployment acceptance; WebKit native Blob playback may remain unsupported.' }, null, 2)); console.log(`PASS ${label} source preview workflow`);
} catch (error) { await page.screenshot({ path: path.join(output, `${label}-failure.png`), animations: 'disabled' }); await writeFile(path.join(output, `${label}-failure.json`), JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors }, null, 2)); throw error; }
finally { await browser.close(); assert.equal(path.dirname(temporary), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith('world-source-preview-')); await rm(temporary, { recursive: true, force: true }); }

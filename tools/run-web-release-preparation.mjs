import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';

const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-release-preparation'), scratch = path.join(root, '.browser-diagnostic/release-preparation');
await mkdir(output, { recursive: true }); await mkdir(scratch, { recursive: true });
const originalPath = path.join(root, 'evidence/web-mobile-continuity/before-rain-stops-project.zip'), original = unzipSync(await readFile(originalPath));
const originalManifest = json(original['world.project.json']), index = json(original['.world-assets/index.json']);
const oldPayload = readGamePayload(await readFile(path.join(root, 'evidence/web-mobile-continuity/before-rain-stops.html'), 'utf8'));
const assetDir = path.join(root, 'assets/rain-story'), fileByHash = new Map();
for (const name of await readdir(assetDir)) if (/\.(png|wav)$/u.test(name)) fileByHash.set(`sha256:${sha(await readFile(path.join(assetDir, name)))}`, name);
const voiceLines = json(await readFile(path.join(assetDir, 'voice-lines.json')));
const checks = [], errors = [], artifacts = {}, results = []; let browser, current, server, runScratch = scratch;
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
const watch = (page, label) => page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
const ready = p => p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = (p, name) => p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const dialog = p => p.getByRole('dialog', { name: '素材来源与发行准备', exact: true });
const open = p => p.getByRole('button', { name: '核对素材来源', exact: true }).click();
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function fit(locator) { const r = await locator.evaluate(async el => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, w: innerWidth, h: innerHeight, client: el.clientWidth, scroll: el.scrollWidth }; }); assert.ok(r.x >= -1 && r.right <= r.w + 1 && r.y >= -1 && r.bottom <= r.h + 1 && r.client + 1 >= r.scroll, JSON.stringify(r)); }
async function download(p, action, destination) { const pending = p.waitForEvent('download'); await action(); const file = await pending, bytes = await readFile(await file.path()); if (destination) await writeFile(destination, bytes); return bytes; }
async function projectMenu(p, name) { await ready(p); if (!await p.locator('.project-switcher').evaluate(el => el.open)) await p.getByLabel('项目菜单', { exact: true }).click(); await p.getByRole('button', { name: new RegExp(name) }).click(); }
async function choose(p, name) { const toggle = dialog(p).getByRole('button', { name: /^选择其他素材/u }); if (await toggle.isVisible()) await toggle.click(); await dialog(p).getByRole('group', { name: '选择来源素材', exact: true }).getByRole('button', { name: new RegExp(`^${name}`) }).click(); }
async function saveAndReopen(p) { await p.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); }); await ready(p); await p.locator('.local-save-button').click(); await p.locator('.local-save-button--saved').waitFor(); await ready(p); await projectMenu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await p.reload(); await p.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready(p); }
const facts = index.assets.map(asset => {
  const file = fileByHash.get(asset.source.digest); assert.ok(file, `No exact repository media for ${asset.assetId}`);
  let sourceKind = 'generated', source;
  if (file.startsWith('voice-')) {
    const line = voiceLines.find(line => line.file === file) ?? voiceLines.find(line => line.file === 'voice-04.wav'); assert.ok(line);
    source = `assets/rain-story/${file}；Windows System.Speech / ${line.voice} / rate -1 / mono PCM16 22050 Hz。${asset.assetId === 'voice_04' ? '1.7 修订，台词/生成方式见 voice-revision-v1.7.json、source-manifest-v1.7.json；tools/generate-rain-story-voice-v1.7.ps1。' : '台词/声线见 voice-lines.json；生成脚本 tools/generate-rain-story-voice.ps1。'} 系统合成样片，不是真人录音；声线/输出再分发条件待核实，若无法确认需替换为有明确发行依据的素材。`;
  } else if (file === 'letter-icon.png') {
    sourceKind = 'original'; source = `assets/rain-story/${file}；由项目代码绘制的 letter-icon.svg 经 tools/create-rain-story-icon.mjs 栅格化，512×512 PNG。不是生成式位图。项目所有者/署名及最终展示说明尚待确认，不据此统一声明授权通过。`;
  } else if (file.endsWith('.wav')) {
    sourceKind = 'original'; source = `assets/rain-story/${file}；tools/generate-rain-story-audio.mjs 程序合成，单声道 PCM16 / 22050 Hz。${file === 'night-travel-theme.wav' ? '项目原始旋律/和弦，不是录音或真人演奏。' : file === 'soft-rain.wav' ? '固定随机种子的滤波雨声。' : '合成进站提示音。'} 项目所有者、署名与最终发行展示说明待确认。`;
  } else {
    const v16 = ['station-day.png', 'day-cafe.png', 'night-studio.png'].includes(file), v13 = ['station-night-v2.png', 'waiting-room.png', 'night-train.png', 'morning-studio.png', 'xia-thoughtful.png', 'xia-smile.png'].includes(file);
    source = `assets/rain-story/${file}；内置 imagegen ${v16 ? '光照/天气编辑；参考关系/提示词见 image-prompts-v1.6.json，摘要见 source-manifest-v1.6.json。' : v13 ? '生成/编辑；参考关系/提示词见 image-prompts-v1.3.json，摘要见 source-manifest-v1.3.json。' : '生成；提示词与制作事实见 assets/rain-story/README.md。'} 图像没有指定外部人物/品牌/IP 参考；此为仓库来源记录，不是最终美术或发行许可确认。适用工具条款、展示声明及所有者确认仍待核实。`;
  }
  return { assetId: asset.assetId, digest: asset.source.digest, sourceKind, source, permission: 'pending', evidence: '', reviewedBy: '', reviewedOn: '', credit: '' };
});
assert.equal(facts.length, 25);
async function inspectSource(bytes) {
  const files = unzipSync(bytes), manifest = json(files['world.project.json']);
  assert.deepEqual(Object.keys(files).sort(), Object.keys(original).sort());
  for (const [name, data] of Object.entries(original)) if (name !== 'world.project.json') { assert.equal(files[name].length, data.length, name); assert.equal(sha(files[name]), sha(data), name); }
  assert.deepEqual(manifest.webAssetSources.records.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)), facts.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)));
  const { webAssetSources, ...rest } = manifest; assert.deepEqual(rest, originalManifest);
  assert.ok(webAssetSources.records.every(row => row.permission === 'pending' && !row.reviewedBy && !row.reviewedOn && !row.evidence && !row.credit));
  return files;
}
async function releaseAuthorSource() {
  browser = await engines.chromium.launch({ headless: true }); const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); current = p; p.setDefaultTimeout(25000); watch(p, 'source');
  await p.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(originalPath); await ready(p); await nav(p, '发布'); await open(p);
  for (let i = 0; i < facts.length; i++) { const record = facts[i], asset = index.assets.find(a => a.assetId === record.assetId); await choose(p, asset.displayName); await p.getByLabel('来源类型', { exact: true }).selectOption(record.sourceKind); await p.getByLabel('来源事实', { exact: true }).fill(record.source); }
  await fit(dialog(p)); await shot(p, 'desktop-all-assets-pending'); await dialog(p).getByRole('button', { name: '应用来源台账', exact: true }).click(); await dialog(p).waitFor({ state: 'detached' }); await saveAndReopen(p);
  await nav(p, '发布'); await open(p); await choose(p, '林远·合成语音04'); assert.equal(await p.getByLabel('来源事实', { exact: true }).inputValue(), facts.find(row => row.assetId === 'voice_04').source); assert.equal(await p.getByLabel('发行条件状态', { exact: true }).inputValue(), 'pending'); await shot(p, 'reopened-voice-provenance'); await dialog(p).getByRole('button', { name: '取消', exact: true }).click();
  const sourceBytes = await download(p, () => projectMenu(p, '导出工程 ZIP'), path.join(output, 'before-rain-stops-project.zip')); await inspectSource(sourceBytes); artifacts.source = { byteLength: sourceBytes.length, sha256: sha(sourceBytes) };
  await nav(p, '发布'); const prep = await download(p, () => p.getByRole('button', { name: '下载发布准备清单（内部）', exact: true }).click(), path.join(output, '发布准备.txt')); assert.ok(prep.toString('utf8').includes('仍待处理 25')); assert.ok(!prep.toString('utf8').includes('PRIVATE_TEST')); artifacts.preparation = { byteLength: prep.length, sha256: sha(prep) };
  check('all-25-real-media-matched-by-sha-and-written-via-ui-saved-reopened-source-roundtrip', { imagegen: 12, systemTts: 9, proceduralAudio: 3, icon: 1, permissionConfirmed: 0, unchangedNonManifestEntries: Object.keys(original).length - 1 });
  await writeFile(path.join(output, 'release-checks.json'), JSON.stringify({ passed: true, checks, artifacts, errors, scope: 'Author-source UI creation/save/reopen only; all permission records pending.' }, null, 2));
  await browser.close(); browser = null;
}
async function generate(p, directory) {
  await p.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/ }).click(); await p.getByRole('radio', { name: directory ? /网页目录 ZIP/ : /单文件 HTML/ }).check();
  if (directory) await p.getByLabel('同时生成制作交付包', { exact: true }).check();
  await p.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click(); await p.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await p.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click(); await p.getByRole('link', { name: directory ? '下载制作交付包' : '下载游戏', exact: true }).waitFor({ timeout: 90000 });
  return download(p, () => p.getByRole('link', { name: directory ? '下载制作交付包' : '下载游戏', exact: true }).click(), path.join(runScratch, directory ? 'verification-production.zip' : 'verification.html'));
}
async function exportAndVerify() {
  runScratch = await mkdtemp(path.join(scratch, 'run-'));
  browser = await engines.chromium.launch({ headless: true }); const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); current = p; p.setDefaultTimeout(25000); watch(p, 'export');
  await p.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(output, 'before-rain-stops-project.zip')); await ready(p); await nav(p, '发布');
  await p.locator('.web-save-compatibility > summary').click(); await p.getByText(/已核对版本：1.7.0/u).waitFor();
  const single = await generate(p, false), production = await generate(p, true), files = unzipSync(production), manifest = json(files['delivery.json']), report = json(files['release/preparation.json']);
  const payload = readGamePayload(single.toString('utf8')), web = readGamePayload(strFromU8(files['game/index.html'])); assert.deepEqual(payload.project, oldPayload.project); assert.deepEqual(web.project, oldPayload.project);
  assert.equal(report.totalAssets, 25); assert.equal(report.documentedAssets, 0); assert.equal(report.pendingAssets, 25); assert.equal(report.deploymentUrl, null); assert.equal(report.publicDeployment, 'not-verified'); assert.equal(report.gameProjectDigest, manifest.gameProjectDigest); assert.equal(report.sourceProjectDigest, manifest.sourceProjectDigest);
  await inspectSource(files['source/project.zip']);
  for (const file of manifest.files) { assert.equal(file.byteLength, files[file.path].length); assert.equal(file.digest, `sha256:${sha(files[file.path])}`); }
  assert.equal(payload.project.manifest.preservedFields.webAssetSources, undefined); assert.equal(web.project.manifest.preservedFields.webAssetSources, undefined);
  // Runtime code knows the reserved key in order to exclude it from identity. Its literal is not author data.
  const forbidden = ['voice-revision-v1.7.json', '适用工具条款', '确认人/日期'];
  for (const [name, data] of Object.entries(files)) if (name.startsWith('game/') && /\.(html|json|txt|js)$/u.test(name)) { const text = strFromU8(data); for (const word of forbidden) assert.ok(!text.includes(word), `${name} leaked ${word}`); }
  for (const word of forbidden) assert.ok(!single.toString('utf8').includes(word));
  assert.ok(strFromU8(files['开始使用.txt']).includes('source、release、review')); assert.ok(manifest.files.some(row => row.path === 'release/preparation.json'));
  const build = json(files['game/build-info.json']); assert.ok(build.files.every(row => !/^(source|release|review)\//u.test(row.path)));
  await writeFile(path.join(output, 'preparation.json'), JSON.stringify(report, null, 2));
  const served = new Map(Object.entries(files).filter(([name]) => name.startsWith('game/')).map(([name, bytes]) => ['/' + name, bytes])); served.set('/single/index.html', single);
  server = createServer((request, response) => { const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname), bytes = served.get(pathname); const mime = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json' }[path.extname(pathname)] ?? 'application/octet-stream'; response.writeHead(bytes ? 200 : 404, { 'Content-Type': mime, 'Cache-Control': 'no-store' }).end(bytes ?? 'Missing'); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const format of ['single', 'game']) { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }), player = await c.newPage(); current = player; watch(player, format); await player.goto(`http://127.0.0.1:${server.address().port}/${format}/index.html`); await player.getByRole('button', { name: '开始故事', exact: true }).click(); await player.locator('main.player-shell[data-player-status="presenting"]').waitFor(); await player.waitForFunction(() => !document.querySelector('[data-stage-images-pending="true"]')); await player.getByRole('button', { name: '继续下一句', exact: true }).click(); assert.ok(await player.locator('main.player-shell').getAttribute('data-runtime-state-hash')); await shot(player, `${format}-private-ledger-not-in-game`); await c.close(); }
  artifacts.verification = { html: { byteLength: single.length, sha256: sha(single) }, production: { byteLength: production.length, sha256: sha(production) }, storedIn: `${path.relative(root, runScratch)} (not a new public game release)` };
  check('actual-both-game-exports-have-identical-public-project-and-verified-1.7.0-receipt-private-report-in-delivery-only', { productionFiles: manifest.files.length, originalStoryAnd25MediaPreserved: true, publicFilesCheckedForPrivateLeak: true });
  await p.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  // A fresh browser profile represents another author machine; no database or optional review state is inherited.
  await browser.close(); browser = await engines.chromium.launch({ headless: true }); const restored = await browser.newPage(); current = restored; watch(restored, 'delivery-restore');
  await restored.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await restored.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(runScratch, 'verification-production.zip')); await ready(restored); await nav(restored, '发布'); await open(restored); await choose(restored, '林远·合成语音04'); assert.equal(await restored.getByLabel('来源事实', { exact: true }).inputValue(), facts.find(row => row.assetId === 'voice_04').source); await dialog(restored).getByRole('button', { name: '取消', exact: true }).click();
  check('production-delivery-import-in-fresh-author-profile-restores-private-provenance'); await browser.close(); browser = null; await new Promise(resolve => server.close(resolve)); server = null;
}
async function authorMatrix(engine) {
  browser = await engines[engine].launch({ headless: true }); const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }), p = await c.newPage(); current = p; p.setDefaultTimeout(25000); watch(p, engine);
  await p.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(output, 'before-rain-stops-project.zip')); await ready(p); await nav(p, '发布');
  await p.getByLabel('发布名称', { exact: true }).fill('未应用名称'); await p.waitForFunction(() => document.querySelector('.publication-step-panel:not([hidden]) .web-release-preparation button')?.disabled === true); assert.equal(await p.getByRole('button', { name: '核对素材来源', exact: true }).isDisabled(), true); await p.getByRole('button', { name: '放弃修改', exact: true }).click(); await open(p); await fit(dialog(p));
  await choose(p, '雨后的海边街道'); const old = await p.getByLabel('来源事实', { exact: true }).inputValue(); await p.getByLabel('来源事实', { exact: true }).fill(old + '\nPRIVATE_TEST_DRAFT'); await choose(p, '白天的面馆'); await choose(p, '雨后的海边街道'); assert.equal(await p.getByLabel('来源事实', { exact: true }).inputValue(), old + '\nPRIVATE_TEST_DRAFT');
  await p.keyboard.press('Escape'); await dialog(p).getByRole('alert').getByText(/尚未应用/).waitFor(); assert.equal(await p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '故事', exact: true }).isDisabled(), true); await shot(p, `${engine}-mobile-draft-protected`); await dialog(p).getByRole('button', { name: '放弃修改', exact: true }).click(); await open(p); assert.equal(await p.getByLabel('来源事实', { exact: true }).inputValue(), old);
  await p.setViewportSize({ width: 844, height: 390 }); await fit(dialog(p)); await shot(p, `${engine}-landscape-source-ledger`); await p.setViewportSize({ width: 390, height: 844 }); await dialog(p).getByRole('button', { name: '前往替换此素材', exact: true }).click();
  await p.getByLabel('选择资源文件', { exact: true }).waitFor({ state: 'attached' }); assert.equal(await p.getByLabel('资源 Asset ID', { exact: true }).inputValue(), 'coastal_morning'); await p.getByLabel('选择资源文件', { exact: true }).setInputFiles(path.join(assetDir, 'night-cafe.png')); await p.getByRole('button', { name: '更新此资源', exact: true }).click(); await p.getByText('资源导入完成', { exact: true }).waitFor(); await p.keyboard.press('Escape');
  await p.getByRole('button', { name: '返回生成游戏', exact: true }).click(); await open(p); await choose(p, '雨后的海边街道'); await p.getByText(/旧记录对应/u).waitFor(); assert.equal(await p.getByLabel('来源事实', { exact: true }).isDisabled(), true); await shot(p, `${engine}-replacement-requires-recheck`);
  await dialog(p).getByRole('button', { name: '为当前文件重新核对', exact: true }).click(); assert.equal(await p.getByLabel('发行条件状态', { exact: true }).inputValue(), 'pending'); assert.equal(await p.getByLabel('确认日期', { exact: true }).inputValue(), ''); await dialog(p).getByRole('button', { name: '应用来源台账', exact: true }).click(); await saveAndReopen(p); await nav(p, '发布'); await open(p); await choose(p, '雨后的海边街道'); assert.equal(await p.getByLabel('来源事实', { exact: true }).isEnabled(), true); await dialog(p).getByRole('button', { name: '取消', exact: true }).click();
  check(`${engine}-author-drafts-rotate-replace-invalidates-recheck-save-reopen`, { desktopEngine: browser.version(), responsiveTouchEmulationOnly: true, publicPermissionReview: false }); results.push({ engine, version: browser.version(), passed: true }); await browser.close(); browser = null;
}
try {
  if (process.argv.includes('--audit-only')) {
    const sourceBytes = await readFile(path.join(output, 'before-rain-stops-project.zip')); await inspectSource(sourceBytes);
    const report = json(await readFile(path.join(output, 'preparation.json'))); assert.equal(report.totalAssets, 25); assert.equal(report.pendingAssets, 25); assert.equal(report.documentedAssets, 0); assert.equal(report.publicDeployment, 'not-verified'); assert.equal(report.deploymentUrl, null);
    assert.deepEqual(report.assets.map(row => row.record).sort((a, b) => a.assetId.localeCompare(b.assetId)), facts.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)));
    await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify({ passed: true, source: { byteLength: sourceBytes.length, sha256: sha(sourceBytes) }, assets: 25, identicalNonManifestEntries: Object.keys(original).length - 1, publicCandidate: '1.7.1 unchanged at evidence/web-mobile-continuity', factsMatchRepositoryMedia: true, permissionConfirmed: 0, deploymentVerified: false }, null, 2));
    console.log('PASS source-only ledger and all 25 exact media facts; no permission/deployment acceptance');
    process.exitCode = 0;
  } else {
  if (!process.argv.includes('--reuse-source')) await releaseAuthorSource(); else await inspectSource(await readFile(path.join(output, 'before-rain-stops-project.zip')));
  if (!process.argv.includes('--matrix-only')) await exportAndVerify();
  const selected = (process.env.STUDIO_BROWSER_ENGINES ?? 'chromium,firefox,webkit').split(','); for (const engine of selected) { assert.ok(['chromium', 'firefox', 'webkit'].includes(engine)); await authorMatrix(engine); }
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, matrixComplete: results.length === 3, sourceReused: process.argv.includes('--reuse-source'), exportAndDeliveryChecked: !process.argv.includes('--matrix-only'), checks, errors, artifacts, results, scope: 'Only checks listed above executed this run. Actual author provenance and responsive replacement on desktop engines; not legal approval, public deployment, physical phones, full reading or offline/update-chain acceptance. Verification games are scratch artifacts; public 1.7.1 is unchanged.' }, null, 2));
  }
} catch (error) { await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ checks, errors, error: String(error), stack: error.stack }, null, 2)); if (current && !current.isClosed()) await shot(current, 'failure'); throw error; }
finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';

const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-mobile-continuity'), scratch = path.join(root, '.browser-diagnostic/mobile-continuity');
await mkdir(output, { recursive: true }); await mkdir(scratch, { recursive: true });
const previousPath = path.join(root, 'evidence/web-story-beats/before-rain-stops-project.zip');
const previous = unzipSync(await readFile(previousPath)), oldDirectory = unzipSync(await readFile(path.join(root, 'evidence/web-story-beats/before-rain-stops-web.zip')));
const checks = [], errors = [], results = []; let browser, current, server, files;
const watch = (p, label) => p.on('pageerror', error => errors.push(`${label}: ${error.message}`));
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const ready = p => p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const main = p => p.locator('main.player-shell');
const hash = p => main(p).getAttribute('data-runtime-state-hash');
const nav = (p, name) => p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const menu = p => p.getByRole('button', { name: '打开阅读菜单', exact: true }).click();
async function projectMenu(p, name) { await ready(p); if (!await p.locator('.project-switcher').evaluate(el => el.open)) await p.getByLabel('项目菜单', { exact: true }).click(); await p.getByRole('button', { name: new RegExp(name) }).click(); }
async function download(p, trigger, destination) { const pending = p.waitForEvent('download'); await trigger(); const bytes = await readFile(await (await pending).path()); await writeFile(destination, bytes); return bytes; }
async function fit(p, selector) {
  const rect = await p.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, scroll: el.scrollWidth, client: el.clientWidth }; });
  assert.ok(rect.x >= -1 && rect.right <= rect.width + 1 && rect.y >= -1 && rect.bottom <= rect.height + 1 && rect.scroll <= rect.client + 1, JSON.stringify(rect));
}
async function generate(p, directory) {
  if (!directory) { await nav(p, '发布'); await p.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); }
  else await p.getByRole('button', { name: '← 导出方式', exact: true }).click();
  await p.getByRole('radio', { name: directory ? /网页目录 ZIP/ : /单文件 HTML/ }).check(); await p.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await p.getByText('故事与素材检查通过', { exact: true }).waitFor(); await p.getByRole('button', { name: directory ? '构建目录 ZIP' : '构建试玩 HTML', exact: true }).click();
  await p.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 90000 });
  await download(p, () => p.getByRole('link', { name: '下载游戏', exact: true }).click(), path.join(output, directory ? 'before-rain-stops-web.zip' : 'before-rain-stops.html'));
}
async function authorRelease() {
  browser = await engines.chromium.launch({ headless: true }); const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); current = p; watch(p, 'release'); p.setDefaultTimeout(25000);
  await p.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(previousPath); await ready(p);
  await nav(p, '检查'); await p.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(root, 'evidence/web-story-beats/before-rain-stops.worldreview'));
  const board = p.getByRole('region', { name: '试玩校订清单' }); await board.getByRole('button', { name: '全部 11', exact: true }).waitFor();
  await download(p, () => board.getByRole('button', { name: '导出校订记录', exact: true }).click(), path.join(output, 'before-rain-stops.worldreview'));
  await nav(p, '发布'); await p.getByLabel('发布版本', { exact: true }).fill('1.7.1'); await p.getByRole('button', { name: '应用发布设置', exact: true }).click(); await ready(p);
  await p.locator('.web-save-compatibility > summary').click(); await p.getByLabel('核对上一版工程 ZIP', { exact: true }).setInputFiles(previousPath);
  await p.getByText(/已核对版本：1.7.0/u).waitFor(); await ready(p); await shot(p, 'verified-1.7-compatibility');
  await projectMenu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await p.reload(); await p.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready(p);
  await download(p, () => projectMenu(p, '导出工程 ZIP'), path.join(output, 'before-rain-stops-project.zip')); await generate(p, false); await generate(p, true);
  check('release-ui-saved-reopened-exported-1.7.1-with-verified-1.7.0'); await browser.close(); browser = null;
  await writeFile(path.join(output, 'release-checks.json'), JSON.stringify({ passed: true, checks, errors, humanReviewNotesUnchanged: true }, null, 2));
}
async function auditArtifacts() {
  const sourceBytes = await readFile(path.join(output, 'before-rain-stops-project.zip')), source = unzipSync(sourceBytes), htmlBytes = await readFile(path.join(output, 'before-rain-stops.html')), webBytes = await readFile(path.join(output, 'before-rain-stops-web.zip'));
  files = unzipSync(webBytes); assert.deepEqual(Object.keys(source).sort(), Object.keys(previous).sort());
  for (const [name, bytes] of Object.entries(previous)) if (name !== 'world.project.json') { assert.equal(source[name].length, bytes.length, name); assert.equal(sha(source[name]), sha(bytes), name); }
  const manifest = json(source['world.project.json']), oldManifest = json(previous['world.project.json']); assert.equal(manifest.webPublication.version, '1.7.1'); assert.deepEqual(manifest.webSaveCompatibility.versions, ['1.7.0']);
  assert.match(manifest.webSaveCompatibility.fingerprint, /^[a-f\d]{64}$/u);
  assert.deepEqual({ ...manifest, webPublication: oldManifest.webPublication, webSaveCompatibility: oldManifest.webSaveCompatibility }, oldManifest);
  assert.deepEqual({ ...manifest.webPublication, version: oldManifest.webPublication.version }, oldManifest.webPublication);
  const inline = readGamePayload(htmlBytes.toString('utf8')), web = readGamePayload(Buffer.from(files['index.html']).toString('utf8')); assert.deepEqual(inline.project, web.project);
  assert.equal(web.project.manifest.preservedFields.webPublication.version, '1.7.1');
  for (const [name, bytes] of Object.entries(source)) if (name.startsWith('scripts/')) { const script = json(bytes); assert.deepEqual(web.project.scripts[script.sceneId], script); }
  for (const asset of json(source['.world-assets/index.json']).assets) {
    assert.equal(`sha256:${sha(Buffer.from(inline.mediaAssets.find(a => a.assetId === asset.assetId).url.split(',')[1], 'base64'))}`, asset.source.digest);
    assert.equal(`sha256:${sha(files[web.mediaAssets.find(a => a.assetId === asset.assetId).url])}`, asset.source.digest);
  }
  for (const entry of json(files['build-info.json']).files) { assert.equal(files[entry.path].length, entry.byteLength); assert.equal(`sha256:${sha(files[entry.path])}`, entry.digest); }
  assert.deepEqual(json(files['save-compatibility.json']).verifiedVersions, ['1.7.0']);
  assert.deepEqual(json(await readFile(path.join(output, 'before-rain-stops.worldreview'))), json(await readFile(path.join(root, 'evidence/web-story-beats/before-rain-stops.worldreview'))));
  const report = { passed: true, sourceContentAndAll25MediaUnchanged: true, reviewNotesUnchanged: 11, verifiedPreviousVersions: ['1.7.0'], canonicalSourceHtmlDirectoryMatch: true, artifacts: Object.fromEntries([['source', sourceBytes], ['html', htmlBytes], ['directory', webBytes]].map(([kind, bytes]) => [kind, { bytes: bytes.length, sha256: sha(bytes) }])) };
  await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(report, null, 2)); check('exact-unchanged-content-media-notes-and-real-dual-artifacts'); return source;
}
async function baseline() {
  const observations = [];
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    browser = await engines[engine].launch({ headless: true }); const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); current = p;
    await p.goto(pathToFileURL(path.join(root, 'evidence/web-story-beats/before-rain-stops.html')).href); await p.getByRole('button', { name: /^开始故事/u }).click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
    const before = await hash(p); await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
    const imeAdvanced = await hash(p) !== before;
    const pagehide = await p.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); return document.querySelector('main.player-shell').dataset.hostActivity; });
    observations.push({ engine, version: browser.version(), originalArtifact: 'web-story-beats/1.7.0', imeAdvanced, pagehideActivity: pagehide, syntheticBoundaryEvents: true, physicalPhone: false });
    await browser.close(); browser = null;
  }
  assert.ok(observations.every(o => o.imeAdvanced && o.pagehideActivity === 'active'));
  await writeFile(path.join(output, 'baseline.json'), JSON.stringify({ expectedFailuresReproduced: true, observations }, null, 2)); console.log('Baseline: IME and pagehide gaps reproduced in all three original exports');
}
async function editorFlow(engine) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); current = p; p.setDefaultTimeout(25000); watch(p, `${engine}-editor`);
  await p.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/'); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(previousPath); await ready(p);
  await nav(p, '故事'); if (!await p.locator('.scene-rail').isVisible()) await p.getByRole('button', { name: '场景列表', exact: true }).click();
  await p.locator('.scene-rail').getByRole('button').filter({ hasText: '车站的雨' }).click(); await p.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '写作', exact: true }).click();
  await p.locator('#statement-card-stmt_ui_5').click(); const field = p.getByLabel('旁白文本', { exact: true }), original = await field.inputValue();
  const revision = await p.getByTestId('workspace-shell').getAttribute('data-source-revision');
  await field.dispatchEvent('compositionstart', { data: '' }); await field.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true }); await field.dispatchEvent('keydown', { key: '1', altKey: true, keyCode: 229 });
  assert.equal(await p.getByTestId('workspace-shell').getAttribute('data-source-revision'), revision); assert.equal(await p.getByRole('dialog').count(), 0); await field.dispatchEvent('compositionend', { data: '' });
  const changed = `中文接续验证。${original}`; let nativeComposition = null;
  if (engine === 'chromium') {
    const cdp = await p.context().newCDPSession(p); await field.focus(); await field.selectText();
    await field.evaluate(el => { window.imeProbe = []; for (const type of ['compositionstart', 'compositionend', 'input']) el.addEventListener(type, event => window.imeProbe.push({ type, trusted: event.isTrusted, composing: event.isComposing ?? null })); });
    await cdp.send('Input.imeSetComposition', { text: 'zhong', selectionStart: 5, selectionEnd: 5 }); await p.setViewportSize({ width: 844, height: 390 });
    assert.equal(await field.inputValue(), 'zhong'); await cdp.send('Input.insertText', { text: changed }); await cdp.detach();
    nativeComposition = await p.evaluate(() => window.imeProbe);
    assert.ok(nativeComposition.some(e => e.type === 'compositionstart' && e.trusted));
    assert.ok(nativeComposition.some(e => e.type === 'input' && e.trusted && e.composing));
    // Chromium's insertText protocol emits an untrusted compositionend. Record
    // that limitation instead of calling it a complete OS IME/candidate test.
    assert.ok(nativeComposition.some(e => e.type === 'compositionend'));
  } else { await field.fill(changed); await p.setViewportSize({ width: 844, height: 390 }); }
  await p.locator('#statement-card-stmt_ui_5').filter({ hasText: changed }).waitFor();
  await p.getByRole('button', { name: '下一段文字', exact: true }).click(); assert.equal(await p.locator('.writing-text-inspector').getAttribute('data-writing-statement-id'), 'stmt_ui_7');
  await p.setViewportSize({ width: 390, height: 844 }); await shot(p, `${engine}-editor-chinese`);
  await nav(p, '素材'); await p.getByRole('button', { name: '管理素材：林远·合成语音04', exact: true }).click();
  await p.getByLabel('资源显示名称', { exact: true }).dispatchEvent('keydown', { key: 'Escape', isComposing: true }); assert.equal(await p.getByRole('dialog', { name: '素材管理', exact: true }).count(), 1);
  await p.getByLabel('资源显示名称', { exact: true }).press('Escape');
  await projectMenu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await p.reload(); await p.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready(p);
  const zip = unzipSync(await download(p, () => projectMenu(p, '导出工程 ZIP'), path.join(scratch, `${engine}-edited-project.zip`)));
  for (const [name, bytes] of Object.entries(previous)) {
    if (name === 'scripts/scene_87825610ea97b89eeea8.json') { const script = json(bytes); script.statements.find(s => s.id === 'stmt_ui_5').text = changed; assert.deepEqual(json(zip[name]), script); }
    else assert.equal(sha(zip[name]), sha(bytes), name);
  }
  check(`${engine}-editor-ime-shortcuts-rotation-chinese-save-reopen-and-all-media`, { nativeComposition, systemPhoneKeyboard: false }); await p.close();
}
async function quickSave(p) { await menu(p); await p.getByRole('button', { name: '快速保存', exact: true }).click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved'); }
async function quickLoad(p) {
  await p.getByRole('button', { name: '读取存档', exact: true }).click(); const panel = p.getByRole('dialog', { name: '存读档槽位' }); await panel.getByRole('button', { name: '快速', exact: true }).click(); await panel.getByRole('button', { name: '读取', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded');
}
async function playerRoute(engine, branch, source) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(engine === 'firefox' ? {} : { isMobile: true }), reducedMotion: 'reduce' });
  const p = await context.newPage(); current = p; p.setDefaultTimeout(25000); watch(p, `${engine}-${branch}`);
  const url = `http://127.0.0.1:${server.address().port}/gal/`, stay = branch === '留下等雨停', name = `${engine}-${stay ? 'stay' : 'leave'}`;
  await p.goto(url); await p.getByRole('button', { name: /^开始故事/u }).tap(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
  const initial = await hash(p); await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))); assert.equal(await hash(p), initial);
  await menu(p);
  const viewports = [{ width: 360, height: 800 }, { width: 430, height: 932 }, { width: 844, height: 390 }];
  for (const viewport of viewports) { await p.setViewportSize(viewport); await fit(p, '.player-control-layer[data-open="true"]'); assert.equal(await hash(p), initial); }
  await p.getByRole('button', { name: '返回故事', exact: true }).tap(); assert.equal(await hash(p), initial); await p.setViewportSize({ width: 390, height: 844 });
  await menu(p); await p.getByRole('button', { name: '打开玩家设置', exact: true }).click(); const prefs = p.getByRole('dialog', { name: '玩家设置' });
  await prefs.getByRole('slider', { name: '个人字号', exact: true }).focus(); await p.keyboard.press('End'); await prefs.getByRole('button', { name: '返回故事', exact: true }).click();
  const reading = p.getByRole('button', { name: '继续下一句', exact: true });
  if (await reading.evaluate(el => el.scrollHeight > el.clientHeight + 2)) { await reading.tap(); assert.equal(await hash(p), initial); }
  // A dragged surface is not a tap. These are explicit boundary events, not a physical finger/phone claim.
  await reading.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 500 }); await reading.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 100, clientY: 420 }); await reading.dispatchEvent('click', { detail: 1 }); assert.equal(await hash(p), initial);
  const lifecycle = await p.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); const shell = document.querySelector('main.player-shell');
    const hidden = shell.dataset.hostActivity, before = shell.dataset.runtimeStateHash; document.querySelector('.player-dialogue').click(); const tapBlocked = shell.dataset.runtimeStateHash === before;
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); return { hidden, tapBlocked, resumed: shell.dataset.hostActivity, simulatedPageTransition: true };
  }); assert.deepEqual(lifecycle, { hidden: 'suspended', tapBlocked: true, resumed: 'active', simulatedPageTransition: true });
  let nativeFreeze = null;
  if (engine === 'chromium' && stay) {
    const events = []; await p.exposeFunction('freezeObservation', value => events.push(value));
    await p.evaluate(() => document.addEventListener('freeze', event => window.freezeObservation({ trusted: event.isTrusted, activity: document.querySelector('main.player-shell').dataset.hostActivity, paused: [...document.querySelectorAll('audio')].every(a => a.paused) })));
    const cdp = await context.newCDPSession(p); await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await new Promise(resolve => setTimeout(resolve, 300)); await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.hostActivity === 'active'); await cdp.detach();
    // Some headless Chromium builds accept setWebLifecycleState but emit no
    // lifecycle events. That is unavailable native coverage, not a pass.
    if (events.length) assert.ok(events.some(e => e.trusted && e.activity === 'suspended' && e.paused));
    nativeFreeze = { attempted: true, events, observed: events.length > 0, acceptedAsNativeCoverage: events.length > 0 }; assert.equal(await hash(p), initial);
  }
  await shot(p, `${name}-large-reading`); await quickSave(p);
  await p.evaluate(() => window.addEventListener('pagehide', event => {
    const shell = document.querySelector('main.player-shell'), audio = [...document.querySelectorAll('audio')];
    sessionStorage.setItem('world-navigation-probe', JSON.stringify({ trusted: event.isTrusted, persisted: event.persisted, mounted: !!shell, activity: shell?.dataset.hostActivity ?? 'unmounted', paused: audio.every(a => a.paused), mediaNodes: audio.length }));
  }, { once: true }));
  await p.goto(`http://127.0.0.1:${server.address().port}/away`);
  const navigationPagehide = await p.evaluate(() => JSON.parse(sessionStorage.getItem('world-navigation-probe')));
  assert.equal(navigationPagehide.trusted, true); assert.equal(navigationPagehide.paused, true);
  if (navigationPagehide.persisted) assert.equal(navigationPagehide.activity, 'suspended');
  else { assert.equal(navigationPagehide.mounted, false); assert.equal(navigationPagehide.mediaNodes, 0); }
  await p.goBack();
  let navigationReturn = 'retained-document';
  if (await main(p).getAttribute('data-player-status') === 'title') { await quickLoad(p); navigationReturn = 'reload-and-explicit-save-read'; }
  assert.equal(await hash(p), initial);
  await p.reload(); await quickLoad(p); assert.equal(await hash(p), initial);
  const byText = new Map(Object.keys(source).filter(k => k.startsWith('scripts/')).flatMap(k => json(source[k]).statements).filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
  const visited = [], voices = new Set();
  for (let steps = 0; steps < 550 && await main(p).getAttribute('data-player-status') !== 'ended'; steps++) {
    if (await p.locator('.player-choice button').count()) { await p.locator('.player-choice').getByRole('button', { name: branch, exact: true }).tap(); continue; }
    await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
    const s = byText.get((await p.locator('.player-dialogue__text').innerText()).trim()); assert.ok(s);
    if (visited.at(-1) !== s.id) visited.push(s.id);
    if (await p.locator('audio[data-audio-bus="voice"]').count()) { const asset = await p.locator('audio[data-audio-bus="voice"]').getAttribute('data-asset-id'); if (!voices.has(asset)) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(asset); } }
    const ratio = await p.locator('.player-stage-world').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; }); assert.ok(Math.abs(ratio - 16 / 9) < .01);
    await p.getByRole('button', { name: '继续下一句', exact: true }).tap(); await p.waitForTimeout(40);
  }
  const sceneNames = ['车站的雨', '候车室的旧信', '站台前的约定', ...(stay ? ['留下', '灯下的回信', '雨后的天明'] : ['远行', '车窗与海', '再一次见面'])];
  const scenes = Object.keys(source).filter(k => k.startsWith('scenes/')).map(k => json(source[k]));
  assert.deepEqual(visited, sceneNames.flatMap(name => json(source[scenes.find(s => s.title === name).scriptPath]).statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => s.id)));
  assert.equal(voices.size, 6); assert.match(await p.locator('.player-ending').innerText(), new RegExp(stay ? '同行的约定' : '远行的约定')); assert.equal(await p.locator('audio').count(), 0); await shot(p, `${name}-ending`);
  results.push({ engine, version: browser.version(), branch, viewports: [{ width: 390, height: 844 }, ...viewports], textsInExactOrder: visited.length, naturallyEndedVoices: 6, lifecycle, nativeFreeze, navigationPagehide, navigationReturn, quickSaveReload: true, physicalPhone: false, humanListening: false });
  check(`${name}-touch-rotation-large-text-lifecycle-save-and-full-ending`); await context.close();
}
async function oldBackup(engine) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), p = await context.newPage(); current = p; watch(p, `${engine}-old-save`);
  await p.goto(`http://127.0.0.1:${server.address().port}/old/`); await p.getByRole('button', { name: /^开始故事/u }).click(); await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
  const before = await hash(p); await menu(p); await p.getByRole('button', { name: '存读档', exact: true }).click(); let slots = p.getByRole('dialog', { name: '存读档槽位' });
  await slots.getByRole('button', { name: '备份', exact: true }).click(); await slots.getByLabel('备份进度', { exact: true }).selectOption('current');
  const bytes = await download(p, () => slots.getByRole('button', { name: '导出备份文件', exact: true }).click(), path.join(scratch, `${engine}-1.7.0.worldsave`));
  await p.goto(`http://127.0.0.1:${server.address().port}/gal/`); await p.getByRole('button', { name: '读取存档', exact: true }).click(); slots = p.getByRole('dialog', { name: '存读档槽位' });
  await slots.getByRole('button', { name: '备份', exact: true }).click(); await slots.getByLabel('选择存档备份文件', { exact: true }).setInputFiles({ name: 'old.worldsave', mimeType: 'application/json', buffer: bytes });
  await slots.getByRole('button', { name: '导入到所选槽位', exact: true }).click();
  await slots.getByRole('button', { name: '读取导入的存档', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded'); assert.equal(await hash(p), before);
  await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
  const recovery = p.getByRole('button', { name: '恢复声音', exact: true }); if (await recovery.isVisible()) await recovery.click();
  await p.waitForFunction(() => { const audio = [...document.querySelectorAll('audio')]; return audio.length === 2 && audio.every(a => !a.paused && a.currentTime > 0 && !a.error); });
  assert.equal(await hash(p), before);
  const media = await p.locator('audio').evaluateAll(items => items.map(a => ({ bus: a.dataset.audioBus, playing: !a.paused && a.currentTime > 0, failed: !!a.error })));
  await shot(p, `${engine}-compatible-old-save`); check(`${engine}-actual-1.7.0-backup-import-and-read-same-hash`, { stageReady: true, media }); await context.close();
}
try {
  if (process.argv.includes('--baseline')) await baseline();
  else if (process.argv.includes('--audit-only')) await auditArtifacts();
  else {
    if (!process.argv.includes('--play-only') && !process.argv.includes('--reuse-artifacts')) await authorRelease(); const source = await auditArtifacts();
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    server = createServer((req, res) => { const url = new URL(req.url, 'http://local'); if (url.pathname === '/away') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>Temporary other page</title><p>Return with browser Back.</p>'); return; } const old = url.pathname.startsWith('/old/'), key = decodeURIComponent(url.pathname).replace(/^\/(old|gal)\//u, '') || 'index.html', bytes = (old ? oldDirectory : files)[key]; res.writeHead(bytes ? 200 : 404, { 'Content-Type': types[path.extname(key)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes ?? 'Missing'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const selected = process.env.STUDIO_BROWSER_ENGINES?.split(',') ?? ['chromium', 'firefox', 'webkit'];
    assert.ok(selected.length && selected.every(engine => ['chromium', 'firefox', 'webkit'].includes(engine)));
    for (const engine of selected) {
      browser = await engines[engine].launch({ headless: true });
      if (!process.argv.includes('--play-only')) await editorFlow(engine);
      await playerRoute(engine, '留下等雨停', source); await playerRoute(engine, '去追最后一班车', source); await oldBackup(engine);
      await browser.close(); browser = null;
    }
    assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, matrixComplete: new Set(selected).size === 3, playOnly: process.argv.includes('--play-only'), reusedArtifacts: process.argv.includes('--reuse-artifacts'), checks, errors, routes: results, scope: 'Desktop browser engines with responsive/touch automation; Chromium protocol composition start/input trusted but end untrusted; protocol freeze only counted if emitted; other IME/page transitions explicitly synthetic; real HTTP navigation and saves; no physical phone, OS keyboard, low-memory, public deploy, human timing/listening or full offline-upgrade acceptance' }, null, 2));
  }
} catch (error) { const name = `failure-${new Date().toISOString().replace(/[:.]/gu, '-')}`; if (current && !current.isClosed()) await shot(current, name).catch(() => {}); await writeFile(path.join(output, `${name}.json`), JSON.stringify({ checks, errors, failure: error.stack }, null, 2)); throw error; }
finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }

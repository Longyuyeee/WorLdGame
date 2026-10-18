import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { readGamePayload } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-source-review');
const url = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', require = createRequire(import.meta.url);
let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const source = path.join(root, 'evidence/web-reading-throughput/before-rain-stops-project.zip');
const original = unzipSync(await readFile(source)), json = bytes => JSON.parse(strFromU8(bytes)), manifest = json(original['world.project.json']);
const assets = json(original['.world-assets/index.json']).assets, first = assets[0], second = assets[1];
const byId = new Map(manifest.webAssetSources.records.map(row => [row.assetId, row]));
const marker = 'PRIVATE_WORKFLOW_ONLY_374', checks = [], errors = [], results = [], artifacts = {};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
const button = (p, name) => p.getByRole('button', { name, exact: true });
const dialog = p => p.getByRole('dialog', { name: '素材来源与发行准备', exact: true });
const ready = p => p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const nav = (p, name) => p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const field = (p, name) => dialog(p).getByLabel(name, { exact: true });
async function choose(p, asset) {
  const toggle = dialog(p).getByRole('button', { name: /^选择其他素材/u }); if (await toggle.isVisible()) await toggle.click();
  await dialog(p).getByRole('group', { name: '选择来源素材', exact: true }).getByRole('button', { name: new RegExp(`^${asset.displayName}`) }).click();
}
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function fit(p) {
  // Resizing can report the new viewport before CSS viewport units and dialog centering settle.
  await p.waitForFunction(() => {
    const el = document.querySelector('.web-sources-editor'), r = el?.getBoundingClientRect();
    return r && r.x >= -1 && r.right <= innerWidth + 1 && r.y >= -1 && r.bottom <= innerHeight + 1;
  });
  const r = await dialog(p).evaluate(async el => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, w: innerWidth, h: innerHeight, client: el.clientWidth, scroll: el.scrollWidth }; });
  assert.ok(r.x >= -1 && r.right <= r.w + 1 && r.y >= -1 && r.bottom <= r.h + 1 && r.scroll <= r.client + 1, JSON.stringify(r));
  for (const name of ['应用来源台账', '应用并核对下一项']) {
    const box = await button(p, name).boundingBox(); assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= r.w + 1 && box.y >= 0 && box.y + box.height <= r.h + 1, `${name}: ${JSON.stringify(box)}`);
  }
}
async function download(p, action) { const pending = p.waitForEvent('download'); await action(); return readFile(await (await pending).path()); }
async function menu(p, name) {
  await ready(p); if (!await p.locator('.project-switcher').evaluate(el => el.open)) await p.getByLabel('项目菜单', { exact: true }).click();
  await p.getByRole('button', { name: new RegExp(name) }).click();
}
async function queue(p, label) {
  const prep = p.locator('.publication-step-panel:not([hidden]) .web-release-preparation');
  if (!await prep.locator('.web-source-review-queue').evaluate(el => el.open)) await prep.getByText(/按问题处理素材/).click();
  await prep.getByRole('button', { name: label, exact: true }).click();
}
async function saveReopen(p) {
  await ready(p); await p.locator('.local-save-button').click(); await p.locator('.local-save-button--saved').waitFor();
  await menu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await p.reload();
  await button(p, '打开项目：雨停之前').click(); await ready(p); await nav(p, '发布');
}
async function generate(p, format) {
  await p.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/ }).click();
  await p.locator(`input[name="publication-format"][value="${format}"]`).check(); await p.getByLabel('同时生成制作交付包', { exact: true }).check();
  await button(p, '继续：生成游戏 →').click(); await p.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await button(p, format === 'html' ? '构建试玩 HTML' : '构建目录 ZIP').click(); await p.getByRole('link', { name: '下载制作交付包', exact: true }).waitFor({ timeout: 90000 });
  return download(p, () => p.getByRole('link', { name: '下载制作交付包', exact: true }).click());
}
await mkdir(output, { recursive: true });
const dist = path.join(root, 'apps/editor/dist'), html = await readFile(path.join(dist, 'index.html'), 'utf8');
assert.equal(await (await fetch(url)).text(), html, 'Preview must be this build');
artifacts.editor = {};
for (const entry of [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)].map(match => match[1])) {
  const bytes = await readFile(path.join(dist, entry)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(entry, url))).arrayBuffer())), sha(bytes)); artifacts.editor[entry] = sha(bytes);
}
const temporary = await mkdtemp(path.join(tmpdir(), 'world-source-review-'));
let browser, current;
try {
  const selectedEngines = (process.env.STUDIO_BROWSER_ENGINES ?? 'chromium,firefox,webkit').split(',');
  for (const engine of selectedEngines) {
    assert.ok(['chromium', 'firefox', 'webkit'].includes(engine)); browser = await engines[engine].launch({ headless: true });
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); current = p; p.setDefaultTimeout(25000); p.on('pageerror', error => errors.push(`${engine}: ${error.message}`));
    await p.goto(url); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(source); await ready(p); await nav(p, '发布');
    await queue(p, '待确认发行条件 · 25 项'); assert.equal(await field(p, '筛选处理事项').inputValue(), 'pending');
    assert.equal(await dialog(p).getByRole('heading', { level: 3 }).innerText(), first.displayName);
    await field(p, '发行条件状态').selectOption('documented'); await button(p, '下一项待处理（全部素材）').click();
    assert.equal(await dialog(p).getByRole('heading', { level: 3 }).innerText(), second.displayName);
    await field(p, '确认依据').fill(marker); await field(p, '搜索素材').fill(second.assetId); await button(p, '应用来源台账').click();
    assert.ok((await dialog(p).getByRole('alert').innerText()).includes(`${first.displayName}：请补齐确认依据、确认人、确认日期`));
    assert.equal(await field(p, '确认依据').evaluate(el => el === document.activeElement), true); assert.equal(await field(p, '搜索素材').inputValue(), '');
    for (const size of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await p.setViewportSize(size); await fit(p); await button(p, '应用来源台账').click();
      const located = await field(p, '确认依据').evaluate(el => { const r = el.getBoundingClientRect(), body = el.closest('.web-credits-editor__body').getBoundingClientRect(); return { focused: el === document.activeElement, visible: r.top >= body.top - 1 && r.bottom <= body.bottom + 1 }; });
      assert.deepEqual(located, { focused: true, visible: true }); await shot(p, `${engine}-error-${size.width}x${size.height}`);
    }
    await button(p, '保留填写，改为待确认').click(); await button(p, '应用并核对下一项').click();
    assert.equal(await dialog(p).getByRole('heading', { level: 3 }).innerText(), second.displayName); assert.equal(await field(p, '确认依据').inputValue(), marker);
    assert.equal(await p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '故事', exact: true }).isDisabled(), true);
    assert.equal(await p.locator('.local-save-button').isDisabled(), true); assert.equal(await dialog(p).getByRole('heading', { level: 3 }).evaluate(el => el === document.activeElement), true);
    await field(p, '来源事实').fill('这个草稿要放弃'); await p.keyboard.press('Escape'); await dialog(p).getByRole('alert').getByText(/尚未应用/).waitFor(); await dialog(p).getByRole('button', { name: '放弃修改', exact: true }).click();
    await button(p, '核对素材来源').click(); await choose(p, second); assert.equal(await field(p, '确认依据').inputValue(), marker); assert.equal(await field(p, '来源事实').inputValue(), byId.get(second.assetId).source); await dialog(p).getByRole('button', { name: '取消', exact: true }).click();
    await saveReopen(p); await queue(p, '待确认发行条件 · 25 项'); await choose(p, second); assert.equal(await field(p, '确认依据').inputValue(), marker);
    await field(p, '发行条件状态').selectOption('replace'); await button(p, '应用来源台账').click(); await queue(p, '需要替换素材 · 1 项'); await button(p, '前往替换此素材').click();
    await p.getByLabel('选择资源文件', { exact: true }).waitFor({ state: 'attached' });
    await p.waitForFunction(assetId => { const input = document.querySelector('input[aria-label="资源 Asset ID"]'); return input?.value === assetId && input.disabled; }, second.assetId);
    assert.equal(await p.getByLabel('资源 Asset ID', { exact: true }).inputValue(), second.assetId); await p.keyboard.press('Escape'); await button(p, '返回生成游戏').click();
    await queue(p, '需要替换素材 · 1 项'); await field(p, '发行条件状态').selectOption('pending'); await button(p, '应用来源台账').click();
    await p.setViewportSize({ width: 390, height: 844 }); const queueDetails = p.locator('.publication-step-panel:not([hidden]) .web-source-review-queue'); if (!await queueDetails.evaluate(el => el.open)) await queueDetails.locator('summary').click(); await queueDetails.locator('summary').scrollIntoViewIfNeeded(); await shot(p, `${engine}-release-queue`);
    check(`${engine}-current-work-grouped-entry-hidden-error-three-viewports-apply-continue-discard-save-reopen-replacement-return`, { engineVersion: browser.version(), pending: 25, permissionConfirmed: 0 });
    if (engine === 'chromium') {
      await p.setViewportSize({ width: 1440, height: 1000 }); await saveReopen(p);
      const exported = await download(p, () => menu(p, '导出工程 ZIP')), files = unzipSync(exported), actual = json(files['world.project.json']);
      assert.deepEqual(Object.keys(files).sort(), Object.keys(original).sort());
      for (const [name, bytes] of Object.entries(original)) if (name !== 'world.project.json') assert.equal(sha(files[name]), sha(bytes), name);
      const { webAssetSources: actualBook, ...rest } = actual, { webAssetSources: originalBook, ...originalRest } = manifest; assert.deepEqual(rest, originalRest);
      const expected = originalBook.records.map(row => row.assetId === second.assetId ? { ...row, evidence: marker } : row), sort = rows => rows.slice().sort((a, b) => a.assetId.localeCompare(b.assetId));
      assert.deepEqual(sort(actualBook.records), sort(expected)); assert.ok(actualBook.records.every(row => row.permission === 'pending' && !row.reviewedBy && !row.reviewedOn));
      artifacts.source = { bytes: exported.length, sha256: sha(exported), unchangedNonManifestEntries: Object.keys(original).length - 1, changedOnlyPrivatePendingEvidence: second.assetId };
      const sourceFile = path.join(temporary, 'verification-source.zip'); await writeFile(sourceFile, exported);
      for (const format of ['html', 'directory']) {
        const deliveryBytes = await generate(p, format), delivery = unzipSync(deliveryBytes), report = json(delivery['release/preparation.json']);
        assert.equal(report.pendingAssets, 25); assert.equal(report.documentedAssets, 0); assert.equal(report.deploymentUrl, null); assert.equal(report.publicDeployment, 'not-verified'); assert.equal(report.assets.find(row => row.assetId === second.assetId).record.evidence, marker);
        const restored = unzipSync(delivery['source/project.zip']); assert.deepEqual(json(restored['world.project.json']), actual);
        for (const [name, bytes] of Object.entries(delivery)) if (name.startsWith('game/')) assert.ok(!strFromU8(bytes).includes(marker), `${format}:${name} leaked private evidence`);
        const payload = readGamePayload(strFromU8(delivery['game/index.html'])); assert.equal(payload.project.manifest.preservedFields.webAssetSources, undefined);
        artifacts[format] = { bytes: deliveryBytes.length, sha256: sha(deliveryBytes), gameProjectDigest: report.gameProjectDigest, publicFiles: Object.keys(delivery).filter(name => name.startsWith('game/')).length, sourceRoundtrip: true, privateReportOnly: true };
      }
      assert.equal(artifacts.html.gameProjectDigest, artifacts.directory.gameProjectDigest);
      const fresh = await browser.newPage(); current = fresh; fresh.on('pageerror', error => errors.push(`fresh:${error.message}`)); await fresh.goto(url); await fresh.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(sourceFile); await ready(fresh); await nav(fresh, '发布'); await queue(fresh, '待确认发行条件 · 25 项'); await choose(fresh, second); assert.equal(await field(fresh, '确认依据').inputValue(), marker); await fresh.close(); current = p;
      check('original-64-nonmanifest-entries-and-all25-media-preserved-private-evidence-survives-fresh-source-import-and-both-production-exports', { localValidationOnly: true });
    }
    results.push({ engine, version: browser.version(), passed: true }); await browser.close(); browser = null;
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checks, errors, results, artifacts, scope: 'Original 1.7.14 author publishing workflow; desktop-engine responsive viewports, not physical phones/Safari. Private pending evidence is a test marker only. No original source/media changed, no permission approval, human story review, public deployment, full-game reading or offline-update acceptance. Temporary verification downloads removed.' }, null, 2));
} catch (error) {
  await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ passed: false, checks, errors, error: String(error), stack: error.stack }, null, 2));
  if (current && !current.isClosed()) await shot(current, 'failure'); throw error;
} finally {
  if (browser) await browser.close();
  assert.equal(path.dirname(temporary), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith('world-source-review-'));
  await rm(temporary, { recursive: true, force: true });
}

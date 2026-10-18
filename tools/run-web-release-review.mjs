import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { sha, json } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), baseline = process.argv.includes('--baseline');
const engine = process.argv.find(value => value.startsWith('--engine='))?.split('=')[1] ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const output = path.resolve(root, process.env.STUDIO_RELEASE_REVIEW_OUTPUT_DIRECTORY ?? `evidence/web-release-review/${baseline ? 'baseline' : engine}`);
const reportFile = path.join(output, 'browser-checks.json');
await mkdir(output, { recursive: true });
try { await access(reportFile); throw Error('Refusing to overwrite release review report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const sourceDir = path.join(root, 'evidence/web-story-plans-and-farewell');
const sourcePath = path.join(sourceDir, 'before-rain-stops-project.zip'), notesPath = path.join(sourceDir, 'before-rain-stops.worldreview');
const sourceBytes = await readFile(sourcePath), notesBytes = await readFile(notesPath), notes = json(notesBytes).notes;
const identityFiles = ['apps/editor/src/web-release-review.ts', 'apps/editor/src/web-release-preparation.ts', 'apps/editor/src/WebReleasePreparation.tsx', 'apps/editor/src/styles/web-asset-sources.css', 'apps/editor/src/web-delivery-bundle.ts', 'apps/editor/src/App.tsx', 'tools/run-web-release-review.mjs'];
const code = baseline ? [] : await Promise.all(identityFiles.map(async file => ({ file, sha256: sha(await readFile(path.join(root, file))) })));
const original = unzipSync(sourceBytes), sourceManifest = json(original['world.project.json']);
assert.equal(notes.length, 25); assert.ok(notes.every(note => note.status === 'fixed' && note.checkedSourceHash === null));
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8');
assert.equal(await (await fetch(ui)).text(), index);
const servedAssets = [];
for (const [, file] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) {
  const bytes = await readFile(path.join(root, 'apps/editor/dist', file)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(file, ui))).arrayBuffer())), sha(bytes)); servedAssets.push({ file, sha256: sha(bytes) });
}
const require = createRequire(import.meta.url); let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await engines[engine].launch({ headless: true, args: engine === 'chromium' ? ['--mute-audio'] : [] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }), page = await ctx.newPage();
const checks = [], errors = [], artifacts = [], button = name => page.getByRole('button', { name, exact: true });
page.on('pageerror', error => errors.push(String(error)));
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const summary = () => page.getByRole('region', { name: '文字演出与路线准备', exact: true });
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
async function download(action) { const pending = page.waitForEvent('download'); await action(); return readFile(await (await pending).path()); }
async function menu() { if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); }
async function preparation() { return download(() => button('下载发布准备清单（内部）').click()); }
async function formatPage(format, included) {
  await page.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/u }).click();
  await page.locator(`input[name="publication-format"][value="${format}"]`).check();
  await page.getByLabel('同时生成制作交付包', { exact: true }).check();
  await page.getByLabel('附带校订记录', { exact: true }).setChecked(included); await page.getByLabel('附带试玩进度', { exact: true }).setChecked(included);
  await button('继续：生成游戏 →').click(); await page.getByText('故事与素材检查通过', { exact: true }).waitFor();
}
async function exportAndInspect(format, included) {
  await formatPage(format, included); await button(format === 'html' ? '构建试玩 HTML' : '构建网站上传 ZIP').click();
  const link = page.getByRole('link', { name: '下载制作交付包', exact: true }); await link.waitFor({ timeout: 90000 });
  const pending = page.waitForEvent('download'); await link.click(); const downloadPath = await (await pending).path();
  const bytes = await readFile(downloadPath), files = unzipSync(bytes), manifest = json(files['delivery.json']), report = json(files['release/preparation.json']);
  assert.equal(sha(files['source/project.zip']), sha(sourceBytes));
  const paths = Object.keys(files); for (const row of manifest.files) { assert.equal(files[row.path].length, row.byteLength); assert.equal(`sha256:${sha(files[row.path])}`, row.digest); }
  assert.deepEqual(paths.sort(), ['delivery.json', ...manifest.files.map(row => row.path)].sort());
  assert.equal(report.pendingAssets, 26); assert.equal(report.documentedAssets, 0); assert.equal(report.publicDeployment, 'not-verified'); assert.equal(report.deploymentUrl, null);
  assert.equal(report.review.notes.availability, included ? 'included' : 'not-included'); assert.equal(report.review.notes.pending, included ? 25 : null);
  assert.equal(report.review.playtest.availability, included ? 'included' : 'not-included'); assert.equal(report.review.playtest.reached, included ? 0 : null);
  assert.equal(report.review.humanAcceptance, 'not-asserted');
  if (included) {
    assert.deepEqual(json(files['review/playtest-notes.worldreview']).notes, notes);
    assert.deepEqual(report.review.notes.items.map(row => row.id).sort(), notes.map(row => row.id).sort());
    assert.ok(report.review.notes.items.every(row => row.locationExists && row.state === 'fixed' && row.checkedSourceHash === null));
    const choice = report.review.notes.items.find(row => row.statementId === 'stmt_ui_83');
    assert.ok(choice.currentText.includes('最后一班车到了，你准备怎样继续这个约定？')); assert.ok(choice.currentText.includes('今晚留下，把回信写完')); assert.ok(choice.currentText.includes('今晚出发，在路上继续'));
    assert.equal(report.review.playtest.totalEndings, 2); assert.deepEqual(json(files['review/playtest-progress.worldplaytest']).completions, []);
  } else { assert.equal(manifest.reviewEntry, null); assert.equal(manifest.progressEntry, null); assert.ok(!paths.some(file => file.startsWith('review/'))); }
  const prepText = Buffer.from(files['release/准备上线.txt']).toString();
  for (const note of notes) assert.equal(prepText.includes(note.text), included);
  const priorGame = format === 'html' ? { 'index.html': await readFile(path.join(root, 'evidence/web-reading-motion/before-rain-stops.html')) } : unzipSync(await readFile(path.join(root, 'evidence/web-reading-motion/before-rain-stops-website.zip')));
  const publicFiles = paths.filter(file => file.startsWith('game/'));
  assert.deepEqual(publicFiles.sort(), Object.keys(priorGame).map(file => `game/${file}`).sort());
  for (const file of publicFiles) { assert.equal(sha(files[file]), sha(priorGame[file.slice(5)]), `unchanged #416 game: ${file}`); for (const note of notes) assert.ok(!Buffer.from(files[file]).includes(Buffer.from(note.text)), `private review leaked: ${file}`); }
  const label = `${format}-${included ? 'included' : 'excluded'}`;
  await writeFile(path.join(output, `${label}-preparation.json`), files['release/preparation.json'], { flag: 'wx' }); await writeFile(path.join(output, `${label}-preparation.txt`), files['release/准备上线.txt'], { flag: 'wx' });
  artifacts.push({ label, bytes: bytes.length, sha256: sha(bytes), manifest, preparationSha256: sha(files['release/preparation.json']), textSha256: sha(files['release/准备上线.txt']), unchangedPublicFiles: publicFiles.length, unchangedSource: true, optedInOnly: true });
  checks.push({ name: `${label}-real-production-download-same-source-notes-and-exact-416-game`, publicFiles: publicFiles.length });
  return { files, bytes, downloadPath };
}
try {
  await page.goto(ui); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(sourcePath); await ready(); await nav('检查');
  await page.getByLabel('导入校订记录', { exact: true }).setInputFiles(notesPath); await button('待跟进 25').waitFor(); await nav('发布');
  const plain = await preparation(); await writeFile(path.join(output, 'standalone-preparation.txt'), plain, { flag: 'wx' });
  if (baseline) {
    assert.equal(await summary().count(), 0); assert.ok(notes.every(note => !plain.includes(Buffer.from(note.text))));
    checks.push({ name: 'original-25-pending-notes-visible-in-checks-but-absent-from-downloaded-preparation', notes: 25, missingReviewSummary: true });
  } else {
    assert.ok((await summary().innerText()).includes('25 条待跟进')); assert.ok((await summary().innerText()).includes('0 / 2'));
    for (const note of notes) assert.ok(plain.includes(Buffer.from(note.text)));
    assert.ok(plain.includes(Buffer.from('待复核 25'))); checks.push({ name: 'actual-25-fixed-not-approved-notes-and-2-unreached-endings-in-standalone-list' });
    const sizes = [];
    for (const size of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size); await summary().scrollIntoViewIfNeeded();
      const bounds = await summary().evaluate(async el => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, width: innerWidth, client: el.clientWidth, scroll: el.scrollWidth, buttons: [...el.querySelectorAll('button')].map(b => ({ width: b.clientWidth, scroll: b.scrollWidth, height: b.getBoundingClientRect().height })) }; });
      assert.ok(bounds.x >= -1 && bounds.right <= bounds.width + 1 && bounds.scroll <= bounds.client + 1, JSON.stringify(bounds)); assert.ok(bounds.buttons.every(row => row.height >= 44 && row.scroll <= row.width + 1)); sizes.push({ size, bounds }); await page.screenshot({ path: path.join(output, `summary-${size.width}x${size.height}.png`) });
    }
    checks.push({ name: 'three-responsive-viewports-readable-summary-and-44px-actions', sizes }); await page.setViewportSize({ width: 1440, height: 1000 });
    await formatPage('website', true); await summary().getByRole('button', { name: '处理文字与演出', exact: true }).click(); await page.getByRole('region', { name: '试玩校订清单', exact: true }).waitFor(); await button('返回生成游戏').click(); await button('构建网站上传 ZIP').waitFor();
    await summary().getByRole('button', { name: '从头检查未完成路线', exact: true }).click(); await page.getByTestId('preview-step').waitFor(); await button('返回生成游戏').click(); await button('构建网站上传 ZIP').waitFor(); assert.ok((await summary().innerText()).includes('0 / 2'));
    checks.push({ name: 'review-and-real-entry-preview-actions-return-to-selected-website-format-without-approving-records' });
    await page.locator('.local-save-button').click(); await page.locator('.local-save-button--saved').waitFor(); await menu(); await page.getByRole('button', { name: /所有项目/u }).click(); await page.reload(); await button('打开项目：雨停之前').click(); await ready(); await nav('发布'); assert.ok((await summary().innerText()).includes('25 条待跟进'));
    await menu(); const savedSource = await download(() => page.getByRole('button', { name: /导出工程 ZIP/u }).click()); assert.equal(sha(savedSource), sha(sourceBytes)); checks.push({ name: 'actual-save-close-reload-reopen-unchanged-original-source-and-pending-review' });
    const included = await exportAndInspect('html', true); await exportAndInspect('website', true);
    if (engine === 'chromium') {
      await exportAndInspect('html', false); await exportAndInspect('website', false);
      const fresh = await browser.newContext(), restored = await fresh.newPage(); restored.on('pageerror', error => errors.push(String(error)));
      await restored.goto(ui); await restored.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(included.downloadPath);
      await restored.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
      await restored.getByRole('button', { name: '合并校订记录', exact: true }).click();
      await restored.getByRole('button', { name: '合并试玩进度', exact: true }).click();
      await restored.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click();
      assert.ok((await restored.getByRole('region', { name: '文字演出与路线准备', exact: true }).innerText()).includes('25 条待跟进'));
      checks.push({ name: 'fresh-browser-context-imports-actual-production-zip-and-explicitly-merges-both-record-kinds-without-human-approval' }); await fresh.close();
    }
  }
  assert.deepEqual(errors, []);
} catch (error) { errors.push(String(error?.stack ?? error)); await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally {
  await browser.close();
  for (const row of code) if (sha(await readFile(path.join(root, row.file))) !== row.sha256) errors.push(`Source changed during browser run: ${row.file}`);
  await writeFile(reportFile, JSON.stringify({ passed: errors.length === 0, baseline, engine, sourceVersion: sourceManifest.webPublication.version, sourceSha256: sha(sourceBytes), notesSha256: sha(notesBytes), servedAssets, code, checks, artifacts, errors, scope: 'Actual isolated Editor author workflow. Internal review and arrival inventory only; no human approval, natural listening/reading/timing, physical phone/Safari, permission, public deployment or new game acceptance. #394 editable source and exact #416 public games retained. Production ZIPs inspected in memory, not promoted.' }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ report: path.relative(root, reportFile), checks: checks.length, errors }));
}
if (errors.length) process.exitCode = 1;

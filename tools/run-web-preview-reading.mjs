import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { readGamePayload } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-preview-reading');
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [], checks = [];
page.setDefaultTimeout(30_000); page.on('pageerror', error => errors.push(String(error)));
const button = name => page.getByRole('button', { name, exact: true });
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const currentId = () => page.getByTestId('preview-step').getAttribute('data-statement-id');
async function advance() { const before = await currentId(); await button('继续故事').click(); await page.waitForFunction(before => document.querySelector('[data-testid="preview-step"]')?.dataset.statementId !== before, before); }
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const check = text => { checks.push(text); console.log(`PASS ${text}`); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function download(trigger) { const pending = page.waitForEvent('download'); await trigger(); return readFile(await (await pending).path()); }
async function projectMenu(name) { await ready(); if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); }
async function textSeparated() {
  await page.waitForFunction(() => {
    const stage = document.querySelector('[data-testid="preview-stage"]'), box = stage.getBoundingClientRect(), signature = [innerWidth, innerHeight, box.x, box.y, box.width, box.height].map(value => value.toFixed(2)).join('/');
    const previous = window.previewLayoutMeasurement; window.previewLayoutMeasurement = { signature, frames: previous?.signature === signature ? previous.frames + 1 : 0 };
    return window.previewLayoutMeasurement.frames >= 2 && box.height > 70 && Math.abs(box.width / box.height - +stage.dataset.previewWidth / +stage.dataset.previewHeight) < .025;
  });
  const measured = await geometry(); assert.equal(measured.overlapPixels, 0); assert.ok(measured.stage.height > 70);
  const ratio = await page.getByTestId('preview-stage').evaluate(el => +el.dataset.previewWidth / +el.dataset.previewHeight);
  assert.ok(Math.abs(measured.stage.width / measured.stage.height - ratio) < .025, JSON.stringify({ measured, ratio }));
  const fit = await page.getByTestId('preview-step').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  assert.equal(fit, true);
  if (await page.locator('.app-shell').getAttribute('data-preview-focus') === 'true') {
    const fit = await page.evaluate(() => {
      const area = document.querySelector('.preview-stage-area').getBoundingClientRect(), controls = document.querySelector('.preview-session-area').getBoundingClientRect(), copy = document.querySelector('[data-testid="preview-step"]').getBoundingClientRect();
      return area.bottom >= copy.bottom - 1 && (Math.min(area.right, controls.right) - Math.max(area.left, controls.left) <= 1 || Math.min(area.bottom, controls.bottom) - Math.max(area.top, controls.top) <= 1);
    }); assert.equal(fit, true, 'Stage/text area and session controls must not overlap');
  }
  return measured;
}
async function focus(on) {
  const current = await page.locator('.app-shell').getAttribute('data-preview-focus') === 'true';
  if (current !== on) await button(on ? '专注预览' : '返回编辑布局').click();
  await page.waitForFunction(on => document.querySelector('.app-shell')?.dataset.previewFocus === String(on), on);
}
async function finishRoute(branch) {
  await nav('检查'); const board = page.getByRole('region', { name: '试玩校订清单', exact: true });
  const filters = board.locator('.review-search'); if (!await filters.evaluate(el => el.open)) await filters.locator('summary').click();
  await page.getByLabel('搜索校订记录', { exact: true }).fill('晚间回房'); await board.locator('[data-review-id]').getByRole('button', { name: '定位原文', exact: true }).click();
  await page.getByLabel('校订复测范围', { exact: true }).selectOption('entry'); await button('从故事开头复测').click();
  await focus(true);
  const ids = [], choices = [];
  for (let count = 0; count < 400; count++) {
    const id = await currentId(); if (ids.at(-1) !== id) ids.push(id);
    if (await page.locator('.playable-preview--ended').count()) break;
    const options = page.getByTestId('preview-step').locator('.choice-preview button');
    if (await options.count()) { const selected = options.nth(Math.min(branch, await options.count() - 1)); choices.push(await selected.innerText()); await selected.click(); }
    else await advance();
  }
  assert.equal(await page.locator('.playable-preview--ended').count(), 1); const ending = await page.getByTestId('preview-step').innerText();
  await page.getByTestId('preview-step').scrollIntoViewIfNeeded(); await shot(`route-${branch}-ending`); return { branch, ending, choices, ids };
}
async function openTarget() {
  await nav('检查'); const board = page.getByRole('region', { name: '试玩校订清单', exact: true });
  await board.locator('.review-search > summary').click(); await page.getByLabel('搜索校订记录', { exact: true }).fill('晚间回房');
  await board.locator('[data-review-id]').getByRole('button', { name: '从场景开头复测', exact: true }).click();
  for (let count = 0; count < 50 && await currentId() !== 'stmt_ui_248'; count++) await advance();
  assert.equal(await currentId(), 'stmt_ui_248');
  await page.waitForFunction(() => document.querySelector('.review-task')?.dataset.reviewObserved === 'true' && !document.querySelector('.stage-media-loading'));
}
async function geometry() {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="preview-stage"]'), text = document.querySelector('[data-testid="preview-step"]');
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
    return { stage: rect(stage), text: rect(text), overlapPixels: Math.max(0, Math.min(stage.getBoundingClientRect().bottom, text.getBoundingClientRect().bottom) - Math.max(stage.getBoundingClientRect().top, text.getBoundingClientRect().top)), textClient: text.clientHeight, textScroll: text.scrollHeight };
  });
}
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-reading-throughput/before-rain-stops-project.zip')); await ready();
  await nav('检查'); await page.getByLabel('导入校订记录', { exact: true }).setInputFiles(path.join(root, 'evidence/web-reading-throughput/before-rain-stops.worldreview'));
  await page.getByRole('button', { name: '待跟进 11', exact: true }).waitFor(); await openTarget();
  if (process.argv.includes('--baseline')) {
    await page.getByTestId('preview-stage').scrollIntoViewIfNeeded(); const measured = await geometry(); assert.ok(measured.overlapPixels > measured.stage.height * .7);
    await shot('baseline-long-paragraph'); await writeFile(path.join(output, 'baseline.json'), JSON.stringify({ browser: browser.version(), measured, errors }, null, 2));
    console.log('BASELINE long paragraph obscures the stage');
  } else {
    const measurements = [], narrow = await textSeparated(), text = await page.getByTestId('preview-step').innerText(), history = await page.getByRole('group', { name: 'Runtime 调试控制', exact: true }).innerText();
    await page.getByTestId('preview-stage').scrollIntoViewIfNeeded(); await shot('narrow-separated'); measurements.push({ name: 'narrow', ...narrow });
    await page.getByRole('region', { name: '当前校订任务', exact: true }).getByRole('button', { name: '查看试玩画面', exact: true }).click();
    const wide = await textSeparated(); assert.ok(wide.stage.width > narrow.stage.width * 1.8); measurements.push({ name: 'focus', ...wide });
    const revision = await page.getByTestId('workspace-shell').getAttribute('data-source-revision');
    await page.getByTestId('preview-step').focus(); await page.keyboard.press('Control+Enter'); await page.keyboard.press('Alt+1');
    assert.equal(await page.getByTestId('workspace-shell').getAttribute('data-source-revision'), revision); assert.equal(await currentId(), 'stmt_ui_248');
    await page.getByTestId('preview-stage').scrollIntoViewIfNeeded(); await shot('focus-desktop');
    assert.equal(await page.getByRole('group', { name: 'Runtime 调试控制', exact: true }).innerText(), history); assert.equal(await page.getByTestId('preview-step').innerText(), text);
    // Hold only public DOM/native media references, never injected app state.
    const beforePixels = await page.getByRole('img', { name: 'Canvas 2D 舞台画面', exact: true }).evaluate(canvas => { window.previewCanvas = canvas; return canvas.toDataURL(); });
    await focus(false); await focus(true);
    assert.equal(await page.getByRole('img', { name: 'Canvas 2D 舞台画面', exact: true }).evaluate(canvas => canvas === window.previewCanvas), true);
    assert.equal(await page.getByRole('img', { name: 'Canvas 2D 舞台画面', exact: true }).evaluate(canvas => canvas.toDataURL()), beforePixels);
    check('Long original Rain paragraph is outside the unchanged-ratio stage; focus widens it, preserves native canvas pixels, current sentence and history, and never approves the note.');
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport); measurements.push({ name: `${viewport.width}x${viewport.height}`, ...await textSeparated() });
      await page.getByTestId('preview-stage').scrollIntoViewIfNeeded();
      assert.equal(await page.getByTestId('preview-stage').evaluate(el => { const box = el.getBoundingClientRect(), parent = el.closest('.preview-panel').getBoundingClientRect(); return box.top >= parent.top - 1 && box.bottom <= parent.bottom + 1; }), true, 'A full stage must be visible inside the focused panel');
      await shot(`focus-${viewport.width}x${viewport.height}`);
    }
    for (const [preset, ratio] of [['portrait-9-16', 9 / 16], ['classic-4-3', 4 / 3], ['cinema-21-9', 2560 / 1080], ['landscape-16-9', 16 / 9]]) {
      await page.getByLabel('预览尺寸', { exact: true }).selectOption(preset); const measured = await textSeparated(); assert.ok(Math.abs(measured.stage.width / measured.stage.height - ratio) < .025);
    }
    const copy = page.getByRole('region', { name: '可滚动的试玩正文', exact: true }); await copy.focus(); await page.keyboard.press('End');
    await page.waitForFunction(() => { const el = document.querySelector('[data-testid="preview-step"]'); return el.scrollTop + el.clientHeight >= el.scrollHeight - 2; });
    assert.equal(await currentId(), 'stmt_ui_248'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.app-shell').getAttribute('data-preview-focus'), 'false'); assert.equal(await button('专注预览').evaluate(el => el === document.activeElement), true);
    check('390/844/320 viewports and four aspect presets retain geometry; native text scrolling reaches the end without advancing; Escape returns to the same editor toggle.');
    // Exercise a genuinely overflowing author paragraph through real edits, then
    // undo it. The original work must still be byte-identical at final export.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await button('继续修改').click(); const input = page.getByLabel('旁白文本', { exact: true }), original = await input.inputValue();
    await input.fill(Array(6).fill(original).join('\n\n')); await button('应用修改').click(); await button('返回试玩').click(); await focus(true);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.waitForFunction(() => { const copy = document.querySelector('[data-testid="preview-step"]'); return copy.scrollHeight > copy.clientHeight + 100; });
    await copy.focus(); await page.keyboard.press('End');
    await page.waitForFunction(() => { const copy = document.querySelector('[data-testid="preview-step"]'); return copy.scrollTop > 100 && copy.scrollTop + copy.clientHeight >= copy.scrollHeight - 2; });
    const scrollBefore = await copy.evaluate(el => el.scrollTop); await focus(false); await focus(true); assert.equal(await copy.evaluate(el => el.scrollTop), scrollBefore);
    assert.equal(await currentId(), 'stmt_ui_248'); await textSeparated(); await copy.scrollIntoViewIfNeeded(); await shot('long-copy-end');
    await page.setViewportSize({ width: 1440, height: 1000 }); await button('撤销').click(); await page.waitForFunction(original => document.querySelector('[data-testid="preview-step"] p')?.textContent === original, original);
    check('An actual six-paragraph temporary edit overflows, scrolls to the last line by keyboard and retains that reading position through focus toggles; undo restores the original sentence and does not advance Runtime.');
    await page.setViewportSize({ width: 1440, height: 1000 });
    // The director view previously collapsed above a large review task.
    await focus(false); await page.getByRole('button', { name: '演出', exact: true }).click(); await page.getByTestId('preview-stage').scrollIntoViewIfNeeded(); measurements.push({ name: 'director', ...await textSeparated() }); await shot('director-separated');
    await focus(true); measurements.push({ name: 'director-focus', ...await textSeparated() }); await shot('director-focus'); await focus(false);
    await page.getByRole('button', { name: '写作', exact: true }).click();
    if (await button('继续修改').count()) await button('继续修改').click(); await page.getByLabel('校订复测范围', { exact: true }).selectOption('entry'); await button('从故事开头复测').click();
    for (let count = 0; count < 10 && await page.locator('.stage-audio-stack audio').count() < 2; count++) await advance();
    await page.waitForFunction(() => [...document.querySelectorAll('.stage-audio-stack audio')].length >= 2 && [...document.querySelectorAll('.stage-audio-stack audio')].every(audio => !audio.paused && audio.currentTime > 0));
    const audioBefore = await page.locator('.stage-audio-stack audio').evaluateAll(nodes => { window.previewAudio = nodes; return nodes.map(node => ({ src: node.src, time: node.currentTime })); });
    const beforeId = await currentId(); for (let count = 0; count < 3; count++) { await focus(true); await focus(false); }
    const audioAfter = await page.locator('.stage-audio-stack audio').evaluateAll(nodes => nodes.map((node, index) => ({ same: node === window.previewAudio[index], src: node.src, time: node.currentTime, paused: node.paused, muted: node.muted })));
    assert.equal(await currentId(), beforeId); assert.equal(audioAfter.length, audioBefore.length); audioAfter.forEach((node, index) => { assert.equal(node.same, true); assert.equal(node.paused, false); assert.equal(node.muted, true); assert.ok(node.time >= audioBefore[index].time); assert.equal(node.src, audioBefore[index].src); });
    check('Director stage no longer collapses; repeated focus/return retains the actual two playing muted audio nodes and their time without a playback restart.');
    const routes = [await finishRoute(0), await finishRoute(1)]; assert.notEqual(routes[0].ending, routes[1].ending);
    await nav('检查'); await page.getByRole('region', { name: '结局试玩进度', exact: true }).getByText('当前版本已从开头到达 2 / 2 个结局', { exact: true }).waitFor();
    const notes = JSON.parse((await download(() => button('导出校订记录').click())).toString());
    const originalNotes = JSON.parse(await readFile(path.join(root, 'evidence/web-reading-throughput/before-rain-stops.worldreview'), 'utf8')); assert.deepEqual(notes, originalNotes);
    check('Both complete editor routes and distinct endings work with choices in the readable pane; eleven original fixed/null notes stay unapproved.');
    const exportedSource = unzipSync(await download(() => projectMenu('导出工程 ZIP'))), prior = unzipSync(await readFile(path.join(root, 'evidence/web-reading-throughput/before-rain-stops-project.zip')));
    assert.deepEqual(Object.keys(exportedSource).sort(), Object.keys(prior).sort()); for (const [name, bytes] of Object.entries(prior)) assert.equal(digest(exportedSource[name]), digest(bytes), name);
    await ready(); await page.locator('.local-save-button').click(); await ready(); await page.reload(); await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
    await nav('故事'); assert.equal(await page.locator('.app-shell').getAttribute('data-preview-focus'), 'false'); assert.equal(await page.getByRole('button', { name: '试玩完整流程', exact: true }).count(), 1);
    await nav('发布'); await button('继续：导出方式 →').click();
    const artifacts = {}, previous = JSON.parse(await readFile(path.join(root, 'evidence/web-contextual-review/browser-checks.json'), 'utf8')); let htmlBytes;
    for (const format of ['html', 'directory']) {
      await page.locator(`input[name="publication-format"][value="${format}"]`).check(); await button('继续：生成游戏 →').click();
      await page.getByText('故事与素材检查通过', { exact: true }).waitFor(); await button(format === 'html' ? '构建试玩 HTML' : '构建目录 ZIP').click();
      await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 90_000 }); const bytes = await download(() => page.getByRole('link', { name: '下载游戏', exact: true }).click());
      artifacts[format] = { bytes: bytes.length, sha256: digest(bytes) };
      if (format === 'html') { htmlBytes = bytes; assert.equal(artifacts[format].sha256, previous.artifacts.games[format].sha256); }
      else {
        const files = unzipSync(bytes), html = htmlBytes.toString(), payload = readGamePayload(strFromU8(files['index.html'])), inline = readGamePayload(html);
        assert.deepEqual(payload.project, inline.project); assert.equal(payload.editorPreview, undefined);
        assert.ok(html.includes(`<script>${strFromU8(files['player.js']).replace(/<\/script/gi, '<\\/script')}</script>`));
        assert.ok(html.includes(`<style>${strFromU8(files['player.css']).replace(/<\/style/gi, '<\\/style')}</style>`));
        const assets = JSON.parse(strFromU8(prior['.world-assets/index.json'])).assets;
        for (const asset of assets) assert.equal(`sha256:${digest(files[payload.mediaAssets.find(row => row.assetId === asset.assetId).url])}`, asset.source.digest);
        const info = JSON.parse(strFromU8(files['build-info.json']));
        for (const file of info.files) { assert.equal(files[file.path].length, file.byteLength); assert.equal(`sha256:${digest(files[file.path])}`, file.digest); }
        artifacts.directory.runtimeMatchesIdenticalHtml = true; artifacts.directory.media = assets.length; artifacts.directory.filesVerified = info.files.length;
      }
      if (format === 'html') await button('← 导出方式').click();
    }
    check('Save/reopen restores the work without restarting a run; all 65 source entries stay byte-identical. HTML exactly matches the prior verified game; directory Runtime, CSS, project and 25 media match it, and all build-info file digests verify.');
    assert.deepEqual(errors, []); await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), checks, measurements, routes, audioAfter, artifacts, unchangedSourceEntries: Object.keys(prior).length, errors, scope: 'Actual Rain 1.7.14 author UI. Native canvas/media, viewport emulation, editor two routes, actual save/reopen and downloads. Game exports match exact prior verified bytes; independent Player routes are not rerun this batch. No physical phone, human listening/art approval, long-story performance or public deployment.' }, null, 2));
  }
} catch (error) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'); await shot(`failure-${stamp}`);
  await writeFile(path.join(output, `failure-${stamp}.json`), JSON.stringify({ error: String(error), stack: error.stack, checks, errors }, null, 2)); throw error;
} finally { await browser.close(); }

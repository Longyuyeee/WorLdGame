import { createRequire } from 'node:module';
import path from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { mkdtemp, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { scenes } from '../assets/rain-story/story.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME });
const output = path.resolve('evidence/web-story-media'), errors = [], checks = [];
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(output, 'before-rain-stops.html')).href);
    await page.getByRole('button', { name: /^开始故事/ }).click();
    await page.waitForFunction(() => document.querySelector('.player-stage-character')?.dataset.canvasSampling === 'ready' && document.querySelector('.player-dialogue')?.dataset.textReady === 'true');
    const body = page.locator('.player-dialogue');
    assert.equal(await page.locator('.player-dialogue__text').textContent(), scenes[0].prose[0]);
    const bounds = await body.evaluate(item => {
      const r = item.getBoundingClientRect(), stage = document.querySelector('.player-stage').getBoundingClientRect(), controls = document.querySelector('.player-playback-controls').getBoundingClientRect(), save = document.querySelector('.player-save').getBoundingClientRect();
      return { inside: r.top >= stage.top && r.bottom <= Math.min(innerHeight, stage.bottom), noControlsOverlap: r.top > controls.bottom && r.bottom < save.top, scrollable: item.scrollHeight > item.clientHeight, scrollHeight: item.scrollHeight, clientHeight: item.clientHeight };
    });
    assert.equal(bounds.inside, true, JSON.stringify(bounds)); assert.equal(bounds.noControlsOverlap, true, JSON.stringify(bounds));
    const hash = await page.locator('main').getAttribute('data-runtime-state-hash');
    await body.hover(); await page.mouse.wheel(0, 900); await page.waitForTimeout(150);
    assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), hash, 'Reading scroll must not advance the story');
    assert.ok(await body.evaluate(item => item.scrollTop + item.clientHeight >= item.scrollHeight - 2), 'The final line is reachable');
    await page.screenshot({ path: path.join(output, `review-player-${width}.png`) });
    checks.push({ width, ...bounds, scrollDidNotAdvance: true }); await page.close();
  }
  const editor = await browser.newPage({ viewport: { width: 320, height: 844 } });
  editor.on('pageerror', error => errors.push(error.message));
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5192/');
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(output, 'before-rain-stops-project.zip'));
  await editor.getByTestId('workspace-shell').waitFor();
  await editor.getByRole('button', { name: '添加成段文字', exact: true }).click();
  const dialog = editor.getByRole('dialog', { name: '添加成段文字', exact: true });
  await dialog.getByLabel('成段文字', { exact: true }).fill(scenes[0].prose.slice(0, 3).join('\n'));
  assert.ok(await dialog.evaluate(item => { const r = item.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  await editor.screenshot({ path: path.join(output, 'review-editor-320-batch.png') });
  await dialog.getByRole('button', { name: '放弃文字', exact: true }).click();
  assert.equal(await editor.locator('.statement-card--narration').count(), 10);
  await editor.locator('.statement-card--narration').first().click(); await editor.getByLabel('旁白文本', { exact: true }).waitFor();
  checks.push({ editorWidth: 320, draftDialogFits: true, discardedDraftDidNotChangeStory: true, narrationEditorAccessible: true });
  // Make a separate disposable UI-authored stress export, not a patched HTML/IR fixture.
  const longText = '长段文字也必须能够完整读完。'.repeat(100);
  await editor.locator('.statement-card--direction').last().click();
  await editor.getByRole('button', { name: '添加成段文字', exact: true }).click();
  const longDraft = editor.getByRole('dialog', { name: '添加成段文字', exact: true });
  await longDraft.getByLabel('成段文字', { exact: true }).fill(longText); await longDraft.getByRole('button', { name: '添加到故事', exact: true }).click();
  await editor.waitForFunction(() => document.querySelectorAll('.statement-card--narration').length === 11);
  await editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click();
  await editor.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await editor.getByRole('button', { name: '构建试玩 HTML', exact: true }).click(); await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60_000 });
  const waiting = editor.waitForEvent('download'); await editor.getByRole('link', { name: '下载游戏', exact: true }).click();
  const downloaded = await waiting, temporary = await mkdtemp(path.join(tmpdir(), 'world-story-scroll-')), file = path.join(temporary, 'scroll-validation.html');
  await downloaded.saveAs(file);
  const scrolling = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  scrolling.on('pageerror', error => errors.push(error.message));
  await scrolling.goto(pathToFileURL(file).href); await scrolling.getByRole('button', { name: /^开始故事/ }).click();
  await scrolling.waitForFunction(() => document.querySelector('.player-stage-character')?.dataset.canvasSampling === 'ready');
  assert.equal(await scrolling.locator('.player-dialogue__text').textContent(), longText);
  const scrollBody = scrolling.locator('.player-dialogue');
  assert.ok(await scrollBody.evaluate(item => item.scrollHeight > item.clientHeight));
  assert.ok(await scrollBody.evaluate(item => { const r = item.getBoundingClientRect(), controls = document.querySelector('.player-playback-controls').getBoundingClientRect(), save = document.querySelector('.player-save').getBoundingClientRect(); return r.top > controls.bottom && r.bottom < save.top; }), 'Even the maximum-height reading panel must not be hidden under controls');
  const beforeScroll = await scrolling.locator('main').getAttribute('data-runtime-state-hash');
  await scrollBody.hover(); await scrolling.mouse.wheel(0, 10000); await scrolling.waitForTimeout(200);
  assert.ok(await scrollBody.evaluate(item => item.scrollTop + item.clientHeight >= item.scrollHeight - 2));
  assert.equal(await scrolling.locator('main').getAttribute('data-runtime-state-hash'), beforeScroll);
  await scrolling.screenshot({ path: path.join(output, 'review-player-320-long-scroll.png') });
  checks.push({ width: 320, uiAuthoredLongParagraphCharacters: longText.length, scrollable: true, finalLineReachable: true, scrollDidNotAdvance: true });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'review-checks.json'), JSON.stringify({ passed: true, checks, errors, physicalDevicePassed: false }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks, errors }));
} finally { await browser.close(); }

import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-writing-appearance');
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME });
const checks = [], errors = [];
const watch = page => page.on('pageerror', error => errors.push(error.message));
function contrast(first, second) {
  const light = color => {
    const values = color.match(/[\d.]+/g).slice(0, 3).map(v => { const c = Number(v) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const a = light(first), b = light(second); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
try {
  const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); watch(editor);
  await editor.goto(process.env.STUDIO_UI_URL);
  assert.match(await editor.title(), /WorLd/i);
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(output, 'before-rain-stops-project.zip'));
  await editor.getByTestId('workspace-shell').waitFor();
  await editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '游戏外观', exact: true }).click();
  assert.equal(await editor.getByLabel('玩家主题', { exact: true }).inputValue(), 'paper');
  await editor.getByText('编辑器设置', { exact: true }).click(); await editor.getByRole('button', { name: '石墨', exact: true }).click();
  const colors = await editor.getByLabel('标题简介', { exact: true }).evaluate(e => ({ ink: getComputedStyle(e).color, paper: getComputedStyle(e).backgroundColor }));
  assert.ok(contrast(colors.ink, colors.paper) >= 4.5);
  await editor.getByText('编辑器设置', { exact: true }).click();
  await editor.screenshot({ path: path.join(output, 'appearance-editor-dark.png'), animations: 'disabled' });
  checks.push({ task: 'import the editable project, keep game appearance and read appearance inputs in the dark editor theme', contrast: contrast(colors.ink, colors.paper) });
  for (const width of [1280, 390]) {
    const player = await browser.newPage({ viewport: { width, height: 844 } }); watch(player);
    await player.goto(pathToFileURL(path.join(output, 'before-rain-stops.html')).href);
    await player.getByRole('button', { name: '存读档', exact: true }).click();
    await player.locator('.player-save__panel').getByRole('button', { name: '下一页', exact: true }).click();
    await player.locator('.player-save__panel').getByText('第 2 / 2 页', { exact: true }).waitFor();
    await player.locator('.player-save__panel').getByRole('button', { name: '上一页', exact: true }).click();
    await player.locator('.player-save__panel').getByText('第 1 / 2 页', { exact: true }).waitFor();
    assert.equal(await player.locator('.player-save__panel').evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true);
    checks.push({ task: 'scroll and page through all manual slots within the viewport', width });
  }
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, errors, limits: 'Contrast covers opaque editor text inputs only; not a complete accessibility or physical-phone acceptance.' };
  await writeFile(path.join(output, 'appearance-review.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }

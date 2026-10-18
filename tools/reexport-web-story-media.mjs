// Refresh presentation-only changes through the real publish UI; verify immutable story/media/JS.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const output = path.resolve('evidence/web-story-media');
const original = await readFile(path.join(output, 'before-rain-stops.html'), 'utf8');
const payload = html => JSON.parse(/<script id="world-project" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
const javascript = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME });
try {
  const page = await browser.newPage();
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5192/');
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(output, 'before-rain-stops-project.zip'));
  await page.getByTestId('workspace-shell').waitFor();
  await page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click();
  await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  async function save(name) { const waiting = page.waitForEvent('download'); await page.getByRole('link', { name: '下载游戏', exact: true }).click(); await (await waiting).saveAs(path.join(output, name)); }
  await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click(); await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60_000 }); await save('before-rain-stops.html');
  const current = await readFile(path.join(output, 'before-rain-stops.html'), 'utf8');
  assert.deepEqual(payload(current), payload(original)); assert.equal(javascript(current), javascript(original));
  await page.getByRole('button', { name: '← 导出方式', exact: true }).click(); await page.getByRole('radio', { name: /目录 ZIP/ }).check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByRole('button', { name: '构建目录 ZIP', exact: true }).click(); await page.waitForFunction(() => document.querySelector('a[download]')?.getAttribute('download')?.endsWith('-web.zip'), undefined, { timeout: 60_000 }); await save('before-rain-stops-web.zip');
  const result = { passed: true, canonicalAndMediaPayloadUnchanged: true, runtimeJavascriptUnchanged: true, change: 'narrow-screen maximum reading height reserves wrapped controls', refreshedAt: new Date().toISOString() };
  await writeFile(path.join(output, 'artifact-refresh.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
} finally { await browser.close(); }

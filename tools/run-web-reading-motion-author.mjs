import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { sha } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(root, process.env.STUDIO_READING_MOTION_AUTHOR_OUTPUT_DIRECTORY ?? 'evidence/web-reading-motion');
await mkdir(output, { recursive: true }); const reportPath = path.join(output, 'author-skin.json');
try { await access(reportPath); throw Error('Refusing to overwrite a reading motion author report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const source = path.join(root, 'evidence/web-story-plans-and-farewell/before-rain-stops-project.zip'), originalBytes = await readFile(source), original = unzipSync(originalBytes), ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/';
const index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), index);
const assets = [];
for (const [, asset] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) { const bytes = await readFile(path.join(root, 'apps/editor/dist', asset)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(asset, ui))).arrayBuffer())), sha(bytes)); assets.push({ asset, sha256: sha(bytes) }); }
const require = createRequire(import.meta.url); let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] }), page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' }), checks = [], errors = [];
page.on('pageerror', error => errors.push(String(error))); const button = name => page.getByRole('button', { name, exact: true }), nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
async function skinPage() { await nav('游戏外观'); await page.getByRole('navigation', { name: '游戏界面分区' }).getByRole('button', { name: /皮肤与动效/u }).click(); }
async function projectDownload() { if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: /导出工程 ZIP/u }).click(); return readFile(await (await pending).path()); }
try {
  await page.goto(ui); await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(source); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); await skinPage(); await button('纸上来信').click(); await button('应用玩家外观').click(); await page.locator('.local-save-button').click(); await page.locator('.local-save-button--saved').waitFor();
  const configuredBytes = await projectDownload(), configured = unzipSync(configuredBytes); const appearance = JSON.parse(Buffer.from(configured['ui/screens.json']).toString()).webPlayerAppearance; assert.equal(appearance.skin.motion.text, 'ink');
  const retained = Object.keys(original).filter(file => /^(scripts|scenes|\.world-assets)\//u.test(file)); for (const file of retained) assert.equal(sha(configured[file]), sha(original[file]), file);
  checks.push({ name: 'real-author-applies-letter-preset-and-saves-with-story-and-media-unchanged', configuredArchiveSha256: sha(configuredBytes), retainedFiles: retained.length, motion: appearance.skin.motion });
  if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: /所有项目/u }).click(); await page.reload(); await button('打开项目：雨停之前').click(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); await skinPage(); assert.equal(await page.getByLabel('文字呈现效果', { exact: true }).inputValue(), 'ink'); checks.push({ name: 'saved-appearance-survives-real-close-refresh-and-project-reopen' });
  const samples = [];
  for (const device of ['desktop', 'phone']) {
    await page.getByLabel('外观预览页面', { exact: true }).selectOption('reading'); await page.getByLabel('外观预览设备', { exact: true }).selectOption(device); await button('重播效果').click();
    // Author appearance previews deliberately use immediate text. Check that
    // policy here; real gradual/replay behavior belongs to the native fixture.
    const frame = page.frameLocator('iframe[title="游戏界面真实预览"]'); await frame.locator('main[data-skin-text-motion="ink"] .player-dialogue[data-text-ready="true"]').waitFor();
    const paint = await frame.locator('.player-dialogue__text').evaluate(el => { const style = getComputedStyle(el); return { ready: el.closest('.player-dialogue').dataset.textReady, duration: el.closest('.player-dialogue').dataset.textRevealDuration, opacity: style.opacity, clipPath: style.clipPath, animation: style.animationName, skin: el.closest('main').dataset.skinTextMotion, muted: el.closest('main').dataset.playerMuted }; });
    assert.equal(paint.ready, 'true'); assert.equal(paint.duration, '0'); assert.equal(paint.opacity, '1'); assert.equal(paint.clipPath, 'none'); assert.equal(paint.animation, 'none'); assert.equal(paint.muted, 'true'); samples.push({ device, paint }); await page.screenshot({ path: path.join(output, `author-${device}.png`) });
  }
  checks.push({ name: 'actual-editor-formal-preview-keeps-its-immediate-text-policy-on-desktop-and-phone', samples }); assert.deepEqual(errors, []);
} catch (error) { errors.push(String(error?.stack ?? error)); await page.screenshot({ path: path.join(output, 'author-failure.png') }).catch(() => {}); }
finally { await browser.close(); await writeFile(reportPath, JSON.stringify({ passed: errors.length === 0, sourceSha256: sha(originalBytes), assets, checks, errors, scope: 'Isolated real Editor workspace, letter preset apply/save/close/reopen and formal preview. Configured source inspected in memory only, not promoted as a changed Rain source or full-story playthrough; canonical source remains unchanged.' }, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ report: path.relative(root, reportPath), checks: checks.length, errors })); }
if (errors.length) process.exitCode = 1;

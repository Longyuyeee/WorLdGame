import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'evidence/web-preview-continuity');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15_000);
const errors = [], checks = [];
let routeStatements = new Map();
page.on('pageerror', error => errors.push(error.message));
async function mediaReady() {
  await page.waitForFunction(() => document.querySelector('[data-testid="preview-visual-host"]')?.dataset.renderStatus === 'ready');
  const failures = await page.locator('.stage-media-errors').count();
  assert.equal(failures, 0, `real story media must reload without placeholders: ${failures ? await page.locator('.stage-media-errors').textContent() : ''}`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function screenshot(name, waitForMedia = true) {
  if (waitForMedia && await page.getByTestId('preview-visual-host').count()) await mediaReady();
  return page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
}
async function ready() { await page.getByTestId('workspace-shell').waitFor(); await page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false); }
async function menu(name) {
  await ready();
  if (!await page.locator('.project-switcher').evaluate(element => element.open)) await page.getByLabel('项目菜单', { exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
}
async function structure() { await menu('章节与角色'); await page.getByRole('main', { name: '项目结构管理' }).waitFor(); }
async function back() { await page.getByRole('button', { name: '返回创作', exact: true }).click(); await ready(); }
async function snapshot() {
  // Workspace attributes describe the editing cursor, not Formal Runtime.
  return page.evaluate(() => {
    const [scene, location] = (document.querySelector('.runtime-inspector__current code')?.textContent ?? '').split(' / ');
    return { scene, statement: location?.split(' #')[0],
    history: document.querySelector('.runtime-debug-actions__history strong')?.textContent,
    status: document.querySelector('.playable-preview small')?.textContent,
    text: document.querySelector('[data-testid="preview-step"]')?.textContent };
  });
}
async function rememberStep() {
  const checkpoint = await snapshot();
  const kind = await page.locator('.preview-transport small').innerText();
  if (checkpoint.statement) routeStatements.set(checkpoint.statement, kind.split(' · ')[0]);
}
function routeBudget() {
  const kinds = [...routeStatements.values()];
  const result = { narration: kinds.filter(kind => kind === '旁白').length, dialogue: kinds.filter(kind => kind === '对白').length };
  assert.deepEqual(result, { narration: 60, dialogue: 6 });
  return result;
}
async function unchangedVisit() { const before = await snapshot(); await structure(); await back(); assert.deepEqual(await snapshot(), before); }
async function reachChoice() {
  for (let i = 0; i < 250; i++) {
    await rememberStep();
    if (await page.getByRole('button', { name: /^选择路线：/ }).count()) return;
    const next = page.getByRole('button', { name: '继续故事', exact: true });
    assert.equal(await next.isEnabled(), true, 'unexpected host or terminal stop before choice');
    await next.click();
  }
  throw new Error('choice not reached');
}
const record = (name, detail) => { checks.push({ name, passed: true, detail }); console.log(`PASS ${name}`); };
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5193/');
  assert.match(await page.title(), /WorLd/i);
  await page.getByRole('button', { name: '打开示例工程', exact: true }).click(); await ready();
  await page.getByRole('button', { name: '试玩完整流程', exact: true }).click(); await reachChoice();
  await page.getByText('调试详情', { exact: true }).click();
  await page.getByRole('button', { name: '选择路线：去广播室', exact: true }).click();
  await page.getByRole('button', { name: 'Runtime 后退一步', exact: true }).click();
  await unchangedVisit();
  assert.equal(await page.getByRole('region', { name: 'Runtime 状态检查器' }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Runtime 前进一步', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Runtime 前进一步', exact: true }).click();
  await unchangedVisit();
  assert.equal((await snapshot()).scene, 'scn_broadcast_room');
  await screenshot('recorded-future-restored'); record('choice-history-future', await snapshot());
  await page.getByRole('button', { name: '退出试玩', exact: true }).click();
  await structure(); await back(); assert.equal(await page.getByRole('button', { name: '试玩完整流程', exact: true }).isVisible(), true);
  await menu('所有项目'); await page.getByRole('main', { name: '项目首页' }).waitFor();
  await page.locator('input[type="file"]').setInputFiles(path.join(root, 'evidence/web-player-settings/before-rain-stops-project.zip')); await ready();
  routeStatements = new Map();
  await page.getByRole('button', { name: '试玩完整流程', exact: true }).click(); await reachChoice();
  const original = await snapshot(); await unchangedVisit();
  assert.equal(await page.getByLabel('试玩接续状态').isVisible(), true);
  await screenshot('rain-choice-restored'); record('actual-story-choice-handoff', original);
  const hitAreas = page.locator('.stage-canvas-hit-proxy');
  assert.ok(await hitAreas.count() > 0);
  const transparent = await hitAreas.first().evaluate(element => getComputedStyle(element).backgroundColor);
  assert.equal(transparent, 'rgba(0, 0, 0, 0)');
  record('character-hit-area-does-not-cover-portrait', { background: transparent });
  // A checkpoint can deliberately stop music. If so, use a previous music
  // checkpoint and Forward the existing future afterwards.
  for (let step = 0; !await page.getByTestId('preview-audio-bgm').count(); step++) {
    assert.ok(step < 60, 'no authored music checkpoint found');
    await page.getByRole('button', { name: 'Runtime 后退一步', exact: true }).click(); await mediaReady();
  }
  const mediaCheckpoint = await snapshot();
  const oldAudio = await page.getByTestId('preview-audio-bgm').elementHandle();
  await page.waitForFunction(() => (document.querySelector('[data-testid="preview-audio-bgm"]')?.currentTime ?? 0) > 0);
  const oldSource = await oldAudio.evaluate(audio => audio.getAttribute('src'));
  await structure();
  assert.equal(await oldAudio.evaluate(audio => !audio.isConnected && audio.paused && audio.getAttribute('src') === null), true);
  await back(); await mediaReady();
  assert.deepEqual(await snapshot(), mediaCheckpoint);
  const newSource = await page.getByTestId('preview-audio-bgm').getAttribute('src');
  assert.notEqual(newSource, oldSource);
  assert.ok(newSource?.startsWith('blob:'));
  await oldAudio.dispose();
  for (let step = 0; !/请选择路线/.test((await snapshot()).status ?? ''); step++) {
    assert.ok(step < 60); await page.getByRole('button', { name: 'Runtime 前进一步', exact: true }).click();
  }
  assert.deepEqual(await snapshot(), original);
  record('native-media-release-and-reload-without-story-advance', { sameCheckpoint: true, oldAudioReleased: true, newObjectUrl: true, clockRestored: false });
  for (const task of ['素材', '游戏外观', '检查', '发布']) {
    await page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: task, exact: true }).click();
    await page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '故事', exact: true }).click();
    assert.deepEqual(await snapshot(), original);
  }
  record('four-author-workspaces-return-to-same-preview', await snapshot());

  await structure(); await page.getByRole('button', { name: '修改场景：车站的雨', exact: true }).click();
  await page.getByLabel('新场景名称', { exact: true }).fill('车站的雨 · 校订');
  await page.getByRole('button', { name: '保存场景', exact: true }).click();
  await page.getByRole('dialog', { name: '编辑场景', exact: true }).waitFor({ state: 'hidden' }); await back();
  assert.equal((await snapshot()).history, original.history);
  assert.equal(await page.getByRole('button', { name: /^选择路线：/ }).first().isEnabled(), true);
  record('scene-title-correction-preserves-branch', await snapshot());
  await structure(); await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByRole('button', { name: '编辑角色：小夏', exact: true }).click();
  await page.getByLabel('角色显示名', { exact: true }).fill('夏');
  await page.getByRole('button', { name: '保存角色', exact: true }).click();
  await page.getByRole('dialog', { name: '编辑角色', exact: true }).waitFor({ state: 'hidden' }); await back();
  assert.equal((await snapshot()).history, original.history);
  assert.equal(await page.getByRole('button', { name: /^选择路线：/ }).first().isEnabled(), true);
  record('character-correction-preserves-branch', await snapshot());

  const route = page.getByRole('button', { name: /^选择路线：/ }).first(); const routeName = await route.getAttribute('aria-label');
  await route.click(); let steps = 0;
  while (!/流程完成/.test((await snapshot()).status ?? '')) {
    await rememberStep();
    assert.ok(steps++ < 250, 'story did not reach ending');
    await page.getByRole('button', { name: '继续故事', exact: true }).click();
  }
  await unchangedVisit(); await screenshot('rain-ending-restored');
  record('actual-story-route-and-ending', { routeName, steps, ...routeBudget(), checkpoint: await snapshot() });

  await structure(); await page.getByRole('button', { name: '变量', exact: true }).click();
  await page.getByRole('button', { name: '新增变量', exact: true }).click();
  await page.getByLabel('变量名称', { exact: true }).fill('校订用开关');
  await page.getByRole('button', { name: '创建变量', exact: true }).click();
  await page.getByRole('dialog', { name: '创建变量', exact: true }).waitFor({ state: 'hidden' }); await back();
  assert.match(await page.getByRole('region', { name: 'Runtime 热更新' }).innerText(), /需要明确重启试玩/);
  assert.equal(await page.getByRole('button', { name: 'Runtime 后退一步', exact: true }).isEnabled(), false);
  await screenshot('variable-restart-required');
  await page.getByRole('button', { name: '以当前启动目标重启', exact: true }).click();
  assert.equal((await snapshot()).history, '试玩记录 1/1');
  record('variable-change-explicit-restart', await snapshot());

  await page.getByRole('button', { name: '退出试玩', exact: true }).click();
  await page.getByRole('button', { name: '添加内容', exact: true }).click();
  await page.getByRole('button', { name: '添加场景', exact: true }).click();
  await page.getByLabel('新场景名称', { exact: true }).fill('临时校订场景');
  await page.getByRole('button', { name: '创建并写作', exact: true }).click(); await ready();
  const removedStart = await page.getByTestId('workspace-shell').getAttribute('data-context-scene-id');
  await page.getByText('选择试玩起点', { exact: true }).click();
  await page.getByRole('button', { name: '从当前场景运行', exact: true }).click();
  await structure(); await page.getByRole('button', { name: '删除场景临时校订场景', exact: true }).click();
  const replacement = page.getByLabel('替代实体', { exact: true });
  if (await replacement.isVisible()) {
    await replacement.selectOption({ label: '车站的雨 · 校订' });
    await page.getByRole('button', { name: '迁移引用并删除', exact: true }).click();
  } else await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('alertdialog', { name: '删除前引用分析' }).waitFor({ state: 'hidden' }); await back();
  assert.equal((await snapshot()).scene, removedStart);
  assert.equal(await page.getByRole('button', { name: '继续故事', exact: true }).isEnabled(), false);
  await screenshot('deleted-start-source-frozen');
  await page.getByRole('button', { name: '从故事入口重新试玩', exact: true }).click();
  assert.notEqual((await snapshot()).scene, removedStart);
  assert.equal((await snapshot()).history, '试玩记录 1/1');
  record('deleted-start-no-crash-entry-recovery', await snapshot());
  routeStatements = new Map(); await reachChoice();
  await page.getByRole('button', { name: /^选择路线：/ }).last().click();
  for (let step = 0; !/流程完成/.test((await snapshot()).status ?? ''); step++) {
    assert.ok(step < 250); await rememberStep();
    await page.getByRole('button', { name: '继续故事', exact: true }).click();
  }
  await unchangedVisit(); await screenshot('rain-other-ending-restored');
  record('actual-story-second-route-and-ending', { ...routeBudget(), checkpoint: await snapshot() });
  await menu('所有项目'); await page.getByRole('main', { name: '项目首页' }).waitFor();
  await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
  assert.equal(await page.getByRole('button', { name: '试玩完整流程', exact: true }).isVisible(), true);
  await page.reload(); await page.getByRole('main', { name: '项目首页' }).waitFor();
  await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready();
  assert.equal(await page.getByRole('button', { name: '试玩完整流程', exact: true }).isVisible(), true);
  record('project-close-and-browser-reload-do-not-revive-preview', { errors });
  assert.deepEqual(errors, []);
  const editorBundle = await page.locator('script[type="module"][src]').getAttribute('src');
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), url: page.url(), editorBundle, checks, errors }, null, 2));
} catch (error) {
  await screenshot('failure', false);
  await writeFile(path.join(output, 'failure-checks.json'), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2));
  throw error;
} finally { await browser.close(); }

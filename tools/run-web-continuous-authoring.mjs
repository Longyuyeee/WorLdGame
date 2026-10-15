import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, process.env.STUDIO_CONTINUOUS_OUTPUT ?? 'evidence/web-continuous-authoring');
const scratch = path.join(root, '.browser-diagnostic/continuous-authoring-output');
await mkdir(output, { recursive: true });
await mkdir(scratch, { recursive: true });
const baseline = process.argv.includes('--baseline');
const browser = await chromium.launch({ headless: true, ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await context.addInitScript(() => {
  window.authoringLongTasks = [];
  new PerformanceObserver(list => window.authoringLongTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true });
});
const page = await context.newPage(); page.setDefaultTimeout(25000);
let currentPage = page;
const errors = [], timings = [], checks = [], edits = new Map(); let completed = false;
page.on('pageerror', e => errors.push(e.message));
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
async function measure(name, fn) {
  const start = await page.evaluate(() => performance.now()); await fn();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const end = await page.evaluate(() => performance.now());
  timings.push({ name, elapsedMs: end - start, longTasks: await page.evaluate(({ start, end }) => window.authoringLongTasks.filter(t => t.start >= start && t.start < end), { start, end }) });
}
async function scene(name) {
  await nav('故事');
  if (!await page.locator('.scene-rail').isVisible()) await page.getByRole('button', { name: '场景列表', exact: true }).click();
  await page.locator('.scene-rail').getByRole('button').filter({ hasText: name }).click();
  await page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '写作', exact: true }).click();
}
async function select(id) { await page.locator(`#statement-card-${id}`).click(); }
const input = () => page.locator('.writing-text-inspector textarea');
const applied = () => page.waitForFunction(() => document.querySelector('.writing-text-inspector textarea')?.dataset.inputState === 'committed');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function menu(name) {
  await ready();
  if (!await page.locator('.project-switcher').evaluate(el => el.open)) await page.getByLabel('项目菜单', { exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
}
async function download(fn, name) {
  const download = page.waitForEvent('download'); await fn();
  const bytes = await readFile(await (await download).path()); await writeFile(path.join(scratch, name), bytes); return bytes;
}
async function focusParagraph(statement) {
  await page.waitForFunction(({ id, text }) => document.querySelector('.writing-text-inspector')?.dataset.writingStatementId === id && document.querySelector('.writing-text-inspector textarea')?.value === text, { id: statement.id, text: edits.get(statement.id) ?? statement.text });
  assert.equal(await page.locator('.writing-text-inspector').getAttribute('data-writing-statement-id'), statement.id);
  assert.equal(await input().inputValue(), edits.get(statement.id) ?? statement.text);
}
async function previewSnapshot() {
  return { location: await page.locator('.runtime-inspector__current code').textContent(), history: await page.locator('.runtime-debug-actions__history strong').textContent(), text: await page.getByTestId('preview-step').textContent() };
}
async function independentRoute(branch, ending, html) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); currentPage = p; p.on('pageerror', e => errors.push(e.message));
  await p.goto(pathToFileURL(html).href); await p.getByRole('button', { name: /^开始故事/ }).click();
  const found = new Set(), voices = new Set(); let advances = 0;
  while (await p.locator('main.player-shell').getAttribute('data-player-status') !== 'ended') {
    assert.ok(advances++ < 300, 'independent game did not reach ending');
    if (await p.locator('.player-choice button').count()) { await p.locator('.player-choice').getByRole('button', { name: branch, exact: true }).click(); continue; }
    await p.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
    const text = (await p.locator('.player-dialogue__text').innerText()).trim();
    for (const [id, changed] of edits) if (text === changed.trim()) found.add(id);
    const voice = p.locator('audio[data-audio-bus="voice"]');
    if (await voice.count()) {
      const id = await voice.getAttribute('data-asset-id');
      if (!voices.has(id)) { await p.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended); voices.add(id); }
    }
    await p.getByRole('button', { name: '继续下一句', exact: true }).click(); await p.waitForTimeout(45);
  }
  assert.match(await p.locator('.player-ending').innerText(), new RegExp(ending));
  await p.screenshot({ path: path.join(output, `independent-${ending}.png`), animations: 'disabled' });
  await ctx.close(); currentPage = page; return { branch, ending, changedStatementsSeen: [...found], advances, naturallyEndedVoices: [...voices] };
}
const zip = unzipSync(await readFile(path.join(root, 'evidence/web-story-refinement/before-rain-stops-project.zip')));
const scenes = Object.entries(zip).filter(([key]) => key.startsWith('scenes/') && key.endsWith('.json')).map(([, data]) => JSON.parse(strFromU8(data)));
const scripts = Object.entries(zip).filter(([key]) => key.startsWith('scripts/') && key.endsWith('.json')).map(([, data]) => JSON.parse(strFromU8(data)));
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  await measure('cold-import-1.6.0', async () => {
    await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-story-refinement/before-rain-stops-project.zip')); await ready();
  });
  for (const s of scenes) await measure(`switch-scene:${s.title}`, () => scene(s.title));
  const script = scripts[0], s = scenes.find(s => s.id === script.sceneId);
  const paragraph = script.statements.find(s => s.kind === 'narration');
  assert.ok(paragraph);
  await scene(s.title); await select(paragraph.id);
  const field = page.getByLabel('旁白文本', { exact: true });
  const changed = `${paragraph.text}【连续制作验证副本】`;
  await measure('edit-narration', async () => {
    await field.fill(changed);
    if (baseline) await page.getByRole('button', { name: '应用修改', exact: true }).click();
    await page.locator(`#statement-card-${paragraph.id}`).filter({ hasText: changed }).waitFor();
  });
  edits.set(paragraph.id, changed);
  await page.screenshot({ path: path.join(output, baseline ? 'baseline-writing.png' : 'continuous-writing.png'), animations: 'disabled' });
  check('all-nine-scenes-and-one-paragraph-edited', { scenes: scenes.map(s => s.title), scene: s.title, statementId: paragraph.id });
  if (!baseline) {
    const deepScene = scenes.find(s => s.title === '再一次见面');
    const paragraphs = JSON.parse(strFromU8(zip[deepScene.scriptPath])).statements.filter(s => s.kind === 'narration' || s.kind === 'dialogue');
    await scene(deepScene.title); await select(paragraphs[0].id);
    for (let i = 0; i < paragraphs.length; i++) {
      await focusParagraph(paragraphs[i]);
      if (i < 2) {
        const text = `${paragraphs[i].text}【连续校读 ${i + 1}】`; edits.set(paragraphs[i].id, text);
        await input().fill(text);
      }
      if (i < paragraphs.length - 1) await measure(`next-paragraph:${i + 1}`, async () => {
        if (i % 2) await input().press('Alt+PageDown'); else await page.getByRole('button', { name: '下一段文字', exact: true }).click();
        await focusParagraph(paragraphs[i + 1]); assert.ok(await input().evaluate(el => el === document.activeElement));
      });
    }
    assert.ok(await page.getByRole('button', { name: '下一段文字', exact: true }).isDisabled());
    // Empty drafts cannot silently disappear through either input method.
    await input().fill(''); await page.getByRole('button', { name: '上一段文字', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '文字不能为空' }).waitFor();
    assert.equal(await input().inputValue(), ''); await input().press('Escape'); await applied();
    await focusParagraph(paragraphs.at(-1));
    for (let i = paragraphs.length - 2; i >= 0; i--) { await input().press('Alt+PageUp'); await focusParagraph(paragraphs[i]); }
    await page.getByRole('button', { name: '下一段文字', exact: true }).click();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await page.waitForFunction(text => document.querySelector('.writing-text-inspector textarea')?.value === text, paragraphs[1].text);
    await page.getByRole('button', { name: '重做', exact: true }).click(); await applied(); await focusParagraph(paragraphs[1]);
    await page.setViewportSize({ width: 390, height: 844 }); await input().scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    const help = page.locator('.writing-text-inspector small');
    assert.ok(await help.isVisible()); await help.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'writing-390.png'), animations: 'disabled' });
    const hitAreas = await page.locator('.writing-text-actions button').evaluateAll(buttons => buttons.map(b => ({ label: b.textContent, width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })));
    assert.ok(hitAreas.every(r => r.width >= 44 && r.height >= 44));
    await page.setViewportSize({ width: 1440, height: 1000 });
    check('eleven-paragraph-continuity-cues-focus-undo-empty-draft-and-mobile-layout', { paragraphs: paragraphs.length, hitAreas });

    await scene('车站的雨');
    if (await page.getByRole('button', { name: '打开预览', exact: true }).count()) await page.getByRole('button', { name: '打开预览', exact: true }).click();
    await page.getByRole('button', { name: '试玩完整流程', exact: true }).click();
    const visited = new Set();
    for (let step = 0; step < 100; step++) {
      const state = await previewSnapshot(); visited.add(state.location.split(' / ')[0]);
      const currentId = state.location.split(' / ')[1]?.split(' #')[0];
      if (visited.size >= 2 && scripts.some(s => s.statements.some(t => t.id === currentId && (t.kind === 'narration' || t.kind === 'dialogue')))) break;
      const choice = page.getByRole('button', { name: /^选择路线：/ });
      if (await choice.count()) await choice.first().click(); else await page.getByRole('button', { name: '继续故事', exact: true }).click();
    }
    assert.ok(visited.size >= 2); const before = await previewSnapshot();
    await page.getByRole('button', { name: '修改当前内容', exact: true }).click(); await input().waitFor();
    const id = await page.locator('.writing-text-inspector').getAttribute('data-writing-statement-id');
    const revision = `${await input().inputValue()}【试玩定位修订】`; edits.set(id, revision);
    await input().fill(revision); await applied();
    await page.getByRole('button', { name: '返回试玩', exact: true }).click();
    await page.getByTestId('preview-step').filter({ hasText: revision }).waitFor();
    const revised = await previewSnapshot(); assert.equal(revised.location, before.location); assert.equal(revised.history, before.history);
    for (const task of ['素材', '检查']) { await nav(task); await nav('故事'); assert.deepEqual(await previewSnapshot(), revised); }
    await menu('章节与角色'); await page.getByRole('main', { name: '项目结构管理', exact: true }).waitFor();
    await page.getByRole('button', { name: '返回创作', exact: true }).click(); await ready(); assert.deepEqual(await previewSnapshot(), revised);
    await page.screenshot({ path: path.join(output, 'cross-scene-revision-returned.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '退出试玩', exact: true }).click();
    check('full-project-cross-scene-preview-revision-and-three-workspace-returns', { visited: [...visited], revised });

    await measure('save-and-return-home', async () => { await menu('所有项目'); await page.getByRole('main', { name: '项目首页', exact: true }).waitFor(); });
    await page.reload();
    await measure('cold-reopen-1.6.0-copy', async () => { await page.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready(); });
    for (const [id, text] of edits) {
      const originalScript = scripts.find(s => s.statements.some(s => s.id === id)), sc = scenes.find(s => s.id === originalScript.sceneId);
      await scene(sc.title); await select(id); assert.equal(await input().inputValue(), text);
    }
    const exported = await download(() => menu('导出工程 ZIP'), 'continuous-writing-project.zip');
    const saved = unzipSync(exported); let blobs = 0;
    for (const [key, original] of Object.entries(zip)) {
      if (key.startsWith('.world-assets/blobs/')) { assert.equal(sha(saved[key]), sha(original)); blobs++; }
      if (key.startsWith('scripts/')) {
        const expected = JSON.parse(strFromU8(original));
        expected.statements = expected.statements.map(s => edits.has(s.id) ? { ...s, text: edits.get(s.id) } : s);
        assert.deepEqual(JSON.parse(strFromU8(saved[key])), expected);
      }
      if (key.startsWith('scenes/')) assert.deepEqual(JSON.parse(strFromU8(saved[key])), JSON.parse(strFromU8(original)));
    }
    check('saved-reopened-and-exported-four-edits-with-stable-scripts-scenes-and-all-25-blobs', { edits: Object.fromEntries(edits), blobs, sourceArchiveSha256: sha(exported) });
    await nav('发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
    await page.getByRole('radio', { name: /单文件 HTML/ }).check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
    await page.getByText('故事与素材检查通过', { exact: true }).waitFor(); await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click();
    await page.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 90000 });
    const html = await download(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), 'continuous-writing.html');
    const routes = [];
    for (const [branch, ending] of [['留下等雨停', '同行的约定'], ['去追最后一班车', '远行的约定']]) routes.push(await independentRoute(branch, ending, path.join(scratch, 'continuous-writing.html')));
    const seen = new Set(routes.flatMap(r => r.changedStatementsSeen)); assert.deepEqual([...seen].sort(), [...edits.keys()].sort());
    check('fresh-editor-html-both-independent-endings-and-every-saved-text-edit', { htmlSha256: sha(html), routes, candidateUnchanged: true });
  }
  assert.deepEqual(errors, []); completed = true;
} catch (e) {
  await currentPage.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
  await writeFile(path.join(output, 'failure.txt'), `${e.stack}\n${(await currentPage.locator('body').innerText()).slice(0, 16000)}`); throw e;
} finally {
  await writeFile(path.join(output, baseline ? 'baseline.json' : 'browser-checks.json'), JSON.stringify({ passed: completed && errors.length === 0, checks, timings, errors, browser: browser.version(), physicalPhone: false, statisticalBenchmark: false }, null, 2));
  await browser.close();
}

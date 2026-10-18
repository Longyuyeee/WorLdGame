import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-branch-authoring');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const editor = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
editor.setDefaultTimeout(20000);
const checks = [], errors = [], artifacts = {};
const watch = page => page.on('pageerror', error => errors.push(error.message)); watch(editor);
const check = detail => { checks.push(detail); console.log(JSON.stringify(detail)); };
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const ready = () => editor.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const clean = () => editor.waitForFunction(() => document.querySelector('[data-nav-item="publish"]')?.disabled === false);
const nav = name => editor.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const select = id => editor.locator(`#statement-card-${id}`).click();
const apply = async () => { await editor.getByRole('form').filter({ has: editor.getByRole('button', { name: '应用修改', exact: true }) }).getByRole('button', { name: '应用修改', exact: true }).click(); await clean(); };
async function fit(page, selector) {
  const result = await page.locator(selector).evaluate(item => {
    const r = item.getBoundingClientRect(); return { left: r.left, right: r.right, viewport: innerWidth, width: item.clientWidth, scroll: item.scrollWidth };
  }); assert.ok(result.left >= -1 && result.right <= result.viewport + 1 && result.scroll <= result.width + 1, JSON.stringify(result));
}
async function generateAssignment(id, value, operation) {
  await select(id);
  if (operation) await editor.getByLabel('变量修改方式', { exact: true }).selectOption(operation);
  const input = editor.getByLabel('变量的新值', { exact: true });
  if (await input.evaluate(item => item.tagName === 'SELECT')) await input.selectOption(value); else await input.fill(value);
  await editor.getByRole('button', { name: '生成赋值表达式', exact: true }).click();
  assert.ok(await editor.locator('[data-nav-item="publish"]').isDisabled()); await shot(editor, `${id}-generated`);
  if (id === 'set_count') { await editor.setViewportSize({ width: 390, height: 844 }); await fit(editor, '.expression-builder'); await shot(editor, 'number-builder-mobile'); await editor.setViewportSize({ width: 1440, height: 1000 }); }
  await apply();
}
async function saveDownload(trigger, name) {
  const pending = editor.waitForEvent('download'); await trigger(); const target = path.join(output, name); await (await pending).saveAs(target);
  const bytes = await readFile(target); artifacts[name] = { byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; return bytes;
}
try {
  await editor.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/');
  await editor.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(output, 'branch-authoring-fixture.zip')); await ready();
  await select('choice');
  await editor.getByRole('button', { name: '添加选项', exact: true }).click();
  assert.ok(await editor.getByRole('form', { name: '选择类型化参数' }).getByRole('button', { name: '应用修改', exact: true }).isDisabled());
  assert.ok(await editor.getByRole('button', { name: '进入选项 3 的目标场景', exact: true }).isDisabled());
  await editor.getByLabel('选项文本', { exact: true }).nth(2).fill('这次先不添加');
  await editor.getByRole('button', { name: '放弃修改', exact: true }).click(); await clean();
  assert.equal(await editor.getByLabel('选项文本', { exact: true }).count(), 2);
  const revision = Number(await editor.getByTestId('workspace-shell').getAttribute('data-source-revision'));
  await editor.getByRole('button', { name: '添加选项', exact: true }).click();
  await editor.getByLabel('选项文本', { exact: true }).nth(2).fill('和朋友同行'); await editor.getByLabel('选项 3 的目标场景', { exact: true }).selectOption('scene_c');
  await editor.getByRole('button', { name: '上移选项 3', exact: true }).click(); await editor.getByRole('button', { name: '上移选项 2', exact: true }).click();
  await editor.getByRole('button', { name: '删除选项 3', exact: true }).click();
  await editor.getByRole('button', { name: '添加选项', exact: true }).click();
  await editor.getByLabel('选项文本', { exact: true }).nth(2).fill('乘车出发'); await editor.getByLabel('选项 3 的目标场景', { exact: true }).selectOption('scene_b'); await apply();
  assert.equal(Number(await editor.getByTestId('workspace-shell').getAttribute('data-source-revision')), revision + 1);
  await editor.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await editor.getByLabel('选项文本', { exact: true }).count(), 2);
  await editor.getByRole('button', { name: '重做', exact: true }).click(); assert.equal(await editor.getByLabel('选项文本', { exact: true }).count(), 3);
  const sceneOptions = await editor.getByLabel('选项 1 的目标场景', { exact: true }).locator('option').allTextContents();
  assert.ok(!sceneOptions.some(name => name.includes('标签'))); assert.equal(sceneOptions.length, 4);
  await editor.getByRole('button', { name: '编辑选项 1', exact: true }).click();
  await editor.getByRole('form', { name: '选择类型化参数' }).scrollIntoViewIfNeeded(); await fit(editor, '.choice-inspector'); await shot(editor, 'choice-desktop');
  await editor.locator('.editor-preferences > summary').click(); await editor.getByRole('button', { name: '石墨', exact: true }).click(); await editor.locator('.editor-preferences > summary').click(); await shot(editor, 'choice-dark');
  await editor.locator('.editor-preferences > summary').click(); await editor.getByRole('button', { name: '清亮', exact: true }).click(); await editor.locator('.editor-preferences > summary').click();
  await editor.setViewportSize({ width: 390, height: 844 }); await fit(editor, '.choice-inspector');
  await editor.getByRole('button', { name: '添加选项', exact: true }).scrollIntoViewIfNeeded(); await shot(editor, 'choice-mobile-actions');
  await editor.setViewportSize({ width: 1440, height: 1000 });
  check('draft cancel keeps two options; add/remove/reorder apply once; one Undo/Redo restores full option group; only real scenes offered; light/dark and 390px controls fit');
  await editor.getByRole('button', { name: '进入选项 1 的目标场景', exact: true }).click();
  assert.equal(await editor.getByTestId('workspace-shell').getAttribute('data-context-scene-id'), 'scene_c');
  await editor.getByLabel('旁白文本', { exact: true }).fill('你和朋友并肩走出车站。');
  assert.ok(await editor.getByRole('button', { name: '返回分支', exact: true }).isDisabled()); await apply();
  await shot(editor, 'target-scene-return'); await editor.getByRole('button', { name: '返回分支', exact: true }).click();
  assert.equal(await editor.getByTestId('workspace-shell').getAttribute('data-context-statement-id'), 'choice');
  check('enter selected target, edit its narration with pending-input protection, return to exact original choice');
  await generateAssignment('set_count', '2', 'add'); await generateAssignment('set_ready', 'true'); await generateAssignment('set_note', '雨后的"约定"');
  await select('condition');
  assert.equal(await editor.getByLabel('条件表达式（可手动编辑复杂条件）', { exact: true }).inputValue(), 'ready && count >= 2');
  await editor.getByLabel('判断变量', { exact: true }).selectOption('ready');
  assert.equal(await editor.getByLabel('比较值类型', { exact: true }).inputValue(), 'boolean'); assert.ok(await editor.getByLabel('比较值类型', { exact: true }).isDisabled());
  await editor.getByRole('button', { name: '生成条件表达式', exact: true }).click(); assert.ok(await editor.locator('[data-nav-item="publish"]').isDisabled());
  await editor.getByRole('button', { name: '放弃修改', exact: true }).click(); await clean();
  assert.equal(await editor.getByLabel('条件表达式（可手动编辑复杂条件）', { exact: true }).inputValue(), 'ready && count >= 2');
  for (const [expression, message] of [['count + 1', '类型不匹配'], ['(count +', '不完整']]) {
    await editor.getByLabel('条件表达式（可手动编辑复杂条件）', { exact: true }).fill(expression);
    await editor.getByRole('button', { name: '应用修改', exact: true }).click(); assert.ok((await editor.getByRole('alert').innerText()).includes(message));
    await editor.getByRole('button', { name: '放弃修改', exact: true }).click(); await clean();
  }
  await editor.getByLabel('判断变量', { exact: true }).selectOption('ready'); await editor.getByRole('button', { name: '生成条件表达式', exact: true }).click(); await apply();
  await shot(editor, 'typed-condition');
  check('numeric increase, boolean and quoted Chinese text applied; declared boolean comparison locked to type; complex condition preserved until explicit generation, discard restores it; wrong-type/incomplete expressions show errors without source changes');
  await editor.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '脚本', exact: true }).click();
  const text = await editor.getByLabel('权威脚本编辑器', { exact: true }).inputValue();
  assert.ok(text.includes('set count = count + 2') && text.includes('set ready = true') && text.includes('if ready == true -> choose'));
  assert.ok(text.includes('@id(option_a)') && !text.includes('@id(option_b)'));
  await editor.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '写作', exact: true }).click();
  for (const [label, ending] of [['和朋友同行', '同行的约定'], ['留在车站', '留下的约定'], ['乘车出发', '远行的约定']]) {
    await editor.getByRole('button', { name: '试玩完整流程', exact: true }).click();
    await editor.getByRole('button', { name: `选择路线：${label}`, exact: true }).click();
    await editor.getByRole('button', { name: '继续故事', exact: true }).click();
    await editor.getByText(`流程完成：${ending}`, { exact: true }).waitFor(); await editor.getByRole('button', { name: '退出试玩', exact: true }).click();
  }
  check('actual Editor Runtime follows the generated condition and all three edited options to their distinct endings');
  await ready(); await editor.getByLabel('项目菜单', { exact: true }).click();
  const sourceBytes = await saveDownload(() => editor.getByRole('button', { name: /导出工程 ZIP/ }).click(), 'branch-authoring-edited.zip');
  const source = unzipSync(sourceBytes), entryScript = JSON.parse(strFromU8(source['scripts/entry.json']));
  const options = entryScript.statements.find(item => item.kind === 'choice').options;
  assert.deepEqual(options.map(item => [item.label, item.targetSceneId]), [['和朋友同行', 'scene_c'], ['留在车站', 'scene_a'], ['乘车出发', 'scene_b']]);
  assert.equal(options[1].id, 'option_a'); assert.ok(!options.some(item => item.id === 'option_b'));
  assert.equal(entryScript.statements.find(item => item.id === 'set_note').expression, JSON.stringify('雨后的"约定"'));
  assert.equal(JSON.parse(strFromU8(source['scripts/scene_c.json'])).statements[0].text, '你和朋友并肩走出车站。');
  await nav('发布'); await editor.getByRole('button', { name: '继续：导出方式 →', exact: true }).click(); await editor.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await editor.getByText('故事与素材检查通过', { exact: true }).waitFor(); await editor.getByRole('button', { name: '构建试玩 HTML', exact: true }).click();
  await editor.getByRole('link', { name: '下载游戏', exact: true }).waitFor({ timeout: 60000 });
  await saveDownload(() => editor.getByRole('link', { name: '下载游戏', exact: true }).click(), 'branch-authoring.html');
  await nav('故事'); await ready(); await editor.getByLabel('项目菜单', { exact: true }).click(); await editor.getByRole('button', { name: /所有项目/ }).click();
  await editor.reload(); await editor.getByRole('button', { name: /^打开项目：分支创作流程/ }).click(); await ready();
  await editor.locator('.scene-rail').getByRole('button').filter({ hasText: '车站选择' }).click(); await select('choice');
  assert.equal(await editor.getByLabel('选项文本', { exact: true }).count(), 3); assert.equal(await editor.getByLabel('选项文本', { exact: true }).first().inputValue(), '和朋友同行');
  check('edited source ZIP and real HTML exported; surviving IDs/order/typed expressions and target text verified in ZIP; saved project survives home/reload/reopen');
  for (const [label, ending, width] of [['和朋友同行', '同行的约定', 390], ['留在车站', '留下的约定', 1280], ['乘车出发', '远行的约定', 1280]]) {
    const player = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 500, isMobile: width < 500, reducedMotion: 'reduce' }); watch(player);
    await player.goto(pathToFileURL(path.join(output, 'branch-authoring.html')).href); await player.getByRole('button', { name: /^开始故事/ }).click();
    const list = player.locator('.player-choice'); await list.getByRole('button', { name: new RegExp(label) }).waitFor();
    const captions = await list.getByRole('button').allTextContents(); assert.equal(captions.length, 3);
    if (width < 500) await shot(player, 'player-three-choices-mobile');
    await list.getByRole('button', { name: new RegExp(label) }).click();
    if (label === '和朋友同行') { await player.getByText('你和朋友并肩走出车站。', { exact: true }).waitFor(); assert.equal(await player.locator('.player-dialogue__text').innerText(), '你和朋友并肩走出车站。'); }
    for (let step = 0; step < 8 && await player.locator('main').getAttribute('data-player-status') !== 'ended'; step++) {
      await player.getByRole('button', { name: '继续下一句', exact: true }).click(); await player.waitForTimeout(40);
    }
    assert.equal(await player.locator('main').getAttribute('data-player-status'), 'ended'); assert.ok((await player.locator('.player-ending').innerText()).includes(ending));
    await shot(player, `player-ending-${width}-${ending}`); await player.close();
  }
  check('exported local HTML plays all three edited branches to distinct endings in isolated contexts, including 390px; this is a short authoring fixture, not a rerun of Rain Before candidate');
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: errors.length === 0, browser: browser.version(), checks, artifacts, errors, candidateReissued: false, fullRainRoutesRerun: false, physicalPhone: false }, null, 2));
  process.exitCode = errors.length ? 1 : 0;
} catch (error) {
  const last = browser.contexts().flatMap(context => context.pages()).at(-1);
  if (last) { await shot(last, 'failure'); console.log('failure page:', (await last.locator('body').innerText()).slice(-4500)); }
  await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2)); throw error;
} finally { await browser.close(); }

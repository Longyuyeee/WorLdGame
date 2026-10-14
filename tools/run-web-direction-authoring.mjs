import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, copyFile, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-direction-authoring');
await mkdir(output, { recursive: true });
const json = value => strToU8(JSON.stringify(value));
const fixture = unzipSync(await readFile(path.join(root, 'evidence/web-branch-authoring/branch-authoring-fixture.zip')));
const media = unzipSync(await readFile(path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip')));
for (const [key, bytes] of Object.entries(media)) if (key.startsWith('.world-assets/')) fixture[key] = bytes;
fixture['domain/assets.json'] = media['domain/assets.json'];
const manifest = JSON.parse(strFromU8(fixture['world.project.json']));
manifest.projectId = 'direction_authoring_fixture'; manifest.title = '演出创作流程';
manifest.webPublication = { schemaVersion: 1, name: '演出创作流程', version: '0.1.0', iconAssetId: 'letter_icon' };
fixture['world.project.json'] = json(manifest);
fixture['.world-assets/bundle.json'] = json({ ...JSON.parse(strFromU8(fixture['.world-assets/bundle.json'])), projectId: manifest.projectId });
const direction = (id, command, summary) => ({ id, kind: 'direction', command, summary });
fixture['scripts/entry.json'] = json({ schemaVersion: 1, sceneId: 'entry', statements: [
  direction('background', 'background', 'action=set asset=sample_station'),
  direction('original_actor', 'show', 'action=show asset=xia_letter slot=primary position=left'),
  { id: 'stage_line_a', kind: 'narration', textId: 'test_text_a', text: '两位角色一起站在雨后的车站。' },
  { id: 'stage_line_b', kind: 'narration', textId: 'test_text_b', text: '左侧角色离开，右侧角色留下。' },
  { id: 'test_end', kind: 'end', endingName: '演出完成' }
] });
const fixtureBytes = zipSync(fixture, { level: 0 });
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(20000);
const checks = [], errors = [], artifacts = {}; let exportedHtmlPath, temporaryDirectory;
const watch = p => p.on('pageerror', error => errors.push(error.message)); watch(page);
const check = name => { checks.push(name); console.log(name); };
const ready = () => page.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const clean = () => page.waitForFunction(() => document.querySelector('[data-nav-item="publish"]')?.disabled === false);
const nav = name => page.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name, exact: true }).click();
const select = id => page.locator(`#statement-card-${id}`).click();
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const currentId = () => page.getByTestId('workspace-shell').getAttribute('data-context-statement-id');
async function fit(selector) { const r = await page.locator(selector).evaluate(el => { const rect = el.getBoundingClientRect(); return { left: rect.left, right: rect.right, viewport: innerWidth, width: el.clientWidth, scroll: el.scrollWidth }; }); assert.ok(r.left >= -1 && r.right <= r.viewport + 1 && r.scroll <= r.width + 1, JSON.stringify(r)); }
async function add(label) { await page.getByLabel('场景演出快捷操作').getByRole('button', { name: label, exact: true }).click(); return page.getByRole('dialog'); }
async function submit(dialog) { await dialog.getByRole('button', { name: '插入演出', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); await clean(); return currentId(); }
async function download(trigger, key) { const wait = page.waitForEvent('download'); await trigger(); const path = await (await wait).path(), bytes = await readFile(path); artifacts[key] = { byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; return { path, bytes }; }
try {
  await page.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/');
  await page.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles({ name: 'direction-authoring-fixture.zip', mimeType: 'application/zip', buffer: Buffer.from(fixtureBytes) }); await ready();
  await page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '演出', exact: true }).click();
  await select('background');
  await page.getByRole('button', { name: '浏览素材', exact: true }).click();
  await page.getByLabel('搜索演出素材').fill('画室');
  await page.getByRole('button', { name: '选择素材：雨后的画室', exact: true }).click();
  assert.ok(await page.locator('[data-nav-item="publish"]').isDisabled());
  await page.getByRole('button', { name: '放弃演出修改', exact: true }).click(); await clean();
  await page.getByRole('button', { name: '浏览素材', exact: true }).click();
  await page.getByLabel('搜索演出素材').fill('');
  const galleryRevision = await page.getByTestId('workspace-shell').getAttribute('data-source-revision');
  await page.getByLabel('搜索演出素材').press('Enter'); await page.getByLabel('搜索演出素材').press('Control+Enter'); await page.getByLabel('搜索演出素材').press('Alt+2');
  assert.equal(await page.getByRole('dialog').count(), 1); assert.equal(await page.getByTestId('workspace-shell').getAttribute('data-source-revision'), galleryRevision);
  await fit('.direction-asset-dialog'); await shot('background-gallery-desktop');
  await page.setViewportSize({ width: 390, height: 844 }); await fit('.direction-asset-dialog'); await shot('background-gallery-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('搜索演出素材').press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await select('original_actor');
  let dialog = await add('添加角色');
  assert.equal(await dialog.getByLabel('新增角色槽位选择').inputValue(), 'actor_1');
  await dialog.getByLabel('搜索演出素材').fill('笑');
  await dialog.locator('.asset-library-card img').waitFor(); await dialog.locator('.asset-library-card img').evaluate(img => img.decode());
  await shot('character-gallery-dialog');
  await dialog.getByRole('button', { name: '选择素材：小夏·安心微笑', exact: true }).click();
  await dialog.getByLabel('新增角色位置').selectOption('right');
  const newActor = await submit(dialog);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await page.locator(`#statement-card-${newActor}`).count(), 0);
  await page.getByRole('button', { name: '重做', exact: true }).click(); assert.equal(await page.locator(`#statement-card-${newActor}`).count(), 1);
  await select(newActor);
  check('visual background search/cancel protects canonical draft; 390px gallery fits; new actor uses a distinct slot; insertion Undo/Redo');
  dialog = await add('添加角色'); await dialog.getByLabel('新增演出动作').selectOption('move');
  assert.equal(await dialog.getByLabel('新增角色槽位选择').inputValue(), ''); assert.ok(await dialog.getByRole('button', { name: '插入演出', exact: true }).isDisabled());
  await dialog.getByLabel('新增角色槽位选择').selectOption('actor_1');
  await dialog.getByLabel('新增移动水平位置').fill('70'); await dialog.getByLabel('新增移动垂直位置').fill('100');
  await submit(dialog);
  await select('stage_line_a'); dialog = await add('添加角色'); await dialog.getByLabel('新增演出动作').selectOption('hide');
  await dialog.getByLabel('新增角色槽位选择').selectOption('primary'); await shot('choose-actor-to-exit'); await submit(dialog);
  await select(newActor); await page.locator('.direction-inspector').scrollIntoViewIfNeeded();
  await page.locator('.direction-asset-picker__selected img').waitFor();
  assert.ok(await page.locator('.direction-asset-picker__selected img').evaluate(img => img.getBoundingClientRect().height <= img.parentElement.getBoundingClientRect().height + 1));
  assert.equal(await page.locator('.direction-advanced').first().evaluate(el => el.open), false);
  await page.locator('.editor-preferences > summary').click(); await page.getByRole('button', { name: '石墨', exact: true }).click(); await page.locator('.editor-preferences > summary').click(); await shot('character-inspector-dark');
  await page.locator('.editor-preferences > summary').click(); await page.getByRole('button', { name: '清亮', exact: true }).click(); await page.locator('.editor-preferences > summary').click();
  await page.setViewportSize({ width: 390, height: 844 }); await fit('.direction-inspector'); await shot('character-inspector-mobile'); await page.setViewportSize({ width: 1440, height: 1000 });
  check('multiple actors require an explicit move/exit target; positions are human-readable; precision fields collapsed; dark and 390px inspector');
  await select('background'); dialog = await add('添加声音');
  await dialog.getByLabel('搜索演出素材').fill('原创合成音乐');
  await dialog.getByRole('button', { name: '选择素材：夜行与回信（原创合成音乐）', exact: true }).click();
  assert.ok(await dialog.getByLabel('循环播放音频').isChecked());
  await dialog.getByLabel('新增音频总线').selectOption('voice'); assert.ok(!await dialog.getByLabel('循环播放音频').isChecked());
  await dialog.getByLabel('新增音频总线').selectOption('bgm'); assert.ok(await dialog.getByLabel('循环播放音频').isChecked());
  await dialog.locator('audio').waitFor(); await dialog.locator('audio').evaluate(async el => { await el.play(); });
  await page.waitForFunction(() => { const el = document.querySelector('dialog audio'); return el && !el.paused && el.currentTime > 0; });
  await shot('audio-listen-before-insert'); await submit(dialog);
  check('music can be listened to before insertion; music/ambient loop and voice/effects one-shot defaults');
  await ready(); await page.getByLabel('项目菜单', { exact: true }).click();
  const source = await download(() => page.getByRole('button', { name: /导出工程 ZIP/ }).click(), 'sourceZip');
  const files = unzipSync(source.bytes), script = JSON.parse(strFromU8(files['scripts/entry.json']));
  const actors = script.statements.filter(statement => statement.kind === 'direction' && statement.command === 'show');
  assert.ok(actors.some(statement => statement.summary.includes('slot=actor_1') && statement.summary.includes('asset=xia_smile')));
  assert.ok(actors.some(statement => statement.summary.includes('action=move') && statement.summary.includes('slot=actor_1') && statement.summary.includes('x=70')));
  assert.ok(actors.some(statement => statement.summary.includes('action=hide') && statement.summary.includes('slot=primary')));
  for (const [key, bytes] of Object.entries(media)) if (key.startsWith('.world-assets/blobs/')) assert.deepEqual(files[key], bytes);
  await page.getByLabel('项目菜单', { exact: true }).click(); await page.getByRole('button', { name: /所有项目/ }).click(); await page.reload();
  await page.getByRole('button', { name: /打开项目：演出创作流程/ }).click(); await ready();
  await page.getByRole('navigation', { name: '故事工作区' }).getByRole('button', { name: '演出', exact: true }).click();
  await select(newActor); assert.equal(await page.getByLabel('角色槽位选择').inputValue(), 'actor_1');
  check('source ZIP retains target IDs and all original media bytes; saved project survives home/reload/reopen');
  await nav('发布'); await page.getByRole('button', { name: '继续：导出方式 →', exact: true }).click();
  await page.getByRole('radio', { name: /单文件 HTML/ }).check(); await page.getByRole('button', { name: '继续：生成游戏 →', exact: true }).click();
  await page.getByText('故事与素材检查通过', { exact: true }).waitFor(); await page.getByRole('button', { name: '构建试玩 HTML', exact: true }).click();
  const html = await download(() => page.getByRole('link', { name: '下载游戏', exact: true }).click(), 'singleHtml');
  // Download.path() has no extension: Chromium opens that file as plain text. Preserve .html for a real local launch.
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'world-direction-authoring-')); exportedHtmlPath = path.join(temporaryDirectory, 'direction-authoring.html'); await copyFile(html.path, exportedHtmlPath);
  const player = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); watch(player);
  await player.goto(pathToFileURL(exportedHtmlPath).href); await player.getByRole('button', { name: /^开始故事/ }).click();
  await player.getByText('两位角色一起站在雨后的车站。', { exact: true }).waitFor();
  await player.waitForFunction(() => document.querySelectorAll('[data-stage-slot]').length === 2 && [...document.querySelectorAll('[data-stage-slot]')].every(el => el.tagName === 'CANVAS' ? el.dataset.canvasSampling === 'ready' : el.naturalWidth > 0));
  assert.deepEqual((await player.locator('[data-stage-slot]').evaluateAll(elements => elements.map(el => el.dataset.stageSlot))).sort(), ['actor_1', 'primary']);
  assert.equal(await player.locator('[data-stage-slot="actor_1"]').evaluate(el => el.style.left), '70%');
  await player.screenshot({ path: path.join(output, 'player-two-actors-mobile.png') });
  await player.getByRole('button', { name: '继续下一句', exact: true }).click();
  await player.getByText('左侧角色离开，右侧角色留下。', { exact: true }).waitFor();
  await player.waitForFunction(() => document.querySelectorAll('[data-stage-slot]').length === 1);
  assert.equal(await player.locator('[data-stage-slot]').getAttribute('data-stage-slot'), 'actor_1');
  await player.screenshot({ path: path.join(output, 'player-one-actor-mobile.png') });
  await player.getByRole('button', { name: '继续下一句', exact: true }).click(); await player.locator('main[data-player-status="ended"]').waitFor();
  assert.ok((await player.locator('.player-ending').innerText()).includes('演出完成')); await player.close();
  check('formal exported HTML opens locally at 390px; two real portraits render; correct actor exits; full short story reaches its ending');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, browser: browser.version(), editor: process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5194/', fixture: { derivedFrom: 'branch-authoring fixture plus unchanged Rain 1.5.4 media', projectId: manifest.projectId, shortStory: true }, checks, errors, artifacts, artifactPolicy: 'Downloads are verified in temporary storage; large duplicate source/HTML files are not committed.' }, null, 2));
} catch (error) {
  await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ checks, errors, error: String(error), stack: error.stack }, null, 2)); await shot('failure'); throw error;
} finally { await browser.close(); if (exportedHtmlPath) await unlink(exportedHtmlPath); if (temporaryDirectory) await rmdir(temporaryDirectory); }

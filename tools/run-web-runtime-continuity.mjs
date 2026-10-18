import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { buildPlayerExportRuntime } from './player-export-bundle.mjs';
import { sha, json, readGamePayload } from './audit-rain-story-refinement.mjs';

const require = createRequire(import.meta.url);
let engines;
try { engines = require('playwright'); }
catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'evidence/web-playback-responsiveness');
await mkdir(output, { recursive: true });
const archive = await readFile(path.join(root, 'evidence/web-audio-compatibility/before-rain-stops-web.zip'));
const original = unzipSync(archive), current = { ...original }, runtime = await buildPlayerExportRuntime();
current['player.js'] = new TextEncoder().encode(runtime.javascript);
current['player.css'] = new TextEncoder().encode(runtime.css);
const payload = readGamePayload(new TextDecoder().decode(original['index.html']));
const source = unzipSync(await readFile(path.join(root, 'evidence/web-audio-compatibility/before-rain-stops-project.zip')));
const statements = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => json(bytes).statements);
const byText = new Map(statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).map(s => [s.text, s]));
let served = original, browser, active;
const errors = [], checks = [], routes = [];
const hash = page => page.locator('main.player-shell').getAttribute('data-runtime-state-hash');
const watch = page => { active = page; page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e))); };
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://local').pathname.slice(1) || 'index.html', bytes = served[name];
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(name)] ?? 'application/octet-stream';
  res.writeHead(bytes ? 200 : 404, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(bytes ?? 'Missing');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

async function open(page, reload = false) {
  const expectedRuntimeHash = sha(served['player.js']);
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/player.js');
  if (reload) await page.reload(); else await page.goto(url);
  assert.equal(sha(await (await pending).body()), expectedRuntimeHash, 'actual browser response must be the intended runtime');
}

async function slots(page, tab = '备份') {
  const existing = page.getByRole('dialog', { name: '存读档槽位', exact: true });
  if (!await existing.isVisible()) {
    if (await page.getByRole('button', { name: '读取存档', exact: true }).isVisible()) await page.getByRole('button', { name: '读取存档', exact: true }).click();
    else {
      const menu = page.getByRole('dialog', { name: '阅读菜单', exact: true });
      if (!await menu.isVisible()) await page.getByRole('button', { name: '打开阅读菜单', exact: true }).click();
      await page.getByRole('button', { name: '存读档', exact: true }).click();
    }
  }
  await existing.getByRole('button', { name: tab, exact: true }).click();
  return existing;
}
async function backup(page, selection, name) {
  const panel = await slots(page);
  await panel.getByLabel('备份进度', { exact: true }).selectOption(selection);
  const pending = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出备份文件', exact: true }).click();
  const bytes = await readFile(await (await pending).path());
  await writeFile(path.join(output, name), bytes);
  await panel.getByRole('button', { name: '关闭存读档', exact: true }).click();
  return { bytes, slot: json(bytes).payload.slot };
}
async function explicitLoad(page, button) {
  await button.click();
  await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded' || document.querySelector('.player-load-confirm'));
  const confirm = page.locator('.player-load-confirm');
  if (await confirm.isVisible()) await confirm.getByRole('button', { name: '确认读取', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'loaded');
}
async function next(page) {
  await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.stageImagesPending === 'false');
  const text = (await page.locator('.player-dialogue__text').innerText()).trim();
  assert.ok(byText.has(text), text);
  const voice = page.locator('audio[data-audio-bus="voice"]');
  if (await voice.count()) await page.waitForFunction(() => document.querySelector('audio[data-audio-bus="voice"]')?.ended);
  assert.equal(await page.locator('.player-media-error').count(), 0);
  await page.getByRole('button', { name: '继续下一句', exact: true }).click();
  return byText.get(text);
}
try {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    browser = await engines[engine].launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); watch(page); served = original;
    await open(page); await page.getByRole('button', { name: '开始故事', exact: true }).click();
    const seen = new Set();
    while (seen.size < 20) { assert.equal(await page.locator('.player-choice button').count(), 0); seen.add((await next(page)).id); }
    const oldHash = await hash(page);
    await page.getByRole('button', { name: '打开阅读菜单', exact: true }).click();
    await page.getByRole('button', { name: '快速保存', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main.player-shell')?.dataset.saveOperation === 'saved');
    const old = await backup(page, 'current', `${engine}-original.worldsave`);
    assert.equal(old.slot.runtimeStateHash, oldHash);
    served = current; await open(page, true);
    const quick = await slots(page, '快速');
    await explicitLoad(page, quick.getByRole('button', { name: '读取', exact: true }));
    assert.equal(await hash(page), oldHash);
    const restored = await backup(page, 'current', `${engine}-restored.worldsave`);
    assert.equal(restored.slot.serializedSessionSave, old.slot.serializedSessionSave);
    assert.equal(restored.slot.sessionArtifactHash, old.slot.sessionArtifactHash);
    const panel = await slots(page);
    await panel.getByLabel('选择存档备份文件', { exact: true }).setInputFiles({ name: 'original.worldsave', mimeType: 'application/json', buffer: old.bytes });
    await panel.getByText('备份校验通过，请选择手动槽位后导入。', { exact: true }).waitFor();
    await panel.getByRole('button', { name: '导入到所选槽位', exact: true }).click();
    const load = panel.getByRole('button', { name: '读取导入的存档', exact: true }); await load.waitFor();
    assert.equal(await hash(page), oldHash); await explicitLoad(page, load);
    assert.equal(await hash(page), oldHash);
    const imported = await backup(page, 'manual-1', `${engine}-imported.worldsave`);
    assert.equal(imported.slot.serializedSessionSave, old.slot.serializedSessionSave);
    assert.equal(imported.slot.sessionArtifactHash, old.slot.sessionArtifactHash);
    checks.push({ engine, browser: browser.version(), oldProgressTexts: seen.size, oldHash, serializedSessionUnchanged: true, artifactHashUnchanged: true, explicitQuickLoadAndBackupImport: true });
    console.log(`PASS ${engine} original runtime → current runtime save/backup continuity`);
    await context.close();
    for (const [branch, ending] of [['留下等雨停', '同行的约定'], ['去追最后一班车', '远行的约定']]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const page = await context.newPage(); watch(page); served = current;
      await open(page); await page.getByRole('button', { name: '开始故事', exact: true }).click();
      const ids = [], voices = new Set(), narrations = new Set();
      for (let i = 0; i < 500; i++) {
        if (await page.locator('main.player-shell').getAttribute('data-player-status') === 'ended') break;
        if (await page.locator('.player-choice button').count()) { await page.locator('.player-choice').getByRole('button', { name: branch, exact: true }).click(); continue; }
        const statement = await next(page);
        if (ids.at(-1) !== statement.id) ids.push(statement.id);
        (statement.kind === 'dialogue' ? voices : narrations).add(statement.id);
      }
      assert.equal(await page.locator('main.player-shell').getAttribute('data-player-status'), 'ended');
      assert.match(await page.locator('.player-ending').innerText(), new RegExp(ending));
      assert.equal(ids.length, 66); assert.equal(narrations.size, 60); assert.equal(voices.size, 6);
      assert.equal(await page.locator('audio').count(), 0);
      routes.push({ engine, branch, ending, textIds: ids, naturallyEndedVoices: voices.size });
      await page.screenshot({ path: path.join(output, `${engine}-${ending}.png`) });
      console.log(`PASS ${engine} current runtime full route ${ending}`); await context.close();
    }
    await browser.close(); browser = null;
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'continuity.json'), JSON.stringify({ passed: true, originalArchiveSha256: sha(archive), originalRuntimeHash: sha(original['player.js']), currentRuntimeHash: sha(current['player.js']), currentCssHash: sha(current['player.css']), mode: 'actual 1.7.3 payload/media, current production runtime in memory; no republished candidate', checks, routes, errors, publicDeployment: false, physicalDevice: false, offlineUpdateRetested: false, twoHourSoakPassed: false }, null, 2));
} catch (error) {
  if (active && !active.isClosed()) await active.screenshot({ path: path.join(output, 'continuity-failure.png') });
  await writeFile(path.join(output, 'continuity-failure.json'), JSON.stringify({ checks, routes, errors, error: String(error), stack: error.stack }, null, 2)); throw error;
} finally {
  if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}

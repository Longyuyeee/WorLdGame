import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-project-recovery');
const ui = process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', require = createRequire(import.meta.url);
let engines; try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), encode = text => Buffer.from(text);
const source = await readFile(path.join(root, 'evidence/web-reading-throughput/before-rain-stops-project.zip')), originalFiles = unzipSync(source);
const oldSave = await readFile(path.join(root, 'evidence/web-reading-throughput/chromium-1.7.13.worldsave'));
const review = await readFile(path.join(root, 'evidence/web-reading-throughput/before-rain-stops.worldreview'));
const checks = [], results = [], errors = [], artifacts = {};
const largeFiles = new Map();
let browser, current, exports;
const button = (p, name) => p.getByRole('button', { name, exact: true });
const ready = p => p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
const input = p => p.getByLabel('导入工程 ZIP', { exact: true });
const check = (name, detail = {}) => { checks.push({ name, detail }); console.log(`PASS ${name}`); };
const shot = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const file = (name, bytes) => largeFiles.get(bytes) ?? { name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) };
async function menu(p, name) {
  await ready(p); if (!await p.locator('.project-switcher').evaluate(el => el.open)) await p.getByLabel('项目菜单', { exact: true }).click();
  await p.getByRole('button', { name: new RegExp(name) }).click();
}
async function home(p) { await menu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor(); }
async function download(p, action) { const pending = p.waitForEvent('download'); await action(); return readFile(await (await pending).path()); }
async function generate(p, purpose, production = false) {
  await p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '发布', exact: true }).click();
  await p.getByRole('navigation', { name: '发布流程' }).getByRole('button', { name: /导出方式/ }).click();
  await p.locator(`input[name="publication-format"][value="${purpose}"]`).check(); await p.getByLabel('同时生成制作交付包', { exact: true }).setChecked(production);
  await button(p, '继续：生成游戏 →').click(); await p.getByText('故事与素材检查通过', { exact: true }).waitFor();
  await button(p, purpose === 'website' ? '构建网站上传 ZIP' : purpose === 'directory' ? '构建目录 ZIP' : '构建试玩 HTML').click();
  const link = p.getByRole('link', { name: purpose === 'website' ? '下载网站上传包' : '下载游戏', exact: true }); await link.waitFor({ timeout: 90000 });
  const bytes = await download(p, () => link.click());
  const delivery = production ? await download(p, () => p.getByRole('link', { name: '下载制作交付包', exact: true }).click()) : null;
  return { bytes, delivery };
}
async function snapshot(p) {
  return p.evaluate(async () => {
    let position = 'list databases';
    let deadline;
    const inspect = async () => {
      const request = operation => new Promise((resolve, reject) => { operation.onsuccess = () => resolve(operation.result); operation.onerror = () => reject(operation.error); });
      const databases = [];
      for (const info of (await indexedDB.databases()).sort((a, b) => a.name.localeCompare(b.name))) {
        position = `open ${info.name}`;
        const db = await request(indexedDB.open(info.name));
        try {
          const stores = [];
          for (const name of [...db.objectStoreNames].sort()) {
            position = `read ${db.name}/${name}`;
            const tx = db.transaction(name, 'readonly'), store = tx.objectStore(name);
            const keys = request(store.getAllKeys()), values = db.name === 'world-studio-managed-project-workspaces' ? request(store.getAll()) : null;
            stores.push({ name, keys: await keys, ...(values ? { values: await values } : {}) });
          }
          databases.push({ name: db.name, version: db.version, stores });
        } finally { db.close(); }
      }
      const bytes = new TextEncoder().encode(JSON.stringify(databases));
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      return { digest, recent: localStorage.getItem('world-studio:recent-projects:v1'), writes: globalThis.__recoveryWrites };
    };
    try { return await Promise.race([inspect(), new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(Error(`Snapshot timed out: ${position}`)), 20000); })]); }
    finally { clearTimeout(deadline); }
  });
}
async function assertSourceExport(p) {
  const bytes = await download(p, () => menu(p, '导出工程 ZIP')), files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(), Object.keys(originalFiles).sort());
  for (const [name, original] of Object.entries(originalFiles)) assert.equal(sha(files[name]), sha(original), name);
  return { entries: Object.keys(files).length, byteLength: bytes.length, sha256: sha(bytes), originalEntriesByteIdentical: true };
}
await mkdir(output, { recursive: true });
const dist = path.join(root, 'apps/editor/dist'), html = await readFile(path.join(dist, 'index.html'), 'utf8'); assert.equal(await (await fetch(ui)).text(), html);
artifacts.editor = {};
for (const entry of [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)].map(match => match[1])) {
  const bytes = await readFile(path.join(dist, entry)); assert.equal(sha(new Uint8Array(await (await fetch(new URL(entry, ui))).arrayBuffer())), sha(bytes)); artifacts.editor[entry] = sha(bytes);
}
const temporary = await mkdtemp(path.join(tmpdir(), 'world-project-recovery-'));
try {
  const selectedEngines = (process.env.STUDIO_BROWSER_ENGINES ?? 'chromium,firefox,webkit').split(',');
  assert.equal(selectedEngines[0], 'chromium', 'Chromium first generates actual same-version artifacts for the other engines');
  for (const engine of selectedEngines) {
    assert.ok(['chromium', 'firefox', 'webkit'].includes(engine)); browser = await engines[engine].launch({ headless: true, args: engine === 'chromium' ? ['--mute-audio'] : [] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => { globalThis.__recoveryWrites = 0; const original = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function(...args) { if (args[1] === 'readwrite') globalThis.__recoveryWrites++; return original.apply(this, args); }; });
    const p = await context.newPage(); current = p; p.setDefaultTimeout(30000); p.on('pageerror', error => errors.push(`${engine}:${error.message}`));
    await p.goto(ui); await input(p).setInputFiles(file('原工程.zip', source)); await ready(p);
    if (engine === 'chromium') {
      const website = await generate(p, 'website', true), local = await generate(p, 'directory'), single = await generate(p, 'html');
      const deliveryFiles = unzipSync(website.delivery), partial = { ...deliveryFiles }; delete partial['delivery.json'];
      const wrapped = zipSync(Object.fromEntries(Object.entries(originalFiles).map(([name, bytes]) => [`额外文件夹/${name}`, bytes])), { level: 0 });
      exports = { website: website.bytes, local: local.bytes, html: single.bytes, production: website.delivery, wrapped, partial: zipSync(partial, { level: 0 }) };
      for (const [name, bytes] of [['制作交付.zip', exports.production], ['不完整交付.zip', exports.partial]]) {
        const filename = path.join(temporary, name); await writeFile(filename, bytes); largeFiles.set(bytes, filename);
      }
      artifacts.originalExport = await assertSourceExport(p);
      artifacts.games = Object.fromEntries(['website', 'local', 'html', 'production'].map(kind => [kind, { byteLength: exports[kind].length, sha256: sha(exports[kind]) }]));
      check('actual-original-1.7.14-website-local-html-and-production-generated-source-65-entries-unchanged');
    }
    await home(p); console.log(`CHECK ${engine} baseline storage`); const before = await snapshot(p);
    const cases = [
      ['网站上传.zip', exports.website, '这是网页游戏包，不是可编辑工程'],
      ['网页目录.zip', exports.local, '这是网页游戏包，不是可编辑工程'],
      ['游戏.html', exports.html, '这是网页文件，不是工程 ZIP'],
      ['旧版进度.worldsave', oldSave, '这是玩家进度备份，不是创作工程'],
      ['校订.worldreview', review, '这是校订或试玩记录，不是创作工程'],
      ['试玩.worldplaytest', encode(JSON.stringify({ schemaVersion: 1, kind: 'world-playtest-progress', projectId: 'hint-only', completions: [] })), '这是校订或试玩记录，不是创作工程'],
      ['套层工程.zip', exports.wrapped, '工程入口被额外包在了文件夹内'],
      ['不完整交付.zip', exports.partial, '这不是完整的制作交付包'],
    ];
    for (const [name, bytes, title] of cases) {
      console.log(`CHECK ${engine} ${name}`);
      await input(p).setInputFiles(file(name, bytes)); const alert = p.getByRole('alert', { name: title, exact: true }); await alert.waitFor();
      assert.ok((await alert.innerText()).includes(name)); await p.waitForFunction(() => document.activeElement?.id === 'import-recovery-title');
      assert.equal(await input(p).inputValue(), ''); assert.equal(await p.getByTestId('workspace-shell').count(), 0); assert.deepEqual(await snapshot(p), before);
    }
    // Repeat the same wrong file using the actual recovery button/file chooser.
    const repeated = p.waitForEvent('filechooser'); await button(p, '重新选择工程或制作交付包').click(); await (await repeated).setFiles(file('不完整交付.zip', exports.partial));
    await p.getByRole('alert', { name: '这不是完整的制作交付包', exact: true }).waitFor(); await p.waitForFunction(() => document.activeElement?.id === 'import-recovery-title'); assert.deepEqual(await snapshot(p), before);
    for (const size of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await p.setViewportSize(size); const retry = button(p, '重新选择工程或制作交付包'); await retry.scrollIntoViewIfNeeded();
      assert.ok((await retry.boundingBox()).height >= 44); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await shot(p, `${engine}-recovery-${size.width}x${size.height}`);
    }
    await p.setViewportSize({ width: 390, height: 844 }); await p.locator('.home-import-help > summary').click(); await p.locator('.home-import-help').scrollIntoViewIfNeeded(); await shot(p, `${engine}-migration-guide`);
    assert.deepEqual(await snapshot(p), before);
    check(`${engine}-eight-wrong-selections-repeat-chooser-focus-three-layouts-and-no-indexeddb-writes`, { version: browser.version(), files: cases.length, workspaceAssetAndRecentUnchanged: true, physicalPhone: false });
    await p.setViewportSize({ width: 1440, height: 1000 }); const choose = p.waitForEvent('filechooser'); await button(p, '重新选择工程或制作交付包').click();
    await (await choose).setFiles(file(engine === 'chromium' ? '制作交付.zip' : '源工程.zip', engine === 'chromium' ? exports.production : source)); await ready(p);
    assert.equal(await p.locator('.home-import-recovery').count(), 0);
    const restoredExport = await assertSourceExport(p); assert.equal(restoredExport.originalEntriesByteIdentical, true);
    await p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '故事', exact: true }).click();
    await p.getByRole('button', { name: /^选择旁白：/u }).first().click(); const field = p.getByLabel('旁白文本', { exact: true }), original = await field.inputValue();
    await field.fill(`${original}\n换机恢复后的写作验证。`); await field.blur(); await p.waitForFunction(() => document.querySelector('[aria-label="旁白文本"]')?.dataset.inputState === 'committed');
    await button(p, '撤销').click(); assert.equal(await field.inputValue(), original); await p.locator('.local-save-button').click(); await p.locator('.local-save-button--saved').waitFor();
    await home(p); await p.reload(); await p.getByRole('button', { name: '打开项目：雨停之前（最近打开）', exact: true }).click(); await ready(p);
    await p.getByRole('navigation', { name: '主要功能' }).getByRole('button', { name: '故事', exact: true }).click(); await p.getByRole('button', { name: /^选择旁白：/u }).first().click(); assert.equal(await p.getByLabel('旁白文本', { exact: true }).inputValue(), original);
    const finalExport = await assertSourceExport(p); await shot(p, `${engine}-restored-editable-after-save-reopen`);
    check(`${engine}-correct-${engine === 'chromium' ? 'production' : 'source'}-recovery-edit-undo-save-reopen-and-exact-source-export`, finalExport);
    results.push({ engine, version: browser.version(), passed: true }); await browser.close(); browser = null;
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify({ passed: true, checks, errors, results, artifacts, scope: 'Desktop Chromium/Firefox/WebKit real Worker imports, wrong-file diagnosis without IndexedDB writes, touch-sized layout, explicit retry, source/production restore and editing/save/reopen/source export. Original 1.7.14 and 25 media preserved. No physical devices, public hosting, owner approval or new story version.' }, null, 2));
} catch (error) {
  await writeFile(path.join(output, 'browser-failure.json'), JSON.stringify({ passed: false, checks, errors, error: String(error), stack: error.stack }, null, 2)); if (current && !current.isClosed()) await shot(current, 'failure'); throw error;
} finally {
  if (browser) await browser.close();
  assert.equal(path.dirname(temporary), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith('world-project-recovery-'));
  await rm(temporary, { recursive: true, force: true });
}

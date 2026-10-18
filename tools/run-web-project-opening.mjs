import { createRequire, SourceMap } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, zipSync, strFromU8 } from 'fflate';

const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-project-opening'), scratch = path.join(root, '.browser-diagnostic/project-opening');
await mkdir(output, { recursive: true }); await mkdir(scratch, { recursive: true });
const label = process.argv.includes('--baseline') ? 'baseline' : 'current', samples = Number(process.env.OPENING_SAMPLES ?? 3);
const browser = await chromium.launch({ headless: true, ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}) });
const errors = [], tasks = [], profiles = [], checks = []; let features;
const check = (name, detail = {}) => { checks.push({ name, passed: true, detail }); console.log(`PASS ${name}`); };
const sha = b => createHash('sha256').update(b).digest('hex');
const archive = path.join(root, 'evidence/web-story-refinement/before-rain-stops-project.zip'), bytes = await readFile(archive), zip = unzipSync(bytes);
const scenes = Object.entries(zip).filter(([key]) => key.startsWith('scenes/')).map(([, b]) => JSON.parse(strFromU8(b)));
let currentPage, completed = false;
async function profileSummary(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map(), maps = new Map();
  for (const n of profile.nodes) for (const id of n.children ?? []) parent.set(id, n.id);
  async function location(node) {
    const f = node.callFrame;
    if (!f.url.startsWith('http') || !f.url.includes('/assets/')) return `${f.functionName || '(anonymous)'} ${f.url}`;
    const file = path.basename(new URL(f.url).pathname);
    if (!maps.has(file)) maps.set(file, await readFile(path.join(root, 'apps/editor/dist/assets', `${file}.map`), 'utf8').then(s => new SourceMap(JSON.parse(s))).catch(() => null));
    const entry = maps.get(file)?.findEntry(f.lineNumber, f.columnNumber);
    return entry?.originalSource ? `${entry.originalSource.replaceAll('\\', '/').replace(/^.*?(apps\/|packages\/)/u, '$1')}:${entry.originalLine + 1} ${entry.name || f.functionName}` : `${file}:${f.lineNumber + 1}:${f.columnNumber} ${f.functionName}`;
  }
  const locations = new Map(); for (const n of profile.nodes) locations.set(n.id, await location(n));
  const self = new Map(), inclusive = new Map();
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const id = profile.samples[i], ms = profile.timeDeltas[i] / 1000, at = locations.get(id);
    self.set(at, (self.get(at) ?? 0) + ms);
    const seen = new Set();
    for (let n = id; n !== undefined; n = parent.get(n)) { const at = locations.get(n); if (seen.has(at)) continue; seen.add(at); inclusive.set(at, (inclusive.get(at) ?? 0) + ms); }
  }
  const top = map => [...map].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([location, sampledMs]) => ({ location, sampledMs }));
  return { self: top(self), inclusive: top(inclusive), wallMs: (profile.endTime - profile.startTime) / 1000, attribution: 'sampled CPU, inclusive stacks overlap; not phase wall time' };
}
async function measure(page, run, name, action, profiler) {
  const cdp = profiler ? await page.context().newCDPSession(page) : null;
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
  const start = await page.evaluate(() => performance.now()); await action();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const end = await page.evaluate(() => performance.now());
  tasks.push({ run, name, wallMs: end - start, ...await page.evaluate(({ start, end }) => ({ longTasks: window.openingLongTasks.filter(t => t.start >= start && t.start < end), heartbeatGapsMs: window.openingGaps.filter(t => t.at >= start && t.at < end).map(t => t.gap) }), { start, end }) });
  if (cdp) { const { profile } = await cdp.send('Profiler.stop'); await writeFile(path.join(scratch, `${label}-${name}.cpuprofile`), JSON.stringify(profile)); profiles.push({ name, ...await profileSummary(profile) }); await cdp.detach(); }
}
const ready = p => p.waitForFunction(() => document.querySelector('.local-save-button')?.disabled === false);
async function menu(p, name) { await ready(p); if (!await p.locator('.project-switcher').evaluate(el => el.open)) await p.getByLabel('项目菜单', { exact: true }).click(); await p.getByRole('button', { name: new RegExp(name) }).click(); }
async function sourceDownload(p) {
  const event = p.waitForEvent('download'); await menu(p, '导出工程 ZIP'); return readFile(await (await event).path());
}
async function failureAndRecovery() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }), p = await ctx.newPage();
  currentPage = p; p.setDefaultTimeout(30000); p.on('pageerror', e => errors.push(e.message));
  await p.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
  await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(archive); await ready(p);
  const manifest = JSON.parse(strFromU8(zip['world.project.json'])), sc = scenes.find(s => s.id === manifest.entrySceneId), script = JSON.parse(strFromU8(zip[sc.scriptPath])), text = script.statements.find(s => s.kind === 'narration');
  await p.locator(`#statement-card-${text.id}`).click();
  const changed = `${text.text}【导入失败保护验证】`; await p.getByLabel('旁白文本', { exact: true }).fill(changed);
  await p.waitForFunction(() => document.querySelector('.writing-text-inspector textarea')?.dataset.inputState === 'committed');
  const before = await sourceDownload(p); await writeFile(path.join(scratch, 'protected-source.zip'), before);
  await menu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor();
  const originalRecent = await p.locator('.home-project-card').count(); assert.equal(originalRecent, 1);
  const corruptCRC = bytes.slice(), view = new DataView(corruptCRC.buffer, corruptCRC.byteOffset, corruptCRC.byteLength), payload = 30 + view.getUint16(26, true) + view.getUint16(28, true); corruptCRC[payload + 1] ^= 1;
  const blobPath = Object.keys(zip).find(k => k.startsWith('.world-assets/blobs/')), corruptBlob = zip[blobPath].slice(); corruptBlob[0] ^= 1;
  const rejected = [
    ['bad-crc.zip', corruptCRC, /CRC mismatch/u],
    ['bad-sha.zip', zipSync({ ...zip, [blobPath]: corruptBlob }, { level: 0 }), /source Blob|wrong size|corrupt/iu],
    ['unsafe-path.zip', zipSync({ '../escape.txt': new Uint8Array([1]) }, { level: 0 }), /Unsafe archive path/u]
  ];
  for (const [name, data, pattern] of rejected) {
    await writeFile(path.join(scratch, name), data); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(scratch, name));
    await p.getByRole('alert').waitFor(); assert.match(await p.getByRole('alert').innerText(), pattern);
    assert.equal(await p.locator('.home-project-card').count(), originalRecent); assert.equal(await p.getByTestId('workspace-shell').count(), 0);
    assert.ok(await p.getByLabel('导入工程 ZIP', { exact: true }).isEnabled());
  }
  await p.screenshot({ path: path.join(output, 'invalid-archive-retains-project.png'), animations: 'disabled' });
  check('worker-rejects-crc-sha-and-unsafe-path-without-changing-projects');
  await ctx.route('**/project-archive-import.worker-*.js', route => route.abort());
  await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(archive); await p.getByRole('alert').filter({ hasText: '后台' }).waitFor();
  assert.equal(await p.locator('.home-project-card').count(), originalRecent); await ctx.unroute('**/project-archive-import.worker-*.js');
  check('worker-load-failure-is-visible-and-retryable-without-inline-large-fallback');
  await p.setViewportSize({ width: 390, height: 844 }); await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(archive);
  await p.getByRole('status').filter({ hasText: '后台校验' }).waitFor();
  await p.screenshot({ path: path.join(output, 'responsive-check-and-cancel-390.png'), animations: 'disabled' });
  await p.getByRole('button', { name: '取消导入', exact: true }).click();
  await p.getByRole('status').filter({ hasText: '已取消导入' }).waitFor();
  assert.equal(await p.locator('.home-project-card').count(), originalRecent); assert.ok(await p.getByLabel('导入工程 ZIP', { exact: true }).isEnabled());
  await p.setViewportSize({ width: 1440, height: 1000 }); await p.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready(p);
  await p.locator(`#statement-card-${text.id}`).click(); assert.equal(await p.getByLabel('旁白文本', { exact: true }).inputValue(), changed);
  const after = await sourceDownload(p); assert.equal(sha(after), sha(before));
  const restored = unzipSync(after); let blobs = 0;
  for (const [name, original] of Object.entries(zip)) if (name.startsWith('.world-assets/blobs/')) { assert.equal(sha(restored[name]), sha(original)); blobs++; }
  assert.equal(blobs, 25); check('cancel-during-native-worker-validation-retains-saved-source-and-all-25-blobs', { protectedSourceSha256: sha(after) });
  await menu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor();
  await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(archive); await ready(p);
  await p.locator(`#statement-card-${text.id}`).click(); assert.equal(await p.getByLabel('旁白文本', { exact: true }).inputValue(), text.text);
  check('same-file-retry-imports-fresh-canonical-content-not-an-old-local-snapshot');
  await menu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor();
  await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(path.join(root, 'evidence/web-production-delivery/short-production.zip')); await ready(p);
  assert.ok(await p.getByTestId('workspace-shell').isVisible()); check('nested-production-delivery-import-remains-supported');
  await ctx.close();
}
try {
  for (let run = 0; run < samples; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => {
      window.openingLongTasks = []; window.openingGaps = []; let previous = performance.now();
      setInterval(() => { const at = performance.now(); window.openingGaps.push({ at, gap: at - previous }); previous = at; }, 16);
      new PerformanceObserver(list => window.openingLongTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true });
    });
    const p = await ctx.newPage(); currentPage = p; p.setDefaultTimeout(30000); p.on('pageerror', e => errors.push(e.message));
    await p.goto(process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/');
    features ??= await p.evaluate(() => ({ worker: typeof Worker === 'function', nativeDigest: !!globalThis.crypto?.subtle, secureContext: isSecureContext }));
    await measure(p, run, 'import', async () => { await p.getByLabel('导入工程 ZIP', { exact: true }).setInputFiles(archive); await ready(p); }, run === 0);
    if (!await p.locator('.scene-rail').isVisible()) await p.getByRole('button', { name: '场景列表', exact: true }).click();
    for (const scene of scenes) await measure(p, run, `scene:${scene.title}`, async () => {
      await p.locator('.scene-rail').getByRole('button').filter({ hasText: scene.title }).click();
      await p.getByRole('heading', { name: scene.title, exact: true }).waitFor();
      await p.waitForFunction(() => document.querySelector('[data-testid="preview-visual-host"]')?.dataset.renderStatus === 'ready');
    }, run === 0 && scene.title === '再一次见面');
    await menu(p, '所有项目'); await p.getByRole('main', { name: '项目首页', exact: true }).waitFor(); await p.reload();
    await measure(p, run, 'reopen', async () => { await p.getByRole('button', { name: '打开项目：雨停之前', exact: true }).click(); await ready(p); }, run === 0);
    assert.equal(await p.locator('.scene-item').count(), 9); checks.push({ name: `complete-project-import-switch-nine-scenes-and-reopen:${run}`, passed: true });
    await ctx.close(); console.log(`PASS ${label} sample ${run + 1}/${samples}`);
  }
  if (label === 'current') await failureAndRecovery();
  assert.deepEqual(errors, []); completed = true;
} catch (error) {
  await currentPage?.screenshot({ path: path.join(scratch, `${label}-failure.png`), animations: 'disabled' }).catch(() => {}); throw error;
} finally {
  await writeFile(path.join(output, `${label}.json`), JSON.stringify({ passed: completed, browser: browser.version(), features, samples, tasks, profiles, checks, errors, physicalDevice: false, statisticalBenchmark: false }, null, 2));
  await browser.close();
}

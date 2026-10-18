import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { unzipSync } from 'fflate';
import { sha } from './audit-rain-story-refinement.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
const root = path.resolve(import.meta.dirname, '..'), engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium', format = process.argv.includes('--html') ? 'html' : 'website';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const source = path.resolve(root, process.env.STUDIO_BACKUP_ENVELOPE_SOURCE_DIRECTORY ?? 'evidence/web-backup-envelope/work');
const output = path.resolve(root, process.env.STUDIO_BACKUP_ENVELOPE_OUTPUT_DIRECTORY ?? 'evidence/web-backup-envelope/browser'), label = `${engine}-${format}`;
await mkdir(output, { recursive: true }); const report = path.join(output, `${label}.json`);
try { await access(report); throw Error('Refusing to overwrite a backup-envelope browser report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip')), files = unzipSync(zip);
const backupFile = path.join(root, 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave'), backupBytes = await readFile(backupFile), original = JSON.parse(backupBytes);
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/gal\//u, '') || 'index.html', bytes = files[name], headers = { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }, range = /^bytes=(\d+)-(\d*)$/u.exec(req.headers.range ?? '');
  if (bytes && range) { const start = +range[1], end = Math.min(range[2] ? +range[2] : bytes.length - 1, bytes.length - 1); if (start > end) return res.writeHead(416).end(); return res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }).end(bytes.subarray(start, end + 1)); }
  res.writeHead(bytes ? 200 : 404, headers).end(bytes ?? 'Missing');
});
let browser, page; const checks = [], errors = [], downloads = [];
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('main.player-shell').evaluate(el => ({ status: el.dataset.playerStatus, hash: el.dataset.runtimeStateHash, cursor: el.dataset.historyCursor, auto: el.dataset.autoPlayback, save: el.dataset.saveOperation }));
const stats = () => page.evaluate(() => ({ posts: window.backupWorkerPosts, replies: window.backupWorkerReplies, terminated: window.backupWorkerTerminations, held: window.heldBackupReplies.length }));
const shot = name => page.screenshot({ path: path.join(output, `${label}-${name}.png`), animations: 'disabled' });
async function slots() { return page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('world-player-saves'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('save-slots', 'readonly'), get = tx.objectStore('save-slots').getAll(); tx.oncomplete = () => db.close(); get.onerror = () => reject(get.error); get.onsuccess = async () => { try { resolve(await Promise.all(get.result.map(async row => { const m = row.metadata ?? row, bytes = row.metadata ? row.data : new TextEncoder().encode(row.serializedSessionSave); return { slotId: m.slotId, hash: m.runtimeStateHash, savedAt: m.savedAtEpochMilliseconds, storedSha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }; }))); } catch (error) { reject(error); } }; };
})); }
async function unchanged(before, saved) { assert.equal((await state()).hash, before.hash); assert.equal((await state()).cursor, before.cursor); assert.deepEqual(await slots(), saved); }
async function openBackup(title = false) { if (title) await button('读取存档').click(); else { await button('打开阅读菜单').click(); await button('存读档').click(); } await page.waitForFunction(() => document.querySelector('main')?.dataset.saveList === 'ready'); await page.getByRole('dialog', { name: '存读档槽位', exact: true }).getByRole('button', { name: '备份', exact: true }).click(); }
async function release() { await page.evaluate(() => { window.holdBackupReplyKind = null; for (const deliver of window.heldBackupReplies.splice(0)) deliver(); }); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
async function download(name) {
  const count = downloads.length, pending = page.waitForEvent('download'); await button('导出备份文件').click(); const value = await pending, file = path.join(output, `${label}-${name}.worldsave`); await value.saveAs(file); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'idle');
  const bytes = await readFile(file), data = JSON.parse(bytes); assert.equal(data.schemaVersion, 1); assert.equal(data.format, 'world.player-save-backup'); assert.equal(sha(Buffer.from(JSON.stringify(sort(data.payload)))), data.sha256); assert.equal(downloads.length, count + 1);
  return { file: path.basename(file), bytes: bytes.length, sha256: sha(bytes), value: data };
}
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let pw; try { pw = require('playwright'); } catch { pw = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio'] } : {}) }); page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(String(error))); page.on('download', download => downloads.push(download));
  await page.addInitScript(() => {
    window.holdBackupReplyKind = null; window.heldBackupReplies = []; window.backupWorkerPosts = []; window.backupWorkerReplies = []; window.backupWorkerTerminations = 0;
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) { super(url, options); this.backupOwned = options?.name === 'world-player-backup'; }
      postMessage(value, ...rest) { if (this.backupOwned) { this.backupKind = value.backupTask?.kind; window.backupWorkerPosts.push({ kind: this.backupKind, id: value.id }); } return super.postMessage(value, ...rest); }
      set onmessage(handler) { super.onmessage = handler === null ? null : event => {
        if (!this.backupOwned) return handler.call(this, event);
        window.backupWorkerReplies.push({ kind: this.backupKind, trusted: event.isTrusted, result: event.data.backupResult?.kind, error: event.data.backupError ?? null });
        if (window.holdBackupReplyKind === this.backupKind) window.heldBackupReplies.push(() => handler.call(this, event)); else handler.call(this, event);
      }; }
      get onmessage() { return super.onmessage; }
      terminate() { if (this.backupOwned) window.backupWorkerTerminations++; return super.terminate(); }
    };
  });
  await page.goto(format === 'html' ? pathToFileURL(path.join(source, 'before-rain-stops.html')).href : `http://127.0.0.1:${server.address().port}/gal/`);
  await openBackup(true); const before = await state(); assert.deepEqual(await slots(), []);
  await page.evaluate(() => { window.holdBackupReplyKind = 'backup-decode'; }); await page.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(backupFile); await page.waitForFunction(() => window.heldBackupReplies.length === 1);
  await button('取消备份准备').click(); await release(); await unchanged(before, []); assert.equal(await button('导入到所选槽位').count(), 0); assert.equal((await state()).save, 'idle');
  checks.push({ name: 'cancel-real-envelope-check-and-ignore-held-native-reply-without-writing', before, stats: await stats() });
  await page.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(backupFile); await button('导入到所选槽位').waitFor(); await unchanged(before, []);
  const bad = JSON.parse(backupBytes); bad.payload.slot.title = '篡改标题'; await button('取消导入').click(); await page.getByLabel('选择存档备份文件', { exact: true }).setInputFiles({ name: 'corrupted.worldsave', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) }); await page.getByRole('alert').filter({ hasText: '备份文件校验失败' }).waitFor(); assert.equal(await button('导入到所选槽位').count(), 0); await unchanged(before, []);
  checks.push({ name: 'retry-old-backup-and-reject-tampering-before-any-import', stats: await stats() });
  await page.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(backupFile); await button('导入到所选槽位').click(); await button('读取导入的存档').waitFor(); assert.equal((await state()).status, 'title'); const saved = await slots(); assert.ok(saved.some(row => row.slotId === 'manual-1' && row.hash === original.payload.slot.runtimeStateHash));
  await button('读取导入的存档').click(); await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded'); await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false'); const playing = await state(); assert.equal(playing.auto, 'off'); assert.equal(playing.hash, original.payload.slot.runtimeStateHash);
  checks.push({ name: 'explicit-import-and-read-restores-the-actual-original-progress-with-auto-off', state: playing, saved });
  await openBackup(); const protectedSlots = await slots(); await page.getByLabel('备份进度', { exact: true }).selectOption('manual-1');
  await page.evaluate(() => { window.holdBackupReplyKind = 'backup-encode'; }); await button('导出备份文件').click(); await page.waitForFunction(() => window.heldBackupReplies.length === 1); const beforeDownloads = downloads.length;
  await page.getByText(/等待时间较长，可取消/u).waitFor(); const layouts = [];
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport); await button('取消备份准备').scrollIntoViewIfNeeded(); const box = await button('取消备份准备').boundingBox(); assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= viewport.height + 1); layouts.push({ viewport, box }); await shot(`waiting-${viewport.width}`);
  }
  await page.keyboard.press('Escape'); await release(); await unchanged(playing, protectedSlots); assert.equal(downloads.length, beforeDownloads); assert.equal((await state()).save, 'idle');
  checks.push({ name: 'cancel-real-packed-output-with-escape-and-four-viewport-actions-without-late-download', layouts, stats: await stats() });
  const exported = await download('slot'); assert.equal(exported.value.payload.origin, 'slot'); assert.equal(exported.value.payload.slot.serializedSessionSave, original.payload.slot.serializedSessionSave); await unchanged(playing, protectedSlots);
  checks.push({ name: 'retry-exports-an-exact-complete-session-in-original-envelope-format', ...exported, value: undefined });
  await page.getByLabel('备份进度', { exact: true }).selectOption('current'); const current = await download('current'); assert.equal(current.value.payload.origin, 'current'); assert.equal(current.value.payload.slot.runtimeStateHash, playing.hash); await unchanged(playing, protectedSlots);
  await page.getByLabel('选择存档备份文件', { exact: true }).setInputFiles(path.join(output, current.file)); await button('导入到所选槽位').waitFor(); await unchanged(playing, protectedSlots); await button('取消导入').click(); await button('关闭存读档').click(); await unchanged(playing, protectedSlots);
  checks.push({ name: 'current-progress-backup-rechecks-without-auto-import-or-changing-the-reading', ...current, value: undefined, state: await state() });
  const observed = await stats(); assert.ok(observed.replies.filter(row => row.trusted && row.result === 'backup-encode').length >= 3); assert.ok(observed.replies.filter(row => row.trusted && row.result === 'backup-decode').length >= 4); assert.equal(observed.terminated, observed.posts.length); assert.deepEqual(errors, []); await shot('returned-story');
  await writeFile(report, JSON.stringify({ passed: true, engine, format, browser: browser.version(), artifacts: { html: { bytes: html.length, sha256: sha(html) }, website: { bytes: zip.length, sha256: sha(zip) } }, sourceBackupSha256: sha(backupBytes), checks, observed, errors, scope: 'Actual exported complete work and old same-content backup, native Worker JSON/hash/preview tasks and formal session load; readonly IndexedDB digests. A host wrapper delays delivery of actual trusted replies for cancellation/late-result checks, never fabricates their content or replaces validation. Desktop engines and phone-sized windows, not physical phone/OS interruption/Safari, natural listening, full long-story cost, rights/public HTTPS or long-soak acceptance.' }, null, 2)); console.log(`PASS ${label} backup envelope (${checks.length} checks)`);
} catch (error) { if (page && !page.isClosed()) await shot('failure').catch(() => {}); await writeFile(report, JSON.stringify({ passed: false, error: String(error), stack: error.stack, checks, errors, state: page && !page.isClosed() ? await state().catch(() => null) : null }, null, 2)); throw error; }
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

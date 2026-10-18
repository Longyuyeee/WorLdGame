import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { build } from './player-fixture-build.mjs';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), label = process.argv.includes('--baseline') ? 'baseline' : 'current';
const output = path.resolve(root, process.env.STUDIO_BACKUP_ENVELOPE_PROFILE_DIRECTORY ?? 'evidence/web-backup-envelope/profile');
await mkdir(output, { recursive: true }); const report = path.join(output, `${label}.json`);
try { await access(report); throw Error('Refusing to overwrite backup envelope measurements'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const source = await readFile(path.join(root, 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave'));
const slot = JSON.parse(source.toString('utf8')).payload.slot;
const baselineCommit = '7ca00eb882235ccbac4cbc132c1151eca2caf967', baselinePaths = ['apps/player-shell/src/player-save-backup.ts', 'apps/player-shell/src/recovery-session.worker.ts'];
const frozen = label === 'baseline' ? Object.fromEntries(baselinePaths.map(file => [file, execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root, encoding: 'utf8', windowsHide: true })])) : {};
if (label === 'baseline') await writeFile(path.join(output, 'baseline-code.json'), JSON.stringify({ baselineCommit, sources: frozen }, null, 2), { flag: 'wx' });
const built = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'frozen-backup-envelope', load(id) { return frozen[path.relative(root, id).replaceAll('\\', '/')]; } }], define: { 'process.env.NODE_ENV': JSON.stringify('production'), __WORLD_BACKUP_BASELINE__: JSON.stringify(label === 'baseline') }, build: { write: false, minify: true, lib: { entry: path.join(root, 'tools/fixtures/backup-envelope-profile.ts'), name: 'BackupProfile', formats: ['iife'] } } });
const code = (Array.isArray(built) ? built : [built]).flatMap(item => item.output).find(item => item.type === 'chunk').code;
const server = createServer((req, res) => req.url === '/profile.js' ? res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(code) : res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><script src="/profile.js"></script>'));
let browser, cancellation; const rows = [];
try {
  await listenBrowserLoopback(server); const require = createRequire(import.meta.url); let pw; try { pw = require('playwright'); } catch { pw = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  browser = await pw.chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for (const repetitions of [1, 128, 512]) for (let round = 1; round <= 3; round++) { rows.push({ round, ...await page.evaluate(({ slot, repetitions }) => window.profileEnvelope(slot, repetitions), { slot, repetitions }) }); console.log(`PASS ${label} envelope ${repetitions} round ${round}`); }
  cancellation = label === 'current' ? await page.evaluate(slot => window.cancelEnvelope(slot), slot) : undefined;
  // terminate() settles the request synchronously, while the browser protocol's
  // worker-close notification is asynchronous. Await that observation explicitly.
  const closeDeadline = Date.now() + 5000;
  while (page.workers().length && Date.now() < closeDeadline) await new Promise(resolve => setTimeout(resolve, 50));
  const remainingWorkers = page.workers().length; assert.equal(remainingWorkers, 0);
  await writeFile(report, JSON.stringify({ passed: true, label, baselineCommit, browser: browser.version(), bundleSha256: sha(code), sourceSha256: sha(source), rows, cancellation, remainingWorkers, scope: 'Envelope-only same-machine Chromium probe; baseline freezes the original backup and worker modules from the recorded commit. Repeated actual serialized text is synthetic and NOT a valid long Runtime save; formal load deliberately stops at an explicit sentinel. Measures JSON/envelope work plus its dispatch, not complete import, real long story, phone performance or total speedup. Cancellation uses an actual in-flight CPU Worker, without delayed replies; exact CPU instruction at abort is not observed.' }, null, 2));
} catch (error) { await writeFile(report, JSON.stringify({ passed: false, label, error: String(error), stack: error.stack, rows, cancellation }, null, 2)); throw error; }
finally { await browser?.close(); if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

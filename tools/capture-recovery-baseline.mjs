import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { sha } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-recovery-worker');
await mkdir(output, { recursive: true });
const assets = path.join(root, 'apps/editor/dist/assets');
const expected = JSON.parse(await readFile(path.join(root, 'evidence/web-playback-responsiveness/audit.json'))).currentRuntimeHash;
let captured = false;
for (const name of await readdir(assets)) {
  if (!/^_virtual_world-player-export-.*\.js$/.test(name)) continue;
  const { default: bundle } = await import(pathToFileURL(path.join(assets, name)).href);
  if (sha(new TextEncoder().encode(bundle.javascript)) !== expected) continue;
  await writeFile(path.join(output, 'prior-runtime.json'), JSON.stringify(bundle));
  console.log('PASS previous production runtime exactly matches #342: ' + expected); captured = true; break;
}
assert.ok(captured, 'No exact #342 production bundle found; do not relabel current code as baseline');

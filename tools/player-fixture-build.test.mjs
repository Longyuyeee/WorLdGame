import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from './player-fixture-build.mjs';
const options = { configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: resolve('tools/player-input-browser.ts'), name: 'Fixture', formats: ['iife'] } } };
const code = output => (Array.isArray(output) ? output : [output]).flatMap(result => result.output).filter(item => item.type === 'chunk').map(item => item.code).join('\n');
test('bundles existing Player Shell fixtures with the recovery worker source', async () => {
  const javascript = code(await build(options));
  assert.ok(javascript.includes('world-player-recovery'));
  assert.ok(!javascript.includes('virtual:world-recovery-worker'));
});
test('forwards frozen baseline source overrides into the child worker build', async () => {
  const javascript = code(await build({ ...options, plugins: [{ name: 'fixture-worker-baseline', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/recovery-session.worker.ts')) return 'globalThis.onmessage = () => globalThis.postMessage("baseline-override-forwarded");';
  } }] }));
  assert.ok(javascript.includes('baseline-override-forwarded'));
});

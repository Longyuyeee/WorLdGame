import { build } from './player-fixture-build.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export async function runPlayerInput(client, root, temporary) {
  const bundle = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: join(root, 'tools/player-input-browser.ts'), name: 'PlayerInput', formats: ['iife'] } } });
  const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(item => item.type === 'chunk').code;
  const rows = [], started = performance.now();
  for (const viewport of [{ width: 1440, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    for (const mode of ['instant', 'typewriter']) {
      const path = join(temporary, 'input.html');
      await writeFile(path, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="player-root"></div><script>${code.replaceAll('</script', '<\\/script')}\nglobalThis.input=PlayerInput.start(${JSON.stringify(mode)});</script>`);
      await client.send('Page.navigate', { url: pathToFileURL(path).href }); await client.wait('globalThis.input');
      for (let round = 0; round < 2; round++) rows.push({ viewport, ...await client.evaluate(`globalThis.inputTask=input.round(${round})`) });
      console.log('INPUT_MATRIX', viewport.width, mode);
      await client.evaluate('input.close()');
    }
  }
  assert.equal(rows.length, 8); assert.deepEqual(client.errors, []);
  const result = { schemaVersion: 1, scope: 'production-player-injected-gamepad-not-physical-device', elapsedMilliseconds: performance.now() - started, rows, exceptions: client.errors };
  await writeFile(join(root, 'evidence/authoring/player-input.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

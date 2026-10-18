import { build } from './player-fixture-build.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export async function runPlayerVoice(client, root, temporary) {
  const bundle = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: join(root, 'tools/player-voice-browser.ts'), name: 'PlayerVoice', formats: ['iife'] } } });
  const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(item => item.type === 'chunk').code;
  const runs = [], started = performance.now();
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const tap = async name => {
    const point = await client.evaluate(`voiceRun.point(${JSON.stringify(name)})`);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  for (const viewport of [{ width: 1440, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    for (const mode of ['instant', 'typewriter']) {
      const path = join(temporary, 'voice.html');
      await writeFile(path, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="player-root"></div><script>${code.replaceAll('</script', '<\\/script')}\nglobalThis.voiceRun=PlayerVoice.start(${JSON.stringify(mode)},${JSON.stringify(`voice_${viewport.width}_${mode}`)});</script>`);
      await client.send('Page.navigate', { url: pathToFileURL(path).href }); await client.wait('globalThis.voiceRun && document.querySelector("main")?.dataset.recoveryOperation === "idle"');
      await tap('开始故事');
      const rows = [];
      for (let scene = 0; scene < 12; scene++) {
        rows.push(await client.evaluate(`globalThis.voiceTask=voiceRun.scene(${scene})`));
        if (scene < 11) await tap(`进入场景 ${scene + 1}`);
      }
      const result = await client.evaluate('voiceRun.close()'); assert.equal(result.mounted, false);
      assert.ok(result.events.filter(event => event.kind === 'ended').length >= 12);
      runs.push({ viewport, mode, rows, ...result }); console.log('VOICE_MATRIX', viewport.width, mode);
    }
  }
  assert.deepEqual(client.errors, []);
  const result = { schemaVersion: 1, scope: 'production-player-synthetic-WAV-CDP-touch-not-physical-device-or-speech', elapsedMilliseconds: performance.now() - started, runs, exceptions: client.errors };
  await writeFile(join(root, 'evidence/authoring/player-voice.json'), JSON.stringify(result, null, 2) + '\n'); return result;
}

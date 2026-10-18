import { build } from './player-fixture-build.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export async function runPlayerCold(client, root, temporary) {
  const bundle = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: join(root, 'tools/player-cold-browser.ts'), name: 'PlayerCold', formats: ['iife'] } } });
  const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(item => item.type === 'chunk').code;
  const rows = [], started = performance.now();
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const tapPoint = async point => { await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1 }] }); await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const tap = async name => tapPoint(await client.evaluate(`cold.point(${JSON.stringify(name)})`));
  for (const viewport of [{ width: 1440, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    const navigate = async cold => {
      const path = join(temporary, 'cold.html');
      await writeFile(path, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="player-root"></div><script>${code.replaceAll('</script', '<\\/script')}\nglobalThis.cold=PlayerCold.start("cold_${viewport.width}",${cold});</script>`);
      await client.send('Page.navigate', { url: pathToFileURL(path).href }); await client.wait('globalThis.cold'); await client.evaluate('globalThis.coldTask=cold.ready()');
    };
    await navigate(false); await tap('开始故事'); const saved = await client.evaluate('globalThis.coldTask=cold.seed()'); await client.evaluate('cold.close()');
    await navigate(true);
    const before = await client.evaluate('cold.point("开始故事")');
    await tapPoint(before); assert.equal(await client.evaluate('document.querySelector("main").dataset.playerStatus'), 'title');
    await client.evaluate('globalThis.coldTask=cold.releaseScan()');
    const after = await client.evaluate('cold.point("开始故事")'); assert.deepEqual(after, before);
    await writeFile(join(root, `evidence/authoring/player-cold-title-${viewport.width}.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await tapPoint(before); await client.evaluate('globalThis.coldTask=cold.confirmation()'); await tap('保留原进度');
    await tap('恢复上次进度'); await client.evaluate('globalThis.coldTask=cold.restored()');
    await writeFile(join(root, `evidence/authoring/player-cold-${viewport.width}.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await client.evaluate('cold.allowAudio()'); await tap('恢复声音'); await client.evaluate('globalThis.coldTask=cold.playing()');
    await client.evaluate('globalThis.coldTask=cold.interrupt()'); await tap('恢复声音'); await client.evaluate('globalThis.coldTask=cold.playing()');
    await client.evaluate('globalThis.coldTask=cold.suspendResumeDenied()'); await client.evaluate('cold.allowAudio()'); await tap('恢复声音'); await client.evaluate('globalThis.coldTask=cold.playing()');
    // A real second cold start must rediscover the persisted record, not bypass recovery via project isolation.
    const audioRecovery = await client.evaluate('cold.close()'); assert.ok(audioRecovery.plays >= 3); await navigate(true); await client.evaluate('globalThis.coldTask=cold.releaseScan()');
    await tap('开始故事'); await client.evaluate('globalThis.coldTask=cold.confirmation()'); await client.evaluate('globalThis.coldTask=cold.failNewStory()');
    await client.evaluate('cold.allowAudio()'); await tap('确认开始新故事'); const restored = await client.evaluate(`globalThis.coldTask=cold.newStory(${JSON.stringify(saved.quickHash)})`);
    const final = await client.evaluate('cold.close()'); assert.equal(final.unmounted, true);
    rows.push({ viewport, sameProjectColdStarts: 2, stableStartPoint: before, scanningHeld: true, explicitDecision: true, permissionRetry: true, interruptionRetry: true, resumeRetry: true, clearFailureHeld: true, audioRecovery, ...restored, ...final }); console.log('COLD_MATRIX', viewport.width);
  }
  assert.deepEqual(client.errors, []);
  const result = { schemaVersion: 1, scope: 'real-IndexedDB-reload-CDP-touch-synthetic-WAV-injected-permission-storage-faults-not-device', elapsedMilliseconds: performance.now() - started, rows, exceptions: client.errors };
  await writeFile(join(root, 'evidence/authoring/player-cold.json'), JSON.stringify(result, null, 2) + '\n'); return result;
}

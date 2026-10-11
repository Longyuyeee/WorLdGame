import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { sampleBrowserMemory } from './player-process-memory.mjs';

export async function runPlayerMixed(client, root, temporary, browserPid, restart) {
  const built = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: join(root, 'tools/player-mixed-browser.ts'), name: 'MixedPlayer', formats: ['iife'] } } });
  const code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk').code;
  const runs = [], errors = [], started = performance.now();
  const browser = await client.send('Browser.getVersion');
  const sample = async phase => ({ phase, elapsedMilliseconds: performance.now() - started, process: await sampleBrowserMemory(browserPid), heap: await client.send('Runtime.getHeapUsage'), dom: await client.send('Memory.getDOMCounters'), product: await client.evaluate('mixed.observe()') });
  const tap = async name => {
    const point = await client.evaluate(`mixed.point(${JSON.stringify(name)})`);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  for (const width of [1440, 390]) {
    const viewport = { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 };
    const path = join(temporary, `mixed-${width}.html`);
    await writeFile(path, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="player-root"></div><script>${code.replaceAll('</script', '<\\/script')}\nglobalThis.mixedReady=MixedPlayer.start('mixed_${width}').then(value=>globalThis.mixed=value);</script>`);
    const navigate = async () => {
      await client.send('Emulation.setDeviceMetricsOverride', viewport);
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await client.send('Page.navigate', { url: pathToFileURL(path).href }); await client.wait('globalThis.mixed');
      return client.evaluate('globalThis.mixedTask=mixed.ready()');
    };
    assert.equal(await navigate(), 'idle'); await tap('开始故事');
    const rows = [], samples = [await sample('start')];
    for (let scene = 0; scene < 12; scene++) {
      rows.push(await client.evaluate(`globalThis.mixedTask=mixed.chapter(${scene})`));
      samples.push(await sample(`chapter-${scene}`));
      console.log('MIXED_CHAPTER', width, scene, rows.at(-1).historyLength);
      if (scene < 11) await tap(`进入场景 ${scene + 1}`);
    }
    const checkpoint = await client.evaluate('globalThis.mixedTask=mixed.checkpoint()');
    const observation = await client.evaluate('mixed.observe()');
    assert.ok(checkpoint.historyLength >= 192, 'Long story history did not accumulate in one instance');
    assert.equal(observation.peakWrites, 1);
    assert.ok(observation.events.filter(event => event.kind === 'video' && event.type === 'ended').length >= 6);
    assert.ok(observation.events.filter(event => event.kind === 'audio' && event.type === 'ended').length >= 12);
    assert.equal(observation.events.filter(event => event.type === 'error').length, 0);
    await writeFile(join(root, `evidence/authoring/player-mixed-${width}.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    errors.push(...client.errors);
    const previousPid = browserPid;
    const replacement = await restart(); client = replacement.client; browserPid = replacement.browserPid;
    assert.notEqual(browserPid, previousPid);
    assert.equal(await navigate(), 'available'); await tap('恢复上次进度');
    const restored = await client.evaluate(`globalThis.mixedTask=mixed.restored(${JSON.stringify(checkpoint)})`);
    samples.push(await sample('cold-restored'));
    const closed = await client.evaluate('globalThis.mixedTask=mixed.close()');
    assert.equal(closed.unmounted, true); assert.equal(closed.native.accountedBytes, 0); assert.equal(closed.native.activeDecodes, 0); assert.equal(closed.native.ordinaryBitmapDecodes, 0);
    errors.push(...client.errors);
    runs.push({ viewport, mountsBeforeColdRestart: 1, rows, samples, checkpoint, observation, coldRestart: { previousPid, browserPid, previousProcessExited: replacement.previousProcessExited, sameProfile: true, mode: 'graceful-browser-exit-not-crash', restored }, closed });
  }
  assert.deepEqual(errors, []);
  const evidence = { schemaVersion: 1, scope: 'single-story-mixed-PNG-WAV-WebM-real-IndexedDB-cold-process-restart', bundleSha256: createHash('sha256').update(code).digest('hex'), browser, elapsedMilliseconds: performance.now() - started, gcPolicy: 'natural-no-forced-GC-no-CDP-pressure', runs, exceptions: errors, limits: 'Synthetic media, accelerated Auto/Skip, injected storage delay/quota, CDP touch and host suspension. Browser process closes gracefully, not crash recovery. Frame intervals are rAF cadence, not GPU timings; discrete Windows tree working sets may double-count shared pages and are not instantaneous peaks. No physical phone or two-hour acceptance.' };
  await writeFile(join(root, 'evidence/authoring/player-mixed.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}

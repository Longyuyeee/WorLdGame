import { build } from './player-fixture-build.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { sampleBrowserMemory } from './player-process-memory.mjs';

export async function runPlayerBackpressure(client, root, temporary, browserPid) {
  const built = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: join(root, 'tools/player-backpressure-browser.ts'), name: 'BackpressurePlayer', formats: ['iife'] } } });
  const code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk').code;
  const rows = [];
  for (const width of [1440, 390]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 });
    const path = join(temporary, 'backpressure.html');
    await writeFile(path, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="player-root"></div><script>${code.replaceAll('</script', '<\\/script')}\nglobalThis.backpressure=BackpressurePlayer.start('backpressure_${width}');</script>`);
    await client.send('Page.navigate', { url: pathToFileURL(path).href }); await client.wait('globalThis.backpressure');
    const before = await sampleBrowserMemory(browserPid);
    // Poll rather than holding a CDP request across a deliberately slow IO timeout.
    await client.evaluate('globalThis.result=null;globalThis.failure=null;backpressure.run().then(value=>globalThis.result=value,error=>globalThis.failure=String(error))');
    await client.wait('globalThis.result || globalThis.failure');
    assert.equal(await client.evaluate('globalThis.failure'), null);
    const result = await client.evaluate('globalThis.result');
    const reopened = await client.evaluate('backpressure.reopen()');
    const after = await sampleBrowserMemory(browserPid);
    await writeFile(join(root, `evidence/authoring/player-backpressure-${width}.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    rows.push({ width, ...result, ...reopened, before, after, ...await client.evaluate('backpressure.close()') });
  }
  assert.deepEqual(client.errors, []);
  const evidence = { scope: 'single-story-production-player-real-IndexedDB-injected-delay-quota', bundleSha256: createHash('sha256').update(code).digest('hex'), browser: await client.send('Browser.getVersion'), rows, exceptions: client.errors, limits: 'Synthetic text only; delayed IO and quota injected before real IndexedDB. Reopen is a remount, not OS process death. No mixed audio/video, physical phone or two-hour acceptance.' };
  await writeFile(join(root, 'evidence/authoring/player-backpressure.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}

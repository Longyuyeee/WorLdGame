import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { sampleBrowserMemory } from './player-process-memory.mjs';

export async function runPlayerMixed(client, root, temporary, browserPid, restart) {
  const profile = process.argv.includes('--mixed-profile');
  const optimized = process.argv.includes('--mixed-optimized');
  const extended = process.argv.includes('--session-extended'), session = extended || process.argv.includes('--session-budget');
  assert.ok(!session || (!profile && !optimized), 'Session evidence must not overwrite earlier budget/profile evidence');
  const chapters = extended ? 24 : 12;
  const packing = process.argv.includes('--storage-packed');
  if (packing) assert.ok(session && !profile && !optimized, 'Storage evidence needs a natural session run');
  const prefix = packing ? `player-packed-${extended ? 'extended' : 'mixed'}` : extended ? 'player-session-extended' : session ? 'player-session-mixed' : profile ? `player-mixed-profile-${optimized ? 'after' : 'before'}` : optimized ? 'player-mixed-optimized' : 'player-mixed';
  // Reproducing the "before" CPU diagnostic must never silently profile the new
  // implementations. Load the two changed production modules from the fixed
  // baseline without modifying the user's checkout. Dependencies remain current.
  const baselineSources = new Map(profile && !optimized ? ['packages/runtime/src/canonical.ts', 'packages/player-core/src/player-core.ts'].map(path => [
    join(root, path).replaceAll('\\', '/'), execFileSync('git', ['show', `11cc1c8c0687e93d8a8985b529093e4fdf5d2d8b:${path}`], { cwd: root, encoding: 'utf8' })
  ]) : []);
  const loadedBaseline = new Set();
  const built = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'frozen-budget-baseline', enforce: 'pre', load(id) {
    const path = id.replaceAll('\\', '/');
    if (baselineSources.has(path)) { loadedBaseline.add(path); return baselineSources.get(path); }
    return null;
  } }], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: !profile, lib: { entry: join(root, 'tools/player-mixed-browser.ts'), name: 'MixedPlayer', formats: ['iife'] } } });
  assert.equal(loadedBaseline.size, baselineSources.size, 'Baseline module substitution must be complete');
  const code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk').code;
  const runs = [], errors = [], started = performance.now();
  const browser = await client.send('Browser.getVersion');
  const sample = async phase => ({ phase, elapsedMilliseconds: performance.now() - started, process: await sampleBrowserMemory(browserPid), heap: await client.send('Runtime.getHeapUsage'), dom: await client.send('Memory.getDOMCounters'), product: await client.evaluate('mixed.observe()') });
  const tap = async name => {
    const point = await client.evaluate(`mixed.point(${JSON.stringify(name)})`);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  for (const width of extended ? [390] : [1440, 390]) {
    const viewport = { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 };
    const path = join(temporary, `mixed-${width}.html`);
    await writeFile(path, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="player-root"></div><script>${code.replaceAll('</script', '<\\/script')}\nglobalThis.mixedReady=MixedPlayer.start('mixed_${width}',${chapters}).then(value=>globalThis.mixed=value);</script>`);
    const navigate = async () => {
      await client.send('Emulation.setDeviceMetricsOverride', viewport);
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await client.send('Page.navigate', { url: pathToFileURL(path).href }); await client.wait('globalThis.mixed');
      return client.evaluate('globalThis.mixedTask=mixed.ready()');
    };
    assert.equal(await navigate(), 'idle');
    if (profile) { await client.send('Profiler.enable'); await client.send('Profiler.start'); }
    await tap('开始故事');
    const rows = [], samples = [await sample('start')];
    for (let scene = 0; scene < chapters; scene++) {
      rows.push(await client.evaluate(`globalThis.mixedTask=mixed.chapter(${scene})`));
      samples.push(await sample(`chapter-${scene}`));
      console.log('MIXED_CHAPTER', width, scene, rows.at(-1).historyLength);
      if (scene < chapters - 1) await tap(`进入场景 ${scene + 1}`);
    }
    const checkpoint = await client.evaluate('globalThis.mixedTask=mixed.checkpoint()');
    const storage = packing ? await client.evaluate('mixed.storage()') : null;
    if (packing) {
      assert.equal(storage.databaseVersion, 4);
      for (const record of [storage.recovery, storage.quick]) {
        assert.equal(record.packed, true);
        assert.ok(record.payloadBytes < record.canonicalBytes);
      }
    }
    const observation = await client.evaluate('mixed.observe()');
    assert.ok(checkpoint.historyLength >= chapters * 16, 'Long story history did not accumulate in one instance');
    assert.equal(observation.peakWrites, 1);
    assert.ok(observation.events.filter(event => event.kind === 'video' && event.type === 'ended').length >= chapters / 2);
    assert.ok(observation.events.filter(event => event.kind === 'audio' && event.type === 'ended').length >= chapters);
    assert.equal(observation.events.filter(event => event.type === 'error').length, 0);
    let cpu = null;
    if (profile) {
      const { profile: captured } = await client.send('Profiler.stop');
      const nodes = new Map(captured.nodes.map(node => [node.id, node]));
      const totals = new Map();
      for (let i = 0; i < captured.samples.length; i++) {
        const frame = nodes.get(captured.samples[i]).callFrame;
        const key = `${frame.functionName || '(anonymous)'}:${frame.lineNumber}`;
        totals.set(key, (totals.get(key) ?? 0) + captured.timeDeltas[i]);
      }
      cpu = { durationMicroseconds: captured.endTime - captured.startTime, selfMicroseconds: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 100) };
      await client.send('Profiler.disable');
    }
    await writeFile(join(root, `evidence/authoring/${prefix}-${width}.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
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
    runs.push({ viewport, cpu, storage, mountsBeforeColdRestart: 1, rows, samples, checkpoint, observation, coldRestart: { previousPid, browserPid, previousProcessExited: replacement.previousProcessExited, sameProfile: true, mode: 'graceful-browser-exit-not-crash', restored }, closed });
  }
  assert.deepEqual(errors, []);
  const evidence = { schemaVersion: 1, scope: 'single-story-mixed-PNG-WAV-WebM-real-IndexedDB-cold-process-restart', bundleSha256: createHash('sha256').update(code).digest('hex'), browser, elapsedMilliseconds: performance.now() - started, gcPolicy: 'natural-no-forced-GC-no-CDP-pressure', runs, exceptions: errors, limits: 'Synthetic media, accelerated Auto/Skip, injected storage delay/quota, CDP touch and host suspension. Browser process closes gracefully, not crash recovery. Frame intervals are rAF cadence, not GPU timings; discrete Windows tree working sets may double-count shared pages and are not instantaneous peaks. No physical phone or two-hour acceptance.' };
  evidence.measurementMode = profile ? 'intrusive-CPU-sampling-unminified-production-not-performance-acceptance' : 'minified-production-natural-GC';
  evidence.chaptersPerRun = chapters;
  await writeFile(join(root, `evidence/authoring/${prefix}.json`), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateOwnedExport } from './audit-player-owned-decode.mjs';

export function validatePlayerMixed(evidence, { chapters = 12, widths = [1440, 390] } = {}) {
  assert.equal(evidence.scope, 'single-story-mixed-PNG-WAV-WebM-real-IndexedDB-cold-process-restart');
  assert.equal(evidence.gcPolicy, 'natural-no-forced-GC-no-CDP-pressure');
  assert.match(evidence.bundleSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.exceptions, []);
  assert.deepEqual(evidence.runs.map(run => run.viewport.width), widths);
  for (const run of evidence.runs) {
    assert.equal(run.mountsBeforeColdRestart, 1);
    assert.equal(run.rows.length, chapters);
    let history = 0;
    for (const [scene, row] of run.rows.entries()) {
      assert.equal(row.scene, scene); assert.equal(row.mode, scene % 2 ? 'skipAll' : 'auto');
      assert.equal(row.entryDecode, 'owned-bitmap'); assert.equal(row.boundaryHeld, true);
      assert.equal(row.choiceLayout.contained, true); assert.ok(row.choiceLayout.labelWidth >= row.choiceLayout.buttonWidth / 2); assert.ok(row.choiceLayout.labelHeight <= row.choiceLayout.buttonHeight);
      assert.ok(row.historyLength > history); history = row.historyLength;
      assert.equal(row.historyArchives, 0); assert.equal(row.peakWrites, 1);
      assert.ok(row.maxSerializedBytes > 0 && row.maxSerializedBytes <= 64 * 1024 * 1024);
      assert.ok(row.native.peakBytes > 0 && row.native.peakBytes <= row.native.budgetBytes);
      assert.equal(row.native.ordinaryQuarantinedDecodes, 0);
      assert.ok(row.frames.count > 0 && Number.isFinite(row.frames.max) && row.frames.max > 0);
      if (scene % 2 === 0) { assert.equal(row.videoEnded, true); assert.equal(row[scene === 8 ? 'videoSuspendedHeld' : 'videoRenderHeld'], true); }
    }
    assert.equal(run.rows[4].timeoutQuickLoadHeld, true); assert.equal(run.rows[4].latestLoadDurable, true);
    assert.equal(run.rows[6].quotaRecovered, true); assert.equal(run.rows[10].historyHeld, true);
    assert.ok(history >= chapters * 16); assert.equal(run.checkpoint.historyLength, history);
    assert.match(run.checkpoint.hash, /^[a-f0-9]{64}$/);
    assert.equal(run.coldRestart.previousProcessExited, true); assert.equal(run.coldRestart.sameProfile, true);
    assert.equal(run.coldRestart.mode, 'graceful-browser-exit-not-crash');
    assert.notEqual(run.coldRestart.previousPid, run.coldRestart.browserPid);
    assert.equal(run.coldRestart.restored.hash, run.checkpoint.hash);
    assert.equal(run.coldRestart.restored.historyLength, history);
    assert.equal(run.coldRestart.restored.quickPreserved, true); assert.equal(run.coldRestart.restored.backForwardHeld, true);
    assert.equal(run.samples.length, chapters + 2);
    for (const [index, sample] of run.samples.entries()) {
      assert.equal(sample.phase, index === 0 ? 'start' : index === chapters + 1 ? 'cold-restored' : `chapter-${index - 1}`);
      const tree = sample.process;
      assert.equal(tree.identityPolicy, 'parent-chain-and-creation-time');
      assert.equal(tree.browserPid, index === chapters + 1 ? run.coldRestart.browserPid : run.coldRestart.previousPid);
      const nodes = new Map(tree.processes.map(process => [process.pid, process])); assert.equal(nodes.size, tree.processes.length);
      assert.equal(nodes.get(tree.browserPid)?.role, 'browser');
      for (const process of tree.processes) {
        assert.ok(Number.isSafeInteger(process.startedAtMilliseconds));
        const visited = new Set(); let child = process;
        while (child.pid !== tree.browserPid) {
          assert.ok(!visited.has(child.pid)); visited.add(child.pid);
          const parent = nodes.get(child.parentPid); assert.ok(parent); assert.ok(child.startedAtMilliseconds >= parent.startedAtMilliseconds); child = parent;
        }
      }
      assert.ok(sample.heap.usedSize > 0 && sample.dom.nodes > 0);
    }
    const events = run.observation.events;
    assert.ok(events.filter(event => event.kind === 'video' && event.type === 'ended').length >= chapters / 2);
    assert.ok(events.filter(event => event.kind === 'audio' && event.type === 'ended').length >= chapters);
    assert.equal(events.filter(event => event.type === 'error').length, 0);
    assert.equal(run.closed.unmounted, true);
    for (const key of ['accountedBytes', 'activeDecodes', 'queuedDecodes', 'quarantinedGroups', 'ordinaryBitmapDecodes', 'ordinaryQuarantinedDecodes']) assert.equal(run.closed.native[key], 0, key);
  }
  return { runs: widths.length, chapters: chapters * widths.length, coldProcessRestarts: widths.length, scope: 'synthetic-mixed-media-not-device-performance-acceptance' };
}

export async function auditPlayerMixed(root) {
  const read = async name => JSON.parse(await readFile(join(root, `evidence/authoring/${name}.json`), 'utf8'));
  const fixture = JSON.parse(await readFile(join(root, 'fixtures/projects/dicing/sequence.json'), 'utf8'));
  return { mixed: validatePlayerMixed(await read('player-mixed')), exports: validateOwnedExport(fixture, await read('player-mixed-export-sequence'), await read('player-mixed-export-quality'), await read('player-mixed-export-workflow')) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await auditPlayerMixed(process.cwd()), null, 2));

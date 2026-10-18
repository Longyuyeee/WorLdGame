import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validatePlayerPressure} from './audit-player-pressure.mjs';

export function validatePlayerRetention({playback,beforeFirst,beforeLast,afterFirst,afterLast}){
  validatePlayerPressure(playback);
  assert.deepEqual(playback.heapSnapshotRounds,[0,playback.rounds-1]);
  assert.ok(beforeLast.totals.cssAnimations>beforeFirst.totals.cssAnimations,'Control must reproduce growing animation ownership');
  assert.ok(beforeLast.totals.detachedDialogueButtons>beforeFirst.totals.detachedDialogueButtons);
  assert.ok(beforeFirst.paths.some(path=>path.some(node=>node.node.includes(':DocumentTimeline'))&&path.some(node=>node.node.includes(':CSSAnimation'))),'Missing root-path evidence');
  for(const report of [afterFirst,afterLast]){
    assert.equal(report.totals.cssAnimations,0);
    for(const key of ['detachedDialogueButtons','detachedDialogueTextNodes','detachedIndicators']){
      assert.ok(Number.isInteger(report.totals[key])&&report.totals[key]>=0&&report.totals[key]<=1,`${key} must not accumulate`);
      assert.ok(afterLast.totals[key]<=afterFirst.totals[key]);
    }
  }
  const titles=playback.samples.filter(sample=>sample.phase==='title');
  // Small renderer bookkeeping tolerance; the old failure added 62–84 nodes / 12 listeners per round.
  for(const sample of titles){
    assert.ok(sample.afterGc.dom.nodes<=titles[0].afterGc.dom.nodes+16,'Mounted DOM growth');
    assert.ok(sample.afterGc.dom.jsEventListeners<=titles[0].afterGc.dom.jsEventListeners+2,'Mounted listener growth');
  }
  return {status:'PASS',rounds:playback.rounds,animationOwnership:'released',scope:playback.scope};
}
export async function readPlayerRetention(root){
  const names={playback:'player-retention',beforeFirst:'player-retention-before-first',beforeLast:'player-retention-before-last',afterFirst:'player-retention-after-first',afterLast:'player-retention-after-last'};
  return Object.fromEntries(await Promise.all(Object.entries(names).map(async([key,name])=>[key,JSON.parse(await readFile(join(root,`evidence/authoring/${name}.json`),'utf8'))])));
}
export async function auditPlayerRetention(root){return validatePlayerRetention(await readPlayerRetention(root));}

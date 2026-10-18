import assert from 'node:assert/strict';

/** Sampled high-water marks, never an assertion of leak freedom or a device memory budget. */
export function summarizePlayerSoak(evidence) {
  const titles = evidence.samples.filter(sample => sample.phase === 'title');
  assert.ok(titles.length >= 2, 'At least two completed rounds are required');
  const range = values => ({ first: values[0], last: values.at(-1), minimum: Math.min(...values), sampledMaximum: Math.max(...values) });
  const sampleGaps = evidence.samples.slice(1).map((sample, index) => sample.elapsedMilliseconds - evidence.samples[index].elapsedMilliseconds);
  assert.ok(sampleGaps.every(gap => gap >= 0), 'Samples must be chronological');
  return {
    scope: 'sampled-observations-not-continuous-peaks-or-leak-verdict',
    completedRounds: evidence.rounds,
    sceneVisits: evidence.rounds * evidence.scenes,
    elapsedMinutes: evidence.elapsedMilliseconds / 60000,
    maximumSampleGapMilliseconds: Math.max(...sampleGaps),
    titleHeapBytes: range(titles.map(sample => sample.heap.usedSize)),
    titleNodes: range(titles.map(sample => sample.dom.nodes)),
    titleListeners: range(titles.map(sample => sample.dom.jsEventListeners)),
    browserTreeWorkingSetBytes: range(evidence.samples.map(sample => sample.process.workingSetBytes)),
    browserTreePrivateBytes: range(evidence.samples.map(sample => sample.process.privateBytes))
  };
}

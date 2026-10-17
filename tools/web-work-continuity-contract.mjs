import assert from 'node:assert/strict';

export function rainRouteContract(project, branch) {
  assert.ok(branch === 0 || branch === 1, 'Unknown route');
  const titles = ['车站的雨', '候车室的旧信', '站台前的约定', ...(branch === 0 ? ['留下', '灯下的回信', '雨后的天明'] : ['远行', '车窗与海', '再一次见面'])];
  const scenes = titles.map(title => {
    const found = project.scenes.filter(scene => scene.title === title);
    assert.equal(found.length, 1, `Ambiguous or missing scene: ${title}`);
    const script = project.scripts[found[0].id]; assert.ok(script, 'Missing scene script'); return script;
  });
  const statements = scenes.flatMap(script => script.statements);
  const texts = statements.filter(row => row.kind === 'narration' || row.kind === 'dialogue');
  assert.equal(new Set(texts.map(row => row.id)).size, texts.length, 'Repeated statement identity');
  assert.equal(new Set(texts.map(row => row.text)).size, texts.length, 'Text lookup would be ambiguous');
  const voices = statements.flatMap((row, index) => {
    if (row.kind !== 'direction' || row.command !== 'audio' || !/\bbus=voice\b/u.test(row.summary) || !/\baction=play\b/u.test(row.summary)) return [];
    const next = statements.slice(index + 1).find(next => next.kind === 'narration' || next.kind === 'dialogue'); assert.ok(next); return [next.id];
  });
  const endings = statements.filter(row => row.kind === 'end'); assert.equal(endings.length, 1);
  return { titles, texts: texts.map(row => row.id), voices, ending: endings[0].endingName };
}

export function assertRouteObservation(expected, actual) {
  assert.deepEqual(actual.texts, expected.texts, 'Every paragraph must occur once in the authored order');
  assert.deepEqual(actual.voices, expected.voices, 'Every authored voice must complete natively once');
  assert.deepEqual(actual.voiceProof.map(row => row.statementId), expected.voices);
  assert.ok(actual.voiceProof.every(row => row.nativeEnded === true && row.error === null && row.duration > 0 && row.completedTime > 0), 'Native voice completion is required, not just Auto advancement');
  assert.equal(actual.ending, expected.ending, 'Wrong ending');
  assert.equal(actual.autoAdvanced, true); assert.equal(actual.explicitLoadStoppedAuto, true);
  assert.equal(actual.actualReopenResumed, true); assert.equal(actual.slotPreserved, true);
}

export function assertMatrixCoverage(rows) {
  assert.equal(rows.length, 4, 'Four distinct format/route cells are required');
  assert.deepEqual(rows.map(row => `${row.format}:${row.branch}`).sort(), ['html:0', 'html:1', 'website:0', 'website:1']);
  for (const row of rows) {
    assert.equal(row.passed, true); assert.equal(row.offline, row.format === 'website');
    assert.equal(row.texts.length, 66); assert.equal(row.voices.length, 6);
  }
}

import { expect, it } from 'vitest';
import { advanceFormalPreview, selectFormalPreviewChoice, startFormalPreview } from './formal-preview-runtime';
import { updateFormalPreviewProject } from './formal-preview-hot-update';
import { completionFromTrace, mergePlaytestCompletions, playtestEndingTargets, readPlaytestProgress, writePlaytestProgress } from './playtest-progress';
import { progressProject, progressTrace, endedTrace } from './playtest-progress-fixture';
it('accumulates distinct ending IDs with equal names and does not duplicate a repeat observation', () => {
  const project = progressProject(), first = completionFromTrace(project, endedTrace(), 10)!, second = completionFromTrace(project, endedTrace(true), 20)!;
  expect(first).not.toBeNull(); const both = mergePlaytestCompletions([first], [second]); expect(both).toHaveLength(2); expect(mergePlaytestCompletions(both, [first])).toBe(both);
  expect(readPlaytestProgress(writePlaytestProgress(project.manifest.projectId, both), project.manifest.projectId)).toEqual(both);
});
it('excludes partial runs, incomplete paths, foreign versions and unobserved endings', () => {
  const project = progressProject(), trace = endedTrace();
  for (const changed of [{ ...trace, startKind: 'scene' }, { ...trace, status: 'presenting' }, { ...trace, playtestSourceHash: null }, { ...trace, sourceHash: 'a'.repeat(64) }, { ...trace, statementIds: [] }, { ...trace, endingId: 'unknown' }]) expect(completionFromTrace(project, changed)).toBeNull();
});
it('does not count hot-update replay as a new complete playtest; a fresh start becomes eligible', () => {
  const project = progressProject(), waiting = advanceFormalPreview(startFormalPreview(project));
  const updated = { ...project, scripts: { ...project.scripts, entry: { ...project.scripts.entry!, statements: project.scripts.entry!.statements.map(s => s.id === 'intro' ? { ...s, text: '改稿后的雨声。' } : s) } } };
  const applied = updateFormalPreviewProject(updated, waiting); expect(applied.kind).toBe('applied'); if (applied.kind !== 'applied') throw Error('fixture');
  expect(completionFromTrace(updated, progressTrace(selectFormalPreviewChoice(applied.state, 'left')))).toBeNull();
  expect(completionFromTrace(updated, progressTrace(selectFormalPreviewChoice(advanceFormalPreview(startFormalPreview(updated)), 'left')))).not.toBeNull();
});
it('rejects damaged, duplicate and foreign project data without changing the supplied bytes', () => {
  const project = progressProject(), entry = completionFromTrace(project, endedTrace(), 10)!, raw = writePlaytestProgress(project.manifest.projectId, [entry]);
  expect(() => readPlaytestProgress(raw, 'other')).toThrow(); expect(() => readPlaytestProgress('broken', project.manifest.projectId)).toThrow(); expect(() => writePlaytestProgress(project.manifest.projectId, [entry, entry])).toThrow(); expect(() => writePlaytestProgress(project.manifest.projectId, [{ ...entry, completedAt: Infinity }])).toThrow();
});
it('uses the formal Compiler ending catalog and excludes disconnected draft endings', () => {
  const project = progressProject(), extended = { ...project, scripts: { ...project.scripts, entry: { ...project.scripts.entry!, statements: [project.scripts.entry!.statements[0]!, { id: 'jump', kind: 'jump', targetLabel: 'stay' }] } } };
  expect(playtestEndingTargets(extended).map(item => item.endingId)).toEqual(['stay_end']);
});

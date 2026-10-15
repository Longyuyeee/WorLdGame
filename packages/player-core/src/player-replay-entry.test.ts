import { expect, it } from 'vitest';
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from '@world-studio/project-domain';
import branching from '../../../fixtures/projects/branching/project.s0.json';
import { canEnterPlayerCoreReplayV1, compactPlayerCoreHistoryV1, createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1, loadPlayerCoreSessionSaveV1, mergePlayerCoreMetaProgressV1, mergePlayerCoreReplayEntriesV1, playerCoreMetaProgressV1, schedulePlayerCorePlaybackV1 } from './player-core';
import { loadPlayerReplayEntryV1 } from './player-replay-entry';
function source(): CanonicalProject {
  const project = loadProject(migrateS0Project(branching as S0Project).files);
  return { ...project, variables: { ...project.variables, variables: [{ id: 'route_score', type: 'number', defaultValue: 0 }] }, scripts: { ...project.scripts, branch_start: { ...project.scripts.branch_start!, statements: [{ id: 'score', kind: 'set', variable: 'route_score', expression: '7' }, ...project.scripts.branch_start!.statements] } } };
}
function end(project: CanonicalProject) {
  let state = createPlayerCore(project);
  for (let i = 0; i < 20 && state.status !== 'ended'; i++) state = dispatchPlayerCoreIntentV1(state, project, state.status === 'waiting-choice' ? { kind: 'select-choice', optionId: 'branch_left_option' } : { kind: 'primary' });
  expect(state.status).toBe('ended'); return state;
}
it('retains a choice entrance with actual route variables after compaction, title and independent restore', () => {
  const project = source(), ended = end(project), compact = compactPlayerCoreHistoryV1(ended, 0);
  const entry = ended.replayEntries.find(item => item.sceneId === 'branch_left')!; expect(entry).toBeDefined();
  const loaded = loadPlayerReplayEntryV1(ended.artifacts!, entry)!; expect(loaded.state.variables.route_score).toBe(7); expect(loaded.state.cursor.instructionIndex).toBe(0);
  const title = dispatchPlayerCoreIntentV1(compact, project, { kind: 'restart' });
  let fresh = mergePlayerCoreMetaProgressV1(createPlayerCore(project), playerCoreMetaProgressV1(title)!); fresh = mergePlayerCoreReplayEntriesV1(fresh, title.replayEntries);
  expect(canEnterPlayerCoreReplayV1(fresh, 'branch_left')).toBe(true);
  const replay = dispatchPlayerCoreIntentV1(fresh, project, { kind: 'enter-scene-replay', replayId: 'branch_left' });
  expect(replay.runtimeState!.variables.route_score).toBe(7); expect(createPlayerCoreSnapshotV1(replay).presentation).toMatchObject({ kind: 'dialogue', text: 'The quiet route.' });
  expect(createPlayerCoreSessionSaveV1(replay).ok).toBe(false); expect(dispatchPlayerCoreIntentV1(replay, project, { kind: 'exit-scene-replay' })).toEqual(fresh);
});
it('rebuilds entrances from an existing formal save without changing its story boundary', () => {
  const project = source(), ended = end(project), saved = createPlayerCoreSessionSaveV1(ended); if (!saved.ok) throw Error('fixture');
  const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), saved.serialized); expect(loaded.ok).toBe(true); if (!loaded.ok) throw Error('load');
  expect(canEnterPlayerCoreReplayV1(loaded.state, 'branch_left')).toBe(true); expect(loaded.state.runtimeState).toEqual(ended.runtimeState);
});
it('rejects tampering and a foreign build; a locked replay remains unavailable even with an entrance', () => {
  const project = source(), ended = end(project), entry = ended.replayEntries.find(item => item.sceneId === 'branch_left')!;
  expect(loadPlayerReplayEntryV1(ended.artifacts!, { ...entry, sceneId: 'branch_right' })).toBeNull(); expect(loadPlayerReplayEntryV1(ended.artifacts!, { ...entry, buildId: 'other' })).toBeNull();
  const fresh = mergePlayerCoreReplayEntriesV1(createPlayerCore(project), [entry]); expect(canEnterPlayerCoreReplayV1(fresh, 'branch_left')).toBe(false);
});
it('returns to the exact parent on replay ending primary or restart', () => {
  const project = source(), parent = end(project); let replay = dispatchPlayerCoreIntentV1(parent, project, { kind: 'enter-scene-replay', replayId: 'branch_left' });
  replay = dispatchPlayerCoreIntentV1(replay, project, { kind: 'primary' }); expect(replay.status).toBe('ended');
  expect(dispatchPlayerCoreIntentV1(replay, project, { kind: 'primary' })).toEqual(parent); expect(dispatchPlayerCoreIntentV1(replay, project, { kind: 'restart' })).toEqual(parent);
});
it('captures scene transfers traversed in formal playback batches', () => {
  const project = source();
  // Start a fresh execution containing narration before an internal jump, then skip it.
  const jumpProject: CanonicalProject = { ...project, scripts: { ...project.scripts, branch_start: { ...project.scripts.branch_start!, statements: [{ id: 'intro', kind: 'narration', textId: 'intro_text', text: 'Intro' }, { id: 'jump', kind: 'jump', targetLabel: 'branch_left' }] } } };
  const started = dispatchPlayerCoreIntentV1(createPlayerCore(jumpProject), jumpProject, { kind: 'primary' });
  const ended = schedulePlayerCorePlaybackV1(started, { schemaVersion: 1, mode: 'skipAll', speed: 'instant', skipActivation: 'toggle', instantInstructionBudget: 128, stopInstructionIds: [], unavailableEffectDescriptorIds: [], autoTiming: { baseDelayMilliseconds: 0, millisecondsPerReadableUnit: 0, readableUnits: 0, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 0 } });
  expect(ended.status).toBe('ended'); expect(canEnterPlayerCoreReplayV1(ended, 'branch_left')).toBe(true);
});

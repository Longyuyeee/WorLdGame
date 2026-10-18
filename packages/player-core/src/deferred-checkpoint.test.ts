import { expect, it } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { createRuntimeSessionSaveV1 } from '@world-studio/runtime';
import * as api from './player-core';

function fixture() {
  const base = loadProject(migrateS0Project({ schemaVersion: 0, id: 'deferred', title: 'Deferred checkpoint', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    { id: 'before', kind: 'narration', textId: 'before_text', text: 'Before' }, { id: 'after', kind: 'narration', textId: 'after_text', text: 'After' }, { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files), script = base.scripts.main!;
  return { ...base, scripts: { ...base.scripts, main: { ...script, statements: [script.statements[0]!, { id: 'checkpoint1', kind: 'checkpoint' as const }, { id: 'checkpoint2', kind: 'checkpoint' as const }, ...script.statements.slice(1)] } } };
}
function states() { const project = fixture(); return { project, immediate: api.startPlayerCore(api.createPlayerCore(project), project), deferred: api.startPlayerCore(api.createPlayerCore(project, undefined, { checkpointSaveMode: 'deferred' }), project) }; }
function compare(immediate: api.PlayerCoreState, deferred: api.PlayerCoreState) {
  expect(api.createPlayerCoreSnapshotV1(deferred)).toEqual(api.createPlayerCoreSnapshotV1(immediate));
  expect(deferred.checkpointSaveCandidates).toEqual([]); expect(deferred.deferredCheckpointSaveCandidates).toHaveLength(2);
  for (const [index, candidate] of deferred.deferredCheckpointSaveCandidates.entries()) {
    const saved = createRuntimeSessionSaveV1(deferred.artifacts!.story, candidate.historySession);
    expect(saved).toMatchObject({ ok: true, serialized: immediate.checkpointSaveCandidates[index]!.serializedSessionSave, artifactHash: immediate.checkpointSaveCandidates[index]!.artifactHash });
    expect(candidate.runtimeStateHash).toBe(immediate.checkpointSaveCandidates[index]!.runtimeStateHash);
    expect(candidate.historySession.entries.at(-1)?.event).toMatchObject({ kind: 'checkpoint-reached', stepId: candidate.stepId });
  }
}
it('defers exact checkpoint prefixes without including later internal checkpoints or displayed text', () => {
  const { immediate, deferred } = states(), actual = api.advancePlayerCore(deferred); compare(api.advancePlayerCore(immediate), actual);
  const before = JSON.stringify(actual.deferredCheckpointSaveCandidates);
  api.advancePlayerCore(actual); expect(JSON.stringify(actual.deferredCheckpointSaveCandidates)).toBe(before);
});
it('also defers checkpoints encountered by automatic playback', () => {
  const { immediate, deferred } = states(); const policy: api.PlayerCorePlaybackPolicyV1 = { schemaVersion: 1, mode: 'auto', skipActivation: null, speed: 'normal', stopInstructionIds: [], unavailableEffectDescriptorIds: [], instantInstructionBudget: 128, autoTiming: { baseDelayMilliseconds: 20, millisecondsPerReadableUnit: 3, readableUnits: 10, voiceDurationMilliseconds: 80, voiceTailMilliseconds: 10 } };
  const after = api.schedulePlayerCorePlaybackV1(deferred, policy);
  compare(api.schedulePlayerCorePlaybackV1(immediate, policy), after);
  expect(api.schedulePlayerCorePlaybackV1(after, policy).deferredCheckpointSaveCandidates).toEqual([]);
});
it('clears pending candidates on navigation/load and retains the host policy after restart', () => {
  const { project, deferred } = states(), after = api.advancePlayerCore(deferred), backed = api.backPlayerCore(after);
  expect(backed.deferredCheckpointSaveCandidates).toEqual([]);
  const saved = api.createPlayerCoreSessionSaveV1(after); if (!saved.ok) throw Error('fixture');
  const loaded = api.loadPlayerCoreSessionSaveV1(after, saved.serialized); expect(loaded.ok).toBe(true);
  if (loaded.ok) expect(loaded.state.deferredCheckpointSaveCandidates).toEqual([]);
  const restarted = api.dispatchPlayerCoreIntentV1(after, project, { kind: 'restart' });
  expect(restarted.checkpointSaveMode).toBe('deferred');
});

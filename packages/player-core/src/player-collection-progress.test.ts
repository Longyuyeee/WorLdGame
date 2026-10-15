import { expect, it } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import branching from '../../../fixtures/projects/branching/project.s0.json';
import { canEnterPlayerCoreReplayV1, createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1, loadPlayerCoreSessionSaveV1, mergePlayerCoreMetaProgressV1, playerCoreMetaProgressV1, type PlayerCoreState } from './player-core';
const project = () => loadProject(migrateS0Project(branching as S0Project).files);
function finish(state: PlayerCoreState, left = true) {
  const source = project(); let current = state;
  for (let i = 0; i < 30 && current.status !== 'ended'; i++) {
    const view = createPlayerCoreSnapshotV1(current);
    current = dispatchPlayerCoreIntentV1(current, source, view.presentation.kind === 'choice' ? { kind: 'select-choice', optionId: view.presentation.options[left ? 0 : 1]!.optionId } : { kind: 'primary' });
  }
  expect(current.status).toBe('ended'); return current;
}
it('keeps an ending and read knowledge at title and combines a second route in a fresh execution', () => {
  const source = project(), ended = finish(createPlayerCore(source)), first = playerCoreMetaProgressV1(ended)!;
  const title = dispatchPlayerCoreIntentV1(ended, source, { kind: 'restart' }); expect(title.runtimeState).toBeNull(); expect(title.historySession).toBeNull(); expect(playerCoreMetaProgressV1(title)).toEqual(first);
  expect(createPlayerCoreSnapshotV1(title).additionalContent.endings.unlocked).toBe(1);
  const other = finish(title, false); expect(playerCoreMetaProgressV1(other)!.reachedEndingIds).toHaveLength(2); expect(playerCoreMetaProgressV1(other)!.readTextIds).toEqual(expect.arrayContaining([...first.readTextIds]));
  expect(createPlayerCoreSnapshotV1(other).additionalContent.endings.unlocked).toBe(2);
});
it('also keeps collections when primary returns an ending to title', () => {
  const source = project(), ended = finish(createPlayerCore(source));
  const title = dispatchPlayerCoreIntentV1(ended, source, { kind: 'primary' }); expect(title.status).toBe('title'); expect(playerCoreMetaProgressV1(title)).toEqual(playerCoreMetaProgressV1(ended));
});
it('hydrates title collections without a Runtime, while rejecting another project or scope', () => {
  const ended = finish(createPlayerCore(project())), progress = playerCoreMetaProgressV1(ended)!, fresh = createPlayerCore(project());
  const restored = mergePlayerCoreMetaProgressV1(fresh, progress); expect(restored.status).toBe('title'); expect(restored.runtimeState).toBeNull(); expect(createPlayerCoreSnapshotV1(restored).additionalContent.endings.unlocked).toBe(1);
  expect(mergePlayerCoreMetaProgressV1(fresh, { ...progress, projectId: 'other' })).toBe(fresh); expect(mergePlayerCoreMetaProgressV1(fresh, { ...progress, progressScopeId: 'other' })).toBe(fresh);
});
it('merges external knowledge into an active story without moving its cursor, variables or host effects', () => {
  const source = project(), active = dispatchPlayerCoreIntentV1(createPlayerCore(source), source, { kind: 'primary' });
  const merged = mergePlayerCoreMetaProgressV1(active, playerCoreMetaProgressV1(finish(createPlayerCore(source)))!);
  expect(merged.status).toBe(active.status); expect(merged.currentEvent).toBe(active.currentEvent); expect(merged.hostState).toBe(active.hostState);
  expect(merged.historySession!.cursor).toBe(active.historySession!.cursor); expect(merged.runtimeState!.cursor).toEqual(active.runtimeState!.cursor); expect(merged.runtimeState!.variables).toEqual(active.runtimeState!.variables);
  expect(playerCoreMetaProgressV1(merged)!.reachedEndingIds).toHaveLength(1); expect(createPlayerCoreSessionSaveV1(merged).ok).toBe(true);
});
it('preserves title knowledge when loading an older route save and identifies missing replay entrances', () => {
  const source = project(), first = finish(createPlayerCore(source)), save = createPlayerCoreSessionSaveV1(first);
  expect(save.ok).toBe(true); if (!save.ok) throw Error('fixture save failed');
  const second = finish(dispatchPlayerCoreIntentV1(first, source, { kind: 'restart' }), false);
  const title = dispatchPlayerCoreIntentV1(second, source, { kind: 'restart' });
  const loaded = loadPlayerCoreSessionSaveV1(title, save.serialized); expect(loaded.ok).toBe(true); if (!loaded.ok) throw Error('fixture load failed');
  expect(playerCoreMetaProgressV1(loaded.state)!.reachedEndingIds).toHaveLength(2);
  const replayId = createPlayerCoreSnapshotV1(loaded.state).additionalContent.replayItems.find(item => item.unlocked && item.sceneId === loaded.state.runtimeState!.cursor.sceneId)!.replayId;
  expect(canEnterPlayerCoreReplayV1(loaded.state, replayId)).toBe(false);
  const replay = dispatchPlayerCoreIntentV1(loaded.state, source, { kind: 'enter-scene-replay', replayId });
  expect(replay.replaySession).toBeNull(); expect(replay.replayError).toContain('找不到可安全开始'); expect(replay.runtimeState).toEqual(loaded.state.runtimeState);
});

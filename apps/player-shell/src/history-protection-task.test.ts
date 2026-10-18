import { expect, it } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { compactPlayerCoreHistoryV1, createPlayerCore, createPlayerCoreSessionSaveV1, dispatchPlayerCoreIntentV1, startPlayerCore } from '@world-studio/player-core';
import { prepareHistoryProtection } from './history-protection-task';

function fixture() {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'protect_history', title: 'Protection', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [...Array.from({ length: 30 }, (_, index) => ({ id: `line_${index}`, kind: 'narration' as const, textId: `text_${index}`, text: `第 ${index} 句` })), { id: 'end', kind: 'end', endingName: 'Done' }] }] }).files);
  let state = startPlayerCore(createPlayerCore(project), project);
  while (state.historySession!.cursor < 25) state = dispatchPlayerCoreIntentV1(state, project, { kind: 'primary' });
  return state;
}

it('backs up the unshortened session and proposes precisely the existing Core compaction', () => {
  const state = fixture(), original = structuredClone(state), saved = createPlayerCoreSessionSaveV1(state), compacted = compactPlayerCoreHistoryV1(state, 8), result = prepareHistoryProtection(state, 8);
  expect(result).toMatchObject(saved);
  expect(result.historySession).toEqual(compacted.historySession); expect(result.playback).toEqual(compacted.playback);
  expect(state).toEqual(original); expect(result.historySession.cursor).toBe(8);
  expect(JSON.parse(result.serialized).cursor).toBe(25);
});

it('does not accept a corrupted prior checkpoint or invalid rollback size', () => {
  const state = fixture(); prepareHistoryProtection(state, 8);
  (state.historySession!.checkpoints[0]!.state as { buildId: string }).buildId = 'tampered';
  expect(() => prepareHistoryProtection(state, 8)).toThrow();
  for (const retained of [0, -1, NaN, 1.5, 50]) expect(() => prepareHistoryProtection(fixture(), retained)).toThrow();
});

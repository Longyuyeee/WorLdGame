import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { advancePlayerCore, createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1 } from '@world-studio/player-core';
import { canOffloadStoryAdvance, executeStoryAdvance, storyAdvanceSource, validStoryAdvanceReply } from './story-advance-task';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';

afterEach(() => vi.unstubAllGlobals());
export function storyFixture() {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'story_task', title: 'Story', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    { id: 'first', kind: 'narration', textId: 'first_text', text: 'First' }, { id: 'second', kind: 'narration', textId: 'second_text', text: 'Second' }, { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files);
  return { project, state: startPlayerCore(createPlayerCore(project), project) };
}
it('matches the public Core and exact saved bytes while keeping owner references', () => {
  const { state } = storyFixture(), original = JSON.stringify(state), reply = executeStoryAdvance(structuredClone(storyAdvanceSource(state)));
  if (!reply.ok) throw Error('fixture');
  expect(validStoryAdvanceReply(state, reply)).toBe(true);
  expect(reply.replayEntriesUnchanged).toBe(true);
  const actual = { ...state, ...structuredClone(reply.patch) }, expected = advancePlayerCore(state);
  expect(actual).toEqual(expected); expect(createPlayerCoreSessionSaveV1(actual)).toEqual(createPlayerCoreSessionSaveV1(expected));
  expect(actual.artifacts).toBe(state.artifacts); expect(actual.localization).toBe(state.localization); expect(actual.historyPolicy).toBe(state.historyPolicy);
  expect(JSON.stringify(state)).toBe(original);
});
it('executes background, characters and audio only as pure host data, exactly like the public Core', () => {
  const demo = createPlayerMediaMultichannelDemoV1(), scene = demo.project.scripts.media_stage!;
  const project = { ...demo.project, scripts: { ...demo.project.scripts, media_stage: { ...scene, statements: [{ id: 'before_media', kind: 'narration', textId: 'before_media_text', text: 'Before' }, ...scene.statements] } } };
  const state = startPlayerCore(createPlayerCore(project), project), reply = executeStoryAdvance(structuredClone(state));
  expect(reply.ok).toBe(true); if (!reply.ok) return;
  expect({ ...state, ...reply.patch }).toEqual(advancePlayerCore(state));
  expect(reply.patch.runtimeState!.sceneState.backgroundAssetId).toBe('media_sunset');
  expect(Object.keys(reply.patch.runtimeState!.sceneState.characters)).toEqual(['left', 'right']);
  expect(reply.patch.runtimeState!.audioState.tracks.bgm?.assetId).toBe('media_theme');
});
it('returns newly captured scene entrances instead of preserving the old replay array', () => {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'story_transfer', title: 'Transfer', entrySceneId: 'main', characters: [], scenes: [
    { id: 'main', title: 'Main', statements: [{ id: 'intro', kind: 'narration', textId: 'intro_text', text: 'Intro' }, { id: 'transfer', kind: 'jump', targetLabel: 'next' }] },
    { id: 'next', title: 'Next', statements: [{ id: 'arrival', kind: 'narration', textId: 'arrival_text', text: 'Arrival' }, { id: 'finish', kind: 'end', endingName: 'Done' }] }
  ] }).files);
  const state = startPlayerCore(createPlayerCore(project), project), reply = executeStoryAdvance(structuredClone(state));
  expect(reply.ok).toBe(true); if (!reply.ok) return;
  expect(reply.replayEntriesUnchanged).toBe(false);
  expect(reply.patch.replayEntries.some(entry => entry.sceneId === 'next')).toBe(true);
  expect(validStoryAdvanceReply(state, reply)).toBe(true);
  expect({ ...state, ...reply.patch }).toEqual(advancePlayerCore(state));
});
it.each(['checkpoint', 'entry', 'archive', 'id'])('does not trust a previously executed source after %s corruption', kind => {
  const { state } = storyFixture(); executeStoryAdvance(state); const changed = structuredClone(state);
  if (kind === 'checkpoint') Object.assign(changed.historySession!.checkpoints[0]!, { stateHash: '0'.repeat(64) });
  if (kind === 'entry') Object.assign(changed.historySession!.entries[0]!, { entryId: 'bad' });
  if (kind === 'archive') Object.assign(changed.historySession!, { archives: [{}] });
  if (kind === 'id') Object.assign(changed.historySession!.checkpoints[0]!.state.metaProgress, { readTextIds: ['bad id'] });
  expect(executeStoryAdvance(changed).ok).toBe(false);
});
it.each(['title', 'future', 'replay'])('rejects unsupported %s execution boundaries', kind => {
  const { state, project } = storyFixture();
  if (kind === 'title') expect(() => executeStoryAdvance(createPlayerCore(project))).toThrow();
  if (kind === 'future') expect(() => executeStoryAdvance({ ...state, historySession: { ...state.historySession!, cursor: 0 } })).toThrow();
  if (kind === 'replay') expect(() => executeStoryAdvance({ ...state, replaySession: { replayId: 'replay', title: 'Replay', sceneId: 'main', checkpoint: state } })).toThrow();
});
it('omits only unrelated Core extensions and uses a measured long-history scope', () => {
  const { state } = storyFixture();
  expect(storyAdvanceSource({ ...state, unused: () => {} } as typeof state)).toEqual(state);
  vi.stubGlobal('Worker', function() {}); expect(canOffloadStoryAdvance(state)).toBe(false);
  // Policy shape only, not execution or validation evidence.
  const long = { ...state, historySession: { ...state.historySession!, entries: Array(480).fill(state.historySession!.entries[0]), cursor: 480 } };
  expect(canOffloadStoryAdvance(long)).toBe(true);
  expect(canOffloadStoryAdvance({ ...long, historySession: { ...long.historySession, cursor: 479 } })).toBe(false);
  vi.stubGlobal('Worker', undefined); expect(canOffloadStoryAdvance(long)).toBe(false);
});

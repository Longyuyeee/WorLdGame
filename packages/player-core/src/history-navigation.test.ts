import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadProject, migrateS0Project, type S0Project, type JsonObject } from '@world-studio/project-domain';
import { advancePlayerCore, backPlayerCore, backPlayerCoreToHistoryEntryV1, createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1, forwardPlayerCore, startPlayerCore } from './player-core';

it.each([true, false])('primary after Back uses formal Forward and honors allowForwardAfterBack=%s', allowForwardAfterBack => {
  const source = JSON.parse(readFileSync('fixtures/projects/media/project.s0.json', 'utf8')) as S0Project;
  const base = loadProject(migrateS0Project(source).files), media = JSON.parse(readFileSync('fixtures/projects/media/media-golden.json', 'utf8')) as { assets: JsonObject[] };
  const script = base.scripts.media_stage!;
  const project = { ...base, assets: { ...base.assets, assets: media.assets }, scripts: { ...base.scripts, media_stage: { ...script, statements: [
    { id: 'before', kind: 'narration' as const, textId: 'before_text', text: 'Before the stage changes' },
    ...script.statements.map(statement => statement.id === 'media_background' ? { ...statement, summary: `${String(statement.summary)} effectPolicy=reversible compensationKind=background.restore descriptorId=history.background` } : statement)
  ] } } };
  const before = startPlayerCore(createPlayerCore(project, { allowForwardAfterBack }), project), after = dispatchPlayerCoreIntentV1(before, project, { kind: 'primary' });
  const backed = backPlayerCore(after), expected = forwardPlayerCore(backed), actual = dispatchPlayerCoreIntentV1(backed, project, { kind: 'primary' });
  expect(actual).toEqual(expected); expect(advancePlayerCore(backed)).toEqual(expected); expect(actual.status).not.toBe('error');
  expect(actual.historySession!.entries).toBe(backed.historySession!.entries);
  if (!allowForwardAfterBack) expect(actual).toBe(backed);
  else expect(actual.hostState.operations.at(-1)?.kind).toBeDefined();
});

it('reconciles the same host sequence, complete state and saved future as repeated visible Back', () => {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'core_navigation', title: 'Navigation', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [...Array.from({ length: 31 }, (_, index) => ({ id: `line_${index}`, kind: 'narration' as const, textId: `text_${index}`, text: `第 ${index} 句` })), { id: 'end', kind: 'end', endingName: 'Done' }] }] }).files);
  let state = startPlayerCore(createPlayerCore(project), project);
  while (state.historySession!.cursor < 25) state = dispatchPlayerCoreIntentV1(state, project, { kind: 'primary' });
  const target = state.historySession!.entries[3]!;
  let expected = state;
  while (expected.historySession!.cursor > 4) expected = backPlayerCore(expected);
  const actual = backPlayerCoreToHistoryEntryV1(state, target.entryId);
  expect(actual).toEqual(expected);
  expect(createPlayerCoreSnapshotV1(actual)).toEqual(createPlayerCoreSnapshotV1(expected));
  expect(createPlayerCoreSessionSaveV1(actual)).toEqual(createPlayerCoreSessionSaveV1(expected));
});

it('keeps presentation compensation and channel reconciliation identical across internal cues', () => {
  const source = JSON.parse(readFileSync('fixtures/projects/media/project.s0.json', 'utf8')) as S0Project;
  const base = loadProject(migrateS0Project(source).files), media = JSON.parse(readFileSync('fixtures/projects/media/media-golden.json', 'utf8')) as { assets: JsonObject[] };
  const script = base.scripts.media_stage!;
  const project = { ...base, assets: { ...base.assets, assets: media.assets }, scripts: { ...base.scripts, media_stage: { ...script, statements: [
    { id: 'before', kind: 'narration', textId: 'before_text', text: 'Before the stage changes' },
    ...script.statements.map(statement => statement.id === 'media_background' ? { ...statement, summary: `${String(statement.summary)} effectPolicy=reversible compensationKind=background.restore descriptorId=history.background` } : statement)
  ] } } };
  const before = startPlayerCore(createPlayerCore(project), project), running = dispatchPlayerCoreIntentV1(before, project, { kind: 'primary' });
  expect(running.currentEvent?.kind).toBe('dialogue');
  const expected = backPlayerCore(running), actual = backPlayerCoreToHistoryEntryV1(running, before.historySession!.entries[0]!.entryId);
  expect(actual).toEqual(expected);
  expect(createPlayerCoreSnapshotV1(actual).effects.operations.at(-1)).toMatchObject({ kind: 'compensate', descriptorId: 'history.background' });
});

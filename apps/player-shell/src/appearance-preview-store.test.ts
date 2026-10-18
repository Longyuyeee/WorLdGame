import { expect, it } from 'vitest';
import { createAppearancePreviewSaveStore } from './appearance-preview-store';
import { createWorldPlayerSaveSlotV3, worldPlayerSaveSummaryV3 } from './player-save-store';
const candidate = (savedAt = 1000) => createWorldPlayerSaveSlotV3({ slotId: 'manual-1', kind: 'manual', projectId: 'preview', buildId: 'a'.repeat(64), savedAtEpochMilliseconds: savedAt, title: 'Preview', sceneId: 'main', sceneTitle: 'Main', chapterId: null, chapterTitle: null, presentationKind: 'narration', runtimeStateHash: 'b'.repeat(64), sessionArtifactHash: 'c'.repeat(64), serializedSessionSave: '{}', checkpointStepId: null, route: null, customMetadata: {}, preview: { status: 'unavailable', reason: 'capture-unavailable' } });
it('compares empty and occupied targets and keeps separate iframe stores isolated', async () => {
  const store = createAppearancePreviewSaveStore(), first = candidate(); expect(await store.writeIfUnchanged!(first, null)).toBe(true);
  expect(await store.writeIfUnchanged!(candidate(2000), null)).toBe(false); expect(await store.read(first.projectId, first.slotId)).toEqual(first);
  expect(await createAppearancePreviewSaveStore().list(first.projectId)).toEqual([]);
});
it('refuses changed metadata even when the session content is the same', async () => {
  const store = createAppearancePreviewSaveStore(), old = candidate(), external = candidate(2000); await store.write(old); const expected = (await store.listSummaries!(old.projectId))[0]!; await store.write(external);
  expect(await store.writeIfUnchanged!(candidate(3000), expected)).toBe(false); expect(await store.read(old.projectId, old.slotId)).toEqual(external);
  expect(await store.writeIfUnchanged!(candidate(4000), worldPlayerSaveSummaryV3(external))).toBe(true);
});
it('allows only one concurrent private-map insertion into an empty target', async () => {
  const store = createAppearancePreviewSaveStore(), first = candidate(), second = candidate(2000);
  expect(await Promise.all([store.writeIfUnchanged!(first, null), store.writeIfUnchanged!(second, null)])).toEqual([true, false]);
  expect(await store.read(first.projectId, first.slotId)).toEqual(first);
});
it('owns saved values and summary metadata instead of exposing mutable map references', async () => {
  const store = createAppearancePreviewSaveStore(), first = candidate(); await store.write(first); const summary = (await store.listSummaries!(first.projectId))[0]!;
  Object.assign(first.preview, { status: 'available' }); Object.assign(summary.preview, { status: 'available' });
  expect((await store.read(first.projectId, first.slotId))!.preview.status).toBe('unavailable');
});
it('rejects an expectation from another slot without modifying either target', async () => {
  const store = createAppearancePreviewSaveStore(), first = candidate(); await store.write(first);
  await expect(store.writeIfUnchanged!(first, { ...worldPlayerSaveSummaryV3(first), slotId: 'manual-2' })).rejects.toThrow('WORLD_PLAYER_SAVE_EXPECTATION_INVALID'); expect(await store.read(first.projectId, first.slotId)).toEqual(first);
});

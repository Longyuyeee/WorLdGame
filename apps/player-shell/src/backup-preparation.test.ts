import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import { createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, loadPlayerCoreSessionSaveV1 } from '@world-studio/player-core';
import source from '../../../fixtures/projects/branching/project.s0.json';
import { createWorldPlayerSaveSlotV3 } from './player-save-store';
import { createPlayerSaveBackup, readPlayerSaveBackup } from './player-save-backup';
import { awaitPlayerBackupValue } from './backup-operation';
import { readPlayerBackupFile } from './backup-file-reader';

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const project = loadProject(migrateS0Project(source as S0Project).files), state = startPlayerCore(createPlayerCore(project), project), save = createPlayerCoreSessionSaveV1(state), snapshot = createPlayerCoreSnapshotV1(state); if (!save.ok) throw Error('fixture');
  const slot = createWorldPlayerSaveSlotV3({ kind: 'quick', slotId: 'quick-1', projectId: state.projectId, buildId: state.runtimeState!.buildId, savedAtEpochMilliseconds: 1000, title: state.title, chapterId: null, chapterTitle: null, sceneId: state.runtimeState!.cursor.sceneId, sceneTitle: '分支', route: null, customMetadata: {}, preview: { status: 'unavailable', reason: 'capture-unavailable' }, presentationKind: snapshot.presentation.kind, runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: save.artifactHash, serializedSessionSave: save.serialized, checkpointStepId: null });
  return { state, slot };
}
it('preserves an untouched successful result and consumes an aborted promise late rejection', async () => {
  const value = {}, controller = new AbortController(); expect(await awaitPlayerBackupValue(Promise.resolve(value), controller.signal)).toBe(value);
  let reject!: (reason: unknown) => void; const pending = awaitPlayerBackupValue(new Promise((_, failed) => { reject = failed; }), controller.signal); controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); reject(Error('late')); await Promise.resolve();
});
it('settles an already-aborted owner without publishing a later result', async () => {
  const controller = new AbortController(); controller.abort(); await expect(awaitPlayerBackupValue(Promise.resolve('old bytes'), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
it('reads actual File bytes with FileReader without changing them', async () => {
  const bytes = new TextEncoder().encode('真实备份字节'); expect(Array.from(await readPlayerBackupFile(new File([bytes], 'test.worldsave'), new AbortController().signal))).toEqual(Array.from(bytes));
});
it('aborts a stalled FileReader and detaches its late callbacks', async () => {
  let reader!: FileReader; vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) { reader = this; }); const abort = vi.spyOn(FileReader.prototype, 'abort');
  const controller = new AbortController(), pending = readPlayerBackupFile(new File(['data'], 'test.worldsave'), controller.signal); controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(abort).toHaveBeenCalled(); expect(reader.onload).toBeNull(); expect(reader.onerror).toBeNull();
});
it('never starts a file read for an already-retired owner', () => {
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer'), controller = new AbortController(); controller.abort(); expect(() => readPlayerBackupFile(new File([], 'test.worldsave'), controller.signal)).toThrow(); expect(read).not.toHaveBeenCalled();
});
it('also cancels waiting when FileReader is unavailable without pretending to abort the underlying IO', async () => {
  vi.stubGlobal('FileReader', undefined); const file = new File([], 'test.worldsave'); let release!: (bytes: ArrayBuffer) => void; Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => { release = resolve; }) });
  const controller = new AbortController(), pending = readPlayerBackupFile(file, controller.signal); controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); release(new ArrayBuffer(1)); await Promise.resolve();
});
it('maps synchronous file-reader fallback failure to an actionable error', async () => {
  vi.stubGlobal('FileReader', undefined); const file = new File([], 'test.worldsave'); Object.defineProperty(file, 'arrayBuffer', { value: () => { throw Error('native read failed'); } }); await expect(readPlayerBackupFile(file, new AbortController().signal)).rejects.toThrow('重新选择文件');
});
it('keeps exact backup schema and bytes when adding an active preparation signal', async () => {
  const f = fixture(), before = await createPlayerSaveBackup(f.slot), next = await createPlayerSaveBackup(f.slot, undefined, 'slot', crypto.subtle, new AbortController().signal); expect(next).toEqual(before); expect(JSON.parse(new TextDecoder().decode(next)).schemaVersion).toBe(1);
});
it('cancels a pending real-format checksum without creating a partial backup', async () => {
  const f = fixture(), controller = new AbortController(), digest = vi.fn(() => new Promise<ArrayBuffer>(() => {})); const pending = createPlayerSaveBackup(f.slot, undefined, 'slot', { digest } as unknown as SubtleCrypto, controller.signal); await vi.waitFor(() => expect(digest).toHaveBeenCalled()); controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
it('does not start formal load validation after checksum waiting has been canceled', async () => {
  const f = fixture(), bytes = await createPlayerSaveBackup(f.slot), controller = new AbortController(), load = vi.fn(async (serialized: string) => loadPlayerCoreSessionSaveV1(f.state, serialized)), digest = vi.fn(() => new Promise<ArrayBuffer>(() => {}));
  const pending = readPlayerSaveBackup(bytes, f.state, { digest } as unknown as SubtleCrypto, { signal: controller.signal, load }); controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(load).not.toHaveBeenCalled();
});
it('uses the existing complete validator through an async host without changing the current state or backup', async () => {
  const f = fixture(), before = JSON.stringify(f.state), bytes = await createPlayerSaveBackup(f.slot), load = vi.fn(async (serialized: string) => loadPlayerCoreSessionSaveV1(f.state, serialized));
  expect(await readPlayerSaveBackup(bytes, f.state, crypto.subtle, { load, signal: new AbortController().signal })).toEqual(await readPlayerSaveBackup(bytes, f.state)); expect(load).toHaveBeenCalledWith(f.slot.serializedSessionSave); expect(JSON.stringify(f.state)).toBe(before);
});
it('still rejects an async validator result that disagrees with the saved artifact identity', async () => {
  const f = fixture(), bytes = await createPlayerSaveBackup(f.slot), loaded = loadPlayerCoreSessionSaveV1(f.state, f.slot.serializedSessionSave); if (!loaded.ok) throw Error('fixture');
  await expect(readPlayerSaveBackup(bytes, f.state, crypto.subtle, { load: async () => ({ ...loaded, artifactHash: 'f'.repeat(64) }) })).rejects.toThrow('完整进度不一致');
});
it('releases the wait for a formal validator that ignores cancellation and never settles', async () => {
  const f = fixture(), bytes = await createPlayerSaveBackup(f.slot), controller = new AbortController(), load = vi.fn(() => new Promise<ReturnType<typeof loadPlayerCoreSessionSaveV1>>(() => {}));
  const pending = readPlayerSaveBackup(bytes, f.state, crypto.subtle, { load, signal: controller.signal }); await vi.waitFor(() => expect(load).toHaveBeenCalled()); controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});

import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import { createPlayerCore, startPlayerCore, createPlayerCoreSnapshotV1, createPlayerCoreSessionSaveV1 } from '@world-studio/player-core';
import source from '../../../fixtures/projects/branching/project.s0.json';
import { PlayerShell } from './PlayerShell';
import { createWorldPlayerSaveSlotV3, IndexedDbWorldPlayerSaveStoreV3 } from './player-save-store';
import { createPlayerSaveBackup } from './player-save-backup';
import { ForegroundSessionRunner } from './foreground-session-client';
import { PlayerSaveBackupPanel } from './PlayerSaveBackupPanel';
import { WorldPlayerSaveWriteCoordinatorV1 } from './player-save-policy';

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob); });
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });
async function setup() {
  const project = loadProject(migrateS0Project(source as S0Project).files), state = startPlayerCore(createPlayerCore(project), project), snapshot = createPlayerCoreSnapshotV1(state), created = createPlayerCoreSessionSaveV1(state); if (!created.ok) throw Error('fixture');
  const slot = createWorldPlayerSaveSlotV3({ kind: 'quick', slotId: 'quick-1', projectId: state.projectId, buildId: state.runtimeState!.buildId, savedAtEpochMilliseconds: 1000, title: state.title, chapterId: null, chapterTitle: null, sceneId: state.runtimeState!.cursor.sceneId, sceneTitle: '分支', route: null, customMetadata: {}, preview: { status: 'unavailable', reason: 'capture-unavailable' }, presentationKind: snapshot.presentation.kind, runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: created.artifactHash, serializedSessionSave: created.serialized, checkpointStepId: null });
  const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory(), webcrypto.subtle as SubtleCrypto); await store.write(slot); const props = { project, saveStore: store }, view = render(<PlayerShell {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '读取存档' })); fireEvent.click(screen.getByRole('button', { name: '备份' })); await waitFor(() => expect(screen.getByLabelText('备份进度').querySelector('option[value="quick-1"]')).not.toBeNull()); return { view, store, slot, props, state };
}
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function archive(f: Awaited<ReturnType<typeof setup>>) { return new File([await createPlayerSaveBackup(f.slot)], 'actual.worldsave', { type: 'application/json' }); }
const selectFile = (file: File) => fireEvent.change(screen.getByLabelText('选择存档备份文件'), { target: { files: [file] } });
async function inspect(f: Awaited<ReturnType<typeof setup>>) { selectFile(await archive(f)); await screen.findByText('备份校验通过，请选择手动槽位后导入。'); }
it('can cancel a backup export stuck reading a stored slot and return to the unchanged story', async () => {
  const f = await setup(); vi.spyOn(f.store, 'read').mockImplementation(() => new Promise(() => {})); fireEvent.change(screen.getByLabelText('备份进度'), { target: { value: 'quick-1' } }); fireEvent.click(screen.getByRole('button', { name: '导出备份文件' })); await act(async () => {});
  expect(f.view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'busy'); fireEvent.click(screen.getByRole('button', { name: '取消备份准备' })); expect(screen.getByRole('button', { name: '关闭存读档' })).toBeEnabled(); expect(f.view.container.querySelector('main')).toHaveAttribute('data-player-status', 'title'); expect(screen.queryByRole('link', { name: '重新下载备份' })).toBeNull();
});
it('cancels preparation with Escape, keeps the dialog, then lets a second Escape return normally', async () => {
  const f = await setup(); vi.spyOn(f.store, 'read').mockImplementation(() => new Promise(() => {})); fireEvent.change(screen.getByLabelText('备份进度'), { target: { value: 'quick-1' } }); fireEvent.click(screen.getByRole('button', { name: '导出备份文件' }));
  fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {}); expect(screen.getByRole('dialog', { name: '存读档槽位' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: '导出备份文件' })).toHaveFocus(); fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog', { name: '存读档槽位' })).toBeNull();
});
it('can close a preparing dialog without permitting a late result to download or write', async () => {
  const f = await setup(), pending = deferred<typeof f.slot>(); vi.spyOn(f.store, 'read').mockReturnValue(pending.promise); fireEvent.change(screen.getByLabelText('备份进度'), { target: { value: 'quick-1' } }); fireEvent.click(screen.getByRole('button', { name: '导出备份文件' }));
  fireEvent.click(screen.getByRole('button', { name: '关闭存读档' })); pending.resolve(f.slot); await act(async () => {}); expect(screen.queryByRole('dialog', { name: '存读档槽位' })).toBeNull(); expect(f.view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'idle'); expect((await f.store.list(f.state.projectId)).length).toBe(1);
});
it('ignores an old rejected export after a new preparation has taken ownership', async () => {
  const f = await setup(), first = deferred<typeof f.slot>(), next = deferred<typeof f.slot>(); vi.spyOn(f.store, 'read').mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise); fireEvent.change(screen.getByLabelText('备份进度'), { target: { value: 'quick-1' } });
  fireEvent.click(screen.getByRole('button', { name: '导出备份文件' })); fireEvent.click(screen.getByRole('button', { name: '取消备份准备' })); fireEvent.click(screen.getByRole('button', { name: '导出备份文件' })); first.reject(Error('late old read')); await act(async () => {});
  expect(f.view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'busy'); expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByRole('button', { name: '取消备份准备' })).toBeEnabled(); fireEvent.click(screen.getByRole('button', { name: '取消备份准备' })); next.resolve(f.slot);
});
it('aborts a stalled file read, returns focus and can inspect the same file again without writing', async () => {
  const f = await setup(), file = await archive(f), reader = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(() => {}), abort = vi.spyOn(FileReader.prototype, 'abort'); selectFile(file); fireEvent.click(screen.getByRole('button', { name: '取消备份准备' })); await act(async () => {});
  expect(abort).toHaveBeenCalled(); expect(screen.getByLabelText('选择存档备份文件')).toHaveFocus(); expect(screen.queryByRole('button', { name: '导入到所选槽位' })).toBeNull(); reader.mockRestore(); selectFile(file); await screen.findByRole('button', { name: '导入到所选槽位' }); expect(await f.store.read(f.state.projectId, 'manual-1')).toBeNull();
});
it('cancels a completed-but-delayed formal worker validation without exposing its retired result', async () => {
  const f = await setup(), run = ForegroundSessionRunner.prototype.run, reply = deferred<Awaited<ReturnType<typeof run>>>(); let captured = false;
  vi.spyOn(ForegroundSessionRunner.prototype, 'run').mockImplementation(async function (this: ForegroundSessionRunner, task, signal) { const result = await run.call(this, task, signal); if (task.kind === 'load') { captured = true; return await reply.promise as typeof result; } return result; });
  selectFile(await archive(f)); await waitFor(() => expect(captured).toBe(true)); fireEvent.click(screen.getByRole('button', { name: '取消备份准备' })); reply.reject(Error('retired result')); await act(async () => {});
  expect(screen.queryByRole('button', { name: '导入到所选槽位' })).toBeNull(); expect(f.view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'idle'); expect(screen.queryByRole('alert')).toBeNull(); expect(await f.store.read(f.state.projectId, 'manual-1')).toBeNull();
});
it('cancels read-only preparation on host suspension and disables new requests until return', async () => {
  const f = await setup(); vi.spyOn(f.store, 'read').mockImplementation(() => new Promise(() => {})); fireEvent.change(screen.getByLabelText('备份进度'), { target: { value: 'quick-1' } }); fireEvent.click(screen.getByRole('button', { name: '导出备份文件' })); f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); await act(async () => {});
  expect(f.view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'idle'); expect(screen.getByRole('button', { name: '导出备份文件' })).toBeDisabled(); expect(screen.getByLabelText('选择存档备份文件')).toBeDisabled(); f.view.rerender(<PlayerShell {...f.props} hostActivity="active" />); expect(screen.getByRole('button', { name: '导出备份文件' })).toBeEnabled();
});
it('retires preparation when the storage owner changes and ignores an old store result', async () => {
  const f = await setup(), pending = deferred<typeof f.slot>(); vi.spyOn(f.store, 'read').mockReturnValue(pending.promise); fireEvent.change(screen.getByLabelText('备份进度'), { target: { value: 'quick-1' } }); fireEvent.click(screen.getByRole('button', { name: '导出备份文件' }));
  const next = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory(), webcrypto.subtle as SubtleCrypto); f.view.rerender(<PlayerShell {...f.props} saveStore={next} />); pending.resolve(f.slot); await act(async () => {}); expect(f.view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'idle'); expect(screen.queryByRole('link', { name: '重新下载备份' })).toBeNull(); expect(await next.list(f.state.projectId)).toEqual([]);
});
it('explains a long read-only wait while leaving cancellation and the original slot available', async () => {
  const f = await setup(); vi.spyOn(f.store, 'read').mockImplementation(() => new Promise(() => {})); vi.useFakeTimers(); fireEvent.change(screen.getByLabelText('备份进度'), { target: { value: 'quick-1' } }); fireEvent.click(screen.getByRole('button', { name: '导出备份文件' })); await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  expect(screen.getByText(/等待时间较长，可取消/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: '取消备份准备' })).toBeEnabled(); fireEvent.click(screen.getByRole('button', { name: '取消备份准备' })); expect(f.view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'idle');
});
it('does not offer cancellation or close the dialog once import writing has been submitted', async () => {
  const f = await setup(); await inspect(f); const original = f.store.writeIfUnchanged.bind(f.store), finish = deferred<boolean>(); let write!: () => Promise<void>; vi.spyOn(f.store, 'writeIfUnchanged').mockImplementation((...args) => { write = async () => { finish.resolve(await original(...args)); }; return finish.promise; });
  vi.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: '导入到所选槽位' })); await act(async () => { await vi.advanceTimersByTimeAsync(8000); }); expect(screen.queryByRole('button', { name: '取消备份准备' })).toBeNull(); expect(screen.getByRole('button', { name: '关闭存读档' })).toBeDisabled(); expect(screen.getByText(/写入等待时间较长/)).toBeInTheDocument(); fireEvent.keyDown(window, { key: 'Escape' }); expect(f.view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'busy');
  vi.useRealTimers(); await act(async () => { await write(); }); await screen.findByRole('button', { name: '读取导入的存档' }); expect((await f.store.read(f.state.projectId, 'manual-1'))!.serializedSessionSave).toBe(f.slot.serializedSessionSave); expect(f.view.container.querySelector('main')).toHaveAttribute('data-player-status', 'title');
});
it('never reports that a possibly submitted import write was rolled back after an uncertain failure', async () => {
  const f = await setup(); await inspect(f); vi.spyOn(f.store, 'writeIfUnchanged').mockRejectedValue(Error('WORLD_TRANSPORT_LOST')); fireEvent.click(screen.getByRole('button', { name: '导入到所选槽位' })); expect(await screen.findByRole('alert')).toHaveTextContent('导入尚未确认成功'); expect(screen.getByRole('alert')).not.toHaveTextContent('原存档保持不变'); expect(screen.queryByRole('button', { name: '读取导入的存档' })).toBeNull();
});
it('preserves the last verified download when a later preparation is canceled and releases it on exit', async () => {
  const create = vi.fn(() => 'blob:verified-backup'), revoke = vi.fn(), BaseURL = URL; vi.stubGlobal('URL', class extends BaseURL { static override createObjectURL = create; static override revokeObjectURL = revoke; }); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const f = await setup(), pending = deferred<typeof f.slot>(); vi.spyOn(f.store, 'read').mockResolvedValueOnce(f.slot).mockReturnValueOnce(pending.promise); fireEvent.change(screen.getByLabelText('备份进度'), { target: { value: 'quick-1' } }); fireEvent.click(screen.getByRole('button', { name: '导出备份文件' })); await screen.findByRole('link', { name: '重新下载备份' });
  fireEvent.click(screen.getByRole('button', { name: '导出备份文件' })); fireEvent.click(screen.getByRole('button', { name: '取消备份准备' })); pending.resolve(f.slot); await act(async () => {});
  expect(screen.getByRole('link', { name: '重新下载备份' })).toHaveAttribute('href', 'blob:verified-backup'); expect(screen.getByText(/上次生成：/)).toBeInTheDocument(); expect(create).toHaveBeenCalledTimes(1); f.view.unmount(); expect(revoke).toHaveBeenCalledWith('blob:verified-backup');
});
it('reports a committed import separately if refreshing the list fails, and never reads it automatically', async () => {
  const f = await setup(), file = await archive(f); f.view.unmount(); const onRead = vi.fn();
  render(<PlayerSaveBackupPanel state={f.state} store={f.store} coordinator={new WorldPlayerSaveWriteCoordinatorV1(f.store)} slots={await f.store.list(f.state.projectId)} currentAllowed={false} captureCurrent={async () => { throw Error('not used'); }} onImported={async () => { throw Error('refresh failed'); }} onRead={onRead} onBusyChange={() => {}} isCurrent={() => true} externalBusy={false} />);
  selectFile(file); await screen.findByRole('button', { name: '导入到所选槽位' }); fireEvent.click(screen.getByRole('button', { name: '导入到所选槽位' })); expect(await screen.findByRole('alert')).toHaveTextContent('已经写入目标槽位'); expect(screen.getByRole('alert')).not.toHaveTextContent('原存档保持不变'); expect((await f.store.read(f.state.projectId, 'manual-1'))!.serializedSessionSave).toBe(f.slot.serializedSessionSave); expect(onRead).not.toHaveBeenCalled();
});
it('keeps the new storage notice when a committed old import finishes refreshing late', async () => {
  const f = await setup(), file = await archive(f), refreshed = deferred<void>(); f.view.unmount();
  const onImported = vi.fn(() => refreshed.promise), onRead = vi.fn(), props = { state: f.state, store: f.store, coordinator: new WorldPlayerSaveWriteCoordinatorV1(f.store), slots: await f.store.list(f.state.projectId), currentAllowed: false, captureCurrent: async () => { throw Error('not used'); }, onImported, onRead, onBusyChange: () => {}, isCurrent: () => true, externalBusy: false };
  const view = render(<PlayerSaveBackupPanel {...props} />); selectFile(file); await screen.findByRole('button', { name: '导入到所选槽位' }); fireEvent.click(screen.getByRole('button', { name: '导入到所选槽位' })); await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
  const next = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory(), webcrypto.subtle as SubtleCrypto); view.rerender(<PlayerSaveBackupPanel {...props} store={next} coordinator={new WorldPlayerSaveWriteCoordinatorV1(next)} slots={[]} />);
  refreshed.resolve(); await act(async () => {}); expect(screen.getByText(/作品或存储环境已变化/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: '读取导入的存档' })).toBeNull(); expect(await next.list(f.state.projectId)).toEqual([]); expect((await f.store.read(f.state.projectId, 'manual-1'))!.serializedSessionSave).toBe(f.slot.serializedSessionSave); expect(onRead).not.toHaveBeenCalled();
});

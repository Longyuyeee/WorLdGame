import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import { createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1 } from '@world-studio/player-core';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell, type PlayerShellProps } from './PlayerShell';
import { IndexedDbWorldPlayerSaveStoreV3, createWorldPlayerSaveSlotV3, type WorldPlayerSaveStoreV3 } from './player-save-store';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const card = (id = 'manual-1') => within(document.querySelector(`[data-save-slot="${id}"]`)! as HTMLElement);
const save = (id = 'manual-1', name = '保存') => fireEvent.click(card(id).getByRole('button', { name }));
async function fixture(extra: Partial<PlayerShellProps> = {}) {
  const base = loadProject(migrateS0Project(tiny as S0Project).files);
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }) };
  const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory, webcrypto.subtle as SubtleCrypto), other = new IndexedDbWorldPlayerSaveStoreV3(factory, webcrypto.subtle as SubtleCrypto);
  const state = startPlayerCore(createPlayerCore(project), project), snapshot = createPlayerCoreSnapshotV1(state), session = createPlayerCoreSessionSaveV1(state); if (!session.ok) throw Error('fixture');
  const original = createWorldPlayerSaveSlotV3({ kind: 'manual', slotId: 'manual-1', projectId: state.projectId, buildId: state.runtimeState!.buildId, savedAtEpochMilliseconds: 1000, title: state.title, chapterId: null, chapterTitle: null, sceneId: state.runtimeState!.cursor.sceneId, sceneTitle: '已有进度', route: null, customMetadata: {}, preview: { status: 'unavailable', reason: 'capture-unavailable' }, presentationKind: snapshot.presentation.kind, runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: session.artifactHash, serializedSessionSave: session.serialized, checkpointStepId: null });
  await store.write(original);
  const props = { project, saveStore: store, now: () => 2000, previewCapture: { version: '1.0.0', owner: 'player-host-compositor', capture: async () => null }, ...extra } satisfies PlayerShellProps;
  const view = render(<PlayerShell {...props} />);
  await screen.findByRole('button', { name: '继续最近存档' }); click('开始故事'); await screen.findByText('进度已自动保存'); click('存读档');
  await waitFor(() => expect(card().getByRole('button', { name: '保存' })).toBeEnabled());
  return { project, props, store, other, original, view, hash: () => document.querySelector('main')!.getAttribute('data-runtime-state-hash') };
}
it('does not submit an occupied save until confirmation', async () => {
  const f = await fixture(), write = vi.spyOn(f.store, 'writeIfUnchanged'); save();
  expect(card().getByRole('button', { name: '确认覆盖' })).toBeEnabled(); expect(write).not.toHaveBeenCalled();
  click('关闭存读档'); expect(await f.other.read(f.original.projectId, 'manual-1')).toEqual(f.original);
});
it('refuses a replacement from another adapter after overwrite was confirmed and keeps the story', async () => {
  const f = await fixture(), before = f.hash(); save();
  const external = { ...f.original, savedAtEpochMilliseconds: f.original.savedAtEpochMilliseconds + 1000, readingExcerpt: '另一窗口的新进度' };
  await f.other.write(external); save('manual-1', '确认覆盖');
  await screen.findByText(/本次未保存/); expect(screen.getByRole('alert')).toHaveTextContent('槽位已更新');
  expect(await f.other.read(f.original.projectId, 'manual-1')).toEqual(external); expect(f.hash()).toBe(before);
  expect(card().getByText('另一窗口的新进度')).toBeVisible(); expect(card().queryByRole('button', { name: '确认覆盖' })).toBeNull();
});
it('does not overwrite a formerly empty slot filled by another adapter', async () => {
  const f = await fixture(), external = { ...f.original, slotId: 'manual-2', readingExcerpt: '已被另一窗口占用' };
  expect(card('manual-2').getByText('空槽位')).toBeVisible(); await f.other.write(external); save('manual-2');
  await screen.findByText(/本次未保存/); expect(await f.other.read(f.original.projectId, 'manual-2')).toEqual(external);
});
it('requires another explicit overwrite confirmation after a conflict, then saves normally', async () => {
  const f = await fixture(); save(); await f.other.write({ ...f.original, savedAtEpochMilliseconds: f.original.savedAtEpochMilliseconds + 1 }); save('manual-1', '确认覆盖');
  await screen.findByText(/本次未保存/); const write = vi.spyOn(f.store, 'writeIfUnchanged'); save(); expect(write).not.toHaveBeenCalled();
  save('manual-1', '确认覆盖'); await screen.findByText(/手动存档 1已保存/); expect(write).toHaveBeenCalledOnce();
  expect((await f.other.read(f.original.projectId, 'manual-1'))!.runtimeStateHash).toBe(f.original.runtimeStateHash);
});
it('lets the player save to another empty slot without overwriting the conflicting progress', async () => {
  const f = await fixture(); save(); const external = { ...f.original, savedAtEpochMilliseconds: f.original.savedAtEpochMilliseconds + 1 };
  await f.other.write(external); save('manual-1', '确认覆盖'); await screen.findByText(/本次未保存/); save('manual-2');
  await screen.findByText(/手动存档 2已保存/); expect(await f.other.read(f.original.projectId, 'manual-1')).toEqual(external); expect(await f.other.read(f.original.projectId, 'manual-2')).not.toBeNull();
});
it('keeps the conflict outcome even when refreshing the new list fails and retries only the list', async () => {
  const f = await fixture(); save(); const external = { ...f.original, savedAtEpochMilliseconds: f.original.savedAtEpochMilliseconds + 1 }; await f.other.write(external);
  const originalList = f.store.listSummaries.bind(f.store), list = vi.spyOn(f.store, 'listSummaries').mockRejectedValue(Error('unavailable')), write = vi.spyOn(f.store, 'writeIfUnchanged'); save('manual-1', '确认覆盖');
  await screen.findByText(/本次未保存/); expect(card().getByRole('button', { name: '保存' })).toBeDisabled(); expect(await f.other.read(f.original.projectId, 'manual-1')).toEqual(external);
  list.mockImplementation(originalList); click('重试读取存档列表'); await waitFor(() => expect(card().getByRole('button', { name: '保存' })).toBeEnabled()); expect(write).toHaveBeenCalledOnce(); expect(await f.other.read(f.original.projectId, 'manual-1')).toEqual(external);
});
it('does not claim rollback when a host commits and then rejects the write result', async () => {
  const f = await fixture(), write = f.store.writeIfUnchanged.bind(f.store);
  vi.spyOn(f.store, 'writeIfUnchanged').mockImplementation(async (...args) => { await write(...args); throw Error('lost acknowledgement'); }); save('manual-2');
  await screen.findByText(/保存结果尚未确认/); expect(screen.queryByText('写入失败，原存档保持不变')).toBeNull();
  expect(card('manual-2').queryByText('空槽位')).toBeNull(); expect(await f.other.read(f.original.projectId, 'manual-2')).not.toBeNull();
});
it('clears overwrite consent after a rejected write instead of reusing it for retry', async () => {
  const f = await fixture(); save(); vi.spyOn(f.store, 'writeIfUnchanged').mockRejectedValue(Error('aborted')); save('manual-1', '确认覆盖');
  await screen.findByText(/保存结果尚未确认/); expect(card().getByRole('button', { name: '保存' })).toBeEnabled(); expect(await f.other.read(f.original.projectId, 'manual-1')).toEqual(f.original);
});
it('does not fall back to an unsafe write when a host has no atomic comparison capability', async () => {
  const f = await fixture(), unsafe = vi.fn();
  const legacy: WorldPlayerSaveStoreV3 = { version: '3.0.0', backend: 'legacy', list: id => f.store.list(id), read: (id, slot) => f.store.read(id, slot), readPreview: (id, slot) => f.store.readPreview(id, slot), write: unsafe };
  f.view.rerender(<PlayerShell project={f.project} saveStore={legacy} />); await screen.findByText(/当前宿主不支持安全手动保存/);
  await waitFor(() => expect(document.querySelector('main')).toHaveAttribute('data-save-list', 'ready')); expect(card('manual-2').getByRole('button', { name: '保存' })).toBeDisabled();
  click('读取进度'); expect(card().getByRole('button', { name: '读取' })).toBeEnabled(); expect(unsafe).not.toHaveBeenCalled();
});
it('rechecks the pinned target after asynchronous preview preparation', async () => {
  const capture = vi.fn(async (): Promise<null> => null), f = await fixture({ previewCapture: { version: '1.0.0', owner: 'player-host-compositor', capture } });
  let finish!: (value: null) => void; capture.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); save(); save('manual-1', '确认覆盖');
  const external = { ...f.original, savedAtEpochMilliseconds: 3000 }; await f.other.write(external); await act(async () => finish(null));
  await screen.findByText(/本次未保存/); expect(await f.other.read(f.original.projectId, 'manual-1')).toEqual(external);
});
it('does not submit a prepared save after the owning shell unmounts', async () => {
  const capture = vi.fn(async (): Promise<null> => null), f = await fixture({ previewCapture: { version: '1.0.0', owner: 'player-host-compositor', capture } });
  let finish!: (value: null) => void; capture.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const write = vi.spyOn(f.store, 'writeIfUnchanged'); save('manual-2');
  f.view.unmount(); await act(async () => finish(null)); expect(write).not.toHaveBeenCalled(); expect(await f.other.read(f.original.projectId, 'manual-2')).toBeNull();
});
it('does not queue two writes from rapid activations before the busy render', async () => {
  const f = await fixture(), write = vi.spyOn(f.store, 'writeIfUnchanged');
  act(() => { save('manual-2'); save('manual-2'); }); await screen.findByText(/手动存档 2已保存/); expect(write).toHaveBeenCalledOnce();
});
it('distinguishes preparation failure from an uncertain submitted write', async () => {
  const clock = vi.fn(() => 2000), f = await fixture({ now: clock }), write = vi.spyOn(f.store, 'writeIfUnchanged');
  clock.mockImplementation(() => { throw Error('host clock unavailable'); }); save('manual-2'); await screen.findByText(/本次未提交写入/);
  expect(write).not.toHaveBeenCalled(); expect(await f.other.read(f.original.projectId, 'manual-2')).toBeNull();
});

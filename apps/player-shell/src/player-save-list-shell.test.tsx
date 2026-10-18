import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import { createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1 } from '@world-studio/player-core';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
import { IndexedDbWorldPlayerSaveStoreV3, createWorldPlayerSaveSlotV3 } from './player-save-store';
import { createPlayerSaveBackup } from './player-save-backup';

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });
async function fixture() {
  const project = loadProject(migrateS0Project(tiny as S0Project).files), state = startPlayerCore(createPlayerCore(project), project), snapshot = createPlayerCoreSnapshotV1(state), save = createPlayerCoreSessionSaveV1(state); if (!save.ok) throw Error('fixture');
  const slot = createWorldPlayerSaveSlotV3({ kind: 'manual', slotId: 'manual-1', projectId: state.projectId, buildId: state.runtimeState!.buildId, savedAtEpochMilliseconds: 1000, title: state.title, chapterId: null, chapterTitle: null, sceneId: state.runtimeState!.cursor.sceneId, sceneTitle: '已有进度', route: null, customMetadata: {}, preview: { status: 'unavailable', reason: 'capture-unavailable' }, presentationKind: snapshot.presentation.kind, runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: save.artifactHash, serializedSessionSave: save.serialized, checkpointStepId: null });
  const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory(), webcrypto.subtle as SubtleCrypto); await store.write(slot); return { project, state, slot, store };
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const card = (id: string) => within(document.querySelector(`[data-save-slot="${id}"]`)! as HTMLElement);
it('does not describe an unread list as empty or enable blind manual overwrite, and retries from the dialog', async () => {
  const f = await fixture(), original = f.store.listSummaries.bind(f.store), list = vi.spyOn(f.store, 'listSummaries').mockRejectedValue(Error('unavailable'));
  render(<PlayerShell project={f.project} saveStore={f.store} />); click('读取存档'); await act(async () => {});
  expect(card('manual-1').queryByText('空槽位')).toBeNull(); expect(card('manual-1').getByText('尚未核对')).toBeInTheDocument(); expect(screen.getByRole('button', { name: '重试读取存档列表' })).toBeEnabled();
  list.mockImplementation(original); click('重试读取存档列表'); await waitFor(() => expect(card('manual-1').getByRole('button', { name: '读取' })).toBeEnabled()); expect(card('manual-1').getByText('已有进度')).toBeVisible(); expect((await f.store.read(f.state.projectId, 'manual-1'))!.serializedSessionSave).toBe(f.slot.serializedSessionSave);
});
it('reports that the slot was saved even when the subsequent list refresh fails', async () => {
  const f = await fixture(), view = render(<PlayerShell project={f.project} saveStore={f.store} />); await screen.findByRole('button', { name: '继续最近存档' }); click('开始故事'); await act(async () => {}); click('存读档'); await waitFor(() => expect(card('manual-2').getByRole('button', { name: '保存' })).toBeEnabled());
  const original = f.store.listSummaries.bind(f.store), list = vi.spyOn(f.store, 'listSummaries').mockRejectedValue(Error('refresh failed')); fireEvent.click(card('manual-2').getByRole('button', { name: '保存' })); await waitFor(() => expect(view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'saved'));
  expect(screen.getByText(/已保存.*列表尚未刷新/)).toHaveAttribute('role', 'alert'); expect(await f.store.read(f.state.projectId, 'manual-2')).not.toBeNull(); expect(screen.queryByText('写入失败，原存档保持不变')).toBeNull();
  list.mockImplementation(original); click('重试读取存档列表'); await screen.findByText(/已保存.*列表已刷新/); expect(screen.queryByText(/已保存.*列表尚未刷新/)).toBeNull();
});
it('does not swallow the real shell list refresh failure after a committed backup import', async () => {
  const f = await fixture(), file = new File([await createPlayerSaveBackup(f.slot)], 'actual.worldsave'); render(<PlayerShell project={f.project} saveStore={f.store} />); await screen.findByRole('button', { name: '继续最近存档' }); click('读取存档'); click('备份'); await act(async () => {});
  fireEvent.change(screen.getByLabelText('选择存档备份文件'), { target: { files: [file] } }); await screen.findByRole('button', { name: '导入到所选槽位' }); const original = f.store.listSummaries.bind(f.store), list = vi.spyOn(f.store, 'listSummaries').mockRejectedValue(Error('refresh failed')); click('导入到所选槽位');
  await screen.findByText(/已经写入目标槽位/); expect((await f.store.read(f.state.projectId, 'manual-2'))!.serializedSessionSave).toBe(f.slot.serializedSessionSave); expect(document.querySelector('main')).toHaveAttribute('data-player-status', 'title');
  list.mockImplementation(original); click('重试读取存档列表'); await screen.findByText(/备份已导入.*列表已核对/); expect(screen.queryByText(/但列表尚未刷新/)).toBeNull();
  fireEvent.change(screen.getByLabelText('选择存档备份文件'), { target: { files: [file] } }); await screen.findByRole('button', { name: '导入到所选槽位' }); list.mockRejectedValue(Error('refresh failed again')); click('导入到所选槽位'); await screen.findByText(/已经写入目标槽位/);
  const read = vi.spyOn(f.store, 'read').mockRejectedValue(Error('这次备份导出读取失败')); click('导出备份文件'); await screen.findByText('这次备份导出读取失败'); read.mockRestore(); list.mockImplementation(original); click('重试读取存档列表'); await waitFor(() => expect(document.querySelector('main')).toHaveAttribute('data-save-list', 'ready'));
  expect(screen.getByText('这次备份导出读取失败')).toHaveAttribute('role', 'alert'); expect(screen.queryByText(/列表已核对/)).toBeNull();
});
it('lets the player return while the list is pending, without treating an occupied manual slot as writable', async () => {
  const f = await fixture(), original = f.slot.serializedSessionSave, write = vi.spyOn(f.store, 'write'); vi.spyOn(f.store, 'listSummaries').mockImplementation(() => new Promise(() => {}));
  render(<PlayerShell project={f.project} saveStore={f.store} />); click('开始故事'); await act(async () => {}); click('存读档'); expect(card('manual-1').getByRole('button', { name: '保存' })).toBeDisabled(); expect(card('manual-1').queryByText('空槽位')).toBeNull(); expect(screen.getByRole('button', { name: '关闭存读档' })).toBeEnabled();
  click('关闭存读档'); expect(screen.queryByRole('dialog', { name: '存读档槽位' })).toBeNull(); expect((await f.store.read(f.state.projectId, 'manual-1'))!.serializedSessionSave).toBe(original); expect(write.mock.calls.filter(([slot]) => slot.kind === 'manual')).toHaveLength(0);
});
it('shows a retryable title-list timeout and keeps retry disabled only while the host is inactive', async () => {
  const f = await fixture(), original = f.store.listSummaries.bind(f.store), list = vi.spyOn(f.store, 'listSummaries').mockImplementation(() => new Promise(() => {})); vi.useFakeTimers(); const view = render(<PlayerShell project={f.project} saveStore={f.store} />);
  await act(async () => vi.advanceTimersByTimeAsync(8000)); expect(screen.getByText(/存档列表读取时间较长/)).toBeInTheDocument(); view.rerender(<PlayerShell project={f.project} saveStore={f.store} hostActivity="suspended" />); expect(screen.getByRole('button', { name: '重试读取存档列表' })).toBeDisabled();
  vi.useRealTimers(); list.mockImplementation(original); view.rerender(<PlayerShell project={f.project} saveStore={f.store} hostActivity="active" />); click('重试读取存档列表'); await waitFor(() => expect(screen.getByRole('button', { name: '继续最近存档' })).toBeEnabled()); expect(screen.queryByText(/存档列表读取时间较长/)).toBeNull();
});
it('keeps a checked file while its target list is unavailable and requires the list before explicit import', async () => {
  const f = await fixture(), file = new File([await createPlayerSaveBackup(f.slot)], 'actual.worldsave'), original = f.store.listSummaries.bind(f.store), list = vi.spyOn(f.store, 'listSummaries').mockRejectedValue(Error('list unavailable'));
  render(<PlayerShell project={f.project} saveStore={f.store} />); click('读取存档'); click('备份'); await act(async () => {}); fireEvent.change(screen.getByLabelText('选择存档备份文件'), { target: { files: [file] } }); await screen.findByRole('button', { name: '导入到所选槽位' });
  expect(screen.getByRole('button', { name: '导入到所选槽位' })).toBeDisabled(); expect(screen.getByLabelText('导入到手动槽位')).toBeDisabled(); expect(screen.getByLabelText('导入到手动槽位')).toHaveTextContent('尚未核对'); expect(await f.store.read(f.state.projectId, 'manual-2')).toBeNull();
  list.mockImplementation(original); click('重试读取存档列表'); await waitFor(() => expect(screen.getByRole('button', { name: '导入到所选槽位' })).toBeEnabled()); expect(screen.getByLabelText('导入到手动槽位')).toHaveTextContent('已有进度'); fireEvent.change(screen.getByLabelText('导入到手动槽位'), { target: { value: 'manual-2' } }); click('导入到所选槽位'); await screen.findByRole('button', { name: '读取导入的存档' }); expect((await f.store.read(f.state.projectId, 'manual-2'))!.serializedSessionSave).toBe(f.slot.serializedSessionSave); expect(document.querySelector('main')).toHaveAttribute('data-player-status', 'title');
});

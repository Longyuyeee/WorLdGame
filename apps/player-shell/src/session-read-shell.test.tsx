import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1 } from '@world-studio/player-core';
import { createWorldPlayerRecoveryRecordV1, type WorldPlayerRecoveryStoreV1 } from './player-recovery-store';
import type { WorldPlayerSaveSlotV3, WorldPlayerSaveStoreV3 } from './player-save-store';
import type { ForegroundSessionResult, ForegroundSessionTask } from './foreground-session-task';
import { PlayerShell } from './PlayerShell';
const gate = vi.hoisted(() => ({ enabled: false, jobs: [] as { signal: AbortSignal | undefined; finish: () => void; fail: () => void }[] }));
vi.mock('./foreground-session-client', async original => {
  const actual = await original<typeof import('./foreground-session-client')>();
  return { ...actual, ForegroundSessionRunner: class extends actual.ForegroundSessionRunner {
    override async run<T extends ForegroundSessionTask>(task: T, signal?: AbortSignal): Promise<Extract<ForegroundSessionResult, { kind: T['kind'] }>> {
      const result = await super.run(task, signal);
      if (task.kind !== 'load' || !gate.enabled) return result;
      // A deliberately late valid completion tests the independent Shell guard.
      return new Promise((resolve, reject) => gate.jobs.push({ signal, finish: () => resolve(result), fail: () => reject(new actual.ForegroundSessionError('probe')) }));
    }
  } };
});
afterEach(() => { cleanup(); gate.enabled = false; gate.jobs = []; localStorage.clear(); });
function project() {
  const base = loadProject(migrateS0Project({ schemaVersion: 0, id: 'read_wait', title: 'Read wait', entrySceneId: 'story', characters: [], scenes: [{ id: 'story', title: 'Story', statements: [
    { id: 'a', kind: 'narration', textId: 'ta', text: '第一句。' }, { id: 'b', kind: 'narration', textId: 'tb', text: '第二句。' }, { id: 'end', kind: 'end', endingName: 'End' }
  ] }] }).files);
  return { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }) };
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const hash = () => document.querySelector('main.player-shell')?.getAttribute('data-runtime-state-hash');
async function setup() {
  const source = project(), rows = new Map<string, WorldPlayerSaveSlotV3>();
  const saves: WorldPlayerSaveStoreV3 = { version: '3.0.0', backend: 'test', list: async () => [...rows.values()], read: async (_p, id) => rows.get(id) ?? null, readPreview: async () => null, write: async row => { if (row.schemaVersion !== 3) throw Error('legacy'); rows.set(row.slotId, row); } };
  const view = render(<PlayerShell project={source} saveStore={saves} />); click('开始故事'); click('快速保存');
  await waitFor(() => expect(rows.has('quick-1')).toBe(true));
  await waitFor(() => expect(document.querySelector('main')).toHaveAttribute('data-save-operation', 'saved'));
  click('继续下一句'); await act(async () => {});
  return { source, rows, saves, view };
}
async function startRead() {
  click('快速读取'); click('确认读取'); await waitFor(() => expect(gate.jobs.length).toBeGreaterThan(0));
}
it.each(['button', 'escape', 'dialog'] as const)('cancels validation through %s, ignores a late valid reply and retries the same untouched slot', async method => {
  const { rows } = await setup(), before = hash(), original = rows.get('quick-1'); gate.enabled = true; await startRead();
  expect(screen.getByText(/长篇记录可能需要更久/)).toBeVisible(); expect(screen.getByRole('button', { name: '取消读取' })).toBeEnabled();
  if (method === 'button') click('取消读取'); else if (method === 'escape') fireEvent.keyDown(window, { key: 'Escape' }); else fireEvent(screen.getByRole('dialog', { name: '存读档槽位' }), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(gate.jobs[0]!.signal?.aborted).toBe(true); await act(async () => gate.jobs[0]!.finish());
  expect(hash()).toBe(before); expect(rows.get('quick-1')).toBe(original); expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(within(document.querySelector('[data-save-slot="quick-1"]') as HTMLElement).getByRole('button', { name: '读取' }));
  click('确认读取'); await waitFor(() => expect(gate.jobs).toHaveLength(2)); await act(async () => gate.jobs[1]!.finish());
  expect(document.querySelector('.player-dialogue__text')).toHaveTextContent('第一句。'); expect(rows.get('quick-1')).toBe(original);
});
it('keeps the title recent-save entry retryable after cancelling an unfinished store read', async () => {
  const { source, saves, rows, view } = await setup(), slot = rows.get('quick-1')!; view.unmount();
  let finish!: (value: WorldPlayerSaveSlotV3) => void;
  const originalRead = saves.read; saves.read = () => new Promise(resolve => { finish = resolve; });
  render(<PlayerShell project={source} saveStore={saves} />); await screen.findByRole('button', { name: '继续最近存档' });
  click('继续最近存档'); expect(screen.getByText(/正在读取本机存档/)).toBeVisible(); click('取消读取');
  await act(async () => finish(slot)); expect(document.querySelector('main')).toHaveAttribute('data-player-status', 'title');
  saves.read = originalRead; click('继续最近存档'); await screen.findByText('第一句。'); expect(rows.get('quick-1')).toBe(slot);
});
it.each(['cancel', 'failure'] as const)('retains a recovery point across %s and successful explicit retry', async mode => {
  const source = project(), state = startPlayerCore(createPlayerCore(source), source), saved = createPlayerCoreSessionSaveV1(state); if (!saved.ok) throw Error('fixture');
  const record = createWorldPlayerRecoveryRecordV1({ projectId: state.projectId, buildId: state.artifacts!.manifest.buildId, sceneId: state.runtimeState!.cursor.sceneId, savedAtEpochMilliseconds: 1000, title: source.manifest.title, presentationKind: 'narration', runtimeStateHash: createPlayerCoreSnapshotV1(state).runtimeStateHash!, sessionArtifactHash: saved.artifactHash, serializedSessionSave: saved.serialized });
  const store: WorldPlayerRecoveryStoreV1 = { version: '1.0.0', backend: 'test', read: async () => record, write: vi.fn(), clear: vi.fn() };
  render(<PlayerShell project={source} recoveryStore={store} />); await screen.findByRole('button', { name: '恢复上次进度' }); gate.enabled = true;
  click('恢复上次进度'); await waitFor(() => expect(gate.jobs).toHaveLength(1)); expect(screen.getByRole('button', { name: '放弃并清除' })).toBeDisabled();
  if (mode === 'cancel') { click('取消读取'); await act(async () => gate.jobs[0]!.fail()); expect(screen.queryByRole('alert')).toBeNull(); }
  else { await act(async () => gate.jobs[0]!.fail()); expect(await screen.findByRole('alert')).toHaveTextContent('后台恢复校验未完成'); }
  expect(store.clear).not.toHaveBeenCalled();
  click(mode === 'cancel' ? '恢复上次进度' : '重试读取恢复记录'); await waitFor(() => expect(gate.jobs).toHaveLength(2)); await act(async () => gate.jobs[1]!.finish());
  expect(document.querySelector('.player-dialogue__text')).toHaveTextContent('第一句。'); expect(store.clear).not.toHaveBeenCalled();
});
it.each(['suspend', 'store', 'project', 'unmount'] as const)('invalidates a validating read on %s without committing its late result', async action => {
  const { source, saves, view } = await setup(), before = hash(); gate.enabled = true; await startRead();
  if (action === 'suspend') view.rerender(<PlayerShell project={source} saveStore={saves} hostActivity="suspended" />);
  else if (action === 'store') view.rerender(<PlayerShell project={source} saveStore={{ ...saves }} />);
  else if (action === 'project') view.rerender(<PlayerShell project={{ ...source, manifest: { ...source.manifest, title: 'Next executable' } }} saveStore={saves} />); else view.unmount();
  expect(gate.jobs[0]!.signal?.aborted).toBe(true); await act(async () => gate.jobs[0]!.finish());
  if (action === 'project') expect(document.querySelector('main')).toHaveAttribute('data-player-status', 'title');
  else if (action !== 'unmount') expect(hash()).toBe(before);
});
it('reports a real validation failure, leaves the current sentence and allows a fresh retry', async () => {
  const { rows } = await setup(), before = hash(), slot = rows.get('quick-1'); gate.enabled = true; await startRead();
  await act(async () => gate.jobs[0]!.fail()); expect(await screen.findByRole('alert')).toHaveTextContent('后台存档校验未完成');
  expect(hash()).toBe(before); expect(rows.get('quick-1')).toBe(slot); expect(screen.getByRole('button', { name: '关闭存读档' })).toBeEnabled();
  fireEvent.click(within(document.querySelector('[data-save-slot="quick-1"]') as HTMLElement).getByRole('button', { name: '读取' })); click('确认读取');
  await waitFor(() => expect(gate.jobs).toHaveLength(2)); await act(async () => gate.jobs[1]!.finish());
  expect(document.querySelector('.player-dialogue__text')).toHaveTextContent('第一句。'); expect(rows.get('quick-1')).toBe(slot);
});

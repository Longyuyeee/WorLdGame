import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import { IDBFactory } from 'fake-indexeddb';
import { PlayerShell } from './PlayerShell';
import { IndexedDbWorldPlayerSaveStoreV3 } from './player-save-store';
import { executeForegroundSessionTask, type ForegroundSessionTask, type ForegroundSessionResult } from './foreground-session-task';
const pending = vi.hoisted(() => ({ jobs: [] as { signal: AbortSignal; finish(): void; fail(): void }[] }));
vi.mock('./story-advance-task', async original => ({ ...await original<typeof import('./story-advance-task')>(), canOffloadStoryAdvance: (state: import('@world-studio/player-core').PlayerCoreState) => state.status === 'presenting' && state.historySession?.cursor === state.historySession?.entries.length }));
vi.mock('./foreground-session-client', async original => ({ ...await original<typeof import('./foreground-session-client')>(), ForegroundSessionRunner: class {
  active = true; resume() { this.active = true; } cancelPending() { this.active = false; } releaseIdle() {}
  run(task: ForegroundSessionTask, signal: AbortSignal) {
    if (task.kind !== 'advance') return Promise.resolve(executeForegroundSessionTask(task));
    return new Promise<ForegroundSessionResult>((resolve, reject) => pending.jobs.push({ signal, finish: () => resolve(executeForegroundSessionTask(task)), fail: () => reject(Error('worker')) }));
  }
} }));
afterEach(() => { cleanup(); pending.jobs.length = 0; vi.restoreAllMocks(); localStorage.clear(); });
function project(id = 'story_async') {
  const value = loadProject(migrateS0Project({ schemaVersion: 0, id, title: id, entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    { id: 'first', kind: 'narration', textId: 'first_text', text: 'First' }, { id: 'second', kind: 'narration', textId: 'second_text', text: 'Second' }, { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files);
  return { ...value, settings: withProjectSettings(value.settings, { text: { revealMode: 'instant' } }) };
}
function setup(save = false) {
  const value = project(), store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()), view = render(<PlayerShell project={value} {...(save ? { saveStore: store } : {})} />);
  fireEvent.click(view.getByRole('button', { name: '开始故事' }));
  const hash = view.container.querySelector('main')!.getAttribute('data-runtime-state-hash');
  fireEvent.click(view.getByRole('button', { name: '继续下一句' }));
  return { ...view, project: value, hash, store };
}
it('keeps the current sentence and only one job during repeated taps, then commits once', async () => {
  const test = setup(); expect(pending.jobs).toHaveLength(1);
  for (let i = 0; i < 5; i++) fireEvent.click(test.getByRole('button', { name: '继续下一句' }));
  expect(pending.jobs).toHaveLength(1); expect(test.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', test.hash);
  expect(test.getByRole('button', { name: '取消推进' })).toBeEnabled();
  await act(async () => pending.jobs[0]!.finish());
  expect(test.getByText('Second', { exact: true })).toBeInTheDocument(); expect(test.container.querySelector('main')).toHaveAttribute('data-story-operation', 'idle');
});
it('does not reread unchanged replay archives just because an execution result crossed the worker boundary', async () => {
  const read = vi.spyOn(Storage.prototype, 'getItem'), test = setup();
  const calls = () => read.mock.calls.filter(([key]) => key.startsWith('world-player.replay.v1:')).length;
  const before = calls(); await act(async () => pending.jobs[0]!.finish());
  expect(test.getByText('Second', { exact: true })).toBeInTheDocument(); expect(calls()).toBe(before);
});
it.each(['cancel', 'menu', 'suspend', 'pressure', 'project', 'unmount'])('ignores a captured late result after %s', async kind => {
  const test = setup(), job = pending.jobs[0]!;
  if (kind === 'cancel') fireEvent.click(test.getByRole('button', { name: '取消推进' }));
  if (kind === 'menu') fireEvent.click(test.getByRole('button', { name: '打开阅读菜单' }));
  if (kind === 'suspend') test.rerender(<PlayerShell project={test.project} hostActivity="suspended" />);
  if (kind === 'pressure') test.rerender(<PlayerShell project={test.project} memoryPressureRequest={{ serial: 1, level: 'critical' }} />);
  if (kind === 'project') test.rerender(<PlayerShell project={project('other')} />);
  if (kind === 'unmount') test.unmount();
  expect(job.signal.aborted).toBe(true); await act(async () => job.finish());
  if (kind !== 'unmount') { expect(test.queryByText('Second', { exact: true })).toBeNull(); if (kind !== 'project') expect(test.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', test.hash); }
});
it('keeps the old sentence after failure and allows explicit synchronous compatibility', async () => {
  const test = setup(); await act(async () => pending.jobs[0]!.fail());
  expect(test.getByRole('alert')).toHaveTextContent('当前句和存档保持不变');
  expect(test.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', test.hash);
  fireEvent.click(test.getByRole('button', { name: '使用兼容模式继续' }));
  expect(test.getByText('Second', { exact: true })).toBeInTheDocument(); expect(pending.jobs).toHaveLength(1);
});
it('retries without reusing the failed or late request', async () => {
  const test = setup(), old = pending.jobs[0]!; await act(async () => old.fail());
  fireEvent.click(test.getByRole('button', { name: '重试推进' })); expect(pending.jobs).toHaveLength(2);
  await act(async () => old.finish()); expect(test.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', test.hash);
  await act(async () => pending.jobs[1]!.finish()); expect(test.getByText('Second', { exact: true })).toBeInTheDocument();
});
it('clears a failed reading prompt when opening the menu instead of covering menu controls', async () => {
  const test = setup(); await act(async () => pending.jobs[0]!.fail());
  expect(test.getByRole('alert')).toHaveTextContent('当前句和存档保持不变');
  fireEvent.click(test.getByRole('button', { name: '打开阅读菜单' }));
  expect(test.queryByRole('alert')).toBeNull();
  expect(test.getByRole('button', { name: /^返回故事$/ })).toBeVisible();
  expect(test.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', test.hash);
});
it('explicit saving cancels uncommitted advancement and saves the sentence still on screen', async () => {
  const test = setup(true), job = pending.jobs[0]!;
  fireEvent.click(test.getByRole('button', { name: '快速保存' }));
  await waitFor(() => expect(test.container.querySelector('main')).toHaveAttribute('data-save-operation', 'saved'));
  expect(job.signal.aborted).toBe(true); await act(async () => job.finish());
  expect((await test.store.read(test.project.manifest.projectId, 'quick-1'))!.runtimeStateHash).toBe(test.hash);
  expect(test.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', test.hash);
});

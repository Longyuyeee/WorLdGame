import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import { createPlayerCore, createPlayerCoreSnapshotV1, loadPlayerCoreSessionSaveV1 } from '@world-studio/player-core';
import { PlayerShell } from './PlayerShell';
import type { WorldPlayerSaveSlotV3, WorldPlayerSaveStoreV3 } from './player-save-store';
import { executeForegroundSessionTask, type ForegroundSessionTask } from './foreground-session-task';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });
async function setup(fakeClock = false) {
  const base = loadProject(migrateS0Project({ schemaVersion: 0, id: 'checkpoint_shell', title: 'Checkpoint', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    { id: 'before', kind: 'narration', textId: 'before_text', text: 'Before' }, { id: 'after', kind: 'narration', textId: 'after_text', text: 'After' }, { id: 'last', kind: 'narration', textId: 'last_text', text: 'Later' }, { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files), script = base.scripts.main!;
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant', minimumDisplayMilliseconds: 0 } }), scripts: { ...base.scripts, main: { ...script, statements: [script.statements[0]!, { id: 'checkpoint', kind: 'checkpoint' as const }, ...script.statements.slice(1)] } } };
  const slots = new Map<string, WorldPlayerSaveSlotV3>();
  const store: WorldPlayerSaveStoreV3 = { version: '3.0.0', backend: 'checkpoint-test', async list() { return [...slots.values()]; }, async read(_id, slot) { return slots.get(slot) ?? null; }, async readPreview() { return null; }, write: vi.fn(async value => { if (value.schemaVersion !== 3) throw Error('legacy'); slots.set(value.slotId, value); }) };
  const view = render(<PlayerShell project={project} saveStore={store} />);
  fireEvent.click(screen.getByRole('button', { name: '开始故事' }));
  await waitFor(() => expect(slots.get('auto-1')).toBeDefined());
  const worker = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null, onmessageerror: null, postMessage: vi.fn<(message: { id: number; task: ForegroundSessionTask }) => void>(), terminate: vi.fn() };
  const ParentURL = URL, revoke = vi.fn();
  vi.stubGlobal('URL', class extends ParentURL { static override createObjectURL = vi.fn(() => 'blob:checkpoint'); static override revokeObjectURL = revoke; });
  vi.stubGlobal('Worker', function() { return worker; });
  if (fakeClock) vi.useFakeTimers();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); });
  expect(worker.postMessage).toHaveBeenCalledOnce();
  const request = worker.postMessage.mock.calls[0]![0], reply = worker.onmessage!;
  return { ...view, worker, revoke, request, reply, project, store, slots };
}
it('lets reading continue and writes only the earlier exact checkpoint, once', async () => {
  const test = await setup(); expect(test.container.querySelector('.player-dialogue__text')).toHaveTextContent('After');
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  expect(test.container.querySelector('.player-dialogue__text')).toHaveTextContent('Later');
  const currentHash = test.container.querySelector('main')!.dataset.runtimeStateHash;
  await act(async () => test.reply({ data: { id: test.request.id, result: executeForegroundSessionTask(test.request.task) } } as MessageEvent));
  await waitFor(() => expect(test.slots.get('checkpoint-1')).toBeDefined());
  expect(test.container.querySelector('main')!.dataset.runtimeStateHash).toBe(currentHash);
  const checkpoint = test.slots.get('checkpoint-1')!, loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(test.project), checkpoint.serializedSessionSave);
  expect(loaded.ok).toBe(true); if (loaded.ok) expect(createPlayerCoreSnapshotV1(loaded.state).presentation).toMatchObject({ kind: 'narration', text: 'After' });
  test.rerender(<PlayerShell project={test.project} saveStore={test.store} />);
  expect(vi.mocked(test.store.write).mock.calls.filter(([slot]) => slot.kind === 'checkpoint')).toHaveLength(1);
  expect(test.worker.terminate).not.toHaveBeenCalled();
  test.unmount();
  expect(test.worker.terminate).toHaveBeenCalledOnce(); expect(test.revoke).toHaveBeenCalledOnce();
});
it.each(['unmount', 'project', 'timeout'] as const)('ignores late checkpoint results after %s', async reason => {
  const test = await setup(reason === 'timeout');
  if (reason === 'unmount') test.unmount();
  else if (reason === 'project') test.rerender(<PlayerShell project={{ ...test.project, manifest: { ...test.project.manifest, title: 'Changed' } }} saveStore={test.store} />);
  else await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(test.worker.terminate).toHaveBeenCalledOnce(); expect(test.revoke).toHaveBeenCalledOnce();
  await act(async () => test.reply({ data: { id: test.request.id, result: executeForegroundSessionTask(test.request.task) } } as MessageEvent));
  expect(test.slots.get('checkpoint-1')).toBeUndefined();
  if (reason === 'timeout') {
    expect(test.container.querySelector('main')).toHaveAttribute('data-save-operation', 'idle');
    fireEvent.click(screen.getByRole('button', { name: '查看保存问题' }));
    expect(screen.getByRole('alert', { name: '后台保存提醒' })).toHaveTextContent('剧情检查点保存失败');
    expect(test.container.querySelector('.player-dialogue__text')).toHaveTextContent('After');
  }
});

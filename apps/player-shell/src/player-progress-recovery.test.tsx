import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';
import { testSaveComparison } from './test-save-store';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import type { WorldPlayerRecoveryRecordV1, WorldPlayerRecoveryStoreV1 } from './player-recovery-store';
import type { WorldPlayerSaveSlotV3, WorldPlayerSaveStoreV3 } from './player-save-store';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
async function setup(media = false) {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const demo = createPlayerMediaMultichannelDemoV1();
  const base = media ? demo.project : loadProject(migrateS0Project({ schemaVersion: 0, id: 'progress_problem', title: 'Progress problem', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    { id: 'first', kind: 'narration', textId: 'first_text', text: 'First paragraph' },
    { id: 'second', kind: 'narration', textId: 'second_text', text: 'Second paragraph' },
    { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files);
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }) };
  let saved: WorldPlayerRecoveryRecordV1 | null = null;
  const jobs: { value: WorldPlayerRecoveryRecordV1; finish(): void; fail(error: unknown): void }[] = [];
  const write = vi.fn((value: WorldPlayerRecoveryRecordV1) => new Promise<void>((resolve, reject) => jobs.push({ value, finish() { saved = value; resolve(); }, fail: reject })));
  const recoveryStore: WorldPlayerRecoveryStoreV1 = { version: '1.0.0', backend: 'delayed', read: async () => saved, write, clear: async () => { saved = null; } };
  const slots = new Map<string, WorldPlayerSaveSlotV3>();
  const saveStore: WorldPlayerSaveStoreV3 = { version: '3.0.0', backend: 'test', writeIfUnchanged: testSaveComparison(() => saveStore), list: async () => [...slots.values()], read: async (_projectId, slotId) => slots.get(slotId) ?? null, readPreview: async () => null, write: async value => { if (value.schemaVersion !== 3) throw Error('legacy'); slots.set(value.slotId, value); } };
  const props = { project, saveStore, recoveryStore, ...(media ? { mediaAssets: demo.mediaAssets } : {}), previewCapture: { version: '1.0.0' as const, owner: 'player-host-compositor' as const, capture: async () => null } };
  const view = render(<PlayerShell {...props} />); await waitFor(() => expect(view.container.querySelector('main')).toHaveAttribute('data-recovery-operation', 'idle'));
  vi.useFakeTimers(); await act(async () => { fireEvent.click(screen.getByRole('button', { name: '开始故事' })); });
  expect(jobs).toHaveLength(1);
  const hash = () => view.container.querySelector('main')!.getAttribute('data-runtime-state-hash');
  const timeout = () => act(async () => { await vi.advanceTimersByTimeAsync(8001); });
  return { view, props, jobs, hash, timeout, slots, saved: () => saved };
}
function open() { fireEvent.click(screen.getByRole('button', { name: '查看保存问题' })); return screen.getByRole('dialog', { name: '阅读菜单' }); }
it('keeps a persistent discoverable warning instead of a floating blocker, without stealing focus', async () => {
  const f = await setup(), before = f.hash(), reading = screen.getByRole('button', { name: '继续下一句' }); reading.focus(); await f.timeout();
  expect(screen.getByRole('alert')).toHaveTextContent('保存问题'); expect(screen.getByRole('button', { name: '查看保存问题' })).toBeInTheDocument();
  expect(f.view.container.querySelector('.player-stage > .player-recovery')).toBeNull(); expect(reading).toHaveFocus(); expect(f.hash()).toBe(before);
});
it('continues the current story after timeout without enqueuing another physical recovery write', async () => {
  const f = await setup(), before = f.hash(); await f.timeout(); fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  expect(f.hash()).not.toBe(before); expect(f.jobs).toHaveLength(1); expect(screen.getByRole('button', { name: '查看保存问题' })).toBeInTheDocument();
});
it('explains the pending write in the menu and disables duplicate retry, not independent manual saving', async () => {
  const f = await setup(); await f.timeout(); const menu = open();
  expect(within(menu).getByRole('alert', { name: '恢复保护提醒' })).toHaveTextContent('存储操作仍未结束');
  expect(within(menu).getByRole('button', { name: '重试恢复保护' })).toBeDisabled();
  expect(within(menu).getByRole('button', { name: '保存当前进度' })).toBeEnabled(); expect(f.jobs).toHaveLength(1);
});
it('can leave the warning undecided and return focus to its visible entrance without changing progress', async () => {
  const f = await setup(); await f.timeout(); const before = f.hash(); open(); fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {});
  expect(screen.getByRole('button', { name: '查看保存问题' })).toHaveFocus(); expect(f.hash()).toBe(before); expect(f.jobs).toHaveLength(1);
});
it('does not label a late physical success as latest progress and retries only the newest requested boundary', async () => {
  const f = await setup(); await f.timeout(); fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); const latest = f.hash();
  await act(async () => f.jobs[0]!.finish()); expect(f.saved()!.runtimeStateHash).not.toBe(latest); const menu = open();
  expect(within(menu).getByRole('alert')).toHaveTextContent('不一定包含最新进度');
  expect(within(menu).getByRole('button', { name: '重试恢复保护' })).toBeEnabled();
  fireEvent.click(within(menu).getByRole('button', { name: '重试恢复保护' })); await act(async () => {}); expect(f.jobs).toHaveLength(2);
  expect(f.jobs[1]!.value.runtimeStateHash).toBe(latest); await act(async () => f.jobs[1]!.finish());
  expect(f.saved()!.runtimeStateHash).toBe(latest); expect(f.hash()).toBe(latest); expect(screen.queryByRole('button', { name: '查看保存问题' })).toBeNull();
  expect(within(menu).getByRole('button', { name: '返回故事' })).toHaveFocus();
});
it('saves the current paragraph independently while recovery IO is pending, retaining the recovery warning', async () => {
  const f = await setup(); await f.timeout(); fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); const latest = f.hash();
  const menu = open(); fireEvent.click(within(menu).getByRole('button', { name: '保存当前进度' })); const dialog = screen.getByRole('dialog', { name: '存读档槽位' });
  expect(within(dialog).getByRole('button', { name: '保存进度' })).toHaveAttribute('aria-pressed', 'true');
  await act(async () => {}); expect(within(dialog).getAllByRole('button', { name: '保存' })[0]).toBeEnabled();
  await act(async () => { fireEvent.click(within(dialog).getAllByRole('button', { name: '保存' })[0]!); });
  expect(f.slots.get('manual-1')!.runtimeStateHash).toBe(latest); expect(f.saved()).toBeNull(); expect(f.jobs).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭存读档' })); open(); expect(screen.getByRole('alert', { name: '恢复保护提醒' })).toHaveTextContent('存储操作仍未结束'); expect(f.hash()).toBe(latest);
});
it('retains prior recovery data and quota guidance without silently retrying failed IO', async () => {
  const f = await setup(); await act(async () => f.jobs[0]!.finish()); const old = f.saved();
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); await act(async () => {}); await act(async () => f.jobs[1]!.fail(new DOMException('full', 'QuotaExceededError')));
  const menu = open(); expect(within(menu).getByRole('alert')).toHaveTextContent('不要清除本游戏的网站数据'); expect(f.saved()).toBe(old); expect(f.jobs).toHaveLength(2);
});
it('keeps recovery controls inside the menu, not underneath preferences or story reading', async () => {
  const f = await setup(); await f.timeout(); open(); fireEvent.click(screen.getByRole('button', { name: '打开玩家设置' }));
  expect(screen.queryByRole('button', { name: '重试恢复保护' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: '返回故事' }));
  expect(screen.queryByRole('button', { name: '重试恢复保护' })).toBeNull(); expect(screen.getByRole('button', { name: '查看保存问题' })).toBeInTheDocument();
});
it('preserves host ceilings for saving and retry after physical IO has settled', async () => {
  const f = await setup(); await f.timeout(); await act(async () => f.jobs[0]!.finish()); open(); f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />);
  expect(screen.getByRole('button', { name: '保存当前进度' })).toBeDisabled(); expect(screen.getByRole('button', { name: '重试恢复保护' })).toBeDisabled(); expect(f.jobs).toHaveLength(1);
});
it('uses one prioritized problem entrance when media also fails, while exposing both real problems in the menu', async () => {
  const f = await setup(true); await f.timeout(); fireEvent.error(f.view.container.querySelector('audio')!);
  expect(screen.getByRole('button', { name: '查看保存问题' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull();
  const menu = open(); expect(within(menu).getByRole('alert', { name: '恢复保护提醒' })).toBeInTheDocument(); expect(within(menu).getByRole('button', { name: '重试媒体' })).toBeInTheDocument();
});
it('shows the same recovery problem through the ordinary menu, without requiring the shortcut', async () => {
  const f = await setup(); await f.timeout(); fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' }));
  expect(screen.getByRole('alert', { name: '恢复保护提醒' })).toHaveTextContent('保存超时');
});

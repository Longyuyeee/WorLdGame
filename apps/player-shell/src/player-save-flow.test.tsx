import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
import type { WorldPlayerSaveSlotV3, WorldPlayerSaveStoreV3 } from './player-save-store';

afterEach(() => localStorage.clear());
function project() {
  const base = loadProject(migrateS0Project(tiny as S0Project).files);
  return { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }), scripts: { ...base.scripts, tiny_start: { ...base.scripts.tiny_start!, statements: [
    { id: 'a', kind: 'narration' as const, textId: 'a_text', text: '第一段。' }, { id: 'b', kind: 'narration' as const, textId: 'b_text', text: '第二段。' }, { id: 'c', kind: 'narration' as const, textId: 'c_text', text: '第三段。' }, { id: 'end', kind: 'end' as const, endingName: '结束' }
  ] } } };
}
function store() {
  const rows = new Map<string, WorldPlayerSaveSlotV3>();
  return { rows, version: '3.0.0' as const, backend: 'memory-test', async list() { return [...rows.values()]; }, async read(_project: string, id: string) { return rows.get(id) ?? null; }, async readPreview() { return null; }, async write(row) { if (row.schemaVersion !== 3) throw Error('legacy'); rows.set(row.slotId, row); } } satisfies WorldPlayerSaveStoreV3 & { rows: typeof rows };
}
const dialog = () => screen.getByRole('dialog', { name: '存读档槽位' });
const card = (id: string) => document.querySelector(`[data-save-slot="${id}"]`)! as HTMLElement;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
async function setup() {
  const source = project(), saves = store(), view = render(<PlayerShell project={source} saveStore={saves} />);
  click('开始故事'); await act(async () => {}); click('存读档'); fireEvent.click(within(card('manual-1')).getByRole('button', { name: '保存' }));
  await waitFor(() => expect(view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'saved')); click('关闭存读档'); click('继续下一句'); await act(async () => {});
  return { source, saves, view, hash: () => view.container.querySelector('main')!.dataset.runtimeStateHash };
}
it('shows one action per card and keeps empty load cards disabled', async () => {
  const { saves } = await setup(); click('存读档'); expect(within(dialog()).queryAllByRole('button', { name: '读取' })).toHaveLength(0);
  expect(within(card('manual-1')).getByText('手动存档 1')).toBeVisible(); expect(within(card('manual-1')).getByText(saves.rows.get('manual-1')!.sceneTitle)).toBeVisible();
  click('读取进度'); expect(within(dialog()).queryAllByRole('button', { name: '保存' })).toHaveLength(0); expect(within(card('manual-1')).getByRole('button', { name: '读取' })).toBeEnabled(); expect(within(card('manual-2')).getByRole('button', { name: '读取' })).toBeDisabled();
  click('自动'); expect(screen.getByRole('button', { name: '读取进度' })).toHaveAttribute('aria-pressed', 'true');
});
it('cancels a requested read without changing progress, then reads the pinned slot and stops Auto', async () => {
  const { hash, view } = await setup(), before = hash(); click('自动播放'); click('存读档'); click('读取进度'); fireEvent.click(within(card('manual-1')).getByRole('button', { name: '读取' }));
  expect(screen.getByRole('region', { name: '确认读取存档' })).toBeVisible(); expect(hash()).toBe(before); fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {});
  expect(screen.queryByRole('region', { name: '确认读取存档' })).toBeNull(); expect(dialog()).toBeVisible(); expect(hash()).toBe(before); expect(screen.getByRole('button', { name: '读取进度' })).toHaveFocus();
  fireEvent.click(within(card('manual-1')).getByRole('button', { name: '读取' })); click('确认读取'); await waitFor(() => expect(view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'loaded')); expect(screen.queryByRole('dialog', { name: '存读档槽位' })).toBeNull();
  expect(screen.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'false'); expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('第一段。');
});
it('refuses a changed slot after confirmation and refreshes the displayed selection', async () => {
  const { saves, hash } = await setup(), before = hash(); click('存读档'); click('读取进度'); fireEvent.click(within(card('manual-1')).getByRole('button', { name: '读取' }));
  const slot = saves.rows.get('manual-1')!; saves.rows.set('manual-1', { ...slot, sessionArtifactHash: 'f'.repeat(64) }); click('确认读取');
  expect(await screen.findByRole('alert')).toHaveTextContent('槽位已经更新'); expect(hash()).toBe(before); expect(saves.rows.get('manual-1')!.sessionArtifactHash).toBe('f'.repeat(64));
  saves.rows.set('manual-1', slot); click('关闭存读档'); click('存读档'); click('读取进度'); await act(async () => {}); fireEvent.click(within(card('manual-1')).getByRole('button', { name: '读取' })); click('确认读取'); await waitFor(() => expect(screen.queryByRole('dialog', { name: '存读档槽位' })).toBeNull()); expect(document.querySelector('.player-dialogue__text')).toHaveTextContent('第一段。');
});
it('continues the latest saved slot from title using the normal validated loader', async () => {
  const { saves, source, view } = await setup(); click('存读档'); fireEvent.click(within(card('manual-2')).getByRole('button', { name: '保存' })); await waitFor(() => expect(saves.rows.has('manual-2')).toBe(true));
  const recent = saves.rows.get('manual-2')!; saves.rows.set('manual-2', { ...recent, savedAtEpochMilliseconds: Date.now() + 1000 }); view.unmount();
  const fresh = render(<PlayerShell project={source} saveStore={saves} />); await screen.findByRole('button', { name: '继续最近存档' }); click('继续最近存档');
  await waitFor(() => expect(fresh.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', recent.runtimeStateHash)); expect(screen.queryByRole('region', { name: '确认读取存档' })).toBeNull();
});
it('keeps a corrupt read from replacing the current story or writing a slot', async () => {
  const { saves, hash } = await setup(), before = hash(); const broken = { ...saves.rows.get('manual-1')!, serializedSessionSave: 'broken' }; saves.rows.set('manual-1', broken);
  click('存读档'); click('读取进度'); await act(async () => {}); fireEvent.click(within(card('manual-1')).getByRole('button', { name: '读取' })); click('确认读取');
  expect(await screen.findByRole('alert')).toHaveTextContent('存档损坏'); expect(hash()).toBe(before); expect(saves.rows.get('manual-1')).toEqual(broken);
});
it('cancels a busy store read with Escape and ignores its late completion', async () => {
  const { saves, hash } = await setup(), target = saves.rows.get('manual-1')!, before = hash(); let resolve: (row: WorldPlayerSaveSlotV3) => void = () => {};
  saves.read = async () => new Promise<WorldPlayerSaveSlotV3>(done => { resolve = done; });
  click('存读档'); click('读取进度'); fireEvent.click(within(card('manual-1')).getByRole('button', { name: '读取' })); click('确认读取'); fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('region', { name: '确认读取存档' })).toBeNull(); expect(dialog()).toBeVisible(); expect(screen.getByText(/已取消读取/)).toBeVisible();
  await act(async () => resolve(target)); expect(hash()).toBe(before); expect(saves.rows.get('manual-1')).toBe(target); expect(document.querySelector('.player-dialogue__text')).toHaveTextContent('第二段。');
});

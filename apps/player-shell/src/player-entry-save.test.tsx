import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import source from '../../../fixtures/projects/branching/project.s0.json';
import { PlayerShell } from './PlayerShell';
import type { WorldPlayerSaveStoreV3, WorldPlayerSaveSlotV3 } from './player-save-store';

const project = () => loadProject(migrateS0Project(source as S0Project).files);
function store(failQuick = false): WorldPlayerSaveStoreV3 {
  const rows = new Map<string, WorldPlayerSaveSlotV3>();
  return { version: '3.0.0', backend: 'memory-test', async list() { return [...rows.values()]; }, async read(_project, id) { return rows.get(id) ?? null; }, async readPreview() { return null; }, async write(row) { if (row.schemaVersion !== 3) throw Error('legacy'); if (failQuick && row.kind === 'quick') throw Error('quota'); rows.set(row.slotId, row); } };
}
it('keeps title entry focused and returns from the save dialog without starting the story', async () => {
  const view = render(<PlayerShell project={project()} saveStore={store()} />);
  expect(screen.queryByRole('button', { name: '自动播放' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '后退一步' })).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: '读取存档' }); fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: '存读档槽位' });
  expect(screen.getByRole('button', { name: '关闭存读档' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  expect(view.container.querySelector('main')).toHaveAttribute('data-player-status', 'title');
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole('dialog', { name: '存读档槽位' })).not.toBeInTheDocument();
});
it('shows failed quick writes, preserves the story and lets the player return', async () => {
  const view = render(<PlayerShell project={project()} saveStore={store(true)} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  const hash = view.container.querySelector('main')?.getAttribute('data-runtime-state-hash');
  fireEvent.click(screen.getByRole('button', { name: '快速保存' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('写入失败，原存档保持不变');
  expect(screen.getByRole('dialog', { name: '存读档槽位' })).toBeVisible();
  expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
  fireEvent.click(screen.getByRole('button', { name: '关闭存读档' }));
  expect(screen.getByRole('button', { name: '存读档' })).toBeEnabled();
});
it('acknowledges a quick save without opening a modal or changing the story', async () => {
  const view = render(<PlayerShell project={project()} saveStore={store()} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  const hash = view.container.querySelector('main')?.getAttribute('data-runtime-state-hash');
  fireEvent.click(screen.getByRole('button', { name: '快速保存' }));
  expect(await screen.findByText('快速存档已保存')).toBeVisible();
  expect(screen.queryByRole('dialog', { name: '存读档槽位' })).not.toBeInTheDocument();
  expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', hash);
});

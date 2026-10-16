import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, startPlayerCore } from '@world-studio/player-core';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { PlayerShell } from './PlayerShell';
import { createWorldPlayerSaveSlotV3, type WorldPlayerSaveSlotV3, type WorldPlayerSaveStoreV3 } from './player-save-store';

function fixture() {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'title_load', title: '继续故事', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: '开始', statements: [
    { id: 'line', kind: 'narration', textId: 'text', text: '仍在原来的故事里。' }, { id: 'end', kind: 'end', endingName: '结束' }
  ] }] }).files);
  const state = startPlayerCore(createPlayerCore(project), project), snapshot = createPlayerCoreSnapshotV1(state), saved = createPlayerCoreSessionSaveV1(state);
  if (!saved.ok) throw Error('fixture');
  const slot = createWorldPlayerSaveSlotV3({ projectId: project.manifest.projectId, buildId: state.runtimeState!.buildId, savedAtEpochMilliseconds: 1000,
    title: snapshot.title, sceneId: state.runtimeState!.cursor.sceneId, presentationKind: snapshot.presentation.kind, runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: saved.artifactHash,
    serializedSessionSave: saved.serialized, slotId: 'quick-1', kind: 'quick', chapterId: null, chapterTitle: null, sceneTitle: '开始', route: null, customMetadata: {}, preview: { status: 'unavailable', reason: 'capture-unavailable' }, checkpointStepId: null });
  let resolve!: (slot: WorldPlayerSaveSlotV3 | null) => void;
  const store: WorldPlayerSaveStoreV3 = { version: '3.0.0', backend: 'delayed-test', async list() { return [slot]; }, read() { return new Promise(done => { resolve = done; }); }, async readPreview() { return null; }, async write() {} };
  return { project, slot, store, finish: (value: WorldPlayerSaveSlotV3 | null) => resolve(value) };
}

it.each(['success', 'failure'] as const)('keeps the title and keyboard stable while a recent save is pending: %s', async outcome => {
  const data = fixture(), view = render(<PlayerShell project={data.project} saveStore={data.store} />);
  fireEvent.click(await screen.findByRole('button', { name: /继续最近存档/ }));
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent('正在校验存档');
  expect(screen.getByRole('button', { name: /开始故事/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: '打开附加内容' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '读取存档' })).toBeDisabled();
  expect(screen.queryByText('按 Enter 或空格开始')).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Enter' }); fireEvent.keyDown(window, { key: ' ' });
  expect(view.container.querySelector('main')).toHaveAttribute('data-player-status', 'title');
  await act(async () => { data.finish(outcome === 'success' ? data.slot : null); });
  if (outcome === 'success') {
    await screen.findByText('存档已读取，继续当前故事');
    expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash', data.slot.runtimeStateHash);
  } else {
    await screen.findByText('存档损坏或与当前构建不兼容');
    fireEvent.click(screen.getByRole('button', { name: '关闭存读档' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /开始故事/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
    expect(view.container.querySelector('main')).not.toHaveAttribute('data-player-status', 'title');
  }
});

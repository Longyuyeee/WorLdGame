import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { loadProject, migrateS0Project, sha256 } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import { createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1 } from '@world-studio/player-core';
import { PlayerShell } from './PlayerShell';
import { IndexedDbWorldPlayerSaveStoreV3 } from './player-save-store';
import { IndexedDbWorldPlayerRecoveryStoreV1, createWorldPlayerRecoveryRecordV1 } from './player-recovery-store';
import { storeReadingResume, readReadingResume } from './reading-resume-store';
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
const text = '雨声里，她继续读那封还没有写完的信。'.repeat(60);
function project() {
  const p = loadProject(migrateS0Project({ schemaVersion: 0, id: 'reading_resume', title: 'Reading', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [{ id: 'one', kind: 'narration', textId: 'one_text', text }, { id: 'two', kind: 'narration', textId: 'two_text', text: '下一段' }, { id: 'end', kind: 'end', endingName: '结束' }] }] }).files);
  return { ...p, settings: withProjectSettings(p.settings, { text: { revealMode: 'instant' } }) };
}
function geometry(element: HTMLElement) {
  let top = element.scrollTop;
  Object.defineProperties(element, { clientWidth: { configurable: true, get: () => 300 }, clientHeight: { configurable: true, get: () => 200 }, scrollHeight: { configurable: true, get: () => 1600 }, scrollTop: { configurable: true, get: () => top, set: value => { top = Math.max(0, Math.min(1400, value)); } } });
  fireEvent.resize(window);
  return { scroll(value: number) { element.scrollTop = value; fireEvent.scroll(element); }, get top() { return top; } };
}
function context(p = project()) {
  const core = startPlayerCore(createPlayerCore(p), p);
  const saved = createPlayerCoreSessionSaveV1(core); if (!saved.ok) throw Error('fixture');
  return { core, saved, mark: { projectId: core.projectId, buildId: core.runtimeState!.buildId, runtimeStateHash: core.historySession!.checkpoints[core.historySession!.cursor]!.stateHash, locale: core.localization.selectedLocale, textHash: sha256(text) } };
}
async function setup() {
  const p = project(), factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory), view = render(<PlayerShell project={p} saveStore={store} />);
  fireEvent.click(view.getByRole('button', { name: '开始故事' })); await act(async () => {});
  const paragraph = view.getByRole('button', { name: '继续下一句' }), layout = geometry(paragraph);
  return { ...view, p, store, paragraph, layout, main: () => view.container.querySelector('main')! };
}
async function save(f: Awaited<ReturnType<typeof setup>>) {
  fireEvent.click(f.getByRole('button', { name: '快速保存' })); await waitFor(() => expect(f.main()).toHaveAttribute('data-save-operation', 'saved'));
}
async function load(f: Awaited<ReturnType<typeof setup>>) {
  fireEvent.click(f.getByRole('button', { name: '快速读取' })); fireEvent.click(f.getByRole('button', { name: '确认读取' }));
  await waitFor(() => expect(f.main()).toHaveAttribute('data-save-operation', 'loaded'));
}
it('flushes a just-scrolled position before an explicit same-paragraph load, then allows restarting at the top', async () => {
  const f = await setup(); await save(f); const slot = await f.store.read(f.p.manifest.projectId, 'quick-1');
  f.layout.scroll(420); await load(f); expect(f.layout.top).toBe(420); expect(f.getByText('已回到本机记录的阅读位置')).toBeInTheDocument();
  expect(f.main()).toHaveAttribute('data-reading-unread-below', 'true'); expect(f.main()).toHaveAttribute('data-auto-playback', 'off');
  fireEvent.click(f.getByRole('button', { name: '从段首重读' })); expect(f.layout.top).toBe(0); expect(f.main()).toHaveAttribute('data-reading-position-restored', 'false');
  expect(await f.store.read(f.p.manifest.projectId, 'quick-1')).toEqual(slot);
});
it('flushes on pagehide and restores after unmount/remount without changing the formal slot', async () => {
  const f = await setup(); await save(f); f.layout.scroll(620); fireEvent(window, new Event('pagehide')); const slot = await f.store.read(f.p.manifest.projectId, 'quick-1'); f.unmount();
  const view = render(<PlayerShell project={f.p} saveStore={f.store} />);
  fireEvent.click(view.getByRole('button', { name: '开始故事' })); await act(async () => {}); const paragraph = view.getByRole('button', { name: '继续下一句' }), g = geometry(paragraph);
  await waitFor(() => expect(view.getByRole('button', { name: '快速读取' })).toBeEnabled()); fireEvent.click(view.getByRole('button', { name: '快速读取' })); fireEvent.click(view.getByRole('button', { name: '确认读取' })); await waitFor(() => expect(view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'loaded'));
  expect(g.top).toBe(620); expect(await f.store.read(f.p.manifest.projectId, 'quick-1')).toEqual(slot);
});
it('does not restore a cached mark just by starting a story or navigating history', async () => {
  const ctx = context(); storeReadingResume(localStorage, { ...ctx.mark, anchor: { kind: 'pixel', top: 500 } });
  const f = await setup(); expect(f.layout.top).toBe(0); expect(f.main()).toHaveAttribute('data-reading-position-restored', 'false');
  f.layout.scroll(1400); fireEvent.click(f.paragraph); fireEvent.click(f.getByRole('button', { name: '后退一步' })); expect(f.layout.top).toBe(0);
});
it('keeps a validated story readable when optional local storage is denied', async () => {
  const f = await setup(); await save(f); f.layout.scroll(420);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('denied'); }); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
  await load(f); expect(f.layout.top).toBe(0); expect(f.queryByText('已回到本机记录的阅读位置')).toBeNull(); expect(f.getByText(text, { exact: true })).toBeInTheDocument();
});
it('ignores marks for another text or language after a validated load', async () => {
  const f = await setup(); await save(f); const ctx = context(f.p);
  storeReadingResume(localStorage, { ...ctx.mark, textHash: 'f'.repeat(64), anchor: { kind: 'pixel', top: 500 } });
  await load(f); expect(f.layout.top).toBe(0); expect(f.main()).toHaveAttribute('data-reading-position-restored', 'false');
});
it.each([false, true])('resumes an independent recovery from the saved hash and reveals restored text (typewriter %s)', async typewriter => {
  const base = project(), p = typewriter ? { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'typewriter' } }) } : base;
  const ctx = context(p), factory = new IDBFactory(), recovery = new IndexedDbWorldPlayerRecoveryStoreV1(factory);
  await recovery.write(createWorldPlayerRecoveryRecordV1({ projectId: ctx.mark.projectId, buildId: ctx.mark.buildId, runtimeStateHash: ctx.mark.runtimeStateHash, sessionArtifactHash: ctx.saved.artifactHash, serializedSessionSave: ctx.saved.serialized, savedAtEpochMilliseconds: 10, title: ctx.core.title, sceneId: 'main', presentationKind: 'narration' }));
  storeReadingResume(localStorage, { ...ctx.mark, anchor: { kind: 'pixel', top: 500 } });
  // Geometry must be available before the first reading layout effect.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300); vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200); vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1600);
  const view = render(<PlayerShell project={p} recoveryStore={recovery} />);
  await waitFor(() => expect(view.getByRole('button', { name: '恢复上次进度' })).toBeEnabled()); fireEvent.click(view.getByRole('button', { name: '恢复上次进度' }));
  await waitFor(() => expect(view.container.querySelector('main')).toHaveAttribute('data-recovery-operation', 'loaded'));
  expect(view.getByRole('button', { name: '继续下一句' }).scrollTop).toBe(500); expect(view.getByText('已回到本机记录的阅读位置')).toBeInTheDocument();
  expect(view.getByRole('button', { name: '继续下一句' })).toHaveAttribute('data-text-ready', 'true');
  expect(readReadingResume(localStorage, ctx.mark)).toEqual({ kind: 'pixel', top: 500 });
});

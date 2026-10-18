import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import { IndexedDbWorldPlayerSaveStoreV3 } from './player-save-store';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
async function setup() {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const demo = createPlayerMediaMultichannelDemoV1(), script = demo.project.scripts.media_stage!;
  const project = { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: 'instant' }, history: { allowForwardAfterBack: false } }), scripts: { ...demo.project.scripts, media_stage: { ...script, statements: script.statements.flatMap(s => s.kind === 'end' ? [{ id: 'next', kind: 'narration' as const, textId: 'next_text', text: '继续读这一段。' }, s] : [s]) } } };
  const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()), props = { project, mediaAssets: demo.mediaAssets, saveStore: store };
  const view = render(<PlayerShell {...props} />);
  fireEvent.click(view.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  return { ...view, props, store, main: () => view.container.querySelector('main')!, voice: () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!, bgm: () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="bgm"]')! };
}
async function save(f: Awaited<ReturnType<typeof setup>>) {
  fireEvent.click(f.getByRole('button', { name: '快速保存' })); await waitFor(() => expect(f.main()).toHaveAttribute('data-save-operation', 'saved'));
}
async function load(f: Awaited<ReturnType<typeof setup>>) {
  fireEvent.click(f.getByRole('button', { name: '快速读取' })); fireEvent.click(f.getByRole('button', { name: '确认读取' }));
  await waitFor(() => expect(f.main()).toHaveAttribute('data-save-operation', 'loaded'));
}
it('restarts the current voice after a validated same-paragraph load, not healthy music or the formal slot', async () => {
  const f = await setup(); await save(f); const old = f.voice(), music = f.bgm(), slot = await f.store.read(f.props.project.manifest.projectId, 'quick-1');
  fireEvent.ended(old); await load(f);
  expect(f.voice()).not.toBe(old); expect(f.voice().dataset.voiceCompleted).not.toBe('true'); expect(f.bgm()).toBe(music);
  expect(await f.store.read(f.props.project.manifest.projectId, 'quick-1')).toEqual(slot); expect(f.main()).toHaveAttribute('data-auto-playback', 'off');
});
it('restarts voice on a successful historical move even if the asset stays the same, not on a blocked move', async () => {
  const f = await setup(), first = f.voice(); fireEvent.ended(first);
  fireEvent.click(f.getByRole('button', { name: '继续下一句' })); const second = f.voice();
  fireEvent.click(f.getByRole('button', { name: '后退一步' })); expect(f.voice()).not.toBe(second);
  const restored = f.voice(); expect(f.getByRole('button', { name: '前进一步' })).toBeDisabled(); fireEvent.click(f.getByRole('button', { name: '前进一步' }));
  expect(f.voice()).toBe(restored);
});
it('rejects a late native play event while suspended instead of reviving sound or voice ducking', async () => {
  const f = await setup(), voice = f.voice(), gain = f.bgm().volume;
  f.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); const paused = vi.mocked(voice.pause).mock.calls.length;
  fireEvent.play(voice); expect(voice.pause).toHaveBeenCalledTimes(paused + 1); expect(voice.dataset.playerPlayback).toBe('suspended');
  expect(f.bgm().volume).toBe(gain);
});
it('starts a partially heard voice from the beginning after a validated load, releasing only the old voice', async () => {
  const f = await setup(); await save(f); const old = f.voice(), music = f.bgm(); old.currentTime = 1.2; fireEvent.play(old);
  await load(f); await act(async () => {});
  expect(f.voice()).not.toBe(old); expect(f.voice().currentTime).toBe(0); expect(old).not.toHaveAttribute('src'); expect(f.bgm()).toBe(music);
});
it('keeps the current voice when a slot fails validation', async () => {
  const f = await setup(); await save(f); const old = f.voice(), slot = await f.store.read(f.props.project.manifest.projectId, 'quick-1');
  old.currentTime = 1; vi.spyOn(f.store, 'read').mockResolvedValue({ ...slot!, sessionArtifactHash: '0'.repeat(64) });
  fireEvent.click(f.getByRole('button', { name: '快速读取' })); fireEvent.click(f.getByRole('button', { name: '确认读取' }));
  await waitFor(() => expect(f.main()).toHaveAttribute('data-save-operation', 'error'));
  expect(f.voice()).toBe(old); expect(old.currentTime).toBe(1);
});
it('relistens explicitly from the menu without touching music, story, reading position, slot or preferences', async () => {
  const f = await setup(); await save(f); const voice = f.voice(), music = f.bgm(), hash = f.main().dataset.runtimeStateHash;
  const slot = await f.store.read(f.props.project.manifest.projectId, 'quick-1'), preferences = JSON.stringify(localStorage);
  voice.currentTime = 1; fireEvent.ended(voice); fireEvent.click(f.getByRole('button', { name: '自动播放' }));
  const paragraph = f.getByRole('button', { name: '继续下一句' }); paragraph.scrollTop = 80;
  fireEvent.click(f.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(f.getByRole('button', { name: '重听当前语音' })); await act(async () => {});
  expect(f.voice()).toBe(voice); expect(voice.currentTime).toBe(0); expect(voice.dataset.voiceCompleted).toBe('false'); expect(f.bgm()).toBe(music);
  expect(f.main().dataset.runtimeStateHash).toBe(hash); expect(paragraph.scrollTop).toBe(80); expect(f.main()).toHaveAttribute('data-auto-playback', 'off');
  expect(f.queryByRole('dialog', { name: '阅读菜单' })).toBeNull(); expect(paragraph).toHaveFocus();
  expect(await f.store.read(f.props.project.manifest.projectId, 'quick-1')).toEqual(slot); expect(JSON.stringify(localStorage)).toBe(preferences);
});
it('keeps the same sound position through repeated suspension, never replaying completed voice on return', async () => {
  const f = await setup(), voice = f.voice(), music = f.bgm(); voice.currentTime = 1; voice.play = vi.fn().mockResolvedValue(undefined);
  for (let i = 0; i < 3; i++) {
    f.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); fireEvent.canPlay(voice);
    f.rerender(<PlayerShell {...f.props} hostActivity="active" />); await act(async () => {});
    expect(f.voice()).toBe(voice); expect(voice.currentTime).toBe(1); expect(f.bgm()).toBe(music);
  }
  fireEvent.ended(voice); const plays = vi.mocked(voice.play).mock.calls.length;
  f.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); f.rerender(<PlayerShell {...f.props} hostActivity="active" />); await act(async () => {});
  expect(voice.play).toHaveBeenCalledTimes(plays);
});
it('offers session-only silent reading after permission denial without marking the file broken or advancing', async () => {
  const f = await setup(), hash = f.main().dataset.runtimeStateHash, preferences = JSON.stringify(localStorage);
  f.voice().play = vi.fn().mockRejectedValue(new DOMException('gesture', 'NotAllowedError')); fireEvent.canPlay(f.voice()); await act(async () => {});
  expect(f.queryByRole('alert')).toBeNull(); fireEvent.click(f.getByRole('button', { name: '本次先无声阅读' }));
  expect(f.main()).toHaveAttribute('data-audio-mode', 'silent'); expect(f.main()).toHaveAttribute('data-auto-playback', 'off');
  expect(f.main().dataset.runtimeStateHash).toBe(hash); expect(JSON.stringify(localStorage)).toBe(preferences);
});
it.each(['打开阅读菜单', '打开剧情历史', '存读档'] as const)('does not cover %s with playback-recovery actions', async name => {
  const f = await setup(); f.voice().play = vi.fn().mockRejectedValue(new DOMException('gesture', 'NotAllowedError')); fireEvent.canPlay(f.voice()); await act(async () => {});
  expect(f.getByRole('button', { name: '恢复声音' })).toBeInTheDocument(); fireEvent.click(f.getByRole('button', { name }));
  expect(f.queryByRole('button', { name: '恢复声音' })).toBeNull(); expect(f.container.querySelector('.player-audio-recovery')).toBeNull();
});
it('allows an explicit silent-reading decision from the menu even when native playback stalls without an error', async () => {
  const f = await setup(), hash = f.main().dataset.runtimeStateHash;
  f.voice().play = vi.fn(() => new Promise<void>(() => {})); fireEvent.canPlay(f.voice());
  fireEvent.click(f.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(f.getByRole('button', { name: '本次先无声阅读' }));
  await act(async () => {});
  expect(f.main()).toHaveAttribute('data-audio-mode', 'silent'); expect(f.main().dataset.runtimeStateHash).toBe(hash);
  expect(f.queryByRole('dialog', { name: '阅读菜单' })).toBeNull(); expect(f.getByRole('button', { name: '继续下一句' })).toHaveFocus();
});

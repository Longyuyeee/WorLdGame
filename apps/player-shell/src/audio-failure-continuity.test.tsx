import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import { IndexedDbWorldPlayerSaveStoreV3 } from './player-save-store';
let paused: WeakMap<HTMLMediaElement, boolean>;
beforeEach(() => {
  paused = new WeakMap();
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) { return paused.get(this) ?? true; });
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) { paused.set(this, true); this.dispatchEvent(new Event('pause')); });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) { paused.set(this, true); });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { paused.set(this, false); this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')); return Promise.resolve(); });
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
async function setup() {
  const demo = createPlayerMediaMultichannelDemoV1(), project = { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: 'instant' } }) };
  const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()), props = { project, mediaAssets: demo.mediaAssets, saveStore: store };
  const view = render(<PlayerShell {...props} />); fireEvent.click(screen.getByRole('button', { name: '开始故事' })); await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: '快速保存' })); await waitFor(() => expect(view.container.querySelector('main')).toHaveAttribute('data-save-operation', 'saved'));
  const track = (bus: string) => view.container.querySelector<HTMLAudioElement>(`audio[data-audio-bus="${bus}"]`)!;
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash, slot = await store.read(project.manifest.projectId, 'quick-1');
  return { view, props, store, track, hash, slot };
}
function fail(element: HTMLAudioElement) { Object.defineProperty(element, 'error', { configurable: true, value: { code: 4 } }); fireEvent.error(element); }
const playsFor = (element: HTMLAudioElement) => vi.mocked(HTMLMediaElement.prototype.play).mock.contexts.filter(owner => owner === element).length;
async function unchanged(f: Awaited<ReturnType<typeof setup>>) { expect(f.view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(f.hash); expect(await f.store.read(f.props.project.manifest.projectId, 'quick-1')).toEqual(f.slot); }
it.each(['voice', 'bgm'])('keeps %s decoding failure and explicit retry across suspension and return', async bus => {
  const f = await setup(), broken = f.track(bus), healthy = f.track(bus === 'voice' ? 'bgm' : 'voice'); healthy.currentTime = .6; fail(broken);
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument();
  f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); f.view.rerender(<PlayerShell {...f.props} hostActivity="active" />); await act(async () => {});
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' })); expect(screen.getByRole('button', { name: '重试媒体' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试媒体' })); await act(async () => {}); expect(f.track(bus)).not.toBe(broken); expect(broken).not.toHaveAttribute('src'); expect(f.track(bus === 'voice' ? 'bgm' : 'voice')).toBe(healthy); expect(healthy.currentTime).toBe(.6); await unchanged(f);
});
it('retains the failed live voice after auditioning history and returning to the current line', async () => {
  const f = await setup(), voice = f.track('voice'), music = f.track('bgm'); fail(voice);
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '打开剧情历史' })); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ })); await act(async () => {});
  fireEvent.click(within(screen.getByRole('dialog', { name: '剧情历史' })).getByRole('button', { name: '关闭剧情历史' })); await act(async () => {});
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument(); expect(f.track('voice')).toBe(voice); expect(voice.dataset.playerPlayback).toBe('error'); expect(f.track('bgm')).toBe(music); await unchanged(f);
});
it.each(['voice', 'bgm'])('keeps a failed %s owner through skip start and stop without replaying it', async bus => {
  const f = await setup(), broken = f.track(bus); fail(broken); const calls = playsFor(broken); vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: '快进全部' })); expect(broken.dataset.playerPlayback).toBe('error');
  fireEvent.click(screen.getByRole('button', { name: '快进全部' })); await act(async () => {}); expect(broken.dataset.playerPlayback).toBe('error'); expect(playsFor(broken)).toBe(calls); expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument(); vi.useRealTimers(); await unchanged(f);
});
it('preserves a play-promise media failure with no native MediaError across background and history', async () => {
  const f = await setup(), voice = f.track('voice'); voice.play = vi.fn().mockRejectedValue(new DOMException('codec', 'NotSupportedError'));
  fireEvent.canPlay(voice); // The native fixture is already playing; request an explicit replay.
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '重听当前语音' })); await act(async () => {});
  expect(voice.error ?? null).toBeNull(); expect(voice.dataset.voiceFailed).toBe('true');
  f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); f.view.rerender(<PlayerShell {...f.props} hostActivity="active" />); await act(async () => {});
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '打开剧情历史' })); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ })); await act(async () => {});
  fireEvent.click(within(screen.getByRole('dialog', { name: '剧情历史' })).getByRole('button', { name: '关闭剧情历史' })); expect(voice.dataset.playerPlayback).toBe('error'); expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument(); await unchanged(f);
});
it.each(['play', 'playing', 'ended', 'canplay'])('does not let a stale %s event reclassify or complete a failed live voice', async type => {
  const f = await setup(), voice = f.track('voice'), music = f.track('bgm'); fail(voice); const calls = playsFor(voice), gain = music.volume;
  voice.dispatchEvent(new Event(type)); await act(async () => {});
  expect(voice.dataset.playerPlayback).toBe('error'); expect(voice.dataset.voiceFailed).toBe('true'); expect(voice.dataset.voiceCompleted).not.toBe('true'); expect(playsFor(voice)).toBe(calls); expect(music.volume).toBe(gain); expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument(); await unchanged(f);
});
it('keeps the original failure during repeated host interruptions without an implicit retry', async () => {
  const f = await setup(), voice = f.track('voice'); fail(voice); const calls = playsFor(voice);
  for (let i = 0; i < 3; i++) { f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); f.view.rerender(<PlayerShell {...f.props} hostActivity="active" />); await act(async () => {}); expect(voice.dataset.playerPlayback).toBe('error'); }
  expect(playsFor(voice)).toBe(calls); await unchanged(f);
});
it('allows explicit silent reading after failure survives an interruption and restores only through a new owner', async () => {
  const f = await setup(), voice = f.track('voice'), personal = JSON.stringify(localStorage); fail(voice);
  f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); f.view.rerender(<PlayerShell {...f.props} hostActivity="active" />); await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' })); fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); await act(async () => {}); expect(f.view.container.querySelector('audio')).toBeNull(); expect(voice).not.toHaveAttribute('src');
  fireEvent.click(screen.getByRole('button', { name: '恢复当前声音' })); await act(async () => {}); expect(f.track('voice')).not.toBe(voice); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull(); expect(JSON.stringify(localStorage)).toBe(personal); await unchanged(f);
});
it('treats an explicitly replaced URL under the same asset ID as a fresh owner, not the retired failure', async () => {
  const f = await setup(), old = f.track('voice'), music = f.track('bgm'); fail(old);
  const nextMedia = f.props.mediaAssets.map(source => source.assetId === old.dataset.assetId ? { ...source, url: `${source.url}#replaced-source` } : source);
  f.view.rerender(<PlayerShell {...f.props} mediaAssets={nextMedia} />); await act(async () => {}); fireEvent.canPlay(f.track('voice')); await act(async () => {});
  expect(f.track('voice')).not.toBe(old); expect(f.track('voice').dataset.voiceFailed).not.toBe('true'); expect(f.track('voice').paused).toBe(false); expect(old).not.toHaveAttribute('src');
  // This fixture deliberately shares one asset in two buses: both sources
  // changed. Other cases above protect genuinely unchanged healthy tracks.
  expect(f.track('bgm')).not.toBe(music); expect(music).not.toHaveAttribute('src'); await unchanged(f);
});

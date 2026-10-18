import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { withProjectSettings } from '@world-studio/gal-settings';
import { createPlayerMediaMultichannelDemoV1, createPlayerLocalizedMediaDemoV1 } from './media-demo';
import { PlayerShell } from './PlayerShell';
import { IndexedDbWorldPlayerSaveStoreV3 } from './player-save-store';
import { useHistoryVoice } from './use-history-voice';

let paused: WeakMap<HTMLMediaElement, boolean>, ended: WeakMap<HTMLMediaElement, boolean>;
beforeEach(() => {
  paused = new WeakMap(); ended = new WeakMap();
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) { return paused.get(this) ?? true; });
  vi.spyOn(HTMLMediaElement.prototype, 'ended', 'get').mockImplementation(function (this: HTMLMediaElement) { return ended.get(this) ?? false; });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) { paused.set(this, true); this.dispatchEvent(new Event('pause')); });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) { paused.set(this, true); ended.set(this, false); this.currentTime = 0; });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { paused.set(this, false); this.dispatchEvent(new Event('play')); return Promise.resolve(); });
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
async function setup(localized = false, resume = true) {
  const demo = localized ? createPlayerLocalizedMediaDemoV1() : createPlayerMediaMultichannelDemoV1(), base = demo.project;
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' }, audio: { resumeAfterInterruption: resume } }), scripts: { ...base.scripts, media_stage: { ...base.scripts.media_stage!, statements: base.scripts.media_stage!.statements.flatMap(row => row.kind === 'end' ? [
    { id: 'next', kind: 'narration' as const, textId: 'next_text', text: '下一段旁白' }, row
  ] : [row]) } } };
  const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()), props = { project, mediaAssets: demo.mediaAssets, saveStore: store };
  const view = render(<PlayerShell {...props} />); fireEvent.click(screen.getByRole('button', { name: '开始故事' })); await act(async () => {});
  const main = () => view.container.querySelector('main')!, voice = () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
  fireEvent.canPlay(voice()); await act(async () => {});
  const open = () => { fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '打开剧情历史' })); };
  const audition = () => view.container.querySelector<HTMLAudioElement>('audio[data-history-voice]')!;
  return { view, props, store, main, voice, open, audition };
}
it('relistens a past line without rewinding the story, rewriting a slot or changing read knowledge/preferences', async () => {
  const f = await setup(), originalCursor = Number(f.main().dataset.historyCursor); ended.set(f.voice(), true); fireEvent.ended(f.voice()); fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); expect(Number(f.main().dataset.historyCursor)).toBeGreaterThan(originalCursor);
  fireEvent.click(screen.getByRole('button', { name: '快速保存' })); await waitFor(() => expect(f.main()).toHaveAttribute('data-save-operation', 'saved'));
  await waitFor(() => expect(Object.keys(localStorage).some(key => key.startsWith('world-player.collection.v1:') && localStorage.getItem(key)?.includes('next_text'))).toBe(true));
  const before = f.main().dataset.runtimeStateHash, cursor = f.main().dataset.historyCursor, slot = await f.store.read(f.props.project.manifest.projectId, 'quick-1'), preferences = JSON.stringify(localStorage);
  f.open(); fireEvent.click(screen.getByRole('button', { name: '重听语音：Every cue must remain ordered.' })); await act(async () => {});
  expect(within(f.view.container.querySelector<HTMLElement>('.player-history-panel-body')!).getByRole('region', { name: '历史语音重听' })).toBeInTheDocument();
  expect(f.audition().paused).toBe(false); expect(f.audition().volume).toBeCloseTo(.8); expect(screen.getByRole('region', { name: '历史语音重听' })).toHaveTextContent('正在重听');
  expect(f.main().dataset.runtimeStateHash).toBe(before); expect(f.main().dataset.historyCursor).toBe(cursor); expect(await f.store.read(f.props.project.manifest.projectId, 'quick-1')).toEqual(slot); expect(JSON.stringify(localStorage)).toBe(preferences);
});
it('temporarily pauses only the live voice, keeps music and resumes that same voice position on close', async () => {
  const f = await setup(), voice = f.voice(), music = f.view.container.querySelector('audio[data-audio-bus="bgm"]')!; voice.currentTime = 1.2; const plays = vi.mocked(voice.play).mock.calls.length;
  f.open(); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ })); await act(async () => {});
  expect(voice.paused).toBe(true); expect(voice.currentTime).toBe(1.2); expect(f.view.container.querySelector('audio[data-audio-bus="bgm"]')).toBe(music);
  const preview = f.audition(); fireEvent.click(within(screen.getByRole('dialog', { name: '剧情历史' })).getByRole('button', { name: '关闭剧情历史' })); await act(async () => {});
  expect(preview.paused).toBe(true); expect(preview).not.toHaveAttribute('src'); expect(f.voice()).toBe(voice); expect(voice.currentTime).toBe(1.2); expect(voice.paused).toBe(false); expect(vi.mocked(voice.play).mock.calls.length).toBeGreaterThan(plays);
});
it('leaves policy-paused current sound for explicit recovery and rejects its late play event', async () => {
  const f = await setup(false, false), voice = f.voice(); f.open(); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ }));
  fireEvent.click(within(screen.getByRole('dialog', { name: '剧情历史' })).getByRole('button', { name: '关闭剧情历史' })); await act(async () => {}); expect(voice.paused).toBe(true);
  fireEvent.play(voice); expect(voice.paused).toBe(true); fireEvent.click(screen.getByRole('button', { name: '恢复声音' })); await act(async () => {}); expect(voice.paused).toBe(false);
});
it('keeps Auto suspended during audition and does not mark the current voice complete', async () => {
  const f = await setup(); fireEvent.click(screen.getByRole('button', { name: '自动播放' })); const before = f.main().dataset.runtimeStateHash; f.open(); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ }));
  ended.set(f.audition(), true); fireEvent.ended(f.audition()); expect(f.main()).toHaveAttribute('data-auto-playback', 'suspended'); expect(f.voice().dataset.voiceCompleted).not.toBe('true'); expect(f.main().dataset.runtimeStateHash).toBe(before);
});
it('does not replay the live voice that had already finished before audition', async () => {
  const f = await setup(), voice = f.voice(); ended.set(voice, true); paused.set(voice, true); fireEvent.ended(voice); const calls = () => vi.mocked(HTMLMediaElement.prototype.play).mock.contexts.filter(owner => owner === voice).length, before = calls();
  f.open(); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ })); fireEvent.click(within(screen.getByRole('dialog', { name: '剧情历史' })).getByRole('button', { name: '关闭剧情历史' })); await act(async () => {}); expect(calls()).toBe(before);
});
it('uses the existing localized text-to-voice mapping, not the live stage source', async () => {
  const f = await setup(true); f.open(); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ })); await act(async () => {}); expect(f.audition().src).toBe(f.props.mediaAssets.find(asset => asset.assetId === 'media_voice_en')!.url);
});
it('does not restart a preview after host suspension and requires an explicit resume', async () => {
  const f = await setup(); f.open(); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ })); await act(async () => {}); const audio = f.audition();
  f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); expect(audio.paused).toBe(true); expect(screen.getByRole('button', { name: '继续重听' })).toBeDisabled();
  fireEvent.play(audio); expect(audio.paused).toBe(true); f.view.rerender(<PlayerShell {...f.props} />); expect(audio.paused).toBe(true); fireEvent.click(screen.getByRole('button', { name: '继续重听' })); await act(async () => {}); expect(audio.paused).toBe(false);
});
it('respects personal mute without silently changing the preference', async () => {
  const f = await setup(); fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '打开玩家设置' })); fireEvent.click(screen.getByRole('checkbox', { name: '静音全部声音' })); fireEvent.click(screen.getByRole('button', { name: '返回故事' }));
  const preferences = JSON.stringify(localStorage); f.open(); fireEvent.click(screen.getByRole('button', { name: /^重听语音：/ })); expect(f.audition().muted).toBe(true); expect(screen.getByRole('region', { name: '历史语音重听' })).toHaveTextContent('当前声音已静音'); expect(JSON.stringify(localStorage)).toBe(preferences);
});
it('returns keyboard focus to the initiating row after stopping, or search if that row was filtered out', async () => {
  const f = await setup(); f.open(); const trigger = screen.getByRole('button', { name: /^重听语音：/ }); fireEvent.click(trigger); fireEvent.click(screen.getByRole('button', { name: '停止重听' })); await act(async () => {}); expect(trigger).toHaveFocus();
  fireEvent.click(trigger); fireEvent.change(screen.getByRole('searchbox'), { target: { value: '不存在的句子' } }); fireEvent.click(screen.getByRole('button', { name: '停止重听' })); await act(async () => {}); expect(screen.getByRole('searchbox')).toHaveFocus();
});
function Preview({ active = true }: { active?: boolean }) {
  const demo = createPlayerMediaMultichannelDemoV1(), source = demo.mediaAssets.find(asset => asset.assetId === 'media_theme')!, audition = useHistoryVoice({ active, muted: false, volume: .5 });
  return <><button onClick={() => audition.play({ source, volume: .8 }, '过去的一句')}>听第一句</button><button onClick={() => audition.play({ source, volume: .4 }, '另一句')}>听另一句</button>{audition.player}</>;
}
it('uses one owner when changing clips, with independent authored and personal gain', async () => {
  const view = render(<Preview />); fireEvent.click(screen.getByRole('button', { name: '听第一句' })); await act(async () => {}); const audio = view.container.querySelector('audio')!; expect(audio.volume).toBeCloseTo(.4);
  fireEvent.click(screen.getByRole('button', { name: '听另一句' })); await act(async () => {}); expect(view.container.querySelectorAll('audio')).toHaveLength(1); expect(audio.currentTime).toBe(0); expect(audio.volume).toBeCloseTo(.2);
  fireEvent.click(screen.getByRole('button', { name: '停止重听' })); expect(audio).not.toHaveAttribute('src'); expect(screen.queryByRole('region', { name: '历史语音重听' })).toBeNull();
});
it.each(['NotAllowedError', 'NotSupportedError'])('offers explicit retry after %s without changing the story', async name => {
  render(<Preview />); vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('injected', name)); fireEvent.click(screen.getByRole('button', { name: '听第一句' })); await act(async () => {});
  const region = screen.getByRole('region', { name: '历史语音重听' }); expect(region).toHaveTextContent(name === 'NotAllowedError' ? '浏览器阻止' : '暂时无法播放'); fireEvent.click(within(region).getByRole('button', { name: name === 'NotAllowedError' ? '继续重听' : '重试重听' })); await act(async () => {}); expect(region).toHaveTextContent('正在重听');
});
it('bounds a pending play request and rejects a late play after stop or unmount', async () => {
  vi.useFakeTimers(); const view = render(<Preview />); vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise(() => {})); fireEvent.click(screen.getByRole('button', { name: '听第一句' })); const audio = view.container.querySelector('audio')!;
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); }); expect(screen.getByRole('region', { name: '历史语音重听' })).toHaveTextContent('尚未就绪'); fireEvent.play(audio); expect(audio.paused).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '停止重听' })); fireEvent.play(audio); expect(audio.paused).toBe(true); view.unmount(); expect(audio).not.toHaveAttribute('src');
});

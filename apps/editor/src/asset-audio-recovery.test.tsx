import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createBlobDigest, type AssetIndexEntry } from '@world-studio/project-persistence';
import { AssetAudioPreview, AUDIO_PREPARE_TIMEOUT_MS, AUDIO_PROGRESS_TIMEOUT_MS } from './asset-audio-preview';

const bytes = new Uint8Array([1, 2, 3]), digest = createBlobDigest(bytes);
const hash = () => new Uint8Array(digest.slice(7).match(/../gu)!.map(value => parseInt(value, 16))).buffer;
const entry: AssetIndexEntry = { assetId: 'voice', displayName: '对白', kind: 'audio', tags: [], source: { digest, byteLength: 3, mimeType: 'audio/wav' }, preservedFields: { inspection: { status: 'pass' } } };
function setup(read: () => Promise<Uint8Array | null> = async () => bytes) {
  vi.useFakeTimers();
  const create = vi.fn(() => `blob:audio-${Math.random()}`), revoke = vi.fn();
  vi.stubGlobal('URL', class extends URL { static override createObjectURL = create; static override revokeObjectURL = revoke; });
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async () => hash()) } });
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => new Promise(() => {}));
  const reader = { read: vi.fn(read) }, view = render(<AssetAudioPreview entry={entry} reader={reader} />);
  return { create, revoke, pause, play, reader, view };
}
const flush = () => act(async () => {});
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const audio = () => screen.getByLabelText('试听 对白') as HTMLAudioElement;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('bounds a pending repository read and ignores late bytes until an explicit retry', async () => {
  let finish!: (value: Uint8Array) => void;
  const f = setup(() => new Promise(resolve => { finish = resolve; })); await flush();
  await tick(AUDIO_PREPARE_TIMEOUT_MS); expect(screen.getByRole('status')).toHaveTextContent('音频准备超时');
  await act(async () => finish(bytes)); expect(f.create).not.toHaveBeenCalled();
  f.reader.read.mockResolvedValue(bytes); click('重新准备试听'); await flush(); expect(audio()).toHaveAttribute('preload', 'none'); expect(f.play).not.toHaveBeenCalled();
});
it('lets the user cancel preparation without creating a late object URL', async () => {
  let finish!: (value: Uint8Array) => void; const f = setup(() => new Promise(resolve => { finish = resolve; })); await flush();
  click('取消准备试听'); await act(async () => finish(bytes)); await tick(AUDIO_PREPARE_TIMEOUT_MS);
  expect(screen.getByRole('status')).toHaveTextContent('已取消'); expect(f.create).not.toHaveBeenCalled();
});
it('bounds a pending digest as well as the read', async () => {
  const f = setup(); let finish!: (value: ArrayBuffer) => void;
  vi.mocked(crypto.subtle.digest).mockImplementation(() => new Promise(resolve => { finish = resolve; })); await flush();
  await tick(AUDIO_PREPARE_TIMEOUT_MS); await act(async () => finish(hash())); expect(f.create).not.toHaveBeenCalled(); expect(screen.getByRole('status')).toHaveTextContent('超时');
});
it('handles a synchronously throwing repository with an actionable error', async () => {
  setup(() => { throw Error('storage unavailable'); }); await flush(); expect(screen.getByRole('status')).toHaveTextContent('音频读取失败');
});
it('does not autoplay; explicit start has a bounded pending-play wait and a fresh retry', async () => {
  const f = setup(); await flush(); const old = audio(); expect(f.play).not.toHaveBeenCalled();
  click('开始试听'); expect(f.play).toHaveBeenCalledOnce(); expect(screen.getByRole('status')).toHaveTextContent('正在请求播放');
  await tick(AUDIO_PROGRESS_TIMEOUT_MS); expect(screen.getByRole('status')).toHaveTextContent('长时间没有进展'); expect(old).not.toHaveAttribute('src'); expect(audio()).not.toBe(old);
  click('开始试听'); expect(f.play).toHaveBeenCalledTimes(2); expect(audio().src).toMatch(/^blob:/u);
});
it('does not treat a resolved play Promise as proof of time progress', async () => {
  const f = setup(); f.play.mockResolvedValue(); await flush(); click('开始试听'); await flush(); await tick(AUDIO_PROGRESS_TIMEOUT_MS);
  expect(screen.getByRole('status')).toHaveTextContent('长时间没有进展');
});
it.each(['NotAllowedError', 'NotSupportedError', 'AbortError'])('explains %s and leaves a manual retry, without automatic replay', async name => {
  const f = setup(); f.play.mockRejectedValue(new DOMException('native failure', name)); await flush(); click('开始试听'); await flush();
  expect(screen.getByRole('status')).toHaveTextContent(name === 'NotAllowedError' ? '浏览器阻止了试听' : '音频无法播放');
  expect(screen.getByRole('button', { name: '开始试听' })).toBeEnabled(); await tick(AUDIO_PROGRESS_TIMEOUT_MS * 2); expect(f.play).toHaveBeenCalledOnce();
});
it('handles a synchronous play failure and an actual media-error event without a reload loop', async () => {
  const f = setup(); f.play.mockImplementation(() => { throw new DOMException('unsupported', 'NotSupportedError'); }); await flush(); click('开始试听');
  expect(screen.getByRole('status')).toHaveTextContent('音频无法播放'); const current = audio(); fireEvent.error(current);
  expect(audio()).not.toBe(current); expect(audio()).not.toHaveAttribute('src'); expect(f.play).toHaveBeenCalledOnce();
});
it('retires a cancelled element and ignores its late play Promise and events', async () => {
  const f = setup(); let finish!: () => void; f.play.mockImplementation(() => new Promise(resolve => { finish = resolve; })); await flush(); const old = audio();
  click('开始试听'); click('停止试听'); const current = audio(); await act(async () => finish()); fireEvent.play(old); fireEvent.error(old);
  expect(audio()).toBe(current); expect(old).not.toHaveAttribute('src'); expect(screen.getByRole('status')).toHaveTextContent('已停止试听');
});
it.each(['resolve', 'reject'])('an old %s cannot affect a new attempt on the new element', async result => {
  const f = setup(); let resolve!: () => void, reject!: (error: Error) => void;
  f.play.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no; })); await flush(); const old = audio(); click('开始试听'); click('停止试听'); click('开始试听'); const current = audio();
  f.pause.mockClear(); await act(async () => { if (result === 'resolve') resolve(); else reject(Error('late')); });
  expect(screen.getByRole('status')).toHaveTextContent('正在请求播放'); expect(audio()).toBe(current);
  for (const context of f.pause.mock.contexts) expect(context).toBe(old);
});
it('supports native controls, pause/resume/end and detects a later stall based on actual progress', async () => {
  setup(); await flush(); const element = audio(); fireEvent.play(element); fireEvent.playing(element); expect(screen.getByRole('status')).toHaveTextContent('正在试听');
  await tick(AUDIO_PROGRESS_TIMEOUT_MS - 1000); element.currentTime = 1; fireEvent.timeUpdate(element); await tick(1000); expect(audio()).toBe(element);
  fireEvent.pause(element); await tick(AUDIO_PROGRESS_TIMEOUT_MS); expect(screen.getByRole('status')).toHaveTextContent('已暂停');
  fireEvent.play(element); element.currentTime = 2; fireEvent.timeUpdate(element); fireEvent.waiting(element); expect(screen.getByRole('status')).toHaveTextContent('正在等待');
  await tick(AUDIO_PROGRESS_TIMEOUT_MS); expect(audio()).not.toBe(element); expect(screen.getByRole('status')).toHaveTextContent('长时间没有进展');
  click('开始试听'); fireEvent.ended(audio()); await tick(AUDIO_PROGRESS_TIMEOUT_MS); expect(screen.getByRole('status')).toHaveTextContent('试听结束');
});
it('a stale resolution does not pause a newer native-control resume on the same element', async () => {
  const f = setup(); let finish!: () => void; f.play.mockImplementation(() => new Promise(resolve => { finish = resolve; })); await flush(); click('开始试听');
  fireEvent.pause(audio()); fireEvent.play(audio()); f.pause.mockClear(); await act(async () => finish()); expect(f.pause).not.toHaveBeenCalled();
});
it('does not mistake a backwards seek with continued playback for a stall', async () => {
  setup(); await flush(); const element = audio(); fireEvent.play(element); element.currentTime = 60; fireEvent.timeUpdate(element);
  await tick(7000); element.currentTime = 10; fireEvent.timeUpdate(element); await tick(7000); element.currentTime = 11; fireEvent.timeUpdate(element); await tick(7000);
  expect(audio()).toBe(element); expect(screen.getByRole('status')).toHaveTextContent('正在试听');
});
it('reprepare and unmount dispose the previous element, URL, timers and late promises', async () => {
  const f = setup(); let finish!: () => void; f.play.mockImplementation(() => new Promise(resolve => { finish = resolve; })); await flush(); const old = audio(); click('开始试听'); click('重新准备试听'); await flush();
  expect(audio()).not.toBe(old); expect(f.revoke).toHaveBeenCalledOnce(); f.view.unmount(); await act(async () => finish()); await tick(AUDIO_PROGRESS_TIMEOUT_MS + AUDIO_PREPARE_TIMEOUT_MS);
  expect(f.revoke).toHaveBeenCalledTimes(2); expect(old).not.toHaveAttribute('src'); expect(vi.getTimerCount()).toBe(0);
});

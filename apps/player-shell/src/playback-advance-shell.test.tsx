import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';
import { DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 } from './player-playback-policy';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import { createPlayerCore, startPlayerCore, playerCoreMetaProgressV1 } from '@world-studio/player-core';
import { collectionKey, storePlayerCollection } from './player-collection-store';
import { executeForegroundSessionTask, type ForegroundSessionTask, type ForegroundSessionResult } from './foreground-session-task';
const pending = vi.hoisted(() => ({ jobs: [] as { signal: AbortSignal; task: ForegroundSessionTask; finish(): void; fail(): void }[] }));
vi.mock('./playback-advance-task', async original => ({ ...await original<typeof import('./playback-advance-task')>(), canOffloadPlaybackAdvance: () => true }));
vi.mock('./foreground-session-client', async original => ({ ...await original<typeof import('./foreground-session-client')>(), ForegroundSessionRunner: class {
  active = true; resume() { this.active = true; } cancelPending() { this.active = false; } releaseIdle() {}
  run(task: ForegroundSessionTask, signal: AbortSignal) {
    if (task.kind !== 'playback') return Promise.resolve(executeForegroundSessionTask(task));
    return new Promise<ForegroundSessionResult>((resolve, reject) => pending.jobs.push({ task, signal, finish: () => resolve(executeForegroundSessionTask(task)), fail: () => reject(Error('worker')) }));
  }
} }));
afterEach(() => { cleanup(); pending.jobs.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
async function setup(media = false) {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const value = loadProject(migrateS0Project({ schemaVersion: 0, id: 'playback_async', title: 'Playback', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    { id: 'first', kind: 'narration', textId: 'first_text', text: 'First' }, { id: 'second', kind: 'narration', textId: 'second_text', text: 'Second' }, { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files);
  const demo = createPlayerMediaMultichannelDemoV1(), actual = media ? demo.project : value;
  const props = { project: { ...actual, settings: withProjectSettings(actual.settings, { text: { revealMode: 'instant' } }) }, mediaAssets: media ? demo.mediaAssets : [], playbackPolicy: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, auto: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto, baseDelayMilliseconds: 40, millisecondsPerReadableUnit: 0, voiceTailMilliseconds: 0 } } };
  const view = render(<PlayerShell {...props} />);
  fireEvent.click(view.getByRole('button', { name: '开始故事' })); await act(async () => {});
  const main = () => view.container.querySelector('main')!, hash = () => main().dataset.runtimeStateHash, before = hash();
  const auto = async () => { fireEvent.click(view.getByRole('button', { name: '自动播放' })); await act(async () => { await vi.advanceTimersByTimeAsync(40); }); };
  return { ...view, props, main, hash, before, auto };
}
const tick = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
it('starts only after the real reading deadline, preserves current text, and commits exactly once', async () => {
  const f = await setup(); fireEvent.click(f.getByRole('button', { name: '自动播放' })); await tick(39); expect(pending.jobs).toHaveLength(0);
  await tick(1); expect(pending.jobs).toHaveLength(1); expect(f.hash()).toBe(f.before); expect(f.main()).toHaveAttribute('data-playback-operation', 'busy');
  await tick(500); expect(pending.jobs).toHaveLength(1);
  await act(async () => pending.jobs[0]!.finish()); expect(f.getByText('Second', { exact: true })).toBeInTheDocument(); expect(f.hash()).not.toBe(f.before);
});
it.each(['stop', 'menu', 'background', 'unmount', 'pressure', 'pace'] as const)('cancels pending Auto on %s and discards a real late reply', async kind => {
  const f = await setup(); await f.auto(); const job = pending.jobs[0]!;
  if (kind === 'stop') fireEvent.click(f.getByRole('button', { name: '停止并留在当前句' }));
  if (kind === 'menu') fireEvent.click(f.getByRole('button', { name: '打开阅读菜单' }));
  if (kind === 'background') f.rerender(<PlayerShell {...f.props} hostActivity="suspended" />);
  if (kind === 'unmount') f.unmount();
  if (kind === 'pressure') f.rerender(<PlayerShell {...f.props} memoryPressureRequest={{ serial: 1, level: 'critical' }} />);
  if (kind === 'pace') fireEvent.change(f.getByLabelText('自动阅读节奏'), { target: { value: 'calm' } });
  expect(job.signal.aborted).toBe(true); await act(async () => job.finish());
  if (kind !== 'unmount') expect(f.hash()).toBe(f.before);
});
it('stops on worker failure without retrying on the main thread; explicit restart gets a new request', async () => {
  const f = await setup(); await f.auto(); await act(async () => pending.jobs[0]!.fail());
  expect(f.hash()).toBe(f.before); expect(f.getByRole('alert')).toHaveTextContent('当前句和存档保持不变');
  expect(f.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'false'); await tick(500); expect(pending.jobs).toHaveLength(1);
  fireEvent.click(f.getByRole('button', { name: '切回手动阅读' })); await f.auto(); expect(pending.jobs).toHaveLength(2);
  await act(async () => pending.jobs[1]!.finish()); expect(f.getByText('Second', { exact: true })).toBeInTheDocument();
});
it.each(['skipRead', 'skipAll'] as const)('preserves %s policy and permits stop before a batch commits', async mode => {
  const f = await setup(); fireEvent.click(f.getByRole('button', { name: mode === 'skipRead' ? '快进已读' : '快进全部' })); await tick(0);
  expect(pending.jobs).toHaveLength(1); const job = pending.jobs[0]!; expect(job.task.kind === 'playback' && job.task.policy.mode).toBe(mode);
  fireEvent.click(f.getByRole('button', { name: '停止并留在当前句' })); expect(job.signal.aborted).toBe(true);
  await act(async () => job.finish()); expect(f.hash()).toBe(f.before); await tick(100); expect(pending.jobs).toHaveLength(1);
});
it('releasing held skip cancels the in-flight batch and cannot turn its late reply into a jump', async () => {
  const f = await setup(); fireEvent.change(f.getByLabelText('快进激活方式'), { target: { value: 'hold' } });
  fireEvent.pointerDown(f.getByRole('button', { name: '快进全部' })); await tick(0); expect(pending.jobs).toHaveLength(1);
  fireEvent.pointerUp(window); expect(pending.jobs[0]!.signal.aborted).toBe(true); await act(async () => pending.jobs[0]!.finish()); expect(f.hash()).toBe(f.before);
});
it('resumes Auto after a cancelled menu batch with a fresh deadline, not a cached reply', async () => {
  const f = await setup(); await f.auto(); const old = pending.jobs[0]!;
  fireEvent.click(f.getByRole('button', { name: '打开阅读菜单' })); await act(async () => old.finish());
  fireEvent.click(f.getByRole('button', { name: '返回故事' })); await tick(39); expect(pending.jobs).toHaveLength(1);
  await tick(1); expect(pending.jobs).toHaveLength(2); await act(async () => pending.jobs[1]!.finish()); expect(f.hash()).not.toBe(f.before);
});
it('still waits for actual voice completion and invalidates an already computed batch when voice is replaced', async () => {
  const f = await setup(true), voice = f.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
  fireEvent.play(voice); await f.auto(); await tick(100); expect(pending.jobs).toHaveLength(0);
  fireEvent.ended(voice); await tick(0); expect(pending.jobs).toHaveLength(1); const job = pending.jobs[0]!;
  fireEvent.error(voice); fireEvent.click(f.getByRole('button', { name: '重试媒体' })); await act(async () => {});
  expect(job.signal.aborted).toBe(true); await act(async () => job.finish()); expect(f.hash()).toBe(f.before);
  const replacement = f.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!; expect(replacement).not.toBe(voice);
  fireEvent.play(replacement); await tick(100); expect(pending.jobs).toHaveLength(1);
  fireEvent.ended(replacement); await tick(0); expect(pending.jobs).toHaveLength(2);
});
it('accepts the unread boundary from a skip batch and stops rather than scheduling another batch', async () => {
  const f = await setup(); fireEvent.click(f.getByRole('button', { name: '快进已读' })); await tick(0);
  await act(async () => pending.jobs[0]!.finish()); expect(f.getByText('Second', { exact: true })).toBeInTheDocument();
  await tick(500); expect(pending.jobs).toHaveLength(1); expect(f.main()).toHaveAttribute('data-skip-active', 'false');
});
it.each(['keyboard', 'paragraph'] as const)('uses a primary %s takeover to stop first, without repeating the long calculation synchronously', async source => {
  const f = await setup(); await f.auto(); const job = pending.jobs[0]!;
  if (source === 'keyboard') fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  else fireEvent.click(f.getByRole('button', { name: '继续下一句' }));
  expect(job.signal.aborted).toBe(true);
  await act(async () => job.finish()); expect(f.hash()).toBe(f.before); expect(f.main()).toHaveAttribute('data-auto-playback', 'off');
});
it('stops failed skip with an explanation until an explicit menu action, without silently repeating it', async () => {
  const f = await setup(); fireEvent.click(f.getByRole('button', { name: '快进全部' })); await tick(0);
  await act(async () => pending.jobs[0]!.fail()); expect(f.hash()).toBe(f.before); expect(f.main()).toHaveAttribute('data-skip-active', 'false');
  expect(f.getByRole('alert')).toHaveTextContent('已停止'); await tick(500); expect(pending.jobs).toHaveLength(1);
  fireEvent.click(f.getByRole('button', { name: '打开阅读菜单' })); expect(f.queryByRole('alert')).toBeNull();
  fireEvent.click(f.getByRole('button', { name: '返回故事' })); expect(f.queryByRole('alert')).toBeNull(); expect(f.hash()).toBe(f.before);
});
it.each(['auto', 'skipRead', 'skipAll'] as const)('retains the synchronous %s path in editor preview instead of swallowing its timer', async mode => {
  const f = await setup(); f.rerender(<PlayerShell {...f.props} editorPreview={{ autoStart: false }} />);
  if (mode === 'auto') await f.auto();
  else { fireEvent.click(f.getByRole('button', { name: mode === 'skipRead' ? '快进已读' : '快进全部' })); await tick(0); }
  expect(pending.jobs).toHaveLength(0); expect(f.hash()).not.toBe(f.before);
  if (mode !== 'skipAll') expect(f.getByText('Second', { exact: true })).toBeInTheDocument();
});
it('restarts an active skip from the new complete source when cross-window knowledge changes without moving the cursor', async () => {
  const f = await setup(); fireEvent.click(f.getByRole('button', { name: '快进全部' })); await tick(0); const old = pending.jobs[0]!;
  const core = startPlayerCore(createPlayerCore(f.props.project), f.props.project), progress = playerCoreMetaProgressV1(core)!;
  const projectId = core.projectId, buildId = core.artifacts!.manifest.buildId;
  storePlayerCollection(localStorage, projectId, buildId, { ...progress, readTextIds: [...progress.readTextIds, 'second_text'] });
  fireEvent(window, new StorageEvent('storage', { key: collectionKey(projectId, buildId) })); await tick(0);
  expect(old.signal.aborted).toBe(true); expect(pending.jobs).toHaveLength(2); expect(f.main()).toHaveAttribute('data-history-cursor', '1');
  await act(async () => old.finish()); expect(f.getByText('First', { exact: true })).toBeInTheDocument();
  await act(async () => pending.jobs[1]!.finish()); expect(f.main()).toHaveAttribute('data-player-status', 'ended');
});

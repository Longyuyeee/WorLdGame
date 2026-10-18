import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPlayerCore, createPlayerCoreSessionSaveV1, startPlayerCore } from '@world-studio/player-core';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { ForegroundSessionRunner } from './foreground-session-client';
import { RecoverySessionRunner } from './recovery-session-client';
import { executeForegroundSessionTask, executeForegroundSessionWorkerTask } from './foreground-session-task';
import { createRecoverySession } from './recovery-session-task';
import { SESSION_WORKER_IDLE_MS } from './session-worker-pool';

vi.mock('virtual:world-recovery-worker', () => ({ default: 'self.onmessage=()=>{}' }));
function worker() { return { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null as ((event: ErrorEvent) => void) | null, onmessageerror: null as (() => void) | null, postMessage: vi.fn(), terminate: vi.fn() }; }
const workers: ReturnType<typeof worker>[] = [], dispose: (() => void)[] = [];
beforeEach(() => {
  workers.length = 0;
  vi.stubGlobal('Worker', function() { const value = worker(); workers.push(value); return value; });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:session-${workers.length}`), revokeObjectURL: vi.fn() });
});
afterEach(() => { dispose.splice(0).forEach(close => close()); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture() {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'pooled', title: 'Pooled', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [{ id: 'line', kind: 'narration', textId: 'text', text: '中文正文' }, { id: 'end', kind: 'end', endingName: 'Done' }] }] }).files);
  const state = startPlayerCore(createPlayerCore(project), project), saved = createPlayerCoreSessionSaveV1(state); if (!saved.ok) throw Error('fixture');
  return { state, saved, task: { kind: 'save' as const, source: state } };
}
function foreground() { const runner = new ForegroundSessionRunner(); dispose.push(() => runner.cancelPending()); return runner; }
function recovery() { const runner = new RecoverySessionRunner(); dispose.push(() => runner.releaseIdle()); return runner; }
async function started() { await Promise.resolve(); await Promise.resolve(); return workers.at(-1)!; }
function reply(value: ReturnType<typeof worker>, result?: unknown) {
  const sent = structuredClone(value.postMessage.mock.calls.at(-1)![0]); let payload;
  try { payload = { id: sent.id, result: result ?? (sent.task ? executeForegroundSessionWorkerTask(sent.task) : createRecoverySession(sent.source)) }; }
  catch { payload = { id: sent.id, error: true }; }
  value.onmessage?.({ data: payload } as MessageEvent);
}
it('reuses one owned worker for save/load, with no parked request handlers or result in the tail', async () => {
  const { state, saved, task } = fixture(), runner = foreground(), first = runner.run(task), value = await started();
  reply(value); expect((await first).result).toEqual(saved); expect(value.onmessage).toBeNull(); expect(value.terminate).not.toHaveBeenCalled();
  const second = runner.run({ kind: 'load', state, serialized: saved.serialized }); await started();
  expect(workers).toHaveLength(1); reply(value); expect((await second).result.ok).toBe(true);
  expect(value.onmessage).toBeNull(); expect(value.onerror).toBeNull();
  expect(await (runner as unknown as { tail: Promise<unknown> }).tail).toBeUndefined();
  runner.cancelPending(); expect(value.terminate).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
it('serializes queued requests and ignores a completed request callback during the next one', async () => {
  const { task } = fixture(), runner = foreground(), first = runner.run(task), second = runner.run(task), value = await started(), oldReply = value.onmessage!, oldMessage = value.postMessage.mock.calls[0]![0];
  expect(value.postMessage).toHaveBeenCalledOnce(); reply(value); await first; await started();
  expect(workers).toHaveLength(1); expect(value.postMessage).toHaveBeenCalledTimes(2);
  const nextReply = value.onmessage; oldReply({ data: { id: oldMessage.id, result: executeForegroundSessionTask(task) } } as MessageEvent);
  expect(value.onmessage).toBe(nextReply); reply(value); await second;
});
it.each(['timeout', 'abort', 'malformed'] as const)('discards a busy worker on %s and creates a fresh one', async reason => {
  vi.useFakeTimers(); const { task } = fixture(), runner = foreground(), pending = runner.run(task), value = await started(), late = value.onmessage!, sent = value.postMessage.mock.calls[0]![0];
  const rejected = expect(pending).rejects.toBeInstanceOf(Error);
  if (reason === 'timeout') await vi.advanceTimersByTimeAsync(5001);
  else if (reason === 'abort') runner.cancelPending();
  else reply(value, { kind: 'wrong', result: { ok: true } });
  await rejected; expect(value.terminate).toHaveBeenCalledOnce();
  late({ data: { id: sent.id, result: executeForegroundSessionTask(task) } } as MessageEvent);
  runner.resume(); const next = runner.run(task), fresh = await started(); expect(workers).toHaveLength(2); reply(fresh); await next;
});
it('expires the single idle worker and can create another without losing the result', async () => {
  vi.useFakeTimers(); const { task } = fixture(), runner = foreground(), pending = runner.run(task), value = await started(); reply(value); await pending;
  await vi.advanceTimersByTimeAsync(SESSION_WORKER_IDLE_MS + 1); expect(value.terminate).toHaveBeenCalledOnce();
  const next = runner.run(task), fresh = await started(); expect(workers).toHaveLength(2); reply(fresh); await next;
});
it('releases pressure/suspension ownership without cancelling active computation or parking it later', async () => {
  const { task } = fixture(), runner = foreground(), pending = runner.run(task), value = await started(); runner.releaseIdle(); reply(value);
  expect((await pending).result.ok).toBe(true); expect(value.terminate).toHaveBeenCalledOnce();
  const next = runner.run(task), fresh = await started(); expect(workers).toHaveLength(2); reply(fresh); await next;
});
it('reuses the recovery worker but revalidates a subsequently changed old checkpoint', async () => {
  // The immediate hidden-document path must retain pool reuse and validation.
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const { state, saved } = fixture(), runner = recovery(), first = runner.run(state, new AbortController().signal), value = await started(); reply(value); expect(await first).toEqual(saved);
  const changed = structuredClone(state); (changed.historySession!.checkpoints[0]!.state as { buildId: string }).buildId = 'changed';
  const second = runner.run(changed, new AbortController().signal), rejected = expect(second).rejects.toBeInstanceOf(Error); await started();
  expect(workers).toHaveLength(1); reply(value); await rejected; expect(value.terminate).toHaveBeenCalledOnce();
  const next = runner.run(state, new AbortController().signal), fresh = await started(); expect(workers).toHaveLength(2); reply(fresh); expect(await next).toEqual(saved);
});

it.each(['release', 'abort', 'reuse', 'hidden'] as const)('does not copy before painting and handles %s during the wait', async kind => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((action: FrameRequestCallback) => { frames.push(action); return frames.length; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const { state, saved } = fixture(), runner = recovery(), controller = new AbortController();
  // A real prior send establishes the slow-copy signal; no history is forged.
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(5);
  const warmup = runner.run(state, new AbortController().signal), warm = await started(); reply(warm); await warmup;
  const pending = runner.run(state, controller.signal); await started();
  expect(workers).toHaveLength(1); expect(warm.postMessage).toHaveBeenCalledOnce();
  if (kind === 'abort') {
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected; await vi.advanceTimersByTimeAsync(101);
    expect(workers).toHaveLength(1); expect(warm.postMessage).toHaveBeenCalledOnce(); runner.releaseIdle();
  } else {
    if (kind === 'release') runner.releaseIdle();
    if (kind === 'hidden') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    } else {
      frames.shift()!(0); await started(); expect(warm.postMessage).toHaveBeenCalledOnce();
      frames.shift()!(16);
    }
    const value = await started(); reply(value);
    expect(await pending).toEqual(saved);
    if (kind !== 'release') { expect(value.terminate).not.toHaveBeenCalled(); runner.releaseIdle(); }
    expect(value.terminate).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(kind === 'release' ? 2 : 1);
  }
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps fast copies immediate and forgets only timing when resources are released', async () => {
  vi.useFakeTimers(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const raf = vi.fn(); vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const { state, saved } = fixture(), runner = recovery();
  for (let i = 0; i < 2; i++) { const pending = runner.run(state, new AbortController().signal), value = await started(); reply(value); expect(await pending).toEqual(saved); }
  expect(raf).not.toHaveBeenCalled(); expect(workers).toHaveLength(1);
  runner.releaseIdle();
  const pending = runner.run(state, new AbortController().signal), value = await started(); reply(value); await pending;
  expect(raf).not.toHaveBeenCalled(); expect(workers).toHaveLength(2); runner.releaseIdle();
});

it.each(['missing', 'throwing', 'nonfinite'] as const)('does not let a %s optional clock break or retain a recovery worker', async kind => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const raf = vi.fn(); vi.stubGlobal('requestAnimationFrame', raf);
  if (kind === 'missing') vi.stubGlobal('performance', undefined);
  else vi.spyOn(performance, 'now').mockImplementation(() => { if (kind === 'throwing') throw Error('restricted'); return NaN; });
  const { state, saved } = fixture(), runner = recovery();
  for (let i = 0; i < 2; i++) { const pending = runner.run(state, new AbortController().signal), value = await started(); reply(value); expect(await pending).toEqual(saved); }
  expect(raf).not.toHaveBeenCalled(); expect(workers).toHaveLength(1);
  runner.releaseIdle(); expect(workers[0]!.terminate).toHaveBeenCalledOnce();
});

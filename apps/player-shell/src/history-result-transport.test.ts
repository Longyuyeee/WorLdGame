import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { advancePlayerCore, backPlayerCore, createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1, type PlayerCoreState } from '@world-studio/player-core';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { MAX_RUNTIME_HISTORY_ENTRIES } from '@world-studio/runtime';
import { executeForegroundSessionWorkerTask, foregroundSessionWorkerTask, applyForegroundSessionWorkerResult, type ForegroundSessionWorkerResult } from './foreground-session-task';
import { encodeHistoryResult, decodeHistoryResult } from './history-result-transport';
import { ForegroundSessionError, runForegroundSessionTask } from './foreground-session-client';
vi.mock('virtual:world-recovery-worker', () => ({ default: 'self.onmessage=()=>{}' }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

let state: PlayerCoreState, advanced: ForegroundSessionWorkerResult;
beforeAll(() => {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'transport_story', title: 'Transport', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    ...Array.from({ length: 485 }, (_, i) => ({ id: `line_${i}`, kind: 'narration' as const, textId: `text_${i}`, text: `Line ${i}` })).flatMap((line, i) => i === 480 ? [{ id: 'mark_one', kind: 'checkpoint' as const }, { id: 'mark_two', kind: 'checkpoint' as const }, line] : [line]), { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files);
  state = startPlayerCore(createPlayerCore(project, undefined, { checkpointSaveMode: 'deferred' }), project);
  while (state.historySession!.entries.length < 480) state = advancePlayerCore(state);
  advanced = executeForegroundSessionWorkerTask(foregroundSessionWorkerTask({ kind: 'advance', state }));
}, 60_000);

function packet() {
  const wire = structuredClone(encodeHistoryResult(advanced));
  if (!('encoding' in wire)) throw Error('Expected measured long-history packet');
  return wire;
}
it('round-trips every long-history field and exact public save bytes without borrowing the source', () => {
  const wire = packet(), before = JSON.stringify(advanced), decoded = decodeHistoryResult(wire) as typeof advanced;
  expect(decoded).toEqual(advanced); expect(JSON.stringify(advanced)).toBe(before);
  if (decoded.kind !== 'advance' || !decoded.result.ok) throw Error('fixture');
  const actual = { ...state, ...decoded.result.patch };
  expect(actual.runtimeState).toBe(actual.historySession!.checkpoints[actual.historySession!.cursor]!.state);
  expect(decoded.result.patch.deferredCheckpointSaveCandidates).toHaveLength(2);
  if (advanced.kind !== 'advance' || !advanced.result.ok) throw Error('fixture');
  for (const [index, candidate] of decoded.result.patch.deferredCheckpointSaveCandidates.entries()) {
    const original = advanced.result.patch.deferredCheckpointSaveCandidates[index]!;
    const saved = createPlayerCoreSessionSaveV1({ ...actual, runtimeState: candidate.historySession.checkpoints[candidate.historySession.cursor]!.state, historySession: candidate.historySession });
    const expected = createPlayerCoreSessionSaveV1({ ...actual, runtimeState: original.historySession.checkpoints[original.historySession.cursor]!.state, historySession: original.historySession });
    expect(saved.ok).toBe(true); expect(saved).toEqual(expected);
  }
  expect(createPlayerCoreSessionSaveV1(actual)).toEqual(createPlayerCoreSessionSaveV1(advancePlayerCore(state)));
  // Transport size only, not retained heap, CPU, real browser copy or a forged history.
  expect(JSON.stringify(wire).length).toBeLessThan(before.length * 0.5);
  expect(decoded.result.patch.historySession!.checkpoints[0]).not.toBe(state.historySession!.checkpoints[0]);
});
it('preserves middle insertions, all three progress domains and shared checkpoint candidates within one packet', () => {
  if (advanced.kind !== 'advance' || !advanced.result.ok) throw Error('fixture');
  // Codec-shape exercise, not a valid Core history or execution benchmark.
  const first = advanced.result.patch.historySession!.checkpoints[0]!, lists = [['a', 'z'], ['a', 'b', 'z'], ['a', 'b', 'c', 'z'], [], ['x']];
  const checkpoints = lists.map((ids, i) => ({ ...first, checkpointId: `shape_${i}`, state: { ...first.state, metaProgress: { ...first.state.metaProgress, readTextIds: ids, unlockedGalleryAssetIds: ids, reachedEndingIds: ids } } }));
  const historySession = { ...advanced.result.patch.historySession!, checkpoints };
  const reply = { ...advanced, result: { ...advanced.result, patch: { ...advanced.result.patch, historySession, deferredCheckpointSaveCandidates: [{ buildId: 'shape', sceneId: 'main', stepId: 'mark', runtimeStateHash: first.stateHash, historySession: { ...historySession, checkpoints: checkpoints.slice(0, 3) } }] } } };
  const encoded = encodeHistoryResult(reply); if (!('encoding' in encoded)) throw Error('packet');
  expect(encoded.checkpoints).toHaveLength(5);
  const decoded = decodeHistoryResult(structuredClone(encoded)) as typeof reply;
  expect(decoded).toEqual(reply);
  expect(decoded.result.patch.deferredCheckpointSaveCandidates[0]!.historySession.checkpoints[1]).toBe(decoded.result.patch.historySession.checkpoints[1]);
});
it('round-trips loaded history including recorded future without changing the owner or saved bytes', () => {
  const backed = backPlayerCore(state); expect(backed.historySession!.cursor).toBeLessThan(backed.historySession!.entries.length);
  const saved = createPlayerCoreSessionSaveV1(backed); if (!saved.ok) throw Error('save');
  const task = { kind: 'load' as const, state: backed, serialized: saved.serialized };
  const reply = executeForegroundSessionWorkerTask(foregroundSessionWorkerTask(task));
  const encoded = encodeHistoryResult(reply); expect('encoding' in encoded).toBe(true);
  const decoded = decodeHistoryResult(structuredClone(encoded)) as ForegroundSessionWorkerResult;
  expect(decoded).toEqual(reply);
  const loaded = applyForegroundSessionWorkerResult(task, decoded); if (loaded.kind !== 'load' || !loaded.result.ok) throw Error('load');
  expect(loaded.result.state.artifacts).toBe(state.artifacts);
  expect(createPlayerCoreSessionSaveV1(loaded.result.state)).toEqual(saved);
});
function workerFixture() {
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as ((event: MessageEvent) => void) | null, onerror: null, onmessageerror: null };
  vi.stubGlobal('Worker', function() { return worker; });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:history-transport'), revokeObjectURL: vi.fn() });
  return worker;
}
it('delivers the actual compact long-history reply through the foreground client', async () => {
  const worker = workerFixture(), pending = runForegroundSessionTask({ kind: 'advance', state }, new AbortController().signal);
  const id = worker.postMessage.mock.calls[0]![0].id;
  worker.onmessage!({ data: { id, result: packet() } } as MessageEvent);
  expect(await pending).toEqual(advanced); expect(worker.terminate).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
it('rejects malformed compact replies and releases the computation instead of throwing out of the callback', async () => {
  const worker = workerFixture(), pending = runForegroundSessionTask({ kind: 'advance', state }, new AbortController().signal), wire = packet();
  const rejected = expect(pending).rejects.toBeInstanceOf(ForegroundSessionError);
  const bad = { ...wire, encoding: 'future' };
  worker.onmessage!({ data: { id: worker.postMessage.mock.calls[0]![0].id, result: bad } } as MessageEvent);
  await rejected; expect(worker.terminate).toHaveBeenCalledOnce(); expect(worker.onmessage).toBeNull();
});
it('does not even read or reconstruct a large result from an already cancelled callback', async () => {
  const worker = workerFixture(), controller = new AbortController(), pending = runForegroundSessionTask({ kind: 'advance', state }, controller.signal), late = worker.onmessage!;
  const id = worker.postMessage.mock.calls[0]![0].id, rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); await rejected;
  const read = vi.fn(() => { throw Error('A cancelled packet must not be decoded'); });
  late({ data: { id, get result() { return read(); } } } as unknown as MessageEvent);
  expect(read).not.toHaveBeenCalled(); expect(worker.terminate).toHaveBeenCalledOnce();
});
it('keeps short, save, protection, failed and compatibility replies on their existing plain path', () => {
  const saved = executeForegroundSessionWorkerTask(foregroundSessionWorkerTask({ kind: 'save', source: state }));
  expect(encodeHistoryResult(saved)).toBe(saved); expect(decodeHistoryResult(saved)).toBe(saved);
  const protectedResult = executeForegroundSessionWorkerTask({ kind: 'protect', state, retainedBackSteps: 64 });
  expect(encodeHistoryResult(protectedResult)).toBe(protectedResult);
  const failed: ForegroundSessionWorkerResult = { kind: 'advance', result: { ok: false, diagnostics: [] } };
  expect(encodeHistoryResult(failed)).toBe(failed);
  if (advanced.kind !== 'advance' || !advanced.result.ok) throw Error('fixture');
  const short = { ...advanced, result: { ...advanced.result, patch: { ...advanced.result.patch, historySession: { ...advanced.result.patch.historySession!, entries: [] } } } };
  expect(encodeHistoryResult(short)).toBe(short);
});
it.each(['version', 'extra', 'empty', 'table-hole', 'list-hole', 'negative', 'fraction', 'nonfinite', 'overlap', 'non-string', 'insert-hole', 'duplicate-domain', 'index', 'index-hole', 'runtime-index', 'kind', 'candidate', 'expansion'] as const)('fails closed for malformed packed history: %s', kind => {
  const wire = packet() as unknown as { encoding: string; checkpoints: Record<string, any>[]; value: any; extra?: boolean };
  const first = wire.checkpoints[0]!, history = wire.value.result.patch.historySession;
  if (kind === 'version') wire.encoding = 'future';
  if (kind === 'extra') wire.extra = true;
  if (kind === 'empty') wire.checkpoints = [];
  if (kind === 'table-hole') delete wire.checkpoints[0];
  if (kind === 'list-hole') delete first.lists[0];
  if (kind === 'negative') first.lists[0][0] = -1;
  if (kind === 'fraction') first.lists[0][0] = 0.5;
  if (kind === 'nonfinite') first.lists[0][0] = Infinity;
  if (kind === 'overlap') first.lists[0] = [1, 1, []];
  if (kind === 'non-string') first.lists[0][2] = [null];
  if (kind === 'insert-hole') first.lists[0][2] = Array(1);
  if (kind === 'duplicate-domain') first.state.metaProgress.readTextIds = [];
  if (kind === 'index') history.checkpoints[0] = wire.checkpoints.length;
  if (kind === 'index-hole') delete history.checkpoints[0];
  if (kind === 'runtime-index') wire.value.result.patch.runtimeState = wire.checkpoints.length;
  if (kind === 'kind') wire.value.kind = 'save';
  if (kind === 'candidate') wire.value.result.patch.deferredCheckpointSaveCandidates = [{}];
  if (kind === 'expansion') { first.lists[0] = [0, 0, Array(100_000).fill('id')]; wire.checkpoints = Array.from({ length: 82 }, (_, i) => i === 0 ? first : { ...first, lists: [[100_000, 0, []], [0, 0, []], [0, 0, []]] }); }
  expect(() => decodeHistoryResult(wire)).toThrow('Invalid history transport');
});
it('falls back to the complete plain reply rather than imposing a new valid history size limit', () => {
  if (advanced.kind !== 'advance' || !advanced.result.ok) throw Error('fixture');
  // Codec budget shape only. No claim that these synthetic checkpoints validate.
  const checkpoint = advanced.result.patch.historySession!.checkpoints[0]!, large = { ...checkpoint, state: { ...checkpoint.state, metaProgress: { ...checkpoint.state.metaProgress, readTextIds: Array(100_000).fill('id') } } };
  const reply = { ...advanced, result: { ...advanced.result, patch: { ...advanced.result.patch, historySession: { ...advanced.result.patch.historySession!, checkpoints: Array.from({ length: 82 }, () => ({ ...large })) } } } };
  expect(encodeHistoryResult(reply)).toBe(reply);
});
it('uses complete plain replies when separate candidate tables exceed the combined checkpoint budget', () => {
  if (advanced.kind !== 'advance' || !advanced.result.ok) throw Error('fixture');
  // Budget shape only; no public execution/validation claim for this chain.
  const first = advanced.result.patch.historySession!.checkpoints[0]!, small = { ...first, state: { ...first.state, metaProgress: { ...first.state.metaProgress, readTextIds: [], unlockedGalleryAssetIds: [], reachedEndingIds: [] } } };
  const historySession = { ...advanced.result.patch.historySession!, checkpoints: Array.from({ length: MAX_RUNTIME_HISTORY_ENTRIES + 1 }, () => ({ ...small })) };
  const reply = { ...advanced, result: { ...advanced.result, patch: { ...advanced.result.patch, historySession, deferredCheckpointSaveCandidates: [{ ...advanced.result.patch.deferredCheckpointSaveCandidates[0]!, historySession: { ...historySession, checkpoints: [{ ...small }] } }] } } };
  expect(encodeHistoryResult(reply)).toBe(reply);
});

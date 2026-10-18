import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { advancePlayerCore, backPlayerCore, createPlayerCore, createPlayerCoreSessionSaveV1, schedulePlayerCorePlaybackV1, startPlayerCore, type PlayerCoreState } from '@world-studio/player-core';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { MAX_RUNTIME_HISTORY_ENTRIES } from '@world-studio/runtime';
import { encodeSessionInput, decodeSessionInput, encodeForegroundSessionInput, decodeForegroundSessionInput } from './session-input-transport';
import { foregroundSessionWorkerTask, executeForegroundSessionWorkerTask } from './foreground-session-task';
import { recoverySessionSource, createRecoverySession } from './recovery-session-task';
import { runForegroundSessionTask } from './foreground-session-client';
import { serializeRecoverySession } from './recovery-session-client';
import { encodeHistoryResult } from './history-result-transport';
vi.mock('virtual:world-recovery-worker', () => ({ default: 'self.onmessage=()=>{}' }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

let state: PlayerCoreState;
beforeAll(() => {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'input_transport', title: 'Input', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    ...Array.from({ length: 490 }, (_, i) => ({ id: `line_${i}`, kind: 'narration' as const, textId: `text_${i}`, text: `中文 ${i} 😀` })).flatMap((line, i) => i === 480 ? [{ id: 'mark_one', kind: 'checkpoint' as const }, { id: 'mark_two', kind: 'checkpoint' as const }, line] : [line]), { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files);
  state = startPlayerCore(createPlayerCore(project, undefined, { checkpointSaveMode: 'deferred' }), project);
  while (state.historySession!.entries.length < 480) state = advancePlayerCore(state);
  state = advancePlayerCore(state);
  expect(state.deferredCheckpointSaveCandidates).toHaveLength(2);
}, 60_000);

function packet(source = state) {
  const result = structuredClone(encodeSessionInput(source));
  if (!('encoding' in result)) throw Error('Expected long input packet');
  return result;
}
it('preserves every source field, complete history, candidate sharing and exact canonical save', () => {
  const before = JSON.stringify(state), wire = packet(), restored = decodeSessionInput(wire) as PlayerCoreState;
  expect(restored).toEqual(state); expect(JSON.stringify(state)).toBe(before);
  expect(restored.runtimeState).toBe(restored.historySession!.checkpoints[restored.historySession!.cursor]!.state);
  expect(restored.deferredCheckpointSaveCandidates[0]!.historySession.checkpoints[0]).toBe(restored.historySession!.checkpoints[0]);
  expect(restored.historySession!.checkpoints[0]).not.toBe(state.historySession!.checkpoints[0]);
  expect(createPlayerCoreSessionSaveV1(restored)).toEqual(createPlayerCoreSessionSaveV1(state));
  expect(JSON.stringify(wire).length).toBeLessThan(before.length * .5); // representation, not heap/copy timing
});
it('executes the same fully validating advance and both deferred checkpoint saves after decoding', () => {
  const input = foregroundSessionWorkerTask({ kind: 'advance', state }), decoded = decodeForegroundSessionInput(structuredClone(encodeForegroundSessionInput(input)));
  expect(executeForegroundSessionWorkerTask(decoded)).toEqual(executeForegroundSessionWorkerTask(input));
  const restored = decodeSessionInput(packet()) as PlayerCoreState;
  for (const [index, candidate] of restored.deferredCheckpointSaveCandidates.entries()) {
    const original = state.deferredCheckpointSaveCandidates[index]!;
    expect(createRecoverySession({ ...restored, historySession: candidate.historySession, runtimeState: candidate.historySession.checkpoints[candidate.historySession.cursor]!.state })).toEqual(createRecoverySession({ ...state, historySession: original.historySession, runtimeState: original.historySession.checkpoints[original.historySession.cursor]!.state }));
  }
});
it('preserves recorded future and current runtime identity when saving after rollback', () => {
  const backed = backPlayerCore(backPlayerCore(state)), source = recoverySessionSource(backed), wire = encodeSessionInput(source);
  const restored = decodeSessionInput(structuredClone(wire));
  expect(restored).toEqual(source); expect(restored.historySession!.cursor).toBeLessThan(restored.historySession!.entries.length);
  expect(createRecoverySession(restored)).toEqual(createRecoverySession(source));
});
it.each(['auto', 'skipAll', 'skipRead'] as const)('retains %s scheduler, stop boundary and save state without dispatching playback', mode => {
  const policy = { schemaVersion: 1 as const, mode, skipActivation: mode === 'auto' ? null : 'toggle' as const, speed: mode === 'auto' ? 'normal' as const : 20 as const, stopInstructionIds: [], unavailableEffectDescriptorIds: [], instantInstructionBudget: 8,
    autoTiming: { baseDelayMilliseconds: 0, millisecondsPerReadableUnit: 0, readableUnits: 1, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 0 } };
  const playing = schedulePlayerCorePlaybackV1(state, policy), restored = decodeSessionInput(structuredClone(encodeSessionInput(playing))) as PlayerCoreState;
  expect(restored).toEqual(playing); expect(restored.playback).toEqual(playing.playback);
  expect(createPlayerCoreSessionSaveV1(restored)).toEqual(createPlayerCoreSessionSaveV1(playing));
  expect(schedulePlayerCorePlaybackV1(restored, policy)).toEqual(schedulePlayerCorePlaybackV1(playing, policy));
});
it('keeps packets independent across cancellation, cold workers and repeated sources', () => {
  const first = decodeSessionInput(packet()) as PlayerCoreState, second = decodeSessionInput(packet()) as PlayerCoreState;
  expect(second).toEqual(first); expect(second.historySession!.checkpoints[0]).not.toBe(first.historySession!.checkpoints[0]);
  Object.assign(first.historySession!.checkpoints[0]!, { stateHash: '0'.repeat(64) });
  expect(createPlayerCoreSessionSaveV1(first).ok).toBe(false); expect(createRecoverySession(second)).toEqual(createRecoverySession(state));
});
it.each(['hash', 'entry', 'archive', 'id'])('still fully validates the decoded source after %s corruption', kind => {
  createRecoverySession(state); // no validation conclusion may be reused
  const wire = packet(), value = wire.value as any;
  if (kind === 'hash') (wire.checkpoints as any[])[0].stateHash = '0'.repeat(64);
  if (kind === 'entry') value.historySession.entries[0].entryId = 'bad';
  if (kind === 'archive') value.historySession.archives = [{}];
  if (kind === 'id') (wire.checkpoints as any[])[0].lists[0][2] = ['bad id'];
  const restored = decodeSessionInput(wire) as PlayerCoreState;
  expect(() => createRecoverySession(restored)).toThrow('WORLD_PLAYER_RECOVERY_SESSION_INVALID');
  expect(executeForegroundSessionWorkerTask({ kind: 'advance', state: restored }).result.ok).toBe(false);
});
it.each(['version', 'extra', 'empty', 'table-hole', 'list-hole', 'negative', 'fraction', 'overlap', 'insert-hole', 'non-string', 'index', 'index-hole', 'runtime-index', 'candidate', 'expansion'] as const)('rejects malformed input without plain fallback: %s', kind => {
  const wire = packet() as any, first = wire.checkpoints[0], history = wire.value.historySession;
  if (kind === 'version') wire.encoding = 'future';
  if (kind === 'extra') wire.extra = true;
  if (kind === 'empty') wire.checkpoints = [];
  if (kind === 'table-hole') delete wire.checkpoints[0];
  if (kind === 'list-hole') delete first.lists[0];
  if (kind === 'negative') first.lists[0][0] = -1;
  if (kind === 'fraction') first.lists[0][0] = .5;
  if (kind === 'overlap') first.lists[0] = [1, 1, []];
  if (kind === 'insert-hole') first.lists[0][2] = Array(1);
  if (kind === 'non-string') first.lists[0][2] = [null];
  if (kind === 'index') history.checkpoints[0] = wire.checkpoints.length;
  if (kind === 'index-hole') delete history.checkpoints[0];
  if (kind === 'runtime-index') wire.value.runtimeState = wire.checkpoints.length;
  if (kind === 'candidate') wire.value.deferredCheckpointSaveCandidates = [{}];
  if (kind === 'expansion') { first.lists[0] = [0, 0, Array(100_000).fill('id')]; wire.checkpoints = Array.from({ length: 82 }, (_, i) => i === 0 ? first : { ...first, lists: [[100_000, 0, []], [0, 0, []], [0, 0, []]] }); }
  expect(() => decodeSessionInput(wire)).toThrow('Invalid history transport');
});
it('uses complete plain transport above the encoding budget, and leaves short/replay sources alone', () => {
  const checkpoint = state.historySession!.checkpoints[0]!, large = { ...checkpoint, state: { ...checkpoint.state, metaProgress: { ...checkpoint.state.metaProgress, readTextIds: Array(100_000).fill('id') } } };
  // Budget shape only, not a valid Core history or a supported capacity claim.
  const over = { ...state, historySession: { ...state.historySession!, checkpoints: Array.from({ length: 81 }, () => ({ ...large })) } };
  expect(encodeSessionInput(over)).toBe(over);
  const short = { ...state, historySession: { ...state.historySession!, entries: [] } }; expect(encodeSessionInput(short)).toBe(short); expect(decodeSessionInput(short)).toBe(short);
  const replay = { ...state, replaySession: {} as NonNullable<PlayerCoreState['replaySession']> }; expect(encodeSessionInput(replay)).toBe(replay);
  const protect = foregroundSessionWorkerTask({ kind: 'protect', state, retainedBackSteps: 64 }); expect(encodeForegroundSessionInput(protect)).toBe(protect);
  const saved = createRecoverySession(state), load = foregroundSessionWorkerTask({ kind: 'load', state, serialized: saved.serialized }); expect(encodeForegroundSessionInput(load)).toBe(load);
});
it.each(['advance', 'save', 'recovery'] as const)('actually sends encoded complete %s inputs through the owned client', async kind => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as ((event: MessageEvent) => void) | null, onerror: null, onmessageerror: null };
  vi.stubGlobal('Worker', function() { return worker; }); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:input'), revokeObjectURL: vi.fn() });
  const pending = kind === 'recovery' ? serializeRecoverySession(state, new AbortController().signal) : runForegroundSessionTask(kind === 'advance' ? { kind, state } : { kind, source: state }, new AbortController().signal);
  const message = structuredClone(worker.postMessage.mock.calls[0]![0]), input = message.task?.state ?? message.task?.source ?? message.source;
  expect(input.encoding).toBe('world-player.session-input.1');
  const result = kind === 'recovery' ? createRecoverySession(decodeSessionInput(message.source)) : encodeHistoryResult(executeForegroundSessionWorkerTask(decodeForegroundSessionInput(message.task)));
  worker.onmessage!({ data: { id: message.id, result } } as MessageEvent);
  const actual = await pending; expect(actual).toBeTruthy(); expect(worker.terminate).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
it('keeps a combined table over budget plain instead of dropping distinct candidate checkpoints', () => {
  // Transport budget shape only, not a claim these synthetic chains validate.
  const first = state.historySession!.checkpoints[0]!, small = { ...first, state: { ...first.state, metaProgress: { ...first.state.metaProgress, readTextIds: [], unlockedGalleryAssetIds: [], reachedEndingIds: [] } } };
  const historySession = { ...state.historySession!, checkpoints: Array.from({ length: MAX_RUNTIME_HISTORY_ENTRIES + 1 }, () => ({ ...small })) };
  const source = { ...state, historySession, deferredCheckpointSaveCandidates: [{ ...state.deferredCheckpointSaveCandidates[0]!, historySession: { ...historySession, checkpoints: [{ ...small }] } }] };
  expect(encodeSessionInput(source)).toBe(source);
});

import { beforeAll, expect, it, vi, afterEach } from 'vitest';
import { advancePlayerCore, createPlayerCore, startPlayerCore, schedulePlayerCorePlaybackV1, createPlayerCoreSessionSaveV1, type PlayerCoreState, type PlayerCorePlaybackPolicyV1 } from '@world-studio/player-core';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { executePlaybackAdvance, validPlaybackAdvanceReply } from './playback-advance-task';
import { foregroundSessionWorkerTask, executeForegroundSessionWorkerTask } from './foreground-session-task';
import { encodeForegroundSessionInput, decodeForegroundSessionInput } from './session-input-transport';
import { encodeHistoryResult, decodeHistoryResult } from './history-result-transport';
import { runForegroundSessionTask } from './foreground-session-client';
vi.mock('virtual:world-recovery-worker', () => ({ default: 'self.onmessage=()=>{}' }));
afterEach(() => vi.unstubAllGlobals());
let source: PlayerCoreState;
const policy = (mode: 'auto' | 'skipRead' | 'skipAll', extra: Partial<PlayerCorePlaybackPolicyV1> = {}): PlayerCorePlaybackPolicyV1 => ({ schemaVersion: 1, mode, skipActivation: mode === 'auto' ? null : 'toggle', speed: mode === 'auto' ? 'normal' : 5, instantInstructionBudget: 8, stopInstructionIds: [], unavailableEffectDescriptorIds: [], autoTiming: { baseDelayMilliseconds: 0, millisecondsPerReadableUnit: 0, readableUnits: 0, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 0 }, ...extra });
beforeAll(() => {
  const project = loadProject(migrateS0Project({ schemaVersion: 0, id: 'playback_long', title: 'Playback', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    ...Array.from({ length: 480 }, (_, i) => ({ id: `line_${i}`, kind: 'narration' as const, textId: `text_${i}`, text: `段落 ${i}` })),
    ...Array.from({ length: 14 }, (_, i) => ({ id: `mark_${i}`, kind: 'checkpoint' as const })),
    { id: 'next', kind: 'narration', textId: 'next_text', text: 'Next' }, { id: 'last', kind: 'narration', textId: 'last_text', text: 'Last' }, { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] }).files);
  source = startPlayerCore(createPlayerCore(project, undefined, { checkpointSaveMode: 'deferred' }), project);
  while (source.historySession!.entries.length < 480) source = advancePlayerCore(source);
}, 60_000);

function roundtrip(state: PlayerCoreState, schedule: PlayerCorePlaybackPolicyV1) {
  const task = foregroundSessionWorkerTask({ kind: 'playback', state, policy: schedule });
  const wire = structuredClone(encodeForegroundSessionInput(task)), decoded = decodeForegroundSessionInput(wire);
  const reply = decodeHistoryResult(structuredClone(encodeHistoryResult(executeForegroundSessionWorkerTask(decoded)))) as ReturnType<typeof executeForegroundSessionWorkerTask>;
  if (reply.kind !== 'playback' || !reply.result.ok) throw Error('fixture');
  expect(validPlaybackAdvanceReply(state, schedule, reply.result)).toBe(true);
  return { ...state, ...reply.result.patch };
}
it.each(['auto', 'skipRead', 'skipAll'] as const)('matches public Core, all candidates and canonical saves across repeated %s batches', mode => {
  let expected = source, actual = source;
  for (let i = 0; i < 6 && expected.status === 'presenting'; i++) {
    const schedule = policy(mode); expected = schedulePlayerCorePlaybackV1(expected, schedule); actual = roundtrip(actual, schedule);
    expect(actual).toEqual(expected); expect(actual.schedulerSession!.history).toBe(actual.historySession);
    expect(createPlayerCoreSessionSaveV1(actual)).toEqual(createPlayerCoreSessionSaveV1(expected));
  }
});
it('keeps separate non-shared scheduler history separate, letting Core rebuild rather than silently reuse it', () => {
  const playing = schedulePlayerCorePlaybackV1(source, policy('skipAll'));
  const changed = { ...playing, schedulerSession: { ...playing.schedulerSession!, history: structuredClone(playing.historySession!) } };
  const restored = decodeForegroundSessionInput(structuredClone(encodeForegroundSessionInput({ kind: 'playback', state: changed, policy: policy('skipAll') })));
  if (restored.kind !== 'playback') throw Error('fixture');
  expect(restored.state).toEqual(changed); expect(restored.state.schedulerSession!.history).not.toBe(restored.state.historySession);
  expect(roundtrip(changed, policy('skipAll'))).toEqual(schedulePlayerCorePlaybackV1(changed, policy('skipAll')));
});
it.each(['hash', 'counter', 'working'])('fully validates each request, including %s corruption after a valid batch', kind => {
  const state = structuredClone(schedulePlayerCorePlaybackV1(source, policy('skipAll')));
  if (kind === 'hash') Object.assign(state.historySession!.checkpoints[0]!, { stateHash: '0'.repeat(64) });
  if (kind === 'counter') Object.assign(state.schedulerSession!, { accumulatedInstructions: -1 });
  if (kind === 'working') Object.assign(state.schedulerSession!.workingState, { projectId: 'wrong' });
  const task = decodeForegroundSessionInput(structuredClone(encodeForegroundSessionInput({ kind: 'playback', state, policy: policy('skipAll') })));
  expect(executeForegroundSessionWorkerTask(task).result.ok).toBe(false);
});
it('checks source, playback policy and shared history ownership in replies', () => {
  const schedule = policy('auto'), reply = executePlaybackAdvance(source, schedule); if (!reply.ok) throw Error('fixture');
  expect(validPlaybackAdvanceReply(source, schedule, reply)).toBe(true);
  expect(validPlaybackAdvanceReply(source, policy('skipAll'), reply)).toBe(false);
  expect(validPlaybackAdvanceReply(source, schedule, { ...reply, sourceHash: '0'.repeat(64) })).toBe(false);
  expect(validPlaybackAdvanceReply(source, schedule, { ...reply, patch: { ...reply.patch, schedulerSession: { ...reply.patch.schedulerSession!, history: structuredClone(reply.patch.historySession!) } } })).toBe(false);
});
it('uses both packed directions in the actual foreground client and validates after expansion', async () => {
  let sent: unknown;
  vi.stubGlobal('Worker', class {
    onmessage: ((event: unknown) => void) | null = null; onerror = null; onmessageerror = null; terminate() {}
    postMessage(data: any) { sent = data.task; const task = decodeForegroundSessionInput(structuredClone(data.task)); queueMicrotask(() => this.onmessage?.({ data: { id: data.id, result: structuredClone(encodeHistoryResult(executeForegroundSessionWorkerTask(task))) } })); }
  });
  const result = await runForegroundSessionTask({ kind: 'playback', state: source, policy: policy('auto') }, new AbortController().signal);
  expect((sent as any).state.encoding).toBe('world-player.session-input.1'); expect(result).toEqual({ kind: 'playback', result: executePlaybackAdvance(source, policy('auto')) });
});

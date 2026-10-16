import { loadPlayerCoreSessionSaveV1, playerCoreSessionLoadSourceV1, preparePlayerCoreSessionLoadV1, type PlayerCoreSessionLoadSourceV1, type PlayerCoreState } from "@world-studio/player-core";
import { createRecoverySession, recoverySessionSource, type RecoverySessionSource } from "./recovery-session-task";
import { prepareHistoryProtection } from './history-protection-task';
import { executeStoryAdvance, storyAdvanceSource, type StoryAdvanceResult } from './story-advance-task';

export type ForegroundSessionTask = { readonly kind:"save";readonly source:RecoverySessionSource } | {readonly kind:"load";readonly state:PlayerCoreState;readonly serialized:string} | {readonly kind:'protect';readonly state:PlayerCoreState;readonly retainedBackSteps:number} | { readonly kind: 'advance'; readonly state: PlayerCoreState };
export type ForegroundSessionResult = {readonly kind:"save";readonly result:ReturnType<typeof createRecoverySession>} | {readonly kind:"load";readonly result:ReturnType<typeof loadPlayerCoreSessionSaveV1>} | {readonly kind:'protect';readonly result:ReturnType<typeof prepareHistoryProtection>} | { readonly kind: 'advance'; readonly result: StoryAdvanceResult };
export type ForegroundSessionWorkerTask = Exclude<ForegroundSessionTask, { kind: 'load' }> | { readonly kind: 'load'; readonly source: PlayerCoreSessionLoadSourceV1; readonly serialized: string };
export type ForegroundSessionWorkerResult = Exclude<ForegroundSessionResult, { kind: 'load' }> | { readonly kind: 'load'; readonly result: ReturnType<typeof preparePlayerCoreSessionLoadV1> };

export function foregroundSessionWorkerTask(task: ForegroundSessionTask): ForegroundSessionWorkerTask {
  if (task.kind === 'advance') return { kind: 'advance', state: storyAdvanceSource(task.state) };
  if (task.kind === 'load') return { kind: 'load', source: playerCoreSessionLoadSourceV1(task.state), serialized: task.serialized };
  if (task.kind === 'save') return { kind: 'save', source: recoverySessionSource(task.source) };
  return task;
}

export function executeForegroundSessionWorkerTask(task: ForegroundSessionWorkerTask): ForegroundSessionWorkerResult {
  if (task.kind === 'advance') return { kind: 'advance', result: executeStoryAdvance(task.state) };
  if (task.kind === 'load') return { kind: 'load', result: preparePlayerCoreSessionLoadV1(task.source, task.serialized) };
  if (task.kind === 'protect') return { kind: 'protect', result: prepareHistoryProtection(task.state, task.retainedBackSteps) };
  return { kind: 'save', result: createRecoverySession(task.source) };
}

export function applyForegroundSessionWorkerResult(task: ForegroundSessionTask, reply: ForegroundSessionWorkerResult): ForegroundSessionResult {
  if (task.kind === 'load' && reply.kind === 'load') {
    if (!reply.result.ok) return { kind: 'load', result: reply.result };
    const { patch, ...result } = reply.result;
    return { kind: 'load', result: { ...result, state: { ...task.state,
      status: patch.status, runtimeState: patch.runtimeState, historySession: patch.historySession,
      schedulerSession: patch.schedulerSession, playback: patch.playback, hostState: patch.hostState,
      currentEvent: patch.currentEvent, diagnostics: patch.diagnostics, replayEntries: patch.replayEntries,
      checkpointSaveCandidates: patch.checkpointSaveCandidates, deferredCheckpointSaveCandidates: patch.deferredCheckpointSaveCandidates
    } } };
  }
  if (reply.kind === 'load') throw new Error('Session result kind mismatch');
  return reply;
}
/** The same public validators, including history chains, identities and monotonic Meta Progress. */
export function executeForegroundSessionTask(task:ForegroundSessionTask):ForegroundSessionResult {
  if (task.kind === 'advance') return { kind: 'advance', result: executeStoryAdvance(task.state) };
  if (task.kind === 'protect') return { kind: 'protect', result: prepareHistoryProtection(task.state, task.retainedBackSteps) };
  return task.kind==="save"?{kind:"save",result:createRecoverySession(task.source)}:{kind:"load",result:loadPlayerCoreSessionSaveV1(task.state,task.serialized)};
}

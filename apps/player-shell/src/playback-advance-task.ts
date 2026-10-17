import { schedulePlayerCorePlaybackV1, type PlayerCoreState, type PlayerCorePlaybackPolicyV1 } from '@world-studio/player-core';
import { canOffloadStoryAdvance, type StoryAdvancePatch, type StoryAdvanceResult } from './story-advance-task';

export const canOffloadPlaybackAdvance = canOffloadStoryAdvance;

/** The host has already satisfied the real reading/voice clock. This pure task
 * owns no timers, physical media, stores or reusable validation conclusion. */
export function executePlaybackAdvance(state: PlayerCoreState, policy: PlayerCorePlaybackPolicyV1): StoryAdvanceResult {
  if (state.status !== 'presenting' || state.replaySession !== null || !state.artifacts || !state.runtimeState || !state.historySession || state.historySession.cursor !== state.historySession.entries.length) throw Error('Playback boundary changed');
  const next = schedulePlayerCorePlaybackV1(state, policy);
  if (next.status === 'error') return { ok: false, diagnostics: next.diagnostics };
  const patch: StoryAdvancePatch = { status: next.status, runtimeState: next.runtimeState, historySession: next.historySession,
    schedulerSession: next.schedulerSession, playback: next.playback, hostState: next.hostState, currentEvent: next.currentEvent,
    checkpointSaveCandidates: next.checkpointSaveCandidates, deferredCheckpointSaveCandidates: next.deferredCheckpointSaveCandidates,
    diagnostics: next.diagnostics, replayEntries: next.replayEntries };
  return { ok: true, sourceHash: state.historySession.checkpoints[state.historySession.cursor]!.stateHash, replayEntriesUnchanged: next.replayEntries === state.replayEntries, patch };
}

/** Envelope/ownership checks only. A legitimate unread/stop-point batch may
 * execute zero instructions; scheduler counters must survive the round trip. */
export function validPlaybackAdvanceReply(state: PlayerCoreState, policy: PlayerCorePlaybackPolicyV1, result: Extract<StoryAdvanceResult, { ok: true }>): boolean {
  const patch = result.patch, history = patch?.historySession, runtime = patch?.runtimeState, source = state.historySession, scheduler = patch?.schedulerSession;
  const keys: readonly (keyof StoryAdvancePatch)[] = ['status', 'runtimeState', 'historySession', 'schedulerSession', 'playback', 'hostState', 'currentEvent', 'checkpointSaveCandidates', 'deferredCheckpointSaveCandidates', 'diagnostics', 'replayEntries'];
  return source !== null && state.runtimeState !== null && patch != null &&
    Object.keys(patch).length === keys.length && keys.every(key => Object.hasOwn(patch, key)) &&
    typeof result.replayEntriesUnchanged === 'boolean' && (!result.replayEntriesUnchanged || Array.isArray(patch.replayEntries) && patch.replayEntries.length === state.replayEntries.length && patch.replayEntries.every((entry, i) => entry.checksum === state.replayEntries[i]?.checksum)) &&
    result.sourceHash === source.checkpoints[source.cursor]?.stateHash &&
    history?.projectId === source.projectId && history.buildId === source.buildId && history.executionId === source.executionId &&
    runtime?.projectId === source.projectId && runtime.buildId === source.buildId && runtime.executionId === source.executionId &&
    Array.isArray(history.entries) && Array.isArray(history.checkpoints) && history.checkpoints.length === history.entries.length + 1 &&
    Number.isSafeInteger(history.cursor) && history.cursor === history.entries.length && history.cursor >= source.cursor &&
    Number.isSafeInteger(runtime.stateRevision) && runtime.stateRevision >= state.runtimeState.stateRevision &&
    scheduler?.history === history && Number.isSafeInteger(scheduler.accumulatedInstructions) && scheduler.accumulatedInstructions >= 0 &&
    patch.playback?.mode === policy.mode && patch.playback.speed === policy.speed && patch.playback.skipActivation === policy.skipActivation &&
    ['presenting', 'waiting-choice', 'waiting-effect', 'waiting-barrier', 'ended'].includes(patch.status) && patch.hostState != null &&
    Array.isArray(patch.diagnostics) && Array.isArray(patch.replayEntries) && Array.isArray(patch.checkpointSaveCandidates) && Array.isArray(patch.deferredCheckpointSaveCandidates);
}

import { advancePlayerCore, type PlayerCoreState } from '@world-studio/player-core';

export type StoryAdvancePatch = Pick<PlayerCoreState, 'status' | 'runtimeState' | 'historySession' | 'schedulerSession' | 'playback' | 'hostState' | 'currentEvent' | 'checkpointSaveCandidates' | 'deferredCheckpointSaveCandidates' | 'diagnostics' | 'replayEntries'>;
export type StoryAdvanceResult = { readonly ok: true; readonly sourceHash: string; readonly replayEntriesUnchanged: boolean; readonly patch: StoryAdvancePatch } | { readonly ok: false; readonly diagnostics: PlayerCoreState['diagnostics'] };
const patchKeys = ['status', 'runtimeState', 'historySession', 'schedulerSession', 'playback', 'hostState', 'currentEvent', 'checkpointSaveCandidates', 'deferredCheckpointSaveCandidates', 'diagnostics', 'replayEntries'];

/** Shared structural eligibility for live-end computation. The ordinary and
 * Auto/Skip hooks separately enforce their clocks and ownership. Start,
 * recorded future, replay and pending media retain their current paths.
 * 480 is a measured scope, not a physical-device capacity claim.
 */
export function canOffloadStoryAdvance(state: PlayerCoreState): boolean {
  return typeof Worker === 'function' && state.status === 'presenting' && state.replaySession === null && state.artifacts !== null &&
    state.historySession !== null && state.historySession.entries.length >= 480 && state.historySession.cursor === state.historySession.entries.length;
}

export function storyAdvanceSource(state: PlayerCoreState): PlayerCoreState {
  // Exclude unrelated owner extensions, but preserve every actual Core input.
  return { status: state.status, projectId: state.projectId, title: state.title, artifacts: state.artifacts,
    compatibleSaveBuildIds: state.compatibleSaveBuildIds, runtimeState: state.runtimeState, retainedMetaProgress: state.retainedMetaProgress,
    historySession: state.historySession, historyPolicy: state.historyPolicy, localization: state.localization,
    schedulerSession: state.schedulerSession, playback: state.playback, hostState: state.hostState, currentEvent: state.currentEvent,
    checkpointSaveCandidates: state.checkpointSaveCandidates, deferredCheckpointSaveCandidates: state.deferredCheckpointSaveCandidates,
    checkpointSaveMode: state.checkpointSaveMode, diagnostics: state.diagnostics, replaySession: state.replaySession,
    replayError: state.replayError, replayEntries: state.replayEntries };
}

export function executeStoryAdvance(state: PlayerCoreState): StoryAdvanceResult {
  if (state.status !== 'presenting' || state.replaySession !== null || state.artifacts === null || state.historySession === null || state.runtimeState === null || state.historySession.cursor !== state.historySession.entries.length) throw Error('Story advance boundary changed');
  const sourceHash = state.historySession.checkpoints[state.historySession.cursor]!.stateHash;
  // This public Core entry performs the complete Runtime history validation,
  // hashing, checkpoint preparation and pure presentation-host coordination.
  const next = advancePlayerCore(state);
  if (next.status === 'error') return { ok: false, diagnostics: next.diagnostics };
  return { ok: true, sourceHash, replayEntriesUnchanged: next.replayEntries === state.replayEntries, patch: { status: next.status, runtimeState: next.runtimeState, historySession: next.historySession,
    schedulerSession: next.schedulerSession, playback: next.playback, hostState: next.hostState, currentEvent: next.currentEvent,
    checkpointSaveCandidates: next.checkpointSaveCandidates, deferredCheckpointSaveCandidates: next.deferredCheckpointSaveCandidates,
    diagnostics: next.diagnostics, replayEntries: next.replayEntries } };
}

/** Transport envelope checks, not a second validation or a reusable trust token.
 * The owned worker executes the public validator on every independent request.
 */
export function validStoryAdvanceReply(state: PlayerCoreState, result: Extract<StoryAdvanceResult, { ok: true }>): boolean {
  const patch = result.patch, history = patch?.historySession, runtime = patch?.runtimeState, source = state.historySession;
  return source !== null && state.runtimeState !== null && patch != null &&
    typeof result.replayEntriesUnchanged === 'boolean' && (!result.replayEntriesUnchanged || Array.isArray(patch.replayEntries) && patch.replayEntries.length === state.replayEntries.length && patch.replayEntries.every((entry, i) => entry.checksum === state.replayEntries[i]?.checksum)) &&
    Object.keys(patch).length === patchKeys.length && patchKeys.every(key => Object.hasOwn(patch, key)) &&
    result.sourceHash === source.checkpoints[source.cursor]?.stateHash &&
    history?.projectId === source.projectId && history.buildId === source.buildId && history.executionId === source.executionId &&
    runtime?.projectId === source.projectId && runtime.buildId === source.buildId && runtime.executionId === source.executionId &&
    Array.isArray(history.entries) && Array.isArray(history.checkpoints) && history.checkpoints.length === history.entries.length + 1 &&
    Number.isSafeInteger(history.cursor) && history.cursor === history.entries.length && history.cursor > source.cursor &&
    Number.isSafeInteger(runtime.stateRevision) && runtime.stateRevision > state.runtimeState.stateRevision && history.checkpoints[history.cursor]?.state?.stateRevision === runtime.stateRevision &&
    ['presenting', 'waiting-choice', 'waiting-effect', 'waiting-barrier', 'ended'].includes(patch.status) &&
    patch.schedulerSession === null && patch.playback?.mode === 'normal' && patch.hostState != null &&
    Array.isArray(patch.diagnostics) && Array.isArray(patch.replayEntries) && Array.isArray(patch.checkpointSaveCandidates) && Array.isArray(patch.deferredCheckpointSaveCandidates);
}

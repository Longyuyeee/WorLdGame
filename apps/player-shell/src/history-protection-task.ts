import { compactPlayerCoreHistoryV1, type PlayerCoreState } from '@world-studio/player-core';
import { createRecoverySession, type RecoverySessionResult } from './recovery-session-task';

export type HistoryProtectionResult = RecoverySessionResult & {
  readonly historySession: NonNullable<PlayerCoreState['historySession']>;
  readonly playback: PlayerCoreState['playback'];
};

/** Compute a full durable backup and a proposed compacted history. The Shell
 * may apply this proposal only after writing the backup for the same live state.
 */
export function prepareHistoryProtection(state: PlayerCoreState, retainedBackSteps: number): HistoryProtectionResult {
  if (!Number.isSafeInteger(retainedBackSteps) || retainedBackSteps < 1) throw Error('Invalid history window');
  const saved = createRecoverySession(state);
  const compacted = compactPlayerCoreHistoryV1(state, retainedBackSteps);
  if (compacted === state || compacted.historySession === null) throw Error('History cannot be compacted');
  return { ...saved, historySession: compacted.historySession, playback: compacted.playback };
}

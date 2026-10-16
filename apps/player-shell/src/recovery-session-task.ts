import { createPlayerCoreSessionSaveV1 } from "@world-studio/player-core";

export type RecoverySessionSource = Parameters<typeof createPlayerCoreSessionSaveV1>[0];
export type RecoverySessionResult = Extract<ReturnType<typeof createPlayerCoreSessionSaveV1>, { ok: true }>;

/** Transport only the serializer's actual inputs. Never clone unrelated build
 * catalogs, replay archives, media host operations or queued checkpoint saves.
 * Keep the complete history and current state; the worker validates them all.
 */
export function recoverySessionSource(source: RecoverySessionSource): RecoverySessionSource {
  return { artifacts: source.artifacts === null ? null : { story: source.artifacts.story }, historySession: source.historySession, runtimeState: source.runtimeState, replaySession: source.replaySession };
}

/** The worker uses the same public, fully validating serializer as manual saves. */
export function createRecoverySession(source: RecoverySessionSource): RecoverySessionResult {
  const result = createPlayerCoreSessionSaveV1(source);
  if (!result.ok) throw new Error("WORLD_PLAYER_RECOVERY_SESSION_INVALID");
  return result;
}

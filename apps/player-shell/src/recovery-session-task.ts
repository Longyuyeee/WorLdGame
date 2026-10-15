import { createPlayerCoreSessionSaveV1 } from "@world-studio/player-core";

export type RecoverySessionSource = Parameters<typeof createPlayerCoreSessionSaveV1>[0];
export type RecoverySessionResult = Extract<ReturnType<typeof createPlayerCoreSessionSaveV1>, { ok: true }>;

/** The worker uses the same public, fully validating serializer as manual saves. */
export function createRecoverySession(source: RecoverySessionSource): RecoverySessionResult {
  const result = createPlayerCoreSessionSaveV1(source);
  if (!result.ok) throw new Error("WORLD_PLAYER_RECOVERY_SESSION_INVALID");
  return result;
}

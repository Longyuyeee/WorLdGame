export const WORLD_PLAYER_PLAYBACK_POLICY_VERSION = "1.0.0" as const;

export interface WorldPlayerPlaybackPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyVersion: typeof WORLD_PLAYER_PLAYBACK_POLICY_VERSION;
  readonly auto: {
    readonly baseDelayMilliseconds: number;
    readonly millisecondsPerReadableUnit: number;
    readonly voiceTailMilliseconds: number;
    readonly instantInstructionBudget: number;
  };
}

export const DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1: WorldPlayerPlaybackPolicyV1 = {
  schemaVersion: 1,
  policyVersion: WORLD_PLAYER_PLAYBACK_POLICY_VERSION,
  auto: {
    baseDelayMilliseconds: 500,
    millisecondsPerReadableUnit: 30,
    voiceTailMilliseconds: 200,
    instantInstructionBudget: 128
  }
};

export function validateWorldPlayerPlaybackPolicyV1(policy: WorldPlayerPlaybackPolicyV1): boolean {
  const auto = policy.auto;
  return policy.schemaVersion === 1 && policy.policyVersion === WORLD_PLAYER_PLAYBACK_POLICY_VERSION &&
    Number.isSafeInteger(auto.baseDelayMilliseconds) && auto.baseDelayMilliseconds >= 0 &&
    Number.isSafeInteger(auto.millisecondsPerReadableUnit) && auto.millisecondsPerReadableUnit >= 0 &&
    Number.isSafeInteger(auto.voiceTailMilliseconds) && auto.voiceTailMilliseconds >= 0 &&
    Number.isSafeInteger(auto.instantInstructionBudget) && auto.instantInstructionBudget >= 1 && auto.instantInstructionBudget <= 4096;
}

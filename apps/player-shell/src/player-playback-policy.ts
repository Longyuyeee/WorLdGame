export const WORLD_PLAYER_PLAYBACK_POLICY_VERSION = "1.1.0" as const;

export type WorldPlayerSkipActivationV1 = "hold" | "toggle";
export type WorldPlayerSkipSpeedV1 = 5 | 10 | 20 | 40 | "instant";

export interface WorldPlayerPlaybackPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyVersion: typeof WORLD_PLAYER_PLAYBACK_POLICY_VERSION;
  readonly auto: {
    readonly baseDelayMilliseconds: number;
    readonly millisecondsPerReadableUnit: number;
    readonly voiceTailMilliseconds: number;
    readonly instantInstructionBudget: number;
  };
  readonly skip: {
    readonly defaultActivation: WorldPlayerSkipActivationV1;
    readonly defaultSpeed: WorldPlayerSkipSpeedV1;
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
  },
  skip: { defaultActivation: "toggle", defaultSpeed: 20, instantInstructionBudget: 128 }
};

export function validateWorldPlayerPlaybackPolicyV1(policy: WorldPlayerPlaybackPolicyV1): boolean {
  const auto = policy.auto;
  const skip = policy.skip;
  if (auto === undefined || skip === undefined) return false;
  const validSkipSpeed = skip.defaultSpeed === "instant" || [5, 10, 20, 40].includes(skip.defaultSpeed as number);
  return policy.schemaVersion === 1 && policy.policyVersion === WORLD_PLAYER_PLAYBACK_POLICY_VERSION &&
    Number.isSafeInteger(auto.baseDelayMilliseconds) && auto.baseDelayMilliseconds >= 0 &&
    Number.isSafeInteger(auto.millisecondsPerReadableUnit) && auto.millisecondsPerReadableUnit >= 0 &&
    Number.isSafeInteger(auto.voiceTailMilliseconds) && auto.voiceTailMilliseconds >= 0 &&
    Number.isSafeInteger(auto.instantInstructionBudget) && auto.instantInstructionBudget >= 1 && auto.instantInstructionBudget <= 4096 &&
    (skip.defaultActivation === "hold" || skip.defaultActivation === "toggle") && validSkipSpeed &&
    Number.isSafeInteger(skip.instantInstructionBudget) && skip.instantInstructionBudget >= 1 && skip.instantInstructionBudget <= 4096;
}

import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1,
  WORLD_PLAYER_PLAYBACK_POLICY_VERSION,
  validateWorldPlayerPlaybackPolicyV1,
  type WorldPlayerPlaybackPolicyV1
} from "./player-playback-policy";

describe("N52-E4b Player Playback Policy", () => {
  it("publishes one versioned, valid default Auto policy", () => {
    expect(DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1).toEqual({
      schemaVersion: 1,
      policyVersion: WORLD_PLAYER_PLAYBACK_POLICY_VERSION,
      auto: {
        baseDelayMilliseconds: 500,
        millisecondsPerReadableUnit: 30,
        voiceTailMilliseconds: 200,
        instantInstructionBudget: 128
      }
    });
    expect(validateWorldPlayerPlaybackPolicyV1(DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1)).toBe(true);
  });

  it.each([
    { schemaVersion: 2 },
    { policyVersion: "2.0.0" },
    { auto: { baseDelayMilliseconds: -1 } },
    { auto: { millisecondsPerReadableUnit: 0.5 } },
    { auto: { voiceTailMilliseconds: Number.POSITIVE_INFINITY } },
    { auto: { instantInstructionBudget: 0 } },
    { auto: { instantInstructionBudget: 4097 } }
  ])("fails closed for an invalid persisted policy fragment: $schemaVersion$policyVersion", (fragment) => {
    const policy = {
      ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1,
      ...fragment,
      auto: {
        ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto,
        ...(fragment.auto ?? {})
      }
    } as WorldPlayerPlaybackPolicyV1;
    expect(validateWorldPlayerPlaybackPolicyV1(policy)).toBe(false);
  });
});

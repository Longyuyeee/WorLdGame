import { describe, expect, it } from "vitest";
import type { RuntimeEffectIntentV1, RuntimeHistoryReconciliationPlanV1 } from "@world-studio/runtime";
import {
  consumeRuntimePresentationEffectsV1,
  createRuntimePresentationHostSnapshotV1,
  createRuntimePresentationHostStateV1,
  reconcileRuntimePresentationHostV1,
  settleRuntimePresentationEffectV1,
  validateRuntimePresentationHostStateV1
} from "./host";
import { executeRuntimePresentationHostConformanceV1 } from "./conformance";

function effect(overrides: Partial<RuntimeEffectIntentV1> = {}): RuntimeEffectIntentV1 {
  return {
    effectId: "effect.1", executionId: "execution.1", originatingRevision: 1, logicalSequence: 0,
    descriptorId: "background.set", channel: "background", kind: "background.set", payload: { asset: "bg.school", z: 1 },
    policy: "reversible", awaitMode: "awaited", cancellationScope: "scope.scene", replayKey: "replay.background",
    compensation: { kind: "background.restore", payload: {} }, ...overrides
  };
}

describe("portable Runtime Presentation Host", () => {
  it("consumes and settles intents idempotently without leaving a cancelled channel active", () => {
    const intent = effect();
    let state = consumeRuntimePresentationEffectsV1(createRuntimePresentationHostStateV1(), [intent, intent]);
    expect(state.operations.map((item) => item.kind)).toEqual(["execute"]);
    expect(state.activeByChannel.background?.effectId).toBe(intent.effectId);
    state = settleRuntimePresentationEffectV1(state, intent, "cancel");
    state = settleRuntimePresentationEffectV1(state, intent, "cancel");
    expect(state.operations.map((item) => item.kind)).toEqual(["execute", "cancel"]);
    expect(state.activeByChannel.background).toBeUndefined();
    state = consumeRuntimePresentationEffectsV1(state, [intent]);
    expect(state.operations.map((item) => item.kind)).toEqual(["execute", "cancel"]);
    expect(state.activeByChannel.background).toBeUndefined();
    expect(validateRuntimePresentationHostStateV1(state)).toEqual([]);
  });

  it("applies Back compensation and Forward replay from the exact restored checkpoint", () => {
    const intent = effect();
    const consumed = consumeRuntimePresentationEffectsV1(createRuntimePresentationHostStateV1(), [intent]);
    const back: RuntimeHistoryReconciliationPlanV1 = {
      schemaVersion: 1, direction: "back", fromCheckpointId: "cp.2", toCheckpointId: "cp.1", restoreCheckpointId: "cp.1",
      compensations: [{ effectId: intent.effectId, descriptorId: intent.descriptorId, channel: intent.channel, replayKey: intent.replayKey, compensation: intent.compensation! }], replayEffects: []
    };
    const compensated = reconcileRuntimePresentationHostV1(consumed, back);
    expect(compensated.checkpointId).toBe("cp.1");
    expect(compensated.operations.at(-1)?.kind).toBe("compensate");
    const replayed = reconcileRuntimePresentationHostV1(compensated, { ...back, direction: "forward", fromCheckpointId: "cp.1", toCheckpointId: "cp.2", restoreCheckpointId: "cp.2", compensations: [], replayEffects: [intent] }, [intent]);
    expect(replayed.operations.at(-1)?.kind).toBe("replay");
    expect(replayed.activeByChannel.background?.effectId).toBe(intent.effectId);
  });

  it("freezes a canonical snapshot and SHA-256 independent of record member insertion order", () => {
    const left = effect({ payload: { asset: "bg.school", z: 1 } });
    const right = effect({ payload: { z: 1, asset: "bg.school" } });
    const a = createRuntimePresentationHostSnapshotV1(consumeRuntimePresentationEffectsV1(createRuntimePresentationHostStateV1(), [left]));
    const b = createRuntimePresentationHostSnapshotV1(consumeRuntimePresentationEffectsV1(createRuntimePresentationHostStateV1(), [right]));
    expect(a).toEqual(b);
    expect(a.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects malformed sequence, channel, and active Effect identity", () => {
    const intent = effect();
    const valid = consumeRuntimePresentationEffectsV1(createRuntimePresentationHostStateV1(), [intent]);
    expect(validateRuntimePresentationHostStateV1({ ...valid, nextSequence: 0 })).toContain("HOST_SEQUENCE_INVALID");
    expect(validateRuntimePresentationHostStateV1({ ...valid, activeByChannel: { music: intent } })).toContain("HOST_CHANNEL_MISMATCH");
    expect(validateRuntimePresentationHostStateV1({ ...valid, operations: [{ ...valid.operations[0]!, effectId: "other" }] })).toContain("HOST_ACTIVE_EFFECT_MISSING_EXECUTE");
  });

  it("keeps a long-lived active channel valid after the bounded operation log rolls over", () => {
    let state = consumeRuntimePresentationEffectsV1(createRuntimePresentationHostStateV1(), [effect({ channel: "legacy" })]);
    for (let index = 0; index < 1_000; index += 1) {
      state = consumeRuntimePresentationEffectsV1(state, [effect({
        effectId: `effect.${index + 2}`,
        executionId: `execution.${index + 2}`,
        logicalSequence: index + 1,
        replayKey: `replay.${index + 2}`
      })]);
    }
    expect(state.operations).toHaveLength(1_000);
    expect(state.operations[0]?.sequence).toBe(1);
    expect(state.activeByChannel.legacy?.effectId).toBe("effect.1");
    expect(validateRuntimePresentationHostStateV1(state)).toEqual([]);
  });

  it("freezes the cross-host conformance vector", () => {
    expect(executeRuntimePresentationHostConformanceV1()).toEqual({
      schemaVersion: 1,
      hostVersion: "0.1.0",
      checkpointId: "checkpoint.2",
      activeChannels: ["background"],
      operationKinds: ["execute", "execute", "complete", "compensate", "replay"],
      snapshotHash: "e84fe19367494828020b5802367dc036d3667eb570dc7479fa371d7e4d5532cd"
    });
  });
});

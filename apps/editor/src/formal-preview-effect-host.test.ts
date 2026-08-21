import { describe, expect, it } from "vitest";
import type { RuntimeEffectIntentV1, RuntimeHistoryReconciliationPlanV1 } from "@world-studio/runtime";
import {
  consumeFormalPreviewEffects,
  createFormalPreviewEffectHostState,
  reconcileFormalPreviewEffectHost,
  settleFormalPreviewEffect
} from "./formal-preview-effect-host";

function effect(overrides: Partial<RuntimeEffectIntentV1> = {}): RuntimeEffectIntentV1 {
  return {
    effectId: "effect.1", executionId: "execution.1", originatingRevision: 1, logicalSequence: 0,
    descriptorId: "background.set", channel: "background", kind: "background.set", payload: { asset: "bg.school" },
    policy: "reversible", awaitMode: "awaited", cancellationScope: "scope.scene", replayKey: "replay.background",
    compensation: { kind: "background.restore", payload: {} }, ...overrides
  };
}

describe("formal Preview Effect Host", () => {
  it("consumes each intent idempotently and safely settles awaited work", () => {
    const intent = effect();
    let host = consumeFormalPreviewEffects(createFormalPreviewEffectHostState(), [intent, intent]);
    expect(host.operations.map((item) => item.kind)).toEqual(["execute"]);
    expect(host.activeByChannel.background?.effectId).toBe(intent.effectId);
    host = settleFormalPreviewEffect(host, intent, "cancel");
    host = settleFormalPreviewEffect(host, intent, "cancel");
    expect(host.operations.map((item) => item.kind)).toEqual(["execute", "cancel"]);
    expect(host.activeByChannel.background).toBeUndefined();
  });

  it("executes Back compensation and Forward replay plans against the restored checkpoint", () => {
    const intent = effect();
    const consumed = consumeFormalPreviewEffects(createFormalPreviewEffectHostState(), [intent]);
    const back: RuntimeHistoryReconciliationPlanV1 = {
      schemaVersion: 1, direction: "back", fromCheckpointId: "cp.2", toCheckpointId: "cp.1", restoreCheckpointId: "cp.1",
      compensations: [{ effectId: intent.effectId, descriptorId: intent.descriptorId, channel: intent.channel, replayKey: intent.replayKey, compensation: intent.compensation! }], replayEffects: []
    };
    const compensated = reconcileFormalPreviewEffectHost(consumed, back);
    expect(compensated.checkpointId).toBe("cp.1");
    expect(compensated.operations.at(-1)?.kind).toBe("compensate");
    expect(compensated.activeByChannel.background).toBeUndefined();
    const replayed = reconcileFormalPreviewEffectHost(compensated, { ...back, direction: "forward", fromCheckpointId: "cp.1", toCheckpointId: "cp.2", restoreCheckpointId: "cp.2", compensations: [], replayEffects: [intent] }, [intent]);
    expect(replayed.operations.at(-1)?.kind).toBe("replay");
    expect(replayed.activeByChannel.background?.effectId).toBe(intent.effectId);
  });
});

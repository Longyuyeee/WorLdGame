import type { RuntimeEffectIntentV1, RuntimeHistoryReconciliationPlanV1 } from "@world-studio/runtime";
import {
  consumeRuntimePresentationEffectsV1,
  createRuntimePresentationHostSnapshotV1,
  createRuntimePresentationHostStateV1,
  reconcileRuntimePresentationHostV1,
  settleRuntimePresentationEffectV1
} from "./host";

export interface RuntimePresentationHostConformanceResultV1 {
  readonly schemaVersion: 1;
  readonly hostVersion: "0.1.0";
  readonly checkpointId: "checkpoint.2";
  readonly activeChannels: readonly ["background"];
  readonly operationKinds: readonly ["execute", "execute", "complete", "compensate", "replay"];
  readonly snapshotHash: string;
}

function effect(overrides: Partial<RuntimeEffectIntentV1> = {}): RuntimeEffectIntentV1 {
  return {
    effectId: "effect.background", executionId: "execution.host", originatingRevision: 1, logicalSequence: 0,
    descriptorId: "background.set", channel: "background", kind: "background.set", payload: { asset: "bg.school" },
    policy: "reversible", awaitMode: "detached", cancellationScope: "scope.scene", replayKey: "replay.background",
    compensation: { kind: "background.restore", payload: { asset: "bg.previous" } }, ...overrides
  };
}

export function executeRuntimePresentationHostConformanceV1(): RuntimePresentationHostConformanceResultV1 {
  const background = effect();
  const voice = effect({
    effectId: "effect.voice", logicalSequence: 1, descriptorId: "voice.play", channel: "voice", kind: "voice.play",
    payload: { asset: "voice.greeting" }, policy: "pure", awaitMode: "awaited", replayKey: "replay.voice", compensation: null
  });
  let state = consumeRuntimePresentationEffectsV1(createRuntimePresentationHostStateV1(), [background, voice, background]);
  state = settleRuntimePresentationEffectV1(state, voice, "complete");
  const back: RuntimeHistoryReconciliationPlanV1 = {
    schemaVersion: 1, direction: "back", fromCheckpointId: "checkpoint.2", toCheckpointId: "checkpoint.1", restoreCheckpointId: "checkpoint.1",
    compensations: [{ effectId: background.effectId, descriptorId: background.descriptorId, channel: background.channel, replayKey: background.replayKey, compensation: background.compensation! }], replayEffects: []
  };
  state = reconcileRuntimePresentationHostV1(state, back);
  state = reconcileRuntimePresentationHostV1(state, {
    ...back, direction: "forward", fromCheckpointId: "checkpoint.1", toCheckpointId: "checkpoint.2", restoreCheckpointId: "checkpoint.2", compensations: [], replayEffects: [background]
  }, [background]);
  const result = createRuntimePresentationHostSnapshotV1(state);
  const operationKinds = result.snapshot.operations.map((operation) => operation.kind);
  if (JSON.stringify(operationKinds) !== JSON.stringify(["execute", "execute", "complete", "compensate", "replay"])) {
    throw new TypeError(`Runtime Presentation Host operation sequence differs: ${JSON.stringify(operationKinds)}`);
  }
  return {
    schemaVersion: 1,
    hostVersion: "0.1.0",
    checkpointId: "checkpoint.2",
    activeChannels: ["background"],
    operationKinds: ["execute", "execute", "complete", "compensate", "replay"],
    snapshotHash: result.snapshotHash
  };
}

import type {
  RuntimeEffectIntentV1,
  RuntimeHistoryReconciliationPlanV1
} from "@world-studio/runtime";

export type FormalPreviewEffectHostOperationKind = "execute" | "complete" | "cancel" | "compensate" | "replay";

export interface FormalPreviewEffectHostOperation {
  readonly sequence: number;
  readonly kind: FormalPreviewEffectHostOperationKind;
  readonly effectId: string;
  readonly descriptorId: string;
  readonly channel: string;
  readonly replayKey: string;
}

export interface FormalPreviewEffectHostState {
  readonly schemaVersion: 1;
  readonly nextSequence: number;
  readonly checkpointId: string | null;
  readonly activeByChannel: Readonly<Record<string, RuntimeEffectIntentV1>>;
  readonly operations: readonly FormalPreviewEffectHostOperation[];
}

const MAX_HOST_OPERATIONS = 1_000;

export function createFormalPreviewEffectHostState(): FormalPreviewEffectHostState {
  return { schemaVersion: 1, nextSequence: 0, checkpointId: null, activeByChannel: {}, operations: [] };
}

function append(
  state: FormalPreviewEffectHostState,
  kind: FormalPreviewEffectHostOperationKind,
  effect: Pick<RuntimeEffectIntentV1, "effectId" | "descriptorId" | "channel" | "replayKey">
): FormalPreviewEffectHostState {
  if (state.operations.some((operation) => operation.kind === kind && operation.effectId === effect.effectId)) return state;
  const operation: FormalPreviewEffectHostOperation = {
    sequence: state.nextSequence,
    kind,
    effectId: effect.effectId,
    descriptorId: effect.descriptorId,
    channel: effect.channel,
    replayKey: effect.replayKey
  };
  return { ...state, nextSequence: state.nextSequence + 1, operations: [...state.operations.slice(-(MAX_HOST_OPERATIONS - 1)), operation] };
}

function activate(state: FormalPreviewEffectHostState, effect: RuntimeEffectIntentV1): FormalPreviewEffectHostState {
  return { ...state, activeByChannel: { ...state.activeByChannel, [effect.channel]: effect } };
}

export function consumeFormalPreviewEffects(
  state: FormalPreviewEffectHostState,
  effects: readonly RuntimeEffectIntentV1[]
): FormalPreviewEffectHostState {
  let next = state;
  for (const effect of effects) {
    next = append(next, "execute", effect);
    next = activate(next, effect);
  }
  return next;
}

export function settleFormalPreviewEffect(
  state: FormalPreviewEffectHostState,
  effect: RuntimeEffectIntentV1,
  outcome: "complete" | "cancel"
): FormalPreviewEffectHostState {
  let next = append(state, outcome, effect);
  if (outcome === "cancel" && next.activeByChannel[effect.channel]?.effectId === effect.effectId) {
    const activeByChannel = { ...next.activeByChannel };
    delete activeByChannel[effect.channel];
    next = { ...next, activeByChannel };
  }
  return next;
}

export function rebaseFormalPreviewEffectHost(
  state: FormalPreviewEffectHostState,
  checkpointEffects: readonly RuntimeEffectIntentV1[]
): FormalPreviewEffectHostState {
  const activeByChannel: Record<string, RuntimeEffectIntentV1> = {};
  for (const effect of checkpointEffects) activeByChannel[effect.channel] = effect;
  return { ...state, activeByChannel };
}

export function reconcileFormalPreviewEffectHost(
  state: FormalPreviewEffectHostState,
  plan: RuntimeHistoryReconciliationPlanV1,
  checkpointEffects: readonly RuntimeEffectIntentV1[] = []
): FormalPreviewEffectHostState {
  const activeByChannel: Record<string, RuntimeEffectIntentV1> = {};
  for (const effect of checkpointEffects) activeByChannel[effect.channel] = effect;
  let next: FormalPreviewEffectHostState = { ...state, checkpointId: plan.restoreCheckpointId, activeByChannel };
  for (const item of plan.compensations) {
    next = append(next, "compensate", {
      effectId: item.effectId,
      descriptorId: item.descriptorId,
      channel: item.channel,
      replayKey: item.replayKey
    });
    if (next.activeByChannel[item.channel]?.effectId === item.effectId) {
      const activeByChannel = { ...next.activeByChannel };
      delete activeByChannel[item.channel];
      next = { ...next, activeByChannel };
    }
  }
  for (const effect of plan.replayEffects) {
    next = append(next, "replay", effect);
    next = activate(next, effect);
  }
  return next;
}

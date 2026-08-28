import {
  canonicalRuntimeBytes,
  sha256Hex,
  utf8Encode,
  type RuntimeEffectIntentV1,
  type RuntimeHistoryReconciliationPlanV1
} from "@world-studio/runtime";

export const RUNTIME_PRESENTATION_HOST_VERSION = "0.1.0" as const;
export const MAX_RUNTIME_PRESENTATION_HOST_OPERATIONS = 1_000;

export type RuntimePresentationHostOperationKindV1 = "execute" | "complete" | "cancel" | "compensate" | "replay" | "rehydrate";

export interface RuntimePresentationHostOperationV1 {
  readonly sequence: number;
  readonly kind: RuntimePresentationHostOperationKindV1;
  readonly effectId: string;
  readonly descriptorId: string;
  readonly channel: string;
  readonly replayKey: string;
}

export interface RuntimePresentationHostStateV1 {
  readonly schemaVersion: 1;
  readonly hostVersion: typeof RUNTIME_PRESENTATION_HOST_VERSION;
  readonly nextSequence: number;
  readonly checkpointId: string | null;
  readonly activeByChannel: Readonly<Record<string, RuntimeEffectIntentV1>>;
  readonly operations: readonly RuntimePresentationHostOperationV1[];
}

export interface RuntimePresentationHostSnapshotV1 {
  readonly schemaVersion: 1;
  readonly hostVersion: typeof RUNTIME_PRESENTATION_HOST_VERSION;
  readonly checkpointId: string | null;
  readonly activeChannels: readonly { readonly channel: string; readonly effect: RuntimeEffectIntentV1 }[];
  readonly operations: readonly RuntimePresentationHostOperationV1[];
}

export interface RuntimePresentationHostSnapshotResultV1 {
  readonly snapshot: RuntimePresentationHostSnapshotV1;
  readonly snapshotHash: string;
}

export type RuntimePresentationHostValidationCodeV1 =
  | "HOST_SCHEMA_INVALID"
  | "HOST_VERSION_INVALID"
  | "HOST_SEQUENCE_INVALID"
  | "HOST_OPERATION_LIMIT"
  | "HOST_OPERATION_SEQUENCE_INVALID"
  | "HOST_OPERATION_DUPLICATE"
  | "HOST_CHANNEL_MISMATCH"
  | "HOST_ACTIVE_EFFECT_MISSING_EXECUTE";

export function createRuntimePresentationHostStateV1(): RuntimePresentationHostStateV1 {
  return { schemaVersion: 1, hostVersion: RUNTIME_PRESENTATION_HOST_VERSION, nextSequence: 0, checkpointId: null, activeByChannel: {}, operations: [] };
}

function appendOperation(
  state: RuntimePresentationHostStateV1,
  kind: RuntimePresentationHostOperationKindV1,
  effect: Pick<RuntimeEffectIntentV1, "effectId" | "descriptorId" | "channel" | "replayKey">
): RuntimePresentationHostStateV1 {
  if (state.operations.some((operation) => operation.kind === kind && operation.effectId === effect.effectId)) return state;
  const operation: RuntimePresentationHostOperationV1 = {
    sequence: state.nextSequence,
    kind,
    effectId: effect.effectId,
    descriptorId: effect.descriptorId,
    channel: effect.channel,
    replayKey: effect.replayKey
  };
  return { ...state, nextSequence: state.nextSequence + 1, operations: [...state.operations.slice(-(MAX_RUNTIME_PRESENTATION_HOST_OPERATIONS - 1)), operation] };
}

function activateEffect(state: RuntimePresentationHostStateV1, effect: RuntimeEffectIntentV1): RuntimePresentationHostStateV1 {
  return { ...state, activeByChannel: { ...state.activeByChannel, [effect.channel]: effect } };
}

export function consumeRuntimePresentationEffectsV1(
  state: RuntimePresentationHostStateV1,
  effects: readonly RuntimeEffectIntentV1[]
): RuntimePresentationHostStateV1 {
  let next = state;
  for (const effect of effects) {
    const appended = appendOperation(next, "execute", effect);
    if (appended !== next) next = activateEffect(appended, effect);
  }
  return next;
}

export function rehydrateRuntimePresentationHostV1(
  checkpointEffects: readonly RuntimeEffectIntentV1[],
  checkpointId: string
): RuntimePresentationHostStateV1 {
  let next: RuntimePresentationHostStateV1 = {
    ...createRuntimePresentationHostStateV1(),
    checkpointId
  };
  for (const effect of checkpointEffects) {
    const appended = appendOperation(next, "rehydrate", effect);
    if (appended !== next) next = activateEffect(appended, effect);
  }
  return next;
}

export function settleRuntimePresentationEffectV1(
  state: RuntimePresentationHostStateV1,
  effect: RuntimeEffectIntentV1,
  outcome: "complete" | "cancel"
): RuntimePresentationHostStateV1 {
  let next = appendOperation(state, outcome, effect);
  if (outcome === "cancel" && next.activeByChannel[effect.channel]?.effectId === effect.effectId) {
    const activeByChannel = { ...next.activeByChannel };
    delete activeByChannel[effect.channel];
    next = { ...next, activeByChannel };
  }
  return next;
}

export function rebaseRuntimePresentationHostV1(
  state: RuntimePresentationHostStateV1,
  checkpointEffects: readonly RuntimeEffectIntentV1[]
): RuntimePresentationHostStateV1 {
  const activeByChannel: Record<string, RuntimeEffectIntentV1> = {};
  for (const effect of checkpointEffects) activeByChannel[effect.channel] = effect;
  return { ...state, activeByChannel };
}

export function reconcileRuntimePresentationHostV1(
  state: RuntimePresentationHostStateV1,
  plan: RuntimeHistoryReconciliationPlanV1,
  checkpointEffects: readonly RuntimeEffectIntentV1[] = []
): RuntimePresentationHostStateV1 {
  const activeByChannel: Record<string, RuntimeEffectIntentV1> = {};
  for (const effect of checkpointEffects) activeByChannel[effect.channel] = effect;
  let next: RuntimePresentationHostStateV1 = { ...state, checkpointId: plan.restoreCheckpointId, activeByChannel };
  for (const item of plan.compensations) {
    next = appendOperation(next, "compensate", item);
    if (next.activeByChannel[item.channel]?.effectId === item.effectId) {
      const remaining = { ...next.activeByChannel };
      delete remaining[item.channel];
      next = { ...next, activeByChannel: remaining };
    }
  }
  for (const effect of plan.replayEffects) {
    const appended = appendOperation(next, "replay", effect);
    if (appended !== next) next = activateEffect(appended, effect);
  }
  return next;
}

export function validateRuntimePresentationHostStateV1(state: RuntimePresentationHostStateV1): readonly RuntimePresentationHostValidationCodeV1[] {
  const violations: RuntimePresentationHostValidationCodeV1[] = [];
  if (state.schemaVersion !== 1) violations.push("HOST_SCHEMA_INVALID");
  if (state.hostVersion !== RUNTIME_PRESENTATION_HOST_VERSION) violations.push("HOST_VERSION_INVALID");
  if (!Number.isSafeInteger(state.nextSequence) || state.nextSequence < 0 || state.nextSequence < state.operations.length) violations.push("HOST_SEQUENCE_INVALID");
  if (state.operations.length > MAX_RUNTIME_PRESENTATION_HOST_OPERATIONS) violations.push("HOST_OPERATION_LIMIT");
  const operationKeys = new Set<string>();
  let previousSequence = -1;
  for (const operation of state.operations) {
    if (!Number.isSafeInteger(operation.sequence) || operation.sequence <= previousSequence || operation.sequence >= state.nextSequence) violations.push("HOST_OPERATION_SEQUENCE_INVALID");
    previousSequence = operation.sequence;
    const key = `${operation.kind}\0${operation.effectId}`;
    if (operationKeys.has(key)) violations.push("HOST_OPERATION_DUPLICATE");
    operationKeys.add(key);
  }
  for (const [channel, effect] of Object.entries(state.activeByChannel)) {
    if (effect.channel !== channel) violations.push("HOST_CHANNEL_MISMATCH");
    if (
      state.nextSequence <= MAX_RUNTIME_PRESENTATION_HOST_OPERATIONS &&
      !state.operations.some((operation) => (operation.kind === "execute" || operation.kind === "rehydrate") && operation.effectId === effect.effectId)
    ) violations.push("HOST_ACTIVE_EFFECT_MISSING_EXECUTE");
  }
  return [...new Set(violations)];
}

export function createRuntimePresentationHostSnapshotV1(state: RuntimePresentationHostStateV1): RuntimePresentationHostSnapshotResultV1 {
  const violations = validateRuntimePresentationHostStateV1(state);
  if (violations.length > 0) throw new TypeError(`Runtime Presentation Host State is invalid: ${violations.join(", ")}`);
  const snapshot: RuntimePresentationHostSnapshotV1 = {
    schemaVersion: 1,
    hostVersion: RUNTIME_PRESENTATION_HOST_VERSION,
    checkpointId: state.checkpointId,
    activeChannels: Object.entries(state.activeByChannel).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([channel, effect]) => ({ channel, effect })),
    operations: state.operations
  };
  const domain = utf8Encode("WORLd-RUNTIME-PRESENTATION-HOST\0v1\0");
  const payload = canonicalRuntimeBytes(snapshot);
  const bytes = new Uint8Array(domain.length + payload.length);
  bytes.set(domain); bytes.set(payload, domain.length);
  return { snapshot, snapshotHash: sha256Hex(bytes) };
}

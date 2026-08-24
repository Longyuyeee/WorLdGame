import { canonicalRuntimeStringify } from "./canonical";
import { commitRuntimeHistoryStepV1, validateRuntimeHistorySessionV1 } from "./history";
import { runRuntime, validateRuntimeStateStructureV1 } from "./runtime";
import {
  RUNTIME_VERSION,
  type CreateRuntimeSchedulerResultV1,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeProgramV1,
  type RuntimeSchedulePolicyV1,
  type RuntimeScheduleResultV1,
  type RuntimeScheduleStopReasonV1,
  type RuntimeSchedulerSessionV1,
  type RuntimeStateV1
} from "./types";

const canonicalId = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const sessionKeys = ["accumulatedInstructions", "baseCheckpointId", "history", "runtimeVersion", "schemaVersion", "workingState"];
const policyKeys = ["autoTiming", "instantInstructionBudget", "mode", "schemaVersion", "skipActivation", "speed", "stopInstructionIds", "unavailableEffectDescriptorIds"];
const timingKeys = ["baseDelayMilliseconds", "millisecondsPerReadableUnit", "readableUnits", "voiceDurationMilliseconds", "voiceTailMilliseconds"];

function diagnostic(message: string, state?: RuntimeStateV1): RuntimeDiagnosticV1 {
  return { code: "RUNTIME_SCHEDULER_INVALID", message, sceneId: state?.cursor.sceneId ?? null, instructionIndex: state?.cursor.instructionIndex ?? null, instructionId: null };
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function sortedIds(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && canonicalId.test(item)) && value.every((item, index) => index === 0 || String(value[index - 1]) < item);
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validatePolicy(policy: RuntimeSchedulePolicyV1): boolean {
  if (!record(policy) || !exactKeys(policy, policyKeys) || !record(policy.autoTiming) || !exactKeys(policy.autoTiming, timingKeys)) return false;
  const skip = policy.mode === "skipRead" || policy.mode === "skipAll";
  const speed = policy.speed === "normal" || policy.speed === "instant" || [5, 10, 20, 40].includes(policy.speed as number);
  const activation = policy.skipActivation === null || policy.skipActivation === "hold" || policy.skipActivation === "toggle";
  const timing = policy.autoTiming;
  return policy.schemaVersion === 1 && ["normal", "auto", "skipRead", "skipAll"].includes(policy.mode) && speed && activation &&
    (skip ? policy.skipActivation !== null && policy.speed !== "normal" : policy.skipActivation === null && policy.speed === "normal") &&
    sortedIds(policy.stopInstructionIds) && sortedIds(policy.unavailableEffectDescriptorIds) && Number.isSafeInteger(policy.instantInstructionBudget) && policy.instantInstructionBudget >= 1 && policy.instantInstructionBudget <= 4096 &&
    nonNegative(timing.baseDelayMilliseconds) && nonNegative(timing.millisecondsPerReadableUnit) && nonNegative(timing.readableUnits) && nonNegative(timing.voiceDurationMilliseconds) && nonNegative(timing.voiceTailMilliseconds);
}

function autoDelay(policy: RuntimeSchedulePolicyV1): number | null | "overflow" {
  if (policy.mode !== "auto") return null;
  const timing = policy.autoTiming;
  const readable = timing.baseDelayMilliseconds + timing.millisecondsPerReadableUnit * timing.readableUnits;
  const voiced = timing.voiceDurationMilliseconds + timing.voiceTailMilliseconds;
  const delay = Math.max(readable, voiced);
  return Number.isSafeInteger(delay) ? delay : "overflow";
}

function batchBudget(policy: RuntimeSchedulePolicyV1): number {
  if (policy.mode === "normal" || policy.mode === "auto" || policy.speed === "instant") return policy.instantInstructionBudget;
  return policy.speed as number;
}

function output(session: RuntimeSchedulerSessionV1, stopReason: RuntimeScheduleStopReasonV1, executedInstructions = 0, events: readonly RuntimeEventV1[] = [], effects: RuntimeScheduleResultV1["effects"] = [], diagnostics: readonly RuntimeDiagnosticV1[] = [], autoAdvanceDelayMilliseconds: number | null = null): RuntimeScheduleResultV1 {
  return { session, state: session.workingState, events, effects, diagnostics, stopReason, executedInstructions, autoAdvanceDelayMilliseconds };
}

export function createRuntimeSchedulerSessionV1(program: RuntimeProgramV1, history: RuntimeSchedulerSessionV1["history"]): CreateRuntimeSchedulerResultV1 {
  const diagnostics = validateRuntimeHistorySessionV1(program, history);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  if (history.cursor !== history.entries.length) return { ok: false, diagnostics: [{ code: "RUNTIME_HISTORY_FORWARD_REQUIRED", message: "Scheduler requires History at its latest checkpoint", sceneId: history.checkpoints[history.cursor]!.state.cursor.sceneId, instructionIndex: history.checkpoints[history.cursor]!.state.cursor.instructionIndex, instructionId: null }] };
  const checkpoint = history.checkpoints[history.cursor]!;
  return { ok: true, session: { schemaVersion: 1, runtimeVersion: RUNTIME_VERSION, history, baseCheckpointId: checkpoint.checkpointId, workingState: checkpoint.state, accumulatedInstructions: 0 } };
}

export function validateRuntimeSchedulerSessionV1(program: RuntimeProgramV1, session: RuntimeSchedulerSessionV1): readonly RuntimeDiagnosticV1[] {
  try {
    if (!record(session) || !exactKeys(session, sessionKeys)) return [diagnostic("Scheduler Session schema members are missing or unknown")];
    const historyDiagnostics = validateRuntimeHistorySessionV1(program, session.history);
    if (historyDiagnostics.length > 0) return historyDiagnostics;
    const current = session.history.checkpoints[session.history.cursor]!;
    const stateDiagnostics = validateRuntimeStateStructureV1(program, session.workingState);
    if (session.schemaVersion !== 1 || session.runtimeVersion !== RUNTIME_VERSION || session.history.cursor !== session.history.entries.length || session.baseCheckpointId !== current.checkpointId || stateDiagnostics.length > 0 || session.workingState.projectId !== current.state.projectId || session.workingState.buildId !== current.state.buildId || session.workingState.executionId !== current.state.executionId || !Number.isSafeInteger(session.accumulatedInstructions) || session.accumulatedInstructions < 0) return [diagnostic("Scheduler Session identity, working State, or counters are invalid", current.state)];
    if (session.accumulatedInstructions === 0 && canonicalRuntimeStringify(session.workingState) !== canonicalRuntimeStringify(current.state)) return [diagnostic("Idle Scheduler working State must equal its History checkpoint", current.state)];
    if (session.accumulatedInstructions > 0 && (session.workingState.terminal.kind === "ended" || session.workingState.pendingChoice !== null || session.workingState.pendingEffect !== null || session.workingState.pendingBarrier !== null)) return [diagnostic("Transient Scheduler State cannot contain an observable stop", current.state)];
    return [];
  } catch { return [diagnostic("Scheduler Session contains malformed or noncanonical data")]; }
}

export function scheduleRuntimeBatchV1(program: RuntimeProgramV1, initial: RuntimeSchedulerSessionV1, policy: RuntimeSchedulePolicyV1): RuntimeScheduleResultV1 {
  const validation = validateRuntimeSchedulerSessionV1(program, initial);
  if (validation.length > 0) return output(initial, "diagnostic", 0, [], [], validation);
  if (!validatePolicy(policy)) return output(initial, "diagnostic", 0, [], [], [diagnostic("Runtime schedule policy is not canonical or internally consistent", initial.workingState)]);
  const delay = autoDelay(policy);
  if (delay === "overflow") return output(initial, "diagnostic", 0, [], [], [diagnostic("Auto timing exceeds the safe integer range", initial.workingState)]);

  let current = initial;
  const events: RuntimeEventV1[] = [];
  const effects: RuntimeScheduleResultV1["effects"][number][] = [];
  let executedInBatch = 0;
  let remaining = batchBudget(policy);
  const stopIds = new Set(policy.stopInstructionIds), unavailable = new Set(policy.unavailableEffectDescriptorIds);

  while (remaining > 0) {
    const state = current.workingState;
    if (state.terminal.kind === "ended") return output(current, "terminal", executedInBatch, events, effects);
    if (state.pendingChoice !== null) return output(current, "input", executedInBatch, events, effects);
    if (state.pendingEffect !== null) return output(current, "effect", executedInBatch, events, effects);
    if (state.pendingBarrier !== null) return output(current, "barrier", executedInBatch, events, effects);

    const stepStart = current;
    const run = runRuntime(program, state, { instructionBudget: remaining });
    const onlyBudget = run.diagnostics.length === 1 && run.diagnostics[0]?.code === "RUNTIME_BUDGET_EXCEEDED";
    if (onlyBudget) {
      const next: RuntimeSchedulerSessionV1 = { ...current, workingState: run.state, accumulatedInstructions: current.accumulatedInstructions + run.executedInstructions };
      return output(next, "budget", executedInBatch + run.executedInstructions, events, effects);
    }
    if (run.diagnostics.length > 0) return output(current, "diagnostic", executedInBatch, events, effects, run.diagnostics);
    const descriptorUnavailable = run.effects.some((effect) => unavailable.has(effect.descriptorId)) || (run.barrierRequest !== null && unavailable.has(run.barrierRequest.descriptorId));
    if (descriptorUnavailable) return output(stepStart, "resourceUnavailable", executedInBatch, events, effects);

    const committed = commitRuntimeHistoryStepV1(program, current.history, run, current.accumulatedInstructions + run.executedInstructions);
    if (committed.diagnostics.length > 0) return output(current, "history", executedInBatch, events, effects, committed.diagnostics);
    current = { schemaVersion: 1, runtimeVersion: RUNTIME_VERSION, history: committed.session, baseCheckpointId: committed.session.checkpoints[committed.session.cursor]!.checkpointId, workingState: committed.state, accumulatedInstructions: 0 };
    executedInBatch += run.executedInstructions;
    remaining -= run.executedInstructions;
    if (run.event !== null) events.push(run.event);
    effects.push(...run.effects);

    const instructionId = run.event?.instructionId ?? run.barrierRequest?.instructionId ?? null;
    if (instructionId !== null && stopIds.has(instructionId)) return output(current, "stopPoint", executedInBatch, events, effects);
    if (run.state.pendingChoice !== null) return output(current, "input", executedInBatch, events, effects);
    if (run.state.pendingEffect !== null) return output(current, "effect", executedInBatch, events, effects);
    if (run.state.pendingBarrier !== null) return output(current, "barrier", executedInBatch, events, effects);
    if (run.state.terminal.kind === "ended") return output(current, "terminal", executedInBatch, events, effects);
    if (policy.mode === "normal" || policy.mode === "auto") return output(current, "storyBoundary", executedInBatch, events, effects, [], delay);
    if (policy.mode === "skipRead" && run.event !== null && (run.event.kind === "dialogue" || run.event.kind === "narration") && !state.metaProgress.readTextIds.includes(run.event.textId)) return output(current, "unreadBoundary", executedInBatch, events, effects);
  }
  return output(current, "budget", executedInBatch, events, effects);
}

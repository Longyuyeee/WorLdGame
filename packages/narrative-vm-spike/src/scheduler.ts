import { transitionPrevalidatedV0 } from "./transition";
import type {
  InstructionV0,
  ProgramV0,
  RuntimeSchedulePolicyV0,
  RuntimeScheduleResultV0,
  RuntimeStateV0,
  VmDiagnostic
} from "./types";
import { validateProgram, validateState } from "./validation";

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const SPEED_BUDGETS: Readonly<Record<string, number>> = {
  normal: 1,
  "5": 5,
  "10": 10,
  "20": 20,
  "40": 40
};

function invalid(state: RuntimeStateV0, detail: string): RuntimeScheduleResultV0 {
  const diagnostic: VmDiagnostic = {
    code: "VM_SCHEDULER_INVALID",
    ip: state.ip,
    sourceStatementId: null,
    detail
  };
  return {
    nextState: state,
    effects: [],
    waits: [],
    diagnostics: [diagnostic],
    stopReason: "diagnostic",
    executedInstructions: 0,
    autoAdvanceDelayTicks: null
  };
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function uniqueSafeIds(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && SAFE_ID.test(item)) &&
    new Set(value).size === value.length && value.every((item, index) => index === 0 ||
      String(value[index - 1]) < item);
}

function validPolicy(policy: RuntimeSchedulePolicyV0): boolean {
  if (!plainRecord(policy) || !exactKeys(policy, [
    "schemaVersion", "mode", "skipActivation", "speed", "readStepIds",
    "unavailableEffectDescriptorIds", "instantInstructionBudget", "autoTiming"
  ]) || !plainRecord(policy.autoTiming) || !exactKeys(policy.autoTiming, [
    "baseDelayTicks", "ticksPerReadableUnit", "voiceDurationTicks", "voiceTailTicks", "readableUnits"
  ])) return false;
  const modeValid = ["normal", "auto", "skipRead", "skipAll"].includes(policy.mode);
  const speedValid = policy.speed === "instant" || policy.speed === "normal" ||
    [5, 10, 20, 40].includes(policy.speed as number);
  const activationValid = policy.skipActivation === null || policy.skipActivation === "hold" ||
    policy.skipActivation === "toggle";
  const skipMode = policy.mode === "skipRead" || policy.mode === "skipAll";
  const timing = policy.autoTiming;
  return policy.schemaVersion === 0 && modeValid && speedValid && activationValid &&
    (skipMode ? policy.skipActivation !== null && policy.speed !== "normal" :
      policy.skipActivation === null && policy.speed === "normal") &&
    uniqueSafeIds(policy.readStepIds) && uniqueSafeIds(policy.unavailableEffectDescriptorIds) &&
    Number.isSafeInteger(policy.instantInstructionBudget) && policy.instantInstructionBudget >= 1 &&
    policy.instantInstructionBudget <= 4096 && timing !== null && typeof timing === "object" &&
    safeNonNegativeInteger(timing.baseDelayTicks) && safeNonNegativeInteger(timing.ticksPerReadableUnit) &&
    safeNonNegativeInteger(timing.voiceDurationTicks) && safeNonNegativeInteger(timing.voiceTailTicks) &&
    safeNonNegativeInteger(timing.readableUnits);
}

function autoDelay(policy: RuntimeSchedulePolicyV0): number | "overflow" {
  if (policy.mode !== "auto") return 0;
  const timing = policy.autoTiming;
  const readable = timing.baseDelayTicks + timing.ticksPerReadableUnit * timing.readableUnits;
  const voiced = timing.voiceDurationTicks + timing.voiceTailTicks;
  const result = Math.max(readable, voiced);
  return Number.isSafeInteger(result) ? result : "overflow";
}

function budget(policy: RuntimeSchedulePolicyV0): number {
  if (policy.mode === "normal" || policy.mode === "auto") return policy.instantInstructionBudget;
  return policy.speed === "instant"
    ? policy.instantInstructionBudget
    : SPEED_BUDGETS[String(policy.speed)] as number;
}

function instructionAt(program: ProgramV0, state: RuntimeStateV0): InstructionV0 | undefined {
  return program.instructions.find((item) => item.ip === state.ip);
}

export function scheduleRuntimeBatchV0(
  program: ProgramV0,
  state: RuntimeStateV0,
  policy: RuntimeSchedulePolicyV0
): RuntimeScheduleResultV0 {
  if (validateProgram(program).length > 0 || validateState(program, state).length > 0) {
    return invalid(state, "Program and Runtime State must be valid before scheduling");
  }
  if (!validPolicy(policy)) return invalid(state, "Runtime schedule policy is not canonical or internally consistent");
  const delay = autoDelay(policy);
  if (delay === "overflow") return invalid(state, "Auto timing exceeds the safe integer range");

  if (state.terminal.kind === "ended") {
    return {
      nextState: state, effects: [], waits: [], diagnostics: [], stopReason: "terminal",
      executedInstructions: 0, autoAdvanceDelayTicks: null
    };
  }
  if (state.pendingRequests.length > 0) {
    return {
      nextState: state, effects: [], waits: [], diagnostics: [], stopReason: "input",
      executedInstructions: 0, autoAdvanceDelayTicks: null
    };
  }
  if (state.pendingEffects.length > 0) {
    return {
      nextState: state, effects: [], waits: [], diagnostics: [], stopReason: "effect",
      executedInstructions: 0, autoAdvanceDelayTicks: null
    };
  }

  let current = state;
  const effects = [];
  const waits = [];
  const read = new Set(policy.readStepIds);
  const unavailable = new Set(policy.unavailableEffectDescriptorIds);
  const instructionBudget = budget(policy);

  for (let count = 0; count < instructionBudget; count += 1) {
    const instruction = instructionAt(program, current);
    if (instruction === undefined) return invalid(state, "Runtime State IP has no instruction");
    if (instruction.opcode === "emit" && unavailable.has(instruction.operands.descriptorId)) {
      return {
        nextState: current, effects, waits, diagnostics: [], stopReason: "resourceUnavailable",
        executedInstructions: count, autoAdvanceDelayTicks: null
      };
    }
    const result = transitionPrevalidatedV0(program, current);
    if (result.diagnostics.length > 0) {
      return {
        nextState: current, effects, waits, diagnostics: result.diagnostics, stopReason: "diagnostic",
        executedInstructions: count, autoAdvanceDelayTicks: null
      };
    }
    current = result.nextState;
    effects.push(...result.effects);
    if (result.wait !== null) waits.push(result.wait);
    const executedInstructions = count + 1;

    if (current.pendingRequests.length > 0) {
      return { nextState: current, effects, waits, diagnostics: [], stopReason: "input", executedInstructions, autoAdvanceDelayTicks: null };
    }
    if (current.pendingEffects.length > 0) {
      return { nextState: current, effects, waits, diagnostics: [], stopReason: "effect", executedInstructions, autoAdvanceDelayTicks: null };
    }
    if (current.terminal.kind === "ended") {
      return { nextState: current, effects, waits, diagnostics: [], stopReason: "terminal", executedInstructions, autoAdvanceDelayTicks: null };
    }
    if (instruction.stopPoint) {
      return { nextState: current, effects, waits, diagnostics: [], stopReason: "stopPoint", executedInstructions, autoAdvanceDelayTicks: null };
    }
    if (instruction.stepBoundary) {
      if (policy.mode === "skipRead" && (current.stepId === null || !read.has(current.stepId))) {
        return { nextState: current, effects, waits, diagnostics: [], stopReason: "unreadBoundary", executedInstructions, autoAdvanceDelayTicks: null };
      }
      if (policy.mode === "normal" || policy.mode === "auto") {
        return {
          nextState: current, effects, waits, diagnostics: [], stopReason: "storyBoundary",
          executedInstructions, autoAdvanceDelayTicks: policy.mode === "auto" ? delay : null
        };
      }
    }
  }
  return {
    nextState: current, effects, waits, diagnostics: [], stopReason: "budget",
    executedInstructions: instructionBudget, autoAdvanceDelayTicks: null
  };
}

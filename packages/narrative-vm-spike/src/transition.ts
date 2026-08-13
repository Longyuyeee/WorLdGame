import { stateHashV0 } from "./hash";
import type {
  ComparisonV0,
  InstructionV0,
  ProgramV0,
  RuntimeStateV0,
  TransitionResultV0,
  VmDiagnostic,
  VmScalarV0
} from "./types";
import { MAX_CALL_STACK_DEPTH_V0 } from "./types";
import { validateProgram, validateState } from "./validation";

const DEFAULT_PRNG_SEED = 0x6d2b79f5;

export class VmProgramValidationError extends Error {
  readonly diagnostics: readonly VmDiagnostic[];

  constructor(diagnostics: readonly VmDiagnostic[]) {
    super(`Narrative VM program failed ${diagnostics.length} invariant check(s)`);
    this.name = "VmProgramValidationError";
    this.diagnostics = diagnostics;
  }
}

export function createInitialStateV0(program: ProgramV0, prngSeed = DEFAULT_PRNG_SEED): RuntimeStateV0 {
  const diagnostics = validateProgram(program);
  if (diagnostics.length > 0) throw new VmProgramValidationError(diagnostics);
  if (!Number.isSafeInteger(prngSeed) || prngSeed < 1 || prngSeed > 0xffff_ffff) {
    throw new RangeError("PRNG seed must be a non-zero unsigned 32-bit integer");
  }
  return {
    schemaVersion: 0,
    buildId: program.buildId,
    ip: program.entryIp,
    stateRevision: 0,
    stepId: null,
    callStack: [],
    variables: {},
    prng: { algorithm: "xorshift32-v0", state: prngSeed, draws: 0 },
    logicalClock: 0,
    sceneState: { backgroundId: null, characters: {} },
    audioLogic: { tracks: {} },
    pendingRequests: [],
    readSession: [],
    historyCursor: -1,
    terminal: { kind: "running" }
  };
}

function unchanged(state: RuntimeStateV0, diagnostic: VmDiagnostic): TransitionResultV0 {
  return { nextState: state, effects: [], checkpoint: null, wait: null, diagnostics: [diagnostic] };
}

function instructionDiagnostic(
  instruction: InstructionV0,
  code: VmDiagnostic["code"],
  detail: string
): VmDiagnostic {
  return { code, ip: instruction.ip, sourceStatementId: instruction.sourceStatementId, detail };
}

function nextSequentialIp(program: ProgramV0, instruction: InstructionV0): number | null {
  const index = program.instructions.findIndex((candidate) => candidate.ip === instruction.ip);
  return program.instructions[index + 1]?.ip ?? null;
}

function compare(left: VmScalarV0, condition: ComparisonV0): boolean | "type-mismatch" {
  const right = condition.value;
  if (condition.operator === "eq") return left === right;
  if (condition.operator === "ne") return left !== right;
  if (typeof left !== "number" || typeof right !== "number") return "type-mismatch";
  if (condition.operator === "lt") return left < right;
  if (condition.operator === "lte") return left <= right;
  if (condition.operator === "gt") return left > right;
  return left >= right;
}

function nextXorshift32(state: number): number {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

export function transitionV0(program: ProgramV0, state: RuntimeStateV0): TransitionResultV0 {
  const programDiagnostics = validateProgram(program);
  if (programDiagnostics.length > 0) {
    return unchanged(state, {
      code: "VM_INVALID_PROGRAM",
      ip: state.ip,
      sourceStatementId: null,
      detail: programDiagnostics.map((item) => item.detail).join("; ")
    });
  }
  const stateDiagnostics = validateState(program, state);
  if (stateDiagnostics.length > 0) return unchanged(state, stateDiagnostics[0] as VmDiagnostic);

  const instruction = program.instructions.find((candidate) => candidate.ip === state.ip) as InstructionV0;
  if (state.terminal.kind === "ended") {
    return unchanged(state, instructionDiagnostic(instruction, "VM_TERMINAL", "Program has already ended"));
  }
  if (state.stateRevision === Number.MAX_SAFE_INTEGER) {
    return unchanged(state, instructionDiagnostic(instruction, "VM_INTEGER_OVERFLOW", "State revision overflow"));
  }

  let nextIp = nextSequentialIp(program, instruction);
  let variables = state.variables;
  let stepId = state.stepId;
  let callStack = state.callStack;
  let prng = state.prng;
  let logicalClock = state.logicalClock;
  let wait: TransitionResultV0["wait"] = null;
  let terminal: RuntimeStateV0["terminal"] = state.terminal;

  if (instruction.opcode === "set") {
    variables = { ...variables, [instruction.operands.variableId]: instruction.operands.value };
  } else if (instruction.opcode === "add") {
    const current = variables[instruction.operands.variableId];
    if (current === undefined) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_VARIABLE_MISSING", "add target is not defined"));
    }
    if (typeof current !== "number") {
      return unchanged(state, instructionDiagnostic(instruction, "VM_TYPE_MISMATCH", "add target must be an integer"));
    }
    const result = current + instruction.operands.value;
    if (!Number.isSafeInteger(result)) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INTEGER_OVERFLOW", "add result exceeds safe integer range"));
    }
    variables = { ...variables, [instruction.operands.variableId]: result };
  } else if (instruction.opcode === "jump") {
    nextIp = instruction.operands.targetIp;
  } else if (instruction.opcode === "jumpIf") {
    const current = variables[instruction.operands.condition.variableId];
    if (current === undefined) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_VARIABLE_MISSING", "condition variable is not defined"));
    }
    const matches = compare(current, instruction.operands.condition);
    if (matches === "type-mismatch") {
      return unchanged(state, instructionDiagnostic(instruction, "VM_TYPE_MISMATCH", "ordered comparison requires integers"));
    }
    nextIp = matches ? instruction.operands.trueIp : instruction.operands.falseIp;
  } else if (instruction.opcode === "call") {
    if (nextIp === null) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_FALLTHROUGH_PAST_END", "call has no return IP"));
    }
    if (callStack.length >= MAX_CALL_STACK_DEPTH_V0) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_CALL_STACK_OVERFLOW", "call stack reached its v0 limit"));
    }
    callStack = [...callStack, nextIp];
    nextIp = instruction.operands.targetIp;
  } else if (instruction.opcode === "return") {
    const returnIp = callStack[callStack.length - 1];
    if (returnIp === undefined) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_CALL_STACK_UNDERFLOW", "return requires a call frame"));
    }
    callStack = callStack.slice(0, -1);
    nextIp = returnIp;
  } else if (instruction.opcode === "random") {
    const span = instruction.operands.max - instruction.operands.min + 1;
    if (!Number.isSafeInteger(span) || span < 1 || span > 0x1_0000_0000) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_RANDOM_RANGE_INVALID", "random range is not representable"));
    }
    if (prng.draws === Number.MAX_SAFE_INTEGER) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INTEGER_OVERFLOW", "PRNG draw count overflow"));
    }
    const nextRandom = nextXorshift32(prng.state);
    const value = instruction.operands.min + (nextRandom % span);
    variables = { ...variables, [instruction.operands.variableId]: value };
    prng = { ...prng, state: nextRandom, draws: prng.draws + 1 };
  } else if (instruction.opcode === "wait") {
    const resumeAtTick = logicalClock + instruction.operands.durationTicks;
    if (!Number.isSafeInteger(resumeAtTick)) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INTEGER_OVERFLOW", "logical clock overflow"));
    }
    logicalClock = resumeAtTick;
    wait = { durationTicks: instruction.operands.durationTicks, resumeAtTick };
  } else if (instruction.opcode === "checkpoint") {
    stepId = instruction.operands.stepId;
  } else if (instruction.opcode === "end") {
    nextIp = instruction.ip;
    terminal = { kind: "ended", endingId: instruction.operands.endingId };
  }

  if (nextIp === null) {
    return unchanged(state, instructionDiagnostic(instruction, "VM_FALLTHROUGH_PAST_END", "Non-terminal instruction has no successor"));
  }
  const nextState: RuntimeStateV0 = {
    ...state,
    ip: nextIp,
    stateRevision: state.stateRevision + 1,
    stepId,
    callStack,
    variables,
    prng,
    logicalClock,
    terminal
  };
  const checkpoint = instruction.opcode === "checkpoint" ? {
    stepId: instruction.operands.stepId,
    stateRevision: nextState.stateRevision,
    stateHash: stateHashV0(nextState)
  } : null;
  return { nextState, effects: [], checkpoint, wait, diagnostics: [] };
}

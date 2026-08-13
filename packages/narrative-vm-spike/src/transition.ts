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
  if (!Number.isSafeInteger(prngSeed) || prngSeed < 0 || prngSeed > 0xffff_ffff) {
    throw new RangeError("PRNG seed must be an unsigned 32-bit integer");
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
    variables,
    terminal
  };
  const checkpoint = instruction.opcode === "checkpoint" ? {
    stepId: instruction.operands.stepId,
    stateRevision: nextState.stateRevision,
    stateHash: stateHashV0(nextState)
  } : null;
  return { nextState, effects: [], checkpoint, wait: null, diagnostics: [] };
}

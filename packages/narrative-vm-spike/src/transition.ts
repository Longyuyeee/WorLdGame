import { stateHashV0 } from "./hash";
import { canonicalStringify } from "./canonical";
import { choiceRequestIdV0 } from "./input";
import type {
  ComparisonV0,
  ExternalInputV0,
  InitialStateOptionsV0,
  InstructionV0,
  ProgramV0,
  RuntimeStateV0,
  TransitionResultV0,
  VmDiagnostic,
  VmScalarV0
} from "./types";
import { MAX_CALL_STACK_DEPTH_V0, MAX_INPUT_RECEIPTS_V0 } from "./types";
import { validateExternalInputV0, validateProgram, validateState } from "./validation";

const DEFAULT_PRNG_SEED = 0x6d2b79f5;

export class VmProgramValidationError extends Error {
  readonly diagnostics: readonly VmDiagnostic[];

  constructor(diagnostics: readonly VmDiagnostic[]) {
    super(`Narrative VM program failed ${diagnostics.length} invariant check(s)`);
    this.name = "VmProgramValidationError";
    this.diagnostics = diagnostics;
  }
}

export function createInitialStateV0(
  program: ProgramV0,
  options: InitialStateOptionsV0
): RuntimeStateV0 {
  const prngSeed = options.prngSeed ?? DEFAULT_PRNG_SEED;
  const executionId = options.executionId;
  const diagnostics = validateProgram(program);
  if (diagnostics.length > 0) throw new VmProgramValidationError(diagnostics);
  if (!Number.isSafeInteger(prngSeed) || prngSeed < 1 || prngSeed > 0xffff_ffff) {
    throw new RangeError("PRNG seed must be a non-zero unsigned 32-bit integer");
  }
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(executionId)) {
    throw new TypeError("Execution ID must be a canonical VM identifier");
  }
  return {
    schemaVersion: 0,
    buildId: program.buildId,
    executionId,
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
    nextInputSequence: 0,
    inputReceipts: [],
    readSession: [],
    historyCursor: -1,
    terminal: { kind: "running" }
  };
}

function unchanged(state: RuntimeStateV0, diagnostic: VmDiagnostic): TransitionResultV0 {
  return { nextState: state, effects: [], checkpoint: null, wait: null, request: null, diagnostics: [diagnostic] };
}

function idempotent(state: RuntimeStateV0): TransitionResultV0 {
  return { nextState: state, effects: [], checkpoint: null, wait: null, request: null, diagnostics: [] };
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

export function transitionV0(
  program: ProgramV0,
  state: RuntimeStateV0,
  input?: ExternalInputV0
): TransitionResultV0 {
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

  if (input !== undefined) {
    if (!validateExternalInputV0(input)) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INPUT_MISMATCH", "External input schema is invalid"));
    }
    const prior = state.inputReceipts.find((receipt) => receipt.input.inputId === input.inputId);
    if (prior !== undefined) {
      return canonicalStringify(prior.input) === canonicalStringify(input)
        ? idempotent(state)
        : unchanged(state, instructionDiagnostic(instruction, "VM_INPUT_ID_CONFLICT", "Input ID was already accepted with a different payload"));
    }
    const pending = state.pendingRequests[0];
    if (pending === undefined) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INPUT_UNEXPECTED", "No external input request is pending"));
    }
    if (input.logicalSequence !== pending.logicalSequence) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INPUT_OUT_OF_ORDER", "Input logical sequence does not match the pending request"));
    }
    if (input.executionId !== pending.executionId || input.requestId !== pending.requestId ||
        input.expectedRevision !== pending.expectedRevision || input.choiceId !== pending.choiceId) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INPUT_MISMATCH", "Input execution, request, revision, or choice does not match"));
    }
    const selected = pending.options.find((option) => option.optionId === input.optionId);
    if (selected === undefined) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_CHOICE_OPTION_INVALID", "Choice option is not present in the pending request"));
    }
    if (state.inputReceipts.length >= MAX_INPUT_RECEIPTS_V0) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INPUT_RECEIPT_LIMIT", "Input receipt ledger reached its v0 limit"));
    }
    if (state.stateRevision === Number.MAX_SAFE_INTEGER) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INTEGER_OVERFLOW", "State revision overflow"));
    }
    const nextState: RuntimeStateV0 = {
      ...state,
      ip: selected.targetIp,
      stateRevision: state.stateRevision + 1,
      stepId: pending.commitStepId,
      pendingRequests: [],
      inputReceipts: [...state.inputReceipts, { input, acceptedAtRevision: state.stateRevision + 1 }]
    };
    return { nextState, effects: [], checkpoint: null, wait: null, request: null, diagnostics: [] };
  }

  if (state.pendingRequests.length > 0) {
    return unchanged(state, instructionDiagnostic(instruction, "VM_INPUT_REQUIRED", "External input is required before execution can continue"));
  }
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
  let request: TransitionResultV0["request"] = null;
  let pendingRequests = state.pendingRequests;
  let nextInputSequence = state.nextInputSequence;
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
  } else if (instruction.opcode === "choice") {
    if (nextInputSequence === Number.MAX_SAFE_INTEGER) {
      return unchanged(state, instructionDiagnostic(instruction, "VM_INTEGER_OVERFLOW", "Input logical sequence overflow"));
    }
    const expectedRevision = state.stateRevision + 1;
    const requestId = choiceRequestIdV0(
      state.executionId,
      instruction.operands.choiceId,
      nextInputSequence,
      expectedRevision
    );
    request = {
      requestId,
      executionId: state.executionId,
      expectedRevision,
      logicalSequence: nextInputSequence,
      kind: "choice",
      choiceId: instruction.operands.choiceId,
      commitStepId: instruction.operands.commitStepId,
      options: instruction.operands.options.map((option) => ({ ...option }))
    };
    pendingRequests = [request];
    nextInputSequence += 1;
    stepId = instruction.operands.promptStepId;
    nextIp = instruction.ip;
  } else if (instruction.opcode === "checkpoint") {
    stepId = instruction.operands.stepId;
  } else if (instruction.opcode === "end") {
    nextIp = instruction.ip;
    stepId = instruction.operands.endingId;
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
    pendingRequests,
    nextInputSequence,
    terminal
  };
  const checkpoint = instruction.opcode === "checkpoint" ? {
    stepId: instruction.operands.stepId,
    stateRevision: nextState.stateRevision,
    stateHash: stateHashV0(nextState)
  } : null;
  return { nextState, effects: [], checkpoint, wait, request, diagnostics: [] };
}

import { canonicalBytes, canonicalStringify } from "./canonical";
import { sha256Hex } from "./sha256";
import type { InstructionV0, ProgramV0, RuntimeStateV0, VmDiagnostic } from "./types";

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const SUPPORTED_OPCODES = ["add", "checkpoint", "end", "jump", "jumpIf", "set"] as const;

export const SPIKE_OPCODE_REGISTRY_DIGEST_V0 = sha256Hex(canonicalBytes({
  irVersion: 0,
  opcodes: SUPPORTED_OPCODES
}));

function invalidProgram(detail: string, instruction?: InstructionV0): VmDiagnostic {
  return {
    code: "VM_INVALID_PROGRAM",
    ip: instruction?.ip ?? null,
    sourceStatementId: instruction?.sourceStatementId ?? null,
    detail
  };
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function validateScalar(value: unknown): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value !== "string") return false;
  try {
    canonicalStringify(value);
    return true;
  } catch {
    return false;
  }
}

function validateInstruction(instruction: InstructionV0, knownIps: ReadonlySet<number>): readonly VmDiagnostic[] {
  const diagnostics: VmDiagnostic[] = [];
  const opcode = (instruction as { readonly opcode?: unknown }).opcode;
  if (!SUPPORTED_OPCODES.includes(opcode as typeof SUPPORTED_OPCODES[number])) {
    return [invalidProgram(`Unsupported opcode: ${String(opcode)}`, instruction)];
  }
  if (!safeId(instruction.sourceStatementId) || instruction.effectClass !== "none" ||
      typeof instruction.stepBoundary !== "boolean" || typeof instruction.stopPoint !== "boolean") {
    diagnostics.push(invalidProgram("Instruction metadata is not canonical", instruction));
  }
  if (!exactKeys(instruction as unknown as Record<string, unknown>, [
    "ip", "opcode", "operands", "sourceStatementId", "stepBoundary", "effectClass", "stopPoint"
  ])) {
    diagnostics.push(invalidProgram("Instruction contains missing or unknown fields", instruction));
  }

  const operands = (instruction as { readonly operands?: unknown }).operands;
  if (typeof operands !== "object" || operands === null) {
    return [...diagnostics, invalidProgram("Instruction operands must be an object", instruction)];
  }
  const values = operands as Record<string, unknown>;
  if (opcode === "set" && (!exactKeys(values, ["variableId", "value"]) ||
      !safeId(values.variableId) || !validateScalar(values.value))) {
    diagnostics.push(invalidProgram("set requires only a safe variableId and canonical scalar", instruction));
  } else if (opcode === "add" && (!exactKeys(values, ["variableId", "value"]) ||
      !safeId(values.variableId) || !safeInteger(values.value))) {
    diagnostics.push(invalidProgram("add requires only a safe variableId and safe integer", instruction));
  } else if (opcode === "jump" && (!exactKeys(values, ["targetIp"]) ||
      !safeInteger(values.targetIp) || !knownIps.has(values.targetIp))) {
    diagnostics.push(invalidProgram("jump target must be the only operand and reference an instruction", instruction));
  } else if (opcode === "jumpIf") {
    const condition = plainRecord(values.condition) ? values.condition : undefined;
    const validOperator = condition !== undefined &&
      ["eq", "ne", "lt", "lte", "gt", "gte"].includes(String(condition.operator));
    if (!exactKeys(values, ["condition", "trueIp", "falseIp"]) || condition === undefined ||
        !plainRecord(condition) || !exactKeys(condition, ["variableId", "operator", "value"]) ||
        !safeId(condition.variableId) || !validOperator ||
        !validateScalar(condition.value) || !safeInteger(values.trueIp) ||
        !safeInteger(values.falseIp) || !knownIps.has(values.trueIp) || !knownIps.has(values.falseIp)) {
      diagnostics.push(invalidProgram("jumpIf condition and targets must be canonical", instruction));
    }
  } else if (opcode === "checkpoint" && (!exactKeys(values, ["stepId"]) || !safeId(values.stepId))) {
    diagnostics.push(invalidProgram("checkpoint requires only a safe stepId", instruction));
  } else if (opcode === "end" && (!exactKeys(values, ["endingId"]) || !safeId(values.endingId))) {
    diagnostics.push(invalidProgram("end requires only a safe endingId", instruction));
  }

  const mustBeBoundary = opcode === "checkpoint" || opcode === "end";
  if (instruction.stepBoundary !== mustBeBoundary || (instruction.stopPoint && opcode !== "end")) {
    diagnostics.push(invalidProgram("Spike boundary flags do not match opcode semantics", instruction));
  }
  return diagnostics;
}

export function validateProgram(program: ProgramV0): readonly VmDiagnostic[] {
  const diagnostics: VmDiagnostic[] = [];
  if (program.irVersion !== 0 || !safeId(program.projectId) || !safeId(program.buildId) ||
      program.opcodeRegistryDigest !== SPIKE_OPCODE_REGISTRY_DIGEST_V0 ||
      !Array.isArray(program.instructions) || program.instructions.length === 0 ||
      !plainRecord(program.sourceMap) || !exactKeys(program as unknown as Record<string, unknown>, [
        "irVersion", "projectId", "buildId", "entryIp", "instructions", "sourceMap", "opcodeRegistryDigest"
      ])) {
    diagnostics.push(invalidProgram("Program header or opcode registry digest is invalid"));
    return diagnostics;
  }
  const ips = new Set<number>();
  let previousIp = -1;
  for (const instruction of program.instructions) {
    if (!safeInteger(instruction.ip) || instruction.ip < 0 || instruction.ip <= previousIp) {
      diagnostics.push(invalidProgram("Instruction IPs must be unique, non-negative, and strictly increasing", instruction));
    }
    ips.add(instruction.ip);
    previousIp = instruction.ip;
  }
  const sourceMapKeys = Object.keys(program.sourceMap);
  if (sourceMapKeys.length !== ips.size || sourceMapKeys.some((key) => !ips.has(Number(key)))) {
    diagnostics.push(invalidProgram("Source map must not omit or add IP entries"));
  }
  if (!safeInteger(program.entryIp) || !ips.has(program.entryIp)) {
    diagnostics.push(invalidProgram("Entry IP must reference an instruction"));
  }
  for (const instruction of program.instructions) {
    diagnostics.push(...validateInstruction(instruction, ips));
    if (program.sourceMap[String(instruction.ip)] !== instruction.sourceStatementId) {
      diagnostics.push(invalidProgram("Source map must exactly bind every IP", instruction));
    }
  }
  try {
    canonicalStringify(program.sourceMap);
  } catch {
    diagnostics.push(invalidProgram("Source map is not canonical"));
  }
  return diagnostics;
}

export function validateState(program: ProgramV0, state: RuntimeStateV0): readonly VmDiagnostic[] {
  const record = state as unknown as Record<string, unknown>;
  if (!plainRecord(state as unknown) || !plainRecord(record.prng) || !plainRecord(record.sceneState) ||
      !plainRecord(record.audioLogic) || !plainRecord(record.terminal)) {
    return [{
      code: "VM_INVALID_STATE",
      ip: safeInteger(record.ip) ? record.ip : null,
      sourceStatementId: null,
      detail: "State and nested state headers must be plain records"
    }];
  }
  const instruction = program.instructions.find((candidate) => candidate.ip === state.ip);
  const fail = (detail: string): readonly VmDiagnostic[] => [{
    code: "VM_INVALID_STATE",
    ip: state.ip,
    sourceStatementId: instruction?.sourceStatementId ?? null,
    detail
  }];
  if (state.schemaVersion !== 0 || state.buildId !== program.buildId || instruction === undefined ||
      !safeInteger(state.stateRevision) || state.stateRevision < 0 || !safeInteger(state.logicalClock) ||
      state.logicalClock < 0 || !safeInteger(state.historyCursor) ||
      state.prng.algorithm !== "xorshift32-v0" || !safeInteger(state.prng.state) ||
      state.prng.state < 0 || state.prng.state > 0xffff_ffff || !safeInteger(state.prng.draws) ||
      state.prng.draws < 0) {
    return fail("State header, cursor, clock, or PRNG is invalid");
  }
  if (!exactKeys(state as unknown as Record<string, unknown>, [
    "schemaVersion", "buildId", "ip", "stateRevision", "stepId", "callStack", "variables", "prng",
    "logicalClock", "sceneState", "audioLogic", "pendingRequests", "readSession", "historyCursor", "terminal"
  ]) || !plainRecord(state.variables) || Object.entries(state.variables).some(([key, value]) =>
    !safeId(key) || !validateScalar(value)) || !Array.isArray(state.callStack) ||
    state.callStack.some((ip) => !safeInteger(ip) || !program.instructions.some((item) => item.ip === ip)) ||
    (state.stepId !== null && !safeId(state.stepId)) || !Array.isArray(state.pendingRequests) ||
    state.pendingRequests.length !== 0 || !Array.isArray(state.readSession) ||
    state.readSession.some((id) => !safeId(id)) || !plainRecord(state.sceneState.characters) ||
    !plainRecord(state.audioLogic.tracks) ||
    (state.terminal.kind !== "running" && (state.terminal.kind !== "ended" || !safeId(state.terminal.endingId)))) {
    return fail("State fields are missing, unknown, unsupported, or non-canonical");
  }
  try {
    canonicalStringify(state);
  } catch {
    return fail("State is not canonically serializable");
  }
  return [];
}

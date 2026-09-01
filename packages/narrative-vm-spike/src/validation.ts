import { canonicalBytes, canonicalStringify } from "./canonical";
import { choiceRequestIdV0 } from "./input";
import { barrierRequestIdV0, effectIdV0 } from "./effect";
import { sha256Hex } from "./sha256";
import { MAX_CALL_STACK_DEPTH_V0, MAX_INPUT_RECEIPTS_V0 } from "./types";
import type {
  ExternalInputV0,
  EffectIntentV0,
  InstructionV0,
  PendingRequestV0,
  ProgramV0,
  RuntimeStateV0,
  VmDiagnostic
} from "./types";

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const EFFECT_ID = /^effect\.[0-9a-f]{64}$/;
const SUPPORTED_OPCODES = [
  "add", "call", "checkpoint", "choice", "emit", "end", "jump", "jumpIf", "random", "return", "set", "wait"
] as const;

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
  if (!safeId(instruction.sourceStatementId) ||
      (opcode === "emit" ? instruction.effectClass !==
        (instruction as { readonly operands?: { readonly policy?: unknown } }).operands?.policy :
        instruction.effectClass !== "none") ||
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
  } else if (opcode === "call" && (!exactKeys(values, ["targetIp"]) ||
      !safeInteger(values.targetIp) || !knownIps.has(values.targetIp) ||
      ![...knownIps].some((ip) => ip > instruction.ip))) {
    diagnostics.push(invalidProgram("call requires a valid target and sequential return IP", instruction));
  } else if (opcode === "return" && !exactKeys(values, [])) {
    diagnostics.push(invalidProgram("return does not accept operands", instruction));
  } else if (opcode === "random") {
    const span = typeof values.min === "number" && typeof values.max === "number"
      ? values.max - values.min + 1
      : Number.NaN;
    if (!exactKeys(values, ["variableId", "min", "max"]) || !safeId(values.variableId) ||
        !safeInteger(values.min) || !safeInteger(values.max) || values.min > values.max ||
        !safeInteger(span) || span < 1 || span > 0x1_0000_0000) {
      diagnostics.push(invalidProgram("random requires a safe inclusive integer range no wider than 2^32", instruction));
    }
  } else if (opcode === "wait" && (!exactKeys(values, ["durationTicks"]) ||
      !safeInteger(values.durationTicks) || values.durationTicks < 1)) {
    diagnostics.push(invalidProgram("wait durationTicks must be a positive safe integer", instruction));
  } else if (opcode === "choice") {
    const options = Array.isArray(values.options) ? values.options : [];
    const optionIds = new Set<string>();
    const malformedOption = options.some((option) => {
      if (!plainRecord(option) || !exactKeys(option, ["optionId", "targetIp"]) ||
          !safeId(option.optionId) || !safeInteger(option.targetIp) || !knownIps.has(option.targetIp) ||
          optionIds.has(option.optionId)) return true;
      optionIds.add(option.optionId);
      return false;
    });
    if (!exactKeys(values, ["choiceId", "promptStepId", "commitStepId", "options"]) ||
        !safeId(values.choiceId) || !safeId(values.promptStepId) || !safeId(values.commitStepId) ||
        values.promptStepId === values.commitStepId ||
        options.length < 1 || options.length > 64 || malformedOption) {
      diagnostics.push(invalidProgram("choice requires 1..64 unique canonical options with valid targets", instruction));
    }
  } else if (opcode === "emit") {
    const payload = plainRecord(values.payload) ? values.payload : undefined;
    const compensation = values.compensation === null
      ? null
      : plainRecord(values.compensation) ? values.compensation : undefined;
    const compensationPayload = compensation !== null && compensation !== undefined && plainRecord(compensation.payload)
      ? compensation.payload
      : undefined;
    const validPayload = payload !== undefined && Object.entries(payload).every(([key, value]) =>
      safeId(key) && validateScalar(value));
    const validCompensation = compensation === null || (compensation !== undefined &&
      exactKeys(compensation, ["kind", "payload"]) && safeId(compensation.kind) && compensationPayload !== undefined &&
      Object.entries(compensationPayload).every(([key, value]) => safeId(key) && validateScalar(value)));
    const policy = values.policy;
    const requestStepValid = policy === "barrier"
      ? safeId(values.requestStepId) && values.requestStepId !== values.issueStepId &&
        values.requestStepId !== values.completeStepId
      : values.requestStepId === null;
    const policyFieldsValid = policy === "reversible"
      ? compensation !== null && compensation !== undefined && values.barrierReason === null
      : policy === "barrier"
        ? compensation === null && typeof values.barrierReason === "string" && values.barrierReason.length > 0 &&
          validateScalar(values.barrierReason)
        : policy === "pure" && compensation === null && values.barrierReason === null;
    if (!exactKeys(values, [
      "descriptorId", "requestStepId", "issueStepId", "completeStepId", "channel", "kind", "payload",
      "policy", "awaitMode", "cancellationScope", "replayKey", "compensation", "barrierReason"
    ]) || !safeId(values.descriptorId) || !safeId(values.issueStepId) || !safeId(values.completeStepId) ||
        values.issueStepId === values.completeStepId || !safeId(values.channel) || !safeId(values.kind) ||
        !validPayload || !["pure", "reversible", "barrier"].includes(String(policy)) ||
        !["detached", "awaited"].includes(String(values.awaitMode)) ||
        !safeId(values.cancellationScope) || !safeId(values.replayKey) || !validCompensation ||
        !requestStepValid || !policyFieldsValid) {
      diagnostics.push(invalidProgram("emit descriptor, policy, steps, payload, compensation, and Barrier reason must be canonical", instruction));
    }
  } else if (opcode === "checkpoint" && (!exactKeys(values, ["stepId"]) || !safeId(values.stepId))) {
    diagnostics.push(invalidProgram("checkpoint requires only a safe stepId", instruction));
  } else if (opcode === "end" && (!exactKeys(values, ["endingId"]) || !safeId(values.endingId))) {
    diagnostics.push(invalidProgram("end requires only a safe endingId", instruction));
  }

  const mustBeBoundary = opcode === "checkpoint" || opcode === "choice" || opcode === "emit" || opcode === "end";
  const mustStop = opcode === "choice" || opcode === "end" ||
    (opcode === "emit" && (values.awaitMode === "awaited" || values.policy === "barrier"));
  const stopFlagInvalid = mustStop ? !instruction.stopPoint : opcode !== "checkpoint" && instruction.stopPoint;
  if (instruction.stepBoundary !== mustBeBoundary || stopFlagInvalid) {
    diagnostics.push(invalidProgram("Spike boundary flags do not match opcode semantics", instruction));
  }
  return diagnostics;
}

function validInputRecord(input: unknown): input is ExternalInputV0 {
  if (!plainRecord(input)) return false;
  const common = input.schemaVersion === 0 && safeId(input.inputId) && safeId(input.executionId) &&
    safeInteger(input.expectedRevision) && input.expectedRevision >= 0 &&
    safeInteger(input.logicalSequence) && input.logicalSequence >= 0;
  if (!common) return false;
  if (input.kind === "choiceSelected") {
    return exactKeys(input, [
      "schemaVersion", "kind", "inputId", "executionId", "requestId", "expectedRevision",
      "logicalSequence", "choiceId", "optionId"
    ]) && safeId(input.requestId) && safeId(input.choiceId) && safeId(input.optionId);
  }
  if (input.kind === "barrierApproved") {
    return exactKeys(input, [
      "schemaVersion", "kind", "inputId", "executionId", "requestId", "expectedRevision",
      "logicalSequence", "descriptorId"
    ]) && safeId(input.requestId) && safeId(input.descriptorId);
  }
  if (input.kind === "effectCompleted") {
    return exactKeys(input, [
      "schemaVersion", "kind", "inputId", "executionId", "effectId", "expectedRevision",
      "logicalSequence", "replayKey"
    ]) && safeId(input.effectId) && safeId(input.replayKey);
  }
  return input.kind === "effectCancelled" && exactKeys(input, [
    "schemaVersion", "kind", "inputId", "executionId", "effectId", "expectedRevision",
    "logicalSequence", "cancellationScope"
  ]) && safeId(input.effectId) && safeId(input.cancellationScope);
}

export function validateExternalInputV0(input: unknown): input is ExternalInputV0 {
  if (!validInputRecord(input)) return false;
  try {
    canonicalStringify(input);
    return true;
  } catch {
    return false;
  }
}

function validExternalInputToken(input: ExternalInputV0): boolean {
  if (input.kind === "choiceSelected") {
    return input.requestId === choiceRequestIdV0(
      input.executionId,
      input.choiceId,
      input.logicalSequence,
      input.expectedRevision
    );
  }
  if (input.kind === "barrierApproved") {
    return input.requestId === barrierRequestIdV0(
      input.executionId,
      input.descriptorId,
      input.logicalSequence,
      input.expectedRevision
    );
  }
  return true;
}

function validPendingRequest(request: unknown, state: RuntimeStateV0, program: ProgramV0): request is PendingRequestV0 {
  if (!plainRecord(request) || !safeId(request.requestId) || request.executionId !== state.executionId ||
      request.expectedRevision !== state.stateRevision || !safeInteger(request.logicalSequence) ||
      request.logicalSequence < 0 || request.logicalSequence >= state.nextInputSequence) return false;
  const instruction = program.instructions.find((item) => item.ip === state.ip);
  if (request.kind === "barrierApproval") {
    return exactKeys(request, [
      "requestId", "executionId", "expectedRevision", "logicalSequence", "kind", "descriptorId", "reason"
    ]) && safeId(request.descriptorId) && typeof request.reason === "string" && request.reason.length > 0 &&
      instruction?.opcode === "emit" && instruction.operands.policy === "barrier" &&
      instruction.operands.descriptorId === request.descriptorId && instruction.operands.barrierReason === request.reason &&
      state.stepId === instruction.operands.requestStepId && request.requestId === barrierRequestIdV0(
        request.executionId,
        request.descriptorId,
        request.logicalSequence,
        request.expectedRevision
      );
  }
  if (!exactKeys(request, [
    "requestId", "executionId", "expectedRevision", "logicalSequence", "kind", "choiceId", "commitStepId", "options"
  ]) || request.kind !== "choice" || !safeId(request.choiceId) || !safeId(request.commitStepId) ||
      !Array.isArray(request.options) || request.options.length < 1 || request.options.length > 64 ||
      request.requestId !== choiceRequestIdV0(
        request.executionId,
        request.choiceId,
        request.logicalSequence,
        request.expectedRevision
      )) return false;
  const ids = new Set<string>();
  const validOptions = request.options.every((option) => plainRecord(option) && exactKeys(option, ["optionId", "targetIp"]) &&
    safeId(option.optionId) && !ids.has(option.optionId) && ids.add(option.optionId) &&
    safeInteger(option.targetIp) && program.instructions.some((item) => item.ip === option.targetIp));
  return validOptions && instruction?.opcode === "choice" && instruction.operands.choiceId === request.choiceId &&
    instruction.operands.commitStepId === request.commitStepId && state.stepId === instruction.operands.promptStepId &&
    canonicalStringify(instruction.operands.options) === canonicalStringify(request.options);
}

function validEffectIntent(effect: unknown, state: RuntimeStateV0, program: ProgramV0): effect is EffectIntentV0 {
  if (!plainRecord(effect) || !exactKeys(effect, [
    "effectId", "executionId", "originatingRevision", "logicalSequence", "descriptorId", "channel", "kind",
    "payload", "policy", "awaitMode", "cancellationScope", "replayKey", "compensation"
  ]) || !safeId(effect.effectId) || !EFFECT_ID.test(effect.effectId) || effect.executionId !== state.executionId ||
      !safeInteger(effect.originatingRevision) || effect.originatingRevision < 1 ||
      effect.originatingRevision > state.stateRevision || !safeInteger(effect.logicalSequence) ||
      effect.logicalSequence < 0 || effect.logicalSequence >= state.nextEffectSequence ||
      !safeId(effect.descriptorId) || !safeId(effect.channel) || !safeId(effect.kind) ||
      !plainRecord(effect.payload) || Object.entries(effect.payload).some(([key, value]) =>
        !safeId(key) || !validateScalar(value)) ||
      !["pure", "reversible", "barrier"].includes(String(effect.policy)) ||
      !["detached", "awaited"].includes(String(effect.awaitMode)) || !safeId(effect.cancellationScope) ||
      !safeId(effect.replayKey) || effect.effectId !== effectIdV0(
        effect.executionId,
        effect.descriptorId,
        effect.logicalSequence,
        effect.originatingRevision
      )) return false;
  if (effect.policy === "reversible") {
    if (!plainRecord(effect.compensation) || !exactKeys(effect.compensation, ["kind", "payload"]) ||
        !safeId(effect.compensation.kind) || !plainRecord(effect.compensation.payload) ||
        Object.entries(effect.compensation.payload).some(([key, value]) => !safeId(key) || !validateScalar(value))) {
      return false;
    }
  } else if (effect.compensation !== null) return false;
  const instruction = program.instructions.find((item) => item.ip === state.ip);
  return effect.awaitMode !== "awaited" || (instruction?.opcode === "emit" &&
    effect.originatingRevision === state.stateRevision &&
    effect.logicalSequence === state.nextEffectSequence - 1 &&
    instruction.operands.descriptorId === effect.descriptorId &&
    instruction.operands.channel === effect.channel && instruction.operands.kind === effect.kind &&
    instruction.operands.policy === effect.policy && instruction.operands.awaitMode === effect.awaitMode &&
    instruction.operands.cancellationScope === effect.cancellationScope &&
    instruction.operands.replayKey === effect.replayKey &&
    canonicalStringify(instruction.operands.payload) === canonicalStringify(effect.payload) &&
    canonicalStringify(instruction.operands.compensation) === canonicalStringify(effect.compensation));
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
  if (state.schemaVersion !== 0 || state.buildId !== program.buildId || !safeId(state.executionId) ||
      instruction === undefined ||
      !safeInteger(state.stateRevision) || state.stateRevision < 0 || !safeInteger(state.logicalClock) ||
      state.logicalClock < 0 || !safeInteger(state.historyCursor) || !safeInteger(state.nextInputSequence) ||
      state.nextInputSequence < 0 || !safeInteger(state.nextEffectSequence) || state.nextEffectSequence < 0 ||
      state.prng.algorithm !== "xorshift32-v0" || !safeInteger(state.prng.state) ||
      state.prng.state < 1 || state.prng.state > 0xffff_ffff || !safeInteger(state.prng.draws) ||
      state.prng.draws < 0) {
    return fail("State header, cursor, clock, or PRNG is invalid");
  }
  if (!exactKeys(state as unknown as Record<string, unknown>, [
    "schemaVersion", "buildId", "executionId", "ip", "stateRevision", "stepId", "callStack", "variables", "prng",
    "logicalClock", "sceneState", "audioLogic", "pendingRequests", "pendingEffects", "nextInputSequence",
    "nextEffectSequence", "inputReceipts",
    "readSession", "historyCursor", "terminal"
  ]) || !exactKeys(state.prng as unknown as Record<string, unknown>, ["algorithm", "state", "draws"]) ||
    !exactKeys(state.sceneState as unknown as Record<string, unknown>, ["backgroundId", "characters"]) ||
    !exactKeys(state.audioLogic as unknown as Record<string, unknown>, ["tracks"]) ||
    !exactKeys(state.terminal as unknown as Record<string, unknown>,
      state.terminal.kind === "running" ? ["kind"] : ["kind", "endingId"]) ||
    !plainRecord(state.variables) || Object.entries(state.variables).some(([key, value]) =>
    !safeId(key) || !validateScalar(value)) || !Array.isArray(state.callStack) ||
    state.callStack.length > MAX_CALL_STACK_DEPTH_V0 ||
    state.callStack.some((ip) => !safeInteger(ip) || !program.instructions.some((item) => item.ip === ip)) ||
    (state.stepId !== null && !safeId(state.stepId)) || !Array.isArray(state.pendingRequests) ||
    state.pendingRequests.length > 1 || state.pendingRequests.some((request) =>
      !validPendingRequest(request, state, program)) || !Array.isArray(state.pendingEffects) ||
    state.pendingEffects.length > 1 || state.pendingEffects.some((effect) =>
      !validEffectIntent(effect, state, program)) ||
    (state.pendingRequests.length > 0 && state.pendingEffects.length > 0) ||
    !Array.isArray(state.inputReceipts) ||
    (state.pendingRequests.length > 0 && state.terminal.kind !== "running") ||
    state.inputReceipts.length > MAX_INPUT_RECEIPTS_V0 || state.inputReceipts.some((receipt) =>
      !plainRecord(receipt) || !exactKeys(receipt, ["input", "acceptedAtRevision"]) ||
      !validateExternalInputV0(receipt.input) || receipt.input.executionId !== state.executionId ||
      !validExternalInputToken(receipt.input) ||
      (receipt.input.kind === "choiceSelected" || receipt.input.kind === "barrierApproved"
        ? receipt.input.logicalSequence >= state.nextInputSequence
        : receipt.input.logicalSequence >= state.nextEffectSequence) ||
      !safeInteger(receipt.acceptedAtRevision) || receipt.acceptedAtRevision < 1 ||
      receipt.acceptedAtRevision > state.stateRevision ||
      receipt.input.expectedRevision >= receipt.acceptedAtRevision) ||
    new Set(state.inputReceipts.map((receipt) => receipt.input.inputId)).size !== state.inputReceipts.length ||
    !Array.isArray(state.readSession) ||
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

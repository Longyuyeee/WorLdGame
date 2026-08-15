import type { RuntimeInstructionV1, RuntimeSceneV1 } from "@world-studio/project-compiler";
import {
  DEFAULT_PRNG_SEED,
  DEFAULT_INSTRUCTION_BUDGET,
  MAX_CALL_STACK_DEPTH,
  MAX_META_PROGRESS_IDS_PER_DOMAIN,
  RUNTIME_STATE_SCHEMA_VERSION,
  RUNTIME_VERSION,
  type CreateRuntimeOptionsV1,
  type CreateRuntimeResultV1,
  type RuntimeChoiceInputV1,
  type RuntimeChoiceOptionV1,
  type RuntimeCursorV1,
  type RuntimeDiagnosticCode,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeProgramV1,
  type RuntimeRandomDrawRequestV1,
  type RuntimeRandomDrawResultV1,
  type RuntimeRunOptionsV1,
  type RuntimeRunResultV1,
  type RuntimeScalar,
  type RuntimeStateV1
} from "./types";
import { canonicalRuntimeStringify } from "./canonical";

const supportedOpcodes = new Set([
  "dialogue", "narration", "direction", "choice", "label", "jump", "call", "return", "set", "condition", "wait", "end"
]);
const canonicalId = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

function diagnostic(code: RuntimeDiagnosticCode, message: string, cursor?: RuntimeCursorV1, instructionId?: string): RuntimeDiagnosticV1 {
  return { code, message, sceneId: cursor?.sceneId ?? null, instructionId: instructionId ?? null };
}

function finiteScalar(value: unknown): value is RuntimeScalar {
  return value === null || typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));
}

function sortedUniqueIds(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= MAX_META_PROGRESS_IDS_PER_DOMAIN && value.every((item) => typeof item === "string" && canonicalId.test(item)) && value.every((item, index) => index === 0 || String(value[index - 1]) < item);
}

function validRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scenesById(program: RuntimeProgramV1): Map<string, RuntimeSceneV1> {
  return new Map(program.scenes.map((scene) => [scene.sceneId, scene]));
}

function validateProgram(program: RuntimeProgramV1): readonly RuntimeDiagnosticV1[] {
  if (program.schemaVersion !== 1 || program.irVersion !== "1.0.0") {
    return [diagnostic("RUNTIME_INCOMPATIBLE_IR", `Expected Runtime IR 1.0.0/schema 1, received ${String(program.irVersion)}/schema ${String(program.schemaVersion)}`)];
  }
  if (program.projectId.length === 0 || program.entrySceneId.length === 0 || program.scenes.length === 0) {
    return [diagnostic("RUNTIME_INVALID_IR", "Runtime IR requires project, entry scene, and at least one scene")];
  }
  const sceneIds = new Set<string>();
  const instructionIds = new Set<string>();
  for (const scene of program.scenes) {
    if (scene.sceneId.length === 0 || sceneIds.has(scene.sceneId)) return [diagnostic("RUNTIME_INVALID_IR", `Scene ID is empty or duplicated: ${scene.sceneId}`)];
    sceneIds.add(scene.sceneId);
    for (const instruction of scene.instructions) {
      if (instruction.instructionId.length === 0 || instructionIds.has(instruction.instructionId) || !supportedOpcodes.has(instruction.opcode)) {
        return [diagnostic("RUNTIME_INVALID_IR", `Instruction is empty, duplicated, or unsupported: ${instruction.instructionId}`, { sceneId: scene.sceneId, instructionIndex: 0 }, instruction.instructionId)];
      }
      instructionIds.add(instruction.instructionId);
    }
  }
  if (!sceneIds.has(program.entrySceneId)) return [diagnostic("RUNTIME_MISSING_SCENE", `Entry scene does not exist: ${program.entrySceneId}`)];
  return [];
}

function validateState(program: RuntimeProgramV1, state: RuntimeStateV1): readonly RuntimeDiagnosticV1[] {
  if (state.schemaVersion !== RUNTIME_STATE_SCHEMA_VERSION || state.runtimeVersion !== RUNTIME_VERSION || state.irVersion !== program.irVersion || state.projectId !== program.projectId) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State identity or version does not match the program", state.cursor)];
  }
  if (!Number.isSafeInteger(state.stateRevision) || state.stateRevision < 0 || !Number.isSafeInteger(state.logicalTimeMilliseconds) || state.logicalTimeMilliseconds < 0) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State counters must be non-negative safe integers", state.cursor)];
  }
  if (state.callStack.length > MAX_CALL_STACK_DEPTH || Object.values(state.variables).some((value) => !finiteScalar(value))) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State contains an invalid stack or variable value", state.cursor)];
  }
  if (state.prng.algorithm !== "xorshift32-v1" || !Number.isInteger(state.prng.state) || state.prng.state < 1 || state.prng.state > 0xffff_ffff || !Number.isSafeInteger(state.prng.draws) || state.prng.draws < 0) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State PRNG is invalid", state.cursor)];
  }
  const meta = state.metaProgress;
  if (meta.schemaVersion !== 1 || meta.projectId !== state.projectId || !canonicalId.test(meta.progressScopeId) || !sortedUniqueIds(meta.readTextIds) || !sortedUniqueIds(meta.unlockedGalleryAssetIds) || !sortedUniqueIds(meta.reachedEndingIds)) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime Meta Progress is invalid", state.cursor)];
  }
  if (!validRecord(state.sceneState.characters) || Object.entries(state.sceneState.characters).some(([slot, character]) => !canonicalId.test(slot) || !canonicalId.test(character.assetId) || (character.expression !== null && !canonicalId.test(character.expression)))) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime Scene State is invalid", state.cursor)];
  }
  if (state.sceneState.backgroundAssetId !== null && !canonicalId.test(state.sceneState.backgroundAssetId)) return [diagnostic("RUNTIME_INVALID_STATE", "Runtime background asset is invalid", state.cursor)];
  if (!validRecord(state.audioState.tracks) || Object.entries(state.audioState.tracks).some(([bus, track]) => !canonicalId.test(bus) || !canonicalId.test(track.assetId) || !["playing", "paused"].includes(track.status) || typeof track.loop !== "boolean" || !Number.isSafeInteger(track.volumePermille) || track.volumePermille < 0 || track.volumePermille > 1000)) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime Audio State is invalid", state.cursor)];
  }
  const scenes = scenesById(program);
  const cursors = [state.cursor, ...state.callStack];
  if (cursors.some((cursor) => !scenes.has(cursor.sceneId) || !Number.isSafeInteger(cursor.instructionIndex) || cursor.instructionIndex < 0)) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State contains an invalid cursor", state.cursor)];
  }
  try { canonicalRuntimeStringify(state); } catch { return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State is not canonically serializable", state.cursor)]; }
  return [];
}

export function createRuntimeState(program: RuntimeProgramV1, options: CreateRuntimeOptionsV1): CreateRuntimeResultV1 {
  const diagnostics = validateProgram(program);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const prngSeed = options.prngSeed ?? DEFAULT_PRNG_SEED;
  const progressScopeId = options.progressScopeId ?? options.executionId;
  if (options.buildId.length === 0 || options.buildId.length > 256 || !canonicalId.test(options.executionId) || !canonicalId.test(progressScopeId) || !Number.isInteger(prngSeed) || prngSeed < 1 || prngSeed > 0xffff_ffff || Object.values(options.initialVariables ?? {}).some((value) => !finiteScalar(value))) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_INVALID_STATE", "Build, execution, and initial variables must be valid")] };
  }
  return {
    ok: true,
    state: {
      schemaVersion: RUNTIME_STATE_SCHEMA_VERSION,
      runtimeVersion: RUNTIME_VERSION,
      irVersion: "1.0.0",
      projectId: program.projectId,
      buildId: options.buildId,
      executionId: options.executionId,
      stateRevision: 0,
      cursor: { sceneId: program.entrySceneId, instructionIndex: 0 },
      callStack: [],
      variables: { ...(options.initialVariables ?? {}) },
      prng: { algorithm: "xorshift32-v1", state: prngSeed, draws: 0 },
      logicalTimeMilliseconds: 0,
      sceneState: { backgroundAssetId: null, characters: {} },
      audioState: { tracks: {} },
      metaProgress: { schemaVersion: 1, projectId: program.projectId, progressScopeId, readTextIds: [], unlockedGalleryAssetIds: [], reachedEndingIds: [] },
      pendingChoice: null,
      terminal: { kind: "running" }
    }
  };
}

function nextPrng(state: number): number {
  let value = state >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return value >>> 0;
}

export function drawRuntimeRandom(state: RuntimeStateV1, request: RuntimeRandomDrawRequestV1): RuntimeRandomDrawResultV1 {
  if (request.expectedStateRevision !== state.stateRevision) return { ok: false, state, diagnostics: [diagnostic("RUNTIME_INPUT_STALE", "Random draw targets a stale state revision", state.cursor)] };
  if (state.prng.algorithm !== "xorshift32-v1" || !Number.isInteger(state.prng.state) || state.prng.state < 1 || state.prng.state > 0xffff_ffff || !Number.isSafeInteger(state.prng.draws) || state.prng.draws < 0) return { ok: false, state, diagnostics: [diagnostic("RUNTIME_INVALID_STATE", "Random draw requires a valid PRNG State", state.cursor)] };
  if (!Number.isSafeInteger(request.minimum) || !Number.isSafeInteger(request.maximum) || request.minimum > request.maximum) return { ok: false, state, diagnostics: [diagnostic("RUNTIME_INVALID_STATE", "Random draw bounds must be ordered safe integers", state.cursor)] };
  const width = request.maximum - request.minimum + 1;
  if (!Number.isSafeInteger(width) || width < 1 || width > 0x1_0000_0000) return { ok: false, state, diagnostics: [diagnostic("RUNTIME_INVALID_STATE", "Random draw range must contain at most 2^32 integers", state.cursor)] };
  const acceptanceLimit = Math.floor(0x1_0000_0000 / width) * width;
  let next = state.prng.state, draws = 0;
  do { next = nextPrng(next); draws += 1; } while (next >= acceptanceLimit);
  const value = request.minimum + (next % width);
  return { ok: true, value, state: { ...state, stateRevision: state.stateRevision + 1, prng: { ...state.prng, state: next, draws: state.prng.draws + draws } } };
}

function addMonotonicId(values: readonly string[], id: string): readonly string[] {
  return values.includes(id) ? values : [...values, id].sort();
}

function directionState(state: RuntimeStateV1, command: string, parameters: Readonly<Record<string, unknown>>): Partial<RuntimeStateV1> | undefined {
  const action = typeof parameters.action === "string" ? parameters.action : command === "background" ? "set" : command === "show" ? "show" : "play";
  if (command === "background") {
    if (action === "clear") return { sceneState: { ...state.sceneState, backgroundAssetId: null } };
    if (action !== "set" || typeof parameters.asset !== "string" || !canonicalId.test(parameters.asset)) return undefined;
    return { sceneState: { ...state.sceneState, backgroundAssetId: parameters.asset }, metaProgress: { ...state.metaProgress, unlockedGalleryAssetIds: addMonotonicId(state.metaProgress.unlockedGalleryAssetIds, parameters.asset) } };
  }
  if (command === "show") {
    const slotValue = parameters.slot ?? parameters.character ?? parameters.asset;
    if (typeof slotValue !== "string" || !canonicalId.test(slotValue)) return undefined;
    if (action === "hide") { const characters = { ...state.sceneState.characters }; delete characters[slotValue]; return { sceneState: { ...state.sceneState, characters } }; }
    if (action === "move") return {};
    if (action !== "show" || typeof parameters.asset !== "string" || !canonicalId.test(parameters.asset) || (parameters.expression !== undefined && (typeof parameters.expression !== "string" || !canonicalId.test(parameters.expression)))) return undefined;
    return { sceneState: { ...state.sceneState, characters: { ...state.sceneState.characters, [slotValue]: { assetId: parameters.asset, expression: typeof parameters.expression === "string" ? parameters.expression : null } } }, metaProgress: { ...state.metaProgress, unlockedGalleryAssetIds: addMonotonicId(state.metaProgress.unlockedGalleryAssetIds, parameters.asset) } };
  }
  if (command === "audio") {
    const bus = typeof parameters.bus === "string" ? parameters.bus : "sfx";
    if (!canonicalId.test(bus)) return undefined;
    const tracks = { ...state.audioState.tracks };
    if (action === "stop") { delete tracks[bus]; return { audioState: { tracks } }; }
    const current = tracks[bus];
    if (action === "pause" || action === "resume") {
      if (current === undefined) return undefined;
      tracks[bus] = { ...current, status: action === "pause" ? "paused" : "playing" };
      return { audioState: { tracks } };
    }
    const volume = parameters.volumePermille ?? 1000;
    if (action !== "play" || typeof parameters.asset !== "string" || !canonicalId.test(parameters.asset) || !Number.isSafeInteger(volume) || (volume as number) < 0 || (volume as number) > 1000 || (parameters.loop !== undefined && typeof parameters.loop !== "boolean")) return undefined;
    tracks[bus] = { assetId: parameters.asset, status: "playing", loop: parameters.loop === true, volumePermille: volume as number };
    return { audioState: { tracks } };
  }
  return undefined;
}

function stringOperand(instruction: RuntimeInstructionV1, name: string): string | undefined {
  const value = instruction.operands[name];
  return typeof value === "string" ? value : undefined;
}

function nextCursor(cursor: RuntimeCursorV1): RuntimeCursorV1 {
  return { sceneId: cursor.sceneId, instructionIndex: cursor.instructionIndex + 1 };
}

function labelCursor(scene: RuntimeSceneV1, label: string): RuntimeCursorV1 | undefined {
  const index = scene.instructions.findIndex((instruction) => instruction.opcode === "label" && stringOperand(instruction, "name") === label);
  return index < 0 ? undefined : { sceneId: scene.sceneId, instructionIndex: index };
}

type ExpressionNode =
  | { readonly kind: "literal"; readonly value: RuntimeScalar }
  | { readonly kind: "identifier"; readonly name: string }
  | { readonly kind: "unary"; readonly operator: "!" | "-"; readonly operand: ExpressionNode }
  | { readonly kind: "binary"; readonly operator: string; readonly left: ExpressionNode; readonly right: ExpressionNode };

function expressionNode(value: unknown): value is ExpressionNode {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (node.kind === "literal") return finiteScalar(node.value);
  if (node.kind === "identifier") return typeof node.name === "string";
  if (node.kind === "unary") return (node.operator === "!" || node.operator === "-") && expressionNode(node.operand);
  return node.kind === "binary" && typeof node.operator === "string" && expressionNode(node.left) && expressionNode(node.right);
}

function evaluate(node: ExpressionNode, variables: Readonly<Record<string, RuntimeScalar>>): RuntimeScalar {
  if (node.kind === "literal") return node.value;
  if (node.kind === "identifier") {
    if (!(node.name in variables)) throw new Error(`missing:${node.name}`);
    return variables[node.name]!;
  }
  if (node.kind === "unary") {
    const operand = evaluate(node.operand, variables);
    if (node.operator === "!") {
      if (typeof operand !== "boolean") throw new TypeError("boolean operand required");
      return !operand;
    }
    if (typeof operand !== "number") throw new TypeError("number operand required");
    return -operand;
  }
  const left = evaluate(node.left, variables);
  if (node.operator === "&&") {
    if (typeof left !== "boolean") throw new TypeError("boolean operand required");
    if (!left) return false;
    const right = evaluate(node.right, variables);
    if (typeof right !== "boolean") throw new TypeError("boolean operand required");
    return right;
  }
  if (node.operator === "||") {
    if (typeof left !== "boolean") throw new TypeError("boolean operand required");
    if (left) return true;
    const right = evaluate(node.right, variables);
    if (typeof right !== "boolean") throw new TypeError("boolean operand required");
    return right;
  }
  const right = evaluate(node.right, variables);
  switch (node.operator) {
    case "==": return left === right;
    case "!=": return left !== right;
    case "+":
      if (typeof left === "number" && typeof right === "number") return left + right;
      if (typeof left === "string" && typeof right === "string") return left + right;
      break;
    case "-": if (typeof left === "number" && typeof right === "number") return left - right; break;
    case "*": if (typeof left === "number" && typeof right === "number") return left * right; break;
    case "/": if (typeof left === "number" && typeof right === "number" && right !== 0) return left / right; break;
    case "<": if (typeof left === "number" && typeof right === "number") return left < right; break;
    case "<=": if (typeof left === "number" && typeof right === "number") return left <= right; break;
    case ">": if (typeof left === "number" && typeof right === "number") return left > right; break;
    case ">=": if (typeof left === "number" && typeof right === "number") return left >= right; break;
  }
  throw new TypeError(`invalid operands for ${node.operator}`);
}

function failure(state: RuntimeStateV1, code: RuntimeDiagnosticCode, message: string, instruction?: RuntimeInstructionV1, executedInstructions = 0): RuntimeRunResultV1 {
  return { state, event: null, executedInstructions, diagnostics: [diagnostic(code, message, state.cursor, instruction?.instructionId)] };
}

function choiceOptions(instruction: RuntimeInstructionV1): readonly RuntimeChoiceOptionV1[] | undefined {
  const source = instruction.operands.options;
  if (!Array.isArray(source)) return undefined;
  const options: RuntimeChoiceOptionV1[] = [];
  for (const value of source) {
    if (value === null || Array.isArray(value) || typeof value !== "object") return undefined;
    const item = value as Record<string, unknown>;
    if (typeof item.optionId !== "string" || typeof item.label !== "string" || typeof item.targetSceneId !== "string") return undefined;
    options.push({ optionId: item.optionId, label: item.label, targetSceneId: item.targetSceneId });
  }
  return options.length > 0 ? options : undefined;
}

function applyChoice(program: RuntimeProgramV1, state: RuntimeStateV1, input: RuntimeChoiceInputV1): RuntimeStateV1 | RuntimeDiagnosticV1 {
  const pending = state.pendingChoice;
  if (pending === null) return diagnostic("RUNTIME_CHOICE_MISMATCH", "No choice is pending", state.cursor);
  if (input.expectedStateRevision !== state.stateRevision) return diagnostic("RUNTIME_INPUT_STALE", "Choice input targets a stale state revision", state.cursor, pending.instructionId);
  if (input.instructionId !== pending.instructionId) return diagnostic("RUNTIME_CHOICE_MISMATCH", "Choice input targets a different instruction", state.cursor, pending.instructionId);
  const option = pending.options.find((item) => item.optionId === input.optionId);
  if (option === undefined) return diagnostic("RUNTIME_CHOICE_MISMATCH", `Unknown choice option: ${input.optionId}`, state.cursor, pending.instructionId);
  if (!scenesById(program).has(option.targetSceneId)) return diagnostic("RUNTIME_MISSING_SCENE", `Choice target scene does not exist: ${option.targetSceneId}`, state.cursor, pending.instructionId);
  return { ...state, stateRevision: state.stateRevision + 1, cursor: { sceneId: option.targetSceneId, instructionIndex: 0 }, pendingChoice: null };
}

export function runRuntime(program: RuntimeProgramV1, initialState: RuntimeStateV1, options: RuntimeRunOptionsV1 = {}): RuntimeRunResultV1 {
  const programDiagnostics = validateProgram(program);
  if (programDiagnostics.length > 0) return { state: initialState, event: null, executedInstructions: 0, diagnostics: programDiagnostics };
  let stateDiagnostics: readonly RuntimeDiagnosticV1[];
  try { stateDiagnostics = validateState(program, initialState); }
  catch { stateDiagnostics = [diagnostic("RUNTIME_INVALID_STATE", "Runtime State structure is missing or malformed")]; }
  if (stateDiagnostics.length > 0) return { state: initialState, event: null, executedInstructions: 0, diagnostics: stateDiagnostics };
  if (initialState.terminal.kind === "ended") return failure(initialState, "RUNTIME_TERMINAL", "Runtime has already ended");
  let state = initialState;
  if (state.pendingChoice !== null) {
    if (options.input === undefined) {
      const pending = state.pendingChoice;
      return { state, event: { kind: "choice", instructionId: pending.instructionId, prompt: pending.prompt, options: pending.options }, executedInstructions: 0, diagnostics: [] };
    }
    const selected = applyChoice(program, state, options.input);
    if ("code" in selected) return { state, event: null, executedInstructions: 0, diagnostics: [selected] };
    state = selected;
  } else if (options.input !== undefined) {
    return failure(state, "RUNTIME_CHOICE_MISMATCH", "Choice input was supplied when no choice is pending");
  }

  const budget = options.instructionBudget ?? DEFAULT_INSTRUCTION_BUDGET;
  if (!Number.isSafeInteger(budget) || budget < 1) return failure(state, "RUNTIME_INVALID_STATE", "Instruction budget must be a positive safe integer");
  const scenes = scenesById(program);
  for (let executed = 0; executed < budget; executed += 1) {
    const scene = scenes.get(state.cursor.sceneId);
    if (scene === undefined) return failure(state, "RUNTIME_MISSING_SCENE", `Scene does not exist: ${state.cursor.sceneId}`, undefined, executed);
    const instruction = scene.instructions[state.cursor.instructionIndex];
    if (instruction === undefined) return failure(state, "RUNTIME_FALLTHROUGH", `Scene fell through without an exit: ${scene.sceneId}`, undefined, executed);
    const operands = instruction.operands;
    const advance = (event: RuntimeEventV1 | null = null, extra: Partial<RuntimeStateV1> = {}): RuntimeRunResultV1 | undefined => {
      state = { ...state, ...extra, stateRevision: state.stateRevision + 1, cursor: nextCursor(state.cursor) };
      return event === null ? undefined : { state, event, executedInstructions: executed + 1, diagnostics: [] };
    };
    if (instruction.opcode === "label") { advance(); continue; }
    if (instruction.opcode === "dialogue") {
      const speakerId = stringOperand(instruction, "speakerId"), textId = stringOperand(instruction, "textId"), text = stringOperand(instruction, "text");
      if (speakerId === undefined || textId === undefined || text === undefined) return failure(state, "RUNTIME_INVALID_IR", "Dialogue operands are malformed", instruction, executed);
      if (!canonicalId.test(textId)) return failure(state, "RUNTIME_INVALID_IR", "Dialogue text ID is invalid", instruction, executed);
      return advance({ kind: "dialogue", instructionId: instruction.instructionId, speakerId, textId, text }, { metaProgress: { ...state.metaProgress, readTextIds: addMonotonicId(state.metaProgress.readTextIds, textId) } })!;
    }
    if (instruction.opcode === "narration") {
      const textId = stringOperand(instruction, "textId"), text = stringOperand(instruction, "text");
      if (textId === undefined || text === undefined) return failure(state, "RUNTIME_INVALID_IR", "Narration operands are malformed", instruction, executed);
      if (!canonicalId.test(textId)) return failure(state, "RUNTIME_INVALID_IR", "Narration text ID is invalid", instruction, executed);
      return advance({ kind: "narration", instructionId: instruction.instructionId, textId, text }, { metaProgress: { ...state.metaProgress, readTextIds: addMonotonicId(state.metaProgress.readTextIds, textId) } })!;
    }
    if (instruction.opcode === "direction") {
      const command = stringOperand(instruction, "command"), parameters = operands.parameters;
      if (command === undefined || parameters === null || Array.isArray(parameters) || typeof parameters !== "object") return failure(state, "RUNTIME_INVALID_IR", "Direction operands are malformed", instruction, executed);
      const directionParameters = parameters as Readonly<Record<string, unknown>>;
      const extra = directionState(state, command, directionParameters);
      if (extra === undefined) return failure(state, "RUNTIME_INVALID_IR", "Direction command, action, or logical parameters are malformed", instruction, executed);
      return advance({ kind: "direction", instructionId: instruction.instructionId, command, parameters: directionParameters }, extra)!;
    }
    if (instruction.opcode === "choice") {
      const prompt = stringOperand(instruction, "prompt"), choices = choiceOptions(instruction);
      if (prompt === undefined || choices === undefined) return failure(state, "RUNTIME_INVALID_IR", "Choice operands are malformed", instruction, executed);
      const pendingChoice = { instructionId: instruction.instructionId, sceneId: state.cursor.sceneId, instructionIndex: state.cursor.instructionIndex, prompt, options: choices };
      state = { ...state, stateRevision: state.stateRevision + 1, pendingChoice };
      return { state, event: { kind: "choice", instructionId: instruction.instructionId, prompt, options: choices }, executedInstructions: executed + 1, diagnostics: [] };
    }
    if (instruction.opcode === "jump" || instruction.opcode === "call") {
      const targetLabel = stringOperand(instruction, "targetLabel"), target = targetLabel === undefined ? undefined : labelCursor(scene, targetLabel);
      if (target === undefined) return failure(state, "RUNTIME_MISSING_LABEL", `Target label does not exist: ${targetLabel ?? "missing"}`, instruction, executed);
      if (instruction.opcode === "call" && state.callStack.length >= MAX_CALL_STACK_DEPTH) return failure(state, "RUNTIME_CALL_STACK_OVERFLOW", "Call stack depth exceeded", instruction, executed);
      state = { ...state, stateRevision: state.stateRevision + 1, cursor: target, callStack: instruction.opcode === "call" ? [...state.callStack, nextCursor(state.cursor)] : state.callStack };
      continue;
    }
    if (instruction.opcode === "return") {
      const target = state.callStack.at(-1);
      if (target === undefined) return failure(state, "RUNTIME_CALL_STACK_UNDERFLOW", "Return executed with an empty call stack", instruction, executed);
      state = { ...state, stateRevision: state.stateRevision + 1, cursor: target, callStack: state.callStack.slice(0, -1) };
      continue;
    }
    if (instruction.opcode === "set" || instruction.opcode === "condition") {
      const ast = operands.expressionAst;
      if (!expressionNode(ast)) return failure(state, "RUNTIME_EXPRESSION_INVALID", "Expression AST is malformed", instruction, executed);
      let value: RuntimeScalar;
      try { value = evaluate(ast, state.variables); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = message.startsWith("missing:") ? "RUNTIME_VARIABLE_MISSING" : "RUNTIME_TYPE_MISMATCH";
        return failure(state, code, message, instruction, executed);
      }
      if (!finiteScalar(value)) return failure(state, "RUNTIME_EXPRESSION_INVALID", "Expression produced a non-finite value", instruction, executed);
      if (instruction.opcode === "set") {
        const variableId = stringOperand(instruction, "variableId");
        if (variableId === undefined || !(variableId in state.variables)) return failure(state, "RUNTIME_VARIABLE_MISSING", `Set target is missing: ${variableId ?? "missing"}`, instruction, executed);
        state = { ...state, stateRevision: state.stateRevision + 1, cursor: nextCursor(state.cursor), variables: { ...state.variables, [variableId]: value } };
        continue;
      }
      if (typeof value !== "boolean") return failure(state, "RUNTIME_TYPE_MISMATCH", "Condition expression must produce boolean", instruction, executed);
      const targetLabel = stringOperand(instruction, "targetLabel"), target = targetLabel === undefined ? undefined : labelCursor(scene, targetLabel);
      if (target === undefined) return failure(state, "RUNTIME_MISSING_LABEL", `Condition target label does not exist: ${targetLabel ?? "missing"}`, instruction, executed);
      state = { ...state, stateRevision: state.stateRevision + 1, cursor: value ? target : nextCursor(state.cursor) };
      continue;
    }
    if (instruction.opcode === "wait") {
      const duration = operands.durationMilliseconds;
      if (typeof duration !== "number" || !Number.isSafeInteger(duration) || duration < 0) return failure(state, "RUNTIME_INVALID_IR", "Wait duration is malformed", instruction, executed);
      return advance({ kind: "wait", instructionId: instruction.instructionId, durationMilliseconds: duration }, { logicalTimeMilliseconds: state.logicalTimeMilliseconds + duration })!;
    }
    if (instruction.opcode === "end") {
      const endingId = stringOperand(instruction, "endingId"), name = stringOperand(instruction, "name");
      if (endingId === undefined || name === undefined) return failure(state, "RUNTIME_INVALID_IR", "Ending operands are malformed", instruction, executed);
      if (!canonicalId.test(endingId)) return failure(state, "RUNTIME_INVALID_IR", "Ending ID is invalid", instruction, executed);
      state = { ...state, stateRevision: state.stateRevision + 1, terminal: { kind: "ended", endingId, name }, metaProgress: { ...state.metaProgress, reachedEndingIds: addMonotonicId(state.metaProgress.reachedEndingIds, endingId) } };
      return { state, event: { kind: "ending", instructionId: instruction.instructionId, endingId, name }, executedInstructions: executed + 1, diagnostics: [] };
    }
  }
  return failure(state, "RUNTIME_BUDGET_EXCEEDED", `No observable stop was reached within ${budget} instructions`, undefined, budget);
}

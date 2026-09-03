import type { RuntimeInstructionV1, RuntimeSceneV1 } from "@world-studio/project-compiler";
import {
  DEFAULT_PRNG_SEED,
  DEFAULT_INSTRUCTION_BUDGET,
  MAX_CALL_STACK_DEPTH,
  MAX_INPUT_RECEIPTS,
  MAX_META_PROGRESS_IDS_PER_DOMAIN,
  RUNTIME_STATE_SCHEMA_VERSION,
  RUNTIME_VERSION,
  type CreateRuntimeOptionsV1,
  type CreateRuntimeResultV1,
  type RuntimeChoiceOptionV1,
  type RuntimeCursorV1,
  type RuntimeDiagnosticCode,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeEffectIntentV1,
  type RuntimeExpressionEvaluationV1,
  type RuntimeInputV1,
  type RuntimeProgramV1,
  type RuntimeRandomDrawRequestV1,
  type RuntimeRandomDrawResultV1,
  type RuntimeRunOptionsV1,
  type RuntimeRunResultV1,
  type RuntimeScalar,
  type RuntimeStateV1
} from "./types";
import { canonicalRuntimeStringify } from "./canonical";
import { runtimeBarrierRequestIdV1, runtimeChoiceRequestIdV1, runtimeEffectIdV1 } from "./effect";

const supportedOpcodes = new Set([
  "dialogue", "narration", "direction", "choice", "label", "jump", "call", "return", "set", "condition", "wait", "checkpoint", "end"
]);
const canonicalId = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const runtimeStateKeys = ["audioState", "barrierLedger", "buildId", "callStack", "cursor", "executionId", "inputReceipts", "irVersion", "logicalTimeMilliseconds", "metaProgress", "nextEffectSequence", "nextInputSequence", "pendingBarrier", "pendingChoice", "pendingEffect", "prng", "projectId", "runtimeVersion", "sceneState", "schemaVersion", "stateRevision", "terminal", "variables"] as const;

function diagnostic(code: RuntimeDiagnosticCode, message: string, cursor?: RuntimeCursorV1, instructionId?: string): RuntimeDiagnosticV1 {
  return { code, message, sceneId: cursor?.sceneId ?? null, instructionIndex: cursor?.instructionIndex ?? null, instructionId: instructionId ?? null };
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

function exactRecordKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function validEffectState(effect: RuntimeEffectIntentV1): boolean {
  return canonicalId.test(effect.effectId) && canonicalId.test(effect.executionId) && Number.isSafeInteger(effect.originatingRevision) && effect.originatingRevision > 0 && Number.isSafeInteger(effect.logicalSequence) && effect.logicalSequence >= 0 && canonicalId.test(effect.descriptorId) && canonicalId.test(effect.channel) && canonicalId.test(effect.kind) && validRecord(effect.payload) && Object.values(effect.payload).every(finiteScalar) && ["pure", "reversible", "barrier"].includes(effect.policy) && ["detached", "awaited"].includes(effect.awaitMode) && canonicalId.test(effect.cancellationScope) && canonicalId.test(effect.replayKey) && (effect.policy === "reversible" ? effect.compensation !== null && canonicalId.test(effect.compensation.kind) && Object.values(effect.compensation.payload).every(finiteScalar) : effect.compensation === null);
}

export function validateRuntimeEffectIntentV1(effect: RuntimeEffectIntentV1): boolean {
  try { return validEffectState(effect); }
  catch { return false; }
}

function scenesById(program: RuntimeProgramV1): Map<string, RuntimeSceneV1> {
  return new Map(program.scenes.map((scene) => [scene.sceneId, scene]));
}

export function validateRuntimeProgramV1(program: RuntimeProgramV1): readonly RuntimeDiagnosticV1[] {
  if (program.schemaVersion !== 1 || (program.irVersion !== "1.0.0" && program.irVersion !== "1.1.0")) {
    return [diagnostic("RUNTIME_INCOMPATIBLE_IR", `Expected Runtime IR 1.0.0 or 1.1.0/schema 1, received ${String(program.irVersion)}/schema ${String(program.schemaVersion)}`)];
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
      if (instruction.opcode === "checkpoint" && program.irVersion !== "1.1.0") {
        return [diagnostic("RUNTIME_INVALID_IR", `Checkpoint requires Runtime IR 1.1.0: ${instruction.instructionId}`, { sceneId: scene.sceneId, instructionIndex: 0 }, instruction.instructionId)];
      }
      instructionIds.add(instruction.instructionId);
    }
  }
  if (!sceneIds.has(program.entrySceneId)) return [diagnostic("RUNTIME_MISSING_SCENE", `Entry scene does not exist: ${program.entrySceneId}`)];
  return [];
}

/** Structural validation used when the caller immediately canonicalizes or hashes the State. */
export function validateRuntimeStateStructureV1(program: RuntimeProgramV1, state: RuntimeStateV1): readonly RuntimeDiagnosticV1[] {
  if (!validRecord(state) || !exactRecordKeys(state, runtimeStateKeys)) return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State schema members are missing or unknown")];
  if (state.schemaVersion !== RUNTIME_STATE_SCHEMA_VERSION || state.runtimeVersion !== RUNTIME_VERSION || state.irVersion !== program.irVersion || state.projectId !== program.projectId) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State identity or version does not match the program", state.cursor)];
  }
  if (state.buildId.length === 0 || state.buildId.length > 256 || !canonicalId.test(state.executionId)) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State Build or execution identity is invalid", state.cursor)];
  }
  if (!Number.isSafeInteger(state.stateRevision) || state.stateRevision < 0 || !Number.isSafeInteger(state.logicalTimeMilliseconds) || state.logicalTimeMilliseconds < 0) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State counters must be non-negative safe integers", state.cursor)];
  }
  if (!Number.isSafeInteger(state.nextEffectSequence) || state.nextEffectSequence < 0 || !Number.isSafeInteger(state.nextInputSequence) || state.nextInputSequence < 0 || state.inputReceipts.length > MAX_INPUT_RECEIPTS) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime Effect/Input counters or receipt ledger are invalid", state.cursor)];
  }
  const pendingChoiceInvalid = state.pendingChoice !== null && (!canonicalId.test(state.pendingChoice.requestId) || state.pendingChoice.expectedStateRevision !== state.stateRevision || !Number.isSafeInteger(state.pendingChoice.logicalSequence) || state.pendingChoice.logicalSequence < 0 || !canonicalId.test(state.pendingChoice.instructionId) || state.pendingChoice.sceneId !== state.cursor.sceneId || state.pendingChoice.instructionIndex !== state.cursor.instructionIndex || state.pendingChoice.options.length === 0 || state.pendingChoice.options.some((option) => !canonicalId.test(option.optionId) || !canonicalId.test(option.targetSceneId)) || new Set(state.pendingChoice.options.map((option) => option.optionId)).size !== state.pendingChoice.options.length);
  if (pendingChoiceInvalid || (state.pendingEffect !== null && (!validEffectState(state.pendingEffect) || state.pendingEffect.executionId !== state.executionId || state.pendingEffect.originatingRevision !== state.stateRevision || state.pendingEffect.awaitMode !== "awaited" || state.pendingEffect.policy === "barrier")) || (state.pendingBarrier !== null && (!canonicalId.test(state.pendingBarrier.requestId) || state.pendingBarrier.executionId !== state.executionId || state.pendingBarrier.expectedStateRevision !== state.stateRevision || !Number.isSafeInteger(state.pendingBarrier.logicalSequence) || state.pendingBarrier.logicalSequence < 0 || !canonicalId.test(state.pendingBarrier.instructionId) || !canonicalId.test(state.pendingBarrier.descriptorId) || state.pendingBarrier.reason.length === 0)) || [state.pendingChoice, state.pendingEffect, state.pendingBarrier].filter((item) => item !== null).length > 1 || (state.terminal.kind === "ended" && [state.pendingChoice, state.pendingEffect, state.pendingBarrier].some((item) => item !== null))) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime pending input or Effect State is invalid", state.cursor)];
  }
  const receiptIds = new Set<string>();
  for (const receipt of state.inputReceipts) {
    if (!validInput(receipt.input) || receipt.input.executionId !== state.executionId || !Number.isSafeInteger(receipt.acceptedAtRevision) || receipt.acceptedAtRevision < 1 || receipt.acceptedAtRevision > state.stateRevision || receiptIds.has(receipt.input.inputId)) return [diagnostic("RUNTIME_INVALID_STATE", "Runtime input receipt ledger is invalid", state.cursor)];
    receiptIds.add(receipt.input.inputId);
  }
  if (state.barrierLedger.some((record) => !canonicalId.test(record.effectId) || !canonicalId.test(record.descriptorId) || record.reason.length === 0 || !Number.isSafeInteger(record.committedAtRevision) || record.committedAtRevision < 1 || record.committedAtRevision > state.stateRevision)) return [diagnostic("RUNTIME_INVALID_STATE", "Runtime Barrier ledger is invalid", state.cursor)];
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
  if (state.pendingChoice?.options.some((option) => !scenes.has(option.targetSceneId)) === true) return [diagnostic("RUNTIME_INVALID_STATE", "Runtime Choice State targets a missing scene", state.cursor)];
  const cursors = [state.cursor, ...state.callStack];
  if (cursors.some((cursor) => !scenes.has(cursor.sceneId) || !Number.isSafeInteger(cursor.instructionIndex) || cursor.instructionIndex < 0)) {
    return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State contains an invalid cursor", state.cursor)];
  }
  return [];
}

export function validateRuntimeStateV1(program: RuntimeProgramV1, state: RuntimeStateV1): readonly RuntimeDiagnosticV1[] {
  const diagnostics = validateRuntimeStateStructureV1(program, state);
  if (diagnostics.length > 0) return diagnostics;
  try { canonicalRuntimeStringify(state); } catch { return [diagnostic("RUNTIME_INVALID_STATE", "Runtime State is not canonically serializable", state.cursor)]; }
  return [];
}

export function createRuntimeState(program: RuntimeProgramV1, options: CreateRuntimeOptionsV1): CreateRuntimeResultV1 {
  const diagnostics = validateRuntimeProgramV1(program);
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
      irVersion: program.irVersion,
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
      pendingEffect: null,
      pendingBarrier: null,
      nextEffectSequence: 0,
      nextInputSequence: 0,
      inputReceipts: [],
      barrierLedger: [],
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
  const action = typeof parameters.action === "string" ? parameters.action : command === "background" || command === "textbox" ? "set" : command === "show" ? "show" : command === "camera" ? "move" : "play";
  if (parameters.transition !== undefined && (typeof parameters.transition !== "string" || !["fade", "dissolve", "slide"].includes(parameters.transition))) return undefined;
  if (command === "background") {
    if (action === "clear") return { sceneState: { ...state.sceneState, backgroundAssetId: null } };
    if (action !== "set" || typeof parameters.asset !== "string" || !canonicalId.test(parameters.asset)) return undefined;
    return { sceneState: { ...state.sceneState, backgroundAssetId: parameters.asset }, metaProgress: { ...state.metaProgress, unlockedGalleryAssetIds: addMonotonicId(state.metaProgress.unlockedGalleryAssetIds, parameters.asset) } };
  }
  if (command === "show") {
    const slotValue = parameters.slot ?? parameters.character ?? parameters.asset;
    if (typeof slotValue !== "string" || !canonicalId.test(slotValue)) return undefined;
    const bezierKeys = ["curve", "control1X", "control1Y", "control2X", "control2Y"];
    if (action !== "move" && bezierKeys.some((key) => parameters[key] !== undefined)) return undefined;
    if (action === "hide") { const characters = { ...state.sceneState.characters }; delete characters[slotValue]; return { sceneState: { ...state.sceneState, characters } }; }
    if (action === "move") {
      const controls = bezierKeys.slice(1);
      const presentControls = controls.filter((key) => parameters[key] !== undefined);
      if (parameters.curve === undefined && presentControls.length > 0) return undefined;
      if (parameters.curve !== undefined) {
        if (parameters.curve !== "bezier" || parameters.x === undefined || parameters.y === undefined || presentControls.length !== controls.length) return undefined;
        if (["x", "y", ...controls].some((key) => normalizeDirectionPayloadScalar(command, action, key, parameters[key]) === undefined)) return undefined;
      }
      return {};
    }
    if (action !== "show" || typeof parameters.asset !== "string" || !canonicalId.test(parameters.asset) || (parameters.expression !== undefined && (typeof parameters.expression !== "string" || !canonicalId.test(parameters.expression)))) return undefined;
    return { sceneState: { ...state.sceneState, characters: { ...state.sceneState.characters, [slotValue]: { assetId: parameters.asset, expression: typeof parameters.expression === "string" ? parameters.expression : null } } }, metaProgress: { ...state.metaProgress, unlockedGalleryAssetIds: addMonotonicId(state.metaProgress.unlockedGalleryAssetIds, parameters.asset) } };
  }
  if (command === "camera") {
    if (action === "reset") return {};
    if (action !== "move") return undefined;
    const ranges: Readonly<Record<string, readonly [number, number]>> = {
      x: [-100, 100], y: [-100, 100], zoom: [0.5, 3], rotation: [-30, 30]
    };
    const geometry = Object.entries(ranges).filter(([key]) => parameters[key] !== undefined);
    if (geometry.length === 0 || geometry.some(([key]) => normalizeDirectionPayloadScalar(command, action, key, parameters[key]) === undefined)) return undefined;
    return {};
  }
  if (command === "textbox") {
    if (action === "reset") return parameters.template === undefined ? {} : undefined;
    return action === "set" && typeof parameters.template === "string" && ["adv", "nvl", "bubble"].includes(parameters.template) ? {} : undefined;
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

function directionEffect(state: RuntimeStateV1, instruction: RuntimeInstructionV1, command: string, parameters: Readonly<Record<string, unknown>>, originatingRevision: number): RuntimeEffectIntentV1 | undefined {
  const policy = parameters.effectPolicy ?? "pure";
  const awaitMode = parameters.awaitMode ?? "detached";
  const descriptorId = parameters.descriptorId ?? instruction.instructionId;
  const defaultChannel = command === "show"
    ? `show.${String(parameters.slot ?? parameters.character ?? parameters.asset ?? "invalid")}`
    : command === "audio"
      ? `audio.${String(parameters.bus ?? "sfx")}`
      : command;
  const channel = parameters.channel ?? defaultChannel;
  const action = typeof parameters.action === "string" ? parameters.action : command === "background" || command === "textbox" ? "set" : command === "show" ? "show" : command === "camera" ? "move" : "play";
  const cancellationScope = parameters.cancellationScope ?? `scope.${state.cursor.sceneId}`;
  const replayKey = parameters.replayKey ?? `replay.${instruction.instructionId}`;
  if (!["pure", "reversible", "barrier"].includes(String(policy)) || !["detached", "awaited"].includes(String(awaitMode)) || typeof descriptorId !== "string" || typeof channel !== "string" || typeof cancellationScope !== "string" || typeof replayKey !== "string" || !canonicalId.test(descriptorId) || !canonicalId.test(channel) || !canonicalId.test(cancellationScope) || !canonicalId.test(replayKey)) return undefined;
  if (policy === "barrier" && (awaitMode !== "detached" || typeof parameters.barrierReason !== "string" || parameters.barrierReason.length === 0)) return undefined;
  const compensationKind = parameters.compensationKind;
  if (policy === "reversible" && (typeof compensationKind !== "string" || !canonicalId.test(compensationKind))) return undefined;
  if (policy !== "reversible" && compensationKind !== undefined) return undefined;
  const metadata = new Set(["effectPolicy", "awaitMode", "descriptorId", "channel", "cancellationScope", "replayKey", "compensationKind", "barrierReason"]);
  const payload: Record<string, RuntimeScalar> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (metadata.has(key)) continue;
    const normalized = normalizeDirectionPayloadScalar(command, action, key, value);
    if (normalized === undefined) return undefined;
    payload[key] = normalized;
  }
  if (command === "show" && action === "move") {
    const slot = String(parameters.slot ?? parameters.character ?? parameters.asset ?? "");
    const current = state.sceneState.characters[slot];
    if (current !== undefined) {
      payload.asset = current.assetId;
      if (current.expression !== null) payload.expression = current.expression;
    }
  }
  if (command === "audio" && (action === "pause" || action === "resume")) {
    const bus = String(parameters.bus ?? "sfx");
    const current = state.audioState.tracks[bus];
    if (current !== undefined) {
      payload.asset = current.assetId;
      payload.loop = current.loop;
      payload.volumePermille = current.volumePermille;
    }
  }
  return {
    effectId: runtimeEffectIdV1(state.executionId, descriptorId, state.nextEffectSequence, originatingRevision),
    executionId: state.executionId,
    originatingRevision,
    logicalSequence: state.nextEffectSequence,
    descriptorId,
    channel,
    kind: `${command}.${action}`,
    payload,
    policy: policy as RuntimeEffectIntentV1["policy"],
    awaitMode: awaitMode as RuntimeEffectIntentV1["awaitMode"],
    cancellationScope,
    replayKey,
    compensation: policy === "reversible" ? { kind: compensationKind as string, payload: {} } : null
  };
}

const stageNumberRanges: Readonly<Record<string, readonly [number, number]>> = {
  x: [0, 100],
  y: [0, 100],
  scale: [0.1, 4],
  rotation: [-360, 360],
  anchorX: [0, 1],
  anchorY: [0, 1],
  control1X: [0, 100],
  control1Y: [0, 100],
  control2X: [0, 100],
  control2Y: [0, 100],
  z: [-1000, 1000]
};

const cameraNumberRanges: Readonly<Record<string, readonly [number, number]>> = {
  x: [-100, 100], y: [-100, 100], zoom: [0.5, 3], rotation: [-30, 30]
};

function normalizeDirectionPayloadScalar(command: string, action: string, key: string, value: unknown): RuntimeScalar | undefined {
  const range = command === "show" && (action === "show" || action === "move") ? stageNumberRanges[key]
    : command === "camera" && action === "move" ? cameraNumberRanges[key] : undefined;
  if (range === undefined) return finiteScalar(value) ? value : undefined;
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?\d+(?:\.\d+)?$/u.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < range[0] || numeric > range[1] || key === "z" && !Number.isInteger(numeric)) return undefined;
  // Runtime snapshots deliberately admit safe integers only. Preserve fractional Stage
  // geometry as one canonical decimal string so hashing stays deterministic while
  // integer coordinates remain numeric for presentation hosts.
  return Number.isSafeInteger(numeric) ? numeric : numeric.toString();
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

/** Read-only expression inspection that shares the exact evaluator used by Runtime execution. */
export function evaluateRuntimeExpressionV1(expressionAst: unknown, variables: Readonly<Record<string, RuntimeScalar>>): RuntimeExpressionEvaluationV1 {
  if (!expressionNode(expressionAst)) return { ok: false, code: "RUNTIME_EXPRESSION_INVALID", message: "Expression AST is malformed" };
  let value: RuntimeScalar;
  try { value = evaluate(expressionAst, variables); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: message.startsWith("missing:") ? "RUNTIME_VARIABLE_MISSING" : "RUNTIME_TYPE_MISMATCH", message };
  }
  if (!finiteScalar(value)) return { ok: false, code: "RUNTIME_EXPRESSION_INVALID", message: "Expression produced a non-finite value" };
  const valueType = value === null ? "null" : typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string";
  return { ok: true, value, valueType };
}

function failure(state: RuntimeStateV1, code: RuntimeDiagnosticCode, message: string, instruction?: RuntimeInstructionV1, executedInstructions = 0): RuntimeRunResultV1 {
  return { state, event: null, executedInstructions, diagnostics: [diagnostic(code, message, state.cursor, instruction?.instructionId)], effects: [], barrierRequest: null };
}

function success(state: RuntimeStateV1, event: RuntimeEventV1 | null, executedInstructions: number, effects: readonly RuntimeEffectIntentV1[] = [], barrierRequest: RuntimeStateV1["pendingBarrier"] = null): RuntimeRunResultV1 {
  return { state, event, executedInstructions, diagnostics: [], effects, barrierRequest };
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

function validInput(input: unknown): input is RuntimeInputV1 {
  if (!validRecord(input)) return false;
  const candidate = input as unknown as RuntimeInputV1;
  const common = candidate.schemaVersion === 1 && typeof candidate.inputId === "string" && canonicalId.test(candidate.inputId) && typeof candidate.executionId === "string" && canonicalId.test(candidate.executionId) && Number.isSafeInteger(candidate.expectedStateRevision) && candidate.expectedStateRevision >= 0 && Number.isSafeInteger(candidate.logicalSequence) && candidate.logicalSequence >= 0;
  if (!common) return false;
  if (candidate.kind === "choiceSelected") return typeof candidate.requestId === "string" && canonicalId.test(candidate.requestId) && typeof candidate.instructionId === "string" && canonicalId.test(candidate.instructionId) && typeof candidate.optionId === "string" && canonicalId.test(candidate.optionId);
  if (candidate.kind === "barrierApproved") return typeof candidate.requestId === "string" && canonicalId.test(candidate.requestId) && typeof candidate.descriptorId === "string" && canonicalId.test(candidate.descriptorId);
  if (candidate.kind === "effectCompleted") return typeof candidate.effectId === "string" && canonicalId.test(candidate.effectId) && typeof candidate.replayKey === "string" && canonicalId.test(candidate.replayKey);
  return candidate.kind === "effectCancelled" && typeof candidate.effectId === "string" && canonicalId.test(candidate.effectId) && typeof candidate.cancellationScope === "string" && canonicalId.test(candidate.cancellationScope);
}

export function validateRuntimeInputStructureV1(input: unknown): input is RuntimeInputV1 {
  try {
    if (!validRecord(input) || !validInput(input)) return false;
    const common = ["executionId", "expectedStateRevision", "inputId", "kind", "logicalSequence", "schemaVersion"];
    const variant = input.kind === "choiceSelected" ? ["instructionId", "optionId", "requestId"]
      : input.kind === "barrierApproved" ? ["descriptorId", "requestId"]
        : input.kind === "effectCompleted" ? ["effectId", "replayKey"]
          : ["cancellationScope", "effectId"];
    return exactRecordKeys(input, [...common, ...variant].sort());
  } catch {
    return false;
  }
}

function instructionAt(program: RuntimeProgramV1, state: RuntimeStateV1): RuntimeInstructionV1 | undefined {
  return scenesById(program).get(state.cursor.sceneId)?.instructions[state.cursor.instructionIndex];
}

type AppliedInput = { readonly kind: "continue"; readonly state: RuntimeStateV1 } | { readonly kind: "return"; readonly result: RuntimeRunResultV1 };

function applyInput(program: RuntimeProgramV1, state: RuntimeStateV1, input: RuntimeInputV1): AppliedInput {
  if (!validInput(input)) return { kind: "return", result: failure(state, "RUNTIME_INPUT_MISMATCH", "External input schema is invalid") };
  const prior = state.inputReceipts.find((receipt) => receipt.input.inputId === input.inputId);
  if (prior !== undefined) return canonicalRuntimeStringify(prior.input) === canonicalRuntimeStringify(input)
    ? { kind: "return", result: success(state, null, 0) }
    : { kind: "return", result: failure(state, "RUNTIME_INPUT_ID_CONFLICT", "Input ID was already accepted with a different payload") };
  if (state.inputReceipts.length >= MAX_INPUT_RECEIPTS) return { kind: "return", result: failure(state, "RUNTIME_INPUT_RECEIPT_LIMIT", "Input receipt ledger reached its limit") };
  if (input.kind === "effectCompleted" && state.pendingEffect === null && state.inputReceipts.some((receipt) => receipt.input.kind === "effectCancelled" && receipt.input.effectId === input.effectId)) return { kind: "return", result: failure(state, "RUNTIME_EFFECT_CANCELLED", "Effect scope was already cancelled") };
  if (input.executionId !== state.executionId || input.expectedStateRevision !== state.stateRevision) return { kind: "return", result: failure(state, "RUNTIME_INPUT_STALE", "Input execution or revision does not match current State") };
  const acceptedAtRevision = state.stateRevision + 1;
  const inputReceipts = [...state.inputReceipts, { input, acceptedAtRevision }];

  if (input.kind === "choiceSelected") {
    const pending = state.pendingChoice;
    if (pending === null) return { kind: "return", result: failure(state, "RUNTIME_INPUT_UNEXPECTED", "No Choice request is pending") };
    if (input.logicalSequence !== pending.logicalSequence) return { kind: "return", result: failure(state, "RUNTIME_INPUT_OUT_OF_ORDER", "Choice sequence does not match") };
    if (input.requestId !== pending.requestId || input.instructionId !== pending.instructionId || input.expectedStateRevision !== pending.expectedStateRevision) return { kind: "return", result: failure(state, "RUNTIME_INPUT_MISMATCH", "Choice token does not match pending request") };
    const option = pending.options.find((item) => item.optionId === input.optionId);
    if (option === undefined) return { kind: "return", result: failure(state, "RUNTIME_CHOICE_MISMATCH", `Unknown choice option: ${input.optionId}`) };
    if (!scenesById(program).has(option.targetSceneId)) return { kind: "return", result: failure(state, "RUNTIME_MISSING_SCENE", `Choice target scene does not exist: ${option.targetSceneId}`) };
    return { kind: "continue", state: { ...state, stateRevision: acceptedAtRevision, cursor: { sceneId: option.targetSceneId, instructionIndex: 0 }, pendingChoice: null, inputReceipts } };
  }

  if (input.kind === "barrierApproved") {
    const pending = state.pendingBarrier;
    const instruction = instructionAt(program, state);
    if (pending === null || instruction?.opcode !== "direction") return { kind: "return", result: failure(state, "RUNTIME_INPUT_UNEXPECTED", "No Barrier approval request is pending") };
    if (input.logicalSequence !== pending.logicalSequence) return { kind: "return", result: failure(state, "RUNTIME_INPUT_OUT_OF_ORDER", "Barrier sequence does not match") };
    if (input.requestId !== pending.requestId || input.descriptorId !== pending.descriptorId || input.expectedStateRevision !== pending.expectedStateRevision) return { kind: "return", result: failure(state, "RUNTIME_INPUT_MISMATCH", "Barrier approval token does not match") };
    const command = stringOperand(instruction, "command"), parameters = instruction.operands.parameters;
    if (command === undefined || !validRecord(parameters)) return { kind: "return", result: failure(state, "RUNTIME_INVALID_IR", "Barrier direction is malformed", instruction) };
    const effect = directionEffect(state, instruction, command, parameters, acceptedAtRevision), extra = directionState(state, command, parameters);
    if (effect === undefined || effect.policy !== "barrier" || extra === undefined) return { kind: "return", result: failure(state, "RUNTIME_INVALID_IR", "Barrier Effect metadata is malformed", instruction) };
    const nextState: RuntimeStateV1 = { ...state, ...extra, stateRevision: acceptedAtRevision, cursor: nextCursor(state.cursor), pendingBarrier: null, nextEffectSequence: state.nextEffectSequence + 1, inputReceipts, barrierLedger: [...state.barrierLedger, { effectId: effect.effectId, descriptorId: effect.descriptorId, reason: pending.reason, committedAtRevision: acceptedAtRevision }] };
    return { kind: "return", result: success(nextState, { kind: "direction", instructionId: instruction.instructionId, command, parameters }, 0, [effect]) };
  }

  const pendingEffect = state.pendingEffect;
  if (pendingEffect === null) {
    return { kind: "return", result: failure(state, "RUNTIME_INPUT_UNEXPECTED", "No awaited Effect is pending") };
  }
  if (input.logicalSequence !== pendingEffect.logicalSequence) return { kind: "return", result: failure(state, "RUNTIME_INPUT_OUT_OF_ORDER", "Effect sequence does not match") };
  const tokenMatches = input.effectId === pendingEffect.effectId && (input.kind === "effectCompleted" ? input.replayKey === pendingEffect.replayKey : input.cancellationScope === pendingEffect.cancellationScope);
  if (!tokenMatches) return { kind: "return", result: failure(state, "RUNTIME_INPUT_MISMATCH", "Effect completion or cancellation token does not match") };
  const instruction = instructionAt(program, state), command = instruction === undefined ? undefined : stringOperand(instruction, "command"), parameters = instruction?.operands.parameters;
  if (instruction?.opcode !== "direction" || command === undefined || !validRecord(parameters)) return { kind: "return", result: failure(state, "RUNTIME_INVALID_IR", "Pending Effect direction is malformed", instruction) };
  const extra = input.kind === "effectCompleted" ? directionState(state, command, parameters) : {};
  if (extra === undefined) return { kind: "return", result: failure(state, "RUNTIME_INVALID_IR", "Pending Effect logical State is malformed", instruction) };
  return { kind: "continue", state: { ...state, ...extra, stateRevision: acceptedAtRevision, cursor: nextCursor(state.cursor), pendingEffect: null, inputReceipts } };
}

export function runRuntime(program: RuntimeProgramV1, initialState: RuntimeStateV1, options: RuntimeRunOptionsV1 = {}): RuntimeRunResultV1 {
  const programDiagnostics = validateRuntimeProgramV1(program);
  if (programDiagnostics.length > 0) return { state: initialState, event: null, executedInstructions: 0, diagnostics: programDiagnostics, effects: [], barrierRequest: null };
  let stateDiagnostics: readonly RuntimeDiagnosticV1[];
  try { stateDiagnostics = validateRuntimeStateV1(program, initialState); }
  catch { stateDiagnostics = [diagnostic("RUNTIME_INVALID_STATE", "Runtime State structure is missing or malformed")]; }
  if (stateDiagnostics.length > 0) return { state: initialState, event: null, executedInstructions: 0, diagnostics: stateDiagnostics, effects: [], barrierRequest: null };
  let state = initialState;
  if (options.input !== undefined) { const applied = applyInput(program, state, options.input); if (applied.kind === "return") return applied.result; state = applied.state; }
  if (state.terminal.kind === "ended") return failure(state, "RUNTIME_TERMINAL", "Runtime has already ended");
  if (state.pendingChoice !== null) { const pending = state.pendingChoice; return success(state, { kind: "choice", instructionId: pending.instructionId, prompt: pending.prompt, options: pending.options }, 0); }
  if (state.pendingBarrier !== null) return success(state, null, 0, [], state.pendingBarrier);
  if (state.pendingEffect !== null) return failure(state, "RUNTIME_EFFECT_REQUIRED", "Awaited Effect must complete or cancel before execution can continue");

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
      return event === null ? undefined : success(state, event, executed + 1);
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
      const effect = directionEffect(state, instruction, command, directionParameters, state.stateRevision + 1);
      if (extra === undefined || effect === undefined) return failure(state, "RUNTIME_INVALID_IR", "Direction command, action, Effect, or logical parameters are malformed", instruction, executed);
      if (state.nextEffectSequence === Number.MAX_SAFE_INTEGER) return failure(state, "RUNTIME_INVALID_STATE", "Effect logical sequence overflow", instruction, executed);
      if (effect.policy === "barrier") {
        if (state.nextInputSequence === Number.MAX_SAFE_INTEGER) return failure(state, "RUNTIME_INVALID_STATE", "Input logical sequence overflow", instruction, executed);
        const expectedStateRevision = state.stateRevision + 1;
        const pendingBarrier = { requestId: runtimeBarrierRequestIdV1(state.executionId, effect.descriptorId, state.nextInputSequence, expectedStateRevision), executionId: state.executionId, expectedStateRevision, logicalSequence: state.nextInputSequence, instructionId: instruction.instructionId, descriptorId: effect.descriptorId, reason: String(directionParameters.barrierReason) };
        state = { ...state, stateRevision: expectedStateRevision, pendingBarrier, nextInputSequence: state.nextInputSequence + 1 };
        return success(state, null, executed + 1, [], pendingBarrier);
      }
      if (effect.awaitMode === "awaited") {
        state = { ...state, stateRevision: state.stateRevision + 1, pendingEffect: effect, nextEffectSequence: state.nextEffectSequence + 1 };
        return success(state, { kind: "direction", instructionId: instruction.instructionId, command, parameters: directionParameters }, executed + 1, [effect]);
      }
      state = { ...state, ...extra, stateRevision: state.stateRevision + 1, cursor: nextCursor(state.cursor), nextEffectSequence: state.nextEffectSequence + 1 };
      return success(state, { kind: "direction", instructionId: instruction.instructionId, command, parameters: directionParameters }, executed + 1, [effect]);
    }
    if (instruction.opcode === "choice") {
      const prompt = stringOperand(instruction, "prompt"), choices = choiceOptions(instruction);
      if (prompt === undefined || choices === undefined) return failure(state, "RUNTIME_INVALID_IR", "Choice operands are malformed", instruction, executed);
      const expectedStateRevision = state.stateRevision + 1;
      const pendingChoice = { requestId: runtimeChoiceRequestIdV1(state.executionId, instruction.instructionId, state.nextInputSequence, expectedStateRevision), expectedStateRevision, logicalSequence: state.nextInputSequence, instructionId: instruction.instructionId, sceneId: state.cursor.sceneId, instructionIndex: state.cursor.instructionIndex, prompt, options: choices };
      state = { ...state, stateRevision: expectedStateRevision, pendingChoice, nextInputSequence: state.nextInputSequence + 1 };
      return success(state, { kind: "choice", instructionId: instruction.instructionId, prompt, options: choices }, executed + 1);
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
      const evaluated = evaluateRuntimeExpressionV1(ast, state.variables);
      if (!evaluated.ok) return failure(state, evaluated.code, evaluated.message, instruction, executed);
      const value = evaluated.value;
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
    if (instruction.opcode === "checkpoint") {
      const stepId = stringOperand(instruction, "stepId");
      if (stepId === undefined || !canonicalId.test(stepId) || stepId !== instruction.instructionId) return failure(state, "RUNTIME_INVALID_IR", "Checkpoint step identity is malformed", instruction, executed);
      return advance({ kind: "checkpoint-reached", instructionId: instruction.instructionId, stepId })!;
    }
    if (instruction.opcode === "end") {
      const endingId = stringOperand(instruction, "endingId"), name = stringOperand(instruction, "name");
      if (endingId === undefined || name === undefined) return failure(state, "RUNTIME_INVALID_IR", "Ending operands are malformed", instruction, executed);
      if (!canonicalId.test(endingId)) return failure(state, "RUNTIME_INVALID_IR", "Ending ID is invalid", instruction, executed);
      state = { ...state, stateRevision: state.stateRevision + 1, terminal: { kind: "ended", endingId, name }, metaProgress: { ...state.metaProgress, reachedEndingIds: addMonotonicId(state.metaProgress.reachedEndingIds, endingId) } };
      return success(state, { kind: "ending", instructionId: instruction.instructionId, endingId, name }, executed + 1);
    }
  }
  return failure(state, "RUNTIME_BUDGET_EXCEEDED", `No observable stop was reached within ${budget} instructions`, undefined, budget);
}

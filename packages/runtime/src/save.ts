import { canonicalRuntimeStringify, utf8Encode } from "./canonical";
import { runtimeSaveArtifactHashV1, runtimeStateHashV1 } from "./hash";
import { validateRuntimeProgramV1, validateRuntimeStateV1 } from "./runtime";
import { mergeRuntimeMetaProgressV1 } from "./meta-progress";
import {
  MAX_RUNTIME_SAVE_BYTES,
  RUNTIME_SAVE_SCHEMA_VERSION,
  RUNTIME_VERSION,
  type CreateRuntimeSaveResultV1,
  type LoadRuntimeSaveOptionsV1,
  type LoadRuntimeSaveResultV1,
  type RuntimeDiagnosticCode,
  type RuntimeDiagnosticV1,
  type RuntimeProgramV1,
  type RuntimeRehydrationV1,
  type RuntimeSaveV1,
  type RuntimeStateV1
} from "./types";

const stateHashPattern = /^[0-9a-f]{64}$/u;
const saveKeys = ["buildId", "format", "irVersion", "projectId", "runtimeVersion", "schemaVersion", "state", "stateHash", "stateRevision"] as const;

function diagnostic(code: RuntimeDiagnosticCode, message: string): RuntimeDiagnosticV1 {
  return { code, message, sceneId: null, instructionIndex: null, instructionId: null };
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactSaveKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === saveKeys.length && keys.every((key, index) => key === saveKeys[index]);
}

function rehydration(state: RuntimeStateV1): RuntimeRehydrationV1 {
  if (state.pendingChoice !== null) return { kind: "choice", request: state.pendingChoice };
  if (state.pendingEffect !== null) return { kind: "effect", intent: state.pendingEffect };
  if (state.pendingBarrier !== null) return { kind: "barrier", request: state.pendingBarrier };
  if (state.terminal.kind === "ended") return { kind: "terminal", terminal: state.terminal };
  return { kind: "ready" };
}

export function createRuntimeSaveV1(program: RuntimeProgramV1, state: RuntimeStateV1): CreateRuntimeSaveResultV1 {
  const programDiagnostics = validateRuntimeProgramV1(program);
  if (programDiagnostics.length > 0) return { ok: false, diagnostics: programDiagnostics };
  try {
    const stateDiagnostics = validateRuntimeStateV1(program, state);
    if (stateDiagnostics.length > 0) return { ok: false, diagnostics: stateDiagnostics };
    const save: RuntimeSaveV1 = {
      schemaVersion: RUNTIME_SAVE_SCHEMA_VERSION,
      format: "world.runtime-save",
      runtimeVersion: RUNTIME_VERSION,
      irVersion: state.irVersion,
      projectId: state.projectId,
      buildId: state.buildId,
      stateRevision: state.stateRevision,
      stateHash: runtimeStateHashV1(state),
      state
    };
    const serialized = canonicalRuntimeStringify(save);
    if (utf8Encode(serialized).length > MAX_RUNTIME_SAVE_BYTES) return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Save exceeds the supported byte limit")] };
    return { ok: true, save, serialized, artifactHash: runtimeSaveArtifactHashV1(save) };
  } catch {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime State cannot be encoded as a canonical Save")] };
  }
}

export function loadRuntimeSaveV1(program: RuntimeProgramV1, serialized: string, options: LoadRuntimeSaveOptionsV1): LoadRuntimeSaveResultV1 {
  const programDiagnostics = validateRuntimeProgramV1(program);
  if (programDiagnostics.length > 0) return { ok: false, diagnostics: programDiagnostics };
  if (typeof serialized !== "string" || serialized.length > MAX_RUNTIME_SAVE_BYTES || options === null || typeof options !== "object" || typeof options.expectedBuildId !== "string" || options.expectedBuildId.length === 0) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Save input or expected Build ID is invalid")] };
  }
  let parsed: unknown;
  try {
    if (utf8Encode(serialized).length > MAX_RUNTIME_SAVE_BYTES) throw new TypeError("save-size");
    parsed = JSON.parse(serialized) as unknown;
    if (canonicalRuntimeStringify(parsed) !== serialized) throw new TypeError("save-canonical");
  } catch {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Save is not canonical JSON within the supported byte limit")] };
  }
  if (!plainRecord(parsed) || !exactSaveKeys(parsed) || parsed.format !== "world.runtime-save") {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Save envelope is malformed")] };
  }
  if (parsed.schemaVersion !== RUNTIME_SAVE_SCHEMA_VERSION || parsed.runtimeVersion !== RUNTIME_VERSION || parsed.irVersion !== program.irVersion || parsed.projectId !== program.projectId) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INCOMPATIBLE", "Runtime Save schema, Runtime, IR, or Project identity is incompatible")] };
  }
  if (parsed.buildId !== options.expectedBuildId) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_BUILD_MISMATCH", "Runtime Save Build ID does not match the loaded artifact")] };
  }
  if (!Number.isSafeInteger(parsed.stateRevision) || typeof parsed.stateHash !== "string" || !stateHashPattern.test(parsed.stateHash) || !plainRecord(parsed.state)) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Save revision, State Hash, or State payload is malformed")] };
  }
  const state = parsed.state as unknown as RuntimeStateV1;
  try {
    const stateDiagnostics = validateRuntimeStateV1(program, state);
    if (stateDiagnostics.length > 0) return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Save contains an invalid Runtime State"), ...stateDiagnostics] };
    if (state.buildId !== parsed.buildId || state.stateRevision !== parsed.stateRevision) return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Save envelope does not match its State identity")] };
    if (runtimeStateHashV1(state) !== parsed.stateHash) return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_HASH_MISMATCH", "Runtime Save State Hash verification failed")] };
    let loadedState = state;
    if (options.currentMetaProgress !== undefined) {
      const merged = mergeRuntimeMetaProgressV1(options.currentMetaProgress, state.metaProgress);
      if (!merged.ok) return { ok: false, diagnostics: merged.diagnostics };
      loadedState = state.metaProgress === merged.progress ? state : { ...state, metaProgress: merged.progress };
    }
    const save = parsed as unknown as RuntimeSaveV1;
    return { ok: true, save, state: loadedState, rehydration: rehydration(loadedState), artifactHash: runtimeSaveArtifactHashV1(save) };
  } catch {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Save contains a structurally invalid Runtime State")] };
  }
}

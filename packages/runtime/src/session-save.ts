import { canonicalRuntimeStringify, utf8Encode } from "./canonical";
import { runtimeHistorySessionHashV1, runtimeSessionSaveArtifactHashV1 } from "./hash";
import { mergeRuntimeHistoryMetaProgressV1, validateRuntimeHistorySessionV1 } from "./history";
import { validateRuntimeProgramV1 } from "./runtime";
import {
  MAX_RUNTIME_SESSION_SAVE_BYTES,
  RUNTIME_SESSION_SAVE_SCHEMA_VERSION,
  RUNTIME_VERSION,
  type CreateRuntimeSessionSaveResultV1,
  type LoadRuntimeSessionSaveOptionsV1,
  type LoadRuntimeSessionSaveResultV1,
  type RuntimeDiagnosticCode,
  type RuntimeDiagnosticV1,
  type RuntimeHistorySessionV1,
  type RuntimeProgramV1,
  type RuntimeRehydrationV1,
  type RuntimeSessionSaveV1,
  type RuntimeStateV1
} from "./types";

const hashPattern = /^[0-9a-f]{64}$/u;
const sessionSaveKeys = ["buildId", "cursor", "executionId", "format", "history", "historyHash", "irVersion", "projectId", "runtimeVersion", "schemaVersion"] as const;

function diagnostic(code: RuntimeDiagnosticCode, message: string): RuntimeDiagnosticV1 {
  return { code, message, sceneId: null, instructionIndex: null, instructionId: null };
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactSessionSaveKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === sessionSaveKeys.length && keys.every((key, index) => key === sessionSaveKeys[index]);
}

function rehydration(state: RuntimeStateV1): RuntimeRehydrationV1 {
  if (state.pendingChoice !== null) return { kind: "choice", request: state.pendingChoice };
  if (state.pendingEffect !== null) return { kind: "effect", intent: state.pendingEffect };
  if (state.pendingBarrier !== null) return { kind: "barrier", request: state.pendingBarrier };
  if (state.terminal.kind === "ended") return { kind: "terminal", terminal: state.terminal };
  return { kind: "ready" };
}

export function createRuntimeSessionSaveV1(program: RuntimeProgramV1, history: RuntimeHistorySessionV1): CreateRuntimeSessionSaveResultV1 {
  const programDiagnostics = validateRuntimeProgramV1(program);
  if (programDiagnostics.length > 0) return { ok: false, diagnostics: programDiagnostics };
  try {
    const historyDiagnostics = validateRuntimeHistorySessionV1(program, history);
    if (historyDiagnostics.length > 0) return { ok: false, diagnostics: historyDiagnostics };
    const save: RuntimeSessionSaveV1 = {
      schemaVersion: RUNTIME_SESSION_SAVE_SCHEMA_VERSION,
      format: "world.runtime-session-save",
      runtimeVersion: RUNTIME_VERSION,
      irVersion: history.irVersion,
      projectId: history.projectId,
      buildId: history.buildId,
      executionId: history.executionId,
      cursor: history.cursor,
      historyHash: runtimeHistorySessionHashV1(history),
      history
    };
    const serialized = canonicalRuntimeStringify(save);
    if (utf8Encode(serialized).length > MAX_RUNTIME_SESSION_SAVE_BYTES) {
      return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save exceeds the supported byte limit")] };
    }
    return { ok: true, save, serialized, artifactHash: runtimeSessionSaveArtifactHashV1(save) };
  } catch {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime History Session cannot be encoded as a canonical Session Save")] };
  }
}

export function loadRuntimeSessionSaveV1(program: RuntimeProgramV1, serialized: string, options: LoadRuntimeSessionSaveOptionsV1): LoadRuntimeSessionSaveResultV1 {
  const programDiagnostics = validateRuntimeProgramV1(program);
  if (programDiagnostics.length > 0) return { ok: false, diagnostics: programDiagnostics };
  if (typeof serialized !== "string" || serialized.length > MAX_RUNTIME_SESSION_SAVE_BYTES || options === null || typeof options !== "object" || typeof options.expectedBuildId !== "string" || options.expectedBuildId.length === 0) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save input or expected Build ID is invalid")] };
  }
  let parsed: unknown;
  try {
    if (utf8Encode(serialized).length > MAX_RUNTIME_SESSION_SAVE_BYTES) throw new TypeError("session-save-size");
    parsed = JSON.parse(serialized) as unknown;
    if (canonicalRuntimeStringify(parsed) !== serialized) throw new TypeError("session-save-canonical");
  } catch {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save is not canonical JSON within the supported byte limit")] };
  }
  if (!plainRecord(parsed) || !exactSessionSaveKeys(parsed) || parsed.format !== "world.runtime-session-save") {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save envelope is malformed")] };
  }
  if (parsed.schemaVersion !== RUNTIME_SESSION_SAVE_SCHEMA_VERSION || parsed.runtimeVersion !== RUNTIME_VERSION || parsed.irVersion !== program.irVersion || parsed.projectId !== program.projectId) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INCOMPATIBLE", "Runtime Session Save schema, Runtime, IR, or Project identity is incompatible")] };
  }
  if (parsed.buildId !== options.expectedBuildId) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_BUILD_MISMATCH", "Runtime Session Save Build ID does not match the loaded artifact")] };
  }
  if (typeof parsed.executionId !== "string" || parsed.executionId.length === 0 || !Number.isSafeInteger(parsed.cursor) || typeof parsed.historyHash !== "string" || !hashPattern.test(parsed.historyHash) || !plainRecord(parsed.history)) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save cursor, execution identity, History Hash, or History payload is malformed")] };
  }
  const history = parsed.history as unknown as RuntimeHistorySessionV1;
  try {
    const historyDiagnostics = validateRuntimeHistorySessionV1(program, history);
    if (historyDiagnostics.length > 0) return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save contains an invalid Runtime History Session"), ...historyDiagnostics] };
    if (history.buildId !== parsed.buildId || history.executionId !== parsed.executionId || history.cursor !== parsed.cursor || history.projectId !== parsed.projectId || history.irVersion !== parsed.irVersion || history.runtimeVersion !== parsed.runtimeVersion) {
      return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save envelope does not match its History identity")] };
    }
    if (runtimeHistorySessionHashV1(history) !== parsed.historyHash) {
      return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_HASH_MISMATCH", "Runtime Session Save History Hash verification failed")] };
    }
    let loadedHistory = history;
    if (options.currentMetaProgress !== undefined) {
      const merged = mergeRuntimeHistoryMetaProgressV1(program, history, options.currentMetaProgress);
      if (merged.diagnostics.length > 0) return { ok: false, diagnostics: merged.diagnostics };
      loadedHistory = merged.session;
    }
    const state = loadedHistory.checkpoints[loadedHistory.cursor]?.state;
    if (state === undefined) return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save cursor has no matching checkpoint")] };
    const save = parsed as unknown as RuntimeSessionSaveV1;
    return { ok: true, save, session: loadedHistory, state, rehydration: rehydration(state), artifactHash: runtimeSessionSaveArtifactHashV1(save) };
  } catch {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_SAVE_INVALID", "Runtime Session Save contains a structurally invalid Runtime History Session")] };
  }
}

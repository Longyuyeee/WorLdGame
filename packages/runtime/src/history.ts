import { canonicalRuntimeBytes, canonicalRuntimeStringify, utf8Encode } from "./canonical";
import { runtimeStateHashV1 } from "./hash";
import { runRuntime, validateRuntimeStateV1 } from "./runtime";
import { sha256Hex } from "./sha256";
import {
  MAX_RUNTIME_HISTORY_ENTRIES,
  RUNTIME_VERSION,
  type RuntimeBarrierRecordV1,
  type RuntimeDiagnosticCode,
  type RuntimeDiagnosticV1,
  type RuntimeHistoryCheckpointV1,
  type RuntimeHistoryEntryV1,
  type RuntimeHistoryResultV1,
  type RuntimeHistorySessionV1,
  type RuntimeInputV1,
  type RuntimeInputReceiptV1,
  type RuntimeProgramV1,
  type RuntimeRunOptionsV1,
  type RuntimeRunResultV1,
  type RuntimeStateV1
} from "./types";

const ENTRY_DOMAIN = utf8Encode("WORLd-RUNTIME-HISTORY-ENTRY\0v1\0");
const sessionKeys = ["buildId", "checkpoints", "cursor", "entries", "executionId", "inputTombstones", "irVersion", "projectId", "runtimeVersion", "schemaVersion"];
const checkpointKeys = ["checkpointId", "state", "stateHash"];
const entryKeys = ["afterCheckpointId", "barriers", "beforeCheckpointId", "effects", "entryId", "event", "executedInstructions", "historyIndex", "input"];

function diagnostic(code: RuntimeDiagnosticCode, message: string, state?: RuntimeStateV1): RuntimeDiagnosticV1 {
  return { code, message, sceneId: state?.cursor.sceneId ?? null, instructionIndex: state?.cursor.instructionIndex ?? null, instructionId: null };
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function checkpoint(state: RuntimeStateV1): RuntimeHistoryCheckpointV1 {
  const stateHash = runtimeStateHashV1(state);
  return { checkpointId: `history.${stateHash}`, stateHash, state };
}

function entryId(entry: Omit<RuntimeHistoryEntryV1, "entryId">): string {
  const payload = canonicalRuntimeBytes(entry);
  const input = new Uint8Array(ENTRY_DOMAIN.length + payload.length);
  input.set(ENTRY_DOMAIN); input.set(payload, ENTRY_DOMAIN.length);
  return `entry.${sha256Hex(input)}`;
}

function makeEntry(entry: Omit<RuntimeHistoryEntryV1, "entryId">): RuntimeHistoryEntryV1 {
  return { entryId: entryId(entry), ...entry };
}

function result(session: RuntimeHistorySessionV1, diagnostics: readonly RuntimeDiagnosticV1[] = [], reconciliationRequired = false, barrierBlock: RuntimeBarrierRecordV1 | null = null): RuntimeHistoryResultV1 {
  return { session, state: session.checkpoints[session.cursor]!.state, event: null, effects: [], diagnostics, reconciliationRequired, barrierBlock };
}

function sameInput(left: RuntimeInputV1, right: RuntimeInputV1): boolean {
  return canonicalRuntimeStringify(left) === canonicalRuntimeStringify(right);
}

function inputConflict(session: RuntimeHistorySessionV1, input: RuntimeInputV1): RuntimeDiagnosticV1 | null {
  const known = [...session.inputTombstones, ...session.entries.flatMap((entry) => entry.input === null ? [] : [entry.input])].find((candidate) => candidate.inputId === input.inputId);
  return known !== undefined && !sameInput(known, input)
    ? diagnostic("RUNTIME_INPUT_ID_CONFLICT", `Input ID ${input.inputId} was already bound to a different canonical payload`, session.checkpoints[session.cursor]?.state)
    : null;
}

function knownExactInput(session: RuntimeHistorySessionV1, input: RuntimeInputV1): boolean {
  return [...session.inputTombstones, ...session.entries.flatMap((entry) => entry.input === null ? [] : [entry.input])].some((candidate) => candidate.inputId === input.inputId && sameInput(candidate, input));
}

export function createRuntimeHistorySessionV1(program: RuntimeProgramV1, state: RuntimeStateV1): RuntimeHistoryResultV1 {
  const diagnostics = validateRuntimeStateV1(program, state);
  const initial = checkpoint(state);
  const session: RuntimeHistorySessionV1 = { schemaVersion: 1, runtimeVersion: RUNTIME_VERSION, irVersion: "1.0.0", projectId: state.projectId, buildId: state.buildId, executionId: state.executionId, cursor: 0, checkpoints: [initial], entries: [], inputTombstones: [] };
  return result(session, diagnostics.length === 0 ? [] : [diagnostic("RUNTIME_HISTORY_INVALID", diagnostics[0]!.message, state)]);
}

function validateRuntimeHistorySessionUnsafe(program: RuntimeProgramV1, session: RuntimeHistorySessionV1): readonly RuntimeDiagnosticV1[] {
  const invalid = (message: string): readonly RuntimeDiagnosticV1[] => [diagnostic("RUNTIME_HISTORY_INVALID", message, session.checkpoints?.[session.cursor]?.state)];
  if (!record(session) || !exactKeys(session, sessionKeys)) return invalid("History Session schema members are missing or unknown");
  if (session.schemaVersion !== 1 || session.runtimeVersion !== RUNTIME_VERSION || session.irVersion !== program.irVersion || session.projectId !== program.projectId) return invalid("History Session identity or version does not match the program");
  if (!Array.isArray(session.checkpoints) || !Array.isArray(session.entries) || !Array.isArray(session.inputTombstones) || session.entries.length > MAX_RUNTIME_HISTORY_ENTRIES || session.checkpoints.length !== session.entries.length + 1 || !Number.isSafeInteger(session.cursor) || session.cursor < 0 || session.cursor >= session.checkpoints.length) return invalid("History Session chain length or cursor is invalid");
  const inputIds = new Map<string, string>();
  for (let index = 0; index < session.checkpoints.length; index += 1) {
    const item = session.checkpoints[index]!;
    if (!record(item) || !exactKeys(item as unknown as Readonly<Record<string, unknown>>, checkpointKeys)) return invalid(`Checkpoint ${index} schema is invalid`);
    const typedItem = item as unknown as RuntimeHistoryCheckpointV1;
    const stateDiagnostics = validateRuntimeStateV1(program, typedItem.state);
    const hash = runtimeStateHashV1(typedItem.state);
    if (stateDiagnostics.length > 0 || typedItem.state.projectId !== session.projectId || typedItem.state.buildId !== session.buildId || typedItem.state.executionId !== session.executionId || typedItem.stateHash !== hash || typedItem.checkpointId !== `history.${hash}`) return invalid(`Checkpoint ${index} State or hash is invalid`);
  }
  for (let index = 0; index < session.entries.length; index += 1) {
    const item = session.entries[index]!;
    const before = session.checkpoints[index]!, after = session.checkpoints[index + 1]!;
    if (!record(item) || !exactKeys(item as unknown as Readonly<Record<string, unknown>>, entryKeys)) return invalid(`History entry ${index} schema is invalid`);
    const typedItem = item as unknown as RuntimeHistoryEntryV1;
    if (typedItem.historyIndex !== index || typedItem.beforeCheckpointId !== before.checkpointId || typedItem.afterCheckpointId !== after.checkpointId || !Number.isSafeInteger(typedItem.executedInstructions) || typedItem.executedInstructions < 0) return invalid(`History entry ${index} chain is invalid`);
    const { entryId: actualId, ...unsigned } = typedItem;
    if (actualId !== entryId(unsigned)) return invalid(`History entry ${index} hash is invalid`);
    const expectedBarriers = after.state.barrierLedger.slice(before.state.barrierLedger.length);
    if (canonicalRuntimeStringify(typedItem.barriers) !== canonicalRuntimeStringify(expectedBarriers)) return invalid(`History entry ${index} Barrier delta is invalid`);
    if (typedItem.input !== null) {
      const payload = canonicalRuntimeStringify(typedItem.input), previous = inputIds.get(typedItem.input.inputId);
      if (previous !== undefined && previous !== payload) return invalid(`Input ID ${typedItem.input.inputId} has conflicting payloads`);
      inputIds.set(typedItem.input.inputId, payload);
      if (!after.state.inputReceipts.some((receipt: RuntimeInputReceiptV1) => sameInput(receipt.input, typedItem.input!))) return invalid(`History entry ${index} input was not accepted by its checkpoint`);
    }
  }
  for (const input of session.inputTombstones) {
    if (!record(input) || typeof input.inputId !== "string") return invalid("History input tombstone is invalid");
    const payload = canonicalRuntimeStringify(input), previous = inputIds.get(input.inputId);
    if (previous !== undefined && previous !== payload) return invalid(`Input tombstone ${input.inputId} conflicts with an accepted input`);
    inputIds.set(input.inputId, payload);
  }
  try { canonicalRuntimeStringify(session); } catch { return invalid("History Session is not canonically serializable"); }
  return [];
}

export function validateRuntimeHistorySessionV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1): readonly RuntimeDiagnosticV1[] {
  try { return validateRuntimeHistorySessionUnsafe(program, session); }
  catch { return [diagnostic("RUNTIME_HISTORY_INVALID", "History Session contains malformed or noncanonical data")]; }
}

export function advanceRuntimeHistoryV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1, options: RuntimeRunOptionsV1 = {}): RuntimeHistoryResultV1 {
  const validation = validateRuntimeHistorySessionV1(program, session);
  if (validation.length > 0) return result(session, validation);
  const state = session.checkpoints[session.cursor]!.state;
  if (options.input !== undefined) {
    let conflict: RuntimeDiagnosticV1 | null;
    try { conflict = inputConflict(session, options.input); }
    catch { return result(session, [diagnostic("RUNTIME_HISTORY_INVALID", "History input is malformed or noncanonical", state)]); }
    if (conflict !== null) return result(session, [conflict]);
  }
  if (session.cursor < session.entries.length) {
    const expected = session.entries[session.cursor]!.input;
    if (options.input === undefined || (expected !== null && sameInput(expected, options.input))) return result(session, [diagnostic("RUNTIME_HISTORY_FORWARD_REQUIRED", "Recorded future exists; use Forward or provide a changed input to create a branch", state)]);
  }
  if (options.input !== undefined && knownExactInput(session, options.input)) return result(session);
  const executed = runRuntime(program, state, options);
  if (executed.diagnostics.length > 0) return { ...result(session, executed.diagnostics), event: executed.event, effects: executed.effects };
  if (session.cursor >= MAX_RUNTIME_HISTORY_ENTRIES) return result(session, [diagnostic("RUNTIME_HISTORY_LIMIT", `History is limited to ${MAX_RUNTIME_HISTORY_ENTRIES} entries`, state)]);
  const after = checkpoint(executed.state);
  const keptEntries = session.entries.slice(0, session.cursor);
  const truncated = session.entries.slice(session.cursor).flatMap((item) => item.input === null ? [] : [item.input]);
  const tombstones = [...session.inputTombstones];
  for (const input of truncated) if (!tombstones.some((item) => item.inputId === input.inputId)) tombstones.push(input);
  const unsigned: Omit<RuntimeHistoryEntryV1, "entryId"> = { historyIndex: session.cursor, beforeCheckpointId: session.checkpoints[session.cursor]!.checkpointId, afterCheckpointId: after.checkpointId, input: options.input ?? null, event: executed.event, effects: executed.effects, executedInstructions: executed.executedInstructions, barriers: executed.state.barrierLedger.slice(state.barrierLedger.length) };
  const next: RuntimeHistorySessionV1 = { ...session, cursor: session.cursor + 1, checkpoints: [...session.checkpoints.slice(0, session.cursor + 1), after], entries: [...keptEntries, makeEntry(unsigned)], inputTombstones: tombstones };
  return { session: next, state: executed.state, event: executed.event, effects: executed.effects, diagnostics: [], reconciliationRequired: false, barrierBlock: null };
}

/** Commits one already-executed observable Runtime step. Scheduler is its only production caller. */
export function commitRuntimeHistoryStepV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1, executed: RuntimeRunResultV1, executedInstructions = executed.executedInstructions): RuntimeHistoryResultV1 {
  const validation = validateRuntimeHistorySessionV1(program, session);
  if (validation.length > 0) return result(session, validation);
  const before = session.checkpoints[session.cursor]!.state;
  if (session.cursor !== session.entries.length) return result(session, [diagnostic("RUNTIME_HISTORY_FORWARD_REQUIRED", "Scheduler cannot commit across recorded future History", before)]);
  if (executed.diagnostics.length > 0 || executed.event === null && executed.barrierRequest === null) return result(session, [diagnostic("RUNTIME_HISTORY_INVALID", "History commit requires one successful observable Runtime step", before)]);
  const stateDiagnostics = validateRuntimeStateV1(program, executed.state);
  if (stateDiagnostics.length > 0 || executed.state.projectId !== before.projectId || executed.state.buildId !== before.buildId || executed.state.executionId !== before.executionId || !Number.isSafeInteger(executedInstructions) || executedInstructions < 1) return result(session, [diagnostic("RUNTIME_HISTORY_INVALID", "Executed History step State, identity, or instruction count is invalid", before)]);
  if (session.cursor >= MAX_RUNTIME_HISTORY_ENTRIES) return result(session, [diagnostic("RUNTIME_HISTORY_LIMIT", `History is limited to ${MAX_RUNTIME_HISTORY_ENTRIES} entries`, before)]);
  const after = checkpoint(executed.state);
  const unsigned: Omit<RuntimeHistoryEntryV1, "entryId"> = { historyIndex: session.cursor, beforeCheckpointId: session.checkpoints[session.cursor]!.checkpointId, afterCheckpointId: after.checkpointId, input: null, event: executed.event, effects: executed.effects, executedInstructions, barriers: executed.state.barrierLedger.slice(before.barrierLedger.length) };
  const next: RuntimeHistorySessionV1 = { ...session, cursor: session.cursor + 1, checkpoints: [...session.checkpoints, after], entries: [...session.entries, makeEntry(unsigned)] };
  return { session: next, state: executed.state, event: executed.event, effects: executed.effects, diagnostics: [], reconciliationRequired: false, barrierBlock: null };
}

export function backRuntimeHistoryV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1): RuntimeHistoryResultV1 {
  const validation = validateRuntimeHistorySessionV1(program, session);
  if (validation.length > 0) return result(session, validation);
  const current = session.checkpoints[session.cursor]!.state;
  if (session.cursor === 0) return result(session, [diagnostic("RUNTIME_HISTORY_AT_START", "History is already at its first checkpoint", current)]);
  if (current.pendingEffect !== null) return result(session, [diagnostic("RUNTIME_EFFECT_REQUIRED", `Pending awaited Effect ${current.pendingEffect.effectId} must complete or cancel before Back`, current)]);
  const crossed = session.entries[session.cursor - 1]!;
  const barrier = crossed.barriers.at(-1) ?? null;
  if (barrier !== null) return result(session, [diagnostic("RUNTIME_BARRIER_BLOCKED", `Back cannot cross committed Barrier ${barrier.descriptorId}: ${barrier.reason}`, current)], false, barrier);
  return result({ ...session, cursor: session.cursor - 1 }, [], true);
}

export function forwardRuntimeHistoryV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1): RuntimeHistoryResultV1 {
  const validation = validateRuntimeHistorySessionV1(program, session);
  if (validation.length > 0) return result(session, validation);
  const current = session.checkpoints[session.cursor]!.state;
  if (session.cursor === session.entries.length) return result(session, [diagnostic("RUNTIME_HISTORY_AT_END", "History is already at its latest checkpoint", current)]);
  return result({ ...session, cursor: session.cursor + 1 }, [], true);
}

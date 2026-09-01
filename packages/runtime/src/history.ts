import { canonicalRuntimeBytes, canonicalRuntimeStringify, utf8Encode } from "./canonical";
import { runtimeStateHashV1 } from "./hash";
import { mergeRuntimeMetaProgressV1 } from "./meta-progress";
import { runRuntime, validateRuntimeEffectIntentV1, validateRuntimeInputStructureV1, validateRuntimeStateStructureV1, validateRuntimeStateV1 } from "./runtime";
import { sha256Hex } from "./sha256";
import {
  MAX_RUNTIME_HISTORY_ENTRIES,
  RUNTIME_HISTORY_SESSION_SCHEMA_VERSION,
  RUNTIME_VERSION,
  type RuntimeArchivedHistoryEntryV2,
  type RuntimeBarrierRecordV1,
  type RuntimeDiagnosticCode,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeHistoryArchiveV2,
  type RuntimeHistoryCheckpointV1,
  type RuntimeHistoryEntryV1,
  type RuntimeHistoryResultV1,
  type RuntimeHistoryReconciliationPlanV1,
  type RuntimeHistorySessionV1,
  type RuntimeHistorySessionLegacyV1,
  type RuntimeInputV1,
  type RuntimeInputReceiptV1,
  type RuntimeProgramV1,
  type RuntimeRunOptionsV1,
  type RuntimeRunResultV1,
  type RuntimeStateV1
} from "./types";

const ENTRY_DOMAIN = utf8Encode("WORLd-RUNTIME-HISTORY-ENTRY\0v1\0");
const ARCHIVE_DOMAIN = utf8Encode("WORLd-RUNTIME-HISTORY-ARCHIVE\0v1\0");
const legacySessionKeys = ["buildId", "checkpoints", "cursor", "entries", "executionId", "inputTombstones", "irVersion", "projectId", "runtimeVersion", "schemaVersion"];
const sessionKeys = ["archives", ...legacySessionKeys];
const checkpointKeys = ["checkpointId", "state", "stateHash"];
const entryKeys = ["afterCheckpointId", "barriers", "beforeCheckpointId", "effects", "entryId", "event", "executedInstructions", "historyIndex", "input"];
const archiveKeys = ["archiveId", "branchPointCheckpointId", "branchPointHistoryIndex", "entries", "schemaVersion"];
const archivedEntryKeys = ["afterStateHash", "barriers", "event", "input", "originalEntryId", "originalHistoryIndex"];
const barrierKeys = ["committedAtRevision", "descriptorId", "effectId", "reason"];
const hashPattern = /^[0-9a-f]{64}$/u;
const entryIdPattern = /^entry\.[0-9a-f]{64}$/u;
const checkpointIdPattern = /^history\.[0-9a-f]{64}$/u;

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

function archiveId(archive: Omit<RuntimeHistoryArchiveV2, "archiveId">): string {
  const payload = canonicalRuntimeBytes(archive);
  const input = new Uint8Array(ARCHIVE_DOMAIN.length + payload.length);
  input.set(ARCHIVE_DOMAIN); input.set(payload, ARCHIVE_DOMAIN.length);
  return `archive.${sha256Hex(input)}`;
}

function makeArchive(session: RuntimeHistorySessionV1): RuntimeHistoryArchiveV2 | null {
  const entries = session.entries.slice(session.cursor).map((entry, offset): RuntimeArchivedHistoryEntryV2 => ({
    originalEntryId: entry.entryId,
    originalHistoryIndex: entry.historyIndex,
    input: entry.input,
    event: entry.event,
    barriers: entry.barriers,
    afterStateHash: session.checkpoints[session.cursor + offset + 1]!.stateHash
  }));
  if (entries.length === 0) return null;
  const unsigned: Omit<RuntimeHistoryArchiveV2, "archiveId"> = {
    schemaVersion: 1,
    branchPointCheckpointId: session.checkpoints[session.cursor]!.checkpointId,
    branchPointHistoryIndex: session.cursor,
    entries
  };
  return { archiveId: archiveId(unsigned), ...unsigned };
}

function validBarrier(value: unknown): value is RuntimeBarrierRecordV1 {
  return record(value) && exactKeys(value, barrierKeys) && typeof value.effectId === "string" && typeof value.descriptorId === "string" && typeof value.reason === "string" && Number.isSafeInteger(value.committedAtRevision) && Number(value.committedAtRevision) >= 0;
}

function validEvent(value: unknown): value is RuntimeEventV1 | null {
  if (value === null) return true;
  if (!record(value) || typeof value.kind !== "string") return false;
  if (value.kind === "dialogue") return exactKeys(value, ["instructionId", "kind", "speakerId", "text", "textId"]) && [value.instructionId, value.speakerId, value.textId, value.text].every((item) => typeof item === "string");
  if (value.kind === "narration") return exactKeys(value, ["instructionId", "kind", "text", "textId"]) && [value.instructionId, value.textId, value.text].every((item) => typeof item === "string");
  if (value.kind === "direction") return exactKeys(value, ["command", "instructionId", "kind", "parameters"]) && typeof value.instructionId === "string" && typeof value.command === "string" && record(value.parameters);
  if (value.kind === "choice") return exactKeys(value, ["instructionId", "kind", "options", "prompt"]) && typeof value.instructionId === "string" && typeof value.prompt === "string" && Array.isArray(value.options) && value.options.length > 0 && value.options.every((option) => record(option) && exactKeys(option, ["label", "optionId", "targetSceneId"]) && [option.label, option.optionId, option.targetSceneId].every((item) => typeof item === "string"));
  if (value.kind === "wait") return exactKeys(value, ["durationMilliseconds", "instructionId", "kind"]) && typeof value.instructionId === "string" && Number.isSafeInteger(value.durationMilliseconds) && Number(value.durationMilliseconds) >= 0;
  if (value.kind === "checkpoint-reached") return exactKeys(value, ["instructionId", "kind", "stepId"]) && typeof value.instructionId === "string" && typeof value.stepId === "string";
  return value.kind === "ending" && exactKeys(value, ["endingId", "instructionId", "kind", "name"]) && typeof value.instructionId === "string" && typeof value.endingId === "string" && typeof value.name === "string";
}

function rechainEntries(checkpoints: readonly RuntimeHistoryCheckpointV1[], entries: readonly RuntimeHistoryEntryV1[]): readonly RuntimeHistoryEntryV1[] {
  return entries.map((entry, index) => {
    const unsigned: Omit<RuntimeHistoryEntryV1, "entryId"> = {
      historyIndex: index,
      beforeCheckpointId: checkpoints[index]!.checkpointId,
      afterCheckpointId: checkpoints[index + 1]!.checkpointId,
      input: entry.input,
      event: entry.event,
      effects: entry.effects,
      executedInstructions: entry.executedInstructions,
      barriers: entry.barriers
    };
    return makeEntry(unsigned);
  });
}

function rebaseMetaProgressAtCursor(session: RuntimeHistorySessionV1, incoming: RuntimeStateV1["metaProgress"]): RuntimeHistoryResultV1 {
  const active = session.checkpoints[session.cursor]!;
  const merged = mergeRuntimeMetaProgressV1(active.state.metaProgress, incoming);
  if (!merged.ok) return result(session, merged.diagnostics);
  if (!merged.changed) return result(session);
  const nextCheckpoint = checkpoint({ ...active.state, metaProgress: merged.progress });
  const checkpoints = session.checkpoints.map((item, index) => index === session.cursor ? nextCheckpoint : item);
  const next = { ...session, checkpoints, entries: rechainEntries(checkpoints, session.entries) };
  return result(next);
}

function result(session: RuntimeHistorySessionV1, diagnostics: readonly RuntimeDiagnosticV1[] = [], reconciliationPlan: RuntimeHistoryReconciliationPlanV1 | null = null, barrierBlock: RuntimeBarrierRecordV1 | null = null): RuntimeHistoryResultV1 {
  return { session, state: session.checkpoints[session.cursor]!.state, event: null, effects: [], diagnostics, reconciliationRequired: reconciliationPlan !== null, reconciliationPlan, barrierBlock };
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
  const session: RuntimeHistorySessionV1 = { schemaVersion: RUNTIME_HISTORY_SESSION_SCHEMA_VERSION, runtimeVersion: RUNTIME_VERSION, irVersion: state.irVersion, projectId: state.projectId, buildId: state.buildId, executionId: state.executionId, cursor: 0, checkpoints: [initial], entries: [], inputTombstones: [], archives: [] };
  return result(session, diagnostics.length === 0 ? [] : [diagnostic("RUNTIME_HISTORY_INVALID", diagnostics[0]!.message, state)]);
}

function validateRuntimeHistorySessionUnsafe(program: RuntimeProgramV1, session: RuntimeHistorySessionV1): readonly RuntimeDiagnosticV1[] {
  const invalid = (message: string): readonly RuntimeDiagnosticV1[] => [diagnostic("RUNTIME_HISTORY_INVALID", message, session.checkpoints?.[session.cursor]?.state)];
  if (!record(session) || !exactKeys(session, sessionKeys)) return invalid("History Session schema members are missing or unknown");
  if (session.schemaVersion !== RUNTIME_HISTORY_SESSION_SCHEMA_VERSION || session.runtimeVersion !== RUNTIME_VERSION || session.irVersion !== program.irVersion || session.projectId !== program.projectId) return invalid("History Session identity or version does not match the program");
  if (!Array.isArray(session.checkpoints) || !Array.isArray(session.entries) || !Array.isArray(session.inputTombstones) || !Array.isArray(session.archives) || session.entries.length + session.archives.reduce((count, archive) => count + (Array.isArray(archive?.entries) ? archive.entries.length : MAX_RUNTIME_HISTORY_ENTRIES + 1), 0) > MAX_RUNTIME_HISTORY_ENTRIES || session.checkpoints.length !== session.entries.length + 1 || !Number.isSafeInteger(session.cursor) || session.cursor < 0 || session.cursor >= session.checkpoints.length) return invalid("History Session chain length, archive bound, or cursor is invalid");
  const inputIds = new Map<string, string>();
  for (let index = 0; index < session.checkpoints.length; index += 1) {
    const item = session.checkpoints[index]!;
    if (!record(item) || !exactKeys(item as unknown as Readonly<Record<string, unknown>>, checkpointKeys)) return invalid(`Checkpoint ${index} schema is invalid`);
    const typedItem = item as unknown as RuntimeHistoryCheckpointV1;
    const stateDiagnostics = validateRuntimeStateStructureV1(program, typedItem.state);
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
    if (!validEvent(typedItem.event)) return invalid(`History entry ${index} event is invalid`);
    if (!Array.isArray(typedItem.effects) || typedItem.effects.some((effect) => !validateRuntimeEffectIntentV1(effect) || effect.executionId !== session.executionId || effect.originatingRevision < before.state.stateRevision || effect.originatingRevision > after.state.stateRevision)) return invalid(`History entry ${index} Effect ledger is invalid`);
    const expectedBarriers = after.state.barrierLedger.slice(before.state.barrierLedger.length);
    if (canonicalRuntimeStringify(typedItem.barriers) !== canonicalRuntimeStringify(expectedBarriers)) return invalid(`History entry ${index} Barrier delta is invalid`);
    if (typedItem.input !== null) {
      if (!validateRuntimeInputStructureV1(typedItem.input)) return invalid(`History entry ${index} input schema is invalid`);
      const payload = canonicalRuntimeStringify(typedItem.input), previous = inputIds.get(typedItem.input.inputId);
      if (previous !== undefined && previous !== payload) return invalid(`Input ID ${typedItem.input.inputId} has conflicting payloads`);
      inputIds.set(typedItem.input.inputId, payload);
      if (!after.state.inputReceipts.some((receipt: RuntimeInputReceiptV1) => sameInput(receipt.input, typedItem.input!))) return invalid(`History entry ${index} input was not accepted by its checkpoint`);
    }
  }
  for (const input of session.inputTombstones) {
    if (!validateRuntimeInputStructureV1(input)) return invalid("History input tombstone is invalid");
    const payload = canonicalRuntimeStringify(input), previous = inputIds.get(input.inputId);
    if (previous !== undefined && previous !== payload) return invalid(`Input tombstone ${input.inputId} conflicts with an accepted input`);
    inputIds.set(input.inputId, payload);
  }
  const archiveIds = new Set<string>();
  for (let archiveIndex = 0; archiveIndex < session.archives.length; archiveIndex += 1) {
    const archive = session.archives[archiveIndex]!;
    if (!record(archive) || !exactKeys(archive, archiveKeys) || archive.schemaVersion !== 1 || typeof archive.archiveId !== "string" || archiveIds.has(archive.archiveId) || typeof archive.branchPointCheckpointId !== "string" || !checkpointIdPattern.test(archive.branchPointCheckpointId) || !Number.isSafeInteger(archive.branchPointHistoryIndex) || Number(archive.branchPointHistoryIndex) < 0 || !Array.isArray(archive.entries) || archive.entries.length === 0) return invalid(`History archive ${archiveIndex} schema or identity is invalid`);
    const typedArchive = archive as unknown as RuntimeHistoryArchiveV2;
    const { archiveId: actualArchiveId, ...unsignedArchive } = typedArchive;
    if (actualArchiveId !== archiveId(unsignedArchive)) return invalid(`History archive ${archiveIndex} hash is invalid`);
    archiveIds.add(actualArchiveId);
    for (let offset = 0; offset < typedArchive.entries.length; offset += 1) {
      const archived = typedArchive.entries[offset]!;
      if (!record(archived) || !exactKeys(archived, archivedEntryKeys) || typeof archived.originalEntryId !== "string" || !entryIdPattern.test(archived.originalEntryId) || archived.originalHistoryIndex !== typedArchive.branchPointHistoryIndex + offset || typeof archived.afterStateHash !== "string" || !hashPattern.test(archived.afterStateHash) || !validEvent(archived.event) || !Array.isArray(archived.barriers) || archived.barriers.some((barrier) => !validBarrier(barrier))) return invalid(`History archive ${archiveIndex} entry ${offset} is invalid`);
      if (archived.input !== null) {
        if (!validateRuntimeInputStructureV1(archived.input)) return invalid(`History archive ${archiveIndex} entry ${offset} input is invalid`);
        const payload = canonicalRuntimeStringify(archived.input);
        if (inputIds.get(archived.input.inputId) !== payload || !session.inputTombstones.some((input) => input.inputId === archived.input!.inputId && sameInput(input, archived.input!))) return invalid(`History archive ${archiveIndex} entry ${offset} input is not tombstoned`);
      }
    }
  }
  return [];
}

export function normalizeRuntimeHistorySessionSchemaV1(session: RuntimeHistorySessionLegacyV1): RuntimeHistorySessionV1 {
  return { ...session, schemaVersion: RUNTIME_HISTORY_SESSION_SCHEMA_VERSION, archives: [] };
}

export function validateRuntimeHistorySessionSchemaV1(program: RuntimeProgramV1, session: RuntimeHistorySessionLegacyV1): readonly RuntimeDiagnosticV1[] {
  try {
    if (!record(session) || !exactKeys(session, legacySessionKeys) || session.schemaVersion !== 1) return [diagnostic("RUNTIME_HISTORY_INVALID", "Legacy History Session schema members are missing or unknown")];
    return validateRuntimeHistorySessionUnsafe(program, normalizeRuntimeHistorySessionSchemaV1(session));
  } catch {
    return [diagnostic("RUNTIME_HISTORY_INVALID", "Legacy History Session contains malformed or noncanonical data")];
  }
}

export function validateRuntimeHistorySessionV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1): readonly RuntimeDiagnosticV1[] {
  try { return validateRuntimeHistorySessionUnsafe(program, session); }
  catch { return [diagnostic("RUNTIME_HISTORY_INVALID", "History Session contains malformed or noncanonical data")]; }
}

export function mergeRuntimeHistoryMetaProgressV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1, incoming: RuntimeStateV1["metaProgress"]): RuntimeHistoryResultV1 {
  const validation = validateRuntimeHistorySessionV1(program, session);
  if (validation.length > 0) return result(session, validation);
  return rebaseMetaProgressAtCursor(session, incoming);
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
  const after = checkpoint(executed.state);
  const keptEntries = session.entries.slice(0, session.cursor);
  const archive = makeArchive(session);
  const archives = archive === null || session.archives.some((item) => item.archiveId === archive.archiveId) ? session.archives : [...session.archives, archive];
  if (keptEntries.length + 1 + archives.reduce((count, item) => count + item.entries.length, 0) > MAX_RUNTIME_HISTORY_ENTRIES) return result(session, [diagnostic("RUNTIME_HISTORY_LIMIT", `Active and archived History is limited to ${MAX_RUNTIME_HISTORY_ENTRIES} entries`, state)]);
  const truncated = session.entries.slice(session.cursor).flatMap((item) => item.input === null ? [] : [item.input]);
  const tombstones = [...session.inputTombstones];
  for (const input of truncated) if (!tombstones.some((item) => item.inputId === input.inputId)) tombstones.push(input);
  const unsigned: Omit<RuntimeHistoryEntryV1, "entryId"> = { historyIndex: session.cursor, beforeCheckpointId: session.checkpoints[session.cursor]!.checkpointId, afterCheckpointId: after.checkpointId, input: options.input ?? null, event: executed.event, effects: executed.effects, executedInstructions: executed.executedInstructions, barriers: executed.state.barrierLedger.slice(state.barrierLedger.length) };
  const next: RuntimeHistorySessionV1 = { ...session, cursor: session.cursor + 1, checkpoints: [...session.checkpoints.slice(0, session.cursor + 1), after], entries: [...keptEntries, makeEntry(unsigned)], inputTombstones: tombstones, archives };
  return { session: next, state: executed.state, event: executed.event, effects: executed.effects, diagnostics: [], reconciliationRequired: false, reconciliationPlan: null, barrierBlock: null };
}

/** Commits one already-executed observable Runtime step. Scheduler is its only production caller. */
export function commitRuntimeHistoryStepV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1, executed: RuntimeRunResultV1, executedInstructions = executed.executedInstructions): RuntimeHistoryResultV1 {
  const validation = validateRuntimeHistorySessionV1(program, session);
  if (validation.length > 0) return result(session, validation);
  const before = session.checkpoints[session.cursor]!.state;
  if (session.cursor !== session.entries.length) return result(session, [diagnostic("RUNTIME_HISTORY_FORWARD_REQUIRED", "Scheduler cannot commit across recorded future History", before)]);
  if (executed.diagnostics.length > 0 || executed.event === null && executed.barrierRequest === null) return result(session, [diagnostic("RUNTIME_HISTORY_INVALID", "History commit requires one successful observable Runtime step", before)]);
  const stateDiagnostics = validateRuntimeStateStructureV1(program, executed.state);
  if (stateDiagnostics.length > 0 || executed.state.projectId !== before.projectId || executed.state.buildId !== before.buildId || executed.state.executionId !== before.executionId || !Number.isSafeInteger(executedInstructions) || executedInstructions < 1) return result(session, [diagnostic("RUNTIME_HISTORY_INVALID", "Executed History step State, identity, or instruction count is invalid", before)]);
  if (session.entries.length + 1 + session.archives.reduce((count, item) => count + item.entries.length, 0) > MAX_RUNTIME_HISTORY_ENTRIES) return result(session, [diagnostic("RUNTIME_HISTORY_LIMIT", `Active and archived History is limited to ${MAX_RUNTIME_HISTORY_ENTRIES} entries`, before)]);
  const after = checkpoint(executed.state);
  const unsigned: Omit<RuntimeHistoryEntryV1, "entryId"> = { historyIndex: session.cursor, beforeCheckpointId: session.checkpoints[session.cursor]!.checkpointId, afterCheckpointId: after.checkpointId, input: null, event: executed.event, effects: executed.effects, executedInstructions, barriers: executed.state.barrierLedger.slice(before.barrierLedger.length) };
  const next: RuntimeHistorySessionV1 = { ...session, cursor: session.cursor + 1, checkpoints: [...session.checkpoints, after], entries: [...session.entries, makeEntry(unsigned)] };
  return { session: next, state: executed.state, event: executed.event, effects: executed.effects, diagnostics: [], reconciliationRequired: false, reconciliationPlan: null, barrierBlock: null };
}

export function backRuntimeHistoryV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1): RuntimeHistoryResultV1 {
  const validation = validateRuntimeHistorySessionV1(program, session);
  if (validation.length > 0) return result(session, validation);
  const current = session.checkpoints[session.cursor]!.state;
  if (session.cursor === 0) return result(session, [diagnostic("RUNTIME_HISTORY_AT_START", "History is already at its first checkpoint", current)]);
  if (current.pendingEffect !== null) return result(session, [diagnostic("RUNTIME_EFFECT_REQUIRED", `Pending awaited Effect ${current.pendingEffect.effectId} must complete or cancel before Back`, current)]);
  const crossed = session.entries[session.cursor - 1]!;
  const barrier = crossed.barriers.at(-1) ?? null;
  if (barrier !== null) return result(session, [diagnostic("RUNTIME_BARRIER_BLOCKED", `Back cannot cross committed Barrier ${barrier.descriptorId}: ${barrier.reason}`, current)], null, barrier);
  const target = session.checkpoints[session.cursor - 1]!;
  const plan: RuntimeHistoryReconciliationPlanV1 = {
    schemaVersion: 1,
    direction: "back",
    fromCheckpointId: session.checkpoints[session.cursor]!.checkpointId,
    toCheckpointId: target.checkpointId,
    restoreCheckpointId: target.checkpointId,
    compensations: crossed.effects.filter((effect) => effect.policy === "reversible" && effect.compensation !== null).reverse().map((effect) => ({ effectId: effect.effectId, descriptorId: effect.descriptorId, channel: effect.channel, replayKey: effect.replayKey, compensation: effect.compensation! })),
    replayEffects: []
  };
  const moved = rebaseMetaProgressAtCursor({ ...session, cursor: session.cursor - 1 }, current.metaProgress);
  if (moved.diagnostics.length > 0) return moved;
  return result(moved.session, [], { ...plan, toCheckpointId: moved.session.checkpoints[moved.session.cursor]!.checkpointId, restoreCheckpointId: moved.session.checkpoints[moved.session.cursor]!.checkpointId });
}

export function forwardRuntimeHistoryV1(program: RuntimeProgramV1, session: RuntimeHistorySessionV1): RuntimeHistoryResultV1 {
  const validation = validateRuntimeHistorySessionV1(program, session);
  if (validation.length > 0) return result(session, validation);
  const current = session.checkpoints[session.cursor]!.state;
  if (session.cursor === session.entries.length) return result(session, [diagnostic("RUNTIME_HISTORY_AT_END", "History is already at its latest checkpoint", current)]);
  const crossed = session.entries[session.cursor]!;
  const target = session.checkpoints[session.cursor + 1]!;
  const plan: RuntimeHistoryReconciliationPlanV1 = {
    schemaVersion: 1,
    direction: "forward",
    fromCheckpointId: session.checkpoints[session.cursor]!.checkpointId,
    toCheckpointId: target.checkpointId,
    restoreCheckpointId: target.checkpointId,
    compensations: [],
    replayEffects: crossed.effects.filter((effect) => effect.policy !== "barrier")
  };
  const moved = rebaseMetaProgressAtCursor({ ...session, cursor: session.cursor + 1 }, current.metaProgress);
  if (moved.diagnostics.length > 0) return moved;
  return result(moved.session, [], { ...plan, toCheckpointId: moved.session.checkpoints[moved.session.cursor]!.checkpointId, restoreCheckpointId: moved.session.checkpoints[moved.session.cursor]!.checkpointId });
}

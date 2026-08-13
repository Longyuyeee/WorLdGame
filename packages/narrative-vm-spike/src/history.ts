import { canonicalStringify } from "./canonical";
import { choiceRequestIdV0 } from "./input";
import { stateHashV0 } from "./hash";
import { transitionV0 } from "./transition";
import { MAX_HISTORY_ENTRIES_V0, MAX_INPUT_RECEIPTS_V0 } from "./types";
import type {
  ExternalInputV0,
  HistoryCheckpointV0,
  HistoryEntryV0,
  HistoryResultV0,
  InputReceiptV0,
  InstructionV0,
  ProgramV0,
  RuntimeSessionV0,
  RuntimeStateV0,
  VmDiagnostic
} from "./types";
import { validateExternalInputV0, validateProgram, validateState } from "./validation";

const MAX_INSTRUCTIONS_PER_HISTORY_STEP_V0 = 1024;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalStringify(value)) as T;
}

function checkpoint(state: RuntimeStateV0): HistoryCheckpointV0 {
  const cloned = canonicalClone(state);
  const stateHash = stateHashV0(cloned);
  return { checkpointId: `history.${stateHash}`, stateHash, state: cloned };
}

function diagnostic(state: unknown, code: VmDiagnostic["code"], detail: string): VmDiagnostic {
  const ip = plainRecord(state) && typeof state.ip === "number" && Number.isSafeInteger(state.ip) ? state.ip : null;
  return { code, ip, sourceStatementId: null, detail };
}

function failed(session: RuntimeSessionV0, code: VmDiagnostic["code"], detail: string): HistoryResultV0 {
  return { session, diagnostics: [diagnostic(session.state, code, detail)] };
}

function sameInput(left: ExternalInputV0 | null, right: ExternalInputV0): boolean {
  return left !== null && canonicalStringify(left) === canonicalStringify(right);
}

export function validateRuntimeSessionV0(program: ProgramV0, session: RuntimeSessionV0): readonly VmDiagnostic[] {
  const candidateState = plainRecord(session) ? session.state : undefined;
  try {
    if (validateProgram(program).length > 0 || !plainRecord(session) || !exactKeys(session, [
      "schemaVersion", "buildId", "executionId", "state", "entries", "checkpoints", "inputTombstones"
    ]) || session.schemaVersion !== 0 || session.buildId !== program.buildId ||
        !SAFE_ID.test(session.executionId) || !Array.isArray(session.entries) ||
        !Array.isArray(session.checkpoints) || !Array.isArray(session.inputTombstones) ||
        session.entries.length > MAX_HISTORY_ENTRIES_V0 || session.inputTombstones.length > MAX_INPUT_RECEIPTS_V0 ||
        session.checkpoints.length !== session.entries.length + 1 ||
        validateState(program, session.state).length > 0 || session.state.executionId !== session.executionId ||
        session.state.historyCursor < -1 || session.state.historyCursor >= session.entries.length) {
      return [diagnostic(candidateState, "VM_HISTORY_INVALID", "Runtime session header, state, or collection size is invalid")];
    }

    const tombstoneIds = new Set<string>();
    for (const input of session.inputTombstones) {
      if (!validateExternalInputV0(input) || input.executionId !== session.executionId ||
          input.requestId !== choiceRequestIdV0(
            input.executionId,
            input.choiceId,
            input.logicalSequence,
            input.expectedRevision
          ) || tombstoneIds.has(input.inputId)) {
        return [diagnostic(candidateState, "VM_HISTORY_INVALID", "Input tombstone ledger is malformed or contains duplicate IDs")];
      }
      tombstoneIds.add(input.inputId);
    }

    for (let index = 0; index < session.checkpoints.length; index += 1) {
      const rawItem = session.checkpoints[index];
      if (!plainRecord(rawItem) || !exactKeys(rawItem, ["checkpointId", "stateHash", "state"])) {
        return [diagnostic(session.state, "VM_HISTORY_INVALID", "History checkpoint has an invalid schema")];
      }
      const item = rawItem as unknown as HistoryCheckpointV0;
      if (
          validateState(program, item.state).length > 0 || item.state.buildId !== session.buildId ||
          item.state.executionId !== session.executionId || item.state.historyCursor !== index - 1 ||
          item.stateHash !== stateHashV0(item.state) || item.checkpointId !== `history.${item.stateHash}`) {
        return [diagnostic(session.state, "VM_HISTORY_INVALID", "History checkpoint is malformed or does not match its State hash")];
      }
    }

    for (let index = 0; index < session.entries.length; index += 1) {
      const rawEntry = session.entries[index];
      const before = session.checkpoints[index];
      const after = session.checkpoints[index + 1];
      if (!plainRecord(rawEntry) || !exactKeys(rawEntry, [
        "historyIndex", "stepId", "sourceStatementId", "beforeHash", "afterHash",
        "beforeCheckpointId", "afterCheckpointId", "input"
      ])) {
        return [diagnostic(session.state, "VM_HISTORY_INVALID", "History entry has an invalid schema")];
      }
      const entry = rawEntry as unknown as HistoryEntryV0;
      if (entry.historyIndex !== index || !SAFE_ID.test(entry.stepId) ||
          !SAFE_ID.test(entry.sourceStatementId) || before === undefined || after === undefined ||
          entry.stepId !== after.state.stepId ||
          entry.beforeHash !== before.stateHash || entry.afterHash !== after.stateHash ||
          entry.beforeCheckpointId !== before.checkpointId || entry.afterCheckpointId !== after.checkpointId ||
          (entry.input !== null && (!validateExternalInputV0(entry.input) ||
            entry.input.executionId !== session.executionId || entry.input.requestId !== choiceRequestIdV0(
              entry.input.executionId,
              entry.input.choiceId,
              entry.input.logicalSequence,
              entry.input.expectedRevision
            )))) {
        return [diagnostic(session.state, "VM_HISTORY_INVALID", "History entry is malformed or breaks the checkpoint chain")];
      }
      if (entry.input !== null) {
        const pending = before.state.pendingRequests[0];
        const receipt = after.state.inputReceipts.find(
          (item: InputReceiptV0) => item.input.inputId === entry.input?.inputId
        );
        if (pending === undefined || pending.requestId !== entry.input.requestId ||
            pending.executionId !== entry.input.executionId || pending.expectedRevision !== entry.input.expectedRevision ||
            pending.logicalSequence !== entry.input.logicalSequence || pending.choiceId !== entry.input.choiceId ||
            !pending.options.some((option: { readonly optionId: string; readonly targetIp: number }) =>
              option.optionId === entry.input?.optionId && option.targetIp === after.state.ip) ||
            after.state.stateRevision !== before.state.stateRevision + 1 ||
            receipt === undefined || canonicalStringify(receipt.input) !== canonicalStringify(entry.input) ||
            !session.inputTombstones.some((input) => canonicalStringify(input) === canonicalStringify(entry.input))) {
          return [diagnostic(session.state, "VM_HISTORY_INVALID", "History input is not present in its after-checkpoint receipt ledger")];
        }
      }
    }

    const current = session.checkpoints[session.state.historyCursor + 1];
    if (current === undefined || current.stateHash !== stateHashV0(session.state) ||
        canonicalStringify(current.state) !== canonicalStringify(session.state)) {
      return [diagnostic(session.state, "VM_HISTORY_INVALID", "Current State does not match the History cursor checkpoint")];
    }
    canonicalStringify(session);
    return [];
  } catch {
    return [diagnostic(candidateState, "VM_HISTORY_INVALID", "Runtime session is not canonically valid")];
  }
}

export function createRuntimeSessionV0(program: ProgramV0, initialState: RuntimeStateV0): RuntimeSessionV0 {
  const stateDiagnostics = validateState(program, initialState);
  if (validateProgram(program).length > 0 || stateDiagnostics.length > 0 || initialState.historyCursor !== -1) {
    throw new TypeError("Initial Runtime session State must be valid and have historyCursor -1");
  }
  const root = checkpoint(initialState);
  return {
    schemaVersion: 0,
    buildId: program.buildId,
    executionId: initialState.executionId,
    state: root.state,
    entries: [],
    checkpoints: [root],
    inputTombstones: []
  };
}

function truncateForward(session: RuntimeSessionV0): RuntimeSessionV0 {
  const entryCount = session.state.historyCursor + 1;
  return {
    ...session,
    entries: session.entries.slice(0, entryCount),
    checkpoints: session.checkpoints.slice(0, entryCount + 1)
  };
}

function recordBoundary(
  program: ProgramV0,
  session: RuntimeSessionV0,
  rawAfter: RuntimeStateV0,
  instruction: InstructionV0,
  input: ExternalInputV0 | null
): HistoryResultV0 {
  if (session.entries.length >= MAX_HISTORY_ENTRIES_V0) {
    return failed(session, "VM_HISTORY_LIMIT", "Runtime History reached its v0 entry limit");
  }
  if (input !== null && session.inputTombstones.length >= MAX_INPUT_RECEIPTS_V0) {
    return failed(session, "VM_INPUT_RECEIPT_LIMIT", "Runtime Session input tombstones reached their v0 limit");
  }
  if (rawAfter.stepId === null) {
    return failed(session, "VM_HISTORY_INVALID", "Story boundary did not produce a stable stepId");
  }
  const historyIndex = session.entries.length;
  const afterState = { ...rawAfter, historyCursor: historyIndex };
  const after = checkpoint(afterState);
  const before = session.checkpoints[session.checkpoints.length - 1];
  if (before === undefined) return failed(session, "VM_HISTORY_INVALID", "Runtime History has no root checkpoint");
  const entry: HistoryEntryV0 = {
    historyIndex,
    stepId: rawAfter.stepId,
    sourceStatementId: instruction.sourceStatementId,
    beforeHash: before.stateHash,
    afterHash: after.stateHash,
    beforeCheckpointId: before.checkpointId,
    afterCheckpointId: after.checkpointId,
    input: input === null ? null : canonicalClone(input)
  };
  const nextSession: RuntimeSessionV0 = {
    ...session,
    state: after.state,
    entries: [...session.entries, entry],
    checkpoints: [...session.checkpoints, after],
    inputTombstones: input === null ? session.inputTombstones : [...session.inputTombstones, canonicalClone(input)]
  };
  const diagnostics = validateRuntimeSessionV0(program, nextSession);
  return diagnostics.length === 0 ? { session: nextSession, diagnostics: [] } : { session, diagnostics };
}

function preserveForkOnFailure(
  original: RuntimeSessionV0,
  forked: boolean,
  result: HistoryResultV0
): HistoryResultV0 {
  return forked && result.diagnostics.length > 0 ? { session: original, diagnostics: result.diagnostics } : result;
}

export function advanceRuntimeHistoryV0(
  program: ProgramV0,
  session: RuntimeSessionV0,
  input?: ExternalInputV0
): HistoryResultV0 {
  const sessionDiagnostics = validateRuntimeSessionV0(program, session);
  if (sessionDiagnostics.length > 0) return { session, diagnostics: sessionDiagnostics };
  if (input !== undefined && !validateExternalInputV0(input)) {
    return failed(session, "VM_INPUT_MISMATCH", "External History input schema is invalid");
  }

  const hasForward = session.state.historyCursor < session.entries.length - 1;
  if (hasForward) {
    const next = session.entries[session.state.historyCursor + 1];
    if (input === undefined || (next !== undefined && sameInput(next.input, input))) {
      return failed(session, "VM_HISTORY_FORWARD_REQUIRED", "Recorded forward History must be used instead of re-executing the same step");
    }
  }
  if (input !== undefined) {
    const tombstone = session.inputTombstones.find((item) => item.inputId === input.inputId);
    if (tombstone !== undefined) {
      return canonicalStringify(tombstone) === canonicalStringify(input)
        ? { session, diagnostics: [] }
        : failed(session, "VM_INPUT_ID_CONFLICT", "Input ID was already accepted with a different payload in this execution");
    }
  }
  const working = hasForward ? truncateForward(session) : session;
  const startingState = working.state;

  if (input !== undefined) {
    const instruction = program.instructions.find((item) => item.ip === startingState.ip);
    if (instruction === undefined) return failed(session, "VM_HISTORY_INVALID", "History State IP has no instruction");
    const result = transitionV0(program, startingState, input);
    if (result.diagnostics.length > 0) return { session, diagnostics: result.diagnostics };
    if (result.nextState === startingState) return { session, diagnostics: [] };
    return preserveForkOnFailure(
      session,
      hasForward,
      recordBoundary(program, working, result.nextState, instruction, input)
    );
  }

  let state = startingState;
  for (let count = 0; count < MAX_INSTRUCTIONS_PER_HISTORY_STEP_V0; count += 1) {
    const instruction = program.instructions.find((item) => item.ip === state.ip);
    if (instruction === undefined) return failed(session, "VM_HISTORY_INVALID", "History State IP has no instruction");
    const result = transitionV0(program, state);
    if (result.diagnostics.length > 0) return { session, diagnostics: result.diagnostics };
    if (result.wait !== null) {
      return failed(session, "VM_HISTORY_WAIT_REQUIRED", "Synchronous History advance cannot consume a wait intent");
    }
    state = result.nextState;
    if (instruction.stepBoundary) {
      return preserveForkOnFailure(
        session,
        hasForward,
        recordBoundary(program, working, state, instruction, null)
      );
    }
  }
  return failed(session, "VM_HISTORY_NO_BOUNDARY", "Instruction budget ended before a Story Step boundary");
}

export function backRuntimeHistoryV0(program: ProgramV0, session: RuntimeSessionV0): HistoryResultV0 {
  const diagnostics = validateRuntimeSessionV0(program, session);
  if (diagnostics.length > 0) return { session, diagnostics };
  if (session.state.historyCursor < 0) return failed(session, "VM_HISTORY_AT_START", "Runtime History is already at its root");
  const target = session.checkpoints[session.state.historyCursor];
  if (target === undefined) return failed(session, "VM_HISTORY_INVALID", "Back target checkpoint is missing");
  return { session: { ...session, state: canonicalClone(target.state) }, diagnostics: [] };
}

export function forwardRuntimeHistoryV0(program: ProgramV0, session: RuntimeSessionV0): HistoryResultV0 {
  const diagnostics = validateRuntimeSessionV0(program, session);
  if (diagnostics.length > 0) return { session, diagnostics };
  if (session.state.historyCursor >= session.entries.length - 1) {
    return failed(session, "VM_HISTORY_AT_END", "Runtime History has no recorded forward step");
  }
  const target = session.checkpoints[session.state.historyCursor + 2];
  if (target === undefined) return failed(session, "VM_HISTORY_INVALID", "Forward target checkpoint is missing");
  return { session: { ...session, state: canonicalClone(target.state) }, diagnostics: [] };
}

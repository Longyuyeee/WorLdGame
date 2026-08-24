import { runtimeStoryOutcomeHashV1 } from "./hash";
import { validateRuntimeProgramV1, validateRuntimeStateV1 } from "./runtime";
import type { RuntimeCursorV1, RuntimeDiagnosticV1, RuntimeProgramV1, RuntimeStateV1, RuntimeStoryOutcomeResultV1, RuntimeStoryOutcomeV1 } from "./types";

function diagnostic(code: RuntimeDiagnosticV1["code"], message: string, state: RuntimeStateV1): RuntimeDiagnosticV1 {
  return { code, message, sceneId: state.cursor.sceneId, instructionIndex: state.cursor.instructionIndex, instructionId: null };
}

function semanticCursor(program: RuntimeProgramV1, cursor: RuntimeCursorV1): { readonly sceneId: string; readonly instructionId: string } | null {
  const instruction = program.scenes.find((scene) => scene.sceneId === cursor.sceneId)?.instructions[cursor.instructionIndex];
  return instruction === undefined ? null : { sceneId: cursor.sceneId, instructionId: instruction.instructionId };
}

/** Hashes story semantics only. Presentation State, Meta Progress, input receipts, revisions, and host Effect bookkeeping are deliberately excluded. */
export function createRuntimeStoryOutcomeV1(program: RuntimeProgramV1, state: RuntimeStateV1): RuntimeStoryOutcomeResultV1 {
  const programDiagnostics = validateRuntimeProgramV1(program);
  if (programDiagnostics.length > 0) return { ok: false, diagnostics: programDiagnostics };
  const stateDiagnostics = validateRuntimeStateV1(program, state);
  if (stateDiagnostics.length > 0) return { ok: false, diagnostics: stateDiagnostics };
  if (state.pendingChoice !== null || state.pendingEffect !== null || state.pendingBarrier !== null) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_OUTCOME_NOT_QUIESCENT", "Story Outcome requires a quiescent Runtime State with no pending Choice, Effect, or Barrier", state)] };
  }
  const callStack = state.callStack.map((cursor) => semanticCursor(program, cursor));
  if (callStack.some((cursor) => cursor === null)) {
    return { ok: false, diagnostics: [diagnostic("RUNTIME_INVALID_STATE", "Story Outcome cannot resolve a call stack cursor to an instruction", state)] };
  }
  const currentCursor = semanticCursor(program, state.cursor);
  if (currentCursor === null) return { ok: false, diagnostics: [diagnostic("RUNTIME_INVALID_STATE", "Story Outcome cannot resolve the current cursor to an instruction", state)] };
  let position: RuntimeStoryOutcomeV1["position"];
  if (state.terminal.kind === "ended") {
    position = { kind: "ended", endingId: state.terminal.endingId };
  } else {
    position = { kind: "running", ...currentCursor };
  }
  const outcome: RuntimeStoryOutcomeV1 = {
    schemaVersion: 1 as const,
    irVersion: state.irVersion,
    projectId: state.projectId,
    buildId: state.buildId,
    position,
    callStack: callStack as readonly { readonly sceneId: string; readonly instructionId: string }[],
    variables: state.variables,
    prng: state.prng,
    logicalTimeMilliseconds: state.logicalTimeMilliseconds
  };
  return { ok: true, outcome, outcomeHash: runtimeStoryOutcomeHashV1(outcome) };
}

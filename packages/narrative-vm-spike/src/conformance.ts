import { canonicalBytes } from "./canonical";
import { effectIntentHashV0 } from "./effect";
import {
  advanceRuntimeHistoryV0,
  backRuntimeHistoryV0,
  createRuntimeSessionV0,
  forwardRuntimeHistoryV0
} from "./history";
import { stateHashV0 } from "./hash";
import { createMetaProgressV0, metaProgressHashV0 } from "./meta-progress";
import { sha256Hex } from "./sha256";
import {
  createRuntimeSaveV0,
  loadRuntimeSaveV0,
  serializeRuntimeSaveV0
} from "./save";
import { scheduleRuntimeBatchV0 } from "./scheduler";
import { createInitialStateV0, transitionV0 } from "./transition";
import type {
  ChoiceSelectedInputV0,
  EffectIntentV0,
  EffectCompletedInputV0,
  ExternalInputV0,
  InstructionV0,
  MetaProgressV0,
  ProgramV0,
  RuntimeSchedulePolicyV0,
  RuntimeScheduleResultV0,
  RuntimeSessionV0,
  RuntimeStateV0,
  VmDiagnostic
} from "./types";
import { SPIKE_OPCODE_REGISTRY_DIGEST_V0 } from "./validation";

export type ConformanceActionV0 =
  | { readonly kind: "transition" }
  | { readonly kind: "selectChoice"; readonly inputId: string; readonly choiceId: string; readonly optionId: string }
  | { readonly kind: "completeEffect"; readonly inputId: string };

export interface ConformanceCorpusV0 {
  readonly schemaVersion: 0;
  readonly corpusId: string;
  readonly program: ProgramV0;
  readonly executionId: string;
  readonly prngSeed: number;
  readonly metaProgress: MetaProgressV0;
  readonly actions: readonly ConformanceActionV0[];
}

export interface ConformanceTraceRecordV0 {
  readonly ordinal: number;
  readonly actionKind: ConformanceActionV0["kind"];
  readonly stateHash: string;
  readonly effectIntentHashes: readonly string[];
  readonly metaProgressHash: string;
  readonly diagnosticCodes: readonly VmDiagnostic["code"][];
  readonly historyCursor: number;
  readonly checkpointHash: string | null;
  readonly stepId: string | null;
}

export interface ConformanceResultV0 {
  readonly schemaVersion: 0;
  readonly corpusId: string;
  readonly corpusDigest: string;
  readonly records: readonly ConformanceTraceRecordV0[];
  readonly recordDigests: readonly string[];
  readonly traceDigest: string;
}

export interface Spike11WorkflowRecordV0 {
  readonly ordinal: number;
  readonly workflow: "scheduler" | "historySave";
  readonly operation: string;
  readonly stateHash: string;
  readonly sessionDigest: string | null;
  readonly saveIntegrityDigest: string | null;
  readonly effectIntentHashes: readonly string[];
  readonly cancellationDigests: readonly string[];
  readonly waitDigest: string | null;
  readonly metaProgressReferenceId: string | null;
  readonly diagnosticCodes: readonly VmDiagnostic["code"][];
  readonly historyCursor: number;
  readonly historyEntryCount: number | null;
  readonly checkpointCount: number | null;
  readonly stopReason: RuntimeScheduleResultV0["stopReason"] | null;
  readonly executedInstructions: number | null;
  readonly autoAdvanceDelayTicks: number | null;
}

export interface Spike11ConformanceResultV0 {
  readonly schemaVersion: 0;
  readonly suiteId: "suite.host.spike11.v0";
  readonly records: readonly Spike11WorkflowRecordV0[];
  readonly recordDigests: readonly string[];
  readonly suiteDigest: string;
}

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function validateAction(action: ConformanceActionV0): void {
  if (typeof action !== "object" || action === null || typeof action.kind !== "string") {
    throw new TypeError("Conformance action must be a versioned data object");
  }
  if (action.kind === "transition") {
    if (!exactKeys(action, ["kind"])) throw new TypeError("Transition action contains unknown fields");
    return;
  }
  if (action.kind === "selectChoice") {
    if (!exactKeys(action, ["kind", "inputId", "choiceId", "optionId"]) ||
        !SAFE_ID.test(action.inputId) || !SAFE_ID.test(action.choiceId) || !SAFE_ID.test(action.optionId)) {
      throw new TypeError("Choice conformance action is not canonical");
    }
    return;
  }
  if (action.kind === "completeEffect") {
    if (!exactKeys(action, ["kind", "inputId"]) || !SAFE_ID.test(action.inputId)) {
      throw new TypeError("Effect conformance action is not canonical");
    }
    return;
  }
  throw new TypeError("Unknown conformance action kind");
}

function materializeInput(state: RuntimeStateV0, action: ConformanceActionV0): ExternalInputV0 | undefined {
  if (action.kind === "transition") return undefined;
  if (action.kind === "selectChoice") {
    const request = state.pendingRequests[0];
    if (request?.kind !== "choice" || request.choiceId !== action.choiceId ||
        !request.options.some((option) => option.optionId === action.optionId)) {
      throw new TypeError("Choice conformance action does not match the pending request");
    }
    const input: ChoiceSelectedInputV0 = {
      schemaVersion: 0,
      kind: "choiceSelected",
      inputId: action.inputId,
      executionId: request.executionId,
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      logicalSequence: request.logicalSequence,
      choiceId: request.choiceId,
      optionId: action.optionId
    };
    return input;
  }
  const effect = state.pendingEffects[0];
  if (effect === undefined) throw new TypeError("Effect conformance action has no pending Effect");
  const input: EffectCompletedInputV0 = {
    schemaVersion: 0,
    kind: "effectCompleted",
    inputId: action.inputId,
    executionId: effect.executionId,
    effectId: effect.effectId,
    expectedRevision: state.stateRevision,
    logicalSequence: effect.logicalSequence,
    replayKey: effect.replayKey
  };
  return input;
}

export function executeConformanceCorpusV0(corpus: ConformanceCorpusV0): ConformanceResultV0 {
  if (typeof corpus !== "object" || corpus === null || !exactKeys(corpus, [
    "schemaVersion", "corpusId", "program", "executionId", "prngSeed", "metaProgress", "actions"
  ]) || corpus.schemaVersion !== 0 || !SAFE_ID.test(corpus.corpusId) ||
      corpus.metaProgress.projectId !== corpus.program.projectId || !Array.isArray(corpus.actions) ||
      corpus.actions.length === 0 || corpus.actions.length > 10_000) {
    throw new TypeError("Conformance corpus envelope is invalid");
  }
  let state = createInitialStateV0(corpus.program, {
    executionId: corpus.executionId,
    prngSeed: corpus.prngSeed
  });
  const progressHash = metaProgressHashV0(corpus.metaProgress);
  const records: ConformanceTraceRecordV0[] = [];
  for (const [ordinal, action] of corpus.actions.entries()) {
    validateAction(action);
    const result = transitionV0(corpus.program, state, materializeInput(state, action));
    state = result.nextState;
    records.push({
      ordinal,
      actionKind: action.kind,
      stateHash: stateHashV0(state),
      effectIntentHashes: result.effects.map(effectIntentHashV0),
      metaProgressHash: progressHash,
      diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code),
      historyCursor: state.historyCursor,
      checkpointHash: result.checkpoint?.stateHash ?? null,
      stepId: state.stepId
    });
  }
  const corpusDigest = sha256Hex(canonicalBytes(corpus));
  const recordDigests = records.map((record) => sha256Hex(canonicalBytes(record)));
  return {
    schemaVersion: 0,
    corpusId: corpus.corpusId,
    corpusDigest,
    records,
    recordDigests,
    traceDigest: sha256Hex(canonicalBytes(records))
  };
}

const none = { stepBoundary: false, effectClass: "none" as const, stopPoint: false };

export function createSpike10ConformanceCorpusV0(): ConformanceCorpusV0 {
  const instructions: readonly InstructionV0[] = [
    { ip: 0, opcode: "set", operands: { variableId: "score", value: 2 }, sourceStatementId: "stmt.host.set", ...none },
    { ip: 10, opcode: "random", operands: { variableId: "roll", min: 1, max: 20 }, sourceStatementId: "stmt.host.random", ...none },
    { ip: 20, opcode: "call", operands: { targetIp: 100 }, sourceStatementId: "stmt.host.call", ...none },
    {
      ip: 30,
      opcode: "choice",
      operands: {
        choiceId: "choice.host.route",
        promptStepId: "step.host.choice.prompt",
        commitStepId: "step.host.choice.commit",
        options: [{ optionId: "left", targetIp: 40 }, { optionId: "right", targetIp: 50 }]
      },
      sourceStatementId: "stmt.host.choice",
      stepBoundary: true,
      effectClass: "none",
      stopPoint: true
    },
    { ip: 40, opcode: "set", operands: { variableId: "route", value: "left" }, sourceStatementId: "stmt.host.left", ...none },
    { ip: 41, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.host.left.exit", ...none },
    { ip: 50, opcode: "wait", operands: { durationTicks: 7 }, sourceStatementId: "stmt.host.wait", ...none },
    {
      ip: 60,
      opcode: "emit",
      operands: {
        descriptorId: "descriptor.host.awaited",
        requestStepId: null,
        issueStepId: "step.host.effect.issue",
        completeStepId: "step.host.effect.complete",
        channel: "visual",
        kind: "show.host.marker",
        payload: { variant: "violet" },
        policy: "pure",
        awaitMode: "awaited",
        cancellationScope: "scope.host.effect",
        replayKey: "replay.host.effect",
        compensation: null,
        barrierReason: null
      },
      sourceStatementId: "stmt.host.effect",
      stepBoundary: true,
      effectClass: "pure",
      stopPoint: true
    },
    { ip: 70, opcode: "checkpoint", operands: { stepId: "step.host.checkpoint" }, sourceStatementId: "stmt.host.checkpoint", stepBoundary: true, effectClass: "none", stopPoint: false },
    { ip: 80, opcode: "end", operands: { endingId: "ending.host.complete" }, sourceStatementId: "stmt.host.end", stepBoundary: true, effectClass: "none", stopPoint: true },
    { ip: 100, opcode: "add", operands: { variableId: "score", value: 5 }, sourceStatementId: "stmt.host.add", ...none },
    { ip: 110, opcode: "return", operands: {}, sourceStatementId: "stmt.host.return", ...none }
  ];
  const program: ProgramV0 = {
    irVersion: 0,
    projectId: "project.host.conformance",
    buildId: "build.host.conformance.v0",
    entryIp: 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((instruction) => [String(instruction.ip), instruction.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
  return {
    schemaVersion: 0,
    corpusId: "corpus.host.spike10.v0",
    program,
    executionId: "execution.host.spike10",
    prngSeed: 0x12345678,
    metaProgress: createMetaProgressV0(program.projectId, "progress.local.spike10"),
    actions: [
      { kind: "transition" },
      { kind: "transition" },
      { kind: "transition" },
      { kind: "transition" },
      { kind: "transition" },
      { kind: "transition" },
      { kind: "selectChoice", inputId: "input.host.choice", choiceId: "choice.host.route", optionId: "right" },
      { kind: "transition" },
      { kind: "transition" },
      { kind: "completeEffect", inputId: "input.host.effect.complete" },
      { kind: "transition" },
      { kind: "transition" }
    ]
  };
}

function spike11Program(instructions: readonly InstructionV0[], buildId: string): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.host.spike11",
    buildId,
    entryIp: instructions[0]?.ip ?? 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((instruction) => [String(instruction.ip), instruction.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

function spike11Policy(mode: "normal" | "skipAll"): RuntimeSchedulePolicyV0 {
  return {
    schemaVersion: 0,
    mode,
    skipActivation: mode === "skipAll" ? "toggle" : null,
    speed: mode === "skipAll" ? "instant" : "normal",
    readStepIds: [],
    unavailableEffectDescriptorIds: [],
    instantInstructionBudget: mode === "skipAll" ? 4 : 256,
    autoTiming: {
      baseDelayTicks: 0,
      ticksPerReadableUnit: 0,
      voiceDurationTicks: 0,
      voiceTailTicks: 0,
      readableUnits: 0
    }
  };
}

function digestValue(value: unknown): string {
  return sha256Hex(canonicalBytes(value));
}

function schedulerRecord(
  ordinal: number,
  operation: string,
  result: RuntimeScheduleResultV0
): Spike11WorkflowRecordV0 {
  return {
    ordinal,
    workflow: "scheduler",
    operation,
    stateHash: stateHashV0(result.nextState),
    sessionDigest: null,
    saveIntegrityDigest: null,
    effectIntentHashes: result.effects.map(effectIntentHashV0),
    cancellationDigests: [],
    waitDigest: result.waits.length === 0 ? null : digestValue(result.waits),
    metaProgressReferenceId: null,
    diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code),
    historyCursor: result.nextState.historyCursor,
    historyEntryCount: null,
    checkpointCount: null,
    stopReason: result.stopReason,
    executedInstructions: result.executedInstructions,
    autoAdvanceDelayTicks: result.autoAdvanceDelayTicks
  };
}

function historyRecord(
  ordinal: number,
  operation: string,
  session: RuntimeSessionV0,
  options: {
    readonly effects?: readonly EffectIntentV0[];
    readonly cancellations?: readonly unknown[];
    readonly diagnostics?: readonly VmDiagnostic[];
    readonly saveIntegrityDigest?: string | null;
    readonly metaProgressReferenceId?: string | null;
  } = {}
): Spike11WorkflowRecordV0 {
  return {
    ordinal,
    workflow: "historySave",
    operation,
    stateHash: stateHashV0(session.state),
    sessionDigest: digestValue(session),
    saveIntegrityDigest: options.saveIntegrityDigest ?? null,
    effectIntentHashes: (options.effects ?? []).map(effectIntentHashV0),
    cancellationDigests: (options.cancellations ?? []).map(digestValue),
    waitDigest: null,
    metaProgressReferenceId: options.metaProgressReferenceId ?? null,
    diagnosticCodes: (options.diagnostics ?? []).map((diagnostic) => diagnostic.code),
    historyCursor: session.state.historyCursor,
    historyEntryCount: session.entries.length,
    checkpointCount: session.checkpoints.length,
    stopReason: null,
    executedInstructions: null,
    autoAdvanceDelayTicks: null
  };
}

function spike11ChoiceInput(session: RuntimeSessionV0): ChoiceSelectedInputV0 {
  const request = session.state.pendingRequests[0];
  if (request?.kind !== "choice") throw new TypeError("Spike 11 Choice request is missing");
  return {
    schemaVersion: 0,
    kind: "choiceSelected",
    inputId: "input.host.spike11.left",
    executionId: request.executionId,
    requestId: request.requestId,
    expectedRevision: request.expectedRevision,
    logicalSequence: request.logicalSequence,
    choiceId: request.choiceId,
    optionId: "left"
  };
}

export function executeSpike11ConformanceSuiteV0(): Spike11ConformanceResultV0 {
  const schedulerProgram = spike11Program([
    { ip: 0, opcode: "set", operands: { variableId: "score", value: 1 }, sourceStatementId: "stmt.scheduler.set", ...none },
    { ip: 10, opcode: "wait", operands: { durationTicks: 30 }, sourceStatementId: "stmt.scheduler.wait", ...none },
    { ip: 20, opcode: "checkpoint", operands: { stepId: "step.scheduler.one" }, sourceStatementId: "stmt.scheduler.one", stepBoundary: true, effectClass: "none", stopPoint: false },
    { ip: 30, opcode: "add", operands: { variableId: "score", value: 2 }, sourceStatementId: "stmt.scheduler.add", ...none },
    { ip: 40, opcode: "random", operands: { variableId: "roll", min: 1, max: 6 }, sourceStatementId: "stmt.scheduler.random", ...none },
    { ip: 50, opcode: "checkpoint", operands: { stepId: "step.scheduler.two" }, sourceStatementId: "stmt.scheduler.two", stepBoundary: true, effectClass: "none", stopPoint: false },
    { ip: 60, opcode: "add", operands: { variableId: "score", value: 4 }, sourceStatementId: "stmt.scheduler.final", ...none },
    { ip: 70, opcode: "end", operands: { endingId: "ending.scheduler" }, sourceStatementId: "stmt.scheduler.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], "build.host.spike11.scheduler");
  const records: Spike11WorkflowRecordV0[] = [];
  const schedulerFinalHashes: string[] = [];
  for (const mode of ["normal", "skipAll"] as const) {
    let state = createInitialStateV0(schedulerProgram, {
      executionId: "execution.host.spike11.scheduler",
      prngSeed: 123
    });
    for (let batch = 0; batch < 16 && state.terminal.kind === "running"; batch += 1) {
      const result = scheduleRuntimeBatchV0(schedulerProgram, state, spike11Policy(mode));
      records.push(schedulerRecord(records.length, `schedule.${mode}.${batch}`, result));
      if (result.diagnostics.length > 0 || result.executedInstructions === 0) {
        throw new TypeError(`Spike 11 ${mode} Scheduler did not make deterministic progress`);
      }
      state = result.nextState;
    }
    if (state.terminal.kind !== "ended") throw new TypeError(`Spike 11 ${mode} Scheduler did not terminate`);
    schedulerFinalHashes.push(stateHashV0(state));
  }
  if (schedulerFinalHashes[0] !== schedulerFinalHashes[1]) {
    throw new TypeError("Spike 11 Scheduler modes produced different final State Hashes");
  }

  const historyProgram = spike11Program([
    {
      ip: 0,
      opcode: "choice",
      operands: {
        choiceId: "choice.host.spike11",
        promptStepId: "step.host.spike11.prompt",
        commitStepId: "step.host.spike11.commit",
        options: [{ optionId: "left", targetIp: 10 }, { optionId: "right", targetIp: 30 }]
      },
      sourceStatementId: "stmt.history.choice",
      stepBoundary: true,
      effectClass: "none",
      stopPoint: true
    },
    { ip: 10, opcode: "set", operands: { variableId: "route", value: "left" }, sourceStatementId: "stmt.history.left", ...none },
    { ip: 20, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.history.left.exit", ...none },
    { ip: 30, opcode: "set", operands: { variableId: "route", value: "right" }, sourceStatementId: "stmt.history.right", ...none },
    { ip: 40, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.history.right.exit", ...none },
    { ip: 50, opcode: "end", operands: { endingId: "ending.history" }, sourceStatementId: "stmt.history.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], "build.host.spike11.history");
  let session = createRuntimeSessionV0(historyProgram, createInitialStateV0(historyProgram, {
    executionId: "execution.host.spike11.history",
    prngSeed: 1
  }));
  let history = advanceRuntimeHistoryV0(historyProgram, session);
  session = history.session;
  records.push(historyRecord(records.length, "history.advance.prompt", session, history));
  history = advanceRuntimeHistoryV0(historyProgram, session, spike11ChoiceInput(session));
  session = history.session;
  records.push(historyRecord(records.length, "history.select.left", session, history));
  history = advanceRuntimeHistoryV0(historyProgram, session);
  session = history.session;
  records.push(historyRecord(records.length, "history.advance.ending", session, history));
  history = backRuntimeHistoryV0(historyProgram, session);
  session = history.session;
  records.push(historyRecord(records.length, "history.back", session, history));
  history = forwardRuntimeHistoryV0(historyProgram, session);
  session = history.session;
  records.push(historyRecord(records.length, "history.forward", session, history));

  const metaProgress = createMetaProgressV0(historyProgram.projectId, "progress.host.spike11");
  const save = createRuntimeSaveV0(historyProgram, session, { metaProgress });
  const serialized = serializeRuntimeSaveV0(save);
  records.push(historyRecord(records.length, "save.create", session, {
    saveIntegrityDigest: save.integrityDigest,
    metaProgressReferenceId: save.metaProgress.referenceId
  }));
  history = backRuntimeHistoryV0(historyProgram, session);
  session = history.session;
  records.push(historyRecord(records.length, "history.back.before-load", session, history));

  const corrupt = serializeRuntimeSaveV0({ ...save, integrityDigest: "0".repeat(64) });
  const rejected = loadRuntimeSaveV0(historyProgram, session, corrupt);
  records.push(historyRecord(records.length, "save.load.corrupt", rejected.session, {
    effects: rejected.effects,
    cancellations: rejected.cancellations,
    diagnostics: rejected.diagnostics
  }));
  if (rejected.session !== session || rejected.diagnostics[0]?.code !== "VM_SAVE_INTEGRITY") {
    throw new TypeError("Spike 11 corrupt Save did not fail closed");
  }

  const loaded = loadRuntimeSaveV0(historyProgram, session, serialized);
  session = loaded.session;
  records.push(historyRecord(records.length, "save.load.valid", session, {
    effects: loaded.effects,
    cancellations: loaded.cancellations,
    diagnostics: loaded.diagnostics,
    saveIntegrityDigest: save.integrityDigest,
    metaProgressReferenceId: loaded.metaProgressReferenceId
  }));
  history = backRuntimeHistoryV0(historyProgram, session);
  session = history.session;
  records.push(historyRecord(records.length, "history.back.after-load", session, history));
  history = forwardRuntimeHistoryV0(historyProgram, session);
  session = history.session;
  records.push(historyRecord(records.length, "history.forward.after-load", session, history));

  const recordDigests = records.map(digestValue);
  return {
    schemaVersion: 0,
    suiteId: "suite.host.spike11.v0",
    records,
    recordDigests,
    suiteDigest: digestValue(records)
  };
}

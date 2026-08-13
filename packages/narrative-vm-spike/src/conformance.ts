import { canonicalBytes } from "./canonical";
import { effectIntentHashV0 } from "./effect";
import { stateHashV0 } from "./hash";
import { createMetaProgressV0, metaProgressHashV0 } from "./meta-progress";
import { sha256Hex } from "./sha256";
import { createInitialStateV0, transitionV0 } from "./transition";
import type {
  ChoiceSelectedInputV0,
  EffectCompletedInputV0,
  ExternalInputV0,
  InstructionV0,
  MetaProgressV0,
  ProgramV0,
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

import { canonicalBytes } from "./canonical";
import { advanceRuntimeHistoryV0, backRuntimeHistoryV0, createRuntimeSessionV0, forwardRuntimeHistoryV0 } from "./history";
import { createRuntimeSaveV0, loadRuntimeSaveV0, serializeRuntimeSaveV0 } from "./save";
import { sha256Hex } from "./sha256";
import { stateHashV0 } from "./hash";
import { createInitialStateV0, transitionV0 } from "./transition";
import type { ChoiceSelectedInputV0, EffectCancelledInputV0, InstructionV0, ProgramV0, RuntimeStateV0 } from "./types";
import { SPIKE_OPCODE_REGISTRY_DIGEST_V0 } from "./validation";

export const GENERATED_CORPUS_ID_V0 = "corpus.generated.spike12.v0" as const;
export const GENERATED_CORPUS_SEED_COUNT_V0 = 10_000;
export const GENERATED_CORPUS_CHUNK_SIZE_V0 = 250;

export const GENERATED_SCENARIO_IDS_V0 = [
  "nested-condition",
  "call-return",
  "random",
  "effect-cancellation",
  "save-load",
  "choice-back-forward"
] as const;

export type GeneratedScenarioIdV0 = typeof GENERATED_SCENARIO_IDS_V0[number];

export interface GeneratedCorpusFailureV0 {
  readonly seed: number;
  readonly message: string;
}

export interface GeneratedCorpusChunkV0 {
  readonly schemaVersion: 0;
  readonly corpusId: typeof GENERATED_CORPUS_ID_V0;
  readonly seedStart: number;
  readonly seedEndExclusive: number;
  readonly outcomes: readonly string[];
  readonly scenarioCounts: Readonly<Record<GeneratedScenarioIdV0, number>>;
  readonly failedSeeds: readonly GeneratedCorpusFailureV0[];
}

export interface GeneratedCorpusSummaryV0 {
  readonly schemaVersion: 0;
  readonly corpusId: typeof GENERATED_CORPUS_ID_V0;
  readonly seedCount: number;
  readonly replayExecutions: number;
  readonly chunkCount: number;
  readonly scenarioCounts: Readonly<Record<GeneratedScenarioIdV0, number>>;
  readonly failedSeeds: readonly GeneratedCorpusFailureV0[];
  readonly outcomeDigest: string;
}

const none = { stepBoundary: false, effectClass: "none" as const, stopPoint: false };

function program(instructions: readonly InstructionV0[], suffix: string): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.vm1415",
    buildId: `build.${suffix}`,
    entryIp: instructions[0]?.ip ?? 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

function runSimple(target: ProgramV0, executionId: string, prngSeed: number): RuntimeStateV0 {
  let state = createInitialStateV0(target, { executionId, prngSeed });
  for (let count = 0; count < 64 && state.terminal.kind === "running"; count += 1) {
    const result = transitionV0(target, state);
    if (result.diagnostics.length > 0) throw new Error(`simple run failed: ${result.diagnostics[0]?.code}`);
    if (result.request !== null || result.nextState.pendingEffects.length > 0) {
      throw new Error("simple run encountered external input");
    }
    state = result.nextState;
  }
  if (state.terminal.kind !== "ended") throw new Error("simple run did not terminate");
  return state;
}

function conditionalSequence(seed: number): string {
  const target = program([
    { ip: 0, opcode: "set", operands: { variableId: "value", value: seed % 11 }, sourceStatementId: "stmt.condition.set", ...none },
    { ip: 10, opcode: "jumpIf", operands: { condition: { variableId: "value", operator: "gte", value: seed % 7 }, trueIp: 20, falseIp: 30 }, sourceStatementId: "stmt.condition.first", ...none },
    { ip: 20, opcode: "set", operands: { variableId: "route", value: "high" }, sourceStatementId: "stmt.condition.high", ...none },
    { ip: 21, opcode: "jump", operands: { targetIp: 40 }, sourceStatementId: "stmt.condition.high.exit", ...none },
    { ip: 30, opcode: "set", operands: { variableId: "route", value: "low" }, sourceStatementId: "stmt.condition.low", ...none },
    { ip: 40, opcode: "jumpIf", operands: { condition: { variableId: "value", operator: "lte", value: 8 }, trueIp: 50, falseIp: 60 }, sourceStatementId: "stmt.condition.nested", ...none },
    { ip: 50, opcode: "set", operands: { variableId: "band", value: "common" }, sourceStatementId: "stmt.condition.common", ...none },
    { ip: 51, opcode: "jump", operands: { targetIp: 70 }, sourceStatementId: "stmt.condition.common.exit", ...none },
    { ip: 60, opcode: "set", operands: { variableId: "band", value: "rare" }, sourceStatementId: "stmt.condition.rare", ...none },
    { ip: 70, opcode: "end", operands: { endingId: "ending.condition" }, sourceStatementId: "stmt.condition.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], `generated.condition.${seed}`);
  return stateHashV0(runSimple(target, `execution.generated.${seed}`, (seed + 1) >>> 0 || 1));
}

function callSequence(seed: number): string {
  const target = program([
    { ip: 0, opcode: "set", operands: { variableId: "score", value: seed % 13 }, sourceStatementId: "stmt.call.set", ...none },
    { ip: 10, opcode: "call", operands: { targetIp: 40 }, sourceStatementId: "stmt.call", ...none },
    { ip: 20, opcode: "end", operands: { endingId: "ending.call" }, sourceStatementId: "stmt.call.end", stepBoundary: true, effectClass: "none", stopPoint: true },
    { ip: 40, opcode: "add", operands: { variableId: "score", value: (seed % 5) + 1 }, sourceStatementId: "stmt.call.add", ...none },
    { ip: 50, opcode: "return", operands: {}, sourceStatementId: "stmt.call.return", ...none }
  ], `generated.call.${seed}`);
  return stateHashV0(runSimple(target, `execution.generated.${seed}`, (seed + 1) >>> 0 || 1));
}

function randomSequence(seed: number): string {
  const target = program([
    { ip: 0, opcode: "random", operands: { variableId: "first", min: 1, max: (seed % 31) + 2 }, sourceStatementId: "stmt.random.first", ...none },
    { ip: 10, opcode: "random", operands: { variableId: "second", min: -10, max: 10 }, sourceStatementId: "stmt.random.second", ...none },
    { ip: 20, opcode: "end", operands: { endingId: "ending.random" }, sourceStatementId: "stmt.random.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], `generated.random.${seed}`);
  return stateHashV0(runSimple(target, `execution.generated.${seed}`, (seed + 1) >>> 0 || 1));
}

function cancellationSequence(seed: number): string {
  const target = program([
    {
      ip: 0,
      opcode: "emit",
      operands: {
        descriptorId: "descriptor.generated.awaited", requestStepId: null,
        issueStepId: "step.generated.effect.issue", completeStepId: "step.generated.effect.cancelled",
        channel: "visual", kind: "show.generated", payload: { variant: seed % 7 }, policy: "pure",
        awaitMode: "awaited", cancellationScope: "scope.generated.effect", replayKey: `replay.generated.${seed}`,
        compensation: null, barrierReason: null
      },
      sourceStatementId: "stmt.generated.effect", stepBoundary: true, effectClass: "pure", stopPoint: true
    },
    { ip: 10, opcode: "set", operands: { variableId: "cancelled", value: true }, sourceStatementId: "stmt.generated.cancelled", ...none },
    { ip: 20, opcode: "end", operands: { endingId: "ending.cancelled" }, sourceStatementId: "stmt.generated.cancelled.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], `generated.cancel.${seed}`);
  let state = createInitialStateV0(target, { executionId: `execution.generated.${seed}`, prngSeed: (seed + 1) >>> 0 || 1 });
  const issued = transitionV0(target, state);
  const effect = issued.nextState.pendingEffects[0];
  if (effect === undefined || issued.diagnostics.length > 0) throw new Error("awaited Effect was not issued");
  state = issued.nextState;
  const input: EffectCancelledInputV0 = {
    schemaVersion: 0, kind: "effectCancelled", inputId: `input.generated.cancel.${seed}`,
    executionId: effect.executionId, effectId: effect.effectId, expectedRevision: state.stateRevision,
    logicalSequence: effect.logicalSequence, cancellationScope: effect.cancellationScope
  };
  const cancelled = transitionV0(target, state, input);
  if (cancelled.diagnostics.length > 0) throw new Error(`Effect cancellation failed: ${cancelled.diagnostics[0]?.code}`);
  state = cancelled.nextState;
  while (state.terminal.kind === "running") {
    const result = transitionV0(target, state);
    if (result.diagnostics.length > 0) throw new Error(`post-cancel run failed: ${result.diagnostics[0]?.code}`);
    state = result.nextState;
  }
  return stateHashV0(state);
}

function saveSequence(seed: number): string {
  const target = program([
    { ip: 0, opcode: "set", operands: { variableId: "saved", value: seed % 101 }, sourceStatementId: "stmt.save.set", ...none },
    { ip: 10, opcode: "checkpoint", operands: { stepId: "step.save.generated" }, sourceStatementId: "stmt.save.checkpoint", stepBoundary: true, effectClass: "none", stopPoint: false },
    { ip: 20, opcode: "end", operands: { endingId: "ending.save" }, sourceStatementId: "stmt.save.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], `generated.save.${seed}`);
  const savedRoot = createRuntimeSessionV0(target, createInitialStateV0(target, {
    executionId: `execution.generated.saved.${seed}`, prngSeed: (seed + 1) >>> 0 || 1
  }));
  const saved = advanceRuntimeHistoryV0(target, savedRoot).session;
  const current = createRuntimeSessionV0(target, createInitialStateV0(target, {
    executionId: `execution.generated.current.${seed}`, prngSeed: (seed + 2) >>> 0 || 1
  }));
  const loaded = loadRuntimeSaveV0(target, current, serializeRuntimeSaveV0(createRuntimeSaveV0(target, saved)));
  if (loaded.diagnostics.length > 0 || stateHashV0(loaded.session.state) !== stateHashV0(saved.state)) {
    throw new Error(`Save/Load property failed: ${loaded.diagnostics[0]?.code ?? "hash"}`);
  }
  return stateHashV0(loaded.session.state);
}

function branchSequence(seed: number): string {
  const target = program([
    {
      ip: 0, opcode: "choice",
      operands: { choiceId: "choice.generated", promptStepId: "step.generated.prompt", commitStepId: "step.generated.commit", options: [{ optionId: "left", targetIp: 10 }, { optionId: "right", targetIp: 30 }] },
      sourceStatementId: "stmt.generated.choice", stepBoundary: true, effectClass: "none", stopPoint: true
    },
    { ip: 10, opcode: "set", operands: { variableId: "route", value: "left" }, sourceStatementId: "stmt.generated.left", ...none },
    { ip: 20, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.generated.left.exit", ...none },
    { ip: 30, opcode: "set", operands: { variableId: "route", value: "right" }, sourceStatementId: "stmt.generated.right", ...none },
    { ip: 40, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.generated.right.exit", ...none },
    { ip: 50, opcode: "end", operands: { endingId: "ending.branch" }, sourceStatementId: "stmt.generated.branch.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], `generated.branch.${seed}`);
  const root = createRuntimeSessionV0(target, createInitialStateV0(target, {
    executionId: `execution.generated.${seed}`, prngSeed: (seed + 1) >>> 0 || 1
  }));
  const waiting = advanceRuntimeHistoryV0(target, root).session;
  const request = waiting.state.pendingRequests[0];
  if (request?.kind !== "choice") throw new Error("generated Choice request missing");
  const input: ChoiceSelectedInputV0 = {
    schemaVersion: 0, kind: "choiceSelected", inputId: `input.generated.choice.${seed}`,
    executionId: request.executionId, requestId: request.requestId, expectedRevision: request.expectedRevision,
    logicalSequence: request.logicalSequence, choiceId: request.choiceId, optionId: seed % 2 === 0 ? "left" : "right"
  };
  const committed = advanceRuntimeHistoryV0(target, waiting, input).session;
  const committedHash = stateHashV0(committed.state);
  const backed = backRuntimeHistoryV0(target, committed);
  const forwarded = forwardRuntimeHistoryV0(target, backed.session);
  if (backed.diagnostics.length > 0 || forwarded.diagnostics.length > 0 ||
      stateHashV0(forwarded.session.state) !== committedHash) {
    throw new Error(`Back/Forward property failed: ${backed.diagnostics[0]?.code ?? forwarded.diagnostics[0]?.code ?? "hash"}`);
  }
  return committedHash;
}

const SCENARIOS: Readonly<Record<GeneratedScenarioIdV0, (seed: number) => string>> = {
  "nested-condition": conditionalSequence,
  "call-return": callSequence,
  random: randomSequence,
  "effect-cancellation": cancellationSequence,
  "save-load": saveSequence,
  "choice-back-forward": branchSequence
};

function emptyCounts(): Record<GeneratedScenarioIdV0, number> {
  return Object.fromEntries(GENERATED_SCENARIO_IDS_V0.map((id) => [id, 0])) as Record<GeneratedScenarioIdV0, number>;
}

function assertSeedRange(seedStart: number, seedEndExclusive: number): void {
  if (!Number.isSafeInteger(seedStart) || !Number.isSafeInteger(seedEndExclusive) ||
      seedStart < 0 || seedEndExclusive <= seedStart || seedEndExclusive > GENERATED_CORPUS_SEED_COUNT_V0 ||
      seedEndExclusive - seedStart > GENERATED_CORPUS_CHUNK_SIZE_V0) {
    throw new RangeError("Generated corpus chunk range is invalid or exceeds the frozen bound");
  }
}

export function executeGeneratedCorpusChunkV0(seedStart: number, seedEndExclusive: number): GeneratedCorpusChunkV0 {
  assertSeedRange(seedStart, seedEndExclusive);
  const outcomes: string[] = [];
  const failedSeeds: GeneratedCorpusFailureV0[] = [];
  const scenarioCounts = emptyCounts();
  for (let seed = seedStart; seed < seedEndExclusive; seed += 1) {
    const scenarioId = GENERATED_SCENARIO_IDS_V0[seed % GENERATED_SCENARIO_IDS_V0.length];
    if (scenarioId === undefined) throw new TypeError(`No generated scenario for seed ${seed}`);
    scenarioCounts[scenarioId] += 1;
    try {
      const first = SCENARIOS[scenarioId](seed);
      const replay = SCENARIOS[scenarioId](seed);
      if (replay !== first) throw new Error("replay hash differs");
      outcomes.push(first);
    } catch (error) {
      failedSeeds.push({ seed, message: error instanceof Error ? error.message : String(error) });
      outcomes.push("FAILED");
    }
  }
  return { schemaVersion: 0, corpusId: GENERATED_CORPUS_ID_V0, seedStart, seedEndExclusive, outcomes, scenarioCounts, failedSeeds };
}

export function summarizeGeneratedCorpusV0(chunks: readonly GeneratedCorpusChunkV0[]): GeneratedCorpusSummaryV0 {
  if (chunks.length === 0) throw new TypeError("Generated corpus requires at least one chunk");
  const outcomes: string[] = [];
  const failedSeeds: GeneratedCorpusFailureV0[] = [];
  const scenarioCounts = emptyCounts();
  let expectedStart = 0;
  for (const chunk of chunks) {
    if (chunk.schemaVersion !== 0 || chunk.corpusId !== GENERATED_CORPUS_ID_V0 || chunk.seedStart !== expectedStart ||
        chunk.seedEndExclusive <= chunk.seedStart || chunk.outcomes.length !== chunk.seedEndExclusive - chunk.seedStart) {
      throw new TypeError("Generated corpus chunks are non-contiguous or invalid");
    }
    outcomes.push(...chunk.outcomes);
    failedSeeds.push(...chunk.failedSeeds);
    for (const id of GENERATED_SCENARIO_IDS_V0) scenarioCounts[id] += chunk.scenarioCounts[id];
    expectedStart = chunk.seedEndExclusive;
  }
  if (expectedStart !== GENERATED_CORPUS_SEED_COUNT_V0) {
    throw new TypeError("Generated corpus chunks do not cover the frozen seed range");
  }
  return {
    schemaVersion: 0,
    corpusId: GENERATED_CORPUS_ID_V0,
    seedCount: outcomes.length,
    replayExecutions: outcomes.length * 2,
    chunkCount: chunks.length,
    scenarioCounts,
    failedSeeds,
    outcomeDigest: sha256Hex(canonicalBytes(outcomes))
  };
}

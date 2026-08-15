import { canonicalRuntimeBytes } from "./canonical";
import { runtimeHistorySessionHashV1, runtimeStateHashV1 } from "./hash";
import { advanceRuntimeHistoryV1, backRuntimeHistoryV1, createRuntimeHistorySessionV1, forwardRuntimeHistoryV1 } from "./history";
import { createRuntimeState, drawRuntimeRandom, runRuntime } from "./runtime";
import { createRuntimeSaveV1, loadRuntimeSaveV1 } from "./save";
import { createRuntimeSchedulerSessionV1, scheduleRuntimeBatchV1 } from "./scheduler";
import { sha256Hex } from "./sha256";
import type {
  RuntimeChoiceInputV1,
  RuntimeEffectCancelledInputV1,
  RuntimeProgramV1,
  RuntimeSchedulePolicyV1,
  RuntimeSchedulerSessionV1,
  RuntimeStateV1
} from "./types";

export const RUNTIME_GENERATED_CORPUS_ID_V1 = "corpus.generated.runtime.v1" as const;
export const RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1 = 10_000;
export const RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1 = 250;

export const RUNTIME_GENERATED_SCENARIO_IDS_V1 = [
  "control-flow",
  "random",
  "effect-cancellation",
  "save-load",
  "choice-history",
  "scheduler-equivalence",
  "diagnostic-rollback"
] as const;

export type RuntimeGeneratedScenarioIdV1 = typeof RUNTIME_GENERATED_SCENARIO_IDS_V1[number];

export interface RuntimeGeneratedCorpusFailureV1 {
  readonly seed: number;
  readonly scenarioId: RuntimeGeneratedScenarioIdV1;
  readonly message: string;
}

export interface RuntimeGeneratedCorpusChunkV1 {
  readonly schemaVersion: 1;
  readonly corpusId: typeof RUNTIME_GENERATED_CORPUS_ID_V1;
  readonly seedStart: number;
  readonly seedEndExclusive: number;
  readonly outcomes: readonly string[];
  readonly scenarioCounts: Readonly<Record<RuntimeGeneratedScenarioIdV1, number>>;
  readonly failedSeeds: readonly RuntimeGeneratedCorpusFailureV1[];
}

export interface RuntimeGeneratedCorpusSummaryV1 {
  readonly schemaVersion: 1;
  readonly corpusId: typeof RUNTIME_GENERATED_CORPUS_ID_V1;
  readonly seedCount: number;
  readonly replayExecutions: number;
  readonly chunkCount: number;
  readonly scenarioCounts: Readonly<Record<RuntimeGeneratedScenarioIdV1, number>>;
  readonly failedSeeds: readonly RuntimeGeneratedCorpusFailureV1[];
  readonly outcomeDigest: string;
}

function program(projectId: string, scenes: RuntimeProgramV1["scenes"], entrySceneId = "main"): RuntimeProgramV1 {
  return { schemaVersion: 1, irVersion: "1.0.0", projectId, entrySceneId, scenes };
}

function create(target: RuntimeProgramV1, seed: number, variables: Readonly<Record<string, boolean | number | string | null>> = {}): RuntimeStateV1 {
  const result = createRuntimeState(target, {
    buildId: `build.corpus.${seed}`,
    executionId: `execution.corpus.${seed}`,
    initialVariables: variables,
    prngSeed: (seed + 1) >>> 0 || 1,
    progressScopeId: "progress.corpus"
  });
  if (!result.ok) throw new Error(`State creation failed: ${result.diagnostics[0]?.code ?? "unknown"}`);
  return result.state;
}

function outcome(value: unknown): string {
  return sha256Hex(canonicalRuntimeBytes(value));
}

function runToEnd(target: RuntimeProgramV1, initialState: RuntimeStateV1): RuntimeStateV1 {
  let state = initialState;
  for (let step = 0; step < 64 && state.terminal.kind === "running"; step += 1) {
    const result = runRuntime(target, state);
    if (result.diagnostics.length > 0) throw new Error(`Execution failed: ${result.diagnostics[0]?.code ?? "unknown"}`);
    if (result.state.pendingChoice !== null || result.state.pendingEffect !== null || result.state.pendingBarrier !== null) {
      throw new Error("Simple execution reached an external boundary");
    }
    state = result.state;
  }
  if (state.terminal.kind !== "ended") throw new Error("Execution did not terminate within the frozen step guard");
  return state;
}

function controlFlowScenario(seed: number): string {
  const target = program("runtime-corpus-control", [{ sceneId: "main", instructions: [
    { instructionId: "control-set", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "literal", value: seed % 17 } } },
    { instructionId: "control-condition", opcode: "condition", operands: { targetLabel: "high", expressionAst: { kind: "binary", operator: ">=", left: { kind: "identifier", name: "score" }, right: { kind: "literal", value: 8 } } } },
    { instructionId: "control-low", opcode: "set", operands: { variableId: "route", expressionAst: { kind: "literal", value: "low" } } },
    { instructionId: "control-low-exit", opcode: "jump", operands: { targetLabel: "after" } },
    { instructionId: "control-high-label", opcode: "label", operands: { name: "high" } },
    { instructionId: "control-high", opcode: "set", operands: { variableId: "route", expressionAst: { kind: "literal", value: "high" } } },
    { instructionId: "control-after", opcode: "label", operands: { name: "after" } },
    { instructionId: "control-call", opcode: "call", operands: { targetLabel: "sub" } },
    { instructionId: "control-wait", opcode: "wait", operands: { durationMilliseconds: seed % 101 } },
    { instructionId: "control-end", opcode: "end", operands: { endingId: "control_done", name: "Done" } },
    { instructionId: "control-sub", opcode: "label", operands: { name: "sub" } },
    { instructionId: "control-bonus", opcode: "set", operands: { variableId: "bonus", expressionAst: { kind: "literal", value: seed % 5 } } },
    { instructionId: "control-return", opcode: "return", operands: {} }
  ] }]);
  return outcome({ stateHash: runtimeStateHashV1(runToEnd(target, create(target, seed, { score: 0, route: "", bonus: 0 }))) });
}

function randomScenario(seed: number): string {
  const target = program("runtime-corpus-random", [{ sceneId: "main", instructions: [
    { instructionId: "random-end", opcode: "end", operands: { endingId: "random_done", name: "Done" } }
  ] }]);
  const initial = create(target, seed);
  const first = drawRuntimeRandom(initial, { expectedStateRevision: 0, minimum: -20, maximum: 20 + (seed % 31) });
  if (!first.ok) throw new Error(`First random draw failed: ${first.diagnostics[0]?.code ?? "unknown"}`);
  const second = drawRuntimeRandom(first.state, { expectedStateRevision: 1, minimum: 0, maximum: 1_000 });
  if (!second.ok) throw new Error(`Second random draw failed: ${second.diagnostics[0]?.code ?? "unknown"}`);
  return outcome({ first: first.value, second: second.value, stateHash: runtimeStateHashV1(runToEnd(target, second.state)) });
}

function effectCancellationScenario(seed: number): string {
  const target = program("runtime-corpus-effect", [{ sceneId: "main", instructions: [
    { instructionId: "effect-direction", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: `bg_${seed % 7}`, awaitMode: "awaited", replayKey: `replay.corpus.${seed}`, cancellationScope: "scope.corpus.effect" } } },
    { instructionId: "effect-end", opcode: "end", operands: { endingId: "effect_done", name: "Done" } }
  ] }]);
  const issued = runRuntime(target, create(target, seed));
  const effect = issued.state.pendingEffect;
  if (issued.diagnostics.length > 0 || effect === null) throw new Error("Awaited Effect was not issued");
  const input: RuntimeEffectCancelledInputV1 = {
    schemaVersion: 1,
    kind: "effectCancelled",
    inputId: `input.corpus.cancel.${seed}`,
    executionId: issued.state.executionId,
    expectedStateRevision: issued.state.stateRevision,
    logicalSequence: effect.logicalSequence,
    effectId: effect.effectId,
    cancellationScope: effect.cancellationScope
  };
  const cancelled = runRuntime(target, issued.state, { input });
  if (cancelled.diagnostics.length > 0 || cancelled.state.terminal.kind !== "ended") throw new Error(`Effect cancellation failed: ${cancelled.diagnostics[0]?.code ?? "terminal"}`);
  return outcome({ effectId: effect.effectId, stateHash: runtimeStateHashV1(cancelled.state) });
}

function saveLoadScenario(seed: number): string {
  const target = program("runtime-corpus-save", [{ sceneId: "main", instructions: [
    { instructionId: "save-line", opcode: "narration", operands: { textId: `save_text_${seed}`, text: `Seed ${seed}` } },
    { instructionId: "save-end", opcode: "end", operands: { endingId: "save_done", name: "Done" } }
  ] }]);
  const boundary = runRuntime(target, create(target, seed));
  if (boundary.diagnostics.length > 0 || boundary.event?.kind !== "narration") throw new Error("Save boundary was not reached");
  const saved = createRuntimeSaveV1(target, boundary.state);
  if (!saved.ok) throw new Error(`Save creation failed: ${saved.diagnostics[0]?.code ?? "unknown"}`);
  const loaded = loadRuntimeSaveV1(target, saved.serialized, { expectedBuildId: boundary.state.buildId });
  if (!loaded.ok || runtimeStateHashV1(loaded.state) !== runtimeStateHashV1(boundary.state)) throw new Error("Save/Load State hash differs");
  return outcome({ artifactHash: saved.artifactHash, stateHash: runtimeStateHashV1(runToEnd(target, loaded.state)) });
}

function choiceHistoryScenario(seed: number): string {
  const target = program("runtime-corpus-history", [
    { sceneId: "main", instructions: [{ instructionId: "history-choice", opcode: "choice", operands: { prompt: "Route", options: [
      { optionId: "left", label: "Left", targetSceneId: "left" },
      { optionId: "right", label: "Right", targetSceneId: "right" }
    ] } }] },
    { sceneId: "left", instructions: [
      { instructionId: "history-left", opcode: "narration", operands: { textId: "history_left", text: "Left" } },
      { instructionId: "history-left-end", opcode: "end", operands: { endingId: "history_left_done", name: "Left" } }
    ] },
    { sceneId: "right", instructions: [
      { instructionId: "history-right", opcode: "narration", operands: { textId: "history_right", text: "Right" } },
      { instructionId: "history-right-end", opcode: "end", operands: { endingId: "history_right_done", name: "Right" } }
    ] }
  ]);
  const initial = createRuntimeHistorySessionV1(target, create(target, seed));
  if (initial.diagnostics.length > 0) throw new Error("History creation failed");
  const waiting = advanceRuntimeHistoryV1(target, initial.session);
  const pending = waiting.state.pendingChoice;
  if (pending === null) throw new Error("Choice request is missing");
  const input: RuntimeChoiceInputV1 = {
    schemaVersion: 1,
    kind: "choiceSelected",
    inputId: `input.corpus.choice.${seed}`,
    executionId: waiting.state.executionId,
    expectedStateRevision: waiting.state.stateRevision,
    logicalSequence: pending.logicalSequence,
    requestId: pending.requestId,
    instructionId: pending.instructionId,
    optionId: seed % 2 === 0 ? "left" : "right"
  };
  const committed = advanceRuntimeHistoryV1(target, waiting.session, { input });
  const committedHash = runtimeStateHashV1(committed.state);
  const backed = backRuntimeHistoryV1(target, committed.session);
  const forwarded = forwardRuntimeHistoryV1(target, backed.session);
  if (committed.diagnostics.length > 0 || backed.diagnostics.length > 0 || forwarded.diagnostics.length > 0 || runtimeStateHashV1(forwarded.state) !== committedHash) {
    throw new Error("History Back/Forward equality failed");
  }
  return outcome({ historyHash: runtimeHistorySessionHashV1(forwarded.session), stateHash: committedHash });
}

function schedulerEquivalenceScenario(seed: number): string {
  const target = program("runtime-corpus-scheduler", [{ sceneId: "main", instructions: [
    { instructionId: "scheduler-set", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "literal", value: seed % 101 } } },
    { instructionId: "scheduler-line", opcode: "narration", operands: { textId: `scheduler_text_${seed}`, text: `Scheduler ${seed}` } },
    { instructionId: "scheduler-add", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "binary", operator: "+", left: { kind: "identifier", name: "score" }, right: { kind: "literal", value: 1 } } } },
    { instructionId: "scheduler-end", opcode: "end", operands: { endingId: "scheduler_done", name: "Done" } }
  ] }]);
  const history = createRuntimeHistorySessionV1(target, create(target, seed, { score: 0 }));
  const scheduler = createRuntimeSchedulerSessionV1(target, history.session);
  if (!scheduler.ok) throw new Error("Scheduler creation failed");
  const base: RuntimeSchedulePolicyV1 = { schemaVersion: 1, mode: "normal", skipActivation: null, speed: "normal", stopInstructionIds: [], unavailableEffectDescriptorIds: [], instantInstructionBudget: 256, autoTiming: { baseDelayMilliseconds: 0, millisecondsPerReadableUnit: 0, readableUnits: 0, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 0 } };
  const run = (policy: RuntimeSchedulePolicyV1): RuntimeSchedulerSessionV1 => {
    let session = scheduler.session;
    for (let batch = 0; batch < 16 && session.workingState.terminal.kind === "running"; batch += 1) {
      const result = scheduleRuntimeBatchV1(target, session, policy);
      if (result.diagnostics.length > 0 || result.executedInstructions === 0) throw new Error(`Scheduler failed: ${result.diagnostics[0]?.code ?? "stalled"}`);
      session = result.session;
    }
    if (session.workingState.terminal.kind !== "ended") throw new Error("Scheduler did not terminate");
    return session;
  };
  const normal = run(base);
  const instant = run({ ...base, mode: "skipAll", skipActivation: "toggle", speed: "instant", instantInstructionBudget: (seed % 4) + 1 });
  const normalStateHash = runtimeStateHashV1(normal.workingState);
  const instantStateHash = runtimeStateHashV1(instant.workingState);
  const normalHistoryHash = runtimeHistorySessionHashV1(normal.history);
  const instantHistoryHash = runtimeHistorySessionHashV1(instant.history);
  if (normalStateHash !== instantStateHash || normalHistoryHash !== instantHistoryHash) throw new Error("Normal/Instant Scheduler outcome differs");
  return outcome({ historyHash: normalHistoryHash, stateHash: normalStateHash });
}

function diagnosticRollbackScenario(seed: number): string {
  const target = program("runtime-corpus-diagnostic", [{ sceneId: "main", instructions: [
    { instructionId: "diagnostic-set", opcode: "set", operands: { variableId: "missing", expressionAst: { kind: "literal", value: seed } } },
    { instructionId: "diagnostic-end", opcode: "end", operands: { endingId: "diagnostic_done", name: "Done" } }
  ] }]);
  const initial = create(target, seed);
  const initialHash = runtimeStateHashV1(initial);
  const result = runRuntime(target, initial);
  if (result.diagnostics[0]?.code !== "RUNTIME_VARIABLE_MISSING" || result.state !== initial || runtimeStateHashV1(result.state) !== initialHash) {
    throw new Error("Diagnostic did not fail closed without State mutation");
  }
  return outcome({ code: result.diagnostics[0].code, stateHash: initialHash });
}

const SCENARIOS: Readonly<Record<RuntimeGeneratedScenarioIdV1, (seed: number) => string>> = {
  "control-flow": controlFlowScenario,
  random: randomScenario,
  "effect-cancellation": effectCancellationScenario,
  "save-load": saveLoadScenario,
  "choice-history": choiceHistoryScenario,
  "scheduler-equivalence": schedulerEquivalenceScenario,
  "diagnostic-rollback": diagnosticRollbackScenario
};

function emptyCounts(): Record<RuntimeGeneratedScenarioIdV1, number> {
  return Object.fromEntries(RUNTIME_GENERATED_SCENARIO_IDS_V1.map((id) => [id, 0])) as Record<RuntimeGeneratedScenarioIdV1, number>;
}

function expectedCounts(seedStart: number, seedEndExclusive: number): Record<RuntimeGeneratedScenarioIdV1, number> {
  const counts = emptyCounts();
  for (let seed = seedStart; seed < seedEndExclusive; seed += 1) {
    const scenarioId = RUNTIME_GENERATED_SCENARIO_IDS_V1[seed % RUNTIME_GENERATED_SCENARIO_IDS_V1.length];
    if (scenarioId === undefined) throw new TypeError(`No Runtime generated scenario for seed ${seed}`);
    counts[scenarioId] += 1;
  }
  return counts;
}

function validChunk(chunk: RuntimeGeneratedCorpusChunkV1, expectedStart: number): boolean {
  if (chunk.schemaVersion !== 1 || chunk.corpusId !== RUNTIME_GENERATED_CORPUS_ID_V1 || chunk.seedStart !== expectedStart ||
      !Number.isSafeInteger(chunk.seedEndExclusive) || chunk.seedEndExclusive <= chunk.seedStart ||
      chunk.seedEndExclusive - chunk.seedStart > RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1 ||
      chunk.seedEndExclusive > RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1 ||
      chunk.outcomes.length !== chunk.seedEndExclusive - chunk.seedStart) return false;
  const countKeys = Object.keys(chunk.scenarioCounts).sort();
  const expectedKeys = [...RUNTIME_GENERATED_SCENARIO_IDS_V1].sort();
  if (countKeys.length !== expectedKeys.length || countKeys.some((key, index) => key !== expectedKeys[index])) return false;
  const counts = expectedCounts(chunk.seedStart, chunk.seedEndExclusive);
  if (RUNTIME_GENERATED_SCENARIO_IDS_V1.some((id) => chunk.scenarioCounts[id] !== counts[id])) return false;
  const failureBySeed = new Map<number, RuntimeGeneratedCorpusFailureV1>();
  for (const failure of chunk.failedSeeds) {
    const expectedScenario = RUNTIME_GENERATED_SCENARIO_IDS_V1[failure.seed % RUNTIME_GENERATED_SCENARIO_IDS_V1.length];
    if (!Number.isSafeInteger(failure.seed) || failure.seed < chunk.seedStart || failure.seed >= chunk.seedEndExclusive ||
        failure.scenarioId !== expectedScenario || failure.message.length === 0 || failureBySeed.has(failure.seed)) return false;
    failureBySeed.set(failure.seed, failure);
  }
  return chunk.outcomes.every((item, offset) => {
    const failed = failureBySeed.has(chunk.seedStart + offset);
    return failed ? item === "FAILED" : /^[0-9a-f]{64}$/u.test(item);
  }) && chunk.outcomes.filter((item) => item === "FAILED").length === chunk.failedSeeds.length;
}

function assertSeedRange(seedStart: number, seedEndExclusive: number): void {
  if (!Number.isSafeInteger(seedStart) || !Number.isSafeInteger(seedEndExclusive) || seedStart < 0 || seedEndExclusive <= seedStart ||
      seedEndExclusive > RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1 || seedEndExclusive - seedStart > RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1) {
    throw new RangeError("Runtime generated corpus chunk range is invalid or exceeds the frozen bound");
  }
}

export function executeRuntimeGeneratedCorpusChunkV1(seedStart: number, seedEndExclusive: number): RuntimeGeneratedCorpusChunkV1 {
  assertSeedRange(seedStart, seedEndExclusive);
  const outcomes: string[] = [];
  const failedSeeds: RuntimeGeneratedCorpusFailureV1[] = [];
  const scenarioCounts = emptyCounts();
  for (let seed = seedStart; seed < seedEndExclusive; seed += 1) {
    const scenarioId = RUNTIME_GENERATED_SCENARIO_IDS_V1[seed % RUNTIME_GENERATED_SCENARIO_IDS_V1.length];
    if (scenarioId === undefined) throw new TypeError(`No Runtime generated scenario for seed ${seed}`);
    scenarioCounts[scenarioId] += 1;
    try {
      const first = SCENARIOS[scenarioId](seed);
      const replay = SCENARIOS[scenarioId](seed);
      if (replay !== first) throw new Error("Replay outcome hash differs");
      outcomes.push(first);
    } catch (error) {
      failedSeeds.push({ seed, scenarioId, message: error instanceof Error ? error.message : String(error) });
      outcomes.push("FAILED");
    }
  }
  return { schemaVersion: 1, corpusId: RUNTIME_GENERATED_CORPUS_ID_V1, seedStart, seedEndExclusive, outcomes, scenarioCounts, failedSeeds };
}

export function summarizeRuntimeGeneratedCorpusV1(chunks: readonly RuntimeGeneratedCorpusChunkV1[]): RuntimeGeneratedCorpusSummaryV1 {
  if (chunks.length === 0) throw new TypeError("Runtime generated corpus requires at least one chunk");
  const outcomes: string[] = [];
  const failedSeeds: RuntimeGeneratedCorpusFailureV1[] = [];
  const scenarioCounts = emptyCounts();
  let expectedStart = 0;
  for (const chunk of chunks) {
    if (!validChunk(chunk, expectedStart)) {
      throw new TypeError("Runtime generated corpus chunks are non-contiguous or invalid");
    }
    outcomes.push(...chunk.outcomes);
    failedSeeds.push(...chunk.failedSeeds);
    for (const id of RUNTIME_GENERATED_SCENARIO_IDS_V1) scenarioCounts[id] += chunk.scenarioCounts[id];
    expectedStart = chunk.seedEndExclusive;
  }
  if (expectedStart !== RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1) throw new TypeError("Runtime generated corpus chunks do not cover the frozen seed range");
  return {
    schemaVersion: 1,
    corpusId: RUNTIME_GENERATED_CORPUS_ID_V1,
    seedCount: outcomes.length,
    replayExecutions: outcomes.length * 2,
    chunkCount: chunks.length,
    scenarioCounts,
    failedSeeds,
    outcomeDigest: sha256Hex(canonicalRuntimeBytes(outcomes))
  };
}

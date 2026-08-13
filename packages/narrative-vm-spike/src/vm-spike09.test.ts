import { describe, expect, it } from "vitest";
import {
  GENERATED_CORPUS_CHUNK_SIZE_V0,
  GENERATED_CORPUS_SEED_COUNT_V0,
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  createInitialStateV0,
  executeGeneratedCorpusChunkV0,
  scheduleRuntimeBatchV0,
  stateHashV0,
  storyOutcomeHashV0,
  summarizeGeneratedCorpusV0,
  transitionV0,
  type EffectIntentV0,
  type InstructionV0,
  type ProgramV0,
  type RuntimeSchedulePolicyV0,
  type RuntimeStateV0
} from "./index";

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

function runSimple(target: ProgramV0, executionId: string, prngSeed: number): {
  readonly state: RuntimeStateV0;
  readonly effects: readonly EffectIntentV0[];
} {
  let state = createInitialStateV0(target, { executionId, prngSeed });
  const effects: EffectIntentV0[] = [];
  for (let count = 0; count < 64 && state.terminal.kind === "running"; count += 1) {
    const result = transitionV0(target, state);
    if (result.diagnostics.length > 0) throw new Error(`simple run failed: ${result.diagnostics[0]?.code}`);
    if (result.request !== null || result.nextState.pendingEffects.length > 0) {
      throw new Error("simple run encountered external input");
    }
    effects.push(...result.effects);
    state = result.nextState;
  }
  if (state.terminal.kind !== "ended") throw new Error("simple run did not terminate");
  return { state, effects };
}

function skipPolicy(budget: number): RuntimeSchedulePolicyV0 {
  return {
    schemaVersion: 0,
    mode: "skipAll",
    skipActivation: "toggle",
    speed: "instant",
    readStepIds: [],
    unavailableEffectDescriptorIds: [],
    instantInstructionBudget: budget,
    autoTiming: { baseDelayTicks: 0, ticksPerReadableUnit: 0, voiceDurationTicks: 0, voiceTailTicks: 0, readableUnits: 0 }
  };
}

function runTenThousandLoop(executionId: string): {
  readonly state: RuntimeStateV0;
  readonly batches: number;
  readonly maximumBatch: number;
} {
  const loop = program([
    { ip: 0, opcode: "set", operands: { variableId: "counter", value: 0 }, sourceStatementId: "stmt.loop.init", ...none },
    { ip: 10, opcode: "add", operands: { variableId: "counter", value: 1 }, sourceStatementId: "stmt.loop.add", ...none },
    { ip: 20, opcode: "jumpIf", operands: { condition: { variableId: "counter", operator: "lt", value: 10_000 }, trueIp: 10, falseIp: 30 }, sourceStatementId: "stmt.loop.condition", ...none },
    { ip: 30, opcode: "end", operands: { endingId: "ending.loop.complete" }, sourceStatementId: "stmt.loop.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], "vm14.loop");
  let state = createInitialStateV0(loop, { executionId, prngSeed: 1 });
  let batches = 0;
  let maximumBatch = 0;
  while (state.terminal.kind === "running" && batches < 1000) {
    const result = scheduleRuntimeBatchV0(loop, state, skipPolicy(128));
    if (result.diagnostics.length > 0) throw new Error(`VM-14 batch failed: ${result.diagnostics[0]?.code}`);
    if (result.executedInstructions > 128) throw new Error("VM-14 exceeded the frozen batch budget");
    maximumBatch = Math.max(maximumBatch, result.executedInstructions);
    state = result.nextState;
    batches += 1;
  }
  if (state.terminal.kind !== "ended") throw new Error("VM-14 loop did not terminate within the batch guard");
  return { state, batches, maximumBatch };
}

describe("CL-04 narrative VM kernel spike 09/12", () => {
  it("executes VM-14 10k loop with bounded batches and a stable final State hash", () => {
    const first = runTenThousandLoop("execution.vm14.loop");
    const second = runTenThousandLoop("execution.vm14.loop");
    expect(first.state.variables.counter).toBe(10_000);
    expect(first.state.stateRevision).toBe(20_002);
    expect(first.batches).toBeGreaterThan(1);
    expect(first.maximumBatch).toBe(128);
    expect(stateHashV0(second.state)).toBe(stateHashV0(first.state));
    expect(stateHashV0(first.state)).toBe("273dde1820c0d67dad879061e5a505b3c8af8582a59ece686eac84082bc5dc84");
  });

  it("executes the portable 10,000-seed corpus in frozen chunks with replay equality", () => {
    const chunks = [];
    for (let start = 0; start < GENERATED_CORPUS_SEED_COUNT_V0; start += GENERATED_CORPUS_CHUNK_SIZE_V0) {
      chunks.push(executeGeneratedCorpusChunkV0(start, Math.min(start + GENERATED_CORPUS_CHUNK_SIZE_V0, GENERATED_CORPUS_SEED_COUNT_V0)));
    }
    const summary = summarizeGeneratedCorpusV0(chunks);
    expect(summary).toEqual({
      schemaVersion: 0,
      corpusId: "corpus.generated.spike12.v0",
      seedCount: 10_000,
      replayExecutions: 20_000,
      chunkCount: 40,
      scenarioCounts: {
        "nested-condition": 1667,
        "call-return": 1667,
        random: 1667,
        "effect-cancellation": 1667,
        "save-load": 1666,
        "choice-back-forward": 1666
      },
      failedSeeds: [],
      outcomeDigest: "770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048"
    });
  }, 90_000);

  it("rejects an unbounded chunk and an incomplete corpus summary", () => {
    expect(() => executeGeneratedCorpusChunkV0(0, GENERATED_CORPUS_CHUNK_SIZE_V0 + 1)).toThrow("frozen bound");
    expect(() => summarizeGeneratedCorpusV0([executeGeneratedCorpusChunkV0(0, 1)])).toThrow("frozen seed range");
  });

  it("executes VM-15 pure presentation insertion without changing Story Outcome Hash", () => {
    const base = program([
      { ip: 0, opcode: "set", operands: { variableId: "route", value: "same" }, sourceStatementId: "stmt.outcome.set", ...none },
      { ip: 10, opcode: "checkpoint", operands: { stepId: "step.outcome" }, sourceStatementId: "stmt.outcome.checkpoint", stepBoundary: true, effectClass: "none", stopPoint: false },
      { ip: 20, opcode: "end", operands: { endingId: "ending.outcome" }, sourceStatementId: "stmt.outcome.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ], "vm15.base");
    const withPresentation = program([
      { ip: 0, opcode: "set", operands: { variableId: "route", value: "same" }, sourceStatementId: "stmt.outcome.set", ...none },
      {
        ip: 10, opcode: "emit",
        operands: {
          descriptorId: "descriptor.presentation.only", requestStepId: null,
          issueStepId: "step.presentation.issue", completeStepId: "step.presentation.complete",
          channel: "visual", kind: "presentation.sparkle", payload: { color: "violet" }, policy: "pure",
          awaitMode: "detached", cancellationScope: "scope.presentation", replayKey: "replay.presentation.only",
          compensation: null, barrierReason: null
        },
        sourceStatementId: "stmt.presentation.only", stepBoundary: true, effectClass: "pure", stopPoint: false
      },
      { ip: 20, opcode: "checkpoint", operands: { stepId: "step.outcome" }, sourceStatementId: "stmt.outcome.checkpoint", stepBoundary: true, effectClass: "none", stopPoint: false },
      { ip: 30, opcode: "end", operands: { endingId: "ending.outcome" }, sourceStatementId: "stmt.outcome.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ], "vm15.presentation");
    const baseResult = runSimple(base, "execution.vm15", 1);
    const presentationResult = runSimple(withPresentation, "execution.vm15", 1);
    expect(presentationResult.effects).toHaveLength(1);
    expect(stateHashV0(presentationResult.state)).not.toBe(stateHashV0(baseResult.state));
    expect(storyOutcomeHashV0(presentationResult.state)).toBe(storyOutcomeHashV0(baseResult.state));
    expect(storyOutcomeHashV0(baseResult.state)).toBe("34bcf067d7e841b82fb95eb4eafa8100e705675b6f90ab8d90275e81a9c91f93");
  });

  it("refuses to compute Story Outcome Hash while input or Effect work is pending", () => {
    const waiting = program([
      {
        ip: 0, opcode: "choice",
        operands: { choiceId: "choice.pending", promptStepId: "step.pending", commitStepId: "step.pending.commit", options: [{ optionId: "only", targetIp: 10 }] },
        sourceStatementId: "stmt.pending", stepBoundary: true, effectClass: "none", stopPoint: true
      },
      { ip: 10, opcode: "end", operands: { endingId: "ending.pending" }, sourceStatementId: "stmt.pending.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ], "vm15.pending");
    const state = transitionV0(waiting, createInitialStateV0(waiting, { executionId: "execution.vm15.pending", prngSeed: 1 })).nextState;
    expect(() => storyOutcomeHashV0(state)).toThrow("quiescent");
  });
});

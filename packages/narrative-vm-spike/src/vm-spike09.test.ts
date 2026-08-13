import { describe, expect, it } from "vitest";
import {
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  advanceRuntimeHistoryV0,
  backRuntimeHistoryV0,
  canonicalBytes,
  createInitialStateV0,
  createRuntimeSaveV0,
  createRuntimeSessionV0,
  forwardRuntimeHistoryV0,
  loadRuntimeSaveV0,
  scheduleRuntimeBatchV0,
  serializeRuntimeSaveV0,
  sha256Hex,
  stateHashV0,
  storyOutcomeHashV0,
  transitionV0,
  type ChoiceSelectedInputV0,
  type EffectCancelledInputV0,
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
  return stateHashV0(runSimple(target, `execution.generated.${seed}`, (seed + 1) >>> 0 || 1).state);
}

function callSequence(seed: number): string {
  const target = program([
    { ip: 0, opcode: "set", operands: { variableId: "score", value: seed % 13 }, sourceStatementId: "stmt.call.set", ...none },
    { ip: 10, opcode: "call", operands: { targetIp: 40 }, sourceStatementId: "stmt.call", ...none },
    { ip: 20, opcode: "end", operands: { endingId: "ending.call" }, sourceStatementId: "stmt.call.end", stepBoundary: true, effectClass: "none", stopPoint: true },
    { ip: 40, opcode: "add", operands: { variableId: "score", value: (seed % 5) + 1 }, sourceStatementId: "stmt.call.add", ...none },
    { ip: 50, opcode: "return", operands: {}, sourceStatementId: "stmt.call.return", ...none }
  ], `generated.call.${seed}`);
  return stateHashV0(runSimple(target, `execution.generated.${seed}`, (seed + 1) >>> 0 || 1).state);
}

function randomSequence(seed: number): string {
  const target = program([
    { ip: 0, opcode: "random", operands: { variableId: "first", min: 1, max: (seed % 31) + 2 }, sourceStatementId: "stmt.random.first", ...none },
    { ip: 10, opcode: "random", operands: { variableId: "second", min: -10, max: 10 }, sourceStatementId: "stmt.random.second", ...none },
    { ip: 20, opcode: "end", operands: { endingId: "ending.random" }, sourceStatementId: "stmt.random.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], `generated.random.${seed}`);
  return stateHashV0(runSimple(target, `execution.generated.${seed}`, (seed + 1) >>> 0 || 1).state);
}

function cancellationSequence(seed: number): string {
  const target = program([
    {
      ip: 0,
      opcode: "emit",
      operands: {
        descriptorId: "descriptor.generated.awaited",
        requestStepId: null,
        issueStepId: "step.generated.effect.issue",
        completeStepId: "step.generated.effect.cancelled",
        channel: "visual",
        kind: "show.generated",
        payload: { variant: seed % 7 },
        policy: "pure",
        awaitMode: "awaited",
        cancellationScope: "scope.generated.effect",
        replayKey: `replay.generated.${seed}`,
        compensation: null,
        barrierReason: null
      },
      sourceStatementId: "stmt.generated.effect",
      stepBoundary: true,
      effectClass: "pure",
      stopPoint: true
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
    schemaVersion: 0,
    kind: "effectCancelled",
    inputId: `input.generated.cancel.${seed}`,
    executionId: effect.executionId,
    effectId: effect.effectId,
    expectedRevision: state.stateRevision,
    logicalSequence: effect.logicalSequence,
    cancellationScope: effect.cancellationScope
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
    executionId: `execution.generated.saved.${seed}`,
    prngSeed: (seed + 1) >>> 0 || 1
  }));
  const saved = advanceRuntimeHistoryV0(target, savedRoot).session;
  const current = createRuntimeSessionV0(target, createInitialStateV0(target, {
    executionId: `execution.generated.current.${seed}`,
    prngSeed: (seed + 2) >>> 0 || 1
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
      ip: 0,
      opcode: "choice",
      operands: {
        choiceId: "choice.generated",
        promptStepId: "step.generated.prompt",
        commitStepId: "step.generated.commit",
        options: [{ optionId: "left", targetIp: 10 }, { optionId: "right", targetIp: 30 }]
      },
      sourceStatementId: "stmt.generated.choice",
      stepBoundary: true,
      effectClass: "none",
      stopPoint: true
    },
    { ip: 10, opcode: "set", operands: { variableId: "route", value: "left" }, sourceStatementId: "stmt.generated.left", ...none },
    { ip: 20, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.generated.left.exit", ...none },
    { ip: 30, opcode: "set", operands: { variableId: "route", value: "right" }, sourceStatementId: "stmt.generated.right", ...none },
    { ip: 40, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.generated.right.exit", ...none },
    { ip: 50, opcode: "end", operands: { endingId: "ending.branch" }, sourceStatementId: "stmt.generated.branch.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], `generated.branch.${seed}`);
  const root = createRuntimeSessionV0(target, createInitialStateV0(target, {
    executionId: `execution.generated.${seed}`,
    prngSeed: (seed + 1) >>> 0 || 1
  }));
  const waiting = advanceRuntimeHistoryV0(target, root).session;
  const request = waiting.state.pendingRequests[0];
  if (request?.kind !== "choice") throw new Error("generated Choice request missing");
  const input: ChoiceSelectedInputV0 = {
    schemaVersion: 0,
    kind: "choiceSelected",
    inputId: `input.generated.choice.${seed}`,
    executionId: request.executionId,
    requestId: request.requestId,
    expectedRevision: request.expectedRevision,
    logicalSequence: request.logicalSequence,
    choiceId: request.choiceId,
    optionId: seed % 2 === 0 ? "left" : "right"
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

const GENERATED_SCENARIOS = [
  conditionalSequence,
  callSequence,
  randomSequence,
  cancellationSequence,
  saveSequence,
  branchSequence
] as const;

function generatedSequence(seed: number): string {
  const scenario = GENERATED_SCENARIOS[seed % GENERATED_SCENARIOS.length];
  if (scenario === undefined) throw new Error(`No generated scenario for seed ${seed}`);
  return scenario(seed);
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
    autoTiming: {
      baseDelayTicks: 0,
      ticksPerReadableUnit: 0,
      voiceDurationTicks: 0,
      voiceTailTicks: 0,
      readableUnits: 0
    }
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

describe("CL-04 narrative VM kernel spike 09", () => {
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

  it("executes at least 10,000 fixed generated sequences with replay equality and failure seed reporting", () => {
    const outcomes: string[] = [];
    for (let seed = 0; seed < 10_000; seed += 1) {
      try {
        const first = generatedSequence(seed);
        const replay = generatedSequence(seed);
        if (replay !== first) throw new Error("replay hash differs");
        outcomes.push(first);
      } catch (error) {
        throw new Error(`Generated VM sequence failed at seed ${seed}: ${String(error)}`);
      }
    }
    expect(outcomes).toHaveLength(10_000);
    expect(sha256Hex(canonicalBytes(outcomes))).toBe("770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048");
  }, 90_000);

  it("executes VM-15 pure presentation insertion without changing Story Outcome Hash", () => {
    const base = program([
      { ip: 0, opcode: "set", operands: { variableId: "route", value: "same" }, sourceStatementId: "stmt.outcome.set", ...none },
      { ip: 10, opcode: "checkpoint", operands: { stepId: "step.outcome" }, sourceStatementId: "stmt.outcome.checkpoint", stepBoundary: true, effectClass: "none", stopPoint: false },
      { ip: 20, opcode: "end", operands: { endingId: "ending.outcome" }, sourceStatementId: "stmt.outcome.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ], "vm15.base");
    const withPresentation = program([
      { ip: 0, opcode: "set", operands: { variableId: "route", value: "same" }, sourceStatementId: "stmt.outcome.set", ...none },
      {
        ip: 10,
        opcode: "emit",
        operands: {
          descriptorId: "descriptor.presentation.only",
          requestStepId: null,
          issueStepId: "step.presentation.issue",
          completeStepId: "step.presentation.complete",
          channel: "visual",
          kind: "presentation.sparkle",
          payload: { color: "violet" },
          policy: "pure",
          awaitMode: "detached",
          cancellationScope: "scope.presentation",
          replayKey: "replay.presentation.only",
          compensation: null,
          barrierReason: null
        },
        sourceStatementId: "stmt.presentation.only",
        stepBoundary: true,
        effectClass: "pure",
        stopPoint: false
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
        ip: 0,
        opcode: "choice",
        operands: { choiceId: "choice.pending", promptStepId: "step.pending", commitStepId: "step.pending.commit", options: [{ optionId: "only", targetIp: 10 }] },
        sourceStatementId: "stmt.pending",
        stepBoundary: true,
        effectClass: "none",
        stopPoint: true
      },
      { ip: 10, opcode: "end", operands: { endingId: "ending.pending" }, sourceStatementId: "stmt.pending.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ], "vm15.pending");
    const state = transitionV0(waiting, createInitialStateV0(waiting, { executionId: "execution.vm15.pending", prngSeed: 1 })).nextState;
    expect(() => storyOutcomeHashV0(state)).toThrow("quiescent");
  });
});

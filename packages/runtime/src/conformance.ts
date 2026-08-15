import { runtimeHistorySessionHashV1, runtimeStateHashV1 } from "./hash";
import { advanceRuntimeHistoryV1, backRuntimeHistoryV1, createRuntimeHistorySessionV1, forwardRuntimeHistoryV1 } from "./history";
import { createRuntimeState, drawRuntimeRandom, runRuntime } from "./runtime";
import { createRuntimeSchedulerSessionV1, scheduleRuntimeBatchV1 } from "./scheduler";
import { createRuntimeSaveV1, loadRuntimeSaveV1 } from "./save";
import { runtimeEffectIntentHashV1 } from "./effect";
import { mapRuntimeDiagnosticsV1 } from "./source-map";
import type { RuntimeProgramV1, RuntimeSchedulePolicyV1, RuntimeSchedulerSessionV1, RuntimeSourceMapV1 } from "./types";

export interface RuntimeConformanceResultV1 {
  readonly schemaVersion: 1;
  readonly runtimeVersion: "0.6.0";
  readonly initialStateHash: string;
  readonly randomValue: number;
  readonly randomStateHash: string;
  readonly endingStateHash: string;
  readonly reachedEndingIds: readonly string[];
  readonly effectIntentHash: string;
  readonly effectIssuedStateHash: string;
  readonly effectCompletedStateHash: string;
  readonly barrierRequestId: string;
  readonly barrierCommittedStateHash: string;
  readonly saveArtifactHash: string;
  readonly rehydratedEffectId: string;
  readonly rehydratedStateHash: string;
  readonly historyBackStateHash: string;
  readonly historyForwardStateHash: string;
  readonly historyForkStateHash: string;
  readonly historySessionHash: string;
  readonly historyTombstoneInputId: string;
  readonly historyBarrierCode: "RUNTIME_BARRIER_BLOCKED";
  readonly schedulerFinalStateHash: string;
  readonly schedulerNormalHistoryHash: string;
  readonly schedulerInstantHistoryHash: string;
  readonly schedulerAutoDelayMilliseconds: number;
  readonly schedulerYieldAccumulatedInstructions: number;
  readonly schedulerBarrierStopReason: "barrier";
  readonly sourceDiagnosticCode: "RUNTIME_VARIABLE_MISSING";
  readonly sourceDiagnosticStatus: "instruction";
  readonly sourceDiagnosticInstructionIndex: 0;
  readonly sourceDiagnosticStatementId: "source_statement";
  readonly sourceDiagnosticStatementIndex: 3;
}

export function executeRuntimeConformanceV1(): RuntimeConformanceResultV1 {
  const program: RuntimeProgramV1 = {
    schemaVersion: 1,
    irVersion: "1.0.0",
    projectId: "runtime-test",
    entrySceneId: "main",
    scenes: [{ sceneId: "main", instructions: [{ instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }] }]
  };
  const created = createRuntimeState(program, { buildId: "build", executionId: "execution-test", initialVariables: { alpha: 1, beta: 2 } });
  if (!created.ok) throw new TypeError(`Runtime E2 conformance setup failed: ${JSON.stringify(created.diagnostics)}`);
  const drawn = drawRuntimeRandom(created.state, { expectedStateRevision: 0, minimum: 10, maximum: 99 });
  if (!drawn.ok) throw new TypeError(`Runtime E2 conformance draw failed: ${JSON.stringify(drawn.diagnostics)}`);
  const ended = runRuntime(program, drawn.state);
  if (ended.diagnostics.length > 0 || ended.state.terminal.kind !== "ended") throw new TypeError("Runtime E2 conformance ending failed");
  const effectProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-effect", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [
    { instructionId: "effect", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_effect", awaitMode: "awaited", replayKey: "replay.effect", cancellationScope: "scope.effect" } } },
    { instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }
  ] }] };
  const effectCreated = createRuntimeState(effectProgram, { buildId: "build-effect", executionId: "execution-effect" });
  if (!effectCreated.ok) throw new TypeError("Runtime Effect conformance setup failed");
  const issued = runRuntime(effectProgram, effectCreated.state), effect = issued.state.pendingEffect;
  if (effect === null) throw new TypeError("Runtime Effect conformance issue failed");
  const saved = createRuntimeSaveV1(effectProgram, issued.state);
  if (!saved.ok) throw new TypeError("Runtime Save conformance creation failed");
  const loaded = loadRuntimeSaveV1(effectProgram, saved.serialized, { expectedBuildId: issued.state.buildId });
  if (!loaded.ok || loaded.rehydration.kind !== "effect") throw new TypeError("Runtime Save conformance rehydration failed");
  const completed = runRuntime(effectProgram, issued.state, { input: { schemaVersion: 1, kind: "effectCompleted", inputId: "input-effect", executionId: issued.state.executionId, expectedStateRevision: issued.state.stateRevision, logicalSequence: effect.logicalSequence, effectId: effect.effectId, replayKey: effect.replayKey } });
  const barrierProgram: RuntimeProgramV1 = { ...effectProgram, projectId: "runtime-barrier", scenes: [{ sceneId: "main", instructions: [
    { instructionId: "barrier", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_barrier", effectPolicy: "barrier", barrierReason: "Irreversible conformance operation." } } },
    { instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }
  ] }] };
  const barrierCreated = createRuntimeState(barrierProgram, { buildId: "build-barrier", executionId: "execution-barrier" });
  if (!barrierCreated.ok) throw new TypeError("Runtime Barrier conformance setup failed");
  const requested = runRuntime(barrierProgram, barrierCreated.state), request = requested.barrierRequest;
  if (request === null) throw new TypeError("Runtime Barrier conformance request failed");
  const committed = runRuntime(barrierProgram, requested.state, { input: { schemaVersion: 1, kind: "barrierApproved", inputId: "input-barrier", executionId: requested.state.executionId, expectedStateRevision: requested.state.stateRevision, logicalSequence: request.logicalSequence, requestId: request.requestId, descriptorId: request.descriptorId } });
  const historyProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-history", entrySceneId: "main", scenes: [
    { sceneId: "main", instructions: [{ instructionId: "history-choice", opcode: "choice", operands: { prompt: "Route", options: [{ optionId: "left", label: "Left", targetSceneId: "left" }, { optionId: "right", label: "Right", targetSceneId: "right" }] } }] },
    { sceneId: "left", instructions: [{ instructionId: "history-left", opcode: "narration", operands: { textId: "history_left", text: "Left" } }] },
    { sceneId: "right", instructions: [{ instructionId: "history-right", opcode: "narration", operands: { textId: "history_right", text: "Right" } }] }
  ] };
  const historyCreated = createRuntimeState(historyProgram, { buildId: "build-history", executionId: "execution-history" });
  if (!historyCreated.ok) throw new TypeError("Runtime History conformance setup failed");
  const historyInitial = createRuntimeHistorySessionV1(historyProgram, historyCreated.state);
  const historyChoice = advanceRuntimeHistoryV1(historyProgram, historyInitial.session), choice = historyChoice.state.pendingChoice;
  if (choice === null) throw new TypeError("Runtime History conformance choice failed");
  const leftInput = { schemaVersion: 1 as const, kind: "choiceSelected" as const, inputId: "input-history-left", executionId: historyChoice.state.executionId, expectedStateRevision: historyChoice.state.stateRevision, logicalSequence: choice.logicalSequence, requestId: choice.requestId, instructionId: choice.instructionId, optionId: "left" };
  const historyLeft = advanceRuntimeHistoryV1(historyProgram, historyChoice.session, { input: leftInput });
  const historyBack = backRuntimeHistoryV1(historyProgram, historyLeft.session);
  const historyForward = forwardRuntimeHistoryV1(historyProgram, historyBack.session);
  const historyRewound = backRuntimeHistoryV1(historyProgram, historyForward.session);
  const rightInput = { ...leftInput, inputId: "input-history-right", optionId: "right" };
  const historyFork = advanceRuntimeHistoryV1(historyProgram, historyRewound.session, { input: rightInput });
  const barrierHistoryInitial = createRuntimeHistorySessionV1(barrierProgram, barrierCreated.state);
  const barrierHistoryRequest = advanceRuntimeHistoryV1(barrierProgram, barrierHistoryInitial.session), barrierPending = barrierHistoryRequest.state.pendingBarrier;
  if (barrierPending === null) throw new TypeError("Runtime History Barrier request failed");
  const barrierHistoryCommit = advanceRuntimeHistoryV1(barrierProgram, barrierHistoryRequest.session, { input: { schemaVersion: 1, kind: "barrierApproved", inputId: "input-history-barrier", executionId: barrierHistoryRequest.state.executionId, expectedStateRevision: barrierHistoryRequest.state.stateRevision, logicalSequence: barrierPending.logicalSequence, requestId: barrierPending.requestId, descriptorId: barrierPending.descriptorId } });
  const barrierHistoryBack = backRuntimeHistoryV1(barrierProgram, barrierHistoryCommit.session);
  if (barrierHistoryBack.diagnostics[0]?.code !== "RUNTIME_BARRIER_BLOCKED") throw new TypeError("Runtime History Barrier block failed");
  const schedulerProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-scheduler", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [
    { instructionId: "scheduler-set", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "literal", value: 1 } } },
    { instructionId: "scheduler-one", opcode: "narration", operands: { textId: "scheduler_one", text: "One" } },
    { instructionId: "scheduler-add", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "binary", operator: "+", left: { kind: "identifier", name: "score" }, right: { kind: "literal", value: 2 } } } },
    { instructionId: "scheduler-wait", opcode: "wait", operands: { durationMilliseconds: 30 } },
    { instructionId: "scheduler-two", opcode: "narration", operands: { textId: "scheduler_two", text: "Two" } },
    { instructionId: "scheduler-end", opcode: "end", operands: { endingId: "scheduler_done", name: "Done" } }
  ] }] };
  const schedulerCreated = createRuntimeState(schedulerProgram, { buildId: "build-scheduler", executionId: "execution-scheduler", initialVariables: { score: 0 } });
  if (!schedulerCreated.ok) throw new TypeError("Runtime Scheduler conformance setup failed");
  const schedulerHistory = createRuntimeHistorySessionV1(schedulerProgram, schedulerCreated.state);
  const schedulerInitial = createRuntimeSchedulerSessionV1(schedulerProgram, schedulerHistory.session);
  if (!schedulerInitial.ok) throw new TypeError("Runtime Scheduler Session setup failed");
  const normalPolicy: RuntimeSchedulePolicyV1 = { schemaVersion: 1, mode: "normal", skipActivation: null, speed: "normal", stopInstructionIds: [], unavailableEffectDescriptorIds: [], instantInstructionBudget: 256, autoTiming: { baseDelayMilliseconds: 20, millisecondsPerReadableUnit: 3, readableUnits: 10, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 10 } };
  const runSchedule = (initial: RuntimeSchedulerSessionV1, policy: RuntimeSchedulePolicyV1): RuntimeSchedulerSessionV1 => {
    let session = initial;
    for (let batch = 0; batch < 64 && session.workingState.terminal.kind === "running"; batch += 1) {
      const scheduled = scheduleRuntimeBatchV1(schedulerProgram, session, policy);
      if (scheduled.diagnostics.length > 0 || scheduled.executedInstructions === 0) throw new TypeError("Runtime Scheduler conformance execution failed");
      session = scheduled.session;
    }
    if (session.workingState.terminal.kind !== "ended") throw new TypeError("Runtime Scheduler conformance did not terminate");
    return session;
  };
  const schedulerNormal = runSchedule(schedulerInitial.session, normalPolicy);
  const instantPolicy: RuntimeSchedulePolicyV1 = { ...normalPolicy, mode: "skipAll", skipActivation: "toggle", speed: "instant", instantInstructionBudget: 1 };
  const schedulerInstant = runSchedule(schedulerInitial.session, instantPolicy);
  const schedulerYield = scheduleRuntimeBatchV1(schedulerProgram, schedulerInitial.session, instantPolicy);
  const autoResult = scheduleRuntimeBatchV1(schedulerProgram, schedulerInitial.session, { ...normalPolicy, mode: "auto", autoTiming: { ...normalPolicy.autoTiming, voiceDurationMilliseconds: 80 } });
  const schedulerBarrierInitial = createRuntimeSchedulerSessionV1(barrierProgram, barrierHistoryInitial.session);
  if (!schedulerBarrierInitial.ok) throw new TypeError("Runtime Scheduler Barrier setup failed");
  const schedulerBarrier = scheduleRuntimeBatchV1(barrierProgram, schedulerBarrierInitial.session, { ...normalPolicy, mode: "skipAll", skipActivation: "toggle", speed: 20 });
  if (schedulerBarrier.stopReason !== "barrier") throw new TypeError("Runtime Scheduler Barrier stop failed");
  const sourceProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-source", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [
    { instructionId: "source-set", opcode: "set", operands: { variableId: "missing", expressionAst: { kind: "literal", value: 1 } } },
    { instructionId: "source-end", opcode: "end", operands: { endingId: "done", name: "Done" } }
  ] }] };
  const sourceMap: RuntimeSourceMapV1 = { schemaVersion: 1, irVersion: "1.0.0", entries: [
    { instructionId: "source-set", sceneId: "main", statementId: "source_statement", statementIndex: 3 },
    { instructionId: "source-end", sceneId: "main", statementId: "source_ending", statementIndex: 4 }
  ] };
  const sourceCreated = createRuntimeState(sourceProgram, { buildId: "build-source", executionId: "execution-source" });
  if (!sourceCreated.ok) throw new TypeError("Runtime Source Diagnostic conformance setup failed");
  const sourceFailed = runRuntime(sourceProgram, sourceCreated.state);
  const sourceMapped = mapRuntimeDiagnosticsV1(sourceProgram, sourceMap, sourceFailed.diagnostics);
  if (!sourceMapped.ok || sourceMapped.diagnostics[0]?.code !== "RUNTIME_VARIABLE_MISSING" || sourceMapped.diagnostics[0].sourceMapStatus !== "instruction" || sourceMapped.diagnostics[0].instructionIndex !== 0 || sourceMapped.diagnostics[0].statementId !== "source_statement" || sourceMapped.diagnostics[0].statementIndex !== 3) {
    throw new TypeError("Runtime Source Diagnostic conformance mapping failed");
  }
  return {
    schemaVersion: 1,
    runtimeVersion: "0.6.0",
    initialStateHash: runtimeStateHashV1(created.state),
    randomValue: drawn.value,
    randomStateHash: runtimeStateHashV1(drawn.state),
    endingStateHash: runtimeStateHashV1(ended.state),
    reachedEndingIds: ended.state.metaProgress.reachedEndingIds,
    effectIntentHash: runtimeEffectIntentHashV1(effect),
    effectIssuedStateHash: runtimeStateHashV1(issued.state),
    effectCompletedStateHash: runtimeStateHashV1(completed.state),
    barrierRequestId: request.requestId,
    barrierCommittedStateHash: runtimeStateHashV1(committed.state),
    saveArtifactHash: saved.artifactHash,
    rehydratedEffectId: loaded.rehydration.intent.effectId,
    rehydratedStateHash: runtimeStateHashV1(loaded.state),
    historyBackStateHash: runtimeStateHashV1(historyBack.state),
    historyForwardStateHash: runtimeStateHashV1(historyForward.state),
    historyForkStateHash: runtimeStateHashV1(historyFork.state),
    historySessionHash: runtimeHistorySessionHashV1(historyFork.session),
    historyTombstoneInputId: historyFork.session.inputTombstones[0]?.inputId ?? "",
    historyBarrierCode: "RUNTIME_BARRIER_BLOCKED",
    schedulerFinalStateHash: runtimeStateHashV1(schedulerNormal.workingState),
    schedulerNormalHistoryHash: runtimeHistorySessionHashV1(schedulerNormal.history),
    schedulerInstantHistoryHash: runtimeHistorySessionHashV1(schedulerInstant.history),
    schedulerAutoDelayMilliseconds: autoResult.autoAdvanceDelayMilliseconds ?? -1,
    schedulerYieldAccumulatedInstructions: schedulerYield.session.accumulatedInstructions,
    schedulerBarrierStopReason: "barrier",
    sourceDiagnosticCode: "RUNTIME_VARIABLE_MISSING",
    sourceDiagnosticStatus: "instruction",
    sourceDiagnosticInstructionIndex: 0,
    sourceDiagnosticStatementId: "source_statement",
    sourceDiagnosticStatementIndex: 3
  };
}

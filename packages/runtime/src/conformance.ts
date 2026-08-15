import { runtimeHistoryReconciliationPlanHashV1, runtimeHistorySessionHashV1, runtimeStateHashV1 } from "./hash";
import { advanceRuntimeHistoryV1, backRuntimeHistoryV1, createRuntimeHistorySessionV1, forwardRuntimeHistoryV1 } from "./history";
import { createRuntimeState, drawRuntimeRandom, runRuntime } from "./runtime";
import { createRuntimeSchedulerSessionV1, scheduleRuntimeBatchV1 } from "./scheduler";
import { createRuntimeSaveV1, loadRuntimeSaveV1 } from "./save";
import { runtimeEffectIntentHashV1 } from "./effect";
import { mapRuntimeDiagnosticsV1 } from "./source-map";
import { createRuntimeStoryOutcomeV1 } from "./outcome";
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
  readonly formalVmParity: RuntimeFormalVmParityResultV1;
}

export interface RuntimeFormalVmParityResultV1 {
  readonly schemaVersion: 1;
  readonly recursiveOverflowCode: "RUNTIME_CALL_STACK_OVERFLOW";
  readonly recursiveStateHash: string;
  readonly randomContinuationValues: readonly number[];
  readonly randomContinuationStateHash: string;
  readonly sceneLateCompletionCode: "RUNTIME_EFFECT_CANCELLED";
  readonly sceneStateHash: string;
  readonly backReconciliationHash: string;
  readonly forwardReconciliationHash: string;
  readonly compensationKind: string;
  readonly replayDescriptorId: string;
  readonly futureOpcodeCode: "RUNTIME_INVALID_IR";
  readonly activeSessionStateHash: string;
  readonly storyOutcomeHash: string;
  readonly purePresentationOutcomeHash: string;
  readonly pendingOutcomeCode: "RUNTIME_OUTCOME_NOT_QUIESCENT";
}

export function executeRuntimeFormalVmParityV1(): RuntimeFormalVmParityResultV1 {
  const create = (program: RuntimeProgramV1, buildId: string, executionId: string, initialVariables: Readonly<Record<string, number | string>> = {}) => {
    const created = createRuntimeState(program, { buildId, executionId, initialVariables });
    if (!created.ok) throw new TypeError(`Formal VM parity setup failed: ${JSON.stringify(created.diagnostics)}`);
    return created.state;
  };

  const recursiveProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-vm02", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [
    { instructionId: "recursive-label", opcode: "label", operands: { name: "recursive" } },
    { instructionId: "recursive-call", opcode: "call", operands: { targetLabel: "recursive" } }
  ] }] };
  const recursive = runRuntime(recursiveProgram, create(recursiveProgram, "build-vm02", "execution-vm02"), { instructionBudget: 256 });
  if (recursive.diagnostics[0]?.code !== "RUNTIME_CALL_STACK_OVERFLOW" || recursive.state.callStack.length !== 64) throw new TypeError("VM-02 recursive overflow conformance failed");

  const randomProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-vm03", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [{ instructionId: "random-end", opcode: "end", operands: { endingId: "done", name: "Done" } }] }] };
  let randomBoundary = create(randomProgram, "build-vm03", "execution-vm03");
  for (let index = 0; index < 3; index += 1) {
    const drawn = drawRuntimeRandom(randomBoundary, { expectedStateRevision: randomBoundary.stateRevision, minimum: -50, maximum: 50 });
    if (!drawn.ok) throw new TypeError("VM-03 pre-Save draw failed");
    randomBoundary = drawn.state;
  }
  const randomSave = createRuntimeSaveV1(randomProgram, randomBoundary);
  if (!randomSave.ok) throw new TypeError("VM-03 Save failed");
  const randomLoaded = loadRuntimeSaveV1(randomProgram, randomSave.serialized, { expectedBuildId: randomBoundary.buildId });
  if (!randomLoaded.ok) throw new TypeError("VM-03 Load failed");
  const continueRandom = (initial: typeof randomBoundary) => {
    let state = initial;
    const values: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const drawn = drawRuntimeRandom(state, { expectedStateRevision: state.stateRevision, minimum: -50, maximum: 50 });
      if (!drawn.ok) throw new TypeError("VM-03 continuation draw failed");
      values.push(drawn.value); state = drawn.state;
    }
    return { state, values };
  };
  const liveRandom = continueRandom(randomBoundary), loadedRandom = continueRandom(randomLoaded.state);
  if (JSON.stringify(liveRandom.values) !== JSON.stringify(loadedRandom.values) || runtimeStateHashV1(liveRandom.state) !== runtimeStateHashV1(loadedRandom.state)) throw new TypeError("VM-03 Save/Load continuation differs");

  const cancellationProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-vm07", entrySceneId: "main", scenes: [
    { sceneId: "main", instructions: [
      { instructionId: "old-effect", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_old", awaitMode: "awaited", cancellationScope: "scope.old", replayKey: "replay.old" } } },
      { instructionId: "scene-choice", opcode: "choice", operands: { prompt: "Continue", options: [{ optionId: "fresh", label: "Fresh", targetSceneId: "fresh" }] } }
    ] },
    { sceneId: "fresh", instructions: [{ instructionId: "fresh-line", opcode: "narration", operands: { textId: "fresh_text", text: "Fresh" } }] }
  ] };
  const issued = runRuntime(cancellationProgram, create(cancellationProgram, "build-vm07", "execution-vm07")), oldEffect = issued.state.pendingEffect;
  if (oldEffect === null) throw new TypeError("VM-07 Effect issue failed");
  const cancelled = runRuntime(cancellationProgram, issued.state, { input: { schemaVersion: 1, kind: "effectCancelled", inputId: "input-cancel-old", executionId: issued.state.executionId, expectedStateRevision: issued.state.stateRevision, logicalSequence: oldEffect.logicalSequence, effectId: oldEffect.effectId, cancellationScope: oldEffect.cancellationScope } });
  const choice = cancelled.state.pendingChoice;
  if (choice === null) throw new TypeError("VM-07 scene Choice failed");
  const entered = runRuntime(cancellationProgram, cancelled.state, { input: { schemaVersion: 1, kind: "choiceSelected", inputId: "input-enter-fresh", executionId: cancelled.state.executionId, expectedStateRevision: cancelled.state.stateRevision, logicalSequence: choice.logicalSequence, requestId: choice.requestId, instructionId: choice.instructionId, optionId: "fresh" } });
  const sceneStateHash = runtimeStateHashV1(entered.state);
  const late = runRuntime(cancellationProgram, entered.state, { input: { schemaVersion: 1, kind: "effectCompleted", inputId: "input-late-old", executionId: entered.state.executionId, expectedStateRevision: entered.state.stateRevision, logicalSequence: oldEffect.logicalSequence, effectId: oldEffect.effectId, replayKey: oldEffect.replayKey } });
  if (late.diagnostics[0]?.code !== "RUNTIME_EFFECT_CANCELLED" || runtimeStateHashV1(late.state) !== sceneStateHash) throw new TypeError("VM-07 late completion polluted the new scene");

  const reversibleProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-vm08", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [
    { instructionId: "reversible-bg", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_reversible", effectPolicy: "reversible", compensationKind: "background.restore", replayKey: "replay.reversible" } } },
    { instructionId: "reversible-end", opcode: "end", operands: { endingId: "done", name: "Done" } }
  ] }] };
  const reversibleHistory = createRuntimeHistorySessionV1(reversibleProgram, create(reversibleProgram, "build-vm08", "execution-vm08"));
  const reversibleAdvanced = advanceRuntimeHistoryV1(reversibleProgram, reversibleHistory.session);
  const reversibleBack = backRuntimeHistoryV1(reversibleProgram, reversibleAdvanced.session);
  if (reversibleBack.reconciliationPlan === null || reversibleBack.reconciliationPlan.compensations[0]?.compensation.kind !== "background.restore") throw new TypeError("VM-08 compensation plan failed");
  const reversibleForward = forwardRuntimeHistoryV1(reversibleProgram, reversibleBack.session);
  if (reversibleForward.reconciliationPlan === null || reversibleForward.reconciliationPlan.replayEffects[0]?.descriptorId !== "reversible-bg") throw new TypeError("VM-08 replay plan failed");

  const safeProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-vm12", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [{ instructionId: "safe-line", opcode: "narration", operands: { textId: "safe_text", text: "Safe" } }] }] };
  const activeState = runRuntime(safeProgram, create(safeProgram, "build-vm12", "execution-vm12")).state;
  const activeSave = createRuntimeSaveV1(safeProgram, activeState);
  if (!activeSave.ok) throw new TypeError("VM-12 active Save failed");
  const futureProgram = { ...safeProgram, scenes: [{ ...safeProgram.scenes[0]!, instructions: [{ instructionId: "future-opcode", opcode: "futureOpcode", operands: {} }] }] } as unknown as RuntimeProgramV1;
  const futureLoad = loadRuntimeSaveV1(futureProgram, activeSave.serialized, { expectedBuildId: activeState.buildId });
  if (futureLoad.ok || futureLoad.diagnostics[0]?.code !== "RUNTIME_INVALID_IR") throw new TypeError("VM-12 future Opcode did not fail closed");

  const outcomeProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-vm15", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [
    { instructionId: "outcome-set", opcode: "set", operands: { variableId: "route", expressionAst: { kind: "literal", value: "left" } } },
    { instructionId: "outcome-end", opcode: "end", operands: { endingId: "outcome_done", name: "Done" } }
  ] }] };
  const presentationProgram: RuntimeProgramV1 = { ...outcomeProgram, scenes: [{ sceneId: "main", instructions: [outcomeProgram.scenes[0]!.instructions[0]!,
    { instructionId: "pure-presentation", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_pure", effectPolicy: "pure", awaitMode: "detached" } } },
    outcomeProgram.scenes[0]!.instructions[1]!
  ] }] };
  const outcomeEnded = runRuntime(outcomeProgram, create(outcomeProgram, "build-vm15", "execution-vm15", { route: "" })).state;
  const presentationStep = runRuntime(presentationProgram, create(presentationProgram, "build-vm15", "execution-vm15", { route: "" }));
  const presentationEnded = runRuntime(presentationProgram, presentationStep.state).state;
  const storyOutcome = createRuntimeStoryOutcomeV1(outcomeProgram, outcomeEnded), presentationOutcome = createRuntimeStoryOutcomeV1(presentationProgram, presentationEnded);
  if (!storyOutcome.ok || !presentationOutcome.ok || storyOutcome.outcomeHash !== presentationOutcome.outcomeHash) throw new TypeError("VM-15 pure presentation changed Story Outcome");
  const pendingProgram: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-vm15-pending", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: [{ instructionId: "pending-choice", opcode: "choice", operands: { prompt: "Wait", options: [{ optionId: "stay", label: "Stay", targetSceneId: "main" }] } }] }] };
  const pendingOutcome = createRuntimeStoryOutcomeV1(pendingProgram, runRuntime(pendingProgram, create(pendingProgram, "build-vm15-pending", "execution-vm15-pending")).state);
  if (pendingOutcome.ok || pendingOutcome.diagnostics[0]?.code !== "RUNTIME_OUTCOME_NOT_QUIESCENT") throw new TypeError("VM-15 non-quiescent Outcome did not fail closed");

  return {
    schemaVersion: 1,
    recursiveOverflowCode: "RUNTIME_CALL_STACK_OVERFLOW",
    recursiveStateHash: runtimeStateHashV1(recursive.state),
    randomContinuationValues: liveRandom.values,
    randomContinuationStateHash: runtimeStateHashV1(liveRandom.state),
    sceneLateCompletionCode: "RUNTIME_EFFECT_CANCELLED",
    sceneStateHash,
    backReconciliationHash: runtimeHistoryReconciliationPlanHashV1(reversibleBack.reconciliationPlan),
    forwardReconciliationHash: runtimeHistoryReconciliationPlanHashV1(reversibleForward.reconciliationPlan),
    compensationKind: reversibleBack.reconciliationPlan.compensations[0]!.compensation.kind,
    replayDescriptorId: reversibleForward.reconciliationPlan.replayEffects[0]!.descriptorId,
    futureOpcodeCode: "RUNTIME_INVALID_IR",
    activeSessionStateHash: runtimeStateHashV1(activeState),
    storyOutcomeHash: storyOutcome.outcomeHash,
    purePresentationOutcomeHash: presentationOutcome.outcomeHash,
    pendingOutcomeCode: "RUNTIME_OUTCOME_NOT_QUIESCENT"
  };
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
    sourceDiagnosticStatementIndex: 3,
    formalVmParity: executeRuntimeFormalVmParityV1()
  };
}

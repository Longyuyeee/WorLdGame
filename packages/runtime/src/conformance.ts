import { runtimeHistorySessionHashV1, runtimeStateHashV1 } from "./hash";
import { advanceRuntimeHistoryV1, backRuntimeHistoryV1, createRuntimeHistorySessionV1, forwardRuntimeHistoryV1 } from "./history";
import { createRuntimeState, drawRuntimeRandom, runRuntime } from "./runtime";
import { createRuntimeSaveV1, loadRuntimeSaveV1 } from "./save";
import { runtimeEffectIntentHashV1 } from "./effect";
import type { RuntimeProgramV1 } from "./types";

export interface RuntimeConformanceResultV1 {
  readonly schemaVersion: 1;
  readonly runtimeVersion: "0.5.0";
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
  return {
    schemaVersion: 1,
    runtimeVersion: "0.5.0",
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
    historyBarrierCode: "RUNTIME_BARRIER_BLOCKED"
  };
}

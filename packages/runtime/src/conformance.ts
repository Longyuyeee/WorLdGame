import { runtimeStateHashV1 } from "./hash";
import { createRuntimeState, drawRuntimeRandom, runRuntime } from "./runtime";
import { runtimeEffectIntentHashV1 } from "./effect";
import type { RuntimeProgramV1 } from "./types";

export interface RuntimeConformanceResultV1 {
  readonly schemaVersion: 1;
  readonly runtimeVersion: "0.3.0";
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
  return {
    schemaVersion: 1,
    runtimeVersion: "0.3.0",
    initialStateHash: runtimeStateHashV1(created.state),
    randomValue: drawn.value,
    randomStateHash: runtimeStateHashV1(drawn.state),
    endingStateHash: runtimeStateHashV1(ended.state),
    reachedEndingIds: ended.state.metaProgress.reachedEndingIds,
    effectIntentHash: runtimeEffectIntentHashV1(effect),
    effectIssuedStateHash: runtimeStateHashV1(issued.state),
    effectCompletedStateHash: runtimeStateHashV1(completed.state),
    barrierRequestId: request.requestId,
    barrierCommittedStateHash: runtimeStateHashV1(committed.state)
  };
}

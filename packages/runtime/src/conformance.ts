import { runtimeStateHashV1 } from "./hash";
import { createRuntimeState, drawRuntimeRandom, runRuntime } from "./runtime";
import type { RuntimeProgramV1 } from "./types";

export interface RuntimeE2ConformanceResultV1 {
  readonly schemaVersion: 1;
  readonly runtimeVersion: "0.2.0";
  readonly initialStateHash: string;
  readonly randomValue: number;
  readonly randomStateHash: string;
  readonly endingStateHash: string;
  readonly reachedEndingIds: readonly string[];
}

export function executeRuntimeE2ConformanceV1(): RuntimeE2ConformanceResultV1 {
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
  return {
    schemaVersion: 1,
    runtimeVersion: "0.2.0",
    initialStateHash: runtimeStateHashV1(created.state),
    randomValue: drawn.value,
    randomStateHash: runtimeStateHashV1(drawn.state),
    endingStateHash: runtimeStateHashV1(ended.state),
    reachedEndingIds: ended.state.metaProgress.reachedEndingIds
  };
}

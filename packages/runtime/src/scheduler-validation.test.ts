import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "./index";
import * as hashes from "./hash";
import type { RuntimeProgramV1, RuntimeSchedulePolicyV1 } from "./types";

const policy: RuntimeSchedulePolicyV1 = {
  schemaVersion: 1, mode: "skipAll", skipActivation: "toggle", speed: 20,
  instantInstructionBudget: 100, stopInstructionIds: [], unavailableEffectDescriptorIds: [],
  autoTiming: { baseDelayMilliseconds: 0, millisecondsPerReadableUnit: 0, readableUnits: 0, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 0 }
};
function fixture(count = 60) {
  const program: RuntimeProgramV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "batch-validation", entrySceneId: "main", scenes: [{ sceneId: "main", instructions: Array.from({ length: count + 45 }, (_, i) => ({ instructionId: `line.${i}`, opcode: "narration" as const, operands: { textId: `text.${i}`, text: `第 ${i} 句 🌍` } })) }] };
  const start = api.createRuntimeState(program, { buildId: "build", executionId: "execution" });
  if (!start.ok) throw Error(JSON.stringify(start.diagnostics));
  let history = api.createRuntimeHistorySessionV1(program, start.state).session;
  for (let i = 0; i < count; i++) history = api.advanceRuntimeHistoryV1(program, history).session;
  const scheduler = api.createRuntimeSchedulerSessionV1(program, history);
  if (!scheduler.ok) throw Error(JSON.stringify(scheduler.diagnostics));
  return { program, session: scheduler.session };
}
afterEach(() => vi.restoreAllMocks());
describe("operation-local scheduler validation", () => {
  it("hashes old checkpoints once per call and new checkpoints once per append", () => {
    const { program, session } = fixture();
    const hash = vi.spyOn(hashes, "runtimeStateHashV1");
    const result = api.scheduleRuntimeBatchV1(program, session, policy);
    expect(result.diagnostics).toEqual([]);
    expect(result.events).toHaveLength(20);
    expect(hash).toHaveBeenCalledTimes(61 + 20);
    hash.mockClear();
    api.scheduleRuntimeBatchV1(program, result.session, policy);
    expect(hash).toHaveBeenCalledTimes(81 + 20);
  });
  it("matches fully validated public commits byte for byte and preserves Back/Forward", () => {
    const { program, session } = fixture();
    const before = api.canonicalRuntimeStringify(session);
    let reference = session.history;
    for (let i = 0; i < 20; i++) {
      const executed = api.runRuntime(program, reference.checkpoints[reference.cursor]!.state);
      const committed = api.commitRuntimeHistoryStepV1(program, reference, executed);
      expect(committed.diagnostics).toEqual([]);
      reference = committed.session;
    }
    const actual = api.scheduleRuntimeBatchV1(program, session, policy).session.history;
    expect(api.canonicalRuntimeStringify(session)).toBe(before);
    expect(api.createRuntimeSessionSaveV1(program, actual)).toEqual(api.createRuntimeSessionSaveV1(program, reference));
    expect(api.validateRuntimeHistorySessionV1(program, actual)).toEqual([]);
    const back = api.backRuntimeHistoryV1(program, actual);
    expect(back.diagnostics).toEqual([]);
    expect(api.forwardRuntimeHistoryV1(program, back.session).state).toEqual(actual.checkpoints[actual.cursor]!.state);
  });
  it.each(["checkpoint", "entry", "tombstone", "archive"])("rejects %s corruption between batches without emitting effects", kind => {
    const { program, session } = fixture();
    const first = api.scheduleRuntimeBatchV1(program, session, policy);
    const damaged = structuredClone(first.session);
    if (kind === "checkpoint") Object.assign(damaged.history.checkpoints[0]!, { stateHash: "0".repeat(64) });
    if (kind === "entry") Object.assign(damaged.history.entries[0]!, { entryId: `entry.${"0".repeat(64)}` });
    if (kind === "tombstone") Object.assign(damaged.history, { inputTombstones: [{}] });
    if (kind === "archive") Object.assign(damaged.history, { archives: [{}] });
    const result = api.scheduleRuntimeBatchV1(program, damaged, policy);
    expect(result.stopReason).toBe("diagnostic");
    expect(result.diagnostics[0]?.code).toBe("RUNTIME_HISTORY_INVALID");
    expect(result.events).toEqual([]); expect(result.effects).toEqual([]);
    expect(result.executedInstructions).toBe(0);
  });
  it("keeps public commit validation and does not export an unchecked package API", () => {
    const { program, session } = fixture();
    const executed = api.runRuntime(program, session.workingState);
    Object.assign(session.history.checkpoints[0]!, { stateHash: "0".repeat(64) });
    expect(api.commitRuntimeHistoryStepV1(program, session.history, executed).diagnostics[0]?.code).toBe("RUNTIME_HISTORY_INVALID");
    expect(api).not.toHaveProperty("commitValidatedRuntimeHistoryStepInternal");
  });
  it("stops at unread and explicit stop boundaries without changing configured speed", () => {
    const { program, session } = fixture();
    expect(api.scheduleRuntimeBatchV1(program, session, { ...policy, mode: "skipRead" })).toMatchObject({ stopReason: "unreadBoundary", executedInstructions: 1 });
    expect(api.scheduleRuntimeBatchV1(program, session, { ...policy, stopInstructionIds: ["line.65"] })).toMatchObject({ stopReason: "stopPoint", executedInstructions: 6 });
    const backed = api.backRuntimeHistoryV1(program, session.history);
    expect(api.createRuntimeSchedulerSessionV1(program, backed.session).ok).toBe(false);
  });
});

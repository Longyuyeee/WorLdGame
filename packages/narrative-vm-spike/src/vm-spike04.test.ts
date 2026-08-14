import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY_ENTRIES_V0,
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  advanceRuntimeHistoryV0,
  backRuntimeHistoryV0,
  canonicalStringify,
  createInitialStateV0,
  createRuntimeSessionV0,
  forwardRuntimeHistoryV0,
  stateHashV0,
  validateRuntimeSessionV0,
  type ChoiceSelectedInputV0,
  type ExternalInputV0,
  type HistoryCheckpointV0,
  type HistoryEntryV0,
  type InstructionV0,
  type ProgramV0,
  type RuntimeSessionV0
} from "./index";

const metadata = { stepBoundary: false, effectClass: "none" as const, stopPoint: false };

function program(instructions: readonly InstructionV0[], buildId = "build.vm0405"): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.vm0405",
    buildId,
    entryIp: instructions[0]?.ip ?? 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

const vm0405 = program([
  {
    ip: 0,
    opcode: "choice",
    operands: {
      choiceId: "choice.route",
      promptStepId: "step.route.prompt",
      commitStepId: "step.route.commit",
      options: [{ optionId: "left", targetIp: 10 }, { optionId: "right", targetIp: 30 }]
    },
    sourceStatementId: "stmt.route.choice",
    stepBoundary: true,
    effectClass: "none",
    stopPoint: true
  },
  { ip: 10, opcode: "set", operands: { variableId: "route", value: "left" }, sourceStatementId: "stmt.left", ...metadata },
  { ip: 20, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.left.exit", ...metadata },
  { ip: 30, opcode: "set", operands: { variableId: "route", value: "right" }, sourceStatementId: "stmt.right", ...metadata },
  { ip: 40, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.right.exit", ...metadata },
  { ip: 50, opcode: "end", operands: { endingId: "ending.done" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
]);

function inputFor(session: RuntimeSessionV0, optionId: string, inputId: string): ChoiceSelectedInputV0 {
  const request = session.state.pendingRequests[0];
  if (request?.kind !== "choice") throw new Error("expected a pending choice request");
  return {
    schemaVersion: 0,
    kind: "choiceSelected",
    inputId,
    executionId: request.executionId,
    requestId: request.requestId,
    expectedRevision: request.expectedRevision,
    logicalSequence: request.logicalSequence,
    choiceId: request.choiceId,
    optionId
  };
}

function optionId(input: ExternalInputV0 | null | undefined): string | undefined {
  return input?.kind === "choiceSelected" ? input.optionId : undefined;
}

function waitingSession(): RuntimeSessionV0 {
  const initial = createInitialStateV0(vm0405, { executionId: "execution.vm0405", prngSeed: 1 });
  return advanceRuntimeHistoryV0(vm0405, createRuntimeSessionV0(vm0405, initial)).session;
}

describe("CL-04 narrative VM kernel spike 04", () => {
  it("records stable prompt and commit Story Steps with a canonical checkpoint chain", () => {
    const waiting = waitingSession();
    expect(waiting.state.historyCursor).toBe(0);
    expect(waiting.entries[0]?.stepId).toBe("step.route.prompt");
    expect(waiting.entries[0]?.input).toBeNull();

    const input = inputFor(waiting, "left", "input.route.left");
    const committed = advanceRuntimeHistoryV0(vm0405, waiting, input);
    expect(committed.diagnostics).toEqual([]);
    expect(committed.session.state.historyCursor).toBe(1);
    expect(committed.session.state.ip).toBe(10);
    expect(committed.session.entries[1]?.stepId).toBe("step.route.commit");
    expect(committed.session.entries[1]?.input).toEqual(input);
    expect(validateRuntimeSessionV0(vm0405, committed.session)).toEqual([]);
  });

  it("executes VM-04 Back then Forward without requesting or resubmitting input", () => {
    const waiting = waitingSession();
    const committed = advanceRuntimeHistoryV0(
      vm0405,
      waiting,
      inputFor(waiting, "left", "input.vm04.left")
    ).session;
    const committedHash = stateHashV0(committed.state);
    const backed = backRuntimeHistoryV0(vm0405, committed);
    expect(backed.diagnostics).toEqual([]);
    expect(backed.session.state.pendingRequests).toHaveLength(1);
    expect(stateHashV0(backed.session.state)).toBe(committed.entries[0]?.afterHash);

    const forwarded = forwardRuntimeHistoryV0(vm0405, backed.session);
    expect(forwarded.diagnostics).toEqual([]);
    expect(stateHashV0(forwarded.session.state)).toBe(committedHash);
    expect(optionId(forwarded.session.state.inputReceipts[0]?.input)).toBe("left");
  });

  it("requires Forward instead of accepting the same recorded input again", () => {
    const waiting = waitingSession();
    const input = inputFor(waiting, "left", "input.vm04.same");
    const committed = advanceRuntimeHistoryV0(vm0405, waiting, input).session;
    const backed = backRuntimeHistoryV0(vm0405, committed).session;
    const blocked = advanceRuntimeHistoryV0(vm0405, backed, input);
    expect(blocked.session).toBe(backed);
    expect(blocked.diagnostics[0]?.code).toBe("VM_HISTORY_FORWARD_REQUIRED");
  });

  it("executes VM-05 Back then changed choice as an atomic fork", () => {
    const waiting = waitingSession();
    const leftInput = inputFor(waiting, "left", "input.vm05.left");
    const left = advanceRuntimeHistoryV0(vm0405, waiting, leftInput).session;
    const backed = backRuntimeHistoryV0(vm0405, left).session;
    const rightInput = inputFor(backed, "right", "input.vm05.right");
    const forked = advanceRuntimeHistoryV0(vm0405, backed, rightInput);
    expect(forked.diagnostics).toEqual([]);
    expect(forked.session.entries).toHaveLength(2);
    expect(forked.session.checkpoints).toHaveLength(3);
    expect(optionId(forked.session.entries[1]?.input)).toBe("right");
    expect(forked.session.state.ip).toBe(30);
    expect(forked.session.state.inputReceipts.map((item) => item.input.inputId)).toEqual(["input.vm05.right"]);
    expect(forked.session.inputTombstones.map((item) => item.inputId)).toEqual([
      "input.vm05.left",
      "input.vm05.right"
    ]);
    expect(forwardRuntimeHistoryV0(vm0405, forked.session).diagnostics[0]?.code).toBe("VM_HISTORY_AT_END");
  });

  it("retains truncated-branch input tombstones across a fork", () => {
    const waiting = waitingSession();
    const leftInput = inputFor(waiting, "left", "input.vm05.tombstone");
    const left = advanceRuntimeHistoryV0(vm0405, waiting, leftInput).session;
    const backed = backRuntimeHistoryV0(vm0405, left).session;
    const forked = advanceRuntimeHistoryV0(
      vm0405,
      backed,
      inputFor(backed, "right", "input.vm05.fork")
    ).session;

    const duplicate = advanceRuntimeHistoryV0(vm0405, forked, leftInput);
    expect(duplicate.session).toBe(forked);
    expect(duplicate.diagnostics).toEqual([]);
    const conflict = advanceRuntimeHistoryV0(vm0405, forked, { ...leftInput, optionId: "right" });
    expect(conflict.session).toBe(forked);
    expect(conflict.diagnostics[0]?.code).toBe("VM_INPUT_ID_CONFLICT");
  });

  it("keeps forward History intact when a changed-input fork fails validation", () => {
    const waiting = waitingSession();
    const committed = advanceRuntimeHistoryV0(
      vm0405,
      waiting,
      inputFor(waiting, "left", "input.vm05.original")
    ).session;
    const backed = backRuntimeHistoryV0(vm0405, committed).session;
    const invalid = { ...inputFor(backed, "right", "input.vm05.invalid"), optionId: "missing" };
    const blocked = advanceRuntimeHistoryV0(vm0405, backed, invalid);
    expect(blocked.session).toBe(backed);
    expect(optionId(blocked.session.entries[1]?.input)).toBe("left");
    expect(blocked.diagnostics[0]?.code).toBe("VM_CHOICE_OPTION_INVALID");
  });

  it("supports root/end diagnostics and canonical session recovery", () => {
    const root = createRuntimeSessionV0(
      vm0405,
      createInitialStateV0(vm0405, { executionId: "execution.vm0405", prngSeed: 1 })
    );
    expect(backRuntimeHistoryV0(vm0405, root).diagnostics[0]?.code).toBe("VM_HISTORY_AT_START");
    expect(forwardRuntimeHistoryV0(vm0405, root).diagnostics[0]?.code).toBe("VM_HISTORY_AT_END");

    const waiting = advanceRuntimeHistoryV0(vm0405, root).session;
    const recovered = JSON.parse(canonicalStringify(waiting)) as RuntimeSessionV0;
    expect(validateRuntimeSessionV0(vm0405, recovered)).toEqual([]);
    expect(advanceRuntimeHistoryV0(
      vm0405,
      recovered,
      inputFor(recovered, "right", "input.recovered.right")
    ).diagnostics).toEqual([]);
  });

  it("rejects tampered checkpoint chains without changing the supplied session", () => {
    const waiting = waitingSession();
    const tampered = {
      ...waiting,
      checkpoints: waiting.checkpoints.map((item, index) => index === 1 ? { ...item, stateHash: "0".repeat(64) } : item)
    };
    const result = backRuntimeHistoryV0(vm0405, tampered);
    expect(result.session).toBe(tampered);
    expect(result.diagnostics[0]?.code).toBe("VM_HISTORY_INVALID");

    const tamperedEntry = {
      ...waiting,
      entries: waiting.entries.map((item, index) => index === 0 ? { ...item, stepId: "step.forged" } : item)
    };
    expect(validateRuntimeSessionV0(vm0405, tamperedEntry)[0]?.code).toBe("VM_HISTORY_INVALID");
  });

  it("fails closed instead of consuming wait intents in the synchronous History runner", () => {
    const waitProgram = program([
      { ip: 0, opcode: "wait", operands: { durationTicks: 10 }, sourceStatementId: "stmt.wait", ...metadata },
      { ip: 10, opcode: "checkpoint", operands: { stepId: "step.after.wait" }, sourceStatementId: "stmt.checkpoint", stepBoundary: true, effectClass: "none", stopPoint: false }
    ], "build.vm04.wait");
    const session = createRuntimeSessionV0(
      waitProgram,
      createInitialStateV0(waitProgram, { executionId: "execution.vm04.wait" })
    );
    const result = advanceRuntimeHistoryV0(waitProgram, session);
    expect(result.session).toBe(session);
    expect(result.diagnostics[0]?.code).toBe("VM_HISTORY_WAIT_REQUIRED");
  });

  it("enforces the explicit History entry limit without partially changing State", () => {
    const loop = program([
      { ip: 0, opcode: "checkpoint", operands: { stepId: "step.loop" }, sourceStatementId: "stmt.loop.checkpoint", stepBoundary: true, effectClass: "none", stopPoint: false },
      { ip: 10, opcode: "jump", operands: { targetIp: 0 }, sourceStatementId: "stmt.loop.jump", ...metadata }
    ], "build.vm04.limit");
    const root = createRuntimeSessionV0(
      loop,
      createInitialStateV0(loop, { executionId: "execution.vm04.limit" })
    );
    const checkpoints: HistoryCheckpointV0[] = [root.checkpoints[0] as HistoryCheckpointV0];
    const entries: HistoryEntryV0[] = [];
    for (let index = 0; index < MAX_HISTORY_ENTRIES_V0; index += 1) {
      const state = {
        ...root.state,
        ip: 10,
        stateRevision: index * 2 + 1,
        stepId: "step.loop",
        historyCursor: index
      };
      const stateHash = stateHashV0(state);
      const after: HistoryCheckpointV0 = {
        checkpointId: `history.${stateHash}`,
        stateHash,
        state
      };
      const before = checkpoints[index] as HistoryCheckpointV0;
      entries.push({
        historyIndex: index,
        stepId: "step.loop",
        sourceStatementId: "stmt.loop.checkpoint",
        beforeHash: before.stateHash,
        afterHash: after.stateHash,
        beforeCheckpointId: before.checkpointId,
        afterCheckpointId: after.checkpointId,
        input: null,
        effects: [],
        barrier: null
      });
      checkpoints.push(after);
    }
    const session: RuntimeSessionV0 = {
      ...root,
      state: (checkpoints[MAX_HISTORY_ENTRIES_V0] as HistoryCheckpointV0).state,
      entries,
      checkpoints
    };
    expect(validateRuntimeSessionV0(loop, session)).toEqual([]);
    const before = stateHashV0(session.state);
    const blocked = advanceRuntimeHistoryV0(loop, session);
    expect(blocked.session).toBe(session);
    expect(blocked.diagnostics[0]?.code).toBe("VM_HISTORY_LIMIT");
    expect(stateHashV0(blocked.session.state)).toBe(before);
  });

  it("matches the fixed VM-04/05 checkpoint hashes", () => {
    const waiting = waitingSession();
    const left = advanceRuntimeHistoryV0(
      vm0405,
      waiting,
      inputFor(waiting, "left", "input.golden.left")
    ).session;
    const backed = backRuntimeHistoryV0(vm0405, left).session;
    const forked = advanceRuntimeHistoryV0(
      vm0405,
      backed,
      inputFor(backed, "right", "input.golden.right")
    ).session;
    expect([
      ...left.checkpoints.map((item) => item.stateHash),
      forked.checkpoints[2]?.stateHash
    ]).toEqual([
      "c91f7bf26534f1edc3abd2770d3fa4307deed1c286983bca7d73f96383832d41",
      "23171701d005fdbabb20f5da57c40133593039b8a63489c68ed026973db32dcf",
      "c1582debec37850e6c10906cf51534012f5dbdd5da05d3d62815ec5857402f51",
      "2b40ce774c487429793f46f85ea3f53c1bdc014681826aad8b6cebdf340869a6"
    ]);
  });
});

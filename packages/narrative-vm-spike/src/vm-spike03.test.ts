import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_RECEIPTS_V0,
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  canonicalStringify,
  choiceRequestIdV0,
  createInitialStateV0,
  stateHashV0,
  transitionV0,
  validateProgram,
  type ExternalInputV0,
  type InstructionV0,
  type ProgramV0,
  type RuntimeStateV0
} from "./index";

const metadata = { stepBoundary: false, effectClass: "none" as const, stopPoint: false };

function program(instructions: readonly InstructionV0[]): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.vmchoice",
    buildId: "build.vmchoice",
    entryIp: instructions[0]?.ip ?? 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

const vmChoice = program([
  {
    ip: 0,
    opcode: "choice",
    operands: {
      choiceId: "choice.route",
      promptStepId: "step.choice.route.prompt",
      commitStepId: "step.choice.route.commit",
      options: [{ optionId: "left", targetIp: 10 }, { optionId: "right", targetIp: 30 }]
    },
    sourceStatementId: "stmt.choice",
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

function selectedInput(state: RuntimeStateV0, optionId: string, inputId = "input.route.1"): ExternalInputV0 {
  const request = state.pendingRequests[0];
  if (request === undefined) throw new Error("expected pending choice request");
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

describe("CL-04 narrative VM kernel spike 03", () => {
  it("emits a deterministic serializable choice request and waits at the choice IP", () => {
    const initial = createInitialStateV0(vmChoice, { executionId: "execution.choice.1", prngSeed: 1 });
    const first = transitionV0(vmChoice, initial);
    const second = transitionV0(vmChoice, createInitialStateV0(vmChoice, { executionId: "execution.choice.1", prngSeed: 1 }));
    const foreign = transitionV0(vmChoice, createInitialStateV0(vmChoice, { executionId: "execution.choice.2", prngSeed: 1 }));
    expect(first.diagnostics).toEqual([]);
    expect(first.nextState.ip).toBe(0);
    expect(first.nextState.stateRevision).toBe(1);
    expect(first.nextState.nextInputSequence).toBe(1);
    expect(first.request).toEqual(first.nextState.pendingRequests[0]);
    expect(second.request).toEqual(first.request);
    expect(foreign.request?.requestId).not.toBe(first.request?.requestId);
    expect(canonicalStringify(first.request)).toBe(canonicalStringify(second.request));
  });

  it("requires the host to provide a canonical execution ID", () => {
    expect(() => createInitialStateV0(vmChoice, { executionId: "bad execution" })).toThrow("canonical VM identifier");
  });

  it("copies choice options so later Program mutation cannot alter the waiting State", () => {
    const mutable = structuredClone(vmChoice) as unknown as {
      instructions: Array<{ operands: { options?: Array<{ optionId: string; targetIp: number }> } }>;
    };
    const waiting = transitionV0(mutable as unknown as ProgramV0, createInitialStateV0(
      mutable as unknown as ProgramV0,
      { executionId: "execution.choice.alias" }
    )).nextState;
    const before = stateHashV0(waiting);
    const option = mutable.instructions[0]?.operands.options?.[0];
    if (option !== undefined) option.targetIp = 30;
    expect(stateHashV0(waiting)).toBe(before);
  });

  it("accepts a matching ChoiceSelected input and records a canonical receipt", () => {
    const waiting = transitionV0(vmChoice, createInitialStateV0(vmChoice, { executionId: "execution.choice.1", prngSeed: 1 })).nextState;
    const input = selectedInput(waiting, "left");
    const accepted = transitionV0(vmChoice, waiting, input);
    expect(accepted.diagnostics).toEqual([]);
    expect(accepted.nextState.ip).toBe(10);
    expect(accepted.nextState.stepId).toBe("step.choice.route.commit");
    expect(accepted.nextState.pendingRequests).toEqual([]);
    expect(accepted.nextState.inputReceipts).toEqual([{ input, acceptedAtRevision: 2 }]);
  });

  it("treats an identical repeated input as idempotent and rejects an input ID conflict", () => {
    const waiting = transitionV0(vmChoice, createInitialStateV0(vmChoice, { executionId: "execution.choice.idempotent" })).nextState;
    const input = selectedInput(waiting, "right");
    const accepted = transitionV0(vmChoice, waiting, input).nextState;
    const duplicate = transitionV0(vmChoice, accepted, input);
    expect(duplicate.nextState).toBe(accepted);
    expect(duplicate.diagnostics).toEqual([]);

    const conflict = transitionV0(vmChoice, accepted, { ...input, optionId: "left" });
    expect(conflict.nextState).toBe(accepted);
    expect(conflict.diagnostics[0]?.code).toBe("VM_INPUT_ID_CONFLICT");
  });

  it("fails closed for missing, stale, foreign, out-of-order, or invalid choice input", () => {
    const waiting = transitionV0(vmChoice, createInitialStateV0(vmChoice, { executionId: "execution.choice.reject" })).nextState;
    const valid = selectedInput(waiting, "left");
    expect(transitionV0(vmChoice, waiting).diagnostics[0]?.code).toBe("VM_INPUT_REQUIRED");
    const cases: Array<[ExternalInputV0, string]> = [
      [{ ...valid, expectedRevision: valid.expectedRevision - 1 }, "VM_INPUT_MISMATCH"],
      [{ ...valid, executionId: "execution.foreign" }, "VM_INPUT_MISMATCH"],
      [{ ...valid, requestId: "request.foreign" }, "VM_INPUT_MISMATCH"],
      [{ ...valid, logicalSequence: valid.logicalSequence + 1 }, "VM_INPUT_OUT_OF_ORDER"],
      [{ ...valid, optionId: "missing" }, "VM_CHOICE_OPTION_INVALID"]
    ];
    for (const [input, code] of cases) {
      const result = transitionV0(vmChoice, waiting, input);
      expect(result.nextState).toBe(waiting);
      expect(result.diagnostics[0]?.code).toBe(code);
    }
  });

  it("accepts the same choice after a canonical waiting-state round-trip", () => {
    const waiting = transitionV0(vmChoice, createInitialStateV0(vmChoice, { executionId: "execution.restore.1", prngSeed: 1 })).nextState;
    const restored = JSON.parse(canonicalStringify(waiting)) as RuntimeStateV0;
    const input = selectedInput(restored, "right", "input.restore.1");
    const accepted = transitionV0(vmChoice, restored, input);
    expect(accepted.diagnostics).toEqual([]);
    expect(accepted.nextState.ip).toBe(30);
  });

  it("assigns a new logical sequence and request ID when a choice is entered again", () => {
    const loop = program([
      {
        ip: 0,
        opcode: "choice",
        operands: {
          choiceId: "choice.loop",
          promptStepId: "step.choice.loop.prompt",
          commitStepId: "step.choice.loop.commit",
          options: [{ optionId: "again", targetIp: 0 }]
        },
        sourceStatementId: "stmt.loop",
        stepBoundary: true,
        effectClass: "none",
        stopPoint: true
      }
    ]);
    const firstWaiting = transitionV0(loop, createInitialStateV0(loop, { executionId: "execution.choice.loop" })).nextState;
    const firstRequest = firstWaiting.pendingRequests[0];
    const looped = transitionV0(loop, firstWaiting, selectedInput(firstWaiting, "again", "input.loop.1")).nextState;
    const secondWaiting = transitionV0(loop, looped).nextState;
    expect(secondWaiting.pendingRequests[0]?.logicalSequence).toBe(1);
    expect(secondWaiting.pendingRequests[0]?.requestId).not.toBe(firstRequest?.requestId);
  });

  it("rejects duplicate options, unknown targets, and non-stopping choice metadata", () => {
    const malformed = structuredClone(vmChoice) as unknown as { instructions: Array<Record<string, unknown>> };
    const choice = malformed.instructions[0] as {
      operands: { options: Array<{ optionId: string; targetIp: number }> };
      stopPoint: boolean;
    };
    choice.operands.options = [{ optionId: "same", targetIp: 10 }, { optionId: "same", targetIp: 999 }];
    choice.stopPoint = false;
    expect(validateProgram(malformed as unknown as ProgramV0).map((item) => item.code)).toEqual([
      "VM_INVALID_PROGRAM",
      "VM_INVALID_PROGRAM"
    ]);
  });

  it("rejects tampered waiting state and fails closed at the receipt ledger limit", () => {
    const waiting = transitionV0(vmChoice, createInitialStateV0(vmChoice, { executionId: "execution.choice.limit" })).nextState;
    const tampered = {
      ...waiting,
      pendingRequests: [{ ...waiting.pendingRequests[0], choiceId: "choice.foreign" }]
    } as RuntimeStateV0;
    expect(transitionV0(vmChoice, tampered).diagnostics[0]?.code).toBe("VM_INVALID_STATE");
    const forgedToken = {
      ...waiting,
      pendingRequests: [{ ...waiting.pendingRequests[0], requestId: "request.forged" }]
    } as RuntimeStateV0;
    expect(transitionV0(vmChoice, forgedToken).diagnostics[0]?.code).toBe("VM_INVALID_STATE");

    const receipts = Array.from({ length: MAX_INPUT_RECEIPTS_V0 }, (_, index) => ({
      input: {
        schemaVersion: 0 as const,
        kind: "choiceSelected" as const,
        inputId: `input.limit.${index}`,
        executionId: waiting.executionId,
        requestId: choiceRequestIdV0(waiting.executionId, "choice.route", 0, 0),
        expectedRevision: 0,
        logicalSequence: 0,
        choiceId: "choice.route",
        optionId: "left"
      },
      acceptedAtRevision: 1
    }));
    const full = { ...waiting, inputReceipts: receipts };
    const blocked = transitionV0(vmChoice, full, selectedInput(full, "left", "input.limit.final"));
    expect(blocked.nextState).toBe(full);
    expect(blocked.diagnostics[0]?.code).toBe("VM_INPUT_RECEIPT_LIMIT");
  });

  it("matches the fixed VM-Choice hash stream through the left branch", () => {
    let state = createInitialStateV0(vmChoice, { executionId: "execution.choice.golden", prngSeed: 1 });
    const hashes = [stateHashV0(state)];
    state = transitionV0(vmChoice, state).nextState;
    hashes.push(stateHashV0(state));
    state = transitionV0(vmChoice, state, selectedInput(state, "left", "input.choice.golden")).nextState;
    hashes.push(stateHashV0(state));
    while (state.terminal.kind === "running") {
      state = transitionV0(vmChoice, state).nextState;
      hashes.push(stateHashV0(state));
    }
    expect(state.variables).toEqual({ route: "left" });
    expect(hashes).toEqual([
      "a572d02813a7987312a603185652bd66cf2141fb8bd9877452926aec8ef1a28c",
      "a55fe13e26e42bd0af740dd1ba9b9af59a192e46d201a3d53152ada5766d5f70",
      "14d36d8a920f505dff30b9b6c601a42b324615233e0af120c9d28601c8f9b5eb",
      "75e292555aa56297e0e5f7fc00f094bd49e184297bd6c5275e8093c5f819edec",
      "860a5967df7e0516d8f2f92863ee838a72189a334762c1ed0d94efb64c056ea1",
      "34c09fd07b128e5870d3012b87dc5b6acb101932ec8831ebadd7f07689ac4abb"
    ]);
  });
});

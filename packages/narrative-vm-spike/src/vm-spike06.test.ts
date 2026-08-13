import { describe, expect, it } from "vitest";
import {
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  MAX_RUNTIME_SAVE_CHARACTERS_V0,
  advanceRuntimeHistoryV0,
  backRuntimeHistoryV0,
  canonicalStringify,
  createInitialStateV0,
  createRuntimeSaveV0,
  createRuntimeSessionV0,
  forwardRuntimeHistoryV0,
  loadRuntimeSaveV0,
  migrateRuntimeSaveV0,
  runtimeSaveIntegrityDigestV0,
  serializeRuntimeSaveV0,
  stateHashV0,
  type BarrierApprovedInputV0,
  type ChoiceSelectedInputV0,
  type EffectCompletedInputV0,
  type InstructionV0,
  type ProgramV0,
  type RuntimeSaveBodyV0,
  type RuntimeSaveV0,
  type RuntimeSessionV0,
  type RuntimeStateV0
} from "./index";

const none = { stepBoundary: false, effectClass: "none" as const, stopPoint: false };

function program(instructions: readonly InstructionV0[], buildId: string): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.vm1112",
    buildId,
    entryIp: instructions[0]?.ip ?? 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

const historyProgram = program([
  {
    ip: 0,
    opcode: "choice",
    operands: {
      choiceId: "choice.route",
      promptStepId: "step.route.prompt",
      commitStepId: "step.route.commit",
      options: [{ optionId: "left", targetIp: 10 }, { optionId: "right", targetIp: 30 }]
    },
    sourceStatementId: "stmt.route",
    stepBoundary: true,
    effectClass: "none",
    stopPoint: true
  },
  { ip: 10, opcode: "set", operands: { variableId: "route", value: "left" }, sourceStatementId: "stmt.left", ...none },
  { ip: 20, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.left.exit", ...none },
  { ip: 30, opcode: "set", operands: { variableId: "route", value: "right" }, sourceStatementId: "stmt.right", ...none },
  { ip: 40, opcode: "jump", operands: { targetIp: 50 }, sourceStatementId: "stmt.right.exit", ...none },
  { ip: 50, opcode: "end", operands: { endingId: "ending.done" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
], "build.vm1112.history");

function choiceInput(session: RuntimeSessionV0, optionId: string, inputId: string): ChoiceSelectedInputV0 {
  const request = session.state.pendingRequests[0];
  if (request?.kind !== "choice") throw new Error("expected Choice request");
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

function historySession(executionId: string): RuntimeSessionV0 {
  return createRuntimeSessionV0(
    historyProgram,
    createInitialStateV0(historyProgram, { executionId, prngSeed: 1 })
  );
}

function effectProgram(policy: "pure" | "barrier", buildId: string): ProgramV0 {
  return program([
    {
      ip: 0,
      opcode: "emit",
      operands: {
        descriptorId: `descriptor.${policy}`,
        requestStepId: policy === "barrier" ? "step.barrier.request" : null,
        issueStepId: `step.${policy}.issue`,
        completeStepId: `step.${policy}.complete`,
        channel: "visual",
        kind: `effect.${policy}`,
        payload: { assetId: "asset.school" },
        policy,
        awaitMode: policy === "pure" ? "awaited" : "detached",
        cancellationScope: "scope.scene.school",
        replayKey: `replay.${policy}`,
        compensation: null,
        barrierReason: policy === "barrier" ? "Irreversible controlled test Effect." : null
      },
      sourceStatementId: `stmt.${policy}`,
      stepBoundary: true,
      effectClass: policy,
      stopPoint: true
    },
    { ip: 10, opcode: "end", operands: { endingId: "ending.done" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], buildId);
}

function completion(state: RuntimeStateV0): EffectCompletedInputV0 {
  const effect = state.pendingEffects[0];
  if (effect === undefined) throw new Error("expected pending Effect");
  return {
    schemaVersion: 0,
    kind: "effectCompleted",
    inputId: "input.effect.complete",
    executionId: effect.executionId,
    effectId: effect.effectId,
    expectedRevision: state.stateRevision,
    logicalSequence: effect.logicalSequence,
    replayKey: effect.replayKey
  };
}

function barrierApproval(session: RuntimeSessionV0): BarrierApprovedInputV0 {
  const request = session.state.pendingRequests[0];
  if (request?.kind !== "barrierApproval") throw new Error("expected Barrier request");
  return {
    schemaVersion: 0,
    kind: "barrierApproved",
    inputId: "input.barrier.approve",
    executionId: request.executionId,
    requestId: request.requestId,
    expectedRevision: request.expectedRevision,
    logicalSequence: request.logicalSequence,
    descriptorId: request.descriptorId
  };
}

function body(save: RuntimeSaveV0): RuntimeSaveBodyV0 {
  const { integrityDigest: _integrityDigest, ...saveBody } = save;
  return saveBody;
}

function resign(save: RuntimeSaveV0): RuntimeSaveV0 {
  const saveBody = body(save);
  return { ...saveBody, integrityDigest: runtimeSaveIntegrityDigestV0(saveBody) };
}

function withCurrent(save: RuntimeSaveV0, current = historySession("execution.current")) {
  return loadRuntimeSaveV0(historyProgram, current, serializeRuntimeSaveV0(save));
}

describe("CL-04 narrative VM kernel spike 06", () => {
  it("executes VM-11 Save/Load with identical cursor, State hash, Back, and Forward", () => {
    const root = historySession("execution.vm11.saved");
    const waiting = advanceRuntimeHistoryV0(historyProgram, root).session;
    const committed = advanceRuntimeHistoryV0(
      historyProgram,
      waiting,
      choiceInput(waiting, "left", "input.vm11.left")
    ).session;
    const save = createRuntimeSaveV0(historyProgram, committed, {
      metaProgressReferenceId: "meta.profile.main"
    });
    const loaded = withCurrent(save);
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.session).not.toBe(save.session);
    expect(loaded.session.state.historyCursor).toBe(committed.state.historyCursor);
    expect(stateHashV0(loaded.session.state)).toBe(stateHashV0(committed.state));
    expect(save.metaProgress).toEqual({ schemaVersion: 0, referenceId: "meta.profile.main" });

    const backed = backRuntimeHistoryV0(historyProgram, loaded.session);
    const forwarded = forwardRuntimeHistoryV0(historyProgram, backed.session);
    expect(backed.diagnostics).toEqual([]);
    expect(forwarded.diagnostics).toEqual([]);
    expect(stateHashV0(forwarded.session.state)).toBe(stateHashV0(committed.state));
  });

  it("restores pending Effect state and cancels the superseded active scope before Load", () => {
    const vm = effectProgram("pure", "build.vm11.effect");
    const savedRoot = createRuntimeSessionV0(vm, createInitialStateV0(vm, { executionId: "execution.saved.effect" }));
    const savedWaiting = advanceRuntimeHistoryV0(vm, savedRoot).session;
    const save = createRuntimeSaveV0(vm, savedWaiting);
    const currentRoot = createRuntimeSessionV0(vm, createInitialStateV0(vm, { executionId: "execution.current.effect" }));
    const currentWaiting = advanceRuntimeHistoryV0(vm, currentRoot).session;
    const loaded = loadRuntimeSaveV0(vm, currentWaiting, serializeRuntimeSaveV0(save));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.cancellations).toEqual([{
      effectId: currentWaiting.state.pendingEffects[0]?.effectId,
      executionId: "execution.current.effect",
      cancellationScope: "scope.scene.school",
      reason: "load"
    }]);
    expect(loaded.effects).toEqual(savedWaiting.state.pendingEffects);
    expect(loaded.session.state.executionId).toBe("execution.saved.effect");
    expect(advanceRuntimeHistoryV0(vm, loaded.session, completion(loaded.session.state)).diagnostics).toEqual([]);
  });

  it("preserves committed Barrier ledger and still blocks Back after Load", () => {
    const vm = effectProgram("barrier", "build.vm11.barrier");
    const root = createRuntimeSessionV0(vm, createInitialStateV0(vm, { executionId: "execution.saved.barrier" }));
    const requested = advanceRuntimeHistoryV0(vm, root).session;
    const committed = advanceRuntimeHistoryV0(vm, requested, barrierApproval(requested)).session;
    const loaded = loadRuntimeSaveV0(vm, root, serializeRuntimeSaveV0(createRuntimeSaveV0(vm, committed)));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.session.entries[1]?.barrier?.descriptorId).toBe("descriptor.barrier");
    expect(backRuntimeHistoryV0(vm, loaded.session).diagnostics[0]?.code).toBe("VM_BARRIER_BLOCKED");
  });

  it("is deterministic, canonical-only, and uses an isolated integrity digest", () => {
    const session = historySession("execution.vm11.canonical");
    const first = createRuntimeSaveV0(historyProgram, session);
    const second = createRuntimeSaveV0(historyProgram, session);
    expect(first).toEqual(second);
    expect(first.integrityDigest).toMatch(/^[0-9a-f]{64}$/);
    const serialized = serializeRuntimeSaveV0(first);
    expect(loadRuntimeSaveV0(historyProgram, session, serialized).diagnostics).toEqual([]);
    expect(loadRuntimeSaveV0(historyProgram, session, `${serialized}\n`).diagnostics[0]?.code).toBe("VM_SAVE_INVALID");
  });

  it("keeps the active Session untouched for malformed JSON, unknown fields, and digest corruption", () => {
    const current = historySession("execution.current.vm12");
    const save = createRuntimeSaveV0(historyProgram, historySession("execution.saved.vm12"));
    const unknown = { ...save, unknown: true };
    const cases: Array<[string, string]> = [
      ["{", "VM_SAVE_INVALID"],
      ["x".repeat(MAX_RUNTIME_SAVE_CHARACTERS_V0 + 1), "VM_SAVE_INVALID"],
      [canonicalStringify(unknown), "VM_SAVE_INVALID"],
      [serializeRuntimeSaveV0({ ...save, integrityDigest: "0".repeat(64) }), "VM_SAVE_INTEGRITY"]
    ];
    for (const [serialized, code] of cases) {
      const result = loadRuntimeSaveV0(historyProgram, current, serialized);
      expect(result.session).toBe(current);
      expect(result.cancellations).toEqual([]);
      expect(result.effects).toEqual([]);
      expect(result.diagnostics[0]?.code).toBe(code);
    }
  });

  it("executes VM-12 future-version and invalid-version rejection without overwriting current State", () => {
    const current = historySession("execution.current.version");
    const save = createRuntimeSaveV0(historyProgram, historySession("execution.saved.version"));
    const future = { ...save, saveSchemaVersion: 1 };
    const negative = { ...save, saveSchemaVersion: -1 };
    const futureResult = loadRuntimeSaveV0(historyProgram, current, canonicalStringify(future));
    const negativeResult = loadRuntimeSaveV0(historyProgram, current, canonicalStringify(negative));
    expect(futureResult.session).toBe(current);
    expect(futureResult.diagnostics[0]?.code).toBe("VM_SAVE_FUTURE_VERSION");
    expect(negativeResult.session).toBe(current);
    expect(negativeResult.diagnostics[0]?.code).toBe("VM_SAVE_INVALID");
  });

  it("rejects missing Opcode and incompatible Build even when the altered envelope is re-signed", () => {
    const save = createRuntimeSaveV0(historyProgram, historySession("execution.saved.compat"));
    const missingOpcode = resign({ ...save, opcodeRegistryDigest: "0".repeat(64) });
    const wrongBuild = resign({ ...save, buildId: "build.foreign" });
    expect(withCurrent(missingOpcode).diagnostics[0]?.code).toBe("VM_SAVE_OPCODE_MISSING");
    expect(withCurrent(wrongBuild).diagnostics[0]?.code).toBe("VM_SAVE_INCOMPATIBLE");
  });

  it("rejects a re-signed corrupt Session and never guesses a nearby Story Step", () => {
    const save = createRuntimeSaveV0(historyProgram, historySession("execution.saved.corrupt"));
    const corrupt = resign({
      ...save,
      session: {
        ...save.session,
        state: { ...save.session.state, stepId: "step.guessed.nearby" }
      }
    });
    const current = historySession("execution.current.corrupt");
    const result = loadRuntimeSaveV0(historyProgram, current, serializeRuntimeSaveV0(corrupt));
    expect(result.session).toBe(current);
    expect(result.diagnostics[0]?.code).toBe("VM_SAVE_INVALID");
  });

  it("runs the v0 identity migration on a clone without mutating the source Save", () => {
    const save = createRuntimeSaveV0(historyProgram, historySession("execution.saved.migrate"));
    const before = serializeRuntimeSaveV0(save);
    const migrated = migrateRuntimeSaveV0(save);
    expect(migrated).toEqual(save);
    expect(migrated).not.toBe(save);
    expect(migrated.session).not.toBe(save.session);
    expect(serializeRuntimeSaveV0(save)).toBe(before);
  });

  it("rejects invalid Meta Progress references at creation and load", () => {
    const session = historySession("execution.saved.meta");
    expect(() => createRuntimeSaveV0(historyProgram, session, {
      metaProgressReferenceId: "bad reference"
    })).toThrow("Meta Progress reference");
    const save = createRuntimeSaveV0(historyProgram, session);
    const malformed = resign({
      ...save,
      metaProgress: { schemaVersion: 0, referenceId: "bad reference" }
    });
    expect(withCurrent(malformed).diagnostics[0]?.code).toBe("VM_SAVE_INVALID");
  });

  it("matches the fixed VM-11 Save envelope digest and restored State hash", () => {
    const root = historySession("execution.vm11.golden");
    const waiting = advanceRuntimeHistoryV0(historyProgram, root).session;
    const committed = advanceRuntimeHistoryV0(
      historyProgram,
      waiting,
      choiceInput(waiting, "right", "input.vm11.golden.right")
    ).session;
    const save = createRuntimeSaveV0(historyProgram, committed, {
      metaProgressReferenceId: "meta.golden"
    });
    const loaded = loadRuntimeSaveV0(historyProgram, root, serializeRuntimeSaveV0(save));
    expect([save.integrityDigest, stateHashV0(loaded.session.state)]).toEqual([
      "0a3d2ec3834369b33ec6c4d1e7aa3b64188776b28d38c328198c1980c132f586",
      "b671c801332477e0710afbf583f88d84ecfb64c57dcc17aaa83d12cecf716274"
    ]);
  });
});

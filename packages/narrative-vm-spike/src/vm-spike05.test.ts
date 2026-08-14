import { describe, expect, it } from "vitest";
import {
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  advanceRuntimeHistoryV0,
  backRuntimeHistoryV0,
  canonicalStringify,
  createInitialStateV0,
  createRuntimeSessionV0,
  effectIntentHashV0,
  forwardRuntimeHistoryV0,
  stateHashV0,
  transitionV0,
  validateProgram,
  validateRuntimeSessionV0,
  type BarrierApprovedInputV0,
  type EffectCancelledInputV0,
  type EffectCompletedInputV0,
  type EffectIntentV0,
  type EffectPolicyV0,
  type InstructionV0,
  type ProgramV0,
  type RuntimeSessionV0,
  type RuntimeStateV0
} from "./index";

function program(instructions: readonly InstructionV0[], buildId: string): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.vm0608",
    buildId,
    entryIp: instructions[0]?.ip ?? 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

function emit(policy: EffectPolicyV0, awaitMode: "awaited" | "detached"): InstructionV0 {
  return {
    ip: 0,
    opcode: "emit",
    operands: {
      descriptorId: `descriptor.${policy}`,
      requestStepId: policy === "barrier" ? `step.${policy}.request` : null,
      issueStepId: `step.${policy}.issue`,
      completeStepId: `step.${policy}.complete`,
      channel: "visual",
      kind: `effect.${policy}`,
      payload: { assetId: "asset.school", durationTicks: 12 },
      policy,
      awaitMode,
      cancellationScope: "scope.scene.school",
      replayKey: `replay.${policy}.school`,
      compensation: policy === "reversible"
        ? { kind: "effect.restore", payload: { assetId: "asset.previous" } }
        : null,
      barrierReason: policy === "barrier" ? "This controlled test effect is irreversible." : null
    },
    sourceStatementId: `stmt.emit.${policy}`,
    stepBoundary: true,
    effectClass: policy,
    stopPoint: awaitMode === "awaited" || policy === "barrier"
  };
}

function effectProgram(
  policy: EffectPolicyV0,
  awaitMode: "awaited" | "detached" = "awaited",
  buildId = `build.vm0608.${policy}.${awaitMode}`
): ProgramV0 {
  return program([
    emit(policy, awaitMode),
    { ip: 10, opcode: "checkpoint", operands: { stepId: "step.scene.next" }, sourceStatementId: "stmt.scene.next", stepBoundary: true, effectClass: "none", stopPoint: false },
    { ip: 20, opcode: "end", operands: { endingId: "ending.done" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], buildId);
}

function completion(state: RuntimeStateV0, inputId = "input.effect.complete"): EffectCompletedInputV0 {
  const effect = state.pendingEffects[0];
  if (effect === undefined) throw new Error("expected an awaited Effect");
  return {
    schemaVersion: 0,
    kind: "effectCompleted",
    inputId,
    executionId: effect.executionId,
    effectId: effect.effectId,
    expectedRevision: state.stateRevision,
    logicalSequence: effect.logicalSequence,
    replayKey: effect.replayKey
  };
}

function cancellation(state: RuntimeStateV0, inputId = "input.effect.cancel"): EffectCancelledInputV0 {
  const effect = state.pendingEffects[0];
  if (effect === undefined) throw new Error("expected an awaited Effect");
  return {
    schemaVersion: 0,
    kind: "effectCancelled",
    inputId,
    executionId: effect.executionId,
    effectId: effect.effectId,
    expectedRevision: state.stateRevision,
    logicalSequence: effect.logicalSequence,
    cancellationScope: effect.cancellationScope
  };
}

function approval(session: RuntimeSessionV0): BarrierApprovedInputV0 {
  const request = session.state.pendingRequests[0];
  if (request?.kind !== "barrierApproval") throw new Error("expected Barrier approval request");
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

describe("CL-04 narrative VM kernel spike 05", () => {
  it("executes VM-06 with a deterministic awaited Effect token and matching completion", () => {
    const vm = effectProgram("pure");
    const initial = createInitialStateV0(vm, { executionId: "execution.vm06", prngSeed: 1 });
    const issued = transitionV0(vm, initial);
    const repeated = transitionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm06", prngSeed: 1 }));
    expect(issued.diagnostics).toEqual([]);
    expect(issued.effects).toHaveLength(1);
    expect(issued.effects).toEqual(repeated.effects);
    expect(issued.nextState.pendingEffects).toEqual(issued.effects);
    expect(issued.nextState.ip).toBe(0);
    const input = completion(issued.nextState);
    const completed = transitionV0(vm, issued.nextState, input);
    expect(completed.diagnostics).toEqual([]);
    expect(completed.nextState).toMatchObject({ ip: 10, stepId: "step.pure.complete", pendingEffects: [] });
    expect(completed.nextState.inputReceipts).toEqual([{ input, acceptedAtRevision: 2 }]);
  });

  it("rejects foreign, out-of-order, wrong-token, and wrong-revision Effect results", () => {
    const vm = effectProgram("pure");
    const waiting = transitionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm06.reject" })).nextState;
    const valid = completion(waiting);
    const cases: Array<[EffectCompletedInputV0, string]> = [
      [{ ...valid, executionId: "execution.foreign" }, "VM_EFFECT_MISMATCH"],
      [{ ...valid, effectId: "effect.foreign" }, "VM_EFFECT_MISMATCH"],
      [{ ...valid, expectedRevision: valid.expectedRevision - 1 }, "VM_EFFECT_MISMATCH"],
      [{ ...valid, logicalSequence: valid.logicalSequence + 1 }, "VM_INPUT_OUT_OF_ORDER"],
      [{ ...valid, replayKey: "replay.foreign" }, "VM_EFFECT_MISMATCH"]
    ];
    for (const [input, code] of cases) {
      const result = transitionV0(vm, waiting, input);
      expect(result.nextState).toBe(waiting);
      expect(result.diagnostics[0]?.code).toBe(code);
    }
  });

  it("makes duplicate completion idempotent and conflicting input IDs fail closed", () => {
    const vm = effectProgram("pure");
    const waiting = transitionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm06.idempotent" })).nextState;
    const input = completion(waiting);
    const completed = transitionV0(vm, waiting, input).nextState;
    expect(transitionV0(vm, completed, input)).toMatchObject({ nextState: completed, diagnostics: [] });
    const conflict = transitionV0(vm, completed, { ...input, replayKey: "replay.changed" });
    expect(conflict.nextState).toBe(completed);
    expect(conflict.diagnostics[0]?.code).toBe("VM_INPUT_ID_CONFLICT");
  });

  it("executes VM-07 scope cancellation and rejects a late completion in the next scene", () => {
    const vm = effectProgram("pure", "awaited", "build.vm07.cancel");
    const waiting = transitionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm07" })).nextState;
    const lateCompletion = completion(waiting, "input.effect.late");
    const cancelled = transitionV0(vm, waiting, cancellation(waiting));
    expect(cancelled.diagnostics).toEqual([]);
    expect(cancelled.nextState).toMatchObject({ ip: 10, pendingEffects: [] });
    const nextScene = transitionV0(vm, cancelled.nextState).nextState;
    expect(nextScene.stepId).toBe("step.scene.next");
    const late = transitionV0(vm, nextScene, lateCompletion);
    expect(late.nextState).toBe(nextScene);
    expect(late.diagnostics[0]?.code).toBe("VM_EFFECT_CANCELLED");

    const root = createRuntimeSessionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm07.back" }));
    const issued = advanceRuntimeHistoryV0(vm, root);
    const backed = backRuntimeHistoryV0(vm, issued.session);
    expect(backed.cancellations).toEqual([{
      effectId: issued.effects[0]?.effectId,
      executionId: "execution.vm07.back",
      cancellationScope: "scope.scene.school",
      reason: "back"
    }]);
  });

  it("rejects cancellation from a different scope", () => {
    const vm = effectProgram("pure");
    const waiting = transitionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm07.scope" })).nextState;
    const result = transitionV0(vm, waiting, { ...cancellation(waiting), cancellationScope: "scope.other" });
    expect(result.nextState).toBe(waiting);
    expect(result.diagnostics[0]?.code).toBe("VM_EFFECT_MISMATCH");
  });

  it("replays a pure Effect ledger entry on Forward", () => {
    const vm = effectProgram("pure", "detached", "build.vm08.pure");
    const root = createRuntimeSessionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm08.pure" }));
    const issued = advanceRuntimeHistoryV0(vm, root);
    expect(issued.effects[0]?.policy).toBe("pure");
    const backed = backRuntimeHistoryV0(vm, issued.session);
    expect(backed.effects).toEqual([]);
    const forwarded = forwardRuntimeHistoryV0(vm, backed.session);
    expect(forwarded.effects).toEqual(issued.effects);
    expect(stateHashV0(forwarded.session.state)).toBe(stateHashV0(issued.session.state));
  });

  it("compensates a reversible Effect on Back and replays it on Forward", () => {
    const vm = effectProgram("reversible", "detached", "build.vm08.reversible");
    const root = createRuntimeSessionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm08.reversible" }));
    const issued = advanceRuntimeHistoryV0(vm, root);
    const backed = backRuntimeHistoryV0(vm, issued.session);
    expect(backed.diagnostics).toEqual([]);
    expect(backed.effects[0]).toMatchObject({ kind: "effect.restore", policy: "pure", awaitMode: "detached" });
    expect(forwardRuntimeHistoryV0(vm, backed.session).effects).toEqual(issued.effects);
  });

  it("requires permission before committing a Barrier and blocks Back afterward", () => {
    const vm = effectProgram("barrier", "detached", "build.vm08.barrier");
    const root = createRuntimeSessionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm08.barrier" }));
    const requested = advanceRuntimeHistoryV0(vm, root);
    expect(requested.effects).toEqual([]);
    expect(requested.session.state.pendingRequests[0]?.kind).toBe("barrierApproval");
    const forged = advanceRuntimeHistoryV0(vm, requested.session, {
      ...approval(requested.session),
      inputId: "input.barrier.forged",
      descriptorId: "descriptor.foreign"
    });
    expect(forged.session).toBe(requested.session);
    expect(forged.effects).toEqual([]);
    expect(forged.diagnostics[0]?.code).toBe("VM_INPUT_MISMATCH");
    const committed = advanceRuntimeHistoryV0(vm, requested.session, approval(requested.session));
    expect(committed.diagnostics).toEqual([]);
    expect(committed.effects[0]?.policy).toBe("barrier");
    expect(committed.session.entries[1]?.barrier?.descriptorId).toBe("descriptor.barrier");
    const blocked = backRuntimeHistoryV0(vm, committed.session);
    expect(blocked.session).toBe(committed.session);
    expect(blocked.diagnostics[0]?.code).toBe("VM_BARRIER_BLOCKED");
    expect(blocked.diagnostics[0]?.detail).toContain("This controlled test effect is irreversible.");
  });

  it("recovers a pending Effect and rejects a tampered History ledger", () => {
    const vm = effectProgram("pure", "awaited", "build.vm06.recovery");
    const root = createRuntimeSessionV0(vm, createInitialStateV0(vm, { executionId: "execution.vm06.recovery" }));
    const issued = advanceRuntimeHistoryV0(vm, root).session;
    const recovered = JSON.parse(canonicalStringify(issued)) as RuntimeSessionV0;
    expect(validateRuntimeSessionV0(vm, recovered)).toEqual([]);
    expect(advanceRuntimeHistoryV0(vm, recovered, completion(recovered.state)).diagnostics).toEqual([]);
    const tampered = {
      ...issued,
      entries: issued.entries.map((entry, index) => index === 0 ? {
        ...entry,
        effects: entry.effects.map((effect): EffectIntentV0 => ({ ...effect, payload: { ...effect.payload, assetId: "asset.forged" } }))
      } : entry)
    };
    expect(validateRuntimeSessionV0(vm, tampered)[0]?.code).toBe("VM_HISTORY_INVALID");
  });

  it("rejects malformed policy metadata, compensation, and Barrier reason", () => {
    const reversible = structuredClone(effectProgram("reversible", "detached")) as unknown as {
      instructions: Array<{ operands: { compensation?: unknown }; effectClass: string }>;
    };
    reversible.instructions[0]!.operands.compensation = null;
    reversible.instructions[0]!.effectClass = "pure";
    expect(validateProgram(reversible as unknown as ProgramV0).length).toBeGreaterThanOrEqual(2);
    const barrier = structuredClone(effectProgram("barrier", "detached")) as unknown as {
      instructions: Array<{ operands: { barrierReason?: unknown } }>;
    };
    barrier.instructions[0]!.operands.barrierReason = null;
    expect(validateProgram(barrier as unknown as ProgramV0)[0]?.code).toBe("VM_INVALID_PROGRAM");
  });

  it("matches the fixed VM-06–08 State hashes", () => {
    const awaited = effectProgram("pure", "awaited", "build.vm0608.golden.awaited");
    const initial = createInitialStateV0(awaited, { executionId: "execution.vm0608.golden", prngSeed: 1 });
    const issued = transitionV0(awaited, initial);
    const completed = transitionV0(awaited, issued.nextState, completion(issued.nextState, "input.golden.complete"));
    const reversible = effectProgram("reversible", "detached", "build.vm0608.golden.reversible");
    const reversibleIssued = transitionV0(reversible, createInitialStateV0(
      reversible,
      { executionId: "execution.vm0608.golden.reversible", prngSeed: 1 }
    ));
    expect([
      stateHashV0(initial),
      stateHashV0(issued.nextState),
      stateHashV0(completed.nextState),
      stateHashV0(reversibleIssued.nextState)
    ]).toEqual([
      "a4dba01529ada47dc4bcc22f9d5b3d84055753f5276ffb03a4e21bf71563ba85",
      "27bbce3bcc31b459da99eac6094bf98a496f527446df11a7032fb321cdcb2808",
      "1a2f50cf42093e26241636f82288e2e2b46f6193ef2546eb66501b80c0cd08b5",
      "3c5f10116bb31e5974e3ffb303a3f4ca0b7d09038097773766c654eeda27d9f4"
    ]);
    expect([
      effectIntentHashV0(issued.effects[0] as EffectIntentV0),
      effectIntentHashV0(reversibleIssued.effects[0] as EffectIntentV0)
    ]).toEqual([
      "3fb83d631209467b53f8e1abcab94702b36086aeb89ac8bf6b48d9061a3b4917",
      "4b88eb97b1134f7b7fb525142fc399f23b2aeeb272471477b4fe8ecb8566ff69"
    ]);
  });
});

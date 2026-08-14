import { describe, expect, it } from "vitest";
import {
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  advanceRuntimeHistoryV0,
  applyMetaProgressEventV0,
  backRuntimeHistoryV0,
  canonicalStringify,
  createInitialStateV0,
  createMetaProgressV0,
  createRuntimeSaveV0,
  createRuntimeSessionV0,
  loadRuntimeSaveWithMetaProgressV0,
  mergeMetaProgressV0,
  mergeReferencedMetaProgressV0,
  metaProgressHashV0,
  metaProgressReferenceIdV0,
  serializeRuntimeSaveV0,
  stateHashV0,
  validateMetaProgressV0,
  type InstructionV0,
  type MetaProgressEventV0,
  type MetaProgressV0,
  type ProgramV0
} from "./index";

const instructions: readonly InstructionV0[] = [
  {
    ip: 0,
    opcode: "checkpoint",
    operands: { stepId: "step.dialogue.one" },
    sourceStatementId: "stmt.dialogue.one",
    stepBoundary: true,
    effectClass: "none",
    stopPoint: false
  },
  {
    ip: 10,
    opcode: "end",
    operands: { endingId: "ending.school.good" },
    sourceStatementId: "stmt.ending",
    stepBoundary: true,
    effectClass: "none",
    stopPoint: true
  }
];

const program: ProgramV0 = {
  irVersion: 0,
  projectId: "project.vm13",
  buildId: "build.vm13",
  entryIp: 0,
  instructions,
  sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
  opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
};

function event(kind: MetaProgressEventV0["kind"], entityId: string): MetaProgressEventV0 {
  return { schemaVersion: 0, kind, entityId };
}

function apply(progress: MetaProgressV0, ...events: readonly MetaProgressEventV0[]): MetaProgressV0 {
  return events.reduce((current, item) => {
    const result = applyMetaProgressEventV0(current, item);
    expect(result.diagnostics).toEqual([]);
    return result.progress;
  }, progress);
}

function empty(scope = "progress.local.default"): MetaProgressV0 {
  return createMetaProgressV0(program.projectId, scope);
}

const effectInstructions: readonly InstructionV0[] = [
  {
    ip: 0,
    opcode: "emit",
    operands: {
      descriptorId: "descriptor.meta.pending",
      requestStepId: null,
      issueStepId: "step.meta.effect.issue",
      completeStepId: "step.meta.effect.complete",
      channel: "visual",
      kind: "show.cg",
      payload: { assetId: "cg.meta" },
      policy: "pure",
      awaitMode: "awaited",
      cancellationScope: "scope.meta.scene",
      replayKey: "replay.meta.effect",
      compensation: null,
      barrierReason: null
    },
    sourceStatementId: "stmt.meta.effect",
    stepBoundary: true,
    effectClass: "pure",
    stopPoint: true
  },
  {
    ip: 10,
    opcode: "end",
    operands: { endingId: "ending.meta.effect" },
    sourceStatementId: "stmt.meta.effect.end",
    stepBoundary: true,
    effectClass: "none",
    stopPoint: true
  }
];

const effectProgram: ProgramV0 = {
  ...program,
  buildId: "build.vm13.effect",
  instructions: effectInstructions,
  sourceMap: Object.fromEntries(effectInstructions.map((item) => [String(item.ip), item.sourceStatementId]))
};

describe("CL-04 narrative VM kernel spike 08", () => {
  it("executes VM-13 without undoing read, CG, or ending progress during Runtime Back", () => {
    const root = createRuntimeSessionV0(
      program,
      createInitialStateV0(program, { executionId: "execution.vm13.back", prngSeed: 1 })
    );
    const dialogue = advanceRuntimeHistoryV0(program, root).session;
    const reached = advanceRuntimeHistoryV0(program, dialogue).session;
    const progress = apply(
      empty(),
      event("textRead", "text.school.intro"),
      event("cgUnlocked", "cg.school.sunset"),
      event("endingReached", "ending.school.good")
    );
    const beforeMetaHash = metaProgressHashV0(progress);
    const beforeStateHash = stateHashV0(reached.state);
    const backed = backRuntimeHistoryV0(program, reached);
    expect(backed.diagnostics).toEqual([]);
    expect(stateHashV0(backed.session.state)).not.toBe(beforeStateHash);
    expect(metaProgressHashV0(progress)).toBe(beforeMetaHash);
    expect(progress).toEqual({
      schemaVersion: 0,
      projectId: "project.vm13",
      progressScopeId: "progress.local.default",
      readTextIds: ["text.school.intro"],
      unlockedCgIds: ["cg.school.sunset"],
      reachedEndingIds: ["ending.school.good"]
    });
  });

  it("loads an older Runtime Save atomically without rolling newer Meta Progress backward", () => {
    const savedSession = createRuntimeSessionV0(
      program,
      createInitialStateV0(program, { executionId: "execution.vm13.saved", prngSeed: 1 })
    );
    const oldProgress = apply(empty(), event("textRead", "text.school.intro"));
    const save = createRuntimeSaveV0(program, savedSession, { metaProgress: oldProgress });
    const currentSession = createRuntimeSessionV0(
      program,
      createInitialStateV0(program, { executionId: "execution.vm13.current", prngSeed: 1 })
    );
    const currentProgress = apply(
      oldProgress,
      event("cgUnlocked", "cg.school.sunset"),
      event("endingReached", "ending.school.good")
    );
    const currentMetaHash = metaProgressHashV0(currentProgress);
    const loaded = loadRuntimeSaveWithMetaProgressV0(
      program,
      currentSession,
      currentProgress,
      serializeRuntimeSaveV0(save),
      oldProgress
    );
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.session.executionId).toBe("execution.vm13.saved");
    expect(loaded.metaProgressReferenceId).toBe(metaProgressReferenceIdV0(oldProgress));
    expect(metaProgressHashV0(loaded.metaProgress)).toBe(currentMetaHash);
    expect(loaded.metaProgress).toBe(currentProgress);
  });

  it("makes merge commutative, associative, and idempotent", () => {
    const a = apply(empty(), event("textRead", "text.a"), event("cgUnlocked", "cg.a"));
    const b = apply(empty(), event("textRead", "text.b"), event("endingReached", "ending.b"));
    const c = apply(empty(), event("cgUnlocked", "cg.c"), event("endingReached", "ending.c"));
    const ab = mergeMetaProgressV0(a, b).progress;
    const ba = mergeMetaProgressV0(b, a).progress;
    expect(ab).toEqual(ba);
    const left = mergeMetaProgressV0(ab, c).progress;
    const bc = mergeMetaProgressV0(b, c).progress;
    const right = mergeMetaProgressV0(a, bc).progress;
    expect(left).toEqual(right);
    const idempotent = mergeMetaProgressV0(left, left);
    expect(idempotent.progress).toBe(left);
    expect(idempotent.changed).toBe(false);
  });

  it("keeps duplicate events idempotent and never exposes a removal transition", () => {
    const once = apply(empty(), event("textRead", "text.once"));
    const duplicate = applyMetaProgressEventV0(once, event("textRead", "text.once"));
    expect(duplicate.progress).toBe(once);
    expect(duplicate.changed).toBe(false);
    expect(Object.keys(once).sort()).toEqual([
      "progressScopeId", "projectId", "reachedEndingIds", "readTextIds", "schemaVersion", "unlockedCgIds"
    ]);
  });

  it("derives a content-addressed Save reference and rejects forged referenced snapshots", () => {
    const progress = apply(empty(), event("cgUnlocked", "cg.reference"));
    const referenceId = metaProgressReferenceIdV0(progress);
    expect(referenceId).toMatch(/^meta\.[0-9a-f]{64}$/);
    const forged = mergeReferencedMetaProgressV0(empty(), progress, `meta.${"0".repeat(64)}`);
    expect(forged.progress).not.toBe(progress);
    expect(forged.progress).toEqual(empty());
    expect(forged.diagnostics[0]?.code).toBe("VM_META_PROGRESS_INVALID");
  });

  it("fails Runtime Save + Meta adoption atomically when the referenced snapshot is missing", () => {
    const savedSession = createRuntimeSessionV0(
      effectProgram,
      createInitialStateV0(effectProgram, { executionId: "execution.vm13.saved.atomic", prngSeed: 1 })
    );
    const progress = apply(empty(), event("textRead", "text.atomic"));
    const save = createRuntimeSaveV0(effectProgram, savedSession, { metaProgress: progress });
    const currentRoot = createRuntimeSessionV0(
      effectProgram,
      createInitialStateV0(effectProgram, { executionId: "execution.vm13.current.atomic", prngSeed: 1 })
    );
    const currentWaiting = advanceRuntimeHistoryV0(effectProgram, currentRoot).session;
    expect(currentWaiting.state.pendingEffects).toHaveLength(1);
    const result = loadRuntimeSaveWithMetaProgressV0(
      effectProgram,
      currentWaiting,
      progress,
      serializeRuntimeSaveV0(save),
      null
    );
    expect(result.session).toBe(currentWaiting);
    expect(result.metaProgress).toBe(progress);
    expect(result.cancellations).toEqual([]);
    expect(result.effects).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("VM_META_PROGRESS_INVALID");
  });

  it("fails closed for foreign scopes, malformed sets, events, and Save project mismatch", () => {
    const current = empty();
    const foreignScope = createMetaProgressV0(program.projectId, "progress.local.other");
    expect(mergeMetaProgressV0(current, foreignScope).diagnostics[0]?.code).toBe("VM_META_PROGRESS_INCOMPATIBLE");
    const malformed = { ...current, readTextIds: ["text.z", "text.a"] } as MetaProgressV0;
    expect(validateMetaProgressV0(malformed)[0]?.code).toBe("VM_META_PROGRESS_INVALID");
    expect(applyMetaProgressEventV0(current, {
      schemaVersion: 0,
      kind: "textRead",
      entityId: "bad id"
    }).progress).toBe(current);
    const session = createRuntimeSessionV0(
      program,
      createInitialStateV0(program, { executionId: "execution.vm13.foreign", prngSeed: 1 })
    );
    expect(() => createRuntimeSaveV0(program, session, {
      metaProgress: createMetaProgressV0("project.foreign", "progress.local.default")
    })).toThrow("Meta Progress");
  });

  it("does not mutate event or merge inputs", () => {
    const left = apply(empty(), event("textRead", "text.left"));
    const right = apply(empty(), event("cgUnlocked", "cg.right"));
    const beforeLeft = canonicalStringify(left);
    const beforeRight = canonicalStringify(right);
    const merged = mergeMetaProgressV0(left, right);
    expect(merged.changed).toBe(true);
    expect(canonicalStringify(left)).toBe(beforeLeft);
    expect(canonicalStringify(right)).toBe(beforeRight);
  });

  it("matches the fixed VM-13 Meta Progress hash and Save reference", () => {
    const progress = apply(
      empty("progress.golden"),
      event("textRead", "text.golden.a"),
      event("textRead", "text.golden.b"),
      event("cgUnlocked", "cg.golden"),
      event("endingReached", "ending.golden")
    );
    expect([metaProgressHashV0(progress), metaProgressReferenceIdV0(progress)]).toEqual([
      "7f3ef6562bef4d6a3e24ac796dfe7df7b5c935147d75e8ec7c356c2613be920b",
      "meta.7f3ef6562bef4d6a3e24ac796dfe7df7b5c935147d75e8ec7c356c2613be920b"
    ]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject, type RuntimeSourceMapV1, type RuntimeStoryIrV1 } from "@world-studio/project-compiler";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1, RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1, advanceRuntimeHistoryV1, backRuntimeHistoryV1, canonicalRuntimeStringify, createRuntimeHistorySessionV1, createRuntimeSaveV1, createRuntimeSchedulerSessionV1, createRuntimeSessionSaveV1, createRuntimeState, createRuntimeStoryOutcomeV1, drawRuntimeRandom, executeRuntimeBoundedTenThousandV1, executeRuntimeConformanceV1, executeRuntimeGeneratedCorpusChunkV1, forwardRuntimeHistoryV1, loadRuntimeSaveV1, loadRuntimeSessionSaveV1, mapRuntimeDiagnosticsV1, mergeRuntimeMetaProgressV1, runRuntime, runtimeHistoryReconciliationPlanHashV1, runtimeHistorySessionHashV1, runtimeMetaProgressHashV1, runtimeStateHashV1, scheduleRuntimeBatchV1, summarizeRuntimeGeneratedCorpusV1, validateRuntimeHistorySessionV1, validateRuntimeMetaProgressV1, validateRuntimeSchedulerSessionV1, validateRuntimeSourceMapV1, type RuntimeChoiceInputV1, type RuntimeDiagnosticV1, type RuntimeHistorySessionV1, type RuntimeMetaProgressV1, type RuntimeSchedulePolicyV1, type RuntimeScheduleResultV1, type RuntimeSchedulerSessionV1, type RuntimeStateV1 } from "./index";

function branching(): { readonly story: RuntimeStoryIrV1; readonly sourceMap: RuntimeSourceMapV1; readonly buildId: string } {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/branching/project.s0.json"), "utf8")) as S0Project;
  const result = compileProject(loadProject(migrateS0Project(source).files));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return { story: result.artifacts.story, sourceMap: result.artifacts.sourceMap, buildId: result.artifacts.manifest.buildId };
}

function start(story: RuntimeStoryIrV1, buildId = "build-test", variables: Readonly<Record<string, boolean | number | string | null>> = {}): RuntimeStateV1 {
  const result = createRuntimeState(story, { buildId, executionId: "execution-test", initialVariables: variables });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.state;
}

function program(instructions: RuntimeStoryIrV1["scenes"][number]["instructions"]): RuntimeStoryIrV1 {
  return { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-test", entrySceneId: "main", scenes: [{ sceneId: "main", instructions }] };
}

function select(state: RuntimeStateV1, optionId: string, inputId = "input-choice"): RuntimeChoiceInputV1 {
  const pending = state.pendingChoice;
  if (pending === null) throw new Error("choice is not pending");
  return { schemaVersion: 1, kind: "choiceSelected", inputId, executionId: state.executionId, expectedStateRevision: state.stateRevision, logicalSequence: pending.logicalSequence, requestId: pending.requestId, instructionId: pending.instructionId, optionId };
}

describe("N31-E1 formal narrative runtime", () => {
  it("executes Compiler IR through a choice, dialogue, and exact ending", () => {
    const { story, buildId } = branching();
    const initial = start(story, buildId);
    const choice = runRuntime(story, initial);
    expect(choice.event).toMatchObject({ kind: "choice", instructionId: "branch_prompt" });
    const line = runRuntime(story, choice.state, { input: select(choice.state, "branch_left_option") });
    expect(line.event).toMatchObject({ kind: "dialogue", text: "The quiet route." });
    const ending = runRuntime(story, line.state);
    expect(ending.event).toEqual({ kind: "ending", instructionId: "branch_left_end", endingId: "branch_left_end", name: "Left" });
    expect(ending.state.terminal).toEqual({ kind: "ended", endingId: "branch_left_end", name: "Left" });
  });

  it("is deterministic for the same IR, state, and input", () => {
    const { story, buildId } = branching();
    const initial = start(story, buildId);
    expect(runRuntime(story, initial)).toEqual(runRuntime(story, initial));
  });

  it("rejects stale or mismatched choice input without changing state", () => {
    const { story, buildId } = branching();
    const waiting = runRuntime(story, start(story, buildId)).state;
    const result = runRuntime(story, waiting, { input: { ...select(waiting, "branch_left_option"), expectedStateRevision: waiting.stateRevision - 1 } });
    expect(result.state).toBe(waiting);
    expect(result.diagnostics[0]?.code).toBe("RUNTIME_INPUT_STALE");
  });

  it("executes labels, set expressions, conditions, call/return, and logical wait", () => {
    const story = program([
      { instructionId: "set", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "binary", operator: "+", left: { kind: "literal", value: 1 }, right: { kind: "literal", value: 2 } } } },
      { instructionId: "condition", opcode: "condition", operands: { targetLabel: "call", expressionAst: { kind: "binary", operator: "==", left: { kind: "identifier", name: "score" }, right: { kind: "literal", value: 3 } } } },
      { instructionId: "wrong", opcode: "end", operands: { endingId: "wrong", name: "Wrong" } },
      { instructionId: "call-label", opcode: "label", operands: { name: "call" } },
      { instructionId: "call", opcode: "call", operands: { targetLabel: "sub" } },
      { instructionId: "wait", opcode: "wait", operands: { durationMilliseconds: 250 } },
      { instructionId: "done", opcode: "end", operands: { endingId: "done", name: "Done" } },
      { instructionId: "sub-label", opcode: "label", operands: { name: "sub" } },
      { instructionId: "return", opcode: "return", operands: {} }
    ]);
    const waited = runRuntime(story, start(story, "build", { score: 0 }));
    expect(waited.event).toEqual({ kind: "wait", instructionId: "wait", durationMilliseconds: 250 });
    expect(waited.state.variables.score).toBe(3);
    expect(waited.state.logicalTimeMilliseconds).toBe(250);
    expect(waited.state.callStack).toEqual([]);
    expect(runRuntime(story, waited.state).event).toMatchObject({ kind: "ending", endingId: "done" });
  });

  it("rejects a future IR version before execution", () => {
    const { story } = branching();
    const future = { ...story, irVersion: "2.0.0" } as unknown as RuntimeStoryIrV1;
    const result = createRuntimeState(future, { buildId: "build", executionId: "execution" });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_INCOMPATIBLE_IR" }] });
  });

  it("rejects an unknown future opcode instead of guessing its behavior", () => {
    const story = program([{ instructionId: "future", opcode: "teleport" as never, operands: {} }]);
    const result = createRuntimeState(story, { buildId: "build", executionId: "execution" });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_INVALID_IR" }] });
  });

  it("halts a closed internal loop at the deterministic instruction budget", () => {
    const story = program([
      { instructionId: "loop-label", opcode: "label", operands: { name: "loop" } },
      { instructionId: "loop", opcode: "jump", operands: { targetLabel: "loop" } }
    ]);
    const result = runRuntime(story, start(story), { instructionBudget: 8 });
    expect(result.executedInstructions).toBe(8);
    expect(result.diagnostics[0]?.code).toBe("RUNTIME_BUDGET_EXCEEDED");
  });

  it("rejects tampered State identity without mutation", () => {
    const { story, buildId } = branching();
    const state = { ...start(story, buildId), projectId: "other" };
    const result = runRuntime(story, state);
    expect(result.state).toBe(state);
    expect(result.diagnostics[0]?.code).toBe("RUNTIME_INVALID_STATE");
  });
});

describe("N31-E2 deterministic state foundations", () => {
  it("produces a frozen canonical State Hash independent of record insertion order", () => {
    const story = program([{ instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }]);
    const left = start(story, "build", { alpha: 1, beta: 2 });
    const right = start(story, "build", { beta: 2, alpha: 1 });
    expect(runtimeStateHashV1(left)).toBe(runtimeStateHashV1(right));
    expect(runtimeStateHashV1(left)).toBe("78aacc0af3e9a6506e611d7b03a720b78974db44502d55fd67c0e1a5dee2655f");
    expect(runtimeStateHashV1({ ...left, logicalTimeMilliseconds: 1 })).not.toBe(runtimeStateHashV1(left));
  });

  it("uses canonical Unicode, key ordering, and safe-integer rules", () => {
    expect(canonicalRuntimeStringify({ z: 1, a: "世界" })).toBe('{"a":"世界","z":1}');
    expect(() => canonicalRuntimeStringify({ value: 0.5 })).toThrow("safe integers");
    expect(() => canonicalRuntimeStringify({ value: "e\u0301" })).toThrow("Unicode NFC");
  });

  it("draws a revision-safe deterministic PRNG vector without environment randomness", () => {
    const story = program([{ instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }]);
    const initial = start(story);
    const first = drawRuntimeRandom(initial, { expectedStateRevision: 0, minimum: 10, maximum: 99 });
    expect(first).toMatchObject({ ok: true, value: 13, state: { stateRevision: 1, prng: { algorithm: "xorshift32-v1", state: 1085196063, draws: 1 } } });
    if (!first.ok) throw new Error("draw failed");
    const stale = drawRuntimeRandom(first.state, { expectedStateRevision: 0, minimum: 10, maximum: 99 });
    expect(stale).toMatchObject({ ok: false, state: first.state, diagnostics: [{ code: "RUNTIME_INPUT_STALE" }] });
  });

  it("reduces background, character, and audio directions into logical State", () => {
    const story = program([
      { instructionId: "bg", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_gate" } } },
      { instructionId: "show", opcode: "direction", operands: { command: "show", parameters: { action: "show", asset: "char_aya", slot: "aya", expression: "smile" } } },
      { instructionId: "audio", opcode: "direction", operands: { command: "audio", parameters: { action: "play", asset: "bgm_theme", bus: "bgm", loop: true, volumePermille: 750 } } },
      { instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }
    ]);
    const background = runRuntime(story, start(story));
    expect(background.state.sceneState.backgroundAssetId).toBe("bg_gate");
    const character = runRuntime(story, background.state);
    expect(character.state.sceneState.characters.aya).toEqual({ assetId: "char_aya", expression: "smile" });
    const audio = runRuntime(story, character.state);
    expect(audio.state.audioState.tracks.bgm).toEqual({ assetId: "bgm_theme", status: "playing", loop: true, volumePermille: 750 });
    expect(audio.state.metaProgress.unlockedGalleryAssetIds).toEqual(["bg_gate", "char_aya"]);
  });

  it("records read text and reached endings as sorted monotonic Meta Progress", () => {
    const story = program([
      { instructionId: "line", opcode: "narration", operands: { textId: "text_z", text: "Line" } },
      { instructionId: "line-again", opcode: "narration", operands: { textId: "text_z", text: "Line" } },
      { instructionId: "end", opcode: "end", operands: { endingId: "ending_a", name: "Done" } }
    ]);
    const once = runRuntime(story, start(story));
    const twice = runRuntime(story, once.state);
    const ended = runRuntime(story, twice.state);
    expect(ended.state.metaProgress).toMatchObject({ readTextIds: ["text_z"], reachedEndingIds: ["ending_a"] });
  });

  it("rejects corrupt PRNG, Scene, Audio, Meta, and noncanonical State without mutation", () => {
    const story = program([{ instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }]);
    const initial = start(story);
    const corruptions: RuntimeStateV1[] = [
      { ...initial, prng: { ...initial.prng, state: 0 } },
      { ...initial, sceneState: { ...initial.sceneState, backgroundAssetId: "bad id" } },
      { ...initial, audioState: { tracks: { bgm: { assetId: "audio", status: "playing", loop: false, volumePermille: 1001 } } } },
      { ...initial, metaProgress: { ...initial.metaProgress, readTextIds: ["z", "a"] } },
      { ...initial, variables: { bad: 0.5 } }
    ];
    for (const state of corruptions) {
      const result = runRuntime(story, state);
      expect(result.state).toBe(state);
      expect(result.diagnostics[0]?.code).toBe("RUNTIME_INVALID_STATE");
    }
  });

  it("freezes the Node host conformance vector consumed by the Web Worker harness", () => {
    expect(executeRuntimeConformanceV1()).toEqual({
      schemaVersion: 1,
      runtimeVersion: "0.6.0",
      initialStateHash: "78aacc0af3e9a6506e611d7b03a720b78974db44502d55fd67c0e1a5dee2655f",
      randomValue: 13,
      randomStateHash: "665d97b3e8252d2901fee615ebf39e21eb7465d27d10b2af5c24429b041b2978",
      endingStateHash: "36587b7f9e4f95a51575e1d5270c43f7b045347b0084ae2e1d8e35db76383700",
      reachedEndingIds: ["done"],
      effectIntentHash: "ae85cfea2908822b25f52c60fa4a602f2f36b7a204ae157023d91a7103268992",
      effectIssuedStateHash: "9b3637dfae72873e2ad30cdb17b7075883352c1d1b8a4ea98c276402b3f8ca61",
      effectCompletedStateHash: "6d67b6cc6dfc4dee3fd5387cf8a522491a06dd849d7d61ca1f0609208a6e2855",
      barrierRequestId: "barrier.62b95f219800e9bad704d050252bddea054d18c84cd27a5f41e84498d19d3eaf",
      barrierCommittedStateHash: "521c60c7cc0f1f33530fe95aac2617b4b520293af9ad198110296601fbdf85b7",
      saveArtifactHash: "16a362a9def60c478121d4195475876f0beddc0397bb9f0e8a838b1372d2a094",
      rehydratedEffectId: "effect.d79a3a9f688842936460611f2fd9a3505574511865833e165d05ca0e7337d577",
      rehydratedStateHash: "9b3637dfae72873e2ad30cdb17b7075883352c1d1b8a4ea98c276402b3f8ca61",
      historyBackStateHash: "57a2ced75466c817204a4086ad43af65a76a9935f330a63b1e48d6b31e8b0a4b",
      historyForwardStateHash: "4753549ffbaf6c03b97c55894b1731e4dc095603d7b30417e6cf5c7e09db4d58",
      historyForkStateHash: "32ddaa3542d151b5301c8441cd8dfee007ccf5e1bdc2afb61549e29f235c9d0b",
      historySessionHash: "075c7ed5b0b45c860a28ba9efa6e026f6dd6e38b3bba0c7d388aec9b88335a0f",
      historyTombstoneInputId: "input-history-left",
      sessionSaveArtifactHash: "45ffc3f41cc27b9134d5cffab4eec0952f4c58cb35026fce45d7478da5c173e5",
      sessionSaveHistoryHash: "075c7ed5b0b45c860a28ba9efa6e026f6dd6e38b3bba0c7d388aec9b88335a0f",
      sessionSaveCursor: 2,
      sessionSaveBackStateHash: "f93c1dc5cbc0e83439f5462a1aa51337b8bf400809a4cfc1096fdac134f00f72",
      sessionSaveForwardStateHash: "32ddaa3542d151b5301c8441cd8dfee007ccf5e1bdc2afb61549e29f235c9d0b",
      metaProgressHash: "346bcc949e6e08fa3de252e4afe7a01816a61c8ed56c47aac35806c9603cb1f8",
      metaBackProgressHash: "3c0e071936fceec176d39224409ee097bad8be2e650d3251d7e083dca2119f56",
      metaLoadProgressHash: "346bcc949e6e08fa3de252e4afe7a01816a61c8ed56c47aac35806c9603cb1f8",
      historyBarrierCode: "RUNTIME_BARRIER_BLOCKED",
      schedulerFinalStateHash: "4817233c4c9113e2d35b1aae0d33600d1210d44e6accd1bccc2abc29d308f0e4",
      schedulerNormalHistoryHash: "93bd7599a52295678809ba508806d921e64d263ceb2013079d7f1e234f3d7407",
      schedulerInstantHistoryHash: "93bd7599a52295678809ba508806d921e64d263ceb2013079d7f1e234f3d7407",
      schedulerAutoDelayMilliseconds: 90,
      schedulerYieldAccumulatedInstructions: 1,
      schedulerBarrierStopReason: "barrier",
      sourceDiagnosticCode: "RUNTIME_VARIABLE_MISSING",
      sourceDiagnosticStatus: "instruction",
      sourceDiagnosticInstructionIndex: 0,
      sourceDiagnosticStatementId: "source_statement",
      sourceDiagnosticStatementIndex: 3,
      boundedTenThousand: {
        schemaVersion: 1,
        iterationCount: 10_000,
        instructionBudget: 128,
        batchCount: 235,
        budgetYieldCount: 234,
        maximumBatchInstructions: 128,
        totalExecutedInstructions: 30_002,
        finalCounter: 10_000,
        finalStateHash: "42110c453cb13998f4701bfd177075f607b25ba127c8b943889cff30a2702a8f",
        finalOutcomeHash: "b03e5becefe06de891422ebaf767ff11b50bd7b4951ceb7f5225456cf441d327",
        finalHistoryHash: "28207f6823e05033e702e80911d81f6be5bf293232d72afa2f13839a8eabe6de"
      },
      formalVmParity: {
        schemaVersion: 1,
        recursiveOverflowCode: "RUNTIME_CALL_STACK_OVERFLOW",
        recursiveStateHash: "7cdd7cb813eeedd8a6bfb69b81f7995885cd75377683cf8c63cdfc34c25104e7",
        randomContinuationValues: [17, -18, -7, -36, 38],
        randomContinuationStateHash: "4138275f03eefb8daed5b5730112892e1b89bb87050c1216d5335df847cf5718",
        sceneLateCompletionCode: "RUNTIME_EFFECT_CANCELLED",
        sceneStateHash: "0d648a00f4e50677178ebde1e5d3d8325a5ae5499fa50cceca771adf239d15c8",
        backReconciliationHash: "6c711096c41979f942c52faab29963da91379b8dbe531081580116fa6dfbb939",
        forwardReconciliationHash: "f28334923af7048f8a8cfc0ee0b1c3bb2eb65eed69c5f780707d337a94621322",
        compensationKind: "background.restore",
        replayDescriptorId: "reversible-bg",
        futureOpcodeCode: "RUNTIME_INVALID_IR",
        activeSessionStateHash: "17b3209f3890990a7805317e1869d662d142143bfe8427d054c66c090f4f52f3",
        storyOutcomeHash: "85d860f97ece840d43272dcb89673dd602e3dfed94c0043a9ca73b748cd737c3",
        purePresentationOutcomeHash: "85d860f97ece840d43272dcb89673dd602e3dfed94c0043a9ca73b748cd737c3",
        pendingOutcomeCode: "RUNTIME_OUTCOME_NOT_QUIESCENT"
      }
    });
  });
});

describe("N31-E3 formal Effect and Barrier protocol", () => {
  function effectStory(parameters: Readonly<Record<string, string | number | boolean>>): RuntimeStoryIrV1 {
    return program([
      { instructionId: "effect-direction", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_effect", ...parameters } } },
      { instructionId: "effect-end", opcode: "end", operands: { endingId: "effect_done", name: "Done" } }
    ]);
  }

  function complete(state: RuntimeStateV1, inputId = "input-effect-complete") {
    const effect = state.pendingEffect;
    if (effect === null) throw new Error("effect is not pending");
    return { schemaVersion: 1 as const, kind: "effectCompleted" as const, inputId, executionId: state.executionId, expectedStateRevision: state.stateRevision, logicalSequence: effect.logicalSequence, effectId: effect.effectId, replayKey: effect.replayKey };
  }

  function cancel(state: RuntimeStateV1, inputId = "input-effect-cancel") {
    const effect = state.pendingEffect;
    if (effect === null) throw new Error("effect is not pending");
    return { schemaVersion: 1 as const, kind: "effectCancelled" as const, inputId, executionId: state.executionId, expectedStateRevision: state.stateRevision, logicalSequence: effect.logicalSequence, effectId: effect.effectId, cancellationScope: effect.cancellationScope };
  }

  it("issues a deterministic awaited Effect and accepts one matching completion receipt", () => {
    const story = effectStory({ awaitMode: "awaited", replayKey: "replay.effect", cancellationScope: "scope.effect" });
    const initial = start(story);
    const issued = runRuntime(story, initial);
    expect(issued.effects).toHaveLength(1);
    expect(issued.effects[0]).toMatchObject({ policy: "pure", awaitMode: "awaited", kind: "background.set", logicalSequence: 0 });
    expect(issued.state.cursor).toEqual(initial.cursor);
    expect(issued.state.sceneState.backgroundAssetId).toBeNull();
    expect(runRuntime(story, issued.state).diagnostics[0]?.code).toBe("RUNTIME_EFFECT_REQUIRED");
    const input = complete(issued.state);
    const completed = runRuntime(story, issued.state, { input });
    expect(completed.event).toMatchObject({ kind: "ending", endingId: "effect_done" });
    expect(completed.state.sceneState.backgroundAssetId).toBe("bg_effect");
    expect(completed.state.inputReceipts).toEqual([{ input, acceptedAtRevision: 2 }]);
  });

  it("rejects foreign, stale, out-of-order, and wrong-token Effect results without mutation", () => {
    const story = effectStory({ awaitMode: "awaited", replayKey: "replay.effect", cancellationScope: "scope.effect" });
    const waiting = runRuntime(story, start(story)).state;
    const valid = complete(waiting);
    const cases = [
      { input: { ...valid, executionId: "execution-foreign" }, code: "RUNTIME_INPUT_STALE" },
      { input: { ...valid, expectedStateRevision: valid.expectedStateRevision - 1 }, code: "RUNTIME_INPUT_STALE" },
      { input: { ...valid, logicalSequence: valid.logicalSequence + 1 }, code: "RUNTIME_INPUT_OUT_OF_ORDER" },
      { input: { ...valid, replayKey: "replay.foreign" }, code: "RUNTIME_INPUT_MISMATCH" }
    ] as const;
    for (const item of cases) { const result = runRuntime(story, waiting, { input: item.input }); expect(result.state).toBe(waiting); expect(result.diagnostics[0]?.code).toBe(item.code); }
  });

  it("makes duplicate input IDs idempotent and conflicting payloads fail closed", () => {
    const story = effectStory({ awaitMode: "awaited" });
    const waiting = runRuntime(story, start(story)).state, input = complete(waiting);
    const completed = runRuntime(story, waiting, { input }).state;
    expect(runRuntime(story, completed, { input })).toMatchObject({ state: completed, diagnostics: [], effects: [] });
    const conflict = runRuntime(story, completed, { input: { ...input, replayKey: "replay.changed" } });
    expect(conflict.state).toBe(completed);
    expect(conflict.diagnostics[0]?.code).toBe("RUNTIME_INPUT_ID_CONFLICT");
  });

  it("cancels an awaited scope and rejects its late completion", () => {
    const story = effectStory({ awaitMode: "awaited", cancellationScope: "scope.effect" });
    const waiting = runRuntime(story, start(story)).state;
    const late = complete(waiting, "input-effect-late"), cancelled = runRuntime(story, waiting, { input: cancel(waiting) });
    expect(cancelled.event).toMatchObject({ kind: "ending", endingId: "effect_done" });
    expect(cancelled.state.sceneState.backgroundAssetId).toBeNull();
    const result = runRuntime(story, cancelled.state, { input: late });
    expect(result.state).toBe(cancelled.state);
    expect(result.diagnostics[0]?.code).toBe("RUNTIME_EFFECT_CANCELLED");
  });

  it("requires an exact approval before committing an irreversible Barrier", () => {
    const story = effectStory({ effectPolicy: "barrier", barrierReason: "External irreversible operation." });
    const requested = runRuntime(story, start(story));
    expect(requested.effects).toEqual([]);
    expect(requested.state.sceneState.backgroundAssetId).toBeNull();
    const request = requested.barrierRequest;
    if (request === null) throw new Error("barrier is not pending");
    const approval = { schemaVersion: 1 as const, kind: "barrierApproved" as const, inputId: "input-barrier-approve", executionId: requested.state.executionId, expectedStateRevision: requested.state.stateRevision, logicalSequence: request.logicalSequence, requestId: request.requestId, descriptorId: request.descriptorId };
    const forged = runRuntime(story, requested.state, { input: { ...approval, descriptorId: "descriptor.foreign" } });
    expect(forged.state).toBe(requested.state);
    expect(forged.diagnostics[0]?.code).toBe("RUNTIME_INPUT_MISMATCH");
    const committed = runRuntime(story, requested.state, { input: approval });
    expect(committed.effects[0]?.policy).toBe("barrier");
    expect(committed.state.sceneState.backgroundAssetId).toBe("bg_effect");
    expect(committed.state.barrierLedger).toEqual([{ effectId: committed.effects[0]?.effectId, descriptorId: "effect-direction", reason: "External irreversible operation.", committedAtRevision: 2 }]);
  });

  it("emits detached effects immediately and rejects malformed reversible metadata", () => {
    const detached = runRuntime(effectStory({}), start(effectStory({})));
    expect(detached.effects[0]).toMatchObject({ policy: "pure", awaitMode: "detached" });
    expect(detached.state.sceneState.backgroundAssetId).toBe("bg_effect");
    const malformedStory = effectStory({ effectPolicy: "reversible" });
    expect(runRuntime(malformedStory, start(malformedStory)).diagnostics[0]?.code).toBe("RUNTIME_INVALID_IR");
    const reversibleStory = effectStory({ effectPolicy: "reversible", compensationKind: "background.restore" });
    expect(runRuntime(reversibleStory, start(reversibleStory)).effects[0]?.compensation).toEqual({ kind: "background.restore", payload: {} });
  });
});

describe("N31-E4 canonical Runtime Save and rehydration", () => {
  function awaitedStory(): RuntimeStoryIrV1 {
    return program([
      { instructionId: "save-effect", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_saved", awaitMode: "awaited", replayKey: "replay.saved", cancellationScope: "scope.saved" } } },
      { instructionId: "save-end", opcode: "end", operands: { endingId: "saved_done", name: "Saved" } }
    ]);
  }

  function save(story: RuntimeStoryIrV1, state: RuntimeStateV1) {
    const result = createRuntimeSaveV1(story, state);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result;
  }

  it("round-trips one canonical Save with stable State and artifact hashes", () => {
    const story = program([{ instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }]);
    const state = start(story, "build-save", { beta: 2, alpha: 1 });
    const created = save(story, state), repeated = save(story, state);
    expect(created.serialized).toBe(repeated.serialized);
    expect(created.artifactHash).toBe(repeated.artifactHash);
    expect(created.save.stateHash).toBe(runtimeStateHashV1(state));
    const loaded = loadRuntimeSaveV1(story, created.serialized, { expectedBuildId: "build-save" });
    expect(loaded).toMatchObject({ ok: true, state, rehydration: { kind: "ready" }, artifactHash: created.artifactHash });
  });

  it("rehydrates the exact pending Effect without replaying it and accepts its completion", () => {
    const story = awaitedStory(), waiting = runRuntime(story, start(story, "build-save")).state;
    const effect = waiting.pendingEffect;
    if (effect === null) throw new Error("effect is not pending");
    const loaded = loadRuntimeSaveV1(story, save(story, waiting).serialized, { expectedBuildId: "build-save" });
    if (!loaded.ok || loaded.rehydration.kind !== "effect") throw new Error("effect did not rehydrate");
    expect(loaded.rehydration.intent).toEqual(effect);
    expect(runtimeStateHashV1(loaded.state)).toBe(runtimeStateHashV1(waiting));
    const completed = runRuntime(story, loaded.state, { input: { schemaVersion: 1, kind: "effectCompleted", inputId: "input-after-load", executionId: loaded.state.executionId, expectedStateRevision: loaded.state.stateRevision, logicalSequence: effect.logicalSequence, effectId: effect.effectId, replayKey: effect.replayKey } });
    expect(completed.effects).toEqual([]);
    expect(completed.event).toMatchObject({ kind: "ending", endingId: "saved_done" });
    expect(completed.state.sceneState.backgroundAssetId).toBe("bg_saved");
  });

  it("rejects a validly encoded but tampered State by its frozen State Hash", () => {
    const story = program([{ instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }]);
    const created = save(story, start(story, "build-save"));
    const parsed = JSON.parse(created.serialized) as { state: RuntimeStateV1 };
    parsed.state = { ...parsed.state, logicalTimeMilliseconds: 1 };
    expect(loadRuntimeSaveV1(story, canonicalRuntimeStringify(parsed), { expectedBuildId: "build-save" })).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_SAVE_HASH_MISMATCH" }] });
  });

  it("rejects future Save versions and a different Build before exposing State", () => {
    const story = program([{ instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }]);
    const created = save(story, start(story, "build-save"));
    const future = { ...(JSON.parse(created.serialized) as Record<string, unknown>), schemaVersion: 2 };
    expect(loadRuntimeSaveV1(story, canonicalRuntimeStringify(future), { expectedBuildId: "build-save" })).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_SAVE_INCOMPATIBLE" }] });
    expect(loadRuntimeSaveV1(story, created.serialized, { expectedBuildId: "build-other" })).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_SAVE_BUILD_MISMATCH" }] });
  });

  it("rejects noncanonical JSON and structurally corrupt State without throwing", () => {
    const story = program([{ instructionId: "end", opcode: "end", operands: { endingId: "done", name: "Done" } }]);
    const created = save(story, start(story, "build-save"));
    expect(loadRuntimeSaveV1(story, `${created.serialized}\n`, { expectedBuildId: "build-save" })).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_SAVE_INVALID" }] });
    const corrupt = JSON.parse(created.serialized) as { state: Record<string, unknown> };
    corrupt.state = { schemaVersion: 1 };
    expect(() => loadRuntimeSaveV1(story, canonicalRuntimeStringify(corrupt), { expectedBuildId: "build-save" })).not.toThrow();
    const result = loadRuntimeSaveV1(story, canonicalRuntimeStringify(corrupt), { expectedBuildId: "build-save" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("corrupt Save loaded");
    expect(result.diagnostics[0]?.code).toBe("RUNTIME_SAVE_INVALID");
    const unknown = JSON.parse(created.serialized) as { state: RuntimeStateV1 & { futureMember?: number }; stateHash: string };
    unknown.state.futureMember = 1;
    unknown.stateHash = runtimeStateHashV1(unknown.state);
    const unknownResult = loadRuntimeSaveV1(story, canonicalRuntimeStringify(unknown), { expectedBuildId: "build-save" });
    expect(unknownResult.ok).toBe(false);
    if (unknownResult.ok) throw new Error("unknown State member loaded");
    expect(unknownResult.diagnostics[0]?.code).toBe("RUNTIME_SAVE_INVALID");
  });
});

describe("N31-E5 canonical Runtime History", () => {
  function history(story: RuntimeStoryIrV1, state: RuntimeStateV1 = start(story, "build-history")): RuntimeHistorySessionV1 {
    const created = createRuntimeHistorySessionV1(story, state);
    expect(created.diagnostics).toEqual([]);
    return created.session;
  }

  it("builds a canonical checkpoint chain and restores exact State hashes with Back and Forward", () => {
    const { story, buildId } = branching();
    let session = history(story, start(story, buildId));
    const choice = advanceRuntimeHistoryV1(story, session);
    expect(choice.event).toMatchObject({ kind: "choice" });
    session = choice.session;
    const beforeChoiceHash = runtimeStateHashV1(choice.state);
    const left = advanceRuntimeHistoryV1(story, session, { input: select(choice.state, "branch_left_option", "input-history-left") });
    expect(left.event).toMatchObject({ kind: "dialogue", text: "The quiet route." });
    expect(validateRuntimeHistorySessionV1(story, left.session)).toEqual([]);
    const sessionHash = runtimeHistorySessionHashV1(left.session);
    expect(sessionHash).toHaveLength(64);
    const back = backRuntimeHistoryV1(story, left.session);
    expect(back.diagnostics).toEqual([]);
    expect(back.reconciliationRequired).toBe(true);
    expect(runtimeStateHashV1(back.state)).not.toBe(beforeChoiceHash);
    expect(back.state.metaProgress).toEqual(left.state.metaProgress);
    const forward = forwardRuntimeHistoryV1(story, back.session);
    expect(runtimeStateHashV1(forward.state)).toBe(runtimeStateHashV1(left.state));
    expect(runtimeHistorySessionHashV1(forward.session)).not.toBe(sessionHash);
    expect(validateRuntimeHistorySessionV1(story, forward.session)).toEqual([]);
  });

  it("requires Forward for recorded input and atomically truncates it for a changed branch", () => {
    const { story, buildId } = branching();
    const waiting = advanceRuntimeHistoryV1(story, history(story, start(story, buildId)));
    const oldInput = select(waiting.state, "branch_left_option", "input-history-left");
    const left = advanceRuntimeHistoryV1(story, waiting.session, { input: oldInput });
    const back = backRuntimeHistoryV1(story, left.session);
    expect(advanceRuntimeHistoryV1(story, back.session).diagnostics[0]?.code).toBe("RUNTIME_HISTORY_FORWARD_REQUIRED");
    expect(advanceRuntimeHistoryV1(story, back.session, { input: oldInput }).diagnostics[0]?.code).toBe("RUNTIME_HISTORY_FORWARD_REQUIRED");
    const invalid = advanceRuntimeHistoryV1(story, back.session, { input: select(back.state, "missing-option", "input-history-invalid") });
    expect(invalid.diagnostics[0]?.code).toBe("RUNTIME_CHOICE_MISMATCH");
    expect(invalid.session).toBe(back.session);
    const rightInput = select(back.state, "branch_right_option", "input-history-right");
    const right = advanceRuntimeHistoryV1(story, back.session, { input: rightInput });
    expect(right.event).toMatchObject({ kind: "dialogue", text: "The bright route." });
    expect(right.session.entries).toHaveLength(2);
    expect(right.session.inputTombstones).toEqual([oldInput]);
    expect(advanceRuntimeHistoryV1(story, right.session, { input: rightInput }).session).toBe(right.session);
    expect(forwardRuntimeHistoryV1(story, right.session).diagnostics[0]?.code).toBe("RUNTIME_HISTORY_AT_END");
  });

  it("rejects a conflicting reused tombstone ID without mutating the branched Session", () => {
    const { story, buildId } = branching();
    const waiting = advanceRuntimeHistoryV1(story, history(story, start(story, buildId)));
    const left = advanceRuntimeHistoryV1(story, waiting.session, { input: select(waiting.state, "branch_left_option", "input-reused") });
    const back = backRuntimeHistoryV1(story, left.session);
    const right = advanceRuntimeHistoryV1(story, back.session, { input: select(back.state, "branch_right_option", "input-right") });
    const rewound = backRuntimeHistoryV1(story, right.session);
    const conflict = advanceRuntimeHistoryV1(story, rewound.session, { input: select(rewound.state, "branch_right_option", "input-reused") });
    expect(conflict.diagnostics[0]?.code).toBe("RUNTIME_INPUT_ID_CONFLICT");
    expect(conflict.session).toBe(rewound.session);
  });

  it("blocks Back across a committed Barrier and exposes its exact reason", () => {
    const story = program([
      { instructionId: "history-barrier", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_barrier", effectPolicy: "barrier", barrierReason: "External publish cannot be reversed." } } },
      { instructionId: "history-end", opcode: "end", operands: { endingId: "done", name: "Done" } }
    ]);
    const requested = advanceRuntimeHistoryV1(story, history(story));
    const pending = requested.state.pendingBarrier;
    if (pending === null) throw new Error("barrier is not pending");
    const committed = advanceRuntimeHistoryV1(story, requested.session, { input: { schemaVersion: 1, kind: "barrierApproved", inputId: "input-history-barrier", executionId: requested.state.executionId, expectedStateRevision: requested.state.stateRevision, logicalSequence: pending.logicalSequence, requestId: pending.requestId, descriptorId: pending.descriptorId } });
    const blocked = backRuntimeHistoryV1(story, committed.session);
    expect(blocked.diagnostics[0]).toMatchObject({ code: "RUNTIME_BARRIER_BLOCKED", message: expect.stringContaining("External publish cannot be reversed.") });
    expect(blocked.barrierBlock).toMatchObject({ descriptorId: "history-barrier", reason: "External publish cannot be reversed." });
    expect(blocked.session).toBe(committed.session);
  });

  it("rejects checkpoint and entry tampering before navigation", () => {
    const story = program([{ instructionId: "history-line", opcode: "narration", operands: { textId: "history_text", text: "History" } }]);
    const advanced = advanceRuntimeHistoryV1(story, history(story));
    const checkpointTamper = { ...advanced.session, checkpoints: [advanced.session.checkpoints[0]!, { ...advanced.session.checkpoints[1]!, stateHash: "0".repeat(64) }] };
    expect(validateRuntimeHistorySessionV1(story, checkpointTamper)[0]?.code).toBe("RUNTIME_HISTORY_INVALID");
    const entryTamper = { ...advanced.session, entries: [{ ...advanced.session.entries[0]!, executedInstructions: 99 }] };
    expect(backRuntimeHistoryV1(story, entryTamper).diagnostics[0]?.code).toBe("RUNTIME_HISTORY_INVALID");
    const effectTamper = { ...advanced.session, entries: [{ ...advanced.session.entries[0]!, effects: [{ policy: "reversible", compensation: null }] }] } as unknown as RuntimeHistorySessionV1;
    expect(backRuntimeHistoryV1(story, effectTamper).diagnostics[0]?.code).toBe("RUNTIME_HISTORY_INVALID");
    const malformed = { ...advanced.session, checkpoints: [{ checkpointId: "missing-state" }] } as unknown as RuntimeHistorySessionV1;
    expect(() => validateRuntimeHistorySessionV1(story, malformed)).not.toThrow();
    expect(validateRuntimeHistorySessionV1(story, malformed)[0]?.code).toBe("RUNTIME_HISTORY_INVALID");
  });
});

describe("N31-E11 canonical Runtime Session Save", () => {
  function history(story: RuntimeStoryIrV1, state: RuntimeStateV1): RuntimeHistorySessionV1 {
    const created = createRuntimeHistorySessionV1(story, state);
    if (created.diagnostics.length > 0) throw new Error(JSON.stringify(created.diagnostics));
    return created.session;
  }

  function save(story: RuntimeStoryIrV1, session: RuntimeHistorySessionV1) {
    const created = createRuntimeSessionSaveV1(story, session);
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics));
    return created;
  }

  it("restores cursor, recorded future, tombstones, and exact Back/Forward behavior", () => {
    const { story, buildId } = branching();
    const waiting = advanceRuntimeHistoryV1(story, history(story, start(story, buildId)));
    const left = advanceRuntimeHistoryV1(story, waiting.session, { input: select(waiting.state, "branch_left_option", "input-session-left") });
    const forkPoint = backRuntimeHistoryV1(story, left.session);
    const right = advanceRuntimeHistoryV1(story, forkPoint.session, { input: select(forkPoint.state, "branch_right_option", "input-session-right") });
    const savedAtFork = backRuntimeHistoryV1(story, right.session);
    const expectedSessionHash = runtimeHistorySessionHashV1(savedAtFork.session);
    const created = save(story, savedAtFork.session);
    const repeated = save(story, savedAtFork.session);
    expect(repeated.serialized).toBe(created.serialized);
    expect(repeated.artifactHash).toBe(created.artifactHash);
    const loaded = loadRuntimeSessionSaveV1(story, created.serialized, { expectedBuildId: buildId });
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    expect(loaded.session).toEqual(savedAtFork.session);
    expect(loaded.session).not.toBe(savedAtFork.session);
    expect(loaded.session.cursor).toBe(1);
    expect(loaded.session.entries).toHaveLength(2);
    expect(loaded.session.inputTombstones.map((input) => input.inputId)).toEqual(["input-session-left"]);
    expect(runtimeHistorySessionHashV1(loaded.session)).toBe(expectedSessionHash);
    expect(loaded.artifactHash).toHaveLength(64);
    expect(runtimeStateHashV1(loaded.state)).toBe(runtimeStateHashV1(savedAtFork.state));
    const forwarded = forwardRuntimeHistoryV1(story, loaded.session);
    expect(forwarded.diagnostics).toEqual([]);
    expect(runtimeStateHashV1(forwarded.state)).toBe(runtimeStateHashV1(right.state));
    const backed = backRuntimeHistoryV1(story, forwarded.session);
    expect(runtimeStateHashV1(backed.state)).toBe(runtimeStateHashV1(loaded.state));
  });

  it("rehydrates a pending Effect from the active History checkpoint", () => {
    const story = program([
      { instructionId: "session-effect", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_session", awaitMode: "awaited", replayKey: "replay.session", cancellationScope: "scope.session" } } },
      { instructionId: "session-end", opcode: "end", operands: { endingId: "done", name: "Done" } }
    ]);
    const waiting = advanceRuntimeHistoryV1(story, history(story, start(story, "build-session")));
    const loaded = loadRuntimeSessionSaveV1(story, save(story, waiting.session).serialized, { expectedBuildId: "build-session" });
    if (!loaded.ok || loaded.rehydration.kind !== "effect") throw new Error("pending Effect did not rehydrate");
    expect(loaded.rehydration.intent).toEqual(waiting.state.pendingEffect);
    expect(runtimeStateHashV1(loaded.state)).toBe(runtimeStateHashV1(waiting.state));
  });

  it("fails closed for incompatible, noncanonical, unknown, hash-tampered, and structurally corrupt saves", () => {
    const { story, buildId } = branching();
    const waiting = advanceRuntimeHistoryV1(story, history(story, start(story, buildId)));
    const created = save(story, waiting.session);
    const raw = JSON.parse(created.serialized) as Record<string, unknown>;
    const cases: ReadonlyArray<readonly [unknown, string]> = [
      [{ ...raw, schemaVersion: 2 }, "RUNTIME_SAVE_INCOMPATIBLE"],
      [{ ...raw, futureMember: true }, "RUNTIME_SAVE_INVALID"],
      [{ ...raw, executionId: "execution-foreign" }, "RUNTIME_SAVE_INVALID"],
      [{ ...raw, cursor: 0 }, "RUNTIME_SAVE_INVALID"],
      [{ ...raw, historyHash: "0".repeat(64) }, "RUNTIME_SAVE_HASH_MISMATCH"]
    ];
    for (const [value, code] of cases) {
      const loaded = loadRuntimeSessionSaveV1(story, canonicalRuntimeStringify(value), { expectedBuildId: buildId });
      expect(loaded).toMatchObject({ ok: false, diagnostics: [{ code }] });
      expect("session" in loaded).toBe(false);
      expect("state" in loaded).toBe(false);
    }
    expect(loadRuntimeSessionSaveV1(story, created.serialized, { expectedBuildId: "build-foreign" })).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_SAVE_BUILD_MISMATCH" }] });
    expect(loadRuntimeSessionSaveV1(story, `${created.serialized}\n`, { expectedBuildId: buildId })).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_SAVE_INVALID" }] });

    const corrupt = JSON.parse(created.serialized) as { history: RuntimeHistorySessionV1; historyHash: string };
    corrupt.history = { ...corrupt.history, checkpoints: [{ ...corrupt.history.checkpoints[0]!, stateHash: "0".repeat(64) }, ...corrupt.history.checkpoints.slice(1)] };
    corrupt.historyHash = runtimeHistorySessionHashV1(corrupt.history);
    const rejected = loadRuntimeSessionSaveV1(story, canonicalRuntimeStringify(corrupt), { expectedBuildId: buildId });
    expect(rejected).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_SAVE_INVALID" }, { code: "RUNTIME_HISTORY_INVALID" }] });
    expect("session" in rejected).toBe(false);
  });
});

describe("N31-E12 monotonic Meta Progress boundary", () => {
  function metaStory(): RuntimeStoryIrV1 {
    return program([
      { instructionId: "meta-line", opcode: "narration", operands: { textId: "text.meta", text: "Remember this." } },
      { instructionId: "meta-cg", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "cg.meta" } } },
      { instructionId: "meta-end", opcode: "end", operands: { endingId: "ending.meta", name: "Remembered" } }
    ]);
  }

  function history(story: RuntimeStoryIrV1): RuntimeHistorySessionV1 {
    return createRuntimeHistorySessionV1(story, start(story, "build-meta")).session;
  }

  it("preserves read, Gallery, and ending progress across repeated Back and Forward", () => {
    const story = metaStory();
    const line = advanceRuntimeHistoryV1(story, history(story));
    const cg = advanceRuntimeHistoryV1(story, line.session);
    const ended = advanceRuntimeHistoryV1(story, cg.session);
    const expected = ended.state.metaProgress;
    const backFromEnding = backRuntimeHistoryV1(story, ended.session);
    const backFromCg = backRuntimeHistoryV1(story, backFromEnding.session);
    expect(backFromEnding.state.metaProgress).toEqual(expected);
    expect(backFromCg.state.metaProgress).toEqual(expected);
    expect(forwardRuntimeHistoryV1(story, backFromCg.session).state.metaProgress).toEqual(expected);
    expect(validateRuntimeHistorySessionV1(story, backFromCg.session)).toEqual([]);
  });

  it("loads older State and Session saves without rolling newer progress backward", () => {
    const story = metaStory();
    const line = advanceRuntimeHistoryV1(story, history(story));
    const oldStateSave = createRuntimeSaveV1(story, line.state);
    const oldSessionSave = createRuntimeSessionSaveV1(story, line.session);
    if (!oldStateSave.ok || !oldSessionSave.ok) throw new Error("older saves were not created");
    const cg = advanceRuntimeHistoryV1(story, line.session);
    const ended = advanceRuntimeHistoryV1(story, cg.session);
    const current = ended.state.metaProgress;
    const stateLoaded = loadRuntimeSaveV1(story, oldStateSave.serialized, { expectedBuildId: "build-meta", currentMetaProgress: current });
    const sessionLoaded = loadRuntimeSessionSaveV1(story, oldSessionSave.serialized, { expectedBuildId: "build-meta", currentMetaProgress: current });
    if (!stateLoaded.ok || !sessionLoaded.ok) throw new Error("older saves did not load");
    expect(stateLoaded.state.metaProgress).toEqual(current);
    expect(sessionLoaded.state.metaProgress).toEqual(current);
    expect(sessionLoaded.session.checkpoints[sessionLoaded.session.cursor]?.state.metaProgress).toEqual(current);
    expect(stateLoaded.artifactHash).toBe(oldStateSave.artifactHash);
    expect(sessionLoaded.artifactHash).toBe(oldSessionSave.artifactHash);
  });

  it("merges commutatively, associatively, and idempotently with an isolated fixed hash", () => {
    const empty = start(metaStory(), "build-meta").metaProgress;
    const progress = (readTextIds: readonly string[], unlockedGalleryAssetIds: readonly string[], reachedEndingIds: readonly string[]): RuntimeMetaProgressV1 => ({ ...empty, readTextIds, unlockedGalleryAssetIds, reachedEndingIds });
    const a = progress(["text.a"], ["cg.a"], []), b = progress(["text.b"], [], ["ending.b"]), c = progress([], ["cg.c"], ["ending.c"]);
    const ab = mergeRuntimeMetaProgressV1(a, b), ba = mergeRuntimeMetaProgressV1(b, a);
    if (!ab.ok || !ba.ok) throw new Error("Meta merge failed");
    expect(ab.progress).toEqual(ba.progress);
    const left = mergeRuntimeMetaProgressV1(ab.progress, c), bc = mergeRuntimeMetaProgressV1(b, c);
    if (!left.ok || !bc.ok) throw new Error("Meta merge failed");
    const right = mergeRuntimeMetaProgressV1(a, bc.progress);
    if (!right.ok) throw new Error("Meta merge failed");
    expect(left.progress).toEqual(right.progress);
    const idempotent = mergeRuntimeMetaProgressV1(left.progress, left.progress);
    expect(idempotent).toMatchObject({ ok: true, changed: false });
    expect(runtimeMetaProgressHashV1(left.progress)).toBe("3781e0d49383a58af283f09a748415c2b9841ef6f01fb099744a1ae923cfe8b3");
  });

  it("fails closed for foreign scopes and malformed monotonic sets", () => {
    const story = metaStory(), current = start(story, "build-meta").metaProgress;
    const foreign = { ...current, progressScopeId: "progress.foreign" };
    expect(mergeRuntimeMetaProgressV1(current, foreign)).toMatchObject({ ok: false, progress: current, diagnostics: [{ code: "RUNTIME_META_PROGRESS_INCOMPATIBLE" }] });
    const malformed = { ...current, readTextIds: ["text.z", "text.a"] };
    expect(validateRuntimeMetaProgressV1(malformed)[0]?.code).toBe("RUNTIME_META_PROGRESS_INVALID");
    const save = createRuntimeSaveV1(story, start(story, "build-meta"));
    const sessionSave = createRuntimeSessionSaveV1(story, history(story));
    if (!save.ok || !sessionSave.ok) throw new Error("save failed");
    const rejected = loadRuntimeSaveV1(story, save.serialized, { expectedBuildId: "build-meta", currentMetaProgress: foreign });
    const rejectedSession = loadRuntimeSessionSaveV1(story, sessionSave.serialized, { expectedBuildId: "build-meta", currentMetaProgress: foreign });
    expect(rejected).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_META_PROGRESS_INCOMPATIBLE" }] });
    expect(rejectedSession).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_META_PROGRESS_INCOMPATIBLE" }] });
    expect("state" in rejected).toBe(false);
    expect("state" in rejectedSession).toBe(false);
  });
});

describe("N31-E13 bounded 10,000-step conformance", () => {
  it("yields at 128 instructions and freezes the final State, Outcome, and History", () => {
    const first = executeRuntimeBoundedTenThousandV1();
    const second = executeRuntimeBoundedTenThousandV1();
    expect(second).toEqual(first);
    expect(first).toEqual({
      schemaVersion: 1,
      iterationCount: 10_000,
      instructionBudget: 128,
      batchCount: 235,
      budgetYieldCount: 234,
      maximumBatchInstructions: 128,
      totalExecutedInstructions: 30_002,
      finalCounter: 10_000,
      finalStateHash: "42110c453cb13998f4701bfd177075f607b25ba127c8b943889cff30a2702a8f",
      finalOutcomeHash: "b03e5becefe06de891422ebaf767ff11b50bd7b4951ceb7f5225456cf441d327",
      finalHistoryHash: "28207f6823e05033e702e80911d81f6be5bf293232d72afa2f13839a8eabe6de"
    });
  });
});

describe("N31-E6 deterministic Runtime scheduling", () => {
  function policy(overrides: Partial<RuntimeSchedulePolicyV1> = {}): RuntimeSchedulePolicyV1 {
    return {
      schemaVersion: 1,
      mode: "normal",
      skipActivation: null,
      speed: "normal",
      stopInstructionIds: [],
      unavailableEffectDescriptorIds: [],
      instantInstructionBudget: 256,
      autoTiming: { baseDelayMilliseconds: 20, millisecondsPerReadableUnit: 3, readableUnits: 10, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 10 },
      ...overrides
    };
  }

  function scheduler(story: RuntimeStoryIrV1, state: RuntimeStateV1 = start(story, "build-scheduler")): RuntimeSchedulerSessionV1 {
    const history = createRuntimeHistorySessionV1(story, state);
    if (history.diagnostics.length > 0) throw new Error(JSON.stringify(history.diagnostics));
    const created = createRuntimeSchedulerSessionV1(story, history.session);
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics));
    return created.session;
  }

  function toTerminal(story: RuntimeStoryIrV1, initial: RuntimeSchedulerSessionV1, schedule: RuntimeSchedulePolicyV1): { readonly session: RuntimeSchedulerSessionV1; readonly results: readonly RuntimeScheduleResultV1[] } {
    let session = initial;
    const results: RuntimeScheduleResultV1[] = [];
    for (let batch = 0; batch < 64 && session.workingState.terminal.kind === "running"; batch += 1) {
      const result = scheduleRuntimeBatchV1(story, session, schedule);
      expect(result.diagnostics).toEqual([]);
      expect(result.executedInstructions).toBeGreaterThan(0);
      results.push(result);
      session = result.session;
    }
    expect(session.workingState.terminal.kind).toBe("ended");
    return { session, results };
  }

  function scheduleStory(): RuntimeStoryIrV1 {
    return program([
      { instructionId: "schedule-set-one", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "literal", value: 1 } } },
      { instructionId: "schedule-read", opcode: "narration", operands: { textId: "text_read", text: "Read" } },
      { instructionId: "schedule-add", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "binary", operator: "+", left: { kind: "identifier", name: "score" }, right: { kind: "literal", value: 2 } } } },
      { instructionId: "schedule-wait", opcode: "wait", operands: { durationMilliseconds: 30 } },
      { instructionId: "schedule-unread", opcode: "narration", operands: { textId: "text_unread", text: "Unread" } },
      { instructionId: "schedule-end", opcode: "end", operands: { endingId: "schedule_done", name: "Done" } }
    ]);
  }

  it("executes Normal, 5/10/20/40, and Instant through identical State and History boundaries", () => {
    const story = scheduleStory(), initial = start(story, "build-scheduler", { score: 0 });
    const normal = toTerminal(story, scheduler(story, initial), policy());
    for (const speed of [5, 10, 20, 40, "instant"] as const) {
      const skipped = toTerminal(story, scheduler(story, initial), policy({ mode: "skipAll", skipActivation: "toggle", speed, instantInstructionBudget: 3 }));
      expect(runtimeStateHashV1(skipped.session.workingState)).toBe(runtimeStateHashV1(normal.session.workingState));
      expect(skipped.session.history.entries).toHaveLength(normal.session.history.entries.length);
      expect(skipped.session.workingState.variables.score).toBe(3);
      expect(skipped.session.workingState.logicalTimeMilliseconds).toBe(30);
    }
    const held = toTerminal(story, scheduler(story, initial), policy({ mode: "skipAll", skipActivation: "hold", speed: 20 }));
    const toggled = toTerminal(story, scheduler(story, initial), policy({ mode: "skipAll", skipActivation: "toggle", speed: 20 }));
    expect(runtimeHistorySessionHashV1(held.session.history)).toBe(runtimeHistorySessionHashV1(toggled.session.history));
    expect(normal.session.history.entries).toHaveLength(4);
  });

  it("yields Instant inside internal instructions and commits one atomic History step at the visible boundary", () => {
    const story = program([
      { instructionId: "yield-label-a", opcode: "label", operands: { name: "a" } },
      { instructionId: "yield-set", opcode: "set", operands: { variableId: "score", expressionAst: { kind: "literal", value: 7 } } },
      { instructionId: "yield-label-b", opcode: "label", operands: { name: "b" } },
      { instructionId: "yield-line", opcode: "narration", operands: { textId: "yield_text", text: "Yield" } }
    ]);
    let session = scheduler(story, start(story, "build-scheduler", { score: 0 }));
    for (let batch = 0; batch < 3; batch += 1) {
      const yielded = scheduleRuntimeBatchV1(story, session, policy({ mode: "skipAll", skipActivation: "hold", speed: "instant", instantInstructionBudget: 1 }));
      expect(yielded.stopReason).toBe("budget");
      expect(yielded.session.history.entries).toHaveLength(0);
      expect(validateRuntimeSchedulerSessionV1(story, yielded.session)).toEqual([]);
      session = yielded.session;
    }
    const visible = scheduleRuntimeBatchV1(story, session, policy({ mode: "skipAll", skipActivation: "hold", speed: "instant", instantInstructionBudget: 1 }));
    expect(visible.events).toEqual([{ kind: "narration", instructionId: "yield-line", textId: "yield_text", text: "Yield" }]);
    expect(visible.session.history.entries).toHaveLength(1);
    expect(visible.session.history.entries[0]?.executedInstructions).toBe(4);
    expect(visible.session.workingState.variables.score).toBe(7);
  });

  it("stops Skip Read after the first unread text without changing scheduling-independent State", () => {
    const story = scheduleStory();
    const base = start(story, "build-scheduler", { score: 0 });
    const readState = { ...base, metaProgress: { ...base.metaProgress, readTextIds: ["text_read"] } };
    const skipped = scheduleRuntimeBatchV1(story, scheduler(story, readState), policy({ mode: "skipRead", skipActivation: "toggle", speed: "instant" }));
    expect(skipped.stopReason).toBe("unreadBoundary");
    expect(skipped.events.map((event) => event.instructionId)).toEqual(["schedule-read", "schedule-wait", "schedule-unread"]);
    let normalSession = scheduler(story, readState);
    for (let index = 0; index < 3; index += 1) normalSession = scheduleRuntimeBatchV1(story, normalSession, policy()).session;
    expect(runtimeStateHashV1(skipped.state)).toBe(runtimeStateHashV1(normalSession.workingState));
  });

  it("computes Auto delay outside State and matches Normal at the same boundary", () => {
    const story = scheduleStory(), initial = scheduler(story, start(story, "build-scheduler", { score: 0 }));
    const normal = scheduleRuntimeBatchV1(story, initial, policy());
    const auto = scheduleRuntimeBatchV1(story, initial, policy({ mode: "auto", autoTiming: { baseDelayMilliseconds: 20, millisecondsPerReadableUnit: 3, readableUnits: 10, voiceDurationMilliseconds: 80, voiceTailMilliseconds: 10 } }));
    expect(auto.stopReason).toBe("storyBoundary");
    expect(auto.autoAdvanceDelayMilliseconds).toBe(90);
    expect(runtimeStateHashV1(auto.state)).toBe(runtimeStateHashV1(normal.state));
  });

  it("rolls back an unavailable Effect step and stops on configured points, Choice, awaited Effect, and Barrier", () => {
    const unavailableStory = program([{ instructionId: "unavailable-effect", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_missing" } } }]);
    const unavailableSession = scheduler(unavailableStory);
    const unavailable = scheduleRuntimeBatchV1(unavailableStory, unavailableSession, policy({ mode: "skipAll", skipActivation: "toggle", speed: 20, unavailableEffectDescriptorIds: ["unavailable-effect"] }));
    expect(unavailable).toMatchObject({ stopReason: "resourceUnavailable", executedInstructions: 0, effects: [] });
    expect(unavailable.session).toBe(unavailableSession);

    const stopStory = program([{ instructionId: "manual-stop", opcode: "narration", operands: { textId: "stop_text", text: "Stop" } }]);
    expect(scheduleRuntimeBatchV1(stopStory, scheduler(stopStory), policy({ mode: "skipAll", skipActivation: "toggle", speed: 20, stopInstructionIds: ["manual-stop"] }))).toMatchObject({ stopReason: "stopPoint", events: [{ instructionId: "manual-stop" }] });

    const choiceStory = program([{ instructionId: "schedule-choice", opcode: "choice", operands: { prompt: "Choose", options: [{ optionId: "stay", label: "Stay", targetSceneId: "main" }] } }]);
    expect(scheduleRuntimeBatchV1(choiceStory, scheduler(choiceStory), policy({ mode: "skipAll", skipActivation: "toggle", speed: 20 })).stopReason).toBe("input");
    const awaitedStory = program([{ instructionId: "schedule-effect", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_effect", awaitMode: "awaited" } } }]);
    expect(scheduleRuntimeBatchV1(awaitedStory, scheduler(awaitedStory), policy({ mode: "skipAll", skipActivation: "toggle", speed: 20 })).stopReason).toBe("effect");
    const barrierStory = program([{ instructionId: "schedule-barrier", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_barrier", effectPolicy: "barrier", barrierReason: "Confirm" } } }]);
    expect(scheduleRuntimeBatchV1(barrierStory, scheduler(barrierStory), policy({ mode: "skipAll", skipActivation: "toggle", speed: 20 })).stopReason).toBe("barrier");
  });

  it("rejects malformed policy and Scheduler Session without mutating History", () => {
    const story = scheduleStory(), initial = scheduler(story, start(story, "build-scheduler", { score: 0 }));
    const invalidPolicy = { ...policy(), instantInstructionBudget: 0 };
    const rejected = scheduleRuntimeBatchV1(story, initial, invalidPolicy);
    expect(rejected.diagnostics[0]?.code).toBe("RUNTIME_SCHEDULER_INVALID");
    expect(rejected.session).toBe(initial);
    const malformed = { ...initial, accumulatedInstructions: -1 };
    expect(validateRuntimeSchedulerSessionV1(story, malformed)[0]?.code).toBe("RUNTIME_SCHEDULER_INVALID");
    expect(scheduleRuntimeBatchV1(story, malformed, policy()).session).toBe(malformed);
  });
});

describe("N31-E7 formal Runtime generated corpus", () => {
  it("executes 10,000 frozen seeds twice with no failures", () => {
    const chunks = [];
    for (let start = 0; start < RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1; start += RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1) {
      chunks.push(executeRuntimeGeneratedCorpusChunkV1(start, Math.min(start + RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1, RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1)));
    }
    expect(summarizeRuntimeGeneratedCorpusV1(chunks)).toEqual({
      schemaVersion: 1,
      corpusId: "corpus.generated.runtime.v1",
      seedCount: 10_000,
      replayExecutions: 20_000,
      chunkCount: 40,
      scenarioCounts: {
        "control-flow": 1429,
        random: 1429,
        "effect-cancellation": 1429,
        "save-load": 1429,
        "choice-history": 1428,
        "scheduler-equivalence": 1428,
        "diagnostic-rollback": 1428
      },
      failedSeeds: [],
      outcomeDigest: "20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2"
    });
  }, 90_000);

  it("rejects oversized, noncontiguous, and incomplete corpus input", () => {
    expect(() => executeRuntimeGeneratedCorpusChunkV1(0, RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1 + 1)).toThrow("frozen bound");
    const first = executeRuntimeGeneratedCorpusChunkV1(0, 1);
    expect(() => summarizeRuntimeGeneratedCorpusV1([first])).toThrow("frozen seed range");
    expect(() => summarizeRuntimeGeneratedCorpusV1([{ ...first, seedStart: 1 }])).toThrow("non-contiguous");
    expect(() => summarizeRuntimeGeneratedCorpusV1([{ ...first, scenarioCounts: { ...first.scenarioCounts, random: 1 } }])).toThrow("invalid");
    expect(() => summarizeRuntimeGeneratedCorpusV1([{ ...first, outcomes: ["FAILED"] }])).toThrow("invalid");
  });
});

describe("N31-E8 structured Runtime Source Map diagnostics", () => {
  it("maps an instruction failure to the exact Compiler Statement ID", () => {
    const { story, sourceMap, buildId } = branching();
    const firstScene = story.scenes[0]!;
    const malformed: RuntimeStoryIrV1 = { ...story, scenes: [{ ...firstScene, instructions: [{ ...firstScene.instructions[0]!, operands: {} }, ...firstScene.instructions.slice(1)] }, ...story.scenes.slice(1)] };
    const failed = runRuntime(malformed, start(malformed, buildId));
    expect(failed.diagnostics[0]?.code).toBe("RUNTIME_INVALID_IR");
    const mapped = mapRuntimeDiagnosticsV1(malformed, sourceMap, failed.diagnostics);
    expect(mapped).toEqual({ ok: true, diagnostics: [{
      ...failed.diagnostics[0],
      sourceMapStatus: "instruction",
      statementId: "branch_prompt",
      statementIndex: 0
    }] });
  });

  it("uses a valid Runtime cursor as fallback and leaves global diagnostics unmapped", () => {
    const { story, sourceMap, buildId } = branching();
    const initial = createRuntimeHistorySessionV1(story, start(story, buildId));
    const atStart = backRuntimeHistoryV1(story, initial.session);
    const cursorMapped = mapRuntimeDiagnosticsV1(story, sourceMap, atStart.diagnostics);
    expect(cursorMapped).toMatchObject({ ok: true, diagnostics: [{ code: "RUNTIME_HISTORY_AT_START", sourceMapStatus: "cursor", statementId: "branch_prompt", statementIndex: 0 }] });

    const invalidSave = loadRuntimeSaveV1(story, "{}", { expectedBuildId: buildId });
    if (invalidSave.ok) throw new Error("Malformed Save unexpectedly loaded");
    expect(mapRuntimeDiagnosticsV1(story, sourceMap, invalidSave.diagnostics)).toMatchObject({ ok: true, diagnostics: [{ code: "RUNTIME_SAVE_INVALID", sourceMapStatus: "unmapped", statementId: null, statementIndex: null }] });
  });

  it("rejects incomplete, duplicate, misowned, noncanonical, and reordered Source Maps", () => {
    const { story, sourceMap } = branching();
    const first = sourceMap.entries[0]!;
    const firstInLeft = sourceMap.entries[1]!;
    const secondInLeft = sourceMap.entries[2]!;
    const cases: RuntimeSourceMapV1[] = [
      { ...sourceMap, entries: sourceMap.entries.slice(1) },
      { ...sourceMap, entries: [first, first, ...sourceMap.entries.slice(2)] },
      { ...sourceMap, entries: [{ ...first, sceneId: "branch_left" }, ...sourceMap.entries.slice(1)] },
      { ...sourceMap, entries: [{ ...first, statementId: "bad id" }, ...sourceMap.entries.slice(1)] },
      { ...sourceMap, entries: [first, firstInLeft, { ...secondInLeft, statementIndex: firstInLeft.statementIndex }, ...sourceMap.entries.slice(3)] }
    ];
    for (const candidate of cases) expect(validateRuntimeSourceMapV1(story, candidate)[0]?.code).toBe("RUNTIME_SOURCE_MAP_INVALID");
  });

  it("rejects forged Diagnostic locations and unknown schema members", () => {
    const { story, sourceMap } = branching();
    const forged: RuntimeDiagnosticV1 = { code: "RUNTIME_TYPE_MISMATCH", message: "forged", sceneId: "branch_left", instructionIndex: 0, instructionId: "branch_prompt" };
    expect(mapRuntimeDiagnosticsV1(story, sourceMap, [forged])).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_DIAGNOSTIC_INVALID" }] });
    const wrongIndex = { ...forged, sceneId: "branch_start", instructionIndex: 1 };
    expect(mapRuntimeDiagnosticsV1(story, sourceMap, [wrongIndex])).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_DIAGNOSTIC_INVALID" }] });
    const unknown = { ...forged, sceneId: "branch_start", extra: true } as unknown as RuntimeDiagnosticV1;
    expect(mapRuntimeDiagnosticsV1(story, sourceMap, [unknown])).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_DIAGNOSTIC_INVALID" }] });
  });
});

describe("N31-E10 formal VM parity and Story Outcome", () => {
  it("freezes VM-02 recursive call overflow without mutating beyond the 64-frame limit", () => {
    const story = program([
      { instructionId: "recursive-label", opcode: "label", operands: { name: "recursive" } },
      { instructionId: "recursive-call", opcode: "call", operands: { targetLabel: "recursive" } }
    ]);
    const initial = start(story);
    const first = runRuntime(story, initial, { instructionBudget: 256 });
    const replay = runRuntime(story, initial, { instructionBudget: 256 });
    expect(first.diagnostics[0]?.code).toBe("RUNTIME_CALL_STACK_OVERFLOW");
    expect(first.state.callStack).toHaveLength(64);
    expect(first).toEqual(replay);
  });

  it("freezes VM-03 PRNG continuation across canonical Save and Load", () => {
    const story = program([{ instructionId: "random-end", opcode: "end", operands: { endingId: "done", name: "Done" } }]);
    let boundary = start(story);
    for (let index = 0; index < 3; index += 1) {
      const drawn = drawRuntimeRandom(boundary, { expectedStateRevision: boundary.stateRevision, minimum: -50, maximum: 50 });
      if (!drawn.ok) throw new Error(JSON.stringify(drawn.diagnostics));
      boundary = drawn.state;
    }
    const saved = createRuntimeSaveV1(story, boundary);
    if (!saved.ok) throw new Error(JSON.stringify(saved.diagnostics));
    const loaded = loadRuntimeSaveV1(story, saved.serialized, { expectedBuildId: boundary.buildId });
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    const continueFrom = (initial: RuntimeStateV1) => {
      const values: number[] = [];
      let state = initial;
      for (let index = 0; index < 5; index += 1) {
        const drawn = drawRuntimeRandom(state, { expectedStateRevision: state.stateRevision, minimum: -50, maximum: 50 });
        if (!drawn.ok) throw new Error(JSON.stringify(drawn.diagnostics));
        values.push(drawn.value);
        state = drawn.state;
      }
      return { values, state };
    };
    const live = continueFrom(boundary), restored = continueFrom(loaded.state);
    expect(restored.values).toEqual(live.values);
    expect(runtimeStateHashV1(restored.state)).toBe(runtimeStateHashV1(live.state));
  });

  it("freezes VM-07 cancellation across a scene transition and rejects the late completion", () => {
    const story: RuntimeStoryIrV1 = { schemaVersion: 1, irVersion: "1.0.0", projectId: "runtime-test", entrySceneId: "main", scenes: [
      { sceneId: "main", instructions: [
        { instructionId: "old-effect", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_old", awaitMode: "awaited", cancellationScope: "scope.old", replayKey: "replay.old" } } },
        { instructionId: "scene-choice", opcode: "choice", operands: { prompt: "Continue", options: [{ optionId: "fresh", label: "Fresh", targetSceneId: "fresh" }] } }
      ] },
      { sceneId: "fresh", instructions: [{ instructionId: "fresh-line", opcode: "narration", operands: { textId: "fresh_text", text: "Fresh" } }] }
    ] };
    const issued = runRuntime(story, start(story)), effect = issued.state.pendingEffect;
    if (effect === null) throw new Error("effect is not pending");
    const cancelled = runRuntime(story, issued.state, { input: { schemaVersion: 1, kind: "effectCancelled", inputId: "input-cancel-old", executionId: issued.state.executionId, expectedStateRevision: issued.state.stateRevision, logicalSequence: effect.logicalSequence, effectId: effect.effectId, cancellationScope: effect.cancellationScope } });
    const entered = runRuntime(story, cancelled.state, { input: select(cancelled.state, "fresh", "input-enter-fresh") });
    expect(entered.state.cursor.sceneId).toBe("fresh");
    const beforeLateHash = runtimeStateHashV1(entered.state);
    const late = runRuntime(story, entered.state, { input: { schemaVersion: 1, kind: "effectCompleted", inputId: "input-late-old", executionId: entered.state.executionId, expectedStateRevision: entered.state.stateRevision, logicalSequence: effect.logicalSequence, effectId: effect.effectId, replayKey: effect.replayKey } });
    expect(late.diagnostics[0]?.code).toBe("RUNTIME_EFFECT_CANCELLED");
    expect(runtimeStateHashV1(late.state)).toBe(beforeLateHash);
  });

  it("freezes VM-08 compensation, replay, and Barrier reconciliation paths", () => {
    const story = program([
      { instructionId: "reversible-bg", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_reversible", effectPolicy: "reversible", compensationKind: "background.restore", replayKey: "replay.reversible" } } },
      { instructionId: "reversible-end", opcode: "end", operands: { endingId: "done", name: "Done" } }
    ]);
    const initial = createRuntimeHistorySessionV1(story, start(story));
    const advanced = advanceRuntimeHistoryV1(story, initial.session);
    const back = backRuntimeHistoryV1(story, advanced.session);
    expect(back.reconciliationPlan).toMatchObject({ direction: "back", replayEffects: [], compensations: [{ descriptorId: "reversible-bg", replayKey: "replay.reversible", compensation: { kind: "background.restore", payload: {} } }] });
    expect(runtimeHistoryReconciliationPlanHashV1(back.reconciliationPlan!)).toHaveLength(64);
    const forward = forwardRuntimeHistoryV1(story, back.session);
    expect(forward.reconciliationPlan).toMatchObject({ direction: "forward", compensations: [], replayEffects: [{ descriptorId: "reversible-bg", policy: "reversible" }] });
    expect(forward.reconciliationPlan?.restoreCheckpointId).toBe(advanced.session.checkpoints[1]?.checkpointId);
  });

  it("freezes VM-12 future Opcode rejection without replacing the active Session", () => {
    const story = program([{ instructionId: "safe-line", opcode: "narration", operands: { textId: "safe_text", text: "Safe" } }]);
    const active = runRuntime(story, start(story)).state;
    const saved = createRuntimeSaveV1(story, active);
    if (!saved.ok) throw new Error(JSON.stringify(saved.diagnostics));
    const future = { ...story, scenes: [{ ...story.scenes[0]!, instructions: [{ instructionId: "future-opcode", opcode: "futureOpcode", operands: {} }] }] } as unknown as RuntimeStoryIrV1;
    const beforeHash = runtimeStateHashV1(active), beforeSave = saved.serialized;
    const rejected = loadRuntimeSaveV1(future, saved.serialized, { expectedBuildId: active.buildId });
    expect(rejected).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_INVALID_IR" }] });
    expect(runtimeStateHashV1(active)).toBe(beforeHash);
    expect(saved.serialized).toBe(beforeSave);
  });

  it("freezes VM-15 Story Outcome and ignores detached pure presentation", () => {
    const base = program([
      { instructionId: "outcome-set", opcode: "set", operands: { variableId: "route", expressionAst: { kind: "literal", value: "left" } } },
      { instructionId: "outcome-end", opcode: "end", operands: { endingId: "outcome_done", name: "Done" } }
    ]);
    const withPresentation = program([
      base.scenes[0]!.instructions[0]!,
      { instructionId: "pure-presentation", opcode: "direction", operands: { command: "background", parameters: { action: "set", asset: "bg_pure", effectPolicy: "pure", awaitMode: "detached" } } },
      base.scenes[0]!.instructions[1]!
    ]);
    const baseEnded = runRuntime(base, start(base, "build-outcome", { route: "" })).state;
    const presented = runRuntime(withPresentation, start(withPresentation, "build-outcome", { route: "" }));
    const presentedEnded = runRuntime(withPresentation, presented.state).state;
    const baseOutcome = createRuntimeStoryOutcomeV1(base, baseEnded), presentationOutcome = createRuntimeStoryOutcomeV1(withPresentation, presentedEnded);
    expect(baseOutcome.ok && presentationOutcome.ok && presentationOutcome.outcomeHash).toBe(baseOutcome.ok ? baseOutcome.outcomeHash : "unreachable");
    expect(presentedEnded.sceneState.backgroundAssetId).toBe("bg_pure");
    const pending = runRuntime(program([{ instructionId: "pending-choice", opcode: "choice", operands: { prompt: "Wait", options: [{ optionId: "stay", label: "Stay", targetSceneId: "main" }] } }]), start(program([{ instructionId: "pending-choice", opcode: "choice", operands: { prompt: "Wait", options: [{ optionId: "stay", label: "Stay", targetSceneId: "main" }] } }]))).state;
    expect(createRuntimeStoryOutcomeV1(program([{ instructionId: "pending-choice", opcode: "choice", operands: { prompt: "Wait", options: [{ optionId: "stay", label: "Stay", targetSceneId: "main" }] } }]), pending)).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_OUTCOME_NOT_QUIESCENT" }] });
  });
});

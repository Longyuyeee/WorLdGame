import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject, type RuntimeStoryIrV1 } from "@world-studio/project-compiler";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { advanceRuntimeHistoryV1, backRuntimeHistoryV1, canonicalRuntimeStringify, createRuntimeHistorySessionV1, createRuntimeSaveV1, createRuntimeState, drawRuntimeRandom, executeRuntimeConformanceV1, forwardRuntimeHistoryV1, loadRuntimeSaveV1, runRuntime, runtimeHistorySessionHashV1, runtimeStateHashV1, validateRuntimeHistorySessionV1, type RuntimeChoiceInputV1, type RuntimeHistorySessionV1, type RuntimeStateV1 } from "./index";

function branching(): { readonly story: RuntimeStoryIrV1; readonly buildId: string } {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/branching/project.s0.json"), "utf8")) as S0Project;
  const result = compileProject(loadProject(migrateS0Project(source).files));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return { story: result.artifacts.story, buildId: result.artifacts.manifest.buildId };
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
    expect(runtimeStateHashV1(left)).toBe("a896ffbf427a43c26e8ec9396021bc7c38c52d3ab9d67c3683f8448525d107b1");
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
      runtimeVersion: "0.5.0",
      initialStateHash: "a896ffbf427a43c26e8ec9396021bc7c38c52d3ab9d67c3683f8448525d107b1",
      randomValue: 13,
      randomStateHash: "dc0ceb8b3aa961458d4022ec33bc37d180e505471e83055771e6d974bd621eed",
      endingStateHash: "9f85866867cb8cadee5781bb8fec369f46a681be43dd8a4df89eda43a3be7ec5",
      reachedEndingIds: ["done"],
      effectIntentHash: "ae85cfea2908822b25f52c60fa4a602f2f36b7a204ae157023d91a7103268992",
      effectIssuedStateHash: "6b4228f4fb64221822e102ddcaa71aad1c53ed987a8adeefdfa09b676fabe08c",
      effectCompletedStateHash: "427811dba37b8664e7d9b3300d6f6e05d4a147dd207a59b583cd3c6dd081d886",
      barrierRequestId: "barrier.62b95f219800e9bad704d050252bddea054d18c84cd27a5f41e84498d19d3eaf",
      barrierCommittedStateHash: "2ba4b47cb9e52d0dab9ff224c49ed40dd74848f3e41cc12f81ef7a8373691dd0",
      saveArtifactHash: "7d07a19cf7625f1cc165845742b2a60864738ae5679d0e4df6ca1c3f89493680",
      rehydratedEffectId: "effect.d79a3a9f688842936460611f2fd9a3505574511865833e165d05ca0e7337d577",
      rehydratedStateHash: "6b4228f4fb64221822e102ddcaa71aad1c53ed987a8adeefdfa09b676fabe08c",
      historyBackStateHash: "5475e655dbdfdd18c838f85151473a839e190f7bda0dab74243bf3ae9337fb7a",
      historyForwardStateHash: "58d4a8b6bbca607226c05127ea7514f98008a7e9317ac4ee3199cf7ed87cc99f",
      historyForkStateHash: "ff93d34ff22204a6fa489ae7a31bb8d4a696c2e2a6ab81460717f1c0c7cea88c",
      historySessionHash: "5eb97952d5ea84edf7030fb069b4ba5885ef53f4c9c314868418ccecb4635b69",
      historyTombstoneInputId: "input-history-left",
      historyBarrierCode: "RUNTIME_BARRIER_BLOCKED"
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
    expect(runtimeStateHashV1(back.state)).toBe(beforeChoiceHash);
    const forward = forwardRuntimeHistoryV1(story, back.session);
    expect(runtimeStateHashV1(forward.state)).toBe(runtimeStateHashV1(left.state));
    expect(runtimeHistorySessionHashV1(forward.session)).toBe(sessionHash);
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
    const malformed = { ...advanced.session, checkpoints: [{ checkpointId: "missing-state" }] } as unknown as RuntimeHistorySessionV1;
    expect(() => validateRuntimeHistorySessionV1(story, malformed)).not.toThrow();
    expect(validateRuntimeHistorySessionV1(story, malformed)[0]?.code).toBe("RUNTIME_HISTORY_INVALID");
  });
});

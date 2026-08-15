import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject, type RuntimeStoryIrV1 } from "@world-studio/project-compiler";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { canonicalRuntimeStringify, createRuntimeState, drawRuntimeRandom, executeRuntimeE2ConformanceV1, runRuntime, runtimeStateHashV1, type RuntimeStateV1 } from "./index";

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

describe("N31-E1 formal narrative runtime", () => {
  it("executes Compiler IR through a choice, dialogue, and exact ending", () => {
    const { story, buildId } = branching();
    const initial = start(story, buildId);
    const choice = runRuntime(story, initial);
    expect(choice.event).toMatchObject({ kind: "choice", instructionId: "branch_prompt" });
    const line = runRuntime(story, choice.state, { input: { kind: "choiceSelected", expectedStateRevision: choice.state.stateRevision, instructionId: "branch_prompt", optionId: "branch_left_option" } });
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
    const result = runRuntime(story, waiting, { input: { kind: "choiceSelected", expectedStateRevision: waiting.stateRevision - 1, instructionId: "branch_prompt", optionId: "branch_left_option" } });
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
    expect(runtimeStateHashV1(left)).toBe("9b16cbbcf8c3567c9d764f6d6852a5f7856e1aa53cd4d4d2a3d2efa1ded12360");
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
    expect(executeRuntimeE2ConformanceV1()).toEqual({
      schemaVersion: 1,
      runtimeVersion: "0.2.0",
      initialStateHash: "9b16cbbcf8c3567c9d764f6d6852a5f7856e1aa53cd4d4d2a3d2efa1ded12360",
      randomValue: 13,
      randomStateHash: "a9718fe0a1adaf8e907fb568b4e20e5464aa6deb98024d76fc57912bc4eab84c",
      endingStateHash: "8b0d261ca7074c9d95f9ddf5f54a634e45e3dc3811aa03e8a3cc02b185f40b28",
      reachedEndingIds: ["done"]
    });
  });
});

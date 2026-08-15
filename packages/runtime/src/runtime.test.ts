import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject, type RuntimeStoryIrV1 } from "@world-studio/project-compiler";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { createRuntimeState, runRuntime, type RuntimeStateV1 } from "./index";

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

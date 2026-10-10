import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { analyzeProjectIncremental, compileProjectIncremental } from "./compiler";
import { crossSceneExitDiagnostics } from "./cross-scene-exits";
import type { CompilerSceneCacheEntryV1 } from "./types";

function project(): CanonicalProject {
  return loadProject(migrateS0Project({ schemaVersion: 0, id: "cross_exits", title: "跨场景出口", entrySceneId: "entry", characters: [], scenes: [
    { id: "entry", title: "入口", statements: [{ id: "choose", kind: "choice", prompt: "去哪", options: [
      { id: "safe", label: "结局", targetSceneId: "finish" }, { id: "risk", label: "循环", targetSceneId: "loop_a" }
    ] }] },
    { id: "loop_a", title: "循环 A", statements: [{ id: "a_to_b", kind: "jump", targetLabel: "loop_b" }] },
    { id: "loop_b", title: "循环 B", statements: [{ id: "b_to_a", kind: "jump", targetLabel: "loop_a" }] },
    { id: "finish", title: "结局", statements: [{ id: "done", kind: "end", endingName: "完成" }] }
  ] }).files);
}
function replace(base: CanonicalProject, sceneId: string, statements: readonly JsonObject[]): CanonicalProject {
  return { ...base, scripts: { ...base.scripts, [sceneId]: { ...base.scripts[sceneId]!, statements } } };
}
const cross = (result: ReturnType<typeof analyzeProjectIncremental>) => result.diagnostics.filter((item) => item.code.startsWith("CROSS_SCENE_"));

describe("cross-scene structural exits", () => {
  it("locates an unsafe branch and its closed cycle even when another ending is reachable", () => {
    const result = compileProjectIncremental(project());
    expect(result.ok).toBe(true);
    expect(cross(result)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CROSS_SCENE_NO_EXIT", severity: "warning", sceneId: "entry", statementId: "choose" }),
      expect.objectContaining({ code: "CROSS_SCENE_CLOSED_CYCLE", sceneId: "loop_a", statementId: "a_to_b" }),
      expect.objectContaining({ code: "CROSS_SCENE_CLOSED_CYCLE", sceneId: "loop_b", statementId: "b_to_a" })
    ]));
    expect(cross(result)).toHaveLength(3);
    expect(cross(result).find((item) => item.sceneId === "loop_a")?.message).toContain("「循环 B」");
  });
  it("recomputes global risks after a single cached scene gains an exit", () => {
    const base = project(); const first = compileProjectIncremental(base);
    const fixed = replace(base, "loop_b", [{ id: "b_to_a", kind: "jump", targetLabel: "finish" }]);
    const full = compileProjectIncremental(fixed, { previousCache: first.cache });
    const incremental = analyzeProjectIncremental(fixed, { previousCache: first.cache, trustedChangedSceneIds: ["loop_b"] });
    expect(full.stats.compiledSceneIds).toEqual(["loop_b"]);
    expect(cross(full)).toEqual([]);
    expect(incremental.diagnostics).toEqual(full.diagnostics);
    expect(cross(analyzeProjectIncremental(base, { previousCache: incremental.cache, trustedChangedSceneIds: ["loop_b"] }))).toHaveLength(3);
  });
  it("distinguishes a chain into a dead end from a closed cycle", () => {
    const result = analyzeProjectIncremental(replace(project(), "loop_b", [{ id: "stop", kind: "narration", textId: "stop_text", text: "没有出口" }]));
    expect(cross(result).map((item) => item.code)).toEqual(["CROSS_SCENE_NO_EXIT", "CROSS_SCENE_NO_EXIT"]);
    expect(result.diagnostics.some((item) => item.code === "SCENE_NO_EXIT")).toBe(true);
  });
  it("does not claim unreachable cycles, return-capable calls or conditional exits are closed", () => {
    expect(cross(analyzeProjectIncremental(replace(project(), "entry", [{ id: "only_safe", kind: "jump", targetLabel: "finish" }])))).toEqual([]);
    expect(cross(analyzeProjectIncremental(replace(project(), "loop_b", [{ id: "return_b", kind: "return" }])))).toEqual([]);
    const called = replace(replace(project(), "loop_b", [{ id: "return_b", kind: "return" }]), "loop_a", [
      { id: "call_b", kind: "call", targetLabel: "loop_b" }, { id: "after_call", kind: "jump", targetLabel: "finish" }
    ]);
    expect(cross(analyzeProjectIncremental(called))).toEqual([]);
    expect(cross(analyzeProjectIncremental(replace(project(), "loop_b", [
      { id: "maybe_exit", kind: "condition", expression: "false", targetLabel: "finish" },
      { id: "back", kind: "jump", targetLabel: "loop_a" }
    ])))).toHaveLength(3); // Constant-false exits no longer hide the closed cycle.
  });
  it("treats invalid references as unknown and handles explicit scene self-loops", () => {
    expect(cross(analyzeProjectIncremental(replace(project(), "loop_b", [{ id: "missing", kind: "jump", targetLabel: "missing" }])))).toEqual([]);
    const self = cross(analyzeProjectIncremental(replace(project(), "loop_a", [{ id: "self", kind: "jump", targetLabel: "loop_a" }])));
    expect(self).toHaveLength(2);
    expect(self).toContainEqual(expect.objectContaining({ code: "CROSS_SCENE_CLOSED_CYCLE", statementId: "self" }));
  });
  it("traverses a 10k-scene cycle without recursion and marks every source", () => {
    const sample = compileProjectIncremental(project()).cache.scenes.loop_a!;
    const cache: Record<string, CompilerSceneCacheEntryV1> = {};
    const graph = new Map<string, ReadonlySet<string>>();
    for (let i = 0; i < 10_000; i++) {
      const id = `scene_${i}`, target = `scene_${(i + 1) % 10_000}`;
      cache[id] = { ...sample, scene: { sceneId: id, instructions: [{ instructionId: `jump_${i}`, opcode: "jump", operands: { targetSceneId: target } }] }, diagnostics: [], endings: [], targetSceneIds: [target] };
      graph.set(id, new Set([target]));
    }
    const diagnostics = crossSceneExitDiagnostics(cache, graph, new Set(graph.keys()));
    expect(diagnostics).toHaveLength(10_000);
    expect(diagnostics.every((item) => item.code === "CROSS_SCENE_CLOSED_CYCLE")).toBe(true);
  });
});

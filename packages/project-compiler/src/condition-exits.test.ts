import { expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { analyzeProjectIncremental, compileProjectIncremental } from "./compiler";

const make = (expression: string, local = false): CanonicalProject => {
  const base = loadProject(migrateS0Project({ schemaVersion: 0, id: "condition_exits", title: "条件出口", entrySceneId: "entry", characters: [], scenes: [
  { id: "entry", title: "入口", statements: [{ id: "choose", kind: "choice", prompt: "去哪", options: [{ id: "risk", label: "风险", targetSceneId: "loop" }, { id: "safe", label: "安全", targetSceneId: "finish" }] }] },
  { id: "loop", title: "循环", statements: [
    { id: "condition", kind: "condition", expression, targetLabel: local ? "exit" : "finish" },
    { id: "again", kind: "jump", targetLabel: "loop" },
    ...(local ? [{ id: "label_exit", kind: "label", name: "exit" }, { id: "done_local", kind: "end", endingName: "局部出口" }] : [])
  ] as JsonObject[] },
  { id: "finish", title: "终点", statements: [{ id: "done", kind: "end", endingName: "完成" }] }
] }).files);
  return { ...base, variables: { ...base.variables, variables: [{ id: "score", name: "分数", type: "number", defaultValue: 0 }] } };
};

it.each([false, true])("removes false exits including local labels (%s), and preserves cache/IR", local => {
  const first = compileProjectIncremental(make("1 > 2", local));
  expect(first.ok).toBe(true);
  expect(first.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "CONSTANT_CONDITION_FALSE", statementId: "condition", severity: "warning" }),
    expect.objectContaining({ code: "CROSS_SCENE_CLOSED_CYCLE", statementId: "again" }),
    expect.objectContaining({ code: "CROSS_SCENE_NO_EXIT", statementId: "choose" })
  ]));
  expect(first.cache.scenes.loop!.scene.instructions[0]!.opcode).toBe("condition");
  expect(analyzeProjectIncremental(make("1 > 2", local), { previousCache: first.cache, trustedChangedSceneIds: [] }).diagnostics).toEqual(first.diagnostics);
  const beforeCache = JSON.stringify(first.cache);
  const fixed = make("!false", local);
  const full = compileProjectIncremental(fixed, { previousCache: first.cache });
  const incremental = analyzeProjectIncremental(fixed, { previousCache: first.cache, trustedChangedSceneIds: ["loop"] });
  expect(full.diagnostics).toEqual(incremental.diagnostics);
  expect(full.stats.compiledSceneIds).toEqual(["loop"]);
  expect(full.diagnostics.some(d => d.code.startsWith("CROSS_SCENE_"))).toBe(false);
  expect(full.diagnostics).toContainEqual(expect.objectContaining({ code: "CONSTANT_CONDITION_TRUE", statementId: "condition" }));
  expect(JSON.stringify(first.cache)).toBe(beforeCache);
  expect(analyzeProjectIncremental(make("false", local), { previousCache: incremental.cache, trustedChangedSceneIds: ["loop"] }).diagnostics).toContainEqual(expect.objectContaining({ code: "CROSS_SCENE_CLOSED_CYCLE" }));
});
it("does not treat variable defaults, invalid syntax or runtime failures as constants", () => {
  for (const expression of ["score == 0", "true || score == 0", "1 / 0 > 0", "true trailing", "missing == 0", '"1" == 1']) {
    const result = compileProjectIncremental(make(expression));
    expect(result.diagnostics.filter(d => d.code.startsWith("CONSTANT_CONDITION_")), expression).toEqual([]);
    expect(result.diagnostics.filter(d => d.code.startsWith("CROSS_SCENE_")), expression).toEqual([]);
    if (expression.includes("score")) expect(result.ok).toBe(true);
  }
});
it("does not warn about conditions behind a proven untaken scene edge", () => {
  const base = make("false");
  const project = { ...base, scripts: { ...base.scripts, entry: { ...base.scripts.entry!, statements: [
    { id: "skip_loop", kind: "condition", expression: "false", targetLabel: "loop" },
    { id: "to_finish", kind: "jump", targetLabel: "finish" }
  ] } } };
  const result = compileProjectIncremental(project);
  expect(result.diagnostics.filter(d => d.code.startsWith("CONSTANT_CONDITION_"))).toEqual([expect.objectContaining({ statementId: "skip_loop" })]);
  expect(result.diagnostics.filter(d => d.code.startsWith("CROSS_SCENE_"))).toEqual([]);
});
it("a true local jump cannot use its skipped ending as an exit", () => {
  const base = make("true");
  const project = { ...base, scripts: { ...base.scripts, loop: { ...base.scripts.loop!, statements: [
    { id: "condition", kind: "condition", expression: "true", targetLabel: "repeat" },
    { id: "fake", kind: "end", endingName: "假出口" },
    { id: "repeat_label", kind: "label", name: "repeat" },
    { id: "again", kind: "jump", targetLabel: "loop" }
  ] } } };
  expect(compileProjectIncremental(project).diagnostics).toContainEqual(expect.objectContaining({ code: "CROSS_SCENE_CLOSED_CYCLE", statementId: "again" }));
});

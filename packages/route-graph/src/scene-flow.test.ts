import { describe, expect, it } from "vitest";
import { compileProject } from "@world-studio/project-compiler";
import { createProjectTemplate, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { projectSceneFlow } from "./scene-flow";

function project(statements: readonly JsonObject[]): CanonicalProject {
  const base = createProjectTemplate("Flow", "scene-flow-test");
  const id = base.scenes[0]!.id;
  return { ...base, scripts: { ...base.scripts, [id]: { schemaVersion: 1, sceneId: id, statements } } };
}
describe("scene instruction flow", () => {
  it("shows condition alternatives, merge targets, local cycles, call continuations and dynamic returns", () => {
    const source = project([
      { id: "start", kind: "label", name: "start" },
      { id: "condition", kind: "condition", expression: "true", targetLabel: "merge" },
      { id: "jump", kind: "jump", targetLabel: "merge" },
      { id: "merge", kind: "label", name: "merge" },
      { id: "call", kind: "call", targetLabel: "start" },
      { id: "return", kind: "return" },
      { id: "end", kind: "end", endingName: "done" }
    ]);
    const id = source.scenes[0]!.id;
    const steps = projectSceneFlow(compileProject(source), id);
    expect(steps[1]?.targets).toEqual([{ label: "成立", sceneId: id, statementId: "merge" }, { label: "不成立", sceneId: id, statementId: "jump" }]);
    expect(steps[2]?.targets[0]?.statementId).toBe("merge");
    expect(steps[4]?.targets.map((target) => target.statementId)).toEqual(["start", "return"]);
    expect(steps[5]?.targets[0]?.sceneId).toBeUndefined();
    expect(steps[5]?.targets[0]?.label).toContain("空栈报错");
    expect(steps[6]?.targets[0]?.statementId).toBeUndefined();
  });
  it("marks missing targets and end-of-scene fallthrough without inventing a route", () => {
    const source = project([{ id: "bad", kind: "condition", expression: "true", targetLabel: "absent" }]);
    const steps = projectSceneFlow(compileProject(source), source.scenes[0]!.id);
    expect(steps[0]?.targets[0]?.missing).toBe(true);
    expect(steps[0]?.targets[1]?.label).toContain("无后续语句");
    expect(projectSceneFlow(compileProject(source), "absent")).toEqual([]);
  });
  it("keeps local labels ahead of same-named scenes", () => {
    const base = project([]);
    const id = base.scenes[0]!.id;
    const source = { ...base, scripts: { [id]: { schemaVersion: 1 as const, sceneId: id, statements: [
      { id: "jump", kind: "jump", targetLabel: id }, { id: "local", kind: "label", name: id }
    ] } } };
    expect(projectSceneFlow(compileProject(source), id)[0]?.targets[0]).toMatchObject({ sceneId: id, statementId: "local" });
  });
});

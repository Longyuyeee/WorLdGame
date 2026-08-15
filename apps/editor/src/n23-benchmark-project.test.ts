import { describe, expect, it } from "vitest";
import { loadN23BenchmarkProject } from "./n23-benchmark-project";
import { projectCanonicalForEditor, projectCanonicalFromStory } from "./canonical-project-adapter";

describe("N23 five-minute product fixture", () => {
  it("loads a fresh product-visible copy of the audited Benchmark Golden", () => {
    const first = loadN23BenchmarkProject();
    const second = loadN23BenchmarkProject();
    expect(first).not.toBe(second);
    expect(first).toMatchObject({ id: "golden_benchmark", title: "末班电车前的五分钟", entrySceneId: "benchmark_opening" });
    expect(first.scenes).toHaveLength(3);
    expect(first.characters).toHaveLength(2);
    expect(first.scenes.flatMap((scene) => scene.statements).filter((statement) => statement.kind === "end")).toHaveLength(2);
    const reopened = projectCanonicalForEditor(projectCanonicalFromStory(first, "n23-five-minute-product-entry")).project;
    expect(reopened).toEqual({ ...first, id: reopened.id });
    expect(reopened.id).not.toBe(first.id);
  });
});

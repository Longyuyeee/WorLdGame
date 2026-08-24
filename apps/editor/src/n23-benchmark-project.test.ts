import { describe, expect, it } from "vitest";
import { loadN23BenchmarkProject } from "./n23-benchmark-project";
import { projectCanonicalForEditor, projectCanonicalFromStory } from "./canonical-project-adapter";
import {
  advanceFormalPreview,
  approveFormalPreviewBarrier,
  completeFormalPreviewEffect,
  selectFormalPreviewChoice,
  startFormalPreview,
  type FormalPreviewState
} from "./formal-preview-runtime";

function runRoute(optionId: string): FormalPreviewState {
  let state = startFormalPreview(projectCanonicalFromStory(loadN23BenchmarkProject(), `n23-route-${optionId}`));
  for (let step = 0; step < 100 && state.status !== "ended" && state.status !== "error"; step += 1) {
    if (state.status === "waiting-choice") state = selectFormalPreviewChoice(state, optionId);
    else if (state.status === "waiting-effect") state = completeFormalPreviewEffect(state);
    else if (state.status === "waiting-barrier") state = approveFormalPreviewBarrier(state);
    else state = advanceFormalPreview(state);
  }
  return state;
}

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

  it.each([
    ["benchmark_board", "驶向仍可抵达的清晨"],
    ["benchmark_stay", "雨停以后重新出发"]
  ])("executes the formal Compiler/Runtime route %s to its audited ending", (optionId, endingName) => {
    expect(runRoute(optionId)).toMatchObject({ status: "ended", endingName, diagnostics: [] });
  });
});

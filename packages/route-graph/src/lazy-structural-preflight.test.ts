import { describe, expect, it } from "vitest";
import type { ScriptDocument } from "@world-studio/project-domain";
import { preflightRouteNeutralSceneEdit } from "./lazy-structural-preflight";

const baseline: ScriptDocument = { schemaVersion: 1, sceneId: "scene_main", statements: [
  { id: "statement_choice", kind: "choice", prompt: "Go?", options: [{ id: "option_next", label: "Next", targetSceneId: "scene_next" }] },
  { id: "statement_end", kind: "end", endingName: "Done" }
] };

describe("N40-E8i Route-neutral structural preflight", () => {
  it("accepts a narration insertion without changing Route facts or edges", () => {
    const candidate: ScriptDocument = { ...baseline, statements: [
      { id: "statement_inserted", kind: "narration", textId: "text_inserted", text: "Inserted" },
      ...baseline.statements
    ] };
    expect(preflightRouteNeutralSceneEdit(baseline, candidate, ["statement_inserted"])).toEqual({ ok: true });
  });

  it("rejects a hidden target change even when the inserted statement is valid", () => {
    const candidate: ScriptDocument = { ...baseline, statements: [
      { id: "statement_inserted", kind: "narration", textId: "text_inserted", text: "Inserted" },
      { ...baseline.statements[0]!, options: [{ id: "option_next", label: "Next", targetSceneId: "scene_other" }] },
      baseline.statements[1]!
    ] };
    expect(preflightRouteNeutralSceneEdit(baseline, candidate, ["statement_inserted"])).toMatchObject({ ok: false, code: "ROUTE_SEMANTICS_CHANGED" });
  });
});

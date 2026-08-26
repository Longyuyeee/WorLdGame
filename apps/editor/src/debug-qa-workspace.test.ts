import { describe, expect, it } from "vitest";
import { campusStoryProject } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { runDebugQaInspection } from "./debug-qa-workspace";

describe("Debug & QA workspace projection", () => {
  const project = projectCanonicalFromStory(campusStoryProject, "n43-debug-qa-test");

  it("runs the selected stable ID through the formal Compiler, Runtime and Source Map", () => {
    const report = runDebugQaInspection(project, [], "scn_school_gate", "stmt_gate_001");
    expect(report).toMatchObject({
      status: "ready",
      sourceMapReady: true,
      targetSceneId: "scn_school_gate",
      targetStatementId: "stmt_gate_001",
      errorCount: 0,
      warningCount: 0
    });
    expect(report.runtimeStatus).not.toBe("error");
  });

  it("fails closed on an uncommitted authoring error instead of checking stale canonical content", () => {
    const report = runDebugQaInspection(project, [{
      sceneId: "scn_school_gate",
      diagnostics: [{ code: "PARSE_EXPECTED_TEXT", severity: "error", message: "对白缺少正文", line: 4 }]
    }], "scn_school_gate", "stmt_gate_001");
    expect(report).toMatchObject({
      status: "error",
      runtimeStatus: "blocked-by-authoring",
      sourceMapReady: false,
      errorCount: 1,
      nextAction: "定位首个阻断问题并回到同一稳定 ID 修复"
    });
    expect(report.findings[0]).toMatchObject({ origin: "authoring", sceneId: "scn_school_gate", line: 4 });
  });
});

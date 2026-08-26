import { describe, expect, it } from "vitest";
import { createStudioSession } from "./studio-session";
import { createMobileFocusWorkspaceModel } from "./mobile-focus-workspace";

describe("N43-E7 mobile focus workspace model", () => {
  it("projects project-wide dialogue navigation without replacing stable IDs", () => {
    const session = createStudioSession();
    const model = createMobileFocusWorkspaceModel(session.project, "scn_school_gate", "stmt_gate_001");

    expect(model.current).toMatchObject({
      sceneId: "scn_school_gate",
      statementId: "stmt_gate_001",
      position: 1,
      speakerName: "林夏"
    });
    expect(model.current?.total).toBe(model.dialogueCount);
    expect(model.previous).toBeNull();
    expect(model.next?.statementId).toBe("stmt_gate_002");
  });

  it("offers the active scene's first dialogue when a non-dialogue step is selected", () => {
    const session = createStudioSession();
    const model = createMobileFocusWorkspaceModel(session.project, "scn_school_gate", "stmt_gate_bg");

    expect(model.current).toBeNull();
    expect(model.entry).toMatchObject({ sceneId: "scn_school_gate", statementId: "stmt_gate_001" });
  });
});

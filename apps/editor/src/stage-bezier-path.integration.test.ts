import { describe, expect, it } from "vitest";
import { activeSourceSession, createProjectSnapshot, createStudioSession, reduceStudioSession, restoreStudioSession } from "./studio-session";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { startFormalPreviewFromStatement } from "./formal-preview-runtime";

describe("N42-E9 Bezier path persistence and formal presentation", () => {
  it("survives exact save/reopen and reaches the normalized Runtime host payload", () => {
    let session = createStudioSession();
    const afterId = session.selectedStatementId;
    session = reduceStudioSession(session, {
      type: "insert-direction", commandId: "insert_show", afterId, statementId: "show_hero", command: "show",
      parameters: { action: "show", asset: "hero_asset", slot: "hero", x: "20", y: "80" }
    });
    session = reduceStudioSession(session, {
      type: "insert-direction", commandId: "insert_curve", afterId: "show_hero", statementId: "move_curve", command: "show",
      parameters: {
        action: "move", slot: "hero", x: "80", y: "80", curve: "bezier",
        control1X: "30", control1Y: "20", control2X: "70", control2Y: "20",
        duration: "650ms", easing: "ease-in-out"
      }
    });
    const source = activeSourceSession(session).committedSource;
    expect(source).toContain("@show action=move slot=hero x=80 y=80 curve=bezier control1X=30 control1Y=20 control2X=70 control2Y=20 duration=650ms easing=ease-in-out @id(move_curve)");
    const reopened = restoreStudioSession(createProjectSnapshot(session, 9));
    expect(activeSourceSession(reopened).committedSource).toBe(source);

    const canonical = projectCanonicalFromStory(reopened.project, "n42-e9-bezier");
    const formal = startFormalPreviewFromStatement({
      ...canonical,
      assets: { ...canonical.assets, assets: [...canonical.assets.assets, { assetId: "hero_asset", kind: "character" }] }
    }, reopened.activeSceneId, "move_curve");
    expect(formal).toMatchObject({ status: "presenting", statementId: "move_curve" });
    expect(formal.effectHost.activeByChannel.show?.payload).toMatchObject({
      action: "move", slot: "hero", curve: "bezier", x: 80, y: 80,
      control1X: 30, control1Y: 20, control2X: 70, control2Y: 20
    });
  });
});

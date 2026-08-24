import { describe, expect, it } from "vitest";
import { activeSourceSession, createProjectSnapshot, createStudioSession, reduceStudioSession, restoreStudioSession } from "./studio-session";
import { createStagePlacementPatch } from "./stage-director";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { startFormalPreviewFromStatement } from "./formal-preview-runtime";

describe("N42 Stage director canonical placement", () => {
  it("maps a design-pixel point to a bounded stable-ID semantic patch", () => {
    const result = createStagePlacementPatch({
      id: "stmt_show",
      kind: "direction",
      command: "show",
      summary: "action=show asset=hero slot=lead position=left x=20 y=100"
    }, { x: 1440, y: 486 }, 1920, 1080);

    expect(result).toEqual({
      ok: true,
      statementId: "stmt_show",
      slot: "lead",
      xPercent: 75,
      yPercent: 45,
      parameters: { position: null, x: "75", y: "45" }
    });
  });

  it("fails closed for non-character cues and invalid Stage geometry", () => {
    expect(createStagePlacementPatch({ id: "stmt_bg", kind: "direction", command: "background", summary: "action=clear" }, { x: 10, y: 10 }, 1920, 1080)).toMatchObject({ ok: false, code: "STAGE_CHARACTER_REQUIRED" });
    expect(createStagePlacementPatch({ id: "stmt_hide", kind: "direction", command: "show", summary: "action=hide slot=lead" }, { x: 10, y: 10 }, 1920, 1080)).toMatchObject({ ok: false, code: "STAGE_PLACEMENT_ACTION_UNSUPPORTED" });
    expect(createStagePlacementPatch({ id: "stmt_show", kind: "direction", command: "show", summary: "action=show asset=hero slot=lead" }, { x: Number.NaN, y: 10 }, 1920, 1080)).toMatchObject({ ok: false, code: "STAGE_POINT_INVALID" });
  });

  it("survives save/reopen and reaches the formal Runtime Effect payload", () => {
    let session = createStudioSession();
    const afterId = session.selectedStatementId;
    session = reduceStudioSession(session, {
      type: "insert-direction",
      commandId: "cmd_n42_insert",
      afterId,
      statementId: "stmt_n42_show",
      command: "show",
      parameters: { action: "show", asset: "character_mio", slot: "lead" }
    });
    const statement = session.project.scenes.find((scene) => scene.id === session.activeSceneId)!.statements.find((item) => item.id === "stmt_n42_show")!;
    const placement = createStagePlacementPatch(statement, { x: 1440, y: 486 }, 1920, 1080);
    expect(placement.ok).toBe(true);
    if (!placement.ok) return;
    session = reduceStudioSession(session, {
      type: "patch-direction",
      commandId: "cmd_n42_place",
      statementId: placement.statementId,
      parameters: placement.parameters
    });

    const source = activeSourceSession(session).committedSource;
    expect(source).toContain("@show action=show asset=character_mio slot=lead x=75 y=45 @id(stmt_n42_show)");
    const reopened = restoreStudioSession(createProjectSnapshot(session, 42));
    expect(activeSourceSession(reopened).committedSource).toBe(source);

    const canonical = projectCanonicalFromStory(reopened.project, "n42-stage-placement");
    const formal = startFormalPreviewFromStatement({
      ...canonical,
      assets: { ...canonical.assets, assets: [...canonical.assets.assets, { assetId: "character_mio", kind: "character" }] }
    }, reopened.activeSceneId, "stmt_n42_show");
    expect(formal).toMatchObject({
      status: "presenting",
      statementId: "stmt_n42_show",
      currentEvent: { kind: "direction", command: "show", parameters: { action: "show", asset: "character_mio", slot: "lead", x: "75", y: "45" } }
    });
    expect(formal.effectHost.activeByChannel.show?.payload).toMatchObject({ action: "show", asset: "character_mio", slot: "lead", x: 75, y: 45 });

    const invalid = {
      ...canonical,
      assets: { ...canonical.assets, assets: [...canonical.assets.assets, { assetId: "character_mio", kind: "character" }] },
      scripts: {
        ...canonical.scripts,
        [reopened.activeSceneId]: {
          ...canonical.scripts[reopened.activeSceneId]!,
          statements: canonical.scripts[reopened.activeSceneId]!.statements.map((item) => item.id === "stmt_n42_show" ? { ...item, summary: String(item.summary).replace("x=75", "x=101") } : item)
        }
      }
    };
    expect(startFormalPreviewFromStatement(invalid, reopened.activeSceneId, "stmt_n42_show")).toMatchObject({ status: "error", error: expect.stringContaining("RUNTIME_INVALID_IR") });
  });
});

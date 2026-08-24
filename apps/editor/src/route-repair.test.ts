import { executeScriptSourceCommand } from "@world-studio/story-language";
import { campusStoryProject } from "@world-studio/story-core";
import { describe, expect, it } from "vitest";
import { activeSourceSession, createStudioSession } from "./studio-session";
import { choiceOptionTarget, planRouteChoiceRetarget } from "./route-repair";

describe("N40-E8n Route choice repair contract", () => {
  it("plans one stable-ID P0 operation without mutating the project", () => {
    const before = structuredClone(campusStoryProject);
    const result = planRouteChoiceRetarget(campusStoryProject, "scn_school_gate", "opt_broadcast", "scn_rooftop");
    expect(result).toEqual({
      ok: true,
      plan: {
        schemaVersion: 1,
        sourceSceneId: "scn_school_gate",
        choiceStatementId: "stmt_gate_choice",
        optionId: "opt_broadcast",
        previousTargetSceneId: "scn_broadcast_room",
        targetSceneId: "scn_rooftop",
        operation: { kind: "update", statementId: "opt_broadcast", patch: { targetLabel: "scn_rooftop" } }
      }
    });
    expect(campusStoryProject).toEqual(before);
  });

  it("fails closed for missing source, target, option, and unchanged target", () => {
    expect(planRouteChoiceRetarget(campusStoryProject, "missing", "opt_broadcast", "scn_rooftop")).toMatchObject({ ok: false, code: "SOURCE_SCENE_MISSING" });
    expect(planRouteChoiceRetarget(campusStoryProject, "scn_school_gate", "opt_broadcast", "missing")).toMatchObject({ ok: false, code: "TARGET_SCENE_MISSING" });
    expect(planRouteChoiceRetarget(campusStoryProject, "scn_school_gate", "missing", "scn_rooftop")).toMatchObject({ ok: false, code: "CHOICE_OPTION_MISSING" });
    expect(planRouteChoiceRetarget(campusStoryProject, "scn_school_gate", "opt_broadcast", "scn_broadcast_room")).toMatchObject({ ok: false, code: "TARGET_UNCHANGED" });
  });

  it("rejects a repair command captured before the source revision changes", () => {
    const session = createStudioSession();
    const source = activeSourceSession(session);
    const plan = planRouteChoiceRetarget(session.project, "scn_school_gate", "opt_broadcast", "scn_rooftop");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const advanced = executeScriptSourceCommand(source, {
      schemaVersion: 0,
      kind: "script.p0-update",
      commandId: "cmd_advance_revision",
      baseRevision: source.revision,
      statementId: "stmt_gate_choice",
      patch: { promptRaw: JSON.stringify("Changed first") }
    });
    expect(advanced.result.status).toBe("committed");
    const stale = executeScriptSourceCommand(advanced.session, {
      schemaVersion: 0,
      kind: "script.p0-batch",
      commandId: "cmd_stale_route_repair",
      baseRevision: source.revision,
      operations: [plan.plan.operation]
    });
    expect(stale.result).toMatchObject({ status: "rejected", error: { code: "STALE_REVISION" } });
    expect(choiceOptionTarget(session.project, "scn_school_gate", "opt_broadcast")).toBe("scn_broadcast_room");
  });
});

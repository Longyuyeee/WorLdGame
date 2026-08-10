import { describe, expect, it } from "vitest";
import {
  campusStoryProject,
  createWorkspaceSession,
  deriveRouteGraph,
  findStatement,
  reduceWorkspaceSession,
  validateStoryProject
} from "./index";

const editCommand = {
  type: "edit-dialogue" as const,
  commandId: "cmd_edit_gate_001",
  sceneId: "scn_school_gate",
  statementId: "stmt_gate_001",
  text: "新的对白会同步到所有视图。"
};

describe("workspace session", () => {
  it("applies an edit once and emits a semantic change set", () => {
    const initial = createWorkspaceSession(campusStoryProject);
    const edited = reduceWorkspaceSession(initial, { type: "execute", command: editCommand });
    const duplicate = reduceWorkspaceSession(edited, { type: "execute", command: editCommand });

    expect(
      findStatement(edited.project, editCommand.sceneId, editCommand.statementId)
    ).toMatchObject({ text: editCommand.text });
    expect(edited.revision).toBe(1);
    expect(edited.lastChange?.changedEntityIds).toEqual([
      editCommand.sceneId,
      editCommand.statementId
    ]);
    expect(duplicate).toBe(edited);
  });

  it("undoes and redoes the exact dialogue edit", () => {
    const initial = createWorkspaceSession(campusStoryProject);
    const original = findStatement(
      initial.project,
      editCommand.sceneId,
      editCommand.statementId
    );
    const edited = reduceWorkspaceSession(initial, { type: "execute", command: editCommand });
    const undone = reduceWorkspaceSession(edited, { type: "undo" });
    const redone = reduceWorkspaceSession(undone, { type: "redo" });

    expect(
      findStatement(undone.project, editCommand.sceneId, editCommand.statementId)
    ).toEqual(original);
    expect(
      findStatement(redone.project, editCommand.sceneId, editCommand.statementId)
    ).toMatchObject({ text: editCommand.text });
    expect(redone.revision).toBe(3);
  });

  it("steps backward and forward without leaving scene bounds", () => {
    const initial = createWorkspaceSession(campusStoryProject);
    const beforeStart = reduceWorkspaceSession(initial, {
      type: "step-preview",
      direction: -1
    });
    const second = reduceWorkspaceSession(initial, {
      type: "step-preview",
      direction: 1
    });

    expect(beforeStart.previewIndex).toBe(0);
    expect(second.previewIndex).toBe(1);
    expect(second.selectedStatementId).toBe("stmt_gate_001");
  });

  it("derives the route graph from canonical choice statements", () => {
    const graph = deriveRouteGraph(campusStoryProject);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges.map((edge) => edge.targetSceneId)).toEqual([
      "scn_broadcast_room",
      "scn_rooftop"
    ]);
    expect(graph.nodes[0]?.kind).toBe("entry");
    expect(graph.nodes.slice(1).map((node) => node.kind)).toEqual(["ending", "ending"]);
  });

  it("rejects duplicate stable IDs before an editing session starts", () => {
    const duplicateScene = campusStoryProject.scenes[0];
    if (duplicateScene === undefined) {
      throw new Error("Sample project must contain an entry scene");
    }
    const invalidProject = {
      ...campusStoryProject,
      scenes: [...campusStoryProject.scenes, duplicateScene]
    };

    expect(validateStoryProject(invalidProject)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "DUPLICATE_ID" })])
    );
    expect(() => createWorkspaceSession(invalidProject)).toThrow(/invariant check/);
  });

  it("reports dangling route and speaker references", () => {
    const firstScene = campusStoryProject.scenes[0];
    if (firstScene === undefined) {
      throw new Error("Sample project must contain an entry scene");
    }
    const invalidProject = {
      ...campusStoryProject,
      scenes: [
        {
          ...firstScene,
          statements: [
            {
              id: "stmt_invalid_dialogue",
              kind: "dialogue" as const,
              speakerId: "char_missing",
              textId: "txt_invalid_dialogue",
              text: "无效引用测试"
            },
            {
              id: "stmt_invalid_choice",
              kind: "choice" as const,
              prompt: "无效路线测试",
              options: [
                {
                  id: "opt_invalid_target",
                  label: "不存在的场景",
                  targetSceneId: "scn_missing"
                }
              ]
            }
          ]
        },
        ...campusStoryProject.scenes.slice(1)
      ]
    };

    expect(validateStoryProject(invalidProject).map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["MISSING_SPEAKER", "MISSING_TARGET_SCENE"])
    );
  });
});

import { describe, expect, it } from "vitest";
import { createProjectSnapshot, createStudioSession, reduceStudioSession, restoreStudioSession } from "./studio-session";
import {
  WORKSPACE_CONTEXT_FIELD,
  createWorkspaceContext,
  persistWorkspaceContext,
  restoreWorkspaceContext,
  workspaceContextProjection
} from "./workspace-context";

function rooftopSelection() {
  return reduceStudioSession(createStudioSession(), {
    type: "select-project-result",
    sceneId: "scn_rooftop",
    statementId: "stmt_rooftop_001"
  });
}

describe("N43-E1b unified workspace context", () => {
  it("persists one stable-ID context and derives Selection, Inspector, and Runtime from it", () => {
    const selected = rooftopSelection();
    const context = createWorkspaceContext(selected, "director", "sequence");
    const snapshot = persistWorkspaceContext(
      createProjectSnapshot(selected, 7, {
        ...createProjectSnapshot(selected, 6),
        preservedFields: { pluginState: { retained: true } }
      }),
      context
    );
    const reopened = restoreWorkspaceContext(snapshot, restoreStudioSession(snapshot));

    expect(reopened).toMatchObject({
      status: "restored",
      context: {
        workspaceMode: "director",
        editorView: "sequence",
        experienceLevel: "pro",
        sceneId: "scn_rooftop",
        statementId: "stmt_rooftop_001"
      },
      session: {
        activeSceneId: "scn_rooftop",
        selectedStatementId: "stmt_rooftop_001",
        previewIndex: 1
      }
    });
    expect(snapshot.preservedFields?.pluginState).toEqual({ retained: true });
    expect(workspaceContextProjection(reopened.context)).toEqual({
      selectionId: "stmt_rooftop_001",
      inspectorObjectId: "stmt_rooftop_001",
      runtimeSceneId: "scn_rooftop",
      runtimeStatementId: "stmt_rooftop_001"
    });
  });

  it("ignores a missing stable-ID without changing Canonical content", () => {
    const session = createStudioSession();
    const snapshot = {
      ...createProjectSnapshot(session, 1),
      preservedFields: {
        [WORKSPACE_CONTEXT_FIELD]: {
          schemaVersion: 1,
          workspaceMode: "director",
          editorView: "sequence",
          sceneId: "scn_rooftop",
          statementId: "stmt_missing"
        }
      }
    };
    const restoredSession = restoreStudioSession(snapshot);
    const resolution = restoreWorkspaceContext(snapshot, restoredSession);

    expect(resolution.status).toBe("invalid");
    expect(resolution.session).toBe(restoredSession);
    expect(resolution.context).toMatchObject({ workspaceMode: "writer", editorView: "sequence" });
    expect(resolution.session.project).toEqual(session.project);
  });

  it("does not reopen an unknown workspace mode", () => {
    const session = createStudioSession();
    const snapshot = {
      ...createProjectSnapshot(session, 1),
      preservedFields: {
        [WORKSPACE_CONTEXT_FIELD]: {
          schemaVersion: 1,
          workspaceMode: "future-mode",
          editorView: "flow",
          sceneId: session.activeSceneId,
          statementId: session.selectedStatementId
        }
      }
    };

    expect(restoreWorkspaceContext(snapshot, restoreStudioSession(snapshot))).toMatchObject({
      status: "invalid",
      context: { workspaceMode: "writer", editorView: "sequence" }
    });
  });

  it("restores old contexts as Pro and rejects an unknown experience level", () => {
    const session = createStudioSession();
    const legacy = persistWorkspaceContext(createProjectSnapshot(session, 1), createWorkspaceContext(session, "writer", "sequence"));
    const legacyField = legacy.preservedFields?.[WORKSPACE_CONTEXT_FIELD];
    if (typeof legacyField !== "object" || legacyField === null || Array.isArray(legacyField)) throw new Error("missing context fixture");
    const withoutLevel = {
      ...legacy,
      preservedFields: {
        ...legacy.preservedFields,
        [WORKSPACE_CONTEXT_FIELD]: Object.fromEntries(Object.entries(legacyField).filter(([key]) => key !== "experienceLevel"))
      }
    };
    expect(restoreWorkspaceContext(withoutLevel, restoreStudioSession(withoutLevel))).toMatchObject({
      status: "restored",
      context: { experienceLevel: "pro" }
    });
    const unknown = {
      ...legacy,
      preservedFields: {
        ...legacy.preservedFields,
        [WORKSPACE_CONTEXT_FIELD]: { ...legacyField, experienceLevel: "expert" }
      }
    };
    expect(restoreWorkspaceContext(unknown, restoreStudioSession(unknown))).toMatchObject({
      status: "invalid",
      context: { experienceLevel: "pro" }
    });
  });
});

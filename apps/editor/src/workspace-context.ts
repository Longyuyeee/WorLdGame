import type { JsonObject, ProjectSnapshot } from "@world-studio/project-persistence";
import type { StudioMode, StudioSession } from "./studio-session";
import { WORKSPACE_MODES, type WorkspaceModeId } from "./workspace-modes";

export const WORKSPACE_CONTEXT_FIELD = "worldStudioWorkspaceContext";

export interface WorkspaceContextV1 {
  readonly schemaVersion: 1;
  readonly workspaceMode: WorkspaceModeId;
  readonly editorView: StudioMode;
  readonly sceneId: string;
  readonly statementId: string;
}

export interface WorkspaceContextProjection {
  readonly selectionId: string;
  readonly inspectorObjectId: string;
  readonly runtimeSceneId: string;
  readonly runtimeStatementId: string;
}

export interface WorkspaceContextResolution {
  readonly status: "restored" | "missing" | "invalid";
  readonly context: WorkspaceContextV1;
  readonly session: StudioSession;
  readonly detail: string;
}

const EDITOR_VIEWS: readonly StudioMode[] = ["sequence", "script", "flow"];

function defaultContext(session: StudioSession): WorkspaceContextV1 {
  return {
    schemaVersion: 1,
    workspaceMode: "writer",
    editorView: "sequence",
    sceneId: session.activeSceneId,
    statementId: session.selectedStatementId
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContext(value: unknown): WorkspaceContextV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      typeof value.workspaceMode !== "string" || typeof value.editorView !== "string" ||
      typeof value.sceneId !== "string" || typeof value.statementId !== "string") return null;
  const descriptor = WORKSPACE_MODES.find((candidate) => candidate.id === value.workspaceMode);
  if (descriptor === undefined || !descriptor.available ||
      !EDITOR_VIEWS.includes(value.editorView as StudioMode)) return null;
  return {
    schemaVersion: 1,
    workspaceMode: descriptor.id,
    editorView: value.editorView as StudioMode,
    sceneId: value.sceneId,
    statementId: value.statementId
  };
}

export function createWorkspaceContext(
  session: StudioSession,
  workspaceMode: WorkspaceModeId,
  editorView: StudioMode
): WorkspaceContextV1 {
  const descriptor = WORKSPACE_MODES.find((candidate) => candidate.id === workspaceMode);
  if (descriptor === undefined || !descriptor.available) {
    throw new TypeError(`Workspace mode is not available: ${workspaceMode}`);
  }
  return {
    schemaVersion: 1,
    workspaceMode,
    editorView,
    sceneId: session.activeSceneId,
    statementId: session.selectedStatementId
  };
}

export function workspaceContextProjection(context: WorkspaceContextV1): WorkspaceContextProjection {
  return {
    selectionId: context.statementId,
    inspectorObjectId: context.statementId,
    runtimeSceneId: context.sceneId,
    runtimeStatementId: context.statementId
  };
}

export function persistWorkspaceContext(
  snapshot: ProjectSnapshot,
  context: WorkspaceContextV1
): ProjectSnapshot {
  const persistedContext: JsonObject = {
    schemaVersion: context.schemaVersion,
    workspaceMode: context.workspaceMode,
    editorView: context.editorView,
    sceneId: context.sceneId,
    statementId: context.statementId
  };
  return {
    ...snapshot,
    preservedFields: {
      ...(snapshot.preservedFields ?? {}),
      [WORKSPACE_CONTEXT_FIELD]: persistedContext
    }
  };
}

export function restoreWorkspaceContext(
  snapshot: ProjectSnapshot,
  session: StudioSession
): WorkspaceContextResolution {
  const candidate = snapshot.preservedFields?.[WORKSPACE_CONTEXT_FIELD];
  if (candidate === undefined) {
    return {
      status: "missing",
      context: defaultContext(session),
      session,
      detail: "项目没有工作上下文；已安全使用 Writer / Sequence 与入口选择。"
    };
  }
  const context = parseContext(candidate);
  if (context === null) {
    return {
      status: "invalid",
      context: defaultContext(session),
      session,
      detail: "工作上下文字段无效；已忽略扩展字段并保持 Canonical 项目可编辑。"
    };
  }
  const scene = session.project.scenes.find((item) => item.id === context.sceneId);
  const previewIndex = scene?.statements.findIndex((item) => item.id === context.statementId) ?? -1;
  if (scene === undefined || previewIndex < 0) {
    return {
      status: "invalid",
      context: defaultContext(session),
      session,
      detail: "工作上下文引用了不存在的 stable-ID；已回退到入口选择。"
    };
  }
  return {
    status: "restored",
    context,
    session: {
      ...session,
      activeSceneId: context.sceneId,
      selectedStatementId: context.statementId,
      previewIndex
    },
    detail: `已恢复 ${context.workspaceMode} / ${context.editorView} / ${context.sceneId} / ${context.statementId}。`
  };
}

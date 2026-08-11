import {
  campusStoryProject,
  findScene,
  validateStoryProject,
  type EntityId,
  type StoryProject,
  type StoryScene
} from "@world-studio/story-core";
import {
  createScriptSourceSession,
  executeScriptSourceCommand,
  formatStory,
  parseStory,
  projectStoryScene,
  reduceScriptSourceSession,
  restoreScriptSourceSession,
  type ScriptSourceSession
} from "@world-studio/story-language";
import type { ProjectSnapshot } from "@world-studio/project-persistence";

export type StudioMode = "writer" | "script" | "flow";

export interface StudioDiagnostic {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly line?: number;
}

export interface StudioNotice {
  readonly tone: "success" | "draft" | "error";
  readonly title: string;
  readonly detail: string;
}

export interface StudioSession {
  readonly project: StoryProject;
  readonly sourceSessions: Readonly<Record<EntityId, ScriptSourceSession>>;
  readonly sourceDrafts: Readonly<Record<EntityId, string>>;
  readonly diagnostics: Readonly<Record<EntityId, readonly StudioDiagnostic[]>>;
  readonly activeSceneId: EntityId;
  readonly selectedStatementId: EntityId;
  readonly previewIndex: number;
  readonly notice: StudioNotice;
}

export type StudioAction =
  | { readonly type: "select-scene"; readonly sceneId: EntityId }
  | { readonly type: "select-statement"; readonly statementId: EntityId }
  | { readonly type: "step-preview"; readonly direction: -1 | 1 }
  | { readonly type: "edit-script"; readonly commandId: EntityId; readonly source: string }
  | {
      readonly type: "patch-dialogue";
      readonly commandId: EntityId;
      readonly statementId: EntityId;
      readonly text: string;
    }
  | {
      readonly type: "insert-dialogue";
      readonly commandId: EntityId;
      readonly afterId: EntityId;
      readonly statementId: EntityId;
      readonly textId: EntityId;
      readonly speakerId: EntityId;
      readonly text: string;
    }
  | {
      readonly type: "delete-dialogue";
      readonly commandId: EntityId;
      readonly statementId: EntityId;
    }
  | {
      readonly type: "move-dialogue";
      readonly commandId: EntityId;
      readonly statementId: EntityId;
      readonly afterId: EntityId;
    }
  | { readonly type: "format-script"; readonly commandId: EntityId }
  | { readonly type: "discard-draft" }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "restore-session"; readonly session: StudioSession };

export const campusStorySources: Readonly<Record<EntityId, string>> = {
  scn_school_gate: `# S0.8：注释由权威 CST 保留
scene "放学后的校门" @id(scn_school_gate)

@background 黄昏校门 · 云层缓慢移动 @id(stmt_gate_bg)
char_xia: 广播站的灯还亮着。你也听见那段没有署名的留言了吗？ @sid(stmt_gate_001) @id(txt_gate_001)
char_yu: 听见了。声音像是从很多年前传过来的。 @sid(stmt_gate_002) @id(txt_gate_002)
choice "先去哪里调查？" @id(stmt_gate_choice)
  "去广播室" -> scn_broadcast_room @id(opt_broadcast)
  "去天台" -> scn_rooftop @id(opt_rooftop)
`,
  scn_broadcast_room: `scene "旧广播室" @id(scn_broadcast_room)
@background 广播室 · 磁带机指示灯闪烁 @id(stmt_radio_bg)
char_xia: 这盘磁带的日期，正好是学校建校纪念日。 @sid(stmt_radio_001) @id(txt_radio_001)
end "留在电波里的名字" @id(stmt_radio_end)
`,
  scn_rooftop: `scene "风中的天台" @id(scn_rooftop)
@background 天台 · 风吹动旧社团旗 @id(stmt_rooftop_bg)
char_yu: 留言里提到的那颗星，也许只有从这里才能看见。 @sid(stmt_rooftop_001) @id(txt_rooftop_001)
end "晚风知道答案" @id(stmt_rooftop_end)
`
};

function projectScene(sourceSession: ScriptSourceSession): StoryScene {
  const result = projectStoryScene(sourceSession.committedDocument);
  if (!result.ok) {
    throw new Error(`Committed source is not projectable: ${result.diagnostics[0]?.code}`);
  }
  return result.scene;
}

function buildProject(
  sourceSessions: Readonly<Record<EntityId, ScriptSourceSession>>
): StoryProject {
  const scenes = campusStoryProject.scenes.map((scene) => {
    const sourceSession = sourceSessions[scene.id];
    if (sourceSession === undefined) {
      throw new Error(`Missing source session for scene: ${scene.id}`);
    }
    return projectScene(sourceSession);
  });
  const project: StoryProject = { ...campusStoryProject, scenes };
  const projectDiagnostics = validateStoryProject(project);
  if (projectDiagnostics.length > 0) {
    throw new Error(`Projected project failed validation: ${projectDiagnostics[0]?.code}`);
  }
  return project;
}

function firstStatementId(scene: StoryScene): EntityId {
  const first = scene.statements[0];
  if (first === undefined) {
    throw new Error(`Scene has no statements: ${scene.id}`);
  }
  return first.id;
}

export function createStudioSession(): StudioSession {
  const sourceSessions = Object.fromEntries(
    campusStoryProject.scenes.map((scene) => {
      const source = campusStorySources[scene.id];
      if (source === undefined) {
        throw new Error(`Missing canonical sample source: ${scene.id}`);
      }
      return [scene.id, createScriptSourceSession(source)];
    })
  );
  const project = buildProject(sourceSessions);
  const entry = findScene(project, project.entrySceneId);
  return {
    project,
    sourceSessions,
    sourceDrafts: Object.fromEntries(
      Object.entries(sourceSessions).map(([sceneId, sourceSession]) => [
        sceneId,
        sourceSession.committedSource
      ])
    ),
    diagnostics: {},
    activeSceneId: entry.id,
    selectedStatementId: firstStatementId(entry),
    previewIndex: 0,
    notice: {
      tone: "success",
      title: "三视图已连接",
      detail: "Script、Writer 与 Preview 正在读取同一份权威脚本事务。"
    }
  };
}

export function createProjectSnapshot(
  session: StudioSession,
  storageRevision: number
): ProjectSnapshot {
  return {
    schemaVersion: 0,
    projectId: session.project.id,
    title: session.project.title,
    entrySceneId: session.project.entrySceneId,
    storageRevision,
    scenes: session.project.scenes.map((scene) => {
      const sourceSession = session.sourceSessions[scene.id];
      if (sourceSession === undefined) throw new Error(`Missing source state: ${scene.id}`);
      return {
        sceneId: scene.id,
        sourceRevision: sourceSession.revision,
        semanticRevision: sourceSession.semanticRevision,
        committedSource: sourceSession.committedSource,
        draftSource: session.sourceDrafts[scene.id] ?? sourceSession.draftSource,
        tombstones: sourceSession.tombstones
      };
    })
  };
}

export function restoreStudioSession(snapshot: ProjectSnapshot): StudioSession {
  if (snapshot.projectId !== campusStoryProject.id || snapshot.title !== campusStoryProject.title ||
      snapshot.entrySceneId !== campusStoryProject.entrySceneId ||
      snapshot.scenes.length !== campusStoryProject.scenes.length) {
    throw new Error("Stored snapshot does not match the current prototype project");
  }
  const sourceSessions = Object.fromEntries(campusStoryProject.scenes.map((scene) => {
    const persisted = snapshot.scenes.find((item) => item.sceneId === scene.id);
    if (persisted === undefined) throw new Error(`Stored scene is missing: ${scene.id}`);
    return [scene.id, restoreScriptSourceSession({
      committedSource: persisted.committedSource,
      draftSource: persisted.draftSource,
      revision: persisted.sourceRevision,
      semanticRevision: persisted.semanticRevision,
      tombstones: persisted.tombstones
    })];
  }));
  const project = buildProject(sourceSessions);
  const entry = findScene(project, project.entrySceneId);
  const sourceDrafts = Object.fromEntries(snapshot.scenes.map((scene) => [
    scene.sceneId,
    scene.draftSource
  ]));
  return {
    project,
    sourceSessions,
    sourceDrafts,
    diagnostics: Object.fromEntries(snapshot.scenes.map((scene) => [
      scene.sceneId,
      draftDiagnostics(scene.draftSource)
    ])),
    activeSceneId: entry.id,
    selectedStatementId: firstStatementId(entry),
    previewIndex: 0,
    notice: {
      tone: "success",
      title: "本地项目已恢复",
      detail: `已校验并恢复 storage revision ${snapshot.storageRevision}；撤销历史从本次会话重新开始。`
    }
  };
}

export function activeSourceSession(session: StudioSession): ScriptSourceSession {
  const sourceSession = session.sourceSessions[session.activeSceneId];
  if (sourceSession === undefined) {
    throw new Error(`Missing active source session: ${session.activeSceneId}`);
  }
  return sourceSession;
}

export function activeSourceDraft(session: StudioSession): string {
  return session.sourceDrafts[session.activeSceneId] ?? activeSourceSession(session).committedSource;
}

export function hasPendingDraft(session: StudioSession): boolean {
  return activeSourceDraft(session) !== activeSourceSession(session).committedSource;
}

function withActiveSource(
  session: StudioSession,
  sourceSession: ScriptSourceSession,
  options: {
    readonly draft?: string;
    readonly diagnostics?: readonly StudioDiagnostic[];
    readonly selectedStatementId?: EntityId;
    readonly notice: StudioNotice;
  }
): StudioSession {
  const sourceSessions = {
    ...session.sourceSessions,
    [session.activeSceneId]: sourceSession
  };
  const project = buildProject(sourceSessions);
  const activeScene = findScene(project, session.activeSceneId);
  const requestedSelection = options.selectedStatementId ?? session.selectedStatementId;
  const selectedIndex = activeScene.statements.findIndex(
    (statement) => statement.id === requestedSelection
  );
  const previewIndex = selectedIndex >= 0 ? selectedIndex : 0;
  return {
    ...session,
    project,
    sourceSessions,
    sourceDrafts: {
      ...session.sourceDrafts,
      [session.activeSceneId]: options.draft ?? sourceSession.committedSource
    },
    diagnostics: {
      ...session.diagnostics,
      [session.activeSceneId]: options.diagnostics ?? []
    },
    selectedStatementId:
      activeScene.statements[previewIndex]?.id ?? firstStatementId(activeScene),
    previewIndex,
    notice: options.notice
  };
}

function draftDiagnostics(source: string): readonly StudioDiagnostic[] {
  const parsedDocument = parseStory(source);
  const parserDiagnostics: StudioDiagnostic[] = parsedDocument.diagnostics.map((item) => ({
    code: item.code,
    severity: item.severity,
    message: item.message,
    line: item.range.start.line
  }));
  if (parserDiagnostics.some((item) => item.severity === "error")) {
    return parserDiagnostics;
  }
  const projection = projectStoryScene(parsedDocument);
  if (!projection.ok) {
    return [
      ...parserDiagnostics,
      ...projection.diagnostics.map((item) => ({
        code: item.code,
        severity: "error" as const,
        message: item.message,
        line: item.range.start.line
      }))
    ];
  }
  return parserDiagnostics;
}

function replaceScriptDraft(
  session: StudioSession,
  commandId: EntityId,
  source: string
): StudioSession {
  const diagnostics = draftDiagnostics(source);
  if (diagnostics.some((item) => item.severity === "error")) {
    return {
      ...session,
      sourceDrafts: { ...session.sourceDrafts, [session.activeSceneId]: source },
      diagnostics: { ...session.diagnostics, [session.activeSceneId]: diagnostics },
      notice: {
        tone: "draft",
        title: "草稿尚未提交",
        detail: "Writer 与 Preview 继续显示最后一次有效投影。"
      }
    };
  }

  const currentSourceSession = activeSourceSession(session);
  const parsedDocument = parseStory(source);
  const projection = projectStoryScene(parsedDocument);
  if (!projection.ok) {
    throw new Error("Projection was expected to pass after diagnostic validation");
  }
  const candidateProject: StoryProject = {
    ...session.project,
    scenes: session.project.scenes.map((scene) =>
      scene.id === session.activeSceneId ? projection.scene : scene
    )
  };
  const projectDiagnostics = validateStoryProject(candidateProject);
  if (projectDiagnostics.length > 0) {
    return {
      ...session,
      sourceDrafts: { ...session.sourceDrafts, [session.activeSceneId]: source },
      diagnostics: {
        ...session.diagnostics,
        [session.activeSceneId]: projectDiagnostics.map((item) => ({
          code: item.code,
          severity: "error",
          message: item.message
        }))
      },
      notice: {
        tone: "draft",
        title: "项目引用检查失败",
        detail: "脚本草稿已保留，但不会进入 Writer 或 Preview。"
      }
    };
  }

  const execution = executeScriptSourceCommand(currentSourceSession, {
    schemaVersion: 0,
    kind: "script.replace-source",
    commandId,
    baseRevision: currentSourceSession.revision,
    source
  });
  if (execution.result.status === "rejected") {
    return {
      ...session,
      sourceDrafts: { ...session.sourceDrafts, [session.activeSceneId]: source },
      diagnostics: {
        ...session.diagnostics,
        [session.activeSceneId]: [
          {
            code: execution.result.error.code,
            severity: "error",
            message: execution.result.error.message
          }
        ]
      },
      notice: {
        tone: "error",
        title: "事务被拒绝",
        detail: execution.result.error.message
      }
    };
  }
  return withActiveSource(session, execution.session, {
    diagnostics,
    notice: {
      tone: "success",
      title: "脚本已原子提交",
      detail: `Writer 与 Preview 已同步到 revision ${execution.session.revision}。`
    }
  });
}

function executeStructuralCommand(
  session: StudioSession,
  command: Parameters<typeof executeScriptSourceCommand>[1],
  selectedStatementId?: EntityId
): StudioSession {
  if (hasPendingDraft(session)) {
    return {
      ...session,
      notice: {
        tone: "error",
        title: "先处理脚本草稿",
        detail: "修复或丢弃当前错误草稿后，才能从 Writer 修改权威脚本。"
      }
    };
  }
  const execution = executeScriptSourceCommand(activeSourceSession(session), command);
  if (execution.result.status === "rejected") {
    return {
      ...session,
      notice: {
        tone: "error",
        title: "操作未执行",
        detail: execution.result.error.message
      }
    };
  }
  return withActiveSource(session, execution.session, {
    ...(selectedStatementId === undefined ? {} : { selectedStatementId }),
    notice: {
      tone: "success",
      title: "权威脚本已更新",
      detail: `稳定 ID Patch 已提交到 revision ${execution.session.revision}。`
    }
  });
}

function restoreSourceHistory(session: StudioSession, direction: "undo" | "redo"): StudioSession {
  if (hasPendingDraft(session)) {
    return {
      ...session,
      notice: {
        tone: "error",
        title: "错误草稿阻止历史操作",
        detail: "先修复或丢弃草稿，避免覆盖尚未提交的输入。"
      }
    };
  }
  const sourceSession = reduceScriptSourceSession(activeSourceSession(session), {
    type: direction
  });
  return withActiveSource(session, sourceSession, {
    notice: {
      tone: "success",
      title: direction === "undo" ? "已撤销一步" : "已重做一步",
      detail: `Script、Writer 与 Preview 已恢复到 revision ${sourceSession.revision}。`
    }
  });
}

export function reduceStudioSession(
  session: StudioSession,
  action: StudioAction
): StudioSession {
  const currentSourceSession = activeSourceSession(session);
  switch (action.type) {
    case "restore-session":
      return action.session;
    case "select-scene": {
      const scene = findScene(session.project, action.sceneId);
      const targetSourceSession = session.sourceSessions[scene.id];
      if (targetSourceSession === undefined) {
        return session;
      }
      const targetDraft = session.sourceDrafts[scene.id] ?? targetSourceSession.committedSource;
      const targetHasDraft = targetDraft !== targetSourceSession.committedSource;
      return {
        ...session,
        activeSceneId: scene.id,
        selectedStatementId: firstStatementId(scene),
        previewIndex: 0,
        notice: targetHasDraft
          ? {
              tone: "draft",
              title: "此场景有未提交草稿",
              detail: "Writer 与 Preview 继续读取该场景最后一次有效投影。"
            }
          : {
              tone: "success",
              title: "场景事务已切换",
              detail: `${scene.title} 当前位于 revision ${targetSourceSession.revision}。`
            }
      };
    }
    case "select-statement": {
      const scene = findScene(session.project, session.activeSceneId);
      const index = scene.statements.findIndex((item) => item.id === action.statementId);
      return index < 0
        ? session
        : { ...session, selectedStatementId: action.statementId, previewIndex: index };
    }
    case "step-preview": {
      const scene = findScene(session.project, session.activeSceneId);
      const nextIndex = Math.min(
        Math.max(session.previewIndex + action.direction, 0),
        scene.statements.length - 1
      );
      const statement = scene.statements[nextIndex];
      return statement === undefined
        ? session
        : { ...session, previewIndex: nextIndex, selectedStatementId: statement.id };
    }
    case "edit-script":
      return replaceScriptDraft(session, action.commandId, action.source);
    case "patch-dialogue":
      return executeStructuralCommand(session, {
        schemaVersion: 0,
        kind: "script.patch-dialogue",
        commandId: action.commandId,
        baseRevision: currentSourceSession.revision,
        statementId: action.statementId,
        text: action.text
      });
    case "insert-dialogue":
      return executeStructuralCommand(
        session,
        {
          schemaVersion: 0,
          kind: "script.insert-dialogue",
          commandId: action.commandId,
          baseRevision: currentSourceSession.revision,
          afterId: action.afterId,
          statementId: action.statementId,
          textId: action.textId,
          speakerId: action.speakerId,
          text: action.text
        },
        action.statementId
      );
    case "delete-dialogue": {
      const scene = findScene(session.project, session.activeSceneId);
      const targetIndex = scene.statements.findIndex((item) => item.id === action.statementId);
      const fallback = scene.statements[targetIndex + 1] ?? scene.statements[targetIndex - 1];
      return executeStructuralCommand(
        session,
        {
          schemaVersion: 0,
          kind: "script.delete-dialogue",
          commandId: action.commandId,
          baseRevision: currentSourceSession.revision,
          statementId: action.statementId
        },
        fallback?.id
      );
    }
    case "move-dialogue":
      return executeStructuralCommand(
        session,
        {
          schemaVersion: 0,
          kind: "script.move-dialogue",
          commandId: action.commandId,
          baseRevision: currentSourceSession.revision,
          statementId: action.statementId,
          afterId: action.afterId
        },
        action.statementId
      );
    case "format-script": {
      if (hasPendingDraft(session)) {
        return {
          ...session,
          notice: {
            tone: "error",
            title: "不能格式化错误草稿",
            detail: "请先修复或丢弃草稿。"
          }
        };
      }
      return replaceScriptDraft(
        session,
        action.commandId,
        formatStory(currentSourceSession.committedDocument)
      );
    }
    case "discard-draft":
      return {
        ...session,
        sourceDrafts: {
          ...session.sourceDrafts,
          [session.activeSceneId]: currentSourceSession.committedSource
        },
        diagnostics: { ...session.diagnostics, [session.activeSceneId]: [] },
        notice: {
          tone: "success",
          title: "错误草稿已丢弃",
          detail: "Script 已恢复到最后一次有效提交。"
        }
      };
    case "undo":
      return restoreSourceHistory(session, "undo");
    case "redo":
      return restoreSourceHistory(session, "redo");
  }
}

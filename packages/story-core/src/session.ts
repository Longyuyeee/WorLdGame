import {
  assertValidStoryProject,
  findScene,
  findStatement,
  type DialogueStatement,
  type EntityId,
  type StoryProject
} from "./model";

export interface EditDialogueCommand {
  readonly type: "edit-dialogue";
  readonly commandId: EntityId;
  readonly sceneId: EntityId;
  readonly statementId: EntityId;
  readonly text: string;
}

export type StoryCommand = EditDialogueCommand;

export interface ChangeSet {
  readonly commandId: EntityId;
  readonly revision: number;
  readonly changedEntityIds: readonly EntityId[];
}

interface HistoryEntry {
  readonly forward: StoryCommand;
  readonly inverse: StoryCommand;
}

export interface WorkspaceSession {
  readonly project: StoryProject;
  readonly activeSceneId: EntityId;
  readonly selectedStatementId: EntityId;
  readonly previewIndex: number;
  readonly revision: number;
  readonly history: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
  readonly appliedCommandIds: readonly EntityId[];
  readonly lastChange: ChangeSet | null;
}

export type WorkspaceAction =
  | { readonly type: "execute"; readonly command: StoryCommand }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "select-scene"; readonly sceneId: EntityId }
  | { readonly type: "select-statement"; readonly statementId: EntityId }
  | { readonly type: "step-preview"; readonly direction: -1 | 1 };

interface CommandResult {
  readonly project: StoryProject;
  readonly inverse: StoryCommand;
}

function replaceDialogue(
  project: StoryProject,
  sceneId: EntityId,
  statementId: EntityId,
  text: string
): StoryProject {
  const statement = findStatement(project, sceneId, statementId);
  if (statement.kind !== "dialogue") {
    throw new Error(`Statement is not editable dialogue: ${statementId}`);
  }

  const updatedStatement: DialogueStatement = { ...statement, text };
  return {
    ...project,
    scenes: project.scenes.map((scene) =>
      scene.id === sceneId
        ? {
            ...scene,
            statements: scene.statements.map((candidate) =>
              candidate.id === statementId ? updatedStatement : candidate
            )
          }
        : scene
    )
  };
}

function applyCommand(project: StoryProject, command: StoryCommand): CommandResult {
  switch (command.type) {
    case "edit-dialogue": {
      const current = findStatement(project, command.sceneId, command.statementId);
      if (current.kind !== "dialogue") {
        throw new Error(`Statement is not editable dialogue: ${command.statementId}`);
      }
      return {
        project: replaceDialogue(project, command.sceneId, command.statementId, command.text),
        inverse: { ...command, text: current.text }
      };
    }
  }
}

export function createWorkspaceSession(project: StoryProject): WorkspaceSession {
  assertValidStoryProject(project);
  const entryScene = findScene(project, project.entrySceneId);
  const firstStatement = entryScene.statements[0];
  if (firstStatement === undefined) {
    throw new Error(`Entry scene has no statements: ${entryScene.id}`);
  }

  return {
    project,
    activeSceneId: entryScene.id,
    selectedStatementId: firstStatement.id,
    previewIndex: 0,
    revision: 0,
    history: [],
    future: [],
    appliedCommandIds: [],
    lastChange: null
  };
}

function execute(session: WorkspaceSession, command: StoryCommand): WorkspaceSession {
  if (session.appliedCommandIds.includes(command.commandId)) {
    return session;
  }
  const result = applyCommand(session.project, command);
  const revision = session.revision + 1;
  return {
    ...session,
    project: result.project,
    revision,
    history: [...session.history, { forward: command, inverse: result.inverse }],
    future: [],
    appliedCommandIds: [...session.appliedCommandIds, command.commandId],
    lastChange: {
      commandId: command.commandId,
      revision,
      changedEntityIds: [command.sceneId, command.statementId]
    }
  };
}

function undo(session: WorkspaceSession): WorkspaceSession {
  const entry = session.history.at(-1);
  if (entry === undefined) {
    return session;
  }
  const result = applyCommand(session.project, entry.inverse);
  const revision = session.revision + 1;
  return {
    ...session,
    project: result.project,
    revision,
    history: session.history.slice(0, -1),
    future: [entry, ...session.future],
    lastChange: {
      commandId: `undo:${entry.forward.commandId}:${revision}`,
      revision,
      changedEntityIds: [entry.forward.sceneId, entry.forward.statementId]
    }
  };
}

function redo(session: WorkspaceSession): WorkspaceSession {
  const [entry, ...remaining] = session.future;
  if (entry === undefined) {
    return session;
  }
  const result = applyCommand(session.project, entry.forward);
  const revision = session.revision + 1;
  return {
    ...session,
    project: result.project,
    revision,
    history: [...session.history, entry],
    future: remaining,
    lastChange: {
      commandId: `redo:${entry.forward.commandId}:${revision}`,
      revision,
      changedEntityIds: [entry.forward.sceneId, entry.forward.statementId]
    }
  };
}

export function reduceWorkspaceSession(
  session: WorkspaceSession,
  action: WorkspaceAction
): WorkspaceSession {
  switch (action.type) {
    case "execute":
      return execute(session, action.command);
    case "undo":
      return undo(session);
    case "redo":
      return redo(session);
    case "select-scene": {
      const scene = findScene(session.project, action.sceneId);
      const firstStatement = scene.statements[0];
      if (firstStatement === undefined) {
        throw new Error(`Scene has no statements: ${scene.id}`);
      }
      return {
        ...session,
        activeSceneId: scene.id,
        selectedStatementId: firstStatement.id,
        previewIndex: 0
      };
    }
    case "select-statement": {
      const scene = findScene(session.project, session.activeSceneId);
      const index = scene.statements.findIndex(
        (statement) => statement.id === action.statementId
      );
      if (index < 0) {
        throw new Error(`Statement is outside active scene: ${action.statementId}`);
      }
      return {
        ...session,
        selectedStatementId: action.statementId,
        previewIndex: index
      };
    }
    case "step-preview": {
      const scene = findScene(session.project, session.activeSceneId);
      const nextIndex = Math.min(
        Math.max(session.previewIndex + action.direction, 0),
        scene.statements.length - 1
      );
      const statement = scene.statements[nextIndex];
      if (statement === undefined) {
        return session;
      }
      return {
        ...session,
        previewIndex: nextIndex,
        selectedStatementId: statement.id
      };
    }
  }
}

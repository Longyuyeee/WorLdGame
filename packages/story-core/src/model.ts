export type EntityId = string;

export interface Character {
  readonly id: EntityId;
  readonly displayName: string;
  readonly color: string;
}

interface StatementBase {
  readonly id: EntityId;
}

export interface DialogueStatement extends StatementBase {
  readonly kind: "dialogue";
  readonly speakerId: EntityId;
  readonly textId: EntityId;
  readonly text: string;
}

export interface NarrationStatement extends StatementBase {
  readonly kind: "narration";
  readonly textId: EntityId;
  readonly text: string;
}

export interface DirectionStatement extends StatementBase {
  readonly kind: "direction";
  readonly command: "background" | "show" | "camera" | "audio";
  readonly summary: string;
}

export interface ChoiceOption {
  readonly id: EntityId;
  readonly label: string;
  readonly targetSceneId: EntityId;
}

export interface ChoiceStatement extends StatementBase {
  readonly kind: "choice";
  readonly prompt: string;
  readonly options: readonly ChoiceOption[];
}

export interface EndStatement extends StatementBase {
  readonly kind: "end";
  readonly endingName: string;
}

export interface LabelStatement extends StatementBase { readonly kind: "label"; readonly name: string; }
export interface JumpStatement extends StatementBase { readonly kind: "jump"; readonly targetLabel: string; }
export interface CallStatement extends StatementBase { readonly kind: "call"; readonly targetLabel: string; }
export interface ReturnStatement extends StatementBase { readonly kind: "return"; }
export interface SetStatement extends StatementBase { readonly kind: "set"; readonly variable: string; readonly expression: string; }
export interface ConditionStatement extends StatementBase { readonly kind: "condition"; readonly expression: string; readonly targetLabel: string; }
export interface WaitStatement extends StatementBase { readonly kind: "wait"; readonly duration: string; }

export type StoryStatement =
  | DialogueStatement
  | NarrationStatement
  | DirectionStatement
  | ChoiceStatement
  | LabelStatement
  | JumpStatement
  | CallStatement
  | ReturnStatement
  | SetStatement
  | ConditionStatement
  | WaitStatement
  | EndStatement;

export interface StoryScene {
  readonly id: EntityId;
  readonly title: string;
  readonly statements: readonly StoryStatement[];
}

export interface StoryVariable {
  readonly id: EntityId;
  readonly name: string;
  readonly type: "boolean" | "number" | "string";
  readonly defaultValue: boolean | number | string;
  readonly scope: "story" | "chapter" | "scene" | "meta";
}

export interface StoryProject {
  readonly schemaVersion: 0;
  readonly id: EntityId;
  readonly title: string;
  readonly characters: readonly Character[];
  readonly variables?: readonly StoryVariable[];
  readonly scenes: readonly StoryScene[];
  readonly entrySceneId: EntityId;
}

export interface RouteNode {
  readonly id: EntityId;
  readonly title: string;
  readonly kind: "entry" | "scene" | "ending";
}

export interface RouteEdge {
  readonly id: EntityId;
  readonly sourceSceneId: EntityId;
  readonly targetSceneId: EntityId;
  readonly label: string;
}

export interface RouteGraph {
  readonly nodes: readonly RouteNode[];
  readonly edges: readonly RouteEdge[];
}

export type ProjectDiagnosticCode =
  | "DUPLICATE_ID"
  | "EMPTY_ID"
  | "MISSING_ENTRY_SCENE"
  | "MISSING_SPEAKER"
  | "MISSING_TARGET_SCENE";

export interface ProjectDiagnostic {
  readonly code: ProjectDiagnosticCode;
  readonly entityId: EntityId;
  readonly message: string;
}

export class StoryProjectValidationError extends Error {
  readonly diagnostics: readonly ProjectDiagnostic[];

  constructor(diagnostics: readonly ProjectDiagnostic[]) {
    super(`Story project failed ${diagnostics.length} invariant check(s)`);
    this.name = "StoryProjectValidationError";
    this.diagnostics = diagnostics;
  }
}

export function validateStoryProject(project: StoryProject): readonly ProjectDiagnostic[] {
  const diagnostics: ProjectDiagnostic[] = [];
  const knownIds = new Set<EntityId>();
  const registerId = (id: EntityId, ownerId: EntityId) => {
    if (id.trim().length === 0) {
      diagnostics.push({
        code: "EMPTY_ID",
        entityId: ownerId,
        message: `Entity ${ownerId} contains an empty stable ID`
      });
      return;
    }
    if (knownIds.has(id)) {
      diagnostics.push({
        code: "DUPLICATE_ID",
        entityId: id,
        message: `Stable ID is duplicated: ${id}`
      });
      return;
    }
    knownIds.add(id);
  };

  registerId(project.id, project.id);
  for (const character of project.characters) {
    registerId(character.id, character.id);
  }
  for (const scene of project.scenes) {
    registerId(scene.id, scene.id);
    for (const statement of scene.statements) {
      registerId(statement.id, statement.id);
      if (statement.kind === "dialogue") {
        registerId(statement.textId, statement.id);
      }
      if (statement.kind === "narration") {
        registerId(statement.textId, statement.id);
      }
      if (statement.kind === "choice") {
        for (const option of statement.options) {
          registerId(option.id, statement.id);
        }
      }
    }
  }

  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  const characterIds = new Set(project.characters.map((character) => character.id));
  if (!sceneIds.has(project.entrySceneId)) {
    diagnostics.push({
      code: "MISSING_ENTRY_SCENE",
      entityId: project.entrySceneId,
      message: `Entry scene does not exist: ${project.entrySceneId}`
    });
  }

  for (const scene of project.scenes) {
    for (const statement of scene.statements) {
      if (statement.kind === "dialogue" && !characterIds.has(statement.speakerId)) {
        diagnostics.push({
          code: "MISSING_SPEAKER",
          entityId: statement.id,
          message: `Dialogue references an unknown speaker ID: ${statement.speakerId}`
        });
      }
      if (statement.kind === "choice") {
        for (const option of statement.options) {
          if (!sceneIds.has(option.targetSceneId)) {
            diagnostics.push({
              code: "MISSING_TARGET_SCENE",
              entityId: option.id,
              message: `Choice references an unknown scene ID: ${option.targetSceneId}`
            });
          }
        }
      }
    }
  }

  return diagnostics;
}

export function assertValidStoryProject(project: StoryProject): void {
  const diagnostics = validateStoryProject(project);
  if (diagnostics.length > 0) {
    throw new StoryProjectValidationError(diagnostics);
  }
}

export function findScene(project: StoryProject, sceneId: EntityId): StoryScene {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (scene === undefined) {
    throw new Error(`Unknown scene: ${sceneId}`);
  }
  return scene;
}

export function findStatement(
  project: StoryProject,
  sceneId: EntityId,
  statementId: EntityId
): StoryStatement {
  const statement = findScene(project, sceneId).statements.find(
    (candidate) => candidate.id === statementId
  );
  if (statement === undefined) {
    throw new Error(`Unknown statement: ${statementId}`);
  }
  return statement;
}

export function deriveRouteGraph(project: StoryProject): RouteGraph {
  const edges: RouteEdge[] = [];

  for (const scene of project.scenes) {
    for (const statement of scene.statements) {
      if (statement.kind !== "choice") {
        continue;
      }
      for (const option of statement.options) {
        edges.push({
          id: `${statement.id}:${option.id}`,
          sourceSceneId: scene.id,
          targetSceneId: option.targetSceneId,
          label: option.label
        });
      }
    }
  }

  const nodes = project.scenes.map<RouteNode>((scene) => {
    const hasEnding = scene.statements.some((statement) => statement.kind === "end");
    return {
      id: scene.id,
      title: scene.title,
      kind:
        scene.id === project.entrySceneId
          ? "entry"
          : hasEnding
            ? "ending"
            : "scene"
    };
  });

  return { nodes, edges };
}

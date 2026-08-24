import {
  assertProjectSourcePath,
  isProjectTrustedSourceCommit,
  sha256,
  type CanonicalProject,
  type JsonObject,
  type ProjectWorkspace
} from "@world-studio/project-domain";
import { parseTypedExpression } from "@world-studio/story-language";
import type { StoryStatement } from "@world-studio/story-core";

export const PROJECT_LAZY_EDIT_INDEX_CACHE_PATH = ".world-cache/lazy-edit-index-v1.json";

export type LazyEditEntityKind =
  | "project" | "chapter" | "scene"
  | "character" | "variable" | "asset"
  | "statement" | "option" | "text"
  | "localization" | "screen" | "plugin" | "test-route" | "extension";

export type LazyEditReferenceKind =
  | "entry-scene" | "speaker" | "choice-target"
  | "set-variable" | "expression-variable" | "asset";

export type LazyEditReferenceTargetKind = "scene" | "character" | "variable" | "asset";

export interface LazyEditEntity {
  readonly id: string;
  readonly kind: LazyEditEntityKind;
  readonly sourcePath: string;
  readonly jsonPointer: string;
  readonly ownerId?: string;
  readonly sceneId?: string;
}

export interface LazyEditReference {
  readonly kind: LazyEditReferenceKind;
  readonly sourceId: string;
  readonly targetId: string;
  readonly targetKind: LazyEditReferenceTargetKind;
  readonly resolved: boolean;
  readonly sceneId?: string;
}

export interface TrustedLazyEditIndex {
  readonly schemaVersion: 1;
  readonly sourceVersion: string;
  readonly projectId: string;
  readonly entities: readonly LazyEditEntity[];
  readonly references: readonly LazyEditReference[];
  readonly envelopeHash: string;
}

const HASH = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/u;
const ENTITY_KINDS = new Set<LazyEditEntityKind>(["project", "chapter", "scene", "character", "variable", "asset", "statement", "option", "text", "localization", "screen", "plugin", "test-route", "extension"]);
const REFERENCE_KINDS = new Set<LazyEditReferenceKind>(["entry-scene", "speaker", "choice-target", "set-variable", "expression-variable", "asset"]);
const TARGET_KINDS = new Set<LazyEditReferenceTargetKind>(["scene", "character", "variable", "asset"]);
const record = (value: unknown): value is Record<string, unknown> => value !== null && !Array.isArray(value) && typeof value === "object";
const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
};
const pointerToken = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");

function payload(index: Omit<TrustedLazyEditIndex, "envelopeHash">): string {
  return JSON.stringify(index);
}

function entityId(value: JsonObject, asset = false): string | undefined {
  const candidate = asset ? value.assetId ?? value.id : value.id;
  return typeof candidate === "string" && SAFE_ID.test(candidate) ? candidate : undefined;
}

function statement(value: JsonObject): StoryStatement {
  const candidate = value as unknown as StoryStatement;
  if (typeof candidate.id !== "string" || !SAFE_ID.test(candidate.id) || !["dialogue", "narration", "direction", "choice", "label", "jump", "call", "return", "set", "condition", "wait", "end"].includes(candidate.kind)) {
    throw new Error("Lazy Edit Index encountered an unsupported statement");
  }
  return candidate;
}

function extensionDeclarations(
  value: unknown,
  sourcePath: string,
  pointer: string,
  ownerId: string | undefined,
  sceneId: string | undefined,
  knownPointers: ReadonlySet<string>,
  add: (entity: LazyEditEntity) => void
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => extensionDeclarations(item, sourcePath, `${pointer}/${index}`, ownerId, sceneId, knownPointers, add));
    return;
  }
  if (!record(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const child = `${pointer}/${pointerToken(key)}`;
    if ((key === "id" || key === "textId") && typeof item === "string" && !knownPointers.has(child)) {
      add({ id: item, kind: key === "textId" ? "text" : "extension", sourcePath, jsonPointer: child, ...(ownerId === undefined ? {} : { ownerId }), ...(sceneId === undefined ? {} : { sceneId }) });
    }
    extensionDeclarations(item, sourcePath, child, ownerId, sceneId, knownPointers, add);
  }
}

function directionAssetIds(summary: string): readonly string[] {
  const ids: string[] = [];
  for (const match of summary.matchAll(/(?:^|\s)(?:asset|transitionAsset)=([^\s]+)/gu)) if (match[1] !== undefined && SAFE_ID.test(match[1]) && !ids.includes(match[1])) ids.push(match[1]);
  return ids;
}

export function buildTrustedLazyEditIndex(project: CanonicalProject, sourceVersion: string): TrustedLazyEditIndex {
  if (!HASH.test(sourceVersion)) throw new Error("Lazy Edit Index requires a trusted source revision");
  const entities: LazyEditEntity[] = [];
  const references: Array<Omit<LazyEditReference, "resolved">> = [];
  const byId = new Map<string, LazyEditEntity>();
  const referenceKeys = new Set<string>();
  const add = (entity: LazyEditEntity): void => {
    if (!SAFE_ID.test(entity.id)) throw new Error(`Lazy Edit Index contains an invalid stable ID: ${entity.id}`);
    assertProjectSourcePath(entity.sourcePath);
    if (byId.has(entity.id)) throw new Error(`Lazy Edit Index contains duplicate stable ID: ${entity.id}`);
    byId.set(entity.id, entity);
    entities.push(entity);
  };
  const addReference = (reference: Omit<LazyEditReference, "resolved">): void => {
    if (!SAFE_ID.test(reference.targetId)) return;
    const key = `${reference.kind}\0${reference.sourceId}\0${reference.targetId}\0${reference.targetKind}\0${reference.sceneId ?? ""}`;
    if (!referenceKeys.has(key)) { referenceKeys.add(key); references.push(reference); }
  };

  add({ id: project.manifest.projectId, kind: "project", sourcePath: "world.project.json", jsonPointer: "/projectId" });
  project.chapters.forEach((chapter, index) => add({ id: chapter.id, kind: "chapter", sourcePath: project.manifest.chapterPaths[index]!, jsonPointer: "/id", ownerId: project.manifest.projectId }));
  const scenePaths = project.chapters.flatMap((chapter) => chapter.scenePaths);
  project.scenes.forEach((scene, index) => add({ id: scene.id, kind: "scene", sourcePath: scenePaths[index]!, jsonPointer: "/id", ownerId: project.chapters.find((chapter) => chapter.scenePaths.includes(scenePaths[index]!))?.id ?? project.manifest.projectId }));

  const indexDocument = (values: readonly JsonObject[], sourcePath: string, kind: LazyEditEntityKind, asset = false): void => {
    values.forEach((value, index) => {
      const id = entityId(value, asset);
      const idKey = asset && typeof value.assetId === "string" ? "assetId" : "id";
      const known = new Set<string>();
      if (id !== undefined) {
        const idPointer = `/${kind === "localization" ? "locales" : kind === "screen" ? "screens" : kind === "plugin" ? "plugins" : kind === "test-route" ? "routes" : `${kind}s`}/${index}/${idKey}`;
        known.add(idPointer);
        add({ id, kind, sourcePath, jsonPointer: idPointer, ownerId: project.manifest.projectId });
      }
      const root = `/${kind === "localization" ? "locales" : kind === "screen" ? "screens" : kind === "plugin" ? "plugins" : kind === "test-route" ? "routes" : `${kind}s`}/${index}`;
      extensionDeclarations(value, sourcePath, root, id, undefined, known, add);
    });
  };
  indexDocument(project.characters.characters, project.manifest.charactersPath, "character");
  indexDocument(project.variables.variables, project.manifest.variablesPath, "variable");
  indexDocument(project.assets.assets, project.manifest.assetsPath, "asset", true);
  indexDocument(project.localization.locales, project.manifest.localizationPath, "localization");
  indexDocument(project.ui.screens, project.manifest.uiPath, "screen");
  indexDocument(project.plugins.plugins, project.manifest.pluginsPath, "plugin");
  indexDocument(project.testRoutes.routes, project.manifest.testRoutesPath, "test-route");

  for (const scene of project.scenes) {
    const script = project.scripts[scene.id];
    if (script === undefined) throw new Error(`Lazy Edit Index is missing script ${scene.id}`);
    script.statements.forEach((raw, index) => {
      const item = statement(raw);
      const root = `/statements/${index}`;
      const known = new Set<string>([`${root}/id`]);
      add({ id: item.id, kind: "statement", sourcePath: scene.scriptPath, jsonPointer: `${root}/id`, ownerId: scene.id, sceneId: scene.id });
      if (item.kind === "dialogue" || item.kind === "narration") {
        known.add(`${root}/textId`);
        add({ id: item.textId, kind: "text", sourcePath: scene.scriptPath, jsonPointer: `${root}/textId`, ownerId: item.id, sceneId: scene.id });
      }
      if (item.kind === "choice") item.options.forEach((option, optionIndex) => {
        const optionPointer = `${root}/options/${optionIndex}/id`;
        known.add(optionPointer);
        add({ id: option.id, kind: "option", sourcePath: scene.scriptPath, jsonPointer: optionPointer, ownerId: item.id, sceneId: scene.id });
        addReference({ kind: "choice-target", sourceId: option.id, targetId: option.targetSceneId, targetKind: "scene", sceneId: scene.id });
      });
      if (item.kind === "dialogue") addReference({ kind: "speaker", sourceId: item.id, targetId: item.speakerId, targetKind: "character", sceneId: scene.id });
      if (item.kind === "set") {
        addReference({ kind: "set-variable", sourceId: item.id, targetId: item.variable, targetKind: "variable", sceneId: scene.id });
        for (const identifier of parseTypedExpression(item.expression).identifiers) addReference({ kind: "expression-variable", sourceId: item.id, targetId: identifier.name, targetKind: "variable", sceneId: scene.id });
      }
      if (item.kind === "condition") for (const identifier of parseTypedExpression(item.expression).identifiers) addReference({ kind: "expression-variable", sourceId: item.id, targetId: identifier.name, targetKind: "variable", sceneId: scene.id });
      if (item.kind === "direction") for (const assetId of directionAssetIds(item.summary)) addReference({ kind: "asset", sourceId: item.id, targetId: assetId, targetKind: "asset", sceneId: scene.id });
      extensionDeclarations(raw, scene.scriptPath, root, item.id, scene.id, known, add);
    });
  }
  addReference({ kind: "entry-scene", sourceId: project.manifest.projectId, targetId: project.manifest.entrySceneId, targetKind: "scene" });

  entities.sort((left, right) => left.id.localeCompare(right.id));
  const resolvedReferences: LazyEditReference[] = references.map((reference) => ({
    ...reference,
    resolved: byId.get(reference.targetId)?.kind === reference.targetKind
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.kind.localeCompare(right.kind) || left.targetId.localeCompare(right.targetId));
  const base = { schemaVersion: 1 as const, sourceVersion, projectId: project.manifest.projectId, entities, references: resolvedReferences };
  return { ...base, envelopeHash: sha256(payload(base)) };
}

function parseArtifact(source: string): TrustedLazyEditIndex {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error("Lazy Edit Index artifact is corrupt"); }
  if (!record(value) || !exactKeys(value, ["schemaVersion", "sourceVersion", "projectId", "entities", "references", "envelopeHash"]) || value.schemaVersion !== 1 || typeof value.sourceVersion !== "string" || !HASH.test(value.sourceVersion) || typeof value.projectId !== "string" || !SAFE_ID.test(value.projectId) || !Array.isArray(value.entities) || !Array.isArray(value.references) || typeof value.envelopeHash !== "string" || !HASH.test(value.envelopeHash)) throw new Error("Lazy Edit Index artifact is incompatible");
  const entities: LazyEditEntity[] = value.entities.map((item) => {
    if (!record(item) || !exactKeys(item, ["id", "kind", "sourcePath", "jsonPointer"], ["ownerId", "sceneId"]) || typeof item.id !== "string" || !SAFE_ID.test(item.id) || typeof item.kind !== "string" || !ENTITY_KINDS.has(item.kind as LazyEditEntityKind) || typeof item.sourcePath !== "string" || typeof item.jsonPointer !== "string" || !item.jsonPointer.startsWith("/") || (item.ownerId !== undefined && (typeof item.ownerId !== "string" || !SAFE_ID.test(item.ownerId))) || (item.sceneId !== undefined && (typeof item.sceneId !== "string" || !SAFE_ID.test(item.sceneId)))) throw new Error("Lazy Edit Index entity is invalid");
    assertProjectSourcePath(item.sourcePath);
    return item as unknown as LazyEditEntity;
  });
  const references: LazyEditReference[] = value.references.map((item) => {
    if (!record(item) || !exactKeys(item, ["kind", "sourceId", "targetId", "targetKind", "resolved"], ["sceneId"]) || typeof item.kind !== "string" || !REFERENCE_KINDS.has(item.kind as LazyEditReferenceKind) || typeof item.sourceId !== "string" || !SAFE_ID.test(item.sourceId) || typeof item.targetId !== "string" || !SAFE_ID.test(item.targetId) || typeof item.targetKind !== "string" || !TARGET_KINDS.has(item.targetKind as LazyEditReferenceTargetKind) || typeof item.resolved !== "boolean" || (item.sceneId !== undefined && (typeof item.sceneId !== "string" || !SAFE_ID.test(item.sceneId)))) throw new Error("Lazy Edit Index reference is invalid");
    return item as unknown as LazyEditReference;
  });
  const base = { schemaVersion: 1 as const, sourceVersion: value.sourceVersion, projectId: value.projectId, entities, references };
  if (sha256(payload(base)) !== value.envelopeHash) throw new Error("Lazy Edit Index artifact hash does not match");
  const byId = new Map<string, LazyEditEntity>();
  for (const entity of entities) {
    if (byId.has(entity.id)) throw new Error(`Lazy Edit Index contains duplicate stable ID: ${entity.id}`);
    byId.set(entity.id, entity);
  }
  if (byId.get(value.projectId)?.kind !== "project") throw new Error("Lazy Edit Index project identity does not match");
  for (const entity of entities) {
    if (entity.ownerId !== undefined && !byId.has(entity.ownerId)) throw new Error(`Lazy Edit Index owner is missing: ${entity.ownerId}`);
    if (entity.sceneId !== undefined && byId.get(entity.sceneId)?.kind !== "scene") throw new Error(`Lazy Edit Index scene owner is invalid: ${entity.sceneId}`);
    const owner = entity.ownerId === undefined ? undefined : byId.get(entity.ownerId);
    if (entity.kind === "chapter" && owner?.kind !== "project") throw new Error(`Lazy Edit Index chapter owner is invalid: ${entity.id}`);
    if (entity.kind === "scene" && owner?.kind !== "chapter") throw new Error(`Lazy Edit Index scene owner is invalid: ${entity.id}`);
    if (["character", "variable", "asset", "localization", "screen", "plugin", "test-route"].includes(entity.kind) && owner?.kind !== "project") throw new Error(`Lazy Edit Index project entity owner is invalid: ${entity.id}`);
    if (entity.kind === "statement" && (owner?.kind !== "scene" || entity.sceneId !== entity.ownerId)) throw new Error(`Lazy Edit Index statement owner is invalid: ${entity.id}`);
    if ((entity.kind === "option" || entity.kind === "text") && (owner?.kind !== "statement" || entity.sceneId !== owner.sceneId || entity.sourcePath !== owner.sourcePath)) throw new Error(`Lazy Edit Index child owner is invalid: ${entity.id}`);
  }
  for (const reference of references) {
    if (!byId.has(reference.sourceId)) throw new Error(`Lazy Edit Index reference source is missing: ${reference.sourceId}`);
    if ((byId.get(reference.targetId)?.kind === reference.targetKind) !== reference.resolved) throw new Error(`Lazy Edit Index reference resolution is invalid: ${reference.targetId}`);
  }
  return { ...base, envelopeHash: value.envelopeHash };
}

export async function publishTrustedLazyEditIndex(workspace: ProjectWorkspace, project: CanonicalProject, sourceVersion: string): Promise<void> {
  if (workspace.writeDerivedFile === undefined || workspace.readTrustedSourceCommit === undefined) return;
  const before = await workspace.readTrustedSourceCommit();
  if (before === null || !isProjectTrustedSourceCommit(before) || before.version !== sourceVersion) throw new Error("Cannot publish Lazy Edit Index for a different source revision");
  await workspace.writeDerivedFile(PROJECT_LAZY_EDIT_INDEX_CACHE_PATH, JSON.stringify(buildTrustedLazyEditIndex(project, sourceVersion)));
  const after = await workspace.readTrustedSourceCommit();
  if (after === null || !isProjectTrustedSourceCommit(after) || after.version !== sourceVersion) throw new Error("Project source changed while publishing Lazy Edit Index");
}

export async function readTrustedLazyEditIndex(workspace: ProjectWorkspace, expectedVersion: string): Promise<TrustedLazyEditIndex> {
  if (workspace.readDerivedFile === undefined || workspace.readTrustedSourceCommit === undefined) throw new Error("Lazy Edit Index artifact is unsupported");
  const before = await workspace.readTrustedSourceCommit();
  if (before === null || !isProjectTrustedSourceCommit(before) || before.version !== expectedVersion) throw new Error("Lazy Edit Index source revision does not match");
  const source = await workspace.readDerivedFile(PROJECT_LAZY_EDIT_INDEX_CACHE_PATH);
  if (source === null) throw new Error("Lazy Edit Index artifact is unavailable; open the full editor once to rebuild it");
  const artifact = parseArtifact(source);
  if (artifact.sourceVersion !== expectedVersion) throw new Error("Lazy Edit Index artifact belongs to another source revision");
  const after = await workspace.readTrustedSourceCommit();
  if (after === null || !isProjectTrustedSourceCommit(after) || after.version !== expectedVersion) throw new Error("Project source changed while reading Lazy Edit Index");
  return artifact;
}

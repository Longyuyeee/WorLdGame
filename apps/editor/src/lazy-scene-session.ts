import {
  loadProjectLayouts,
  loadProjectScripts,
  readTrustedProjectFiles,
  saveProjectScript,
  type LayoutDocument,
  type ProjectWorkspace,
  type SceneDocument,
  type ScriptDocument
} from "@world-studio/project-domain";
import {
  createScriptSourceSession,
  executeScriptSourceCommand,
  projectStoryScene,
  reduceScriptSourceSession,
  type ScriptSourceSession
} from "@world-studio/story-language";
import { canonicalSceneSource, canonicalScriptWithStoryScene } from "./canonical-project-adapter";
import type { StoryScene, StoryStatement } from "@world-studio/story-core";

export type LazyScenePageStatus = "unloaded" | "loading" | "ready" | "dirty" | "error" | "stale";

export interface LazyScenePage {
  readonly schemaVersion: 1;
  readonly scene: SceneDocument;
  readonly sourceVersion: string;
  readonly status: LazyScenePageStatus;
  readonly script?: ScriptDocument;
  readonly layout?: LayoutDocument;
  readonly sourceSession?: ScriptSourceSession;
  readonly savedSource?: string;
  readonly error?: string | undefined;
}

export function createLazyScenePage(scene: SceneDocument, sourceVersion: string): LazyScenePage {
  return { schemaVersion: 1, scene, sourceVersion, status: "unloaded" };
}

export function beginLazyScenePageLoad(page: LazyScenePage): LazyScenePage {
  return { ...page, status: "loading", error: undefined };
}

export async function loadLazyScenePage(workspace: ProjectWorkspace, page: LazyScenePage): Promise<LazyScenePage> {
  try {
    const files = await readTrustedProjectFiles(workspace, [page.scene.scriptPath, page.scene.layoutPath], page.sourceVersion);
    const script = loadProjectScripts(files, [page.scene])[page.scene.id]!;
    const layout = loadProjectLayouts(files, [page.scene])[page.scene.id]!;
    const source = canonicalSceneSource(page.scene, script);
    return { ...page, status: "ready", script, layout, sourceSession: createScriptSourceSession(source), savedSource: source, error: undefined };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    return { ...page, status: /revision|version|changed/i.test(message) ? "stale" : "error", error: message };
  }
}

export function replaceLazySceneSource(page: LazyScenePage, source: string, commandId: string): LazyScenePage {
  if (page.sourceSession === undefined || page.savedSource === undefined) return { ...page, status: "error", error: "Scene source is not loaded" };
  const execution = executeScriptSourceCommand(page.sourceSession, { schemaVersion: 0, kind: "script.replace-source", commandId, baseRevision: page.sourceSession.revision, source });
  if (execution.result.status === "rejected") return { ...page, status: "error", error: execution.result.error.message };
  const invalid = execution.session.draftSource !== execution.session.committedSource;
  return { ...page, sourceSession: execution.session, status: invalid ? "error" : execution.session.committedSource === page.savedSource ? "ready" : "dirty", error: invalid ? "脚本存在阻断诊断，尚未提交到权威场景" : undefined };
}

export function reduceLazySceneHistory(page: LazyScenePage, direction: "undo" | "redo"): LazyScenePage {
  if (page.sourceSession === undefined || page.savedSource === undefined) return page;
  const sourceSession = reduceScriptSourceSession(page.sourceSession, { type: direction });
  return { ...page, sourceSession, status: sourceSession.committedSource === page.savedSource ? "ready" : "dirty", error: undefined };
}

function statementStructure(statement: StoryStatement): unknown {
  switch (statement.kind) {
    case "dialogue": return { id: statement.id, kind: statement.kind, speakerId: statement.speakerId, textId: statement.textId };
    case "narration": return { id: statement.id, kind: statement.kind, textId: statement.textId };
    case "direction": return { ...statement, summary: undefined };
    case "choice": return { id: statement.id, kind: statement.kind, options: statement.options.map((option) => ({ id: option.id, targetSceneId: option.targetSceneId })) };
    case "label": return { id: statement.id, kind: statement.kind, name: statement.name };
    case "jump":
    case "call": return { id: statement.id, kind: statement.kind, targetLabel: statement.targetLabel };
    case "set": return { id: statement.id, kind: statement.kind, variable: statement.variable };
    case "condition": return { id: statement.id, kind: statement.kind, targetLabel: statement.targetLabel };
    case "return":
    case "wait":
    case "end": return { id: statement.id, kind: statement.kind };
  }
}

function sameLazyEditableStructure(baseline: StoryScene, next: StoryScene): boolean {
  return JSON.stringify(baseline.statements.map(statementStructure)) === JSON.stringify(next.statements.map(statementStructure));
}

export async function saveLazyScenePage(workspace: ProjectWorkspace, page: LazyScenePage): Promise<LazyScenePage> {
  if (page.script === undefined || page.sourceSession === undefined || page.savedSource === undefined) return { ...page, status: "error", error: "Scene source is not loaded" };
  if (page.sourceSession.draftSource !== page.sourceSession.committedSource) return { ...page, status: "error", error: "脚本存在阻断诊断，不能保存" };
  if (workspace.writeSelectedFiles === undefined) return { ...page, status: "error", error: "当前工程宿主不支持单场景原子保存" };
  const projection = projectStoryScene(page.sourceSession.committedDocument);
  if (!projection.ok || projection.scene.id !== page.scene.id) return { ...page, status: "error", error: projection.ok ? "脚本场景 ID 与当前场景不一致" : projection.diagnostics.map((item) => item.message).join("；") };
  if (projection.scene.title !== page.scene.title) return { ...page, status: "error", error: "场景标题属于结构文件；请加载完整工程后修改标题" };
  const baseline = projectStoryScene(createScriptSourceSession(page.savedSource).committedDocument);
  if (!baseline.ok || !sameLazyEditableStructure(baseline.scene, projection.scene)) return { ...page, status: "error", error: "局部页只允许修改既有语句内容；结构、稳定 ID 与跨实体引用请在完整工程中编辑" };
  const script = canonicalScriptWithStoryScene(page.script, projection.scene);
  try {
    const written = await workspace.writeSelectedFiles({ [page.scene.scriptPath]: saveProjectScript(script) }, page.sourceVersion);
    const source = page.sourceSession.committedSource;
    return { ...page, status: "ready", sourceVersion: written.version, script, sourceSession: createScriptSourceSession(source), savedSource: source, error: undefined };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    return { ...page, status: /revision|version|changed/i.test(message) ? "stale" : "error", error: message };
  }
}

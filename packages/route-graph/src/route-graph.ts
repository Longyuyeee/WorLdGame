import { compileProject, type CompilerDiagnostic, type RuntimeInstructionV1 } from "@world-studio/project-compiler";
import {
  createProjectService,
  executeProjectCommand,
  type CanonicalProject,
  type ChangeSet,
  type ProjectServiceError
} from "@world-studio/project-domain";

export type RouteNodeKind = "entry" | "scene" | "ending";
export type RouteFactKind = "choice" | "label" | "jump" | "call" | "condition" | "ending";

export interface RouteChapterV1 {
  readonly id: string;
  readonly title: string;
  readonly sceneIds: readonly string[];
}

export interface RouteFactV1 {
  readonly id: string;
  readonly kind: RouteFactKind;
  readonly label: string;
  readonly targetLabel?: string;
}

export interface RouteSceneNodeV1 {
  readonly id: string;
  readonly title: string;
  readonly chapterId: string;
  readonly kind: RouteNodeKind;
  readonly facts: readonly RouteFactV1[];
}

export interface RouteEdgeV1 {
  readonly id: string;
  readonly sourceSceneId: string;
  readonly targetSceneId: string;
  readonly statementId: string;
  readonly label: string;
  readonly status: "valid" | "dangling";
}

export interface RouteGraphDiagnosticV1 {
  readonly severity: CompilerDiagnostic["severity"];
  readonly code: CompilerDiagnostic["code"];
  readonly message: string;
  readonly sceneId?: string;
  readonly statementId?: string;
  readonly entityId?: string;
}

export interface RouteGraphV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly entrySceneId: string;
  readonly chapters: readonly RouteChapterV1[];
  readonly nodes: readonly RouteSceneNodeV1[];
  readonly edges: readonly RouteEdgeV1[];
  readonly diagnostics: readonly RouteGraphDiagnosticV1[];
}

export const ROUTE_GRAPH_WINDOW_LIMIT = 64;
export const ROUTE_GRAPH_EDGE_LIMIT = 256;

export interface RouteGraphIndexV1 {
  readonly schemaVersion: 1;
  readonly graph: RouteGraphV1;
  readonly searchTextByNode: readonly string[];
}

export interface RouteGraphWindowRequest {
  readonly query?: string;
  readonly offset?: number;
  readonly limit?: number;
  readonly anchorSceneId?: string;
}

export interface RouteGraphWindowV1 {
  readonly schemaVersion: 1;
  readonly query: string;
  readonly start: number;
  readonly end: number;
  readonly totalMatches: number;
  readonly nodes: readonly RouteSceneNodeV1[];
  readonly edges: readonly RouteEdgeV1[];
  readonly totalLocalEdges: number;
  readonly edgesTruncated: boolean;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

export type RenameRouteSceneResult =
  | { readonly ok: true; readonly project: CanonicalProject; readonly changeSet: ChangeSet }
  | { readonly ok: false; readonly project: CanonicalProject; readonly error: ProjectServiceError };

function sceneIdFromPath(path: string): string | undefined {
  const match = /^scenes\/(.+)\.json$/u.exec(path);
  return match?.[1];
}

function stringOperand(instruction: RuntimeInstructionV1, key: string): string | undefined {
  const value = instruction.operands[key];
  return typeof value === "string" ? value : undefined;
}

function fact(instruction: RuntimeInstructionV1): RouteFactV1 | undefined {
  if (instruction.opcode === "choice") return { id: instruction.instructionId, kind: "choice", label: stringOperand(instruction, "prompt") ?? "未命名选择" };
  if (instruction.opcode === "label") return { id: instruction.instructionId, kind: "label", label: stringOperand(instruction, "name") ?? "未命名标签" };
  if (instruction.opcode === "jump" || instruction.opcode === "call" || instruction.opcode === "condition") {
    const targetLabel = stringOperand(instruction, "targetLabel");
    return {
      id: instruction.instructionId,
      kind: instruction.opcode,
      label: instruction.opcode === "condition" ? "条件分支" : instruction.opcode === "jump" ? "跳转" : "调用",
      ...(targetLabel === undefined ? {} : { targetLabel })
    };
  }
  if (instruction.opcode === "end") return { id: instruction.instructionId, kind: "ending", label: stringOperand(instruction, "name") ?? "未命名结局" };
  return undefined;
}

function choiceEdges(instruction: RuntimeInstructionV1, sourceSceneId: string, knownSceneIds: ReadonlySet<string>): readonly RouteEdgeV1[] {
  if (instruction.opcode !== "choice" || !Array.isArray(instruction.operands.options)) return [];
  return instruction.operands.options.flatMap((value) => {
    if (value === null || Array.isArray(value) || typeof value !== "object") return [];
    const id = value.optionId;
    const label = value.label;
    const targetSceneId = value.targetSceneId;
    if (typeof id !== "string" || typeof label !== "string" || typeof targetSceneId !== "string") return [];
    return [{
      id,
      sourceSceneId,
      targetSceneId,
      statementId: instruction.instructionId,
      label,
      status: knownSceneIds.has(targetSceneId) ? "valid" as const : "dangling" as const
    }];
  });
}

export function buildRouteGraph(project: CanonicalProject): RouteGraphV1 {
  const compilation = compileProject(project, "debug");
  const knownSceneIds = new Set(project.scenes.map((scene) => scene.id));
  const chapterByScene = new Map<string, string>();
  const chapters = project.chapters.map<RouteChapterV1>((chapter) => {
    const sceneIds = chapter.scenePaths.flatMap((path) => sceneIdFromPath(path) ?? []);
    for (const sceneId of sceneIds) chapterByScene.set(sceneId, chapter.id);
    return { id: chapter.id, title: chapter.title, sceneIds };
  });
  const nodes = project.scenes.map<RouteSceneNodeV1>((scene) => {
    const instructions = compilation.cache.scenes[scene.id]?.scene.instructions ?? [];
    const facts = instructions.flatMap((instruction) => fact(instruction) ?? []);
    return {
      id: scene.id,
      title: scene.title,
      chapterId: chapterByScene.get(scene.id) ?? "chapter_unassigned",
      kind: scene.id === project.manifest.entrySceneId ? "entry" : facts.some((item) => item.kind === "ending") ? "ending" : "scene",
      facts
    };
  });
  const edges = project.scenes.flatMap((scene) =>
    (compilation.cache.scenes[scene.id]?.scene.instructions ?? []).flatMap((instruction) => choiceEdges(instruction, scene.id, knownSceneIds))
  );
  return {
    schemaVersion: 1,
    projectId: project.manifest.projectId,
    entrySceneId: project.manifest.entrySceneId,
    chapters,
    nodes,
    edges,
    diagnostics: compilation.diagnostics.map((item) => ({ ...item }))
  };
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function createRouteGraphIndex(graph: RouteGraphV1): RouteGraphIndexV1 {
  const chapterTitles = new Map(graph.chapters.map((chapter) => [chapter.id, chapter.title]));
  return {
    schemaVersion: 1,
    graph,
    searchTextByNode: graph.nodes.map((node) => normalizeSearch([
      node.id,
      node.title,
      chapterTitles.get(node.chapterId) ?? "",
      ...node.facts.flatMap((item) => [item.id, item.kind, item.label, item.targetLabel ?? ""])
    ].join("\n")))
  };
}

export function queryRouteGraphWindow(index: RouteGraphIndexV1, request: RouteGraphWindowRequest = {}): RouteGraphWindowV1 {
  const query = normalizeSearch(request.query ?? "");
  const matchingIndexes = query.length === 0
    ? index.graph.nodes.map((_, nodeIndex) => nodeIndex)
    : index.searchTextByNode.flatMap((searchText, nodeIndex) => searchText.includes(query) ? [nodeIndex] : []);
  const limit = Math.max(1, Math.min(ROUTE_GRAPH_WINDOW_LIMIT, Math.floor(request.limit ?? ROUTE_GRAPH_WINDOW_LIMIT)));
  const anchorMatchIndex = request.anchorSceneId === undefined
    ? -1
    : matchingIndexes.findIndex((nodeIndex) => index.graph.nodes[nodeIndex]?.id === request.anchorSceneId);
  const requestedStart = request.offset === undefined
    ? anchorMatchIndex < 0 ? 0 : Math.floor(anchorMatchIndex / limit) * limit
    : Math.max(0, Math.floor(request.offset));
  const maximumStart = matchingIndexes.length === 0 ? 0 : Math.floor((matchingIndexes.length - 1) / limit) * limit;
  const start = Math.min(requestedStart, maximumStart);
  const end = Math.min(matchingIndexes.length, start + limit);
  const nodes = matchingIndexes.slice(start, end).flatMap((nodeIndex) => index.graph.nodes[nodeIndex] ?? []);
  const localNodeIds = new Set(nodes.map((node) => node.id));
  const localEdges = index.graph.edges.filter((edge) => localNodeIds.has(edge.sourceSceneId) || localNodeIds.has(edge.targetSceneId));
  return {
    schemaVersion: 1,
    query,
    start,
    end,
    totalMatches: matchingIndexes.length,
    nodes,
    edges: localEdges.slice(0, ROUTE_GRAPH_EDGE_LIMIT),
    totalLocalEdges: localEdges.length,
    edgesTruncated: localEdges.length > ROUTE_GRAPH_EDGE_LIMIT,
    hasPrevious: start > 0,
    hasNext: end < matchingIndexes.length
  };
}

export function renameRouteScene(project: CanonicalProject, commandId: string, sceneId: string, title: string): RenameRouteSceneResult {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return {
      ok: false,
      project,
      error: { code: "INVALID_COMMAND", commandId, entityId: sceneId, message: "scene title is empty" }
    };
  }
  const state = createProjectService(project);
  const result = executeProjectCommand(state, {
    commandId,
    expectedRevision: state.revision,
    kind: "scene.rename",
    sceneId,
    title: trimmedTitle
  });
  if (!result.ok) return { ok: false, project, error: result.error };
  return { ok: true, project: result.state.project, changeSet: result.changeSet };
}

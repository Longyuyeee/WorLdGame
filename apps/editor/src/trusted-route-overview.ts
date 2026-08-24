import type { ProjectAnalysisResult } from "@world-studio/project-compiler";
import {
  assertProjectSourcePath,
  isProjectTrustedSourceCommit,
  loadProjectLayouts,
  readTrustedProjectStructurePage,
  sha256,
  type CanonicalProject,
  type ChapterDocument,
  type ProjectManifest,
  type ProjectWorkspace,
  type SceneDocument
} from "@world-studio/project-domain";
import {
  buildRouteGraphFromCompilation,
  createRouteGraphIndex,
  queryRouteGraphWindow,
  type RouteGraphV1,
  type RouteGraphWindowRequest,
  type RouteGraphWindowV1
} from "@world-studio/route-graph";

export const PROJECT_ROUTE_OVERVIEW_CACHE_PATH = ".world-cache/route-overview-v2.json";

interface RouteOverviewArtifact {
  readonly schemaVersion: 2;
  readonly sourceVersion: string;
  readonly graph: RouteGraphV1;
  readonly scenePaths: readonly string[];
  readonly envelopeHash: string;
}

export interface TrustedRouteOverview {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly title: string;
  readonly sourceVersion: string;
  readonly totalScenes: number;
  readonly window: RouteGraphWindowV1;
  readonly scenePages: readonly SceneDocument[];
  readonly sourceRead: {
    readonly fileCount: number;
    readonly layoutFileCount: number;
    readonly utf8Bytes: number;
    readonly fullRead: false;
  };
}

const HASH = /^[0-9a-f]{64}$/u;
const record = (value: unknown): value is Record<string, unknown> => value !== null && !Array.isArray(value) && typeof value === "object";
const strings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const automaticLayout = (index: number) => ({ x: 72 + (index % 4) * 288, y: 96 + Math.floor(index / 4) * 180, source: "automatic" as const });

function artifactPayload(sourceVersion: string, graph: RouteGraphV1, scenePaths: readonly string[]): string {
  return JSON.stringify({ schemaVersion: 2, sourceVersion, graph, scenePaths });
}

function parseArtifact(source: string): RouteOverviewArtifact {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error("Route overview artifact is corrupt"); }
  if (!record(value) || value.schemaVersion !== 2 || typeof value.sourceVersion !== "string" || !HASH.test(value.sourceVersion) || typeof value.envelopeHash !== "string" || !HASH.test(value.envelopeHash) || !record(value.graph) || !strings(value.scenePaths)) throw new Error("Route overview artifact is incompatible");
  const graph = value.graph;
  if (graph.schemaVersion !== 1 || typeof graph.projectId !== "string" || typeof graph.entrySceneId !== "string" || !Array.isArray(graph.chapters) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.diagnostics) || !Array.isArray(graph.groups) || !record(graph.viewport)) throw new Error("Route overview artifact graph is invalid");
  const validChapters = graph.chapters.every((chapter) => record(chapter) && typeof chapter.id === "string" && typeof chapter.title === "string" && strings(chapter.sceneIds));
  const validNodes = graph.nodes.every((node) => record(node) && typeof node.id === "string" && typeof node.title === "string" && typeof node.chapterId === "string" && ["entry", "scene", "ending"].includes(String(node.kind)) && Array.isArray(node.facts) && node.facts.every((fact) => record(fact) && typeof fact.id === "string" && ["choice", "label", "jump", "call", "condition", "ending"].includes(String(fact.kind)) && typeof fact.label === "string" && (fact.targetLabel === undefined || typeof fact.targetLabel === "string")) && record(node.layout) && finite(node.layout.x) && finite(node.layout.y) && ["sidecar", "automatic"].includes(String(node.layout.source)) && (node.layout.groupId === undefined || typeof node.layout.groupId === "string"));
  const validEdges = graph.edges.every((edge) => record(edge) && typeof edge.id === "string" && typeof edge.sourceSceneId === "string" && typeof edge.targetSceneId === "string" && typeof edge.statementId === "string" && typeof edge.label === "string" && ["valid", "dangling"].includes(String(edge.status)));
  const validDiagnostics = graph.diagnostics.every((item) => record(item) && ["error", "warning"].includes(String(item.severity)) && typeof item.code === "string" && typeof item.message === "string" && (item.sceneId === undefined || typeof item.sceneId === "string") && (item.statementId === undefined || typeof item.statementId === "string") && (item.entityId === undefined || typeof item.entityId === "string"));
  const validGroups = graph.groups.every((group) => record(group) && typeof group.groupId === "string" && typeof group.title === "string" && typeof group.collapsed === "boolean");
  const validViewport = finite(graph.viewport.x) && finite(graph.viewport.y) && finite(graph.viewport.zoom) && graph.viewport.zoom > 0 && ["sidecar", "automatic"].includes(String(graph.viewport.source));
  const validScenePaths = value.scenePaths.every((path) => { try { assertProjectSourcePath(path); return true; } catch { return false; } });
  if (!validChapters || !validNodes || !validEdges || !validDiagnostics || !validGroups || !validViewport || !validScenePaths) throw new Error("Route overview artifact graph is invalid");
  const typedGraph = graph as unknown as RouteGraphV1;
  const scenePaths = value.scenePaths;
  if (scenePaths.length !== typedGraph.nodes.length || new Set(scenePaths).size !== scenePaths.length || new Set(typedGraph.nodes.map((node) => node.id)).size !== typedGraph.nodes.length) throw new Error("Route overview artifact scene index is invalid");
  if (sha256(artifactPayload(value.sourceVersion, typedGraph, scenePaths)) !== value.envelopeHash) throw new Error("Route overview artifact hash does not match");
  return { schemaVersion: 2, sourceVersion: value.sourceVersion, graph: typedGraph, scenePaths, envelopeHash: value.envelopeHash };
}

function structureSignature(manifest: ProjectManifest, chapters: readonly ChapterDocument[]): string {
  return JSON.stringify({
    projectId: manifest.projectId,
    entrySceneId: manifest.entrySceneId,
    chapters: chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, scenePaths: chapter.scenePaths }))
  });
}

function graphSignature(graph: RouteGraphV1, scenePaths: readonly string[]): string {
  const pathById = new Map(graph.nodes.map((node, index) => [node.id, scenePaths[index]!]));
  return JSON.stringify({
    projectId: graph.projectId,
    entrySceneId: graph.entrySceneId,
    chapters: graph.chapters.map(({ id, title, sceneIds }) => ({ id, title, scenePaths: sceneIds.map((sceneId) => pathById.get(sceneId) ?? "") }))
  });
}

export async function publishTrustedRouteOverview(workspace: ProjectWorkspace, project: CanonicalProject, compilation: ProjectAnalysisResult, sourceVersion: string): Promise<void> {
  if (workspace.writeDerivedFile === undefined || workspace.readTrustedSourceCommit === undefined) return;
  const commit = await workspace.readTrustedSourceCommit();
  if (commit === null || !isProjectTrustedSourceCommit(commit) || commit.version !== sourceVersion) throw new Error("Cannot publish Route overview for a different source revision");
  const compiled = buildRouteGraphFromCompilation(project, compilation);
  const graph: RouteGraphV1 = {
    ...compiled,
    nodes: compiled.nodes.map((node, index) => ({ ...node, layout: { ...automaticLayout(index), ...(node.layout.groupId === undefined ? {} : { groupId: node.layout.groupId }) } }))
  };
  const scenePaths = project.chapters.flatMap((chapter) => chapter.scenePaths);
  if (scenePaths.length !== project.scenes.length) throw new Error("Cannot publish Route overview with mismatched scene paths");
  const payload = artifactPayload(sourceVersion, graph, scenePaths);
  await workspace.writeDerivedFile(PROJECT_ROUTE_OVERVIEW_CACHE_PATH, JSON.stringify({ schemaVersion: 2, sourceVersion, graph, scenePaths, envelopeHash: sha256(payload) }));
}

export async function readTrustedRouteOverview(workspace: ProjectWorkspace, request: RouteGraphWindowRequest = {}): Promise<TrustedRouteOverview> {
  if (workspace.readDerivedFile === undefined) throw new Error("Route overview artifact is unsupported");
  const source = await workspace.readDerivedFile(PROJECT_ROUTE_OVERVIEW_CACHE_PATH);
  if (source === null) throw new Error("Route overview artifact is unavailable; open the full editor once to rebuild it");
  const artifact = parseArtifact(source);
  const window = queryRouteGraphWindow(createRouteGraphIndex(artifact.graph), request);
  const artifactPathById = new Map(artifact.graph.nodes.map((node, index) => [node.id, artifact.scenePaths[index]!]));
  const requestedPaths = window.nodes.map((node) => artifactPathById.get(node.id)).filter((path): path is string => path !== undefined);
  if (requestedPaths.length !== window.nodes.length) throw new Error("Route overview artifact references an unknown scene page");
  const snapshot = await readTrustedProjectStructurePage(workspace, requestedPaths, { includeLayouts: true });
  if (artifact.sourceVersion !== snapshot.version) throw new Error("Route overview artifact belongs to another source revision");
  if (structureSignature(snapshot.manifest, snapshot.chapters) !== graphSignature(artifact.graph, artifact.scenePaths)) throw new Error("Route overview artifact structure does not match the project");
  const scenesById = new Map(snapshot.scenes.map((scene) => [scene.id, scene]));
  const windowScenes = window.nodes.map((node) => scenesById.get(node.id)).filter((scene): scene is NonNullable<typeof scene> => scene !== undefined);
  if (windowScenes.length !== window.nodes.length) throw new Error("Route overview artifact references an unknown scene");
  if (windowScenes.some((scene, index) => scene.id !== window.nodes[index]!.id || scene.title !== window.nodes[index]!.title)) throw new Error("Route overview artifact scene metadata does not match the project");
  const layoutPaths = new Set(windowScenes.map((scene) => scene.layoutPath));
  const layoutFiles = Object.fromEntries(Object.entries(snapshot.files).filter(([path]) => layoutPaths.has(path)));
  const layouts = loadProjectLayouts(snapshot.files, windowScenes);
  const nodes = window.nodes.map((node) => {
    const position = layouts[node.id]?.nodes.find((item) => item.nodeId === node.id);
    return position === undefined ? node : { ...node, layout: { x: position.x, y: position.y, source: "sidecar" as const, ...(position.groupId === undefined ? {} : { groupId: position.groupId }) } };
  });
  const encoder = new TextEncoder();
  const sourceFiles = snapshot.files;
  return {
    schemaVersion: 1,
    projectId: snapshot.manifest.projectId,
    title: snapshot.manifest.title,
    sourceVersion: snapshot.version,
    totalScenes: snapshot.totalScenes,
    window: { ...window, nodes },
    scenePages: windowScenes,
    sourceRead: {
      fileCount: Object.keys(sourceFiles).length,
      layoutFileCount: Object.keys(layoutFiles).length,
      utf8Bytes: Object.values(sourceFiles).reduce((total, value) => total + encoder.encode(value).byteLength, 0),
      fullRead: false
    }
  };
}

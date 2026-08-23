import { performance } from "node:perf_hooks";
import { createProjectService, createProjectTemplate, executeProjectCommand, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { compileProjectIncremental } from "@world-studio/project-compiler";
import { buildRouteGraph, buildRouteGraphIncremental, createRouteGraphIndex, queryRouteGraphWindow, ROUTE_GRAPH_EDGE_LIMIT, ROUTE_GRAPH_WINDOW_LIMIT } from "@world-studio/route-graph";
import { buildTrustedLazyEditIndex } from "../apps/editor/src/trusted-lazy-edit-index";
import { describe, expect, it } from "vitest";

const sceneCount = 10_000;
const projectionBudgetMs = 15_000;
const indexBudgetMs = 2_000;
const queryBudgetMs = 250;
const editSyncBudgetMs = 500;
const editSamples = 20;
const lazyEditIndexBudgetMs = 500;

function percentile95(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]!;
}

function sceneId(index: number): string {
  return `route_scene_${String(index).padStart(5, "0")}`;
}

function createBranchingRouteProject(): CanonicalProject {
  const base = createProjectTemplate("N40 10k Branching Route", "n40-e2-route-performance");
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({
    schemaVersion: 1 as const,
    id: sceneId(index),
    title: `Route Scene ${index}`,
    scriptPath: `scripts/${sceneId(index)}.json`,
    layoutPath: `layouts/${sceneId(index)}.json`
  }));
  const scripts = Object.fromEntries(scenes.map((scene, index) => {
    const childIndexes = [index * 2 + 1, index * 2 + 2].filter((value) => value < sceneCount);
    const statements: readonly JsonObject[] = childIndexes.length === 0
      ? [{ id: `ending_${scene.id}`, kind: "end", endingName: `Ending ${index}` }]
      : [{
          id: `choice_${scene.id}`,
          kind: "choice",
          prompt: `Branch from ${index}`,
          options: childIndexes.map((childIndex) => ({
            id: `option_${scene.id}_${childIndex}`,
            label: `To ${childIndex}`,
            targetSceneId: sceneId(childIndex)
          }))
        }];
    return [scene.id, { schemaVersion: 1 as const, sceneId: scene.id, statements }];
  }));
  return {
    ...base,
    manifest: { ...base.manifest, entrySceneId: sceneId(0), chapterPaths: ["chapters/route-main.json"] },
    chapters: [{ schemaVersion: 1, id: "route_main", title: "10k Branching", scenePaths: scenes.map((scene) => `scenes/${scene.id}.json`) }],
    scenes,
    scripts,
    layouts: Object.fromEntries(scenes.map((scene) => [scene.id, { schemaVersion: 1, sceneId: scene.id, nodes: [] }]))
  };
}

describe("N40 10k branching Route performance gate", () => {
  it("projects a real branching Canonical Project and keeps local queries bounded", () => {
    const project = createBranchingRouteProject();
    const projectionStart = performance.now();
    const graph = buildRouteGraph(project);
    const projectionMs = performance.now() - projectionStart;
    const indexStart = performance.now();
    const index = createRouteGraphIndex(graph);
    const indexMs = performance.now() - indexStart;
    const queryStart = performance.now();
    const first = queryRouteGraphWindow(index);
    const middle = queryRouteGraphWindow(index, { anchorSceneId: sceneId(5_555) });
    const ending = queryRouteGraphWindow(index, { query: "Ending 9999" });
    const queryMs = performance.now() - queryStart;

    console.log(JSON.stringify({
      status: projectionMs < projectionBudgetMs && indexMs < indexBudgetMs && queryMs < queryBudgetMs ? "PASS" : "FAIL",
      baseline: { sceneCount, edgeCount: sceneCount - 1, shape: "binary branching DAG", windowLimit: ROUTE_GRAPH_WINDOW_LIMIT, edgeLimit: ROUTE_GRAPH_EDGE_LIMIT },
      measurementsMs: { fullCompilerProjection: Number(projectionMs.toFixed(2)), routeIndex: Number(indexMs.toFixed(2)), threeLocalQueries: Number(queryMs.toFixed(2)) },
      budgetsMs: { fullCompilerProjection: projectionBudgetMs, routeIndex: indexBudgetMs, threeLocalQueries: queryBudgetMs },
      result: { diagnostics: graph.diagnostics.length, first: [first.start, first.end], middle: [middle.start, middle.end], searchMatches: ending.totalMatches, maximumMountedNodes: Math.max(first.nodes.length, middle.nodes.length, ending.nodes.length), maximumLocalEdges: Math.max(first.edges.length, middle.edges.length, ending.edges.length) }
    }, null, 2));

    expect(graph.nodes).toHaveLength(sceneCount);
    expect(graph.edges).toHaveLength(sceneCount - 1);
    expect(graph.diagnostics).toEqual([]);
    expect(first.nodes).toHaveLength(ROUTE_GRAPH_WINDOW_LIMIT);
    expect(middle.nodes.some((node) => node.id === sceneId(5_555))).toBe(true);
    expect(ending.nodes.map((node) => node.id)).toEqual([sceneId(9_999)]);
    expect([first, middle, ending].every((window) => window.nodes.length <= ROUTE_GRAPH_WINDOW_LIMIT && window.edges.length <= ROUTE_GRAPH_EDGE_LIMIT)).toBe(true);
    expect(projectionMs).toBeLessThan(projectionBudgetMs);
    expect(indexMs).toBeLessThan(indexBudgetMs);
    expect(queryMs).toBeLessThan(queryBudgetMs);
  });

  it("synchronizes a Project Service single-scene edit into a queried Route window within 500ms P95", () => {
    const project = createBranchingRouteProject();
    const baselineCompilation = compileProjectIncremental(project);
    const measurements: number[] = [];
    const components: { projectService: number; incrementalCompiler: number; projectionAndQuery: number }[] = [];

    for (let sample = 0; sample < editSamples; sample += 1) {
      const service = createProjectService(project);
      const start = performance.now();
      const edited = executeProjectCommand(service, {
        commandId: `route_performance_rename_${sample}`,
        expectedRevision: 0,
        kind: "scene.rename",
        sceneId: sceneId(5_555),
        title: `Edited Route Scene ${sample}`
      });
      expect(edited.ok).toBe(true);
      if (!edited.ok) return;
      const serviceEnd = performance.now();
      const projection = buildRouteGraphIncremental(edited.state.project, baselineCompilation.cache, [sceneId(5_555)]);
      const compilerEnd = performance.now();
      const routeWindow = queryRouteGraphWindow(createRouteGraphIndex(projection.graph), { anchorSceneId: sceneId(5_555) });
      const end = performance.now();
      measurements.push(end - start);
      components.push({ projectService: serviceEnd - start, incrementalCompiler: compilerEnd - serviceEnd, projectionAndQuery: end - compilerEnd });
      expect(projection.analysis.stats.compiledSceneIds).toEqual([sceneId(5_555)]);
      expect(projection.analysis.stats.reusedSceneIds).toHaveLength(sceneCount - 1);
      expect(routeWindow.nodes.find((node) => node.id === sceneId(5_555))?.title).toBe(`Edited Route Scene ${sample}`);
    }

    const p95 = percentile95(measurements);
    console.log(JSON.stringify({
      status: p95 < editSyncBudgetMs ? "PASS" : "FAIL",
      baseline: { sceneCount, edit: "Project Service scene.rename -> compiler -> Route graph -> index -> anchored window", samples: editSamples },
      measurementsMs: { samples: measurements.map((value) => Number(value.toFixed(2))), p95: Number(p95.toFixed(2)) },
      componentSamplesMs: components.map((value) => Object.fromEntries(Object.entries(value).map(([key, duration]) => [key, Number(duration.toFixed(2))]))),
      budgetMs: { p95: editSyncBudgetMs }
    }, null, 2));
    expect(p95).toBeLessThan(editSyncBudgetMs);
  });

  it("builds the revision-bound global Lazy Edit Index for 10k statements within 500ms", () => {
    const base = createProjectTemplate("N40 10k Lazy Edit Index", "n40-e8h-lazy-edit-index-performance");
    const scene = base.scenes[0]!;
    const statements = Array.from({ length: 10_000 }, (_, index) => ({
      id: `statement_scale_${index}`,
      kind: "narration",
      textId: `text_scale_${index}`,
      text: `Line ${index}`
    }));
    const project = { ...base, scripts: { ...base.scripts, [scene.id]: { schemaVersion: 1 as const, sceneId: scene.id, statements } } };
    const started = performance.now();
    const index = buildTrustedLazyEditIndex(project, "b".repeat(64));
    const elapsedMs = performance.now() - started;

    console.log(JSON.stringify({
      status: elapsedMs < lazyEditIndexBudgetMs ? "PASS" : "FAIL",
      baseline: { statementCount: 10_000, expectedStatementAndTextIds: 20_000 },
      measurementsMs: { globalLazyEditIndex: Number(elapsedMs.toFixed(2)) },
      budgetMs: { globalLazyEditIndex: lazyEditIndexBudgetMs },
      result: { entities: index.entities.length, references: index.references.length, envelopeHash: index.envelopeHash }
    }, null, 2));

    expect(index.entities.filter((entity) => entity.kind === "statement")).toHaveLength(10_000);
    expect(index.entities.filter((entity) => entity.kind === "text")).toHaveLength(10_000);
    expect(elapsedMs).toBeLessThan(lazyEditIndexBudgetMs);
  });
});

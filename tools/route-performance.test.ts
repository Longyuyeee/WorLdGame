import { performance } from "node:perf_hooks";
import { createProjectTemplate, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { buildRouteGraph, createRouteGraphIndex, queryRouteGraphWindow, ROUTE_GRAPH_EDGE_LIMIT, ROUTE_GRAPH_WINDOW_LIMIT } from "@world-studio/route-graph";
import { describe, expect, it } from "vitest";

const sceneCount = 10_000;
const projectionBudgetMs = 15_000;
const indexBudgetMs = 2_000;
const queryBudgetMs = 250;

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
});

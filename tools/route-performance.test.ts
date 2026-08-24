import { performance } from "node:perf_hooks";
import { createProjectService, createProjectTemplate, executeProjectCommand, saveProject, sha256, type CanonicalProject, type JsonObject, type ProjectFiles, type ProjectReference, type ProjectTrustedSourceCommit, type ProjectWorkspace, type ScriptDocument } from "@world-studio/project-domain";
import { compileProjectIncremental, preflightLazyNarrationInsertion, preflightLazyNarrationStructuralEdit } from "@world-studio/project-compiler";
import { buildRouteGraph, buildRouteGraphIncremental, createRouteGraphIndex, locateRouteDiagnostic, preflightRouteNeutralSceneEdit, queryRouteGraphWindow, reviewRouteToEnding, ROUTE_GRAPH_EDGE_LIMIT, ROUTE_GRAPH_WINDOW_LIMIT } from "@world-studio/route-graph";
import { buildTrustedLazyEditIndex } from "../apps/editor/src/trusted-lazy-edit-index";
import { publishTrustedRouteOverview, readTrustedRouteOverview } from "../apps/editor/src/trusted-route-overview";
import { describe, expect, it } from "vitest";

const sceneCount = 10_000;
const projectionBudgetMs = 15_000;
const indexBudgetMs = 2_000;
const queryBudgetMs = 250;
const endingRouteReviewBudgetMs = 250;
const editSyncBudgetMs = 500;
const editSamples = 20;
const lazyEditIndexBudgetMs = 500;
const lazyStructuralPreflightBudgetMs = 500;
const lazyRouteStructurePageBudgetMs = 500;

class PerformanceRouteWorkspace implements ProjectWorkspace {
  readonly reference: ProjectReference = { referenceId: "route-performance", hostKind: "memory-test", displayLocation: "memory/route-performance", permissionKey: "route-performance" };
  readonly selectedReads: string[][] = [];
  readonly derived = new Map<string, string>();
  readonly commit: ProjectTrustedSourceCommit;
  fullReads = 0;
  constructor(readonly files: ProjectFiles) {
    const entries = Object.entries(files).map(([path, value]) => ({ path, size: new TextEncoder().encode(value).byteLength, modifiedAtMs: 1, sha256: sha256(value) }));
    this.commit = { schemaVersion: 1, generation: 1, files: entries, version: sha256(JSON.stringify({ schemaVersion: 1, generation: 1, files: entries })) };
  }
  async readFiles() { this.fullReads += 1; return { files: this.files, version: this.commit.version }; }
  async readSelectedFiles(paths: readonly string[]) { this.selectedReads.push([...paths]); return { files: Object.fromEntries(paths.map((path) => [path, this.files[path]!])), version: this.commit.version }; }
  async readTrustedSourceCommit() { return this.commit; }
  async readDerivedFile(path: string) { return this.derived.get(path) ?? null; }
  async writeDerivedFile(path: string, value: string) { this.derived.set(path, value); }
  async writeFiles(): Promise<{ readonly version: string }> { throw new Error("not used"); }
}

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

  it("reviews a concrete ending route in the real 10k branching graph within 250ms", () => {
    const graph = buildRouteGraph(createBranchingRouteProject());
    const started = performance.now();
    const review = reviewRouteToEnding(graph, sceneId(9_999));
    const elapsedMs = performance.now() - started;

    console.log(JSON.stringify({
      status: review.status === "found" && elapsedMs < endingRouteReviewBudgetMs ? "PASS" : "FAIL",
      baseline: { sceneCount, edgeCount: sceneCount - 1, shape: "binary branching DAG", targetEndingSceneId: sceneId(9_999) },
      measurementsMs: { endingRouteReview: Number(elapsedMs.toFixed(2)) },
      budgetMs: { endingRouteReview: endingRouteReviewBudgetMs },
      result: { status: review.status, candidateCount: review.candidates.length, routeSceneCount: review.candidates[0]?.sceneIds.length, exploredEdgeCount: review.exploredEdgeCount, truncated: review.truncated }
    }, null, 2));

    expect(review.status).toBe("found");
    expect(review.candidates[0]?.sceneIds.at(0)).toBe(sceneId(0));
    expect(review.candidates[0]?.sceneIds.at(-1)).toBe(sceneId(9_999));
    expect(elapsedMs).toBeLessThan(endingRouteReviewBudgetMs);
  });

  it("locates a diagnostic and anchors its 64-scene window in a real 10k graph within 250ms", () => {
    const graph = buildRouteGraph(createBranchingRouteProject());
    const index = createRouteGraphIndex(graph);
    const diagnostic = {
      severity: "error" as const,
      code: "UNREACHABLE_SCENE" as const,
      message: "Synthetic navigation target for the 10k performance gate.",
      sceneId: sceneId(9_999),
      statementId: `ending_${sceneId(9_999)}`
    };
    const started = performance.now();
    const location = locateRouteDiagnostic(graph, diagnostic);
    const window = queryRouteGraphWindow(index, { anchorSceneId: location.sceneId });
    const elapsedMs = performance.now() - started;

    console.log(JSON.stringify({
      status: location.status === "located" && elapsedMs < queryBudgetMs ? "PASS" : "FAIL",
      baseline: { sceneCount, targetSceneId: diagnostic.sceneId, windowLimit: ROUTE_GRAPH_WINDOW_LIMIT },
      measurementsMs: { diagnosticLocationAndWindow: Number(elapsedMs.toFixed(2)) },
      budgetMs: { diagnosticLocationAndWindow: queryBudgetMs },
      result: { location, window: [window.start, window.end], mountedNodes: window.nodes.length }
    }, null, 2));

    expect(location).toEqual({ schemaVersion: 1, status: "located", sceneId: diagnostic.sceneId, statementId: diagnostic.statementId });
    expect(window.nodes.some((node) => node.id === diagnostic.sceneId)).toBe(true);
    expect(window.nodes.length).toBeLessThanOrEqual(ROUTE_GRAPH_WINDOW_LIMIT);
    expect(elapsedMs).toBeLessThan(queryBudgetMs);
  });

  it("reads only one trusted 64-scene structure/layout page from a 10k Route within 500ms", async () => {
    const project = createBranchingRouteProject();
    const workspace = new PerformanceRouteWorkspace(saveProject(project));
    await publishTrustedRouteOverview(workspace, project, compileProjectIncremental(project), workspace.commit.version);
    workspace.selectedReads.length = 0;
    const started = performance.now();
    const overview = await readTrustedRouteOverview(workspace, { anchorSceneId: sceneId(5_555) });
    const elapsedMs = performance.now() - started;

    console.log(JSON.stringify({
      status: elapsedMs < lazyRouteStructurePageBudgetMs ? "PASS" : "FAIL",
      baseline: { sceneCount, windowLimit: ROUTE_GRAPH_WINDOW_LIMIT, operation: "trusted manifest/chapter + scene/layout page" },
      measurementsMs: { lazyRouteStructurePage: Number(elapsedMs.toFixed(2)) },
      budgetMs: { lazyRouteStructurePage: lazyRouteStructurePageBudgetMs },
      result: { selectedReadBatchSizes: workspace.selectedReads.map((paths) => paths.length), sourceFileCount: overview.sourceRead.fileCount, mountedNodes: overview.window.nodes.length }
    }, null, 2));

    expect(overview.window.nodes.some((node) => node.id === sceneId(5_555))).toBe(true);
    expect(workspace.selectedReads.map((paths) => paths.length)).toEqual([1, 1, 64, 64]);
    expect(overview.sourceRead.fileCount).toBe(130);
    expect(workspace.fullReads).toBe(0);
    expect(elapsedMs).toBeLessThan(lazyRouteStructurePageBudgetMs);
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

  it("proves a 10k-statement lazy narration insertion Compiler/Route-safe within 500ms", () => {
    const statements = [
      ...Array.from({ length: 9_999 }, (_, index) => ({ id: `statement_scale_${index}`, kind: "narration", textId: `text_scale_${index}`, text: `Line ${index}` })),
      { id: "statement_end", kind: "end", endingName: "Done" }
    ] as readonly JsonObject[];
    const baseline: ScriptDocument = { schemaVersion: 1, sceneId: "scene_scale", statements };
    const inserted = { id: "statement_inserted", kind: "narration", textId: "text_inserted", text: "Inserted" };
    const candidate: ScriptDocument = { ...baseline, statements: [...statements.slice(0, -1), inserted, statements.at(-1)!] };
    const started = performance.now();
    const compiler = preflightLazyNarrationInsertion(baseline, candidate, { afterId: "statement_scale_9998", statementId: "statement_inserted", textId: "text_inserted" });
    const route = compiler.ok ? preflightRouteNeutralSceneEdit(baseline, candidate, compiler.changedStatementIds) : compiler;
    const elapsedMs = performance.now() - started;

    console.log(JSON.stringify({
      status: compiler.ok && route.ok && elapsedMs < lazyStructuralPreflightBudgetMs ? "PASS" : "FAIL",
      baseline: { statementCount: 10_000, operation: "insert one narration with Compiler and Route proofs" },
      measurementsMs: { lazyStructuralPreflight: Number(elapsedMs.toFixed(2)) },
      budgetMs: { lazyStructuralPreflight: lazyStructuralPreflightBudgetMs },
      result: { compiler, route }
    }, null, 2));

    expect(compiler.ok).toBe(true);
    expect(route.ok).toBe(true);
    expect(elapsedMs).toBeLessThan(lazyStructuralPreflightBudgetMs);
  });

  it("proves 10k-statement before-insert, move, and delete transactions within 500ms each", () => {
    const statements = [
      ...Array.from({ length: 9_999 }, (_, index) => ({ id: `statement_scale_${index}`, kind: "narration", textId: `text_scale_${index}`, text: `Line ${index}` })),
      { id: "statement_end", kind: "end", endingName: "Done" }
    ] as readonly JsonObject[];
    const baseline: ScriptDocument = { schemaVersion: 1, sceneId: "scene_scale", statements };
    const insertedStatement = { id: "statement_inserted", kind: "narration", textId: "text_inserted", text: "Inserted" };
    const inserted: ScriptDocument = { ...baseline, statements: [...statements.slice(0, -1), insertedStatement, statements.at(-1)!] };
    const moved: ScriptDocument = { ...inserted, statements: [insertedStatement, ...inserted.statements.filter((statement) => statement.id !== "statement_inserted")] };
    const deleted: ScriptDocument = baseline;
    const cases = [
      [baseline, inserted, { kind: "insert-before", beforeId: "statement_end", statementId: "statement_inserted", textId: "text_inserted" }],
      [inserted, moved, { kind: "move-before", statementId: "statement_inserted", beforeId: "statement_scale_0" }],
      [inserted, deleted, { kind: "delete", statementId: "statement_inserted" }]
    ] as const;
    const measurements = cases.map(([before, after, request]) => {
      const started = performance.now();
      const compiler = preflightLazyNarrationStructuralEdit(before, after, request);
      const route = compiler.ok ? preflightRouteNeutralSceneEdit(before, after, compiler.changedStatementIds) : compiler;
      return { elapsedMs: performance.now() - started, compiler, route };
    });

    console.log(JSON.stringify({
      status: measurements.every((measurement) => measurement.compiler.ok && measurement.route.ok && measurement.elapsedMs < lazyStructuralPreflightBudgetMs) ? "PASS" : "FAIL",
      baseline: { statementCount: 10_000, operations: ["insert-before", "move-before", "delete"] },
      measurementsMs: measurements.map((measurement) => Number(measurement.elapsedMs.toFixed(2))),
      budgetMs: { eachStructuralPreflight: lazyStructuralPreflightBudgetMs }
    }, null, 2));

    for (const measurement of measurements) {
      expect(measurement.compiler.ok).toBe(true);
      expect(measurement.route.ok).toBe(true);
      expect(measurement.elapsedMs).toBeLessThan(lazyStructuralPreflightBudgetMs);
    }
  });
});

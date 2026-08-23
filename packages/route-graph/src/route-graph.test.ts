import { describe, expect, it } from "vitest";
import { compileProject } from "@world-studio/project-compiler";
import { createProjectTemplate, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { assignRouteSceneGroup, buildRouteGraph, buildRouteGraphFromCompilation, createRouteGraphIndex, deleteRouteGroup, queryRouteGraphWindow, renameRouteScene, resetRouteSceneLayout, setRouteScenePosition, setRouteViewport, toggleRouteGroup, upsertRouteGroup } from "./route-graph";

function routeProject(includeDangling = true): CanonicalProject {
  const base = createProjectTemplate("Route Graph", "n40-route-graph-tests");
  const statements: Record<string, readonly JsonObject[]> = {
    route_entry: [
      { id: "label_start", kind: "label", name: "start" },
      { id: "condition_retry", kind: "condition", expression: "flag == true", targetLabel: "start" },
      { id: "choice_path", kind: "choice", prompt: "去哪边？", options: [
        { id: "option_left", label: "左边", targetSceneId: "route_left" },
        ...(includeDangling ? [{ id: "option_missing", label: "失效路线", targetSceneId: "route_missing" }] : [])
      ] }
    ],
    route_left: [
      { id: "call_epilogue", kind: "call", targetLabel: "epilogue" },
      { id: "label_epilogue", kind: "label", name: "epilogue" },
      { id: "ending_left", kind: "end", endingName: "左侧结局" }
    ]
  };
  return {
    ...base,
    manifest: { ...base.manifest, entrySceneId: "route_entry", chapterPaths: ["chapters/chapter_main.json"] },
    chapters: [{ schemaVersion: 1, id: "chapter_main", title: "主线", scenePaths: ["scenes/route_entry.json", "scenes/route_left.json"] }],
    scenes: [
      { schemaVersion: 1, id: "route_entry", title: "入口", scriptPath: "scripts/route_entry.json", layoutPath: "layouts/route_entry.json" },
      { schemaVersion: 1, id: "route_left", title: "左侧", scriptPath: "scripts/route_left.json", layoutPath: "layouts/route_left.json" }
    ],
    variables: { schemaVersion: 1, variables: [{ id: "flag", name: "flag", type: "boolean", defaultValue: false, scope: "story" }] },
    scripts: Object.fromEntries(Object.entries(statements).map(([sceneId, value]) => [sceneId, { schemaVersion: 1, sceneId, statements: value }])),
    layouts: Object.fromEntries(Object.keys(statements).map((sceneId) => [sceneId, { schemaVersion: 1, sceneId, nodes: [] }]))
  };
}

describe("N40 route graph", () => {
  it("projects a supplied formal Compiler result without owning workspace cache parsing", () => {
    const project = routeProject();
    const compilation = compileProject(project, "debug");
    expect(buildRouteGraphFromCompilation(project, compilation)).toEqual(buildRouteGraph(project));
  });

  it("projects chapters, stable scenes, compiler facts, endings, and dangling route diagnostics deterministically", () => {
    const first = buildRouteGraph(routeProject());
    const second = buildRouteGraph(routeProject());

    expect(second).toEqual(first);
    expect(first.chapters).toEqual([{ id: "chapter_main", title: "主线", sceneIds: ["route_entry", "route_left"] }]);
    expect(first.nodes.map((node) => [node.id, node.kind, node.chapterId])).toEqual([
      ["route_entry", "entry", "chapter_main"],
      ["route_left", "ending", "chapter_main"]
    ]);
    expect(first.nodes[0]?.facts.map((fact) => [fact.kind, fact.id])).toEqual([
      ["label", "label_start"],
      ["condition", "condition_retry"],
      ["choice", "choice_path"]
    ]);
    expect(first.edges.map((edge) => [edge.id, edge.targetSceneId, edge.status])).toEqual([
      ["option_left", "route_left", "valid"],
      ["option_missing", "route_missing", "dangling"]
    ]);
    expect(first.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_TARGET_SCENE", sceneId: "route_entry", entityId: "route_missing" })
    ]));
  });

  it("maps chapter topology from canonical scene order without deriving IDs from source filenames", () => {
    const base = routeProject(false);
    const project: CanonicalProject = {
      ...base,
      chapters: [{ ...base.chapters[0]!, scenePaths: ["content/opening.json", "content/finale.json"] }]
    };

    const graph = buildRouteGraph(project);

    expect(graph.chapters[0]?.sceneIds).toEqual(["route_entry", "route_left"]);
    expect(graph.nodes.map((node) => [node.id, node.chapterId])).toEqual([
      ["route_entry", "chapter_main"],
      ["route_left", "chapter_main"]
    ]);
  });

  it("fails closed when chapter topology and canonical scenes have different cardinality", () => {
    const base = routeProject(false);
    const project: CanonicalProject = { ...base, chapters: [{ ...base.chapters[0]!, scenePaths: ["content/opening.json"] }] };
    const compilation = compileProject(base, "debug");

    expect(() => buildRouteGraphFromCompilation(project, compilation)).toThrow(/chapter topology does not match/);
  });

  it("renames through Project Service while preserving the stable scene ID and graph edges", () => {
    const project = routeProject(false);
    const before = buildRouteGraph(project);
    const edited = renameRouteScene(project, "command_route_rename", "route_left", "左侧月台");

    if (!edited.ok) throw new Error(`${edited.error.code}: ${edited.error.message}`);
    expect(edited.changeSet.changedEntityIds).toEqual(["route_left"]);
    expect(edited.changeSet.beforeHash).not.toBe(edited.changeSet.afterHash);
    const after = buildRouteGraph(edited.project);
    expect(after.nodes.find((node) => node.id === "route_left")?.title).toBe("左侧月台");
    expect(after.edges).toEqual(before.edges);
  });

  it("fails closed for blank names and unknown scenes without mutating the project", () => {
    const project = routeProject(false);
    expect(renameRouteScene(project, "command_blank", "route_left", "  ")).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
    expect(renameRouteScene(project, "command_missing", "route_unknown", "未知")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(project.scenes[1]?.title).toBe("左侧");
  });

  it("queries a bounded deterministic window without dropping local connections", () => {
    const graph = buildRouteGraph(routeProject(false));
    const index = createRouteGraphIndex(graph);
    const first = queryRouteGraphWindow(index, { limit: 1 });
    const second = queryRouteGraphWindow(index, { offset: 1, limit: 1 });
    const searched = queryRouteGraphWindow(index, { query: "左侧结局", limit: 1 });

    expect(first).toMatchObject({ start: 0, end: 1, totalMatches: 2, hasPrevious: false, hasNext: true });
    expect(first.nodes.map((node) => node.id)).toEqual(["route_entry"]);
    expect(first.edges.map((edge) => edge.id)).toEqual(["option_left"]);
    expect(second).toMatchObject({ start: 1, end: 2, totalMatches: 2, hasPrevious: true, hasNext: false });
    expect(second.nodes.map((node) => node.id)).toEqual(["route_left"]);
    expect(second.edges.map((edge) => edge.id)).toEqual(["option_left"]);
    expect(searched.nodes.map((node) => node.id)).toEqual(["route_left"]);
  });

  it("persists route positions in layout sidecars while script edits preserve them", () => {
    const project = routeProject(false);
    const positioned = setRouteScenePosition(project, "command_layout_position", "route_left", 640, 360);
    if (!positioned.ok) throw new Error(`${positioned.error.code}: ${positioned.error.message}`);

    expect(positioned.project.layouts.route_left?.nodes).toEqual([{ nodeId: "route_left", x: 640, y: 360 }]);
    expect(buildRouteGraph(positioned.project).nodes.find((node) => node.id === "route_left")?.layout)
      .toEqual({ x: 640, y: 360, source: "sidecar" });

    const renamed = renameRouteScene(positioned.project, "command_layout_rename", "route_left", "布局保留");
    if (!renamed.ok) throw new Error(`${renamed.error.code}: ${renamed.error.message}`);
    expect(renamed.project.layouts.route_left?.nodes).toEqual([{ nodeId: "route_left", x: 640, y: 360 }]);
  });

  it("rebuilds a deleted layout without changing scripts or compiler route facts", () => {
    const project = routeProject(false);
    const positioned = setRouteScenePosition(project, "command_layout_seed", "route_left", 640, 360);
    if (!positioned.ok) throw new Error(`${positioned.error.code}: ${positioned.error.message}`);
    const beforeGraph = buildRouteGraph(positioned.project);
    const beforeScripts = structuredClone(positioned.project.scripts);
    const reset = resetRouteSceneLayout(positioned.project, "command_layout_reset", "route_left");
    if (!reset.ok) throw new Error(`${reset.error.code}: ${reset.error.message}`);

    expect(reset.project.layouts.route_left?.nodes).toEqual([]);
    expect(reset.project.scripts).toEqual(beforeScripts);
    expect(buildRouteGraph(reset.project)).toEqual({
      ...beforeGraph,
      nodes: beforeGraph.nodes.map((node) => node.id === "route_left"
        ? { ...node, layout: { x: 360, y: 96, source: "automatic" } }
        : node)
    });
  });

  it("rejects non-finite positions and unknown scenes without mutation", () => {
    const project = routeProject(false);
    expect(setRouteScenePosition(project, "command_layout_nan", "route_left", Number.NaN, 10))
      .toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" }, project });
    expect(setRouteScenePosition(project, "command_layout_missing", "route_missing", 10, 10))
      .toMatchObject({ ok: false, error: { code: "NOT_FOUND" }, project });
  });

  it("persists groups, folding, and viewport without creating story semantics", () => {
    const project=routeProject(false);const beforeScripts=structuredClone(project.scripts);const beforeEdges=buildRouteGraph(project).edges;
    const grouped=upsertRouteGroup(project,"command_group_upsert","group_branch","支线路线");if(!grouped.ok)throw new Error(grouped.error.message);
    const assigned=assignRouteSceneGroup(grouped.project,"command_group_assign","route_left","group_branch");if(!assigned.ok)throw new Error(assigned.error.message);
    const viewport=setRouteViewport(assigned.project,"command_viewport",120,80,1.25);if(!viewport.ok)throw new Error(viewport.error.message);
    const collapsed=toggleRouteGroup(viewport.project,"command_group_toggle","group_branch");if(!collapsed.ok)throw new Error(collapsed.error.message);
    const graph=buildRouteGraph(collapsed.project);
    expect(graph.groups).toEqual([{groupId:"group_branch",title:"支线路线",collapsed:true}]);
    expect(graph.viewport).toEqual({x:120,y:80,zoom:1.25,source:"sidecar"});
    expect(graph.nodes.find((node)=>node.id==="route_left")?.layout.groupId).toBe("group_branch");
    expect(queryRouteGraphWindow(createRouteGraphIndex(graph)).nodes.map((node)=>node.id)).toEqual(["route_entry"]);
    expect(collapsed.project.scripts).toEqual(beforeScripts);expect(graph.edges).toEqual(beforeEdges);
    const deleted=deleteRouteGroup(collapsed.project,"command_group_delete","group_branch");if(!deleted.ok)throw new Error(deleted.error.message);
    const restored=buildRouteGraph(deleted.project);expect(restored.groups).toEqual([]);expect(restored.nodes.find((node)=>node.id==="route_left")?.layout.groupId).toBeUndefined();expect(queryRouteGraphWindow(createRouteGraphIndex(restored)).nodes).toHaveLength(2);
  });

  it("fails closed for unknown groups and unsafe viewport zoom", () => {
    const project=routeProject(false);
    expect(assignRouteSceneGroup(project,"command_unknown_group","route_left","group_missing")).toMatchObject({ok:false,error:{code:"NOT_FOUND"},project});
    expect(setRouteViewport(project,"command_bad_zoom",0,0,0.1)).toMatchObject({ok:false,error:{code:"INVALID_COMMAND"},project});
  });

  it("combines P0 chapter, node-kind, and group filters before applying the bounded window",()=>{
    const project=routeProject(false);const grouped=upsertRouteGroup(project,"command_group_filter","group_left","左线");expect(grouped.ok).toBe(true);if(!grouped.ok)return;
    const assigned=assignRouteSceneGroup(grouped.project,"command_assign_filter","route_left","group_left");expect(assigned.ok).toBe(true);if(!assigned.ok)return;
    const index=createRouteGraphIndex(buildRouteGraph(assigned.project));
    expect(queryRouteGraphWindow(index,{kind:"entry"}).nodes.map((node)=>node.id)).toEqual(["route_entry"]);
    expect(queryRouteGraphWindow(index,{kind:"ending",groupId:"group_left"}).nodes.map((node)=>node.id)).toEqual(["route_left"]);
    expect(queryRouteGraphWindow(index,{groupId:null}).nodes.map((node)=>node.id)).toEqual(["route_entry"]);
    expect(queryRouteGraphWindow(index,{chapterId:"chapter_missing"})).toMatchObject({totalMatches:0,nodes:[]});
  });
});

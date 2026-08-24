import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProject } from "@world-studio/project-persistence";
import { campusStoryProject, type StoryProject } from "@world-studio/story-core";
import { buildRouteGraph, createRouteGraphIndex, queryRouteGraphWindow } from "@world-studio/route-graph";
import { App, runtimeRouteAnchorSceneId } from "./App";
import { projectCanonicalForEditor, projectCanonicalFromStory } from "./canonical-project-adapter";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";
import { restoreStudioSession } from "./studio-session";

afterEach(() => vi.unstubAllGlobals());

function renderRouteMap() {
  const onProjectChange = vi.fn();
  const project = projectCanonicalFromStory(campusStoryProject, "n40-route-map-app-tests");
  render(<App initialProject={project} onProjectChange={onProjectChange} />);
  fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
  return { onProjectChange };
}

function branchingStory(sceneCount: number): StoryProject {
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const id = `route_ui_${String(index).padStart(3, "0")}`;
    const childIndexes = [index * 2 + 1, index * 2 + 2].filter((value) => value < sceneCount);
    return {
      id,
      title: `Route UI Scene ${index}`,
      statements: childIndexes.length === 0
        ? [{ id: `ending_${id}`, kind: "end" as const, endingName: `Ending ${index}` }]
        : [{ id: `choice_${id}`, kind: "choice" as const, prompt: `Branch ${index}`, options: childIndexes.map((childIndex) => ({ id: `option_${id}_${childIndex}`, label: `To ${childIndex}`, targetSceneId: `route_ui_${String(childIndex).padStart(3, "0")}` })) }]
    };
  });
  return { schemaVersion: 0, id: "route-ui-window", title: "Route UI Window", entrySceneId: "route_ui_000", characters: [], scenes };
}

function pagedRuntimeStory(sceneCount: number): StoryProject {
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const id = `runtime_route_${String(index).padStart(3, "0")}`;
    return {
      id,
      title: `Runtime Route Scene ${index}`,
      statements: index === 0
        ? [{ id: `choice_${id}`, kind: "choice" as const, prompt: "Choose page target", options: Array.from({ length: sceneCount - 1 }, (_, optionIndex) => ({ id: `edge_0_${optionIndex + 1}`, label: `Target ${optionIndex + 1}`, targetSceneId: `runtime_route_${String(optionIndex + 1).padStart(3, "0")}` })) }]
        : [{ id: `ending_${id}`, kind: "end" as const, endingName: `Window ${index}` }]
    };
  });
  return { schemaVersion: 0, id: "runtime-route-window", title: "Runtime Route Window", entrySceneId: "runtime_route_000", characters: [], scenes };
}

function diagnosticStory(): StoryProject {
  return {
    schemaVersion: 0,
    id: "route-diagnostic-story",
    title: "Route Diagnostic Story",
    entrySceneId: "diagnostic_entry",
    characters: [],
    scenes: [
      { id: "diagnostic_entry", title: "Diagnostic Entry", statements: [
        { id: "diagnostic_label", kind: "label", name: "loop" },
        { id: "diagnostic_jump", kind: "jump", targetLabel: "loop" },
        { id: "diagnostic_end", kind: "end", endingName: "Never" }
      ] }
    ]
  };
}

function pagedDiagnosticStory(sceneCount: number): StoryProject {
  const project = branchingStory(sceneCount);
  const unreachableSceneId = `route_ui_${String(sceneCount - 1).padStart(3, "0")}`;
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      statements: scene.statements.map((statement) => statement.kind === "choice"
        ? { ...statement, options: statement.options.filter((option) => option.targetSceneId !== unreachableSceneId) }
        : statement)
    }))
  };
}

function labelNavigationStory(): StoryProject {
  return { schemaVersion: 0, id: "route-label-navigation", title: "Route Label Navigation", entrySceneId: "label_scene", characters: [], scenes: [{
    id: "label_scene",
    title: "Label Scene",
    statements: [
      { id: "jump_finish", kind: "jump", targetLabel: "finish" },
      { id: "label_finish", kind: "label", name: "finish" },
      { id: "label_end", kind: "end", endingName: "Label Done" }
    ]
  }] };
}

function repairableRouteStory(): StoryProject {
  return {
    schemaVersion: 0,
    id: "route-repair-story",
    title: "Route Repair Story",
    entrySceneId: "repair_entry",
    characters: [],
    scenes: [
      { id: "repair_entry", title: "Repair Entry", statements: [{
        id: "repair_choice",
        kind: "choice",
        prompt: "Choose repair target",
        options: [
          { id: "repair_goal_option", label: "前往目标", targetSceneId: "repair_detour" },
          { id: "repair_detour_option", label: "保留支线", targetSceneId: "repair_detour" }
        ]
      }] },
      { id: "repair_detour", title: "Detour Ending", statements: [{ id: "repair_detour_end", kind: "end", endingName: "Detour" }] },
      { id: "repair_goal", title: "Goal Ending", statements: [{ id: "repair_goal_end", kind: "end", endingName: "Goal Reached" }] }
    ]
  };
}

describe("N40 Route Map product flow", () => {
  it("searches the compiler-derived scene graph without changing stable IDs", () => {
    renderRouteMap();

    expect(screen.getByRole("heading", { name: "Route Map" })).toBeVisible();
    expect(screen.getByText("Compiler 图事实")).toBeVisible();
    const summary = screen.getByLabelText("路线图统计");
    expect(within(summary).getByText("3 场景")).toBeVisible();
    expect(within(summary).getByText("2 连接")).toBeVisible();
    const search = screen.getByRole("searchbox", { name: "搜索路线图" });
    fireEvent.change(search, { target: { value: "天台" } });
    const nodes = screen.getByLabelText("路线场景节点");
    expect(within(nodes).getByRole("button", { name: /路线场景：风中的天台/ })).toBeVisible();
    expect(within(nodes).queryByRole("button", { name: /路线场景：旧广播室/ })).not.toBeInTheDocument();
    expect(within(nodes).getByText("scn_rooftop")).toBeVisible();
  });

  it("renames a selected scene through Project Service and enters Sequence with the same stable ID", () => {
    const { onProjectChange } = renderRouteMap();
    fireEvent.click(screen.getByRole("button", { name: /路线场景：旧广播室/ }));
    const editor = screen.getByLabelText("路线场景名称");
    expect(editor).toHaveValue("旧广播室");
    fireEvent.change(editor, { target: { value: "旧广播室 · 修订" } });
    fireEvent.click(screen.getByRole("button", { name: "通过 Project Service 保存" }));

    expect(screen.getByText(/Project Service 已提交/)).toBeVisible();
    expect(screen.getByRole("button", { name: /路线场景：旧广播室 · 修订/ })).toBeVisible();
    expect(screen.getAllByText("scn_broadcast_room").length).toBeGreaterThan(0);
    expect(onProjectChange).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "进入 Sequence" }));
    expect(screen.getByRole("tab", { name: "Sequence" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "旧广播室 · 修订" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain('scene "旧广播室 · 修订" @id(scn_broadcast_room)');
  });

  it("fails closed for a blank route title without publishing a project change", () => {
    const { onProjectChange } = renderRouteMap();
    const callsBeforeEdit = onProjectChange.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /路线场景：风中的天台/ }));
    fireEvent.change(screen.getByLabelText("路线场景名称"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "通过 Project Service 保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("INVALID_COMMAND");
    expect(screen.getByRole("button", { name: /路线场景：风中的天台/ })).toBeVisible();
    expect(onProjectChange.mock.calls).toHaveLength(callsBeforeEdit);
  });

  it("mounts only a bounded route window and pages through a larger branching project", () => {
    const project = projectCanonicalFromStory(branchingStory(70), "n40-route-window-ui");
    render(<App initialProject={project} />);
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));

    const nodes = screen.getByLabelText("路线场景节点");
    expect(within(nodes).getAllByRole("button")).toHaveLength(64);
    expect(screen.getByRole("status", { name: "路线窗口范围" })).toHaveTextContent("1–64 / 70");
    fireEvent.click(screen.getByRole("button", { name: "下一段路线场景" }));
    expect(within(nodes).getAllByRole("button")).toHaveLength(6);
    expect(within(nodes).getByRole("button", { name: /Route UI Scene 69/ })).toBeVisible();
    expect(within(nodes).queryByRole("button", { name: /Route UI Scene 0 ·/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索路线图" }), { target: { value: "Ending 69" } });
    expect(within(nodes).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("status", { name: "路线窗口范围" })).toHaveTextContent("1–1 / 1");
  }, 10_000);

  it("filters the visible Route window by P0 node type without changing canonical content",()=>{
    renderRouteMap();const nodes=screen.getByLabelText("路线场景节点");
    fireEvent.change(screen.getByLabelText("路线节点类型过滤"),{target:{value:"ending"}});
    expect(within(nodes).getAllByRole("button")).toHaveLength(2);
    expect(within(nodes).queryByRole("button",{name:/路线场景：放学后的校门/})).not.toBeInTheDocument();
    expect(screen.getByRole("status",{name:"路线窗口范围"})).toHaveTextContent("1–2 / 2");
    fireEvent.change(screen.getByLabelText("路线节点类型过滤"),{target:{value:"entry"}});
    expect(within(nodes).getAllByRole("button")).toHaveLength(1);
    expect(within(nodes).getByRole("button",{name:/路线场景：放学后的校门/})).toBeVisible();
  });

  it("opens the same stable scene in Writer by double-clicking a Route node", () => {
    renderRouteMap();
    fireEvent.doubleClick(screen.getByRole("button", { name: /路线场景：风中的天台/ }));
    expect(screen.getByRole("tab", { name: "Sequence" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "风中的天台" })).toBeVisible();
  });

  it("reviews a selected ending route and highlights its Compiler scenes and connections", () => {
    renderRouteMap();
    fireEvent.change(screen.getByLabelText("审阅结局路线"), { target: { value: "scn_rooftop" } });

    expect(screen.getByRole("status", { name: "结局路线审阅状态" })).toHaveTextContent("已找到 1 条候选路线");
    expect(screen.getByLabelText("结局候选路线")).toHaveValue("0");
    expect(screen.getByRole("status", { name: "结局路线步骤" })).toHaveTextContent("2 / 2");
    expect(screen.getByRole("button", { name: /路线场景：风中的天台/ })).toHaveAttribute("data-route-reviewed", "true");
    expect(screen.getByTestId("route-edge-opt_rooftop")).toHaveAttribute("data-route-reviewed", "true");

    fireEvent.click(screen.getByRole("button", { name: "上一个审阅路线节点" }));
    expect(screen.getByRole("status", { name: "结局路线步骤" })).toHaveTextContent("1 / 2");
    expect(screen.getByRole("button", { name: /路线场景：放学后的校门/ })).toHaveAttribute("data-route-reviewed", "true");
  });

  it("navigates valid scene and label targets without editing canonical content", () => {
    const { onProjectChange } = renderRouteMap();
    const callsBeforeNavigation = onProjectChange.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "定位场景目标：去天台 · scn_rooftop" }));
    expect(screen.getByRole("button", { name: /路线场景：风中的天台/ })).toHaveAttribute("aria-pressed", "true");
    expect(onProjectChange).toHaveBeenCalledTimes(callsBeforeNavigation);

    render(<App initialProject={projectCanonicalFromStory(labelNavigationStory(), "n40-label-navigation")} />);
    const flowTabs = screen.getAllByRole("tab", { name: "Flow" });
    fireEvent.click(flowTabs.at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "打开标签目标：finish" }));
    const labelCard = screen.getByRole("button", { name: /选择标签：finish/ });
    expect(labelCard).toHaveFocus();
  });

  it("anchors a Compiler diagnostic across a 64-node window", () => {
    render(<App initialProject={projectCanonicalFromStory(pagedDiagnosticStory(65), "n40-diagnostic-window")} />);
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
    expect(screen.getByRole("status", { name: "路线窗口范围" })).toHaveTextContent("1–64 / 65");
    expect(document.querySelectorAll("datalist option")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "修改 Choice 目标" }));
    expect(document.querySelectorAll("datalist option")).toHaveLength(64);
    fireEvent.click(screen.getByRole("button", { name: "定位诊断：UNREACHABLE_SCENE · route_ui_064" }));
    expect(screen.getByRole("status", { name: "路线窗口范围" })).toHaveTextContent("65–65 / 65");
    expect(screen.getByRole("button", { name: /路线场景：Route UI Scene 64/ })).toHaveAttribute("aria-pressed", "true");
  }, 10_000);

  it("enters the exact diagnostic statement and fails closed for global diagnostics", () => {
    render(<App initialProject={projectCanonicalFromStory(diagnosticStory(), "n40-diagnostic-content")} />);
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
    const globalDiagnostic = screen.getByRole("button", { name: /定位诊断：NO_REACHABLE_ENDING · 全局/ });
    expect(globalDiagnostic).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "进入诊断内容：UNREACHABLE_STATEMENT · diagnostic_end" }));
    expect(screen.getByRole("tab", { name: "Sequence" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "选择结局：结局 · Never" })).toHaveFocus();
  });

  it("repairs a diagnosed route, saves it, and reaches the new ending through formal Runtime", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const project = projectCanonicalFromStory(repairableRouteStory(), "n40-e8n-route-repair");
    const onProjectSave = vi.fn<(project: StoryProject) => Promise<void>>(async () => undefined);
    render(<App initialProject={project} onProjectSave={onProjectSave} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "保存到本机" })).toBeEnabled());
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));

    expect(screen.getByRole("button", { name: "定位诊断：UNREACHABLE_SCENE · repair_goal" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "修改 Choice 目标" }));
    fireEvent.change(screen.getByRole("combobox", { name: "修改选择目标：前往目标" }), { target: { value: "repair_goal" } });
    fireEvent.click(screen.getByRole("button", { name: "应用选择目标：前往目标" }));

    expect(await screen.findByText(/路线目标已提交.*repair_detour→repair_goal/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "定位诊断：UNREACHABLE_SCENE · repair_goal" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "定位路线目标：前往目标 · repair_goal" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    await waitFor(() => expect(onProjectSave).toHaveBeenCalledTimes(1));
    expect(onProjectSave.mock.calls[0]?.[0].scenes[0]?.statements[0]).toMatchObject({
      kind: "choice",
      options: expect.arrayContaining([expect.objectContaining({ id: "repair_goal_option", targetSceneId: "repair_goal" })])
    });
    const persisted = await loadProject(new IndexedDbProjectFileStore(indexedDb, project.manifest.projectId));
    expect(persisted).not.toBeNull();
    expect(restoreStudioSession(persisted!, projectCanonicalForEditor(project).project).project.scenes[0]?.statements[0]).toMatchObject({
      kind: "choice",
      options: expect.arrayContaining([expect.objectContaining({ id: "repair_goal_option", targetSceneId: "repair_goal" })])
    });

    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    fireEvent.click(screen.getByRole("button", { name: "选择路线：前往目标" }));
    expect(screen.getByText("流程完成：Goal Reached")).toBeVisible();
    expect(screen.getByRole("button", { name: "路线场景：Goal Ending · repair_goal" })).toHaveAttribute("aria-current", "step");
  });

  it("anchors ending-route steps across real 64-node Route windows", () => {
    const project = projectCanonicalFromStory(pagedRuntimeStory(65), "n40-ending-route-window");
    render(<App initialProject={project} />);
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
    fireEvent.change(screen.getByLabelText("审阅结局路线"), { target: { value: "runtime_route_064" } });

    const nodes = screen.getByLabelText("路线场景节点");
    expect(screen.getByRole("status", { name: "路线窗口范围" })).toHaveTextContent("65–65 / 65");
    expect(within(nodes).getByRole("button", { name: /Runtime Route Scene 64/ })).toHaveAttribute("data-route-reviewed", "true");
    fireEvent.click(screen.getByRole("button", { name: "上一个审阅路线节点" }));
    expect(screen.getByRole("status", { name: "路线窗口范围" })).toHaveTextContent("1–64 / 65");
    expect(within(nodes).getByRole("button", { name: /Runtime Route Scene 0/ })).toHaveAttribute("data-route-reviewed", "true");
    expect(within(nodes).queryByRole("button", { name: /Runtime Route Scene 64/ })).not.toBeInTheDocument();
  }, 10_000);

  it("highlights the current, visited, and traversed Route facts from formal Runtime History", () => {
    renderRouteMap();
    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));

    const routeTrace = screen.getByRole("status", { name: "运行路线高亮" });
    const entry = screen.getByRole("button", { name: /路线场景：放学后的校门/ });
    expect(entry).toHaveAttribute("aria-current", "step");
    expect(entry).toHaveAttribute("data-runtime-visited", "true");
    expect(routeTrace).toHaveTextContent("当前：放学后的校门");

    const controls = screen.getByRole("group", { name: "Runtime 调试控制" });
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(within(controls).getByRole("button", { name: "Continue" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "选择路线：去广播室" }));

    const radio = screen.getByRole("button", { name: /路线场景：旧广播室/ });
    expect(radio).toHaveAttribute("aria-current", "step");
    expect(radio).toHaveAttribute("data-runtime-visited", "true");
    expect(screen.getByTestId("route-edge-opt_broadcast")).toHaveAttribute("data-runtime-visited", "true");
    expect(routeTrace).toHaveTextContent("已走连接 1");

    fireEvent.click(within(controls).getByRole("button", { name: "Runtime 后退一步" }));
    expect(entry).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("route-edge-opt_broadcast")).toHaveAttribute("data-runtime-visited", "false");
    fireEvent.click(within(controls).getByRole("button", { name: "Runtime 前进一步" }));
    expect(radio).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("route-edge-opt_broadcast")).toHaveAttribute("data-runtime-visited", "true");
  });

  it("anchors a real 65-node Compiler Route window around the Runtime current scene", () => {
    const project = projectCanonicalFromStory(pagedRuntimeStory(65), "n40-runtime-route-window");
    const index = createRouteGraphIndex(buildRouteGraph(project));
    const anchorSceneId = runtimeRouteAnchorSceneId({ active: true, currentSceneId: "runtime_route_064", visitedSceneIds: ["runtime_route_064"], visitedEdgeIds: [] }, "runtime_route_000");
    const routeWindow = queryRouteGraphWindow(index, { anchorSceneId });

    expect(anchorSceneId).toBe("runtime_route_064");
    expect(routeWindow).toMatchObject({ start: 64, end: 65, totalMatches: 65 });
    expect(routeWindow.nodes.map((node) => node.id)).toEqual(["runtime_route_064"]);
  });
});

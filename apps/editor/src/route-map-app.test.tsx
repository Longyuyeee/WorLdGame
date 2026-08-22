import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { campusStoryProject, type StoryProject } from "@world-studio/story-core";
import { buildRouteGraph, createRouteGraphIndex, queryRouteGraphWindow } from "@world-studio/route-graph";
import { App, runtimeRouteAnchorSceneId } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

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
    expect(screen.getByRole("tab", { name: "Writer" })).toHaveAttribute("aria-selected", "true");
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
  });

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

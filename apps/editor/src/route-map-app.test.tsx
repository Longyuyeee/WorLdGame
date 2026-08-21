import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { campusStoryProject } from "@world-studio/story-core";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

function renderRouteMap() {
  const onProjectChange = vi.fn();
  const project = projectCanonicalFromStory(campusStoryProject, "n40-route-map-app-tests");
  render(<App initialProject={project} onProjectChange={onProjectChange} />);
  fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
  return { onProjectChange };
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
});

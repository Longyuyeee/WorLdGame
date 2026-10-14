import { IDBFactory } from "fake-indexeddb";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { campusStoryProject } from "@world-studio/story-core";
import { StudioLauncher } from "./studio-launcher";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import type { StudioContinuity } from "./studio-continuity";

afterEach(() => vi.unstubAllGlobals());
async function ready() { await waitFor(() => expect(document.querySelector<HTMLButtonElement>(".local-save-button")?.disabled).toBe(false)); }
async function structure() {
  await ready(); fireEvent.click(screen.getByLabelText("项目菜单"));
  fireEvent.click(screen.getByRole("button", { name: /章节与角色/ }));
  await screen.findByRole("main", { name: "项目结构管理" });
}
async function returnToStory() {
  fireEvent.click(screen.getByRole("button", { name: "返回创作" }));
  await screen.findByTestId("workspace-shell"); await ready();
}
async function example() {
  vi.stubGlobal("indexedDB", new IDBFactory()); localStorage.clear();
  render(<StudioLauncher />); fireEvent.click(screen.getByRole("button", { name: "打开示例工程" }));
  await screen.findByTestId("workspace-shell"); await ready();
  fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "继续故事" }));
}

describe("author Preview continuity across structure", () => {
  it("retains a choice, future, diagnostics and route across repeated structure visits, but not project reopen", async () => {
    await example(); fireEvent.click(screen.getByText("调试详情"));
    fireEvent.click(screen.getByRole("button", { name: "选择路线：去广播室" }));
    fireEvent.click(screen.getByRole("button", { name: "Runtime 后退一步" }));
    await structure(); await returnToStory();
    expect(screen.getByLabelText("试玩接续状态")).toBeVisible();
    expect(screen.getByRole("region", { name: "Runtime 状态检查器" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Runtime 调试控制" })).toHaveTextContent("试玩记录 4/5");
    expect(screen.getByRole("button", { name: "Runtime 前进一步" })).toBeEnabled();
    for (const page of ["素材", "游戏外观", "检查", "发布"]) {
      fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name: page }));
      fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name: "故事" }));
      expect(screen.getByRole("group", { name: "Runtime 调试控制" })).toHaveTextContent("试玩记录 4/5");
    }
    fireEvent.click(screen.getByRole("button", { name: "Runtime 前进一步" }));
    await structure(); await returnToStory();
    expect(screen.getByRole("group", { name: "Runtime 调试控制" })).toHaveTextContent("试玩记录 5/5");
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "继续故事" }));
    expect(screen.getByLabelText("完整流程试玩")).toHaveTextContent("流程完成");
    await structure(); await returnToStory();
    expect(screen.getByLabelText("完整流程试玩")).toHaveTextContent("流程完成");
    fireEvent.click(screen.getByRole("button", { name: "退出试玩" }));
    await structure(); await returnToStory();
    expect(screen.queryByLabelText("试玩接续状态")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    await ready(); fireEvent.click(screen.getByLabelText("项目菜单")); fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
    await screen.findByRole("main", { name: "项目首页" });
    fireEvent.click(screen.getByRole("button", { name: /打开项目：/ }));
    await screen.findByTestId("workspace-shell"); await ready();
    expect(screen.getByRole("button", { name: "试玩完整流程" })).toBeVisible();
  }, 30_000);
  it("applies a scene title correction, but requests an explicit restart after adding a variable", async () => {
    await example(); await structure();
    fireEvent.click(screen.getByRole("button", { name: "修改场景：放学后的校门" }));
    fireEvent.change(screen.getByLabelText("新场景名称"), { target: { value: "新校门" } });
    fireEvent.click(screen.getByRole("button", { name: "保存场景" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑场景" })).not.toBeInTheDocument());
    await returnToStory();
    expect(screen.getByRole("group", { name: "Runtime 调试控制" })).toHaveTextContent("试玩记录 4/4");
    expect(screen.getByTestId("preview-stage")).toHaveTextContent("新校门");
    await structure(); fireEvent.click(screen.getByRole("button", { name: "变量" }));
    fireEvent.click(screen.getByRole("button", { name: "新增变量" }));
    fireEvent.change(screen.getByLabelText("变量名称"), { target: { value: "找到信件" } });
    fireEvent.click(screen.getByRole("button", { name: "创建变量" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "创建变量" })).not.toBeInTheDocument());
    await returnToStory();
    expect(screen.getByRole("region", { name: "Runtime 热更新" })).toHaveTextContent("需要明确重启试玩");
    expect(screen.getByRole("button", { name: "选择路线：去广播室" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "以当前启动目标重启" }));
    expect(screen.getByRole("group", { name: "Runtime 调试控制" })).toHaveTextContent("试玩记录 1/1");
  });
  it("does not mix removed active source into an old build, and offers an entry restart for a deleted start target", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory()); localStorage.clear();
    const project = projectCanonicalFromStory(campusStoryProject, "deleted-start-continuity");
    let handoff: StudioContinuity | undefined;
    const first = render(<App initialProject={project} initialSceneId="scn_broadcast_room" onCanonicalProjectSave={async () => undefined} onOpenProject={(_scene, _intent, continuity) => { handoff = continuity; }} />);
    await ready(); fireEvent.click(screen.getByText("选择试玩起点"));
    fireEvent.click(screen.getByRole("button", { name: "从当前场景运行" }));
    fireEvent.click(screen.getByRole("button", { name: "继续故事" }));
    await ready(); fireEvent.click(screen.getByLabelText("项目菜单")); fireEvent.click(screen.getByRole("button", { name: /章节与角色/ }));
    await waitFor(() => expect(handoff?.preview?.playable.sceneId).toBe("scn_broadcast_room")); first.unmount();
    const removed = projectCanonicalFromStory({ ...campusStoryProject,
      scenes: campusStoryProject.scenes.filter(scene => scene.id !== "scn_broadcast_room").map(scene => ({ ...scene,
        statements: scene.statements.map(statement => statement.kind !== "choice" ? statement : { ...statement,
          options: statement.options.map(option => option.targetSceneId === "scn_broadcast_room" ? { ...option, targetSceneId: "scn_rooftop" } : option) }) }))
    }, "deleted-start-continuity");
    render(<App initialProject={removed} continuity={handoff!} preferInitialProject />);
    await screen.findByTestId("workspace-shell");
    expect(screen.getByTestId("preview-stage")).toHaveTextContent("旧广播室");
    expect(screen.getByRole("button", { name: "继续故事" })).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Runtime 热更新" })).getByRole("button", { name: "从故事入口重新试玩" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "退出试玩并保留编辑" }));
    expect(screen.getByRole("button", { name: "试玩完整流程" })).toBeVisible();
  });
  it("keeps the active preview when saving the handoff fails, and captures it on a successful retry", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory()); localStorage.clear();
    const save = vi.fn().mockRejectedValueOnce(new Error("模拟目录写入失败")).mockResolvedValueOnce(undefined);
    const open = vi.fn();
    render(<App initialProject={projectCanonicalFromStory(campusStoryProject, "preview-save-retry")} onOpenProject={open} onCanonicalProjectSave={save} />);
    await ready(); fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    fireEvent.click(screen.getByRole("button", { name: "继续故事" }));
    await ready(); fireEvent.click(screen.getByLabelText("项目菜单")); fireEvent.click(screen.getByRole("button", { name: /章节与角色/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("当前内容尚未保存成功");
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Runtime 调试控制" })).toHaveTextContent("试玩记录 2/2");
    fireEvent.click(screen.getByRole("button", { name: /章节与角色/ }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(open.mock.calls[0]?.[2]?.preview.playable.historySession.cursor).toBe(2);
  });
});

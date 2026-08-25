import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { campusStoryProject } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

function projectWithFirstDirection(summary: string, durableEntropy: string) {
  const base = projectCanonicalFromStory(campusStoryProject, durableEntropy);
  const first = base.scripts.scn_school_gate!.statements[0]!;
  return {
    ...base,
    assets: { ...base.assets, assets: [...base.assets.assets, { assetId: "bg_host", kind: "background" }] },
    scripts: { ...base.scripts, scn_school_gate: { ...base.scripts.scn_school_gate!, statements: [{ ...first, summary }, ...base.scripts.scn_school_gate!.statements.slice(1)] } }
  };
}

describe("playable preview integration", () => {
  it("lets a creator play from the entry scene through a choice to an ending", () => {
    render(<App />);

    expect(screen.getByText("Project Compiler → Runtime · 从入口执行到结局")).toBeVisible();
    const runtimeDisclosure = screen.getByText("Runtime 诊断").closest("details");
    expect(runtimeDisclosure).not.toHaveAttribute("open");
    expect(screen.getByLabelText("预览核心控制")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    expect(runtimeDisclosure).toHaveAttribute("open");
    const inspector = screen.getByRole("region", { name: "Runtime 状态检查器" });
    expect(within(inspector).getByText("Preview Session")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Runtime 变量" })).getByText(/暂无 Runtime 变量/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Runtime 调用栈" })).getByText(/栈为空/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Runtime 结构化诊断" })).getByText(/当前 Session 无诊断/)).toBeVisible();
    const continueStory = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    continueStory();
    continueStory();
    continueStory();

    expect(within(screen.getByTestId("preview-step")).getByText("先去哪里调查？")).toBeVisible();
    expect(screen.getByText(/请选择路线/)).toBeVisible();
    expect(within(inspector).getByText(/choice ·/)).toBeVisible();
    expect(within(inspector).getByText(/scn_school_gate \/ stmt_gate_choice #3/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "选择路线：去广播室" }));

    expect(screen.getByRole("heading", { name: "旧广播室" })).toBeVisible();
    continueStory();
    continueStory();

    expect(screen.getByText("流程完成：留在电波里的名字")).toBeVisible();
    expect(within(screen.getByTestId("preview-step")).getByText("留在电波里的名字")).toBeVisible();
    expect(screen.getByRole("button", { name: "重新试玩" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "退出试玩" })).toBeEnabled();
  }, 10_000);

  it("builds and exposes a downloadable independent playable file", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:playable-web");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const view = render(<App />);

    const buildDisclosure = screen.getByText("构建与导出").closest("details");
    expect(buildDisclosure).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("构建与导出"));
    expect(buildDisclosure).toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "构建试玩 HTML" }));

    const download = screen.getByRole("link", { name: /下载 .* KiB/ });
    expect(download).toHaveAttribute("download", "黄昏广播-playable.html");
    expect(download).toHaveAttribute("href", "blob:playable-web");
    expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ type: "text/html;charset=utf-8" }));
    view.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:playable-web");
    vi.restoreAllMocks();
  });

  it("starts the formal Runtime from the selected Scene and Statement", () => {
    render(<App />);
    expect(screen.getByRole("group", { name: "Runtime 启动位置" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /02旧广播室3 个步骤/ }));
    fireEvent.click(screen.getByRole("button", { name: "从当前场景运行" }));
    let inspector = screen.getByRole("region", { name: "Runtime 状态检查器" });
    expect(within(inspector).getByText(/direction · stmt_radio_bg/)).toBeVisible();
    expect(within(inspector).getByText(/scn_broadcast_room \/ stmt_radio_bg #0/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "退出试玩" }));
    fireEvent.click(screen.getByRole("button", { name: /选择对白：这盘磁带的日期/ }));
    fireEvent.click(screen.getByRole("button", { name: "从当前语句运行" }));
    inspector = screen.getByRole("region", { name: "Runtime 状态检查器" });
    expect(within(inspector).getByText(/dialogue · stmt_radio_001/)).toBeVisible();
    expect(within(inspector).getByText(/scn_broadcast_room \/ stmt_radio_001 #1/)).toBeVisible();
  });

  it("uses formal History controls and runs to the selected cursor", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    const controls = screen.getByRole("group", { name: "Runtime 调试控制" });
    expect(within(controls).getByText("History 1/1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /选择对白：听见了。声音像是从很多年前传过来的。/ }));
    fireEvent.click(within(controls).getByRole("button", { name: "Run to Cursor" }));
    const inspector = screen.getByRole("region", { name: "Runtime 状态检查器" });
    expect(within(inspector).getByText(/dialogue · stmt_gate_002/)).toBeVisible();
    expect(within(controls).getByText("History 2/2")).toBeVisible();
    expect(within(controls).getByText("光标临时状态")).toBeVisible();

    fireEvent.click(within(controls).getByRole("button", { name: "Runtime 后退一步" }));
    expect(within(inspector).getByText(/dialogue · stmt_gate_001/)).toBeVisible();
    expect(within(controls).getByText("History 2/2")).toBeVisible();
    fireEvent.click(within(controls).getByRole("button", { name: "Runtime 后退一步" }));
    expect(within(inspector).getByText(/direction · stmt_gate_bg/)).toBeVisible();
    expect(within(controls).getByText("History 1/2")).toBeVisible();
    expect(within(controls).getByText("back · checkpoint 已恢复")).toBeVisible();
    fireEvent.click(within(controls).getByRole("button", { name: "Runtime 前进一步" }));
    expect(within(inspector).getByText(/dialogue · stmt_gate_001/)).toBeVisible();
    expect(within(controls).getByText("History 2/2")).toBeVisible();
  });

  it("presents awaited Effect completion and safe cancellation as explicit Host decisions", () => {
    render(<App initialProject={projectWithFirstDirection("action=set asset=bg_host effectPolicy=reversible awaitMode=awaited compensationKind=background.restore descriptorId=preview.awaited.bg", "app-awaited-host")} />);
    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    const host = screen.getByRole("region", { name: "Runtime Effect Host" });
    expect(within(host).getByText("等待宿主完成")).toBeVisible();
    expect(within(host).getByText("preview.awaited.bg")).toBeVisible();
    expect(screen.getByTestId("preview-stage")).toHaveAttribute("data-host-commit-pending", "true");
    fireEvent.click(within(host).getByRole("button", { name: "完成 Effect" }));
    expect(screen.getByText(/试玩中/)).toBeVisible();
    expect(screen.getByTestId("preview-stage")).toHaveAttribute("data-host-commit-pending", "false");
    expect(within(screen.getByRole("region", { name: "Runtime Effect Host" })).getByText(/last complete/)).toBeVisible();
  });

  it("shows the exact Barrier reason and never approves it automatically", () => {
    render(<App initialProject={projectWithFirstDirection("action=clear effectPolicy=barrier awaitMode=detached barrierReason=将永久提交画廊解锁 descriptorId=preview.gallery.commit", "app-barrier-host")} />);
    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    const host = screen.getByRole("region", { name: "Runtime Effect Host" });
    expect(within(host).getByText("不可逆边界")).toBeVisible();
    expect(within(host).getByText("将永久提交画廊解锁")).toBeVisible();
    expect(screen.getByTestId("preview-stage")).toHaveAttribute("data-host-commit-pending", "true");
    fireEvent.click(within(host).getByRole("button", { name: "理解并批准" }));
    expect(screen.getByTestId("preview-stage")).toHaveAttribute("data-host-commit-pending", "false");
  });

  it("applies safe presentation hot updates and requires an explicit restart for semantic changes", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    const controls = screen.getByRole("group", { name: "Runtime 调试控制" });
    for (let index = 0; index < 3; index += 1) fireEvent.click(within(controls).getByRole("button", { name: "Continue" }));
    expect(within(controls).getByText("History 4/4")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const editor = screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement;
    const presentationSource = editor.value
      .replace("广播站的灯还亮着。你也听见那段没有署名的留言了吗？", "热更新后的广播留言。")
      .replace('choice "先去哪里调查？"', 'choice "更新后先去哪里？"');
    fireEvent.change(editor, { target: { value: presentationSource } });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });

    const hotUpdate = await screen.findByRole("region", { name: "Runtime 热更新" });
    expect(within(hotUpdate).getByText("安全热更新已应用")).toBeVisible();
    expect(within(controls).getByText("History 4/4")).toBeVisible();
    expect(within(screen.getByTestId("preview-step")).getByText("更新后先去哪里？")).toBeVisible();

    const semanticSource = editor.value.replace("@background action=clear", "@background action=clear descriptorId=changed.background");
    fireEvent.change(editor, { target: { value: semanticSource } });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Runtime 热更新" })).getByText("需要明确重启试玩")).toBeVisible());
    expect(screen.getByText("语句语义已变化：stmt_gate_bg")).toBeVisible();
    expect(within(controls).getByText("History 4/4")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "以当前启动目标重启" }));
    expect(within(controls).getByText("History 1/1")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Runtime 热更新" })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("playable preview integration", () => {
  it("lets a creator play from the entry scene through a choice to an ending", () => {
    render(<App />);

    expect(screen.getByText("Project Compiler → Runtime · 从入口执行到结局")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
    const inspector = screen.getByRole("region", { name: "Runtime 状态检查器" });
    expect(within(inspector).getByText("Preview Session")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Runtime 变量" })).getByText(/暂无 Runtime 变量/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Runtime 调用栈" })).getByText(/栈为空/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Runtime 结构化诊断" })).getByText(/当前 Session 无诊断/)).toBeVisible();
    const continueStory = () => fireEvent.click(screen.getByRole("button", { name: "继续剧情" }));

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
  });

  it("builds and exposes a downloadable independent playable file", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:playable-web");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const view = render(<App />);

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
});

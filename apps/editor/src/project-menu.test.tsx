import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectMenu } from "./project-menu";

describe("Project menu", () => {
  it("blocks leaving and exporting while a draft needs attention", () => {
    const home = vi.fn(); const structure = vi.fn(); const exportProject = vi.fn();
    render(<ProjectMenu title="Story" disabled blockedReason="请先修复草稿" onHome={home} onStructure={structure} onExport={exportProject} />);
    fireEvent.click(screen.getByLabelText("项目菜单"));
    for (const name of [/所有项目/, /章节与角色/, /导出工程 ZIP/]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(screen.getByText("请先修复草稿")).toBeVisible();
    expect(home).not.toHaveBeenCalled(); expect(structure).not.toHaveBeenCalled(); expect(exportProject).not.toHaveBeenCalled();
  });
  it("waits for a successful operation and prevents duplicate actions", async () => {
    let complete!: () => void;
    const home = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
    render(<ProjectMenu title="Story" disabled={false} onHome={home} onStructure={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("项目菜单"));
    fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
    expect(screen.getByRole("button", { name: /章节与角色/ })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("正在保存项目");
    fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
    expect(home).toHaveBeenCalledOnce();
    await act(async () => complete());
    expect(screen.getByLabelText("项目菜单").closest("details")).not.toHaveAttribute("open");
  });
  it("keeps the menu open and allows retry when saving fails", async () => {
    const home = vi.fn().mockRejectedValueOnce(new Error("保存失败：磁盘已满")).mockResolvedValueOnce(undefined);
    render(<ProjectMenu title="Story" disabled={false} onHome={home} onStructure={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("项目菜单"));
    fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败：磁盘已满");
    expect(screen.getByLabelText("项目菜单").closest("details")).toHaveAttribute("open");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /所有项目/ })));
    expect(home).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("项目菜单").closest("details")).not.toHaveAttribute("open");
  });
});

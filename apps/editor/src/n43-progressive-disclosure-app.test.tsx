import { fireEvent, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("N43-E2 Beginner/Pro reversible disclosure", () => {
  it("hides complexity without changing the selected story fact and restores Pro tools", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    render(<App autosaveDebounceMs={60_000} />);
    await screen.findByRole("button", { name: "保存到本机" });

    const projectSearch = screen.getByRole("searchbox", { name: "全局搜索" });
    fireEvent.change(projectSearch, { target: { value: "风中的天台" } });
    fireEvent.click(await screen.findByRole("option", { name: /打开场景 · 风中的天台/ }));
    fireEvent.click(screen.getByRole("button", { name: /选择对白：留言里提到的那颗星/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Director" }));

    const shell = screen.getByTestId("workspace-shell");
    expect(shell).toHaveAttribute("data-context-statement-id", "stmt_rooftop_001");
    expect(shell).toHaveAttribute("data-experience-level", "pro");
    expect(screen.getByRole("tab", { name: "Script" })).toBeVisible();
    expect(screen.getByRole("region", { name: "图形化演出轨道" })).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
    expect(shell).toHaveAttribute("data-experience-level", "beginner");
    expect(shell).toHaveAttribute("data-context-statement-id", "stmt_rooftop_001");
    expect(screen.queryByRole("tab", { name: "Script" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Flow 模式" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "图形化演出轨道" })).toBeInTheDocument();

    const dialogue = screen.getByLabelText("对白内容");
    fireEvent.change(dialogue, { target: { value: "留言里的星星仍在风里发亮。" } });
    fireEvent.blur(dialogue);
    expect(await screen.findByText("本地事务 · r1")).toBeVisible();
    expect(shell).toHaveAttribute("data-context-statement-id", "stmt_rooftop_001");

    fireEvent.click(screen.getByRole("radio", { name: "Pro" }));
    expect(shell).toHaveAttribute("data-experience-level", "pro");
    expect(screen.getByRole("tab", { name: "Script" })).toBeVisible();
    expect(screen.getByRole("region", { name: "图形化演出轨道" })).toBeInTheDocument();
    expect(screen.getByLabelText("对白内容")).toHaveValue("留言里的星星仍在风里发亮。");
    expect(shell).toHaveAttribute("data-context-statement-id", "stmt_rooftop_001");

    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
    expect(shell).toHaveAttribute("data-editor-view", "script");
    expect(screen.getByRole("tab", { name: "Script" })).toHaveAttribute("aria-selected", "true");
    expect(shell).toHaveAttribute("data-context-statement-id", "stmt_rooftop_001");
  }, 30_000);
});

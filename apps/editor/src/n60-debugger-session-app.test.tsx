import { fireEvent, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("N60-E1 Debugger session real creator path", () => {
  it("starts from the selected stable statement and exposes formal controls and state inspectors", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    render(<App autosaveDebounceMs={60_000} />);

    fireEvent.click(await screen.findByRole("radio", { name: "Debug & QA" }));
    fireEvent.click(screen.getByRole("button", { name: "从当前语句启动" }));

    expect(screen.getByRole("heading", { name: "调试会话" })).toBeVisible();
    expect(screen.getByTestId("debugger-current-source")).toHaveTextContent("stmt_gate_bg");
    expect(screen.getByRole("button", { name: "单步前进" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "单步越过" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "后退一步" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前进一步" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续运行" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "变量" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "调用栈" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "可见对象" })).toBeVisible();

    const breakpoint = screen.getByRole("button", { name: "设置当前语句断点" });
    fireEvent.click(breakpoint);
    expect(breakpoint).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "从入口启动调试" }));
    fireEvent.click(screen.getByRole("button", { name: "继续运行" }));
    expect(screen.getByTestId("debugger-current-source")).toHaveTextContent("stmt_gate_bg");
    expect(screen.getByTestId("debugger-session")).toHaveAttribute("data-status", "paused");
  });
});

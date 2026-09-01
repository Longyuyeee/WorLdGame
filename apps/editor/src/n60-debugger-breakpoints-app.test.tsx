import { fireEvent, render, screen, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("N60-E2 breakpoint collection and stop reasons", () => {
  it("manages two stable breakpoints and explains a real Choice boundary", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    render(<App autosaveDebounceMs={60_000} />);

    fireEvent.click(await screen.findByRole("radio", { name: "Debug & QA" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选择语句断点" }));
    fireEvent.click(screen.getByRole("button", { name: "从入口启动调试" }));
    fireEvent.click(screen.getByRole("button", { name: "单步前进" }));
    expect(screen.getByTestId("debugger-current-source")).toHaveTextContent("stmt_gate_001");
    fireEvent.click(screen.getByRole("button", { name: "添加运行位置断点" }));

    const list = screen.getByRole("list", { name: "断点列表" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("stmt_gate_bg")).toBeVisible();
    expect(within(list).getByText("stmt_gate_001")).toBeVisible();

    fireEvent.click(within(list).getByRole("button", { name: "停用断点 scn_school_gate / stmt_gate_bg" }));
    fireEvent.click(screen.getByRole("button", { name: "从入口启动调试" }));
    fireEvent.click(screen.getByRole("button", { name: "继续运行" }));
    expect(screen.getByTestId("debugger-current-source")).toHaveTextContent("stmt_gate_001");
    expect(screen.getByTestId("debugger-session")).toHaveAttribute("data-status", "paused");
    expect(screen.getByTestId("debugger-stop-reason")).toHaveTextContent("命中断点");

    fireEvent.click(within(list).getByRole("button", { name: "移除断点 scn_school_gate / stmt_gate_001" }));
    fireEvent.click(screen.getByRole("button", { name: "从入口启动调试" }));
    fireEvent.click(screen.getByRole("button", { name: "继续运行" }));
    expect(screen.getByTestId("debugger-session")).toHaveAttribute("data-status", "waiting-choice");
    expect(screen.getByTestId("debugger-stop-reason")).toHaveTextContent("等待选择");
    expect(screen.getByTestId("debugger-stop-reason")).toHaveTextContent("先去哪里调查");
  });
});

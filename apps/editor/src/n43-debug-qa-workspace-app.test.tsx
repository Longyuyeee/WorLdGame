import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";

afterEach(() => vi.unstubAllGlobals());

const UI_BUDGET_MS = 5_000;

describe("N43-E6 Debug & QA real task", () => {
  it("runs the formal check, returns to the same source ID, saves and restores Debug & QA", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const first = render(<App autosaveDebounceMs={60_000} />);

    fireEvent.click(await screen.findByRole("radio", { name: "Debug & QA" }));
    expect(screen.getByRole("heading", { name: "诊断与运行检查台" })).toBeVisible();
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "stmt_gate_bg");
    fireEvent.click(screen.getByRole("button", { name: "运行正式 QA 检查" }));
    await waitFor(() => expect(screen.getByText("当前正式检查无诊断")).toBeVisible(), { timeout: UI_BUDGET_MS });
    expect(screen.getByText("稳定 ID 已映射")).toBeVisible();
    expect(screen.getByText("当前目标已通过 Compiler → Runtime → Source Map 检查")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "在 Sequence 检查当前语句" }));
    expect(screen.getByRole("radio", { name: "Writer" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "stmt_gate_bg");
    fireEvent.click(screen.getByRole("radio", { name: "Debug & QA" }));
    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    expect(await screen.findByRole("button", { name: "已保存 · s1" }, { timeout: UI_BUDGET_MS })).toBeVisible();
    first.unmount();

    const contender = new IndexedDbProjectFileStore(indexedDb, "prj_twilight_broadcast");
    await waitFor(async () => {
      const acquisition = await contender.acquire("n43_e6_reopen_probe", Date.now(), 10_000);
      expect(acquisition.status).toBe("acquired");
      if (acquisition.status === "acquired") await contender.release(acquisition.lease);
    }, { timeout: UI_BUDGET_MS });

    render(<App autosaveDebounceMs={60_000} />);
    expect(await screen.findByRole("button", { name: "已恢复 · s1" }, { timeout: UI_BUDGET_MS })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Debug & QA" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { name: "诊断与运行检查台" })).toBeVisible();
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-restore-status", "restored");
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "stmt_gate_bg");
  }, 30_000);
});

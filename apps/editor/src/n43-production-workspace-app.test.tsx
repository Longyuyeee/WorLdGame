import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";

afterEach(() => vi.unstubAllGlobals());

const UI_BUDGET_MS = 5_000;

describe("N43-E5 Production resource task", () => {
  it("imports a real file through Production, saves, closes and reopens the same Index and context", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const first = render(<App autosaveDebounceMs={60_000} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Production" }));
    await waitFor(() => expect(screen.getByText("导入第一项生产资源")).toBeVisible());
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "stmt_gate_bg");

    fireEvent.click(screen.getByRole("button", { name: "打开资源生产流水线" }));
    const png = new Uint8Array(10_000);
    png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 7, 128, 0, 0, 4, 56, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
    fireEvent.change(screen.getByLabelText("选择资源文件"), {
      target: { files: [new File([png], "Production CG.png", { type: "image/png" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));
    await waitFor(() => expect(screen.getByText(/production_cg 已原子写入 Index r1/)).toBeVisible(), { timeout: UI_BUDGET_MS });
    fireEvent.click(screen.getByRole("button", { name: "关闭资源保险库" }));

    const table = screen.getByRole("table");
    expect(within(table).getByText("production_cg")).toBeVisible();
    expect(within(table).getByText("✓ 已通过")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    expect(await screen.findByRole("button", { name: "已保存 · s1" }, { timeout: UI_BUDGET_MS })).toBeVisible();
    first.unmount();

    const contender = new IndexedDbProjectFileStore(indexedDb, "prj_twilight_broadcast");
    await waitFor(async () => {
      const acquisition = await contender.acquire("n43_e5_reopen_probe", Date.now(), 10_000);
      expect(acquisition.status).toBe("acquired");
      if (acquisition.status === "acquired") await contender.release(acquisition.lease);
    }, { timeout: UI_BUDGET_MS });

    render(<App autosaveDebounceMs={60_000} />);
    expect(await screen.findByRole("button", { name: "已恢复 · s1" }, { timeout: UI_BUDGET_MS })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Production" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { name: "资源生产工作区" })).toBeVisible();
    expect(screen.getByText("1/1 项可见")).toBeVisible();
    expect(screen.getByText("Index r1")).toBeVisible();
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-restore-status", "restored");
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "stmt_gate_bg");
    expect(within(screen.getByRole("table")).getByText("production_cg")).toBeVisible();
  }, 30_000);
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";

afterEach(() => vi.unstubAllGlobals());

const UI_BUDGET_MS = 5_000;

describe("N43-E7 Mobile Focus real task", () => {
  it("protects a buffered dialogue, commits it to Canonical, navigates and restores the same workspace", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const first = render(<App autosaveDebounceMs={60_000} />);

    fireEvent.click(await screen.findByRole("radio", { name: "Mobile Focus" }));
    expect(screen.getByRole("heading", { name: "移动专注编辑" })).toBeVisible();
    expect(screen.getByText("当前步骤不是对白")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "开始第一条对白" }));

    const editor = screen.getByLabelText("移动专注对白");
    expect(editor).toHaveValue("广播站的灯还亮着。你也听见那段没有署名的留言了吗？");
    fireEvent.compositionStart(editor);
    fireEvent.change(editor, { target: { value: "移动端中文输入仍在组合" } });
    expect(screen.getByText("中文输入组合中")).toBeVisible();
    expect(screen.getByRole("button", { name: "提交到工程" })).toBeDisabled();
    fireEvent.compositionEnd(editor, { data: "合" });
    expect(screen.getByText("输入已缓冲，尚未提交")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Writer" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "提交到工程" }));
    await waitFor(() => expect(screen.getByText("内容已提交")).toBeVisible(), { timeout: UI_BUDGET_MS });
    expect(screen.getByText("本地事务 · r1")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Writer" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "下一句" }));
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "stmt_gate_002");
    fireEvent.click(screen.getByRole("button", { name: "上一句" }));
    expect(screen.getByLabelText("移动专注对白")).toHaveValue("移动端中文输入仍在组合");

    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    expect(await screen.findByRole("button", { name: "已保存 · s1" }, { timeout: UI_BUDGET_MS })).toBeVisible();
    first.unmount();

    const contender = new IndexedDbProjectFileStore(indexedDb, "prj_twilight_broadcast");
    await waitFor(async () => {
      const acquisition = await contender.acquire("n43_e7_reopen_probe", Date.now(), 10_000);
      expect(acquisition.status).toBe("acquired");
      if (acquisition.status === "acquired") await contender.release(acquisition.lease);
    }, { timeout: UI_BUDGET_MS });

    render(<App autosaveDebounceMs={60_000} />);
    expect(await screen.findByRole("button", { name: "已恢复 · s1" }, { timeout: UI_BUDGET_MS })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Mobile Focus" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("移动专注对白")).toHaveValue("移动端中文输入仍在组合");
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-restore-status", "restored");
  }, 30_000);
});

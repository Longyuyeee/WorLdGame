import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

function selectFirstDialogue(): void {
  fireEvent.click(screen.getByRole("button", { name: /选择对白：广播站的灯还亮着/ }));
}

async function expectStorageRevision(revision: number): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: `已自动保存 · s${revision}` })).toBeVisible();
  }, { timeout: 10_000 });
}

describe("S0.12 autosave integration", () => {
  it("debounces committed input and rotates the previous verified snapshot", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    render(<App autosaveDebounceMs={10} />);
    await screen.findByRole("button", { name: "保存到本机" });
    selectFirstDialogue();

    const editor = screen.getByLabelText("对白内容");
    fireEvent.change(editor, { target: { value: "第一次自动保存。" } });
    fireEvent.blur(editor);
    await expectStorageRevision(1);
    expect(screen.getByRole("button", { name: "备份 0/5" })).toBeVisible();

    fireEvent.change(editor, { target: { value: "第二次自动保存并轮换备份。" } });
    fireEvent.blur(editor);
    await expectStorageRevision(2);
    expect(screen.getByRole("button", { name: "备份 1/5" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "备份 1/5" }));
    expect(screen.getByRole("heading", { name: "备份与恢复" })).toBeVisible();
    expect(await screen.findByText("s1")).toBeVisible();
    expect(screen.getByText("剧情 + 资源索引 · 崩溃可续")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "一致恢复为新版本" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "已恢复 · s3" })).toBeVisible();
    }, { timeout: 5_000 });
    fireEvent.click(screen.getByRole("button", { name: /选择对白：第一次自动保存/ }));
    expect(screen.getByLabelText("对白内容")).toHaveValue("第一次自动保存。");
  }, 30_000);
});

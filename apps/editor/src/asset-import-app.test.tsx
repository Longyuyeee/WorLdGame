import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S0.17 atomic Web asset import integration", () => {
  it("imports real File bytes, persists stable metadata and reports exact deduplication", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    render(<App />);
    const vaultButton = await screen.findByRole("button", { name: "打开资源保险库" });
    await waitFor(() => expect(within(vaultButton).getByText(/0 项资源 · Index r0/)).toBeVisible());
    fireEvent.click(vaultButton);

    const picker = screen.getByLabelText("选择资源文件");
    const firstFile = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], "Broadcast CG.png", {
      type: "image/png"
    });
    fireEvent.change(picker, { target: { files: [firstFile] } });
    expect(screen.getByLabelText("资源 Asset ID")).toHaveValue("broadcast_cg");
    expect(screen.getByLabelText("资源显示名称")).toHaveValue("Broadcast CG");
    expect(screen.getByLabelText("资源类型")).toHaveValue("cg");
    fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));

    await waitFor(() => expect(screen.getByText(/新 Blob 与 broadcast_cg 已原子写入 Index r1/)).toBeVisible());
    expect(within(screen.getByLabelText("已导入资源")).getByText("Broadcast CG")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存到本机" })).toBeVisible();

    const duplicateFile = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], "Broadcast CG Copy.png", {
      type: "image/png"
    });
    fireEvent.change(picker, { target: { files: [duplicateFile] } });
    expect(screen.getByLabelText("资源 Asset ID")).toHaveValue("broadcast_cg_copy");
    fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));
    await waitFor(() => expect(screen.getByText(/已复用相同 SHA-256 Blob.*Index r2/)).toBeVisible());
    expect(within(screen.getByLabelText("已导入资源")).getAllByRole("article")).toHaveLength(2);
  }, 10_000);
});

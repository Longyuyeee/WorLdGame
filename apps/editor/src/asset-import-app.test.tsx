import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S0.19 inspected atomic Web asset lifecycle integration", () => {
  it("imports real File bytes, persists stable metadata and reports exact deduplication", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    render(<App />);
    const vaultButton = await screen.findByRole("button", { name: "打开资源保险库" });
    await waitFor(() => expect(within(vaultButton).getByText(/0 项资源 · Index r0/)).toBeVisible());
    fireEvent.click(vaultButton);

    expect(screen.getByRole("heading", { name: "资源血缘与安全回收" })).toBeVisible();
    expect(screen.getByText("Lifecycle r0")).toBeVisible();
    expect(screen.getByRole("button", { name: "安全扫描" })).toBeEnabled();

    const picker = screen.getByLabelText("选择资源文件");
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 7, 128, 0, 0, 4, 56, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
    const firstFile = new File([png], "Broadcast CG.png", {
      type: "image/png"
    });
    fireEvent.change(picker, { target: { files: [firstFile] } });
    expect(screen.getByLabelText("资源 Asset ID")).toHaveValue("broadcast_cg");
    expect(screen.getByLabelText("资源显示名称")).toHaveValue("Broadcast CG");
    expect(screen.getByLabelText("资源类型")).toHaveValue("cg");
    fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));

    await waitFor(() => expect(screen.getByText(/媒体检查通过；新 Blob 与 broadcast_cg 已原子写入 Index r1/)).toBeVisible());
    expect(screen.getByText("Lifecycle r1")).toBeVisible();
    expect(screen.getAllByText("1", { selector: ".asset-lifecycle__metrics strong" })).toHaveLength(2);
    expect(within(screen.getByLabelText("已导入资源")).getByText("Broadcast CG")).toBeVisible();
    expect(screen.getByText(/PASS · PNG · 1920×1080/)).toBeVisible();
    expect(screen.getByRole("button", { name: "保存到本机" })).toBeVisible();

    const duplicateFile = new File([png], "Broadcast CG Copy.png", {
      type: "image/png"
    });
    fireEvent.change(picker, { target: { files: [duplicateFile] } });
    expect(screen.getByLabelText("资源 Asset ID")).toHaveValue("broadcast_cg_copy");
    fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));
    await waitFor(() => expect(screen.getByText(/媒体检查通过并复用相同 SHA-256 Blob.*Index r2/)).toBeVisible());
    expect(within(screen.getByLabelText("已导入资源")).getAllByRole("article")).toHaveLength(2);
  }, 10_000);

  it("rejects MIME-confused bytes before creating a Blob or Index revision", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    render(<App />);
    const vaultButton = await screen.findByRole("button", { name: "打开资源保险库" });
    await waitFor(() => expect(within(vaultButton).getByText(/Index r0/)).toBeVisible());
    fireEvent.click(vaultButton);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 16, 0, 0, 0, 16, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
    fireEvent.change(screen.getByLabelText("选择资源文件"), {
      target: { files: [new File([png], "confused.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));
    await waitFor(() => expect(screen.getByText("文件声明与真实内容不一致")).toBeVisible());
    expect(screen.getByText(/0 资源/)).toBeVisible();
    expect(screen.getAllByText(/Index r0/)).not.toHaveLength(0);
    expect(within(screen.getByLabelText("已导入资源")).queryAllByRole("article")).toHaveLength(0);
  }, 10_000);
});

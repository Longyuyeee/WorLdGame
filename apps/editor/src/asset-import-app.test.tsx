import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S0.22 asset derivative and Dicing candidate integration", () => {
  it("imports real File bytes, persists stable metadata and reports exact deduplication", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    render(<App />);
    const vaultButton = await screen.findByRole("button", { name: "打开资源保险库" });
    await waitFor(() => expect(within(vaultButton).getByText(/0 项资源 · Index r0/)).toBeVisible());
    fireEvent.click(vaultButton);

    expect(screen.getByRole("heading", { name: "资源血缘与安全回收" })).toBeVisible();
    expect(screen.getByText("Lifecycle r1")).toBeVisible();
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
    expect(screen.getByText("Lifecycle r2")).toBeVisible();
    expect(screen.getAllByText("1", { selector: ".asset-lifecycle__metrics strong" })).toHaveLength(2);
    expect(within(screen.getByLabelText("已导入资源")).getByText("Broadcast CG")).toBeVisible();
    expect(screen.getByText(/PASS · PNG · 1920×1080/)).toBeVisible();
    expect(screen.getByRole("button", { name: "生成缩略图" })).toBeEnabled();
    const dicingButton = screen.getByRole("button", { name: "分析候选 · 1" });
    expect(dicingButton).toBeEnabled();
    class DicingWorker {
      private readonly listeners = new Map<string, (event: MessageEvent) => void>();
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      postMessage(request: { readonly id: number }): void {
        this.listeners.get("message")?.({ data: {
          id: request.id,
          ok: true,
          report: {
            schemaVersion: 1,
            algorithm: "lossless-rgba-dicing/v1",
            cellSize: 64,
            imageCount: 1,
            placementCount: 510,
            uniqueTileCount: 200,
            repeatedPlacementCount: 310,
            zeroTileCount: 0,
            originalRgbaBytes: 33_177_600,
            uniqueTileBytes: 13_107_200,
            estimatedManifestBytes: 24_576,
            estimatedDicedBytes: 13_131_776,
            netSavingsBytes: 20_045_824,
            netSavingsRatio: 0.6042,
            decision: "adopt",
            reason: "net-savings",
            reconstructionVerified: true,
            sourceDigests: [`sha256:${"b".repeat(64)}`],
            planDigest: `sha256:${"c".repeat(64)}`
          }
        } } as MessageEvent);
      }
      terminate(): void { /* completed */ }
    }
    vi.stubGlobal("Worker", DicingWorker);
    fireEvent.click(dicingButton);
    await waitFor(() => expect(screen.getByText("建议进入 Atlas 候选")).toBeVisible());
    expect(screen.getByText(/逐字节重建 PASS/)).toBeVisible();
    expect(screen.getByText(/RGBA 代理成本预计节省 60.4%/)).toBeVisible();
    vi.stubGlobal("Worker", undefined);
    expect(screen.getByRole("button", { name: "保存到本机" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "生成 Sidecar" }));
    await waitFor(() => expect(screen.getByText(/Sidecar 已原子发布/)).toBeVisible());
    expect(screen.getByText("Lifecycle r4")).toBeVisible();
    expect(screen.getAllByText("1", { selector: ".asset-lifecycle__metrics strong" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "生成 Sidecar" }));
    await waitFor(() => expect(screen.getByText(/Sidecar 已按相同 recipe 精确复用/)).toBeVisible());
    expect(screen.getByText("Lifecycle r4")).toBeVisible();

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

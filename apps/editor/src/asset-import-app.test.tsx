import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLosslessDicingAtlas,
  createBlobDigest,
  createLosslessDicingPngDeliveryManifest,
  serializeLosslessDicingPngDeliveryManifest
} from "@world-studio/project-persistence";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S0.29 Story Graph resource prediction integration", () => {
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
    const png = new Uint8Array(10_000);
    png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 7, 128, 0, 0, 4, 56, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
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
    expect(screen.getByRole("button", { name: "分析候选 · 1" })).toBeDisabled();
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
    const dicingButton = screen.getByRole("button", { name: "分析候选 · 2" });
    expect(dicingButton).toBeEnabled();
    const atlasRgba = new Uint8Array(8 * 8 * 4).fill(255);
    const atlasArtifact = buildLosslessDicingAtlas([
      { assetId: "broadcast_cg", width: 8, height: 8, rgba: atlasRgba },
      { assetId: "broadcast_cg_copy", width: 8, height: 8, rgba: atlasRgba.slice() }
    ], { cellSize: 64, padding: 2, maxAtlasSize: 2048 });
    const encodedAtlasPages = atlasArtifact.pages.map((page) => {
      const encoded = new Uint8Array(33).fill(9);
      encoded.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
      const view = new DataView(encoded.buffer);
      view.setUint32(16, page.width);
      view.setUint32(20, page.height);
      encoded.set([8, 6, 0, 0, 0], 24);
      return { ...page, encoded };
    });
    const deliveryManifest = createLosslessDicingPngDeliveryManifest(atlasArtifact.manifest, encodedAtlasPages.map((page) => ({
      pageId: page.pageId, width: page.width, height: page.height, rgbaDigest: page.rgbaDigest,
      encodedDigest: createBlobDigest(page.encoded), encodedByteLength: page.encoded.byteLength, mimeType: "image/png" as const
    })));
    class DicingWorker {
      private readonly listeners = new Map<string, (event: MessageEvent) => void>();
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      postMessage(request: { readonly id: number; readonly operation?: string; readonly assetId?: string }): void {
        if (request.operation === "build-atlas") {
          this.listeners.get("message")?.({ data: { id: request.id, ok: true, artifact: {
            deliveryManifestJson: serializeLosslessDicingPngDeliveryManifest(deliveryManifest),
            pages: encodedAtlasPages.map((page) => ({ ...page, rgba: page.rgba.buffer.slice(0), encoded: page.encoded.buffer.slice(0) }))
          } } } as MessageEvent);
          return;
        }
        if (request.assetId !== undefined) {
          this.listeners.get("message")?.({ data: { id: request.id, ok: true, strategy: "atlas", width: 8, height: 8,
            rgba: atlasRgba.buffer.slice(0), manifestDigest: atlasArtifact.manifest.manifestDigest } } as MessageEvent);
          return;
        }
        this.listeners.get("message")?.({ data: {
          id: request.id,
          ok: true,
          report: {
            schemaVersion: 1,
            algorithm: "lossless-rgba-dicing-discovery/v1",
            evaluatedImageCount: 2,
            minSharedTileRatio: 0.35,
            candidateGroups: [{
              groupId: "dicing-broadcast",
              assetIds: ["broadcast_cg", "broadcast_cg_copy"],
              minimumPairSimilarity: 1,
              report: {
                schemaVersion: 1,
                algorithm: "lossless-rgba-dicing/v1",
                cellSize: 64,
                imageCount: 2,
                duplicateDecodedImageCount: 1,
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
                sourceDigests: [`sha256:${"b".repeat(64)}`, `sha256:${"b".repeat(64)}`],
                planDigest: atlasArtifact.manifest.sourcePlanDigest
              }
            }],
            unassignedAssetIds: [],
            discoveryDigest: `sha256:${"d".repeat(64)}`
          }
        } } as MessageEvent);
      }
      terminate(): void { /* completed */ }
    }
    vi.stubGlobal("Worker", DicingWorker);
    fireEvent.click(dicingButton);
    await waitFor(() => expect(screen.getByText("发现 1 个严格相似组")).toBeVisible());
    expect(screen.getByText(/逐字节重建 PASS/)).toBeVisible();
    expect(screen.getByText(/1 重复源/)).toBeVisible();
    expect(screen.getByText(/RGBA 代理节省 60.4%/)).toBeVisible();
    const publishButton = screen.getByRole("button", { name: "编码并复决策发布" });
    expect(publishButton).toBeEnabled();
    fireEvent.click(publishButton);
    await waitFor(() => expect(screen.getByText(/已原子发布 Manifest 与 1 个无损 PNG Atlas Page/)).toBeVisible(), { timeout: 5_000 });
    expect(screen.getByText(/Original 保持受保护/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "验证 Runtime Loader" }));
    await waitFor(() => expect(screen.getByText(/Runtime Loader PASS/)).toBeVisible(), { timeout: 5_000 });
    expect(screen.getByText(/当前 Original 身份匹配/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "验证内存调度" }));
    await waitFor(() => expect(screen.getByText(/MEMORY SCHEDULER PASS/)).toBeVisible(), { timeout: 5_000 });
    expect(screen.getByText(/压力清理后驻留 0 B、任务 0/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "验证剧情预测" }));
    await waitFor(() => expect(screen.getByText(/STORY PREDICTION PASS/)).toBeVisible(), { timeout: 5_000 });
    expect(screen.getByText(/分支公共预取 1.*回滚引用 1.*画廊临时引用 1/)).toBeVisible();
    expect(screen.getByText(/低内存后保留当前 1、回滚 0，最终驻留 0 B、任务 0/)).toBeVisible();
    vi.stubGlobal("Worker", undefined);
  }, 20_000);

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

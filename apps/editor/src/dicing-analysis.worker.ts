import {
  AssetBlobError,
  buildLosslessDicingAtlas,
  discoverLosslessDicingGroups,
  serializeLosslessDicingAtlasManifest,
  type LosslessDicingSource
} from "@world-studio/project-persistence";

interface DicingAnalysisRequest {
  readonly id: number;
  readonly operation?: "analyze" | "build-atlas";
  readonly cellSize: number;
  readonly assetIds?: readonly string[];
  readonly sources: readonly {
    readonly assetId: string;
    readonly mimeType: string;
    readonly bytes: ArrayBuffer;
  }[];
}

const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<DicingAnalysisRequest>) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const MAX_ENCODED_BYTES = 512 * 1024 * 1024;

workerScope.addEventListener("message", (event) => {
  void (async () => {
    const request = event.data;
    const decoded: LosslessDicingSource[] = [];
    let encodedBytes = 0;
    try {
      if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
        throw new AssetBlobError("DERIVATIVE_UNAVAILABLE", "index", "dicing-analysis", "Worker image decode or OffscreenCanvas is unavailable");
      }
      for (const source of request.sources) {
        encodedBytes += source.bytes.byteLength;
        if (encodedBytes > MAX_ENCODED_BYTES) throw new AssetBlobError("RESOURCE_LIMIT", "index", "dicing-analysis", "Encoded Dicing group exceeds the worker budget");
        const bitmap = await createImageBitmap(new Blob([source.bytes], { type: source.mimeType }));
        try {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
          if (context === null) throw new AssetBlobError("DERIVATIVE_UNAVAILABLE", "index", source.assetId, "Worker 2D readback context is unavailable");
          context.clearRect(0, 0, bitmap.width, bitmap.height);
          context.drawImage(bitmap, 0, 0);
          const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
          decoded.push({ assetId: source.assetId, width: bitmap.width, height: bitmap.height, rgba: new Uint8Array(imageData.data) });
        } finally {
          bitmap.close();
        }
      }
      if (request.operation === "build-atlas") {
        const selectedIds = new Set(request.assetIds ?? []);
        const selected = decoded.filter((source) => selectedIds.has(source.assetId));
        if (selected.length < 1 || selected.length !== selectedIds.size) {
          throw new AssetBlobError("INVALID_ASSET", "index", "dicing-atlas", "Atlas selection does not match decoded sources");
        }
        const artifact = buildLosslessDicingAtlas(selected, { cellSize: request.cellSize, padding: 2, maxAtlasSize: 2048 });
        const pages = artifact.pages.map((page) => ({ ...page, rgba: page.rgba.buffer }));
        workerScope.postMessage({ id: request.id, ok: true, artifact: {
          manifestJson: serializeLosslessDicingAtlasManifest(artifact.manifest), pages
        } }, pages.map((page) => page.rgba));
      } else {
        const report = discoverLosslessDicingGroups(decoded, { cellSize: request.cellSize });
        workerScope.postMessage({ id: request.id, ok: true, report });
      }
    } catch (error) {
      const detail = error instanceof AssetBlobError
        ? { code: error.code, message: error.message }
        : { code: "DERIVATIVE_UNAVAILABLE", message: error instanceof Error ? error.message : "Dicing analysis failed" };
      workerScope.postMessage({ id: request.id, ok: false, error: detail });
    }
  })();
});

import {
  AssetBlobError,
  buildLosslessDicingAtlas,
  createBlobDigest,
  createLosslessDicingPngDeliveryManifest,
  discoverLosslessDicingGroups,
  evaluateLosslessDicingEncodedDecision,
  serializeLosslessDicingPngDeliveryManifest,
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
        let encodedOutputBytes = 0;
        const pages = [] as Array<{
          pageId: string; width: number; height: number; rgbaDigest: string; rgba: ArrayBuffer; encoded: ArrayBuffer;
        }>;
        const descriptors = [] as Array<{
          pageId: string; width: number; height: number; rgbaDigest: ReturnType<typeof createBlobDigest>;
          encodedDigest: ReturnType<typeof createBlobDigest>; encodedByteLength: number; mimeType: "image/png";
        }>;
        for (const page of artifact.pages) {
          const canvas = new OffscreenCanvas(page.width, page.height);
          const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
          if (context === null) throw new AssetBlobError("DERIVATIVE_UNAVAILABLE", "put", page.pageId, "Atlas PNG encoder is unavailable");
          const image = context.createImageData(page.width, page.height);
          image.data.set(page.rgba);
          context.putImageData(image, 0, 0);
          const blob = await canvas.convertToBlob({ type: "image/png" });
          const encoded = await blob.arrayBuffer();
          encodedOutputBytes += encoded.byteLength;
          if (encoded.byteLength === 0 || encodedOutputBytes > MAX_ENCODED_BYTES) {
            throw new AssetBlobError("RESOURCE_LIMIT", "put", page.pageId, "Encoded Atlas output exceeds the worker budget");
          }
          const verificationBitmap = await createImageBitmap(new Blob([encoded], { type: "image/png" }), {
            colorSpaceConversion: "none",
            premultiplyAlpha: "none"
          });
          try {
            if (verificationBitmap.width !== page.width || verificationBitmap.height !== page.height) {
              throw new AssetBlobError("INVALID_ASSET", "put", page.pageId, "Encoded Atlas dimensions changed during PNG round-trip");
            }
            const verificationCanvas = new OffscreenCanvas(page.width, page.height);
            const verificationContext = verificationCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
            if (verificationContext === null) throw new AssetBlobError("DERIVATIVE_UNAVAILABLE", "put", page.pageId, "Atlas PNG verifier is unavailable");
            verificationContext.drawImage(verificationBitmap, 0, 0);
            const verified = verificationContext.getImageData(0, 0, page.width, page.height).data;
            if (verified.length !== page.rgba.length || verified.some((byte, index) => byte !== page.rgba[index])) {
              throw new AssetBlobError("INVALID_ASSET", "put", page.pageId, "PNG round-trip is not byte-identical");
            }
          } finally {
            verificationBitmap.close();
          }
          const encodedDigest = createBlobDigest(new Uint8Array(encoded));
          descriptors.push({ pageId: page.pageId, width: page.width, height: page.height, rgbaDigest: page.rgbaDigest,
            encodedDigest, encodedByteLength: encoded.byteLength, mimeType: "image/png" });
          pages.push({ pageId: page.pageId, width: page.width, height: page.height, rgbaDigest: page.rgbaDigest,
            rgba: page.rgba.slice().buffer as ArrayBuffer, encoded });
        }
        const deliveryManifest = createLosslessDicingPngDeliveryManifest(artifact.manifest, descriptors);
        const uniqueSourceSizes = new Map<string, number>();
        for (const source of request.sources.filter((candidate) => selectedIds.has(candidate.assetId))) {
          const digest = createBlobDigest(new Uint8Array(source.bytes));
          uniqueSourceSizes.set(digest, source.bytes.byteLength);
        }
        const sourceEncodedBytes = [...uniqueSourceSizes.values()].reduce((total, byteLength) => total + byteLength, 0);
        const decision = evaluateLosslessDicingEncodedDecision(deliveryManifest, sourceEncodedBytes);
        workerScope.postMessage({ id: request.id, ok: true, artifact: {
          deliveryManifestJson: serializeLosslessDicingPngDeliveryManifest(deliveryManifest), pages, decision
        } }, pages.flatMap((page) => [page.rgba, page.encoded]));
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

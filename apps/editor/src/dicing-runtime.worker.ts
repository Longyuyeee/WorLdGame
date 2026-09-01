import {
  AssetBlobError,
  createBlobDigest,
  parseLosslessDicingPngDeliveryManifest,
  resolveLosslessDicingRuntimeImage,
  type LosslessDicingAtlasPage,
  type LosslessDicingSource
} from "@world-studio/project-persistence";

interface RuntimeRequest {
  readonly id: number;
  readonly assetId: string;
  readonly originalMimeType: string;
  readonly originalBytes: ArrayBuffer;
  readonly deliveryManifestJson?: string;
  readonly encodedPages?: readonly { readonly pageId: string; readonly bytes: ArrayBuffer }[];
  readonly maxDecodedPixels: number;
  readonly maxAtlasPixels: number;
  readonly maxEncodedBytes: number;
}

const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<RuntimeRequest>) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

async function decodeImage(bytes: ArrayBuffer, mimeType: string, subject: string, maxPixels: number): Promise<LosslessDicingSource> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none"
  });
  try {
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > maxPixels) {
      throw new AssetBlobError("RESOURCE_LIMIT", "read", subject, "Decoded image exceeds the runtime pixel budget");
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (context === null) throw new AssetBlobError("DERIVATIVE_UNAVAILABLE", "read", subject, "Runtime image decoder is unavailable");
    context.drawImage(bitmap, 0, 0);
    const rgba = new Uint8Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data);
    return { assetId: subject, width: bitmap.width, height: bitmap.height, rgba };
  } finally {
    bitmap.close();
  }
}

workerScope.addEventListener("message", (event) => {
  void (async () => {
    const request = event.data;
    try {
      if (request.originalBytes.byteLength < 1 || request.originalBytes.byteLength > request.maxEncodedBytes) {
        throw new AssetBlobError("RESOURCE_LIMIT", "read", request.assetId, "Original exceeds the runtime encoded byte budget");
      }
      const original = await decodeImage(request.originalBytes, request.originalMimeType, request.assetId, request.maxDecodedPixels);
      let reason: "atlas-unavailable" | "source-mismatch" | "budget-exceeded" = "atlas-unavailable";
      try {
        if (typeof request.deliveryManifestJson !== "string" || !Array.isArray(request.encodedPages)) throw new Error("Atlas delivery is unavailable");
        const manifest = parseLosslessDicingPngDeliveryManifest(request.deliveryManifestJson);
        const encodedTotal = request.encodedPages.reduce((total, page) => total + page.bytes.byteLength, 0);
        const atlasPixels = manifest.pages.reduce((total, page) => total + page.width * page.height, 0);
        if (encodedTotal > request.maxEncodedBytes || atlasPixels > request.maxAtlasPixels) {
          reason = "budget-exceeded";
          throw new Error("Atlas runtime budget exceeded");
        }
        const encodedById = new Map(request.encodedPages.map((page) => [page.pageId, page.bytes]));
        const pages: LosslessDicingAtlasPage[] = [];
        for (const descriptor of manifest.pages) {
          const encoded = encodedById.get(descriptor.pageId);
          if (encoded === undefined || encoded.byteLength !== descriptor.encodedByteLength ||
              createBlobDigest(new Uint8Array(encoded)) !== descriptor.encodedDigest) throw new Error("Atlas Page is missing or corrupt");
          const decoded = await decodeImage(encoded, descriptor.mimeType, descriptor.pageId, request.maxAtlasPixels);
          pages.push({ pageId: descriptor.pageId, width: decoded.width, height: decoded.height,
            rgbaDigest: descriptor.rgbaDigest, rgba: decoded.rgba });
        }
        const resolution = resolveLosslessDicingRuntimeImage({
          manifest: manifest.layoutManifest,
          pages,
          reconstructionVerified: true
        }, original);
        if (resolution.strategy === "atlas") {
          const rgba = resolution.rgba.buffer as ArrayBuffer;
          workerScope.postMessage({ id: request.id, ok: true, strategy: "atlas", width: original.width, height: original.height,
            rgba, manifestDigest: resolution.manifestDigest }, [rgba]);
          return;
        }
        reason = resolution.reason;
      } catch {
        // A derivative failure is expected to fail closed to the already verified current Original.
      }
      const rgba = original.rgba.buffer as ArrayBuffer;
      workerScope.postMessage({ id: request.id, ok: true, strategy: "original", width: original.width, height: original.height, rgba, reason }, [rgba]);
    } catch (error) {
      const detail = error as { readonly code?: string; readonly message?: string };
      workerScope.postMessage({ id: request.id, ok: false, error: {
        code: detail.code === "RESOURCE_LIMIT" ? "RESOURCE_LIMIT" : "DERIVATIVE_UNAVAILABLE",
        message: detail.message ?? "Current Original could not be decoded"
      } });
    }
  })();
});

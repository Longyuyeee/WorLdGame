interface ThumbnailRequest {
  readonly id: number;
  readonly bytes: ArrayBuffer;
  readonly mimeType: string;
  readonly maxEdge: number;
}

const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<ThumbnailRequest>) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 100_000_000;

workerScope.addEventListener("message", (event) => {
  void (async () => {
    const request = event.data;
    let bitmap: ImageBitmap | undefined;
    try {
      if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
        throw { code: "DERIVATIVE_UNAVAILABLE", message: "Worker image decode or OffscreenCanvas is unavailable" };
      }
      if (request.bytes.byteLength === 0 || request.bytes.byteLength > MAX_SOURCE_BYTES) {
        throw { code: "RESOURCE_LIMIT", message: "Thumbnail source exceeds the isolated worker budget" };
      }
      bitmap = await createImageBitmap(new Blob([request.bytes], { type: request.mimeType }));
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
        throw { code: "RESOURCE_LIMIT", message: "Decoded image dimensions exceed the isolated worker budget" };
      }
      const scale = Math.min(1, request.maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { alpha: true });
      if (context === null) throw { code: "DERIVATIVE_UNAVAILABLE", message: "Worker 2D canvas context is unavailable" };
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const output = await canvas.convertToBlob({ type: "image/png" });
      if (output.size === 0 || output.size > MAX_OUTPUT_BYTES) throw { code: "RESOURCE_LIMIT", message: "Encoded thumbnail exceeds the output budget" };
      const bytes = await output.arrayBuffer();
      workerScope.postMessage({ id: request.id, ok: true, bytes, width, height }, [bytes]);
    } catch (error) {
      const detail = error as { readonly code?: string; readonly message?: string };
      workerScope.postMessage({
        id: request.id,
        ok: false,
        error: {
          code: detail.code === "RESOURCE_LIMIT" ? "RESOURCE_LIMIT" : "DERIVATIVE_UNAVAILABLE",
          message: detail.message ?? "Image decode or thumbnail encoding failed inside the isolated Worker"
        }
      });
    } finally {
      bitmap?.close();
    }
  })();
});

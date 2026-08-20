import {
  AssetBlobError,
  createBlobDigest,
  type BlobDigest
} from "@world-studio/project-persistence";

export interface GeneratedThumbnail {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/png";
  readonly recipeName: string;
  readonly recipeDigest: BlobDigest;
}

const SUPPORTED_SOURCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let thumbnailSerial = 0;

function failure(code: "CANCELLED" | "DERIVATIVE_UNAVAILABLE" | "UNSUPPORTED_MEDIA_TYPE" | "RESOURCE_LIMIT", subject: string, detail: string): AssetBlobError {
  return new AssetBlobError(code, "index", subject, detail);
}

export function generateThumbnailInWorker(
  bytes: Uint8Array,
  mimeType: string,
  maxEdge = 320,
  signal?: AbortSignal,
  timeoutMs = 12_000
): Promise<GeneratedThumbnail> {
  if (signal?.aborted === true) return Promise.reject(failure("CANCELLED", mimeType, "Thumbnail generation was cancelled"));
  if (!SUPPORTED_SOURCE_TYPES.has(mimeType)) return Promise.reject(failure("UNSUPPORTED_MEDIA_TYPE", mimeType, "Thumbnail worker supports PNG, JPEG and WebP sources only"));
  if (!Number.isSafeInteger(maxEdge) || maxEdge < 64 || maxEdge > 2048) return Promise.reject(failure("RESOURCE_LIMIT", mimeType, "Thumbnail edge must be between 64 and 2048 pixels"));
  if (typeof Worker === "undefined") return Promise.reject(failure("DERIVATIVE_UNAVAILABLE", mimeType, "Isolated thumbnail Worker is unavailable; main-thread fallback is forbidden"));
  const id = ++thumbnailSerial;
  const recipeName = `thumbnail/web-canvas-png-v1/${maxEdge}`;
  const recipeDigest = createBlobDigest(new TextEncoder().encode(JSON.stringify({
    schemaVersion: 1,
    operation: "contain",
    maxEdge,
    outputMimeType: "image/png",
    executionBoundary: "dedicated-worker",
    encoder: "runtime-web-canvas"
  })));
  let worker: Worker;
  try {
    worker = new Worker(new URL("./thumbnail.worker.ts", import.meta.url), { type: "module", name: "world-studio-thumbnail" });
  } catch (error) {
    return Promise.reject(failure("DERIVATIVE_UNAVAILABLE", mimeType, `Thumbnail Worker could not start (${error instanceof Error ? error.message : "unknown"})`));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      action();
    };
    const abort = () => finish(() => reject(failure("CANCELLED", mimeType, "Thumbnail generation was cancelled")));
    const timeout = setTimeout(() => finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", mimeType, "Thumbnail Worker exceeded its execution deadline"))), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    worker.addEventListener("error", (event) => finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", mimeType, `Thumbnail Worker failed (${event.message || "unknown"})`))), { once: true });
    worker.addEventListener("message", (event: MessageEvent) => {
      const response = event.data as {
        readonly id?: number;
        readonly ok?: boolean;
        readonly bytes?: ArrayBuffer;
        readonly width?: number;
        readonly height?: number;
        readonly error?: { readonly code?: string; readonly message?: string };
      };
      if (response.id !== id) return;
      if (response.ok === true && response.bytes instanceof ArrayBuffer && Number.isSafeInteger(response.width) && Number.isSafeInteger(response.height)) {
        finish(() => resolve({
          bytes: new Uint8Array(response.bytes as ArrayBuffer),
          width: response.width as number,
          height: response.height as number,
          mimeType: "image/png",
          recipeName,
          recipeDigest
        }));
        return;
      }
      const code = response.error?.code;
      finish(() => reject(failure(
        code === "RESOURCE_LIMIT" || code === "UNSUPPORTED_MEDIA_TYPE" ? code : "DERIVATIVE_UNAVAILABLE",
        mimeType,
        response.error?.message ?? "Thumbnail Worker returned an invalid response"
      )));
    });
    const transferable = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
    try { worker.postMessage({ id, bytes: transferable, mimeType, maxEdge }, [transferable]); }
    catch (error) { finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", mimeType, `Thumbnail request transfer failed (${error instanceof Error ? error.message : "unknown"})`))); }
  });
}

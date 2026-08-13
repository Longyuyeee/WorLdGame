import {
  AssetBlobError,
  createLosslessDicingRgbaDigest,
  parseLosslessDicingPngDeliveryManifest,
  type BlobDigest
} from "@world-studio/project-persistence";

export interface DicingRuntimeEncodedPage {
  readonly pageId: string;
  readonly bytes: Uint8Array;
}

export interface DicingRuntimeRequest {
  readonly assetId: string;
  readonly originalMimeType: string;
  readonly originalBytes: Uint8Array;
  readonly deliveryManifestJson?: string;
  readonly encodedPages?: readonly DicingRuntimeEncodedPage[];
  readonly maxDecodedPixels?: number;
  readonly maxAtlasPixels?: number;
  readonly maxEncodedBytes?: number;
}

export type DicingRuntimeResolution =
  | { readonly strategy: "atlas"; readonly width: number; readonly height: number; readonly rgba: Uint8Array; readonly manifestDigest: BlobDigest }
  | { readonly strategy: "original"; readonly width: number; readonly height: number; readonly rgba: Uint8Array;
      readonly reason: "atlas-unavailable" | "source-mismatch" | "budget-exceeded" };

let runtimeSerial = 0;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function failure(code: "DERIVATIVE_UNAVAILABLE" | "RESOURCE_LIMIT", detail: string): AssetBlobError {
  return new AssetBlobError(code, "read", "dicing-runtime", detail);
}

export function resolveDicingRuntimeImageInWorker(request: DicingRuntimeRequest, timeoutMs = 20_000): Promise<DicingRuntimeResolution> {
  const maxDecodedPixels = request.maxDecodedPixels ?? 16_777_216;
  const maxAtlasPixels = request.maxAtlasPixels ?? 33_554_432;
  const maxEncodedBytes = request.maxEncodedBytes ?? 256 * 1024 * 1024;
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(request.assetId) || request.originalBytes.byteLength < 1 ||
      !Number.isSafeInteger(maxDecodedPixels) || maxDecodedPixels < 1 || !Number.isSafeInteger(maxAtlasPixels) || maxAtlasPixels < 1 ||
      !Number.isSafeInteger(maxEncodedBytes) || maxEncodedBytes < 1) {
    return Promise.reject(failure("RESOURCE_LIMIT", "Runtime request or budgets are invalid"));
  }
  let manifestImage: { readonly width: number; readonly height: number; readonly sourceDigest: BlobDigest } | undefined;
  if (request.deliveryManifestJson !== undefined) {
    try {
      const manifest = parseLosslessDicingPngDeliveryManifest(request.deliveryManifestJson);
      manifestImage = manifest.layoutManifest.images.find((image) => image.assetId === request.assetId);
    } catch { /* Worker will return the current Original. */ }
  }
  if (typeof Worker === "undefined") return Promise.reject(failure("DERIVATIVE_UNAVAILABLE", "Isolated runtime Worker is unavailable"));
  const id = ++runtimeSerial;
  let worker: Worker;
  try { worker = new Worker(new URL("./dicing-runtime.worker.ts", import.meta.url), { type: "module", name: "world-studio-dicing-runtime" }); }
  catch (error) { return Promise.reject(failure("DERIVATIVE_UNAVAILABLE", error instanceof Error ? error.message : "Runtime Worker could not start")); }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => { if (settled) return; settled = true; clearTimeout(timeout); worker.terminate(); action(); };
    const timeout = setTimeout(() => finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", "Runtime Worker exceeded its deadline"))), timeoutMs);
    worker.addEventListener("error", (event) => finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", event.message || "Runtime Worker failed"))), { once: true });
    worker.addEventListener("message", (event: MessageEvent) => {
      const response = event.data as { readonly id?: number; readonly ok?: boolean; readonly strategy?: unknown; readonly width?: unknown;
        readonly height?: unknown; readonly rgba?: unknown; readonly manifestDigest?: unknown; readonly reason?: unknown;
        readonly error?: { readonly code?: string; readonly message?: string } };
      if (response.id !== id) return;
      if (response.ok !== true) {
        finish(() => reject(failure(response.error?.code === "RESOURCE_LIMIT" ? "RESOURCE_LIMIT" : "DERIVATIVE_UNAVAILABLE",
          response.error?.message ?? "Current Original could not be resolved")));
        return;
      }
      if (!Number.isSafeInteger(response.width) || !Number.isSafeInteger(response.height) || !(response.rgba instanceof ArrayBuffer)) {
        finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", "Runtime Worker returned malformed pixels")));
        return;
      }
      const width = response.width as number;
      const height = response.height as number;
      const rgba = new Uint8Array(response.rgba);
      if (width < 1 || height < 1 || width * height > maxDecodedPixels || rgba.byteLength !== width * height * 4) {
        finish(() => reject(failure("RESOURCE_LIMIT", "Runtime Worker output exceeds the decoded budget")));
        return;
      }
      if (response.strategy === "atlas" && typeof response.manifestDigest === "string" && DIGEST.test(response.manifestDigest) &&
          manifestImage !== undefined && manifestImage.width === width && manifestImage.height === height &&
          createLosslessDicingRgbaDigest(width, height, rgba) === manifestImage.sourceDigest) {
        finish(() => resolve({ strategy: "atlas", width, height, rgba, manifestDigest: response.manifestDigest as BlobDigest }));
        return;
      }
      if (response.strategy === "original" && (response.reason === "atlas-unavailable" || response.reason === "source-mismatch" || response.reason === "budget-exceeded")) {
        const reason = response.reason;
        finish(() => resolve({ strategy: "original", width, height, rgba, reason }));
        return;
      }
      finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", "Runtime Worker returned an invalid resolution")));
    });
    const originalBytes = request.originalBytes.slice().buffer as ArrayBuffer;
    const transfers: ArrayBuffer[] = [originalBytes];
    const encodedPages = request.encodedPages?.map((page) => {
      const bytes = page.bytes.slice().buffer as ArrayBuffer;
      transfers.push(bytes);
      return { pageId: page.pageId, bytes };
    });
    try { worker.postMessage({ id, assetId: request.assetId, originalMimeType: request.originalMimeType, originalBytes,
      deliveryManifestJson: request.deliveryManifestJson, encodedPages, maxDecodedPixels, maxAtlasPixels, maxEncodedBytes }, transfers); }
    catch (error) { finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", error instanceof Error ? error.message : "Runtime request transfer failed"))); }
  });
}

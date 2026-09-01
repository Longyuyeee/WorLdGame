import { AssetBlobError, type AssetKind } from "@world-studio/project-persistence";

export interface AssetFileReadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number;
  readonly ratio: number;
}

export interface ReadAssetFileOptions {
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: AssetFileReadProgress) => void;
}

export const WEB_ASSET_IMPORT_MAX_BYTES = 64 * 1024 * 1024;

export function inferAssetKind(mimeType: string): AssetKind {
  if (mimeType.startsWith("image/")) return "cg";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("font/") || ["application/font-woff", "application/font-sfnt"].includes(mimeType)) return "font";
  return "other";
}

export function canonicalAssetId(fileName: string, serial: number): string {
  const base = fileName.replace(/\.[^.]+$/, "").normalize("NFKD").toLowerCase();
  const slug = base.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 72);
  const fallback = `asset_import_${serial}`;
  const candidate = slug.length === 0 ? fallback : /^[a-z]/.test(slug) ? slug : `asset_${slug}`;
  return candidate.slice(0, 96);
}

function readFailure(fileName: string, code: "CANCELLED" | "PERMISSION_DENIED" | "IO_FAILURE", detail: string): AssetBlobError {
  return new AssetBlobError(code, "put", fileName, detail);
}

/** FileReader is used so browser/mobile shells receive real byte progress and cancellation. */
export function readAssetFile(file: File, options: ReadAssetFileOptions): Promise<Uint8Array> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0 || file.size > options.maxBytes) {
    return Promise.reject(new AssetBlobError(
      "RESOURCE_LIMIT",
      "put",
      file.name,
      `File uses ${file.size} bytes, exceeding the ${options.maxBytes} byte Web import limit`
    ));
  }
  if (options.signal?.aborted === true) {
    return Promise.reject(readFailure(file.name, "CANCELLED", "File read was cancelled before it started"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const cleanup = () => options.signal?.removeEventListener("abort", abort);
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const abort = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
      else finish(() => reject(readFailure(file.name, "CANCELLED", "File read was cancelled")));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    reader.addEventListener("progress", (event) => {
      const totalBytes = event.lengthComputable ? event.total : file.size;
      options.onProgress?.({
        loadedBytes: event.loaded,
        totalBytes,
        ratio: totalBytes === 0 ? 1 : Math.min(1, event.loaded / totalBytes)
      });
    });
    reader.addEventListener("abort", () => finish(() => reject(
      readFailure(file.name, "CANCELLED", "File read was cancelled")
    )), { once: true });
    reader.addEventListener("error", () => {
      const name = reader.error?.name ?? "unknown";
      const code = name === "NotAllowedError" || name === "SecurityError"
        ? "PERMISSION_DENIED"
        : "IO_FAILURE";
      finish(() => reject(readFailure(file.name, code, `File read failed (${name})`)));
    }, { once: true });
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        finish(() => reject(readFailure(file.name, "IO_FAILURE", "FileReader returned a non-binary result")));
        return;
      }
      const bytes = new Uint8Array(result);
      if (bytes.byteLength !== file.size) {
        finish(() => reject(readFailure(file.name, "IO_FAILURE", "File size changed while it was being read")));
        return;
      }
      options.onProgress?.({ loadedBytes: bytes.byteLength, totalBytes: file.size, ratio: 1 });
      finish(() => resolve(bytes));
    }, { once: true });
    reader.readAsArrayBuffer(file);
  });
}

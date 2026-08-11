import {
  AssetBlobError,
  inspectUntrustedMedia,
  type AssetKind,
  type JsonObject,
  type MediaInspectionReport
} from "@world-studio/project-persistence";

export interface InspectedAssetBytes {
  readonly bytes: Uint8Array;
  readonly report: MediaInspectionReport;
}

let inspectionSerial = 0;

function cancelled(subject: string): AssetBlobError {
  return new AssetBlobError("CANCELLED", "index", subject, "Media inspection was cancelled");
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

function inspectWithoutWorker(bytes: Uint8Array, mimeType: string, kind: AssetKind, signal?: AbortSignal): Promise<InspectedAssetBytes> {
  return Promise.resolve().then(() => {
    if (isAborted(signal)) throw cancelled(mimeType);
    const report = inspectUntrustedMedia(bytes, mimeType, kind);
    if (isAborted(signal)) throw cancelled(mimeType);
    return { bytes, report };
  });
}

export function inspectAssetBytes(
  bytes: Uint8Array,
  mimeType: string,
  kind: AssetKind,
  signal?: AbortSignal
): Promise<InspectedAssetBytes> {
  if (signal?.aborted === true) return Promise.reject(cancelled(mimeType));
  if (typeof Worker === "undefined") return inspectWithoutWorker(bytes, mimeType, kind, signal);
  const id = ++inspectionSerial;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./media-inspection.worker.ts", import.meta.url), {
      type: "module",
      name: "world-studio-media-inspection"
    });
  } catch (error) {
    return Promise.reject(new AssetBlobError(
      "INSPECTION_UNAVAILABLE",
      "index",
      mimeType,
      `Media inspection worker could not start (${error instanceof Error ? error.message : "unknown"})`
    ));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      action();
    };
    const abort = () => finish(() => reject(cancelled(mimeType)));
    signal?.addEventListener("abort", abort, { once: true });
    worker.addEventListener("error", (event) => finish(() => reject(
      new AssetBlobError("INSPECTION_UNAVAILABLE", "index", mimeType, `Media inspection worker failed (${event.message || "unknown"})`)
    )), { once: true });
    worker.addEventListener("message", (event: MessageEvent) => {
      const response = event.data as {
        readonly id?: number;
        readonly ok?: boolean;
        readonly report?: MediaInspectionReport;
        readonly bytes?: ArrayBuffer;
        readonly error?: { readonly code?: string; readonly operation?: string; readonly subject?: string; readonly message?: string };
      };
      if (response.id !== id) return;
      if (response.ok === true && response.report !== undefined && response.bytes instanceof ArrayBuffer) {
        finish(() => resolve({ bytes: new Uint8Array(response.bytes as ArrayBuffer), report: response.report as MediaInspectionReport }));
        return;
      }
      const detail = response.error;
      finish(() => reject(new AssetBlobError(
        detail?.code === "UNSAFE_MEDIA" || detail?.code === "UNSUPPORTED_MEDIA_TYPE" || detail?.code === "MIME_MISMATCH" ||
          detail?.code === "RESOURCE_LIMIT" || detail?.code === "CANCELLED" || detail?.code === "INSPECTION_UNAVAILABLE" ? detail.code : "INSPECTION_UNAVAILABLE",
        "index",
        detail?.subject ?? mimeType,
        detail?.message ?? "Media inspection worker returned an invalid response"
      )));
    });
    const transferable = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.slice().buffer;
    try {
      worker.postMessage({ id, bytes: transferable, declaredMimeType: mimeType, kind }, [transferable]);
    } catch (error) {
      finish(() => reject(new AssetBlobError(
        "INSPECTION_UNAVAILABLE",
        "index",
        mimeType,
        `Media inspection request could not be transferred (${error instanceof Error ? error.message : "unknown"})`
      )));
    }
  });
}

export function mediaInspectionToJson(report: MediaInspectionReport): JsonObject {
  return {
    schemaVersion: report.schemaVersion,
    status: report.status,
    detectedMimeType: report.detectedMimeType,
    mediaClass: report.mediaClass,
    format: report.format,
    byteLength: report.byteLength,
    isolation: report.isolation,
    ...(report.width === undefined ? {} : { width: report.width }),
    ...(report.height === undefined ? {} : { height: report.height }),
    ...(report.pixelCount === undefined ? {} : { pixelCount: report.pixelCount }),
    ...(report.durationSeconds === undefined ? {} : { durationSeconds: report.durationSeconds }),
    ...(report.sampleRate === undefined ? {} : { sampleRate: report.sampleRate }),
    ...(report.channels === undefined ? {} : { channels: report.channels }),
    ...(report.fontTableCount === undefined ? {} : { fontTableCount: report.fontTableCount }),
    ...(report.svgElementCount === undefined ? {} : { svgElementCount: report.svgElementCount })
  };
}

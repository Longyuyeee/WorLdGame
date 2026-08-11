import {
  AssetBlobError,
  type LosslessDicingDiscoveryReport,
  type LosslessDicingReport
} from "@world-studio/project-persistence";

export interface DicingAnalysisInput {
  readonly assetId: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

const SUPPORTED_SOURCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let analysisSerial = 0;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function failure(code: "CANCELLED" | "DERIVATIVE_UNAVAILABLE" | "UNSUPPORTED_MEDIA_TYPE" | "RESOURCE_LIMIT", detail: string): AssetBlobError {
  return new AssetBlobError(code, "index", "dicing-analysis", detail);
}

function isVerifiedGroupReport(value: unknown): value is LosslessDicingReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  const nonNegativeIntegerFields = ["duplicateDecodedImageCount", "placementCount", "uniqueTileCount", "repeatedPlacementCount", "zeroTileCount",
    "originalRgbaBytes", "uniqueTileBytes", "estimatedManifestBytes", "estimatedDicedBytes"];
  return report.schemaVersion === 1 && report.algorithm === "lossless-rgba-dicing/v1" && report.reconstructionVerified === true &&
    (report.decision === "adopt" || report.decision === "original") &&
    (report.reason === "net-savings" || report.reason === "no-repeat" || report.reason === "insufficient-net-savings") &&
    Number.isSafeInteger(report.cellSize) && (report.cellSize as number) > 0 &&
    Number.isSafeInteger(report.imageCount) && (report.imageCount as number) > 0 &&
    nonNegativeIntegerFields.every((field) => Number.isSafeInteger(report[field]) && (report[field] as number) >= 0) &&
    Number.isSafeInteger(report.netSavingsBytes) &&
    typeof report.netSavingsRatio === "number" && Number.isFinite(report.netSavingsRatio) &&
    typeof report.planDigest === "string" && DIGEST.test(report.planDigest) &&
    Array.isArray(report.sourceDigests) && report.sourceDigests.length === report.imageCount &&
    report.sourceDigests.every((digest) => typeof digest === "string" && DIGEST.test(digest));
}

function isVerifiedDiscoveryReport(value: unknown): value is LosslessDicingDiscoveryReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  if (!(report.schemaVersion === 1 && report.algorithm === "lossless-rgba-dicing-discovery/v1" &&
    Number.isSafeInteger(report.evaluatedImageCount) && (report.evaluatedImageCount as number) > 0 &&
    typeof report.minSharedTileRatio === "number" && report.minSharedTileRatio > 0 && report.minSharedTileRatio <= 1 &&
    typeof report.discoveryDigest === "string" && DIGEST.test(report.discoveryDigest) &&
    Array.isArray(report.unassignedAssetIds) && report.unassignedAssetIds.every((assetId) => typeof assetId === "string") &&
    Array.isArray(report.candidateGroups))) return false;
  const minSharedTileRatio = report.minSharedTileRatio as number;
  const allAssetIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const assetId of report.unassignedAssetIds as string[]) {
    if (allAssetIds.has(assetId)) return false;
    allAssetIds.add(assetId);
  }
  const groupsValid = report.candidateGroups.every((group) => {
      if (typeof group !== "object" || group === null || Array.isArray(group)) return false;
      const record = group as Record<string, unknown>;
      if (!(typeof record.groupId === "string" && !groupIds.has(record.groupId) && Array.isArray(record.assetIds) &&
        record.assetIds.length >= 2 && record.assetIds.every((assetId) => typeof assetId === "string") &&
        typeof record.minimumPairSimilarity === "number" && record.minimumPairSimilarity >= minSharedTileRatio &&
        record.minimumPairSimilarity <= 1 &&
        isVerifiedGroupReport(record.report) && record.report.imageCount === record.assetIds.length)) return false;
      groupIds.add(record.groupId);
      for (const assetId of record.assetIds as string[]) {
        if (allAssetIds.has(assetId)) return false;
        allAssetIds.add(assetId);
      }
      return true;
    });
  return groupsValid && allAssetIds.size === report.evaluatedImageCount;
}

export function analyzeDicingInWorker(
  inputs: readonly DicingAnalysisInput[],
  cellSize = 64,
  signal?: AbortSignal,
  timeoutMs = 20_000
): Promise<LosslessDicingDiscoveryReport> {
  if (signal?.aborted === true) return Promise.reject(failure("CANCELLED", "Dicing analysis was cancelled"));
  if (inputs.length < 1 || inputs.length > 32) return Promise.reject(failure("RESOURCE_LIMIT", "Dicing analysis requires 1-32 inspected images"));
  const requestedAssetIds = new Set(inputs.map((input) => input.assetId));
  if (requestedAssetIds.size !== inputs.length) return Promise.reject(failure("RESOURCE_LIMIT", "Dicing analysis asset IDs must be unique"));
  if (inputs.some((input) => !SUPPORTED_SOURCE_TYPES.has(input.mimeType))) {
    return Promise.reject(failure("UNSUPPORTED_MEDIA_TYPE", "Dicing analysis supports inspected PNG, JPEG and WebP sources only"));
  }
  if (!Number.isSafeInteger(cellSize) || cellSize < 8 || cellSize > 512) return Promise.reject(failure("RESOURCE_LIMIT", "Dicing cell size must be between 8 and 512 pixels"));
  if (typeof Worker === "undefined") return Promise.reject(failure("DERIVATIVE_UNAVAILABLE", "Isolated Dicing Worker is unavailable; main-thread decode fallback is forbidden"));
  const id = ++analysisSerial;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./dicing-analysis.worker.ts", import.meta.url), { type: "module", name: "world-studio-dicing-analysis" });
  } catch (error) {
    return Promise.reject(failure("DERIVATIVE_UNAVAILABLE", `Dicing Worker could not start (${error instanceof Error ? error.message : "unknown"})`));
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
    const abort = () => finish(() => reject(failure("CANCELLED", "Dicing analysis was cancelled")));
    const timeout = setTimeout(() => finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", "Dicing Worker exceeded its execution deadline"))), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    worker.addEventListener("error", (event) => finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", `Dicing Worker failed (${event.message || "unknown"})`))), { once: true });
    worker.addEventListener("message", (event: MessageEvent) => {
      const response = event.data as {
        readonly id?: number;
        readonly ok?: boolean;
        readonly report?: LosslessDicingDiscoveryReport;
        readonly error?: { readonly code?: string; readonly message?: string };
      };
      if (response.id !== id) return;
      if (response.ok === true && isVerifiedDiscoveryReport(response.report) && response.report.evaluatedImageCount === inputs.length) {
        const responseAssetIds = [
          ...response.report.unassignedAssetIds,
          ...response.report.candidateGroups.flatMap((group) => group.assetIds)
        ];
        if (responseAssetIds.every((assetId) => requestedAssetIds.has(assetId))) {
          finish(() => resolve(response.report as LosslessDicingDiscoveryReport));
          return;
        }
      }
      const code = response.error?.code;
      finish(() => reject(failure(
        code === "RESOURCE_LIMIT" || code === "UNSUPPORTED_MEDIA_TYPE" ? code : "DERIVATIVE_UNAVAILABLE",
        response.error?.message ?? "Dicing Worker returned an invalid response"
      )));
    });
    const transferables: ArrayBuffer[] = [];
    const sources = inputs.map((input) => {
      const bytes = input.bytes.byteOffset === 0 && input.bytes.byteLength === input.bytes.buffer.byteLength
        ? input.bytes.buffer as ArrayBuffer
        : input.bytes.slice().buffer as ArrayBuffer;
      transferables.push(bytes);
      return { assetId: input.assetId, mimeType: input.mimeType, bytes };
    });
    try { worker.postMessage({ id, sources, cellSize }, transferables); }
    catch (error) { finish(() => reject(failure("DERIVATIVE_UNAVAILABLE", `Dicing request transfer failed (${error instanceof Error ? error.message : "unknown"})`))); }
  });
}

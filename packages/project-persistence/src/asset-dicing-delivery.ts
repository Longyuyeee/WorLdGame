import { AssetBlobError, createBlobDigest, type BlobDigest } from "./asset-blob";
import {
  parseLosslessDicingAtlasManifest,
  serializeLosslessDicingAtlasManifest,
  type LosslessDicingAtlasManifest
} from "./asset-dicing-atlas";

export const LOSSLESS_DICING_PNG_DELIVERY_RECIPE_NAME = "dicing-atlas/web-png-delivery-v1";

export interface LosslessDicingEncodedPageDescriptor {
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly rgbaDigest: BlobDigest;
  readonly encodedDigest: BlobDigest;
  readonly encodedByteLength: number;
  readonly mimeType: "image/png";
}

export interface LosslessDicingPngDeliveryManifest {
  readonly schemaVersion: 1;
  readonly algorithm: "lossless-dicing-png-delivery/v1";
  readonly encoder: "web-offscreen-canvas-png/v1";
  readonly sourcePlanDigest: BlobDigest;
  readonly layoutManifest: LosslessDicingAtlasManifest;
  readonly pages: readonly LosslessDicingEncodedPageDescriptor[];
  readonly manifestDigest: BlobDigest;
}

export interface LosslessDicingEncodedDecision {
  readonly sourceEncodedBytes: number;
  readonly encodedPageBytes: number;
  readonly manifestBytes: number;
  readonly publicationBytes: number;
  readonly netSavingsBytes: number;
  readonly netSavingsRatio: number;
  readonly decision: "adopt" | "original";
  readonly reason: "encoded-net-savings" | "no-encoded-net-savings";
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;

function fail(subject: string, detail: string): never {
  throw new AssetBlobError("INVALID_ASSET", "index", subject, detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalPayload(manifest: Omit<LosslessDicingPngDeliveryManifest, "manifestDigest">): string {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    algorithm: manifest.algorithm,
    encoder: manifest.encoder,
    sourcePlanDigest: manifest.sourcePlanDigest,
    layoutManifest: JSON.parse(serializeLosslessDicingAtlasManifest(manifest.layoutManifest)) as unknown,
    pages: manifest.pages.map((page) => [page.pageId, page.width, page.height, page.rgbaDigest,
      page.encodedDigest, page.encodedByteLength, page.mimeType])
  });
}

function createManifestDigest(manifest: Omit<LosslessDicingPngDeliveryManifest, "manifestDigest">): BlobDigest {
  return createBlobDigest(new TextEncoder().encode(canonicalPayload(manifest)));
}

export function createLosslessDicingPngDeliveryManifest(
  layoutManifestValue: LosslessDicingAtlasManifest,
  encodedPages: readonly LosslessDicingEncodedPageDescriptor[]
): LosslessDicingPngDeliveryManifest {
  const layoutManifest = parseLosslessDicingAtlasManifest(JSON.stringify(layoutManifestValue));
  const provisional = {
    schemaVersion: 1,
    algorithm: "lossless-dicing-png-delivery/v1",
    encoder: "web-offscreen-canvas-png/v1",
    sourcePlanDigest: layoutManifest.sourcePlanDigest,
    layoutManifest,
    pages: encodedPages
  } as const;
  return parseLosslessDicingPngDeliveryManifest(JSON.stringify({ ...provisional, manifestDigest: createManifestDigest(provisional) }));
}

export function parseLosslessDicingPngDeliveryManifest(source: string): LosslessDicingPngDeliveryManifest {
  let value: unknown;
  try { value = JSON.parse(source); } catch { return fail("dicing-png-delivery", "Delivery Manifest is not valid JSON"); }
  if (!isRecord(value) || value.schemaVersion !== 1 || value.algorithm !== "lossless-dicing-png-delivery/v1" ||
      value.encoder !== "web-offscreen-canvas-png/v1" || typeof value.sourcePlanDigest !== "string" || !DIGEST.test(value.sourcePlanDigest) ||
      !isRecord(value.layoutManifest) || !Array.isArray(value.pages) || typeof value.manifestDigest !== "string" || !DIGEST.test(value.manifestDigest)) {
    return fail("dicing-png-delivery", "Delivery Manifest header is invalid");
  }
  const layoutManifest = parseLosslessDicingAtlasManifest(JSON.stringify(value.layoutManifest));
  if (layoutManifest.sourcePlanDigest !== value.sourcePlanDigest || value.pages.length !== layoutManifest.pages.length) {
    return fail("dicing-png-delivery", "Delivery Manifest does not match its layout");
  }
  const ids = new Set<string>();
  const pages = value.pages.map((page, index): LosslessDicingEncodedPageDescriptor => {
    if (!isRecord(page) || typeof page.pageId !== "string" || ids.has(page.pageId) || page.pageId !== `atlas-${index.toString().padStart(3, "0")}` ||
        !Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height) || typeof page.rgbaDigest !== "string" || !DIGEST.test(page.rgbaDigest) ||
        typeof page.encodedDigest !== "string" || !DIGEST.test(page.encodedDigest) || !Number.isSafeInteger(page.encodedByteLength) ||
        (page.encodedByteLength as number) < 1 || (page.encodedByteLength as number) > 512 * 1024 * 1024 || page.mimeType !== "image/png") {
      return fail("dicing-png-page", "Encoded Atlas page descriptor is invalid");
    }
    const layoutPage = layoutManifest.pages[index];
    if (layoutPage === undefined || layoutPage.pageId !== page.pageId || layoutPage.width !== page.width ||
        layoutPage.height !== page.height || layoutPage.rgbaDigest !== page.rgbaDigest) {
      return fail(page.pageId, "Encoded Atlas page does not match the layout");
    }
    ids.add(page.pageId);
    return page as unknown as LosslessDicingEncodedPageDescriptor;
  });
  const provisional = { schemaVersion: 1, algorithm: "lossless-dicing-png-delivery/v1", encoder: "web-offscreen-canvas-png/v1",
    sourcePlanDigest: value.sourcePlanDigest as BlobDigest, layoutManifest, pages } as const;
  if (createManifestDigest(provisional) !== value.manifestDigest) return fail("dicing-png-delivery", "Delivery Manifest digest is invalid");
  return { ...provisional, manifestDigest: value.manifestDigest as BlobDigest };
}

export function serializeLosslessDicingPngDeliveryManifest(manifest: LosslessDicingPngDeliveryManifest): string {
  const parsed = parseLosslessDicingPngDeliveryManifest(JSON.stringify(manifest));
  return JSON.stringify({
    schemaVersion: parsed.schemaVersion,
    algorithm: parsed.algorithm,
    encoder: parsed.encoder,
    sourcePlanDigest: parsed.sourcePlanDigest,
    layoutManifest: JSON.parse(serializeLosslessDicingAtlasManifest(parsed.layoutManifest)) as unknown,
    pages: parsed.pages,
    manifestDigest: parsed.manifestDigest
  });
}

export function evaluateLosslessDicingEncodedDecision(
  manifestValue: LosslessDicingPngDeliveryManifest,
  sourceEncodedBytes: number
): LosslessDicingEncodedDecision {
  const manifest = parseLosslessDicingPngDeliveryManifest(JSON.stringify(manifestValue));
  if (!Number.isSafeInteger(sourceEncodedBytes) || sourceEncodedBytes < 1 || sourceEncodedBytes > 1024 * 1024 * 1024) {
    return fail("dicing-png-delivery", "Source encoded byte total is invalid");
  }
  const encodedPageBytes = manifest.pages.reduce((total, page) => total + page.encodedByteLength, 0);
  const manifestBytes = new TextEncoder().encode(serializeLosslessDicingPngDeliveryManifest(manifest)).byteLength;
  const publicationBytes = encodedPageBytes + manifestBytes;
  const netSavingsBytes = sourceEncodedBytes - publicationBytes;
  return {
    sourceEncodedBytes,
    encodedPageBytes,
    manifestBytes,
    publicationBytes,
    netSavingsBytes,
    netSavingsRatio: netSavingsBytes / sourceEncodedBytes,
    decision: netSavingsBytes > 0 ? "adopt" : "original",
    reason: netSavingsBytes > 0 ? "encoded-net-savings" : "no-encoded-net-savings"
  };
}

export function createLosslessDicingPngDeliveryRecipeDigest(manifestValue: LosslessDicingPngDeliveryManifest): BlobDigest {
  const manifest = parseLosslessDicingPngDeliveryManifest(JSON.stringify(manifestValue));
  return createBlobDigest(new TextEncoder().encode(JSON.stringify({
    recipe: LOSSLESS_DICING_PNG_DELIVERY_RECIPE_NAME,
    algorithm: manifest.algorithm,
    encoder: manifest.encoder,
    layoutAlgorithm: manifest.layoutManifest.algorithm,
    cellSize: manifest.layoutManifest.cellSize,
    padding: manifest.layoutManifest.padding,
    maxAtlasSize: manifest.layoutManifest.maxAtlasSize
  })));
}

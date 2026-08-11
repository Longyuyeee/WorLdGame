import { AssetBlobError, createBlobDigest, type BlobDigest } from "./asset-blob";

export interface LosslessDicingSource {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface LosslessDicingOptions {
  readonly cellSize?: number;
  readonly minNetSavingsRatio?: number;
  readonly maxImages?: number;
  readonly maxTotalPixels?: number;
}

export interface LosslessDicingTile {
  readonly digest: BlobDigest;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface LosslessDicingPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly tileDigest: BlobDigest | null;
}

export interface LosslessDicingImagePlan {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly sourceDigest: BlobDigest;
  readonly placements: readonly LosslessDicingPlacement[];
}

export interface LosslessDicingPlan {
  readonly schemaVersion: 1;
  readonly algorithm: "lossless-rgba-dicing/v1";
  readonly cellSize: number;
  readonly tiles: readonly LosslessDicingTile[];
  readonly images: readonly LosslessDicingImagePlan[];
}

export interface LosslessDicingReport {
  readonly schemaVersion: 1;
  readonly algorithm: "lossless-rgba-dicing/v1";
  readonly cellSize: number;
  readonly imageCount: number;
  readonly placementCount: number;
  readonly uniqueTileCount: number;
  readonly repeatedPlacementCount: number;
  readonly zeroTileCount: number;
  readonly originalRgbaBytes: number;
  readonly uniqueTileBytes: number;
  readonly estimatedManifestBytes: number;
  readonly estimatedDicedBytes: number;
  readonly netSavingsBytes: number;
  readonly netSavingsRatio: number;
  readonly decision: "adopt" | "original";
  readonly reason: "net-savings" | "no-repeat" | "insufficient-net-savings";
  readonly reconstructionVerified: true;
  readonly sourceDigests: readonly BlobDigest[];
  readonly planDigest: BlobDigest;
}

const DEFAULT_MAX_IMAGES = 32;
const DEFAULT_MAX_TOTAL_PIXELS = 100_000_000;
const IMAGE_MANIFEST_BYTES = 96;
const PLACEMENT_MANIFEST_BYTES = 48;

function fail(subject: string, detail: string): never {
  throw new AssetBlobError("INVALID_ASSET", "index", subject, detail);
}

function canonicalDigest(width: number, height: number, rgba: Uint8Array): BlobDigest {
  const envelope = new Uint8Array(8 + rgba.byteLength);
  const view = new DataView(envelope.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  envelope.set(rgba, 8);
  return createBlobDigest(envelope);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function isZeroTile(bytes: Uint8Array): boolean {
  for (const value of bytes) if (value !== 0) return false;
  return true;
}

function extractTile(source: LosslessDicingSource, x: number, y: number, width: number, height: number): Uint8Array {
  const tile = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = ((y + row) * source.width + x) * 4;
    tile.set(source.rgba.subarray(sourceOffset, sourceOffset + width * 4), row * width * 4);
  }
  return tile;
}

function assertSources(sources: readonly LosslessDicingSource[], options: Required<LosslessDicingOptions>): void {
  if (sources.length < 1 || sources.length > options.maxImages) fail("dicing-group", `Dicing group must contain 1-${options.maxImages} images`);
  const ids = new Set<string>();
  let totalPixels = 0;
  for (const source of sources) {
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(source.assetId) || ids.has(source.assetId)) fail(source.assetId, "Dicing asset ID is invalid or duplicated");
    ids.add(source.assetId);
    if (!Number.isSafeInteger(source.width) || source.width < 1 || !Number.isSafeInteger(source.height) || source.height < 1) fail(source.assetId, "Dicing dimensions are invalid");
    const pixels = source.width * source.height;
    if (!Number.isSafeInteger(pixels) || source.rgba.byteLength !== pixels * 4) fail(source.assetId, "RGBA byte length does not match dimensions");
    totalPixels += pixels;
  }
  if (totalPixels > options.maxTotalPixels) throw new AssetBlobError("RESOURCE_LIMIT", "index", "dicing-group", "Decoded Dicing group exceeds the pixel budget");
}

function normalizedOptions(options: LosslessDicingOptions): Required<LosslessDicingOptions> {
  const result = {
    cellSize: options.cellSize ?? 64,
    minNetSavingsRatio: options.minNetSavingsRatio ?? 0.05,
    maxImages: options.maxImages ?? DEFAULT_MAX_IMAGES,
    maxTotalPixels: options.maxTotalPixels ?? DEFAULT_MAX_TOTAL_PIXELS
  };
  if (!Number.isSafeInteger(result.cellSize) || result.cellSize < 8 || result.cellSize > 512 ||
      typeof result.minNetSavingsRatio !== "number" || !Number.isFinite(result.minNetSavingsRatio) ||
      result.minNetSavingsRatio < 0 || result.minNetSavingsRatio > 0.95 ||
      !Number.isSafeInteger(result.maxImages) || result.maxImages < 1 || result.maxImages > 256 ||
      !Number.isSafeInteger(result.maxTotalPixels) || result.maxTotalPixels < 1) {
    fail("dicing-options", "Dicing analysis options are invalid");
  }
  return result;
}

export function buildLosslessDicingPlan(
  sources: readonly LosslessDicingSource[],
  options: LosslessDicingOptions = {}
): LosslessDicingPlan {
  const settings = normalizedOptions(options);
  assertSources(sources, settings);
  const orderedSources = [...sources].sort((left, right) => left.assetId.localeCompare(right.assetId));
  const tiles = new Map<BlobDigest, LosslessDicingTile>();
  const images = orderedSources.map((source): LosslessDicingImagePlan => {
    const placements: LosslessDicingPlacement[] = [];
    for (let y = 0; y < source.height; y += settings.cellSize) {
      for (let x = 0; x < source.width; x += settings.cellSize) {
        const width = Math.min(settings.cellSize, source.width - x);
        const height = Math.min(settings.cellSize, source.height - y);
        const rgba = extractTile(source, x, y, width, height);
        if (isZeroTile(rgba)) {
          placements.push({ x, y, width, height, tileDigest: null });
          continue;
        }
        const digest = canonicalDigest(width, height, rgba);
        const existing = tiles.get(digest);
        if (existing !== undefined && (existing.width !== width || existing.height !== height || !equalBytes(existing.rgba, rgba))) {
          fail(digest, "Tile digest collision detected");
        }
        if (existing === undefined) tiles.set(digest, { digest, width, height, rgba });
        placements.push({ x, y, width, height, tileDigest: digest });
      }
    }
    return {
      assetId: source.assetId,
      width: source.width,
      height: source.height,
      sourceDigest: canonicalDigest(source.width, source.height, source.rgba),
      placements
    };
  });
  return {
    schemaVersion: 1,
    algorithm: "lossless-rgba-dicing/v1",
    cellSize: settings.cellSize,
    tiles: [...tiles.values()].sort((left, right) => left.digest.localeCompare(right.digest)),
    images
  };
}

export function reconstructLosslessDicingImage(plan: LosslessDicingPlan, assetId: string): Uint8Array {
  const image = plan.images.find((candidate) => candidate.assetId === assetId);
  if (image === undefined) return fail(assetId, "Dicing image plan does not exist");
  const tiles = new Map(plan.tiles.map((tile) => [tile.digest, tile]));
  const output = new Uint8Array(image.width * image.height * 4);
  for (const placement of image.placements) {
    if (placement.tileDigest === null) continue;
    const tile = tiles.get(placement.tileDigest);
    if (tile === undefined || tile.width !== placement.width || tile.height !== placement.height) fail(assetId, "Dicing placement references an invalid tile");
    for (let row = 0; row < placement.height; row += 1) {
      const outputOffset = ((placement.y + row) * image.width + placement.x) * 4;
      output.set(tile.rgba.subarray(row * placement.width * 4, (row + 1) * placement.width * 4), outputOffset);
    }
  }
  return output;
}

export function analyzeLosslessDicing(
  sources: readonly LosslessDicingSource[],
  options: LosslessDicingOptions = {}
): LosslessDicingReport {
  const settings = normalizedOptions(options);
  const plan = buildLosslessDicingPlan(sources, settings);
  for (const source of sources) {
    const reconstructed = reconstructLosslessDicingImage(plan, source.assetId);
    if (!equalBytes(reconstructed, source.rgba)) fail(source.assetId, "Lossless Dicing reconstruction is not byte-identical");
  }
  const placementCount = plan.images.reduce((sum, image) => sum + image.placements.length, 0);
  const zeroTileCount = plan.images.reduce((sum, image) => sum + image.placements.filter((placement) => placement.tileDigest === null).length, 0);
  const nonZeroPlacements = placementCount - zeroTileCount;
  const repeatedPlacementCount = nonZeroPlacements - plan.tiles.length;
  const originalRgbaBytes = sources.reduce((sum, source) => sum + source.rgba.byteLength, 0);
  const uniqueTileBytes = plan.tiles.reduce((sum, tile) => sum + tile.rgba.byteLength, 0);
  const estimatedManifestBytes = plan.images.length * IMAGE_MANIFEST_BYTES + placementCount * PLACEMENT_MANIFEST_BYTES;
  const estimatedDicedBytes = uniqueTileBytes + estimatedManifestBytes;
  const netSavingsBytes = originalRgbaBytes - estimatedDicedBytes;
  const netSavingsRatio = netSavingsBytes / originalRgbaBytes;
  const decision = repeatedPlacementCount > 0 && netSavingsBytes > 0 && netSavingsRatio >= settings.minNetSavingsRatio ? "adopt" : "original";
  const reason = repeatedPlacementCount === 0 ? "no-repeat" : decision === "adopt" ? "net-savings" : "insufficient-net-savings";
  const planSummary = JSON.stringify({
    schemaVersion: plan.schemaVersion,
    algorithm: plan.algorithm,
    cellSize: plan.cellSize,
    tiles: plan.tiles.map((tile) => [tile.digest, tile.width, tile.height]),
    images: plan.images.map((image) => [image.assetId, image.width, image.height, image.sourceDigest,
      image.placements.map((placement) => [placement.x, placement.y, placement.width, placement.height, placement.tileDigest])])
  });
  return {
    schemaVersion: 1,
    algorithm: plan.algorithm,
    cellSize: plan.cellSize,
    imageCount: sources.length,
    placementCount,
    uniqueTileCount: plan.tiles.length,
    repeatedPlacementCount,
    zeroTileCount,
    originalRgbaBytes,
    uniqueTileBytes,
    estimatedManifestBytes,
    estimatedDicedBytes,
    netSavingsBytes,
    netSavingsRatio,
    decision,
    reason,
    reconstructionVerified: true,
    sourceDigests: plan.images.map((image) => image.sourceDigest),
    planDigest: createBlobDigest(new TextEncoder().encode(planSummary))
  };
}

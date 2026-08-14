import { AssetBlobError, createBlobDigest, type BlobDigest } from "./asset-blob";
import {
  buildLosslessDicingPlan,
  createLosslessDicingPlanDigest,
  type LosslessDicingImagePlan,
  type LosslessDicingOptions,
  type LosslessDicingPlacement,
  type LosslessDicingPlan,
  type LosslessDicingSource,
  type LosslessDicingTile
} from "./asset-dicing";

export interface LosslessDicingAtlasOptions extends LosslessDicingOptions {
  readonly padding?: number;
  readonly maxAtlasSize?: number;
  readonly maxAtlasPages?: number;
}

export interface LosslessDicingAtlasPageDescriptor {
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly rgbaDigest: BlobDigest;
}

export interface LosslessDicingAtlasTile {
  readonly tileDigest: BlobDigest;
  readonly pageId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LosslessDicingAtlasManifest {
  readonly schemaVersion: 1;
  readonly algorithm: "lossless-rgba-atlas/v1";
  readonly sourcePlanDigest: BlobDigest;
  readonly cellSize: number;
  readonly padding: number;
  readonly maxAtlasSize: number;
  readonly pages: readonly LosslessDicingAtlasPageDescriptor[];
  readonly tiles: readonly LosslessDicingAtlasTile[];
  readonly images: readonly LosslessDicingImagePlan[];
  readonly manifestDigest: BlobDigest;
}

export interface LosslessDicingAtlasPage extends LosslessDicingAtlasPageDescriptor {
  readonly rgba: Uint8Array;
}

export interface LosslessDicingAtlasArtifact {
  readonly manifest: LosslessDicingAtlasManifest;
  readonly pages: readonly LosslessDicingAtlasPage[];
  readonly reconstructionVerified: true;
}

export type LosslessDicingRuntimeResolution =
  | { readonly strategy: "atlas"; readonly rgba: Uint8Array; readonly manifestDigest: BlobDigest }
  | { readonly strategy: "original"; readonly rgba: Uint8Array; readonly reason: "atlas-unavailable" | "source-mismatch" };

interface NormalizedAtlasOptions {
  readonly padding: number;
  readonly maxAtlasSize: number;
  readonly maxAtlasPages: number;
}

interface MutablePage {
  readonly pageId: string;
  readonly shelves: Array<{ readonly y: number; readonly height: number; x: number }>;
  readonly placements: Array<{ readonly tile: LosslessDicingTile; readonly outerX: number; readonly outerY: number }>;
  usedWidth: number;
  usedHeight: number;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ASSET_ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
export const LOSSLESS_DICING_ATLAS_RECIPE_NAME = "dicing-atlas/raw-rgba-v1";

function fail(subject: string, detail: string): never {
  throw new AssetBlobError("INVALID_ASSET", "index", subject, detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createLosslessDicingRgbaDigest(width: number, height: number, rgba: Uint8Array): BlobDigest {
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

function normalizedAtlasOptions(options: LosslessDicingAtlasOptions): NormalizedAtlasOptions {
  const result = {
    padding: options.padding ?? 2,
    maxAtlasSize: options.maxAtlasSize ?? 2048,
    maxAtlasPages: options.maxAtlasPages ?? 16
  };
  if (!Number.isSafeInteger(result.padding) || result.padding < 1 || result.padding > 16 ||
      !Number.isSafeInteger(result.maxAtlasSize) || result.maxAtlasSize < 32 || result.maxAtlasSize > 8192 ||
      !Number.isSafeInteger(result.maxAtlasPages) || result.maxAtlasPages < 1 || result.maxAtlasPages > 64) {
    fail("dicing-atlas-options", "Atlas padding or page limits are invalid");
  }
  return result;
}

function canonicalManifestPayload(manifest: Omit<LosslessDicingAtlasManifest, "manifestDigest">): string {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    algorithm: manifest.algorithm,
    sourcePlanDigest: manifest.sourcePlanDigest,
    cellSize: manifest.cellSize,
    padding: manifest.padding,
    maxAtlasSize: manifest.maxAtlasSize,
    pages: manifest.pages.map((page) => [page.pageId, page.width, page.height, page.rgbaDigest]),
    tiles: manifest.tiles.map((tile) => [tile.tileDigest, tile.pageId, tile.x, tile.y, tile.width, tile.height]),
    images: manifest.images.map((image) => [image.assetId, image.width, image.height, image.sourceDigest,
      image.placements.map((placement) => [placement.x, placement.y, placement.width, placement.height, placement.tileDigest])])
  });
}

function createManifestDigest(manifest: Omit<LosslessDicingAtlasManifest, "manifestDigest">): BlobDigest {
  return createBlobDigest(new TextEncoder().encode(canonicalManifestPayload(manifest)));
}

export function createLosslessDicingAtlasRecipeDigest(manifest: LosslessDicingAtlasManifest): BlobDigest {
  return createBlobDigest(new TextEncoder().encode(JSON.stringify({
    recipe: LOSSLESS_DICING_ATLAS_RECIPE_NAME,
    algorithm: manifest.algorithm,
    cellSize: manifest.cellSize,
    padding: manifest.padding,
    maxAtlasSize: manifest.maxAtlasSize
  })));
}

function createPage(index: number): MutablePage {
  return { pageId: `atlas-${index.toString().padStart(3, "0")}`, shelves: [], placements: [], usedWidth: 0, usedHeight: 0 };
}

function placeTile(page: MutablePage, tile: LosslessDicingTile, settings: NormalizedAtlasOptions): boolean {
  const outerWidth = tile.width + settings.padding * 2;
  const outerHeight = tile.height + settings.padding * 2;
  for (const shelf of page.shelves) {
    if (outerHeight <= shelf.height && shelf.x + outerWidth <= settings.maxAtlasSize) {
      page.placements.push({ tile, outerX: shelf.x, outerY: shelf.y });
      shelf.x += outerWidth;
      page.usedWidth = Math.max(page.usedWidth, shelf.x);
      return true;
    }
  }
  if (page.usedHeight + outerHeight > settings.maxAtlasSize) return false;
  const shelf = { y: page.usedHeight, height: outerHeight, x: outerWidth };
  page.shelves.push(shelf);
  page.placements.push({ tile, outerX: 0, outerY: shelf.y });
  page.usedWidth = Math.max(page.usedWidth, outerWidth);
  page.usedHeight += outerHeight;
  return true;
}

function writeExtrudedTile(pageRgba: Uint8Array, pageWidth: number, placement: MutablePage["placements"][number], padding: number): void {
  const { tile, outerX, outerY } = placement;
  for (let outerRow = 0; outerRow < tile.height + padding * 2; outerRow += 1) {
    const sourceY = Math.max(0, Math.min(tile.height - 1, outerRow - padding));
    for (let outerColumn = 0; outerColumn < tile.width + padding * 2; outerColumn += 1) {
      const sourceX = Math.max(0, Math.min(tile.width - 1, outerColumn - padding));
      const sourceOffset = (sourceY * tile.width + sourceX) * 4;
      const outputOffset = ((outerY + outerRow) * pageWidth + outerX + outerColumn) * 4;
      pageRgba.set(tile.rgba.subarray(sourceOffset, sourceOffset + 4), outputOffset);
    }
  }
}

function packPlan(plan: LosslessDicingPlan, settings: NormalizedAtlasOptions): { pages: LosslessDicingAtlasPage[]; tiles: LosslessDicingAtlasTile[] } {
  const orderedTiles = [...plan.tiles].sort((left, right) =>
    right.height - left.height || right.width - left.width || left.digest.localeCompare(right.digest));
  const mutablePages: MutablePage[] = [];
  for (const tile of orderedTiles) {
    if (tile.width + settings.padding * 2 > settings.maxAtlasSize || tile.height + settings.padding * 2 > settings.maxAtlasSize) {
      fail(tile.digest, "Dicing tile including extrusion exceeds the Atlas page limit");
    }
    let page = mutablePages.find((candidate) => placeTile(candidate, tile, settings));
    if (page !== undefined) continue;
    if (mutablePages.length >= settings.maxAtlasPages) throw new AssetBlobError("RESOURCE_LIMIT", "index", "dicing-atlas", "Dicing Atlas exceeds the page budget");
    page = createPage(mutablePages.length);
    if (!placeTile(page, tile, settings)) fail(tile.digest, "Dicing tile could not be placed");
    mutablePages.push(page);
  }
  const tiles: LosslessDicingAtlasTile[] = [];
  const pages = mutablePages.map((page): LosslessDicingAtlasPage => {
    const rgba = new Uint8Array(page.usedWidth * page.usedHeight * 4);
    for (const placement of page.placements) {
      writeExtrudedTile(rgba, page.usedWidth, placement, settings.padding);
      tiles.push({
        tileDigest: placement.tile.digest,
        pageId: page.pageId,
        x: placement.outerX + settings.padding,
        y: placement.outerY + settings.padding,
        width: placement.tile.width,
        height: placement.tile.height
      });
    }
    return { pageId: page.pageId, width: page.usedWidth, height: page.usedHeight, rgbaDigest: createLosslessDicingRgbaDigest(page.usedWidth, page.usedHeight, rgba), rgba };
  });
  tiles.sort((left, right) => left.tileDigest.localeCompare(right.tileDigest));
  return { pages, tiles };
}

function parsePlacement(value: unknown, subject: string): LosslessDicingPlacement {
  if (!isRecord(value) || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y) ||
      !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || (value as { width: number }).width < 1 ||
      (value as { height: number }).height < 1 || !(value.tileDigest === null || typeof value.tileDigest === "string" && DIGEST.test(value.tileDigest))) {
    return fail(subject, "Atlas image placement is invalid");
  }
  return value as unknown as LosslessDicingPlacement;
}

function parseImage(value: unknown): LosslessDicingImagePlan {
  if (!isRecord(value) || typeof value.assetId !== "string" || !ASSET_ID.test(value.assetId) ||
      !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || (value as { width: number }).width < 1 ||
      (value as { height: number }).height < 1 || typeof value.sourceDigest !== "string" || !DIGEST.test(value.sourceDigest) || !Array.isArray(value.placements)) {
    return fail("dicing-atlas-image", "Atlas image record is invalid");
  }
  return { assetId: value.assetId, width: value.width as number, height: value.height as number, sourceDigest: value.sourceDigest as BlobDigest,
    placements: value.placements.map((placement) => parsePlacement(placement, value.assetId as string)) };
}

export function parseLosslessDicingAtlasManifest(source: string): LosslessDicingAtlasManifest {
  let value: unknown;
  try { value = JSON.parse(source); } catch { return fail("dicing-atlas-manifest", "Atlas Manifest is not valid JSON"); }
  if (!isRecord(value) || value.schemaVersion !== 1 || value.algorithm !== "lossless-rgba-atlas/v1" ||
      typeof value.sourcePlanDigest !== "string" || !DIGEST.test(value.sourcePlanDigest) ||
      !Number.isSafeInteger(value.cellSize) || (value.cellSize as number) < 8 || (value.cellSize as number) > 512 ||
      !Number.isSafeInteger(value.padding) || (value.padding as number) < 1 || (value.padding as number) > 16 ||
      !Number.isSafeInteger(value.maxAtlasSize) || (value.maxAtlasSize as number) < 32 || (value.maxAtlasSize as number) > 8192 ||
      !Array.isArray(value.pages) || !Array.isArray(value.tiles) || !Array.isArray(value.images) ||
      value.pages.length > 64 || value.images.length < 1 || value.images.length > 256 ||
      typeof value.manifestDigest !== "string" || !DIGEST.test(value.manifestDigest)) {
    return fail("dicing-atlas-manifest", "Atlas Manifest header is invalid");
  }
  const rawPages = value.pages as unknown[];
  const rawTiles = value.tiles as unknown[];
  const rawImages = value.images as unknown[];
  const pageIds = new Set<string>();
  const pages = rawPages.map((page, pageIndex): LosslessDicingAtlasPageDescriptor => {
    if (!isRecord(page) || typeof page.pageId !== "string" || !/^atlas-[0-9]{3}$/.test(page.pageId) || pageIds.has(page.pageId) ||
        page.pageId !== `atlas-${pageIndex.toString().padStart(3, "0")}` ||
        !Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height) || (page.width as number) < 1 || (page.height as number) < 1 ||
        (page.width as number) > (value as { maxAtlasSize: number }).maxAtlasSize || (page.height as number) > (value as { maxAtlasSize: number }).maxAtlasSize ||
        typeof page.rgbaDigest !== "string" || !DIGEST.test(page.rgbaDigest)) return fail("dicing-atlas-page", "Atlas page descriptor is invalid");
    pageIds.add(page.pageId);
    return page as unknown as LosslessDicingAtlasPageDescriptor;
  });
  const tileDigests = new Set<string>();
  const tiles = rawTiles.map((tile, tileIndex): LosslessDicingAtlasTile => {
    if (!isRecord(tile) || typeof tile.tileDigest !== "string" || !DIGEST.test(tile.tileDigest) || tileDigests.has(tile.tileDigest) ||
        typeof tile.pageId !== "string" || !pageIds.has(tile.pageId) || !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y) ||
        !Number.isSafeInteger(tile.width) || !Number.isSafeInteger(tile.height) || (tile.width as number) < 1 || (tile.height as number) < 1) {
      return fail("dicing-atlas-tile", "Atlas tile mapping is invalid");
    }
    if (tileIndex > 0 && ((rawTiles[tileIndex - 1] as Record<string, unknown>).tileDigest as string) >= tile.tileDigest) {
      return fail(tile.tileDigest, "Atlas tile mappings are not in canonical digest order");
    }
    const page = pages.find((candidate) => candidate.pageId === tile.pageId)!;
    if ((tile.x as number) - (value as { padding: number }).padding < 0 || (tile.y as number) - (value as { padding: number }).padding < 0 ||
        (tile.x as number) + (tile.width as number) + (value as { padding: number }).padding > page.width ||
        (tile.y as number) + (tile.height as number) + (value as { padding: number }).padding > page.height) {
      return fail(tile.tileDigest, "Atlas tile including extrusion is outside its page");
    }
    tileDigests.add(tile.tileDigest);
    return tile as unknown as LosslessDicingAtlasTile;
  });
  for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < tiles.length; rightIndex += 1) {
    const left = tiles[leftIndex]!;
    const right = tiles[rightIndex]!;
    if (left.pageId !== right.pageId) continue;
    const padding = value.padding as number;
    const separated = left.x + left.width + padding <= right.x - padding || right.x + right.width + padding <= left.x - padding ||
      left.y + left.height + padding <= right.y - padding || right.y + right.height + padding <= left.y - padding;
    if (!separated) return fail(left.pageId, "Atlas tile extrusion regions overlap");
  }
  const assetIds = new Set<string>();
  const images = rawImages.map((image, imageIndex) => {
    const parsed = parseImage(image);
    if (assetIds.has(parsed.assetId)) return fail(parsed.assetId, "Atlas image ID is duplicated");
    if (imageIndex > 0 && ((rawImages[imageIndex - 1] as Record<string, unknown>).assetId as string) >= parsed.assetId) {
      return fail(parsed.assetId, "Atlas images are not in canonical Asset ID order");
    }
    assetIds.add(parsed.assetId);
    for (const placement of parsed.placements) {
      if (placement.x < 0 || placement.y < 0 || placement.x + placement.width > parsed.width || placement.y + placement.height > parsed.height ||
          placement.tileDigest !== null && !tileDigests.has(placement.tileDigest)) return fail(parsed.assetId, "Atlas image placement is outside the image or references a missing tile");
    }
    return parsed;
  });
  const provisional = { schemaVersion: 1, algorithm: "lossless-rgba-atlas/v1", sourcePlanDigest: value.sourcePlanDigest as BlobDigest,
    cellSize: value.cellSize as number, padding: value.padding as number, maxAtlasSize: value.maxAtlasSize as number, pages, tiles, images } as const;
  if (createManifestDigest(provisional) !== value.manifestDigest) return fail("dicing-atlas-manifest", "Atlas Manifest digest does not match its canonical payload");
  return { ...provisional, manifestDigest: value.manifestDigest as BlobDigest };
}

export function serializeLosslessDicingAtlasManifest(manifest: LosslessDicingAtlasManifest): string {
  return JSON.stringify(parseLosslessDicingAtlasManifest(JSON.stringify(manifest)));
}

function verifiedPages(manifest: LosslessDicingAtlasManifest, pages: readonly LosslessDicingAtlasPage[]): Map<string, LosslessDicingAtlasPage> {
  const byId = new Map<string, LosslessDicingAtlasPage>();
  for (const page of pages) {
    if (typeof page.pageId !== "string" || !Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height) ||
        page.width < 1 || page.height < 1 || !(page.rgba instanceof Uint8Array) || typeof page.rgbaDigest !== "string" ||
        byId.has(page.pageId) || page.rgba.byteLength !== page.width * page.height * 4 || createLosslessDicingRgbaDigest(page.width, page.height, page.rgba) !== page.rgbaDigest) {
      return fail(page.pageId, "Atlas page bytes are missing, malformed or corrupt");
    }
    byId.set(page.pageId, page);
  }
  for (const descriptor of manifest.pages) {
    const page = byId.get(descriptor.pageId);
    if (page === undefined || page.width !== descriptor.width || page.height !== descriptor.height || page.rgbaDigest !== descriptor.rgbaDigest) {
      return fail(descriptor.pageId, "Atlas page does not match the Manifest");
    }
  }
  if (byId.size !== manifest.pages.length) return fail("dicing-atlas-pages", "Atlas contains undeclared pages");
  return byId;
}

export function reconstructLosslessDicingAtlasImage(
  manifestValue: LosslessDicingAtlasManifest,
  pages: readonly LosslessDicingAtlasPage[],
  assetId: string
): Uint8Array {
  const manifest = parseLosslessDicingAtlasManifest(JSON.stringify(manifestValue));
  const pageById = verifiedPages(manifest, pages);
  const image = manifest.images.find((candidate) => candidate.assetId === assetId);
  if (image === undefined) return fail(assetId, "Atlas image does not exist");
  const tileByDigest = new Map(manifest.tiles.map((tile) => [tile.tileDigest, tile]));
  const output = new Uint8Array(image.width * image.height * 4);
  for (const placement of image.placements) {
    if (placement.tileDigest === null) continue;
    const tile = tileByDigest.get(placement.tileDigest);
    if (tile === undefined || tile.width !== placement.width || tile.height !== placement.height) return fail(assetId, "Atlas image references an incompatible tile");
    const page = pageById.get(tile.pageId)!;
    for (let row = 0; row < tile.height; row += 1) {
      const sourceOffset = ((tile.y + row) * page.width + tile.x) * 4;
      const outputOffset = ((placement.y + row) * image.width + placement.x) * 4;
      output.set(page.rgba.subarray(sourceOffset, sourceOffset + tile.width * 4), outputOffset);
    }
  }
  if (createLosslessDicingRgbaDigest(image.width, image.height, output) !== image.sourceDigest) return fail(assetId, "Atlas reconstruction does not match the source digest");
  return output;
}

export function buildLosslessDicingAtlas(
  sources: readonly LosslessDicingSource[],
  options: LosslessDicingAtlasOptions = {}
): LosslessDicingAtlasArtifact {
  const settings = normalizedAtlasOptions(options);
  const plan = buildLosslessDicingPlan(sources, options);
  const packed = packPlan(plan, settings);
  const provisional = {
    schemaVersion: 1,
    algorithm: "lossless-rgba-atlas/v1",
    sourcePlanDigest: createLosslessDicingPlanDigest(plan),
    cellSize: plan.cellSize,
    padding: settings.padding,
    maxAtlasSize: settings.maxAtlasSize,
    pages: packed.pages.map(({ rgba: _rgba, ...descriptor }) => descriptor),
    tiles: packed.tiles,
    images: plan.images
  } as const;
  const manifest: LosslessDicingAtlasManifest = { ...provisional, manifestDigest: createManifestDigest(provisional) };
  for (const source of sources) {
    const reconstructed = reconstructLosslessDicingAtlasImage(manifest, packed.pages, source.assetId);
    if (!equalBytes(reconstructed, source.rgba)) return fail(source.assetId, "Atlas reconstruction is not byte-identical");
  }
  return { manifest, pages: packed.pages, reconstructionVerified: true };
}

export function resolveLosslessDicingRuntimeImage(
  artifact: LosslessDicingAtlasArtifact | null | undefined,
  original: LosslessDicingSource
): LosslessDicingRuntimeResolution {
  if (artifact === null || artifact === undefined) return { strategy: "original", rgba: original.rgba, reason: "atlas-unavailable" };
  try {
    const manifest = parseLosslessDicingAtlasManifest(JSON.stringify(artifact.manifest));
    const image = manifest.images.find((candidate) => candidate.assetId === original.assetId);
    if (image === undefined || image.width !== original.width || image.height !== original.height ||
        image.sourceDigest !== createLosslessDicingRgbaDigest(original.width, original.height, original.rgba)) {
      return { strategy: "original", rgba: original.rgba, reason: "source-mismatch" };
    }
    return { strategy: "atlas", rgba: reconstructLosslessDicingAtlasImage(manifest, artifact.pages, original.assetId),
      manifestDigest: manifest.manifestDigest };
  } catch {
    return { strategy: "original", rgba: original.rgba, reason: "atlas-unavailable" };
  }
}

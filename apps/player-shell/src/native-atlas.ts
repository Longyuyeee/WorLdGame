import { unzlibSync } from "fflate";
import { createBlobDigest, createLosslessDicingRgbaDigest, parseLosslessDicingPngDeliveryManifest, type LosslessDicingPngDeliveryManifest } from "@world-studio/project-persistence";

export interface NativeAtlasDelivery {
  readonly schemaVersion: 1;
  readonly groupId: string;
  readonly manifest: string;
  readonly pages: readonly { readonly pageId: string; readonly url: string }[];
  readonly fallback: { readonly url: string; readonly digest: string; readonly rawBytes: number; readonly entries: readonly { readonly assetId: string; readonly offset: number; readonly length: number; readonly digest: string }[] };
}
export interface NativeAtlasSource { readonly group: NativeAtlasDelivery; readonly assetId: string; }
const MAX_BYTES = 32 * 1024 * 1024;
export function embeddedBytes(url: string): Uint8Array {
  if (!/^data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(url) || url.length > MAX_BYTES * 1.4) throw Error("Atlas embedded payload invalid or over budget");
  return Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), c => c.charCodeAt(0));
}
export function unpackAtlasFallback(group: NativeAtlasDelivery): Map<string, Uint8Array> {
  const fallback = group.fallback;
  if (group.schemaVersion !== 1 || !Number.isSafeInteger(fallback.rawBytes) || fallback.rawBytes < 1 || fallback.rawBytes > MAX_BYTES || fallback.entries.length > 32) throw Error("Atlas fallback exceeds budget");
  const compressed = embeddedBytes(fallback.url);
  if (createBlobDigest(compressed) !== fallback.digest) throw Error("Atlas fallback digest mismatch");
  const raw = unzlibSync(compressed, { out: new Uint8Array(fallback.rawBytes + 1) });
  if (raw.length !== fallback.rawBytes) throw Error("Atlas fallback length mismatch");
  const files = new Map<string, Uint8Array>();
  for (const entry of fallback.entries) {
    if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 1 || entry.offset + entry.length > raw.length || files.has(entry.assetId)) throw Error("Atlas fallback entry invalid");
    const bytes = raw.subarray(entry.offset, entry.offset + entry.length);
    if (createBlobDigest(bytes) !== entry.digest) throw Error("Atlas fallback source mismatch");
    files.set(entry.assetId, bytes);
  }
  return files;
}
export function hydrateNativeAtlasMedia<T extends { assetId: string; url: string }>(media: readonly T[], groups: readonly NativeAtlasDelivery[] = []) {
  const urls: string[] = [], sources = new Map<string, { url: string; atlas: NativeAtlasSource }>();
  try {
    if (groups.length > 8 || groups.reduce((n, group) => n + group.fallback.rawBytes, 0) > MAX_BYTES) throw Error("Atlas fallback aggregate budget exceeded");
    for (const group of groups) for (const [assetId, bytes] of unpackAtlasFallback(group)) {
      if (sources.has(assetId)) throw Error("Overlapping Atlas assets");
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })); urls.push(url); sources.set(assetId, { url, atlas: { group, assetId } });
    }
    return { media: media.map(asset => ({ ...asset, ...sources.get(asset.assetId) })), dispose: () => urls.splice(0).forEach(url => URL.revokeObjectURL(url)) };
  } catch (error) { urls.forEach(url => URL.revokeObjectURL(url)); throw error; }
}

type DecodedGroup = { manifest: LosslessDicingPngDeliveryManifest; pages: Map<string, ImageBitmap> };
type CachedGroup = { refs: number; bytes: number; promise: Promise<DecodedGroup> };
const cache = new Map<NativeAtlasDelivery, CachedGroup>();
let accountedBytes = 0, peakBytes = 0;
const RENDER_BUDGET = 64 * 1024 * 1024;
export const nativeAtlasDiagnostics = () => ({ groups: cache.size, accountedBytes, peakBytes, budgetBytes: RENDER_BUDGET });
function publishDiagnostics() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.nativeAtlasBytes = String(accountedBytes);
    document.documentElement.dataset.nativeAtlasPeakBytes = String(peakBytes);
    document.documentElement.dataset.nativeAtlasGroups = String(cache.size);
  }
}
function reserve(bytes: number) { if (!Number.isSafeInteger(bytes) || bytes < 0 || accountedBytes + bytes > RENDER_BUDGET) throw Error("Atlas renderer memory budget exceeded"); accountedBytes += bytes; peakBytes = Math.max(peakBytes, accountedBytes); publishDiagnostics(); }
async function decode(group: NativeAtlasDelivery, manifest: LosslessDicingPngDeliveryManifest): Promise<DecodedGroup> {
  const pages = new Map<string, ImageBitmap>();
  try {
    for (const descriptor of manifest.pages) {
      const page = group.pages.find(p => p.pageId === descriptor.pageId); if (!page) throw Error("Atlas page missing");
      const bytes = embeddedBytes(page.url);
      if (bytes.length !== descriptor.encodedByteLength || createBlobDigest(bytes) !== descriptor.encodedDigest) throw Error("Atlas page corrupt");
      const view = new DataView(bytes.buffer);
      if (bytes.length < 24 || view.getUint32(16) !== descriptor.width || view.getUint32(20) !== descriptor.height) throw Error("Atlas page dimensions invalid");
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      pages.set(descriptor.pageId, bitmap);
      if (bitmap.width !== descriptor.width || bitmap.height !== descriptor.height) throw Error("Atlas decoded dimensions invalid");
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      try { const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw Error("Atlas canvas unsupported"); context.drawImage(bitmap, 0, 0); if (createLosslessDicingRgbaDigest(bitmap.width, bitmap.height, new Uint8Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data)) !== descriptor.rgbaDigest) throw Error("Atlas decoded pixels mismatch"); }
      finally { canvas.width = canvas.height = 0; }
    }
    return { manifest, pages };
  } catch (error) { pages.forEach(bitmap => bitmap.close()); throw error; }
}
export async function acquireNativeAtlasImage(source: NativeAtlasSource, target?: HTMLCanvasElement): Promise<{ source: HTMLCanvasElement; width: number; height: number; release(): void }> {
  if (typeof createImageBitmap !== "function") throw Error("Atlas bitmap unsupported");
  const { group, assetId } = source;
  const manifest = parseLosslessDicingPngDeliveryManifest(group.manifest);
  const image = manifest.layoutManifest.images.find(candidate => candidate.assetId === assetId);
  if (!image || image.width * image.height > 4_194_304 || manifest.pages.reduce((n, p) => n + p.width * p.height, 0) > 8_388_608) throw Error("Atlas image exceeds budget");
  // Account page bitmaps plus temporary readback canvas/RGBA, and output canvas plus verification readback.
  const imageBytes = image.width * image.height * 8;
  let entry = cache.get(group);
  if (!entry) {
    const bytes = manifest.pages.reduce((n, p) => n + p.width * p.height * 12, 0); reserve(bytes);
    entry = { refs: 0, bytes, promise: decode(group, manifest) }; cache.set(group, entry); publishDiagnostics();
  }
  entry.refs++;
  const owned = entry;
  let imageReserved = false, released = false;
  const canvas = target ?? document.createElement("canvas");
  const release = () => {
    if (released) return; released = true; canvas.width = canvas.height = 0;
    if (imageReserved) accountedBytes -= imageBytes;
    if (--owned.refs === 0) {
      const clear = (decoded?: DecodedGroup) => { if (owned.refs === 0 && cache.get(group) === owned) { cache.delete(group); accountedBytes -= owned.bytes; decoded?.pages.forEach(bitmap => bitmap.close()); publishDiagnostics(); } };
      void owned.promise.then(clear, () => clear());
    }
    publishDiagnostics();
  };
  try {
    reserve(imageBytes); imageReserved = true;
    const decoded = await owned.promise;
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw Error("Atlas canvas unsupported");
    context.imageSmoothingEnabled = false;
    const tiles = new Map(decoded.manifest.layoutManifest.tiles.map(tile => [tile.tileDigest, tile]));
    for (const placement of image.placements) {
      if (placement.tileDigest === null) continue;
      const tile = tiles.get(placement.tileDigest); if (!tile) throw Error("Atlas tile missing");
      const page = decoded.pages.get(tile.pageId); if (!page) throw Error("Atlas page missing");
      context.drawImage(page, tile.x, tile.y, placement.width, placement.height, placement.x, placement.y, placement.width, placement.height);
    }
    if (createLosslessDicingRgbaDigest(image.width, image.height, new Uint8Array(context.getImageData(0, 0, image.width, image.height).data)) !== image.sourceDigest) throw Error("Atlas rendered pixels mismatch");
    canvas.dataset.nativeAtlas = "ready";
    return { source: canvas, width: image.width, height: image.height, release };
  } catch (error) { release(); throw error; }
}

import { parseLosslessDicingPngDeliveryManifest, createBlobDigest, type BlobDigest } from "@world-studio/project-persistence";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { AssetDicingRuntimePublication } from "./indexeddb-asset-repository";
import { resolveDicingRuntimeImageInWorker } from "./dicing-runtime-client";
import type { ExportMedia } from "./export-optimization";

export interface AtlasExportReader {
  loadDicingRuntimePublication?(groupId: string): Promise<AssetDicingRuntimePublication | null>;
}
export function atlasExportGroups(project: CanonicalProject): string[] {
  const value = project.manifest.preservedFields?.atlasExportGroups;
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(id)))].slice(0, 8) : [];
}
export const setAtlasExportGroups = (project: CanonicalProject, groups: string[]): CanonicalProject => ({ ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields, atlasExportGroups: groups.slice(0, 8) } } });

export async function compatiblePng(asset: ExportMedia, publication: AssetDicingRuntimePublication): Promise<Uint8Array> {
  if (asset.mimeType !== "image/png" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") throw Error("仅支持具备 Canvas 能力的 PNG 兼容构建");
  // Animated sources cannot be represented by one reconstructed frame.
  const view = new DataView(asset.bytes.buffer, asset.bytes.byteOffset, asset.bytes.byteLength);
  if (asset.bytes.length < 33 || view.getUint32(16) * view.getUint32(20) > 4_194_304) throw Error("源 PNG 超过像素预算");
  for (let at = 8; at + 12 <= asset.bytes.length;) {
    const size = view.getUint32(at); if (at + size + 12 > asset.bytes.length) throw Error("源 PNG 块长度无效");
    const type = String.fromCharCode(...asset.bytes.subarray(at + 4, at + 8));
    if (["acTL", "fcTL", "fdAT"].includes(type)) throw Error("动画 PNG 保留源文件");
    at += size + 12;
  }
  const resolution = await resolveDicingRuntimeImageInWorker({ assetId: asset.assetId, originalMimeType: asset.mimeType, originalBytes: asset.bytes,
    deliveryManifestJson: publication.deliveryManifestJson, encodedPages: publication.encodedPages, maxDecodedPixels: 4_194_304, maxAtlasPixels: 8_388_608, maxEncodedBytes: 32 * 1024 * 1024 });
  if (resolution.strategy !== "atlas") throw Error(`派生未匹配当前源图：${resolution.reason}`);
  const { width, height, rgba } = resolution;
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("PNG 编码器不可用");
  const pixels = context.createImageData(width, height); pixels.data.set(rgba); context.putImageData(pixels, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" }), encoded = new Uint8Array(await blob.arrayBuffer());
  // Match ordinary browser presentation, not only the Worker's color-conversion policy.
  for (const candidate of [new Blob([new Uint8Array(asset.bytes)], { type: "image/png" }), blob]) {
    const bitmap = await createImageBitmap(candidate);
    try {
      if (bitmap.width !== width || bitmap.height !== height) throw Error("兼容图尺寸不匹配");
      context.clearRect(0, 0, width, height); context.drawImage(bitmap, 0, 0);
      const decoded = context.getImageData(0, 0, width, height).data;
      if (!decoded.every((byte, index) => byte === rgba[index])) throw Error("浏览器颜色/透明像素对照不一致");
    } finally { bitmap.close(); }
  }
  return encoded;
}

export interface AtlasExportRow { groupId: string; status: "adopted" | "original"; reason: string; assetIds: string[]; }
export async function applyAtlasCompatibilityExport(project: CanonicalProject, media: readonly ExportMedia[], reader: AtlasExportReader,
  encode = compatiblePng): Promise<{ assets: ExportMedia[]; rows: AtlasExportRow[] }> {
  const assets = [...media], rows: AtlasExportRow[] = [], claimed = new Set<string>();
  for (const groupId of atlasExportGroups(project)) {
    let assetIds: string[] = [];
    try {
      const publication = await reader.loadDicingRuntimePublication?.(groupId);
      if (!publication) throw Error("未找到派生组；迁移工程后请重新分析/发布，保留当前构建素材（独立 PNG 优化设置仍生效）");
      const manifest = parseLosslessDicingPngDeliveryManifest(publication.deliveryManifestJson);
      if (createBlobDigest(new TextEncoder().encode(publication.deliveryManifestJson)) !== publication.manifestDigest) throw Error("派生清单摘要错误");
      if (manifest.pages.reduce((sum, page) => sum + page.width * page.height, 0) > 8_388_608 || publication.encodedPages.reduce((sum, page) => sum + page.bytes.length, 0) > 32 * 1024 * 1024) throw Error("Atlas 超过解码/编码预算");
      if (publication.encodedPages.length !== manifest.pages.length) throw Error("Atlas 页数量不匹配");
      for (const descriptor of manifest.pages) {
        const page = publication.encodedPages.find(candidate => candidate.pageId === descriptor.pageId);
        if (!page || page.bytes.length !== descriptor.encodedByteLength || createBlobDigest(page.bytes) !== descriptor.encodedDigest) throw Error("Atlas 页缺失或损坏");
      }
      assetIds = manifest.layoutManifest.images.map(image => image.assetId);
      if (assetIds.length > 32 || assetIds.some(id => claimed.has(id))) throw Error("组超过 32 张或与已采用组重叠");
      const selected = assetIds.map(id => assets.find(asset => asset.assetId === id));
      if (selected.some(asset => !asset)) throw Error("组成员已删除或缺失");
      if (selected.reduce((sum, asset) => sum + asset!.bytes.length, 0) > 32 * 1024 * 1024) throw Error("组源文件超过 32 MiB 构建预算");
      const candidates: ExportMedia[] = [];
      for (const asset of selected as ExportMedia[]) {
        const bytes = await encode(asset, publication);
        // Never make an individual asset larger; group changes are only committed after all validation succeeds.
        candidates.push(bytes.length < asset.bytes.length ? { ...asset, bytes, mimeType: "image/png", digest: createBlobDigest(bytes) as BlobDigest } : asset);
      }
      const proposed = assets.map(asset => candidates.find(candidate => candidate.assetId === asset.assetId) ?? asset);
      const uniqueBytes = (items: ExportMedia[]) => [...new Map(items.map(asset => [asset.digest, asset.bytes.length])).values()].reduce((sum, size) => sum + size, 0);
      if (uniqueBytes(proposed) >= uniqueBytes(assets)) throw Error("兼容 PNG 无实际去重字节收益；图集文件大小不等于最终发布收益");
      for (const candidate of candidates) { assets[assets.findIndex(asset => asset.assetId === candidate.assetId)] = candidate; claimed.add(candidate.assetId); }
      rows.push({ groupId, status: "adopted", assetIds, reason: "当前源图/Atlas/兼容 PNG 像素一致；仅采用更小文件。发布普通纹理，不携带 Atlas、不减少 GPU 内存。PNG 元数据不复制，原文件保留于源工程。" });
    } catch (error) { rows.push({ groupId, status: "original", assetIds, reason: error instanceof Error ? error.message : "派生不可用，保留当前素材" }); }
  }
  return { assets, rows };
}

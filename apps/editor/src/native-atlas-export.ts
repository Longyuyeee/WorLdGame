import { zlib } from "fflate";
import { createBlobDigest, parseLosslessDicingPngDeliveryManifest } from "@world-studio/project-persistence";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { NativeAtlasDelivery } from "@world-studio/player-shell/native-atlas";
import { atlasExportGroups, compatiblePng, type AtlasExportReader } from "./atlas-export";
import type { ExportMedia } from "./export-optimization";

export const nativeAtlasEnabled = (project: CanonicalProject) => project.manifest.preservedFields?.nativeAtlasExport === true;
export const setNativeAtlas = (project: CanonicalProject, enabled: boolean): CanonicalProject => ({ ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields, nativeAtlasExport: enabled } } });
export function dataUrl(bytes: Uint8Array, mime = "application/octet-stream") {
  let text = ""; for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:${mime};base64,${btoa(text)}`;
}
export interface PreparedAtlasDelivery { readonly group: NativeAtlasDelivery; readonly payloadBytes: number; }
export interface AtlasDeliveryRequest {
  readonly key: string; readonly reservedBytes: number; readonly signal?: AbortSignal;
  readonly build: (signal?: AbortSignal) => Promise<PreparedAtlasDelivery>;
}
export type NativeAtlasVerifier = ((...args: Parameters<typeof compatiblePng>) => Promise<unknown>) & {
  prepareDelivery?: (request: AtlasDeliveryRequest) => Promise<PreparedAtlasDelivery & { reused: boolean }>;
};

/** fflate's worker is terminated when the last scheduler consumer cancels. */
export function compressAtlasFallback(bytes: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => { terminate(); reject(signal!.reason); };
    const terminate = zlib(bytes, { level: 9 }, (error, compressed) => {
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(compressed);
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}
export async function buildNativeAtlasDelivery(project: CanonicalProject, assets: readonly ExportMedia[], reader: AtlasExportReader, verify: NativeAtlasVerifier = compatiblePng, signal?: AbortSignal) {
  const groups: NativeAtlasDelivery[] = [], adopted = new Set<string>(), rows: {groupId:string; adopted:boolean; detail:string; payloadBytes:number; pageRgbaBytes:number; fallbackRawBytes:number}[] = [];
  let fallbackRawBytes = 0;
  for (const groupId of nativeAtlasEnabled(project) ? atlasExportGroups(project) : []) {
    signal?.throwIfAborted();
    try {
      const publication = await reader.loadDicingRuntimePublication?.(groupId); if (!publication) throw Error("本机派生缺失，请重建；保留普通纹理");
      const manifest = parseLosslessDicingPngDeliveryManifest(publication.deliveryManifestJson);
      if (createBlobDigest(new TextEncoder().encode(publication.deliveryManifestJson)) !== publication.manifestDigest) throw Error("清单摘要错误");
      if (publication.encodedPages.length !== manifest.pages.length || publication.encodedPages.reduce((n,page)=>n+page.bytes.length,0)>32*1024*1024) throw Error("图集页数量或编码预算错误");
      for (const descriptor of manifest.pages) {
        const page = publication.encodedPages.find(candidate => candidate.pageId === descriptor.pageId);
        if (!page || page.bytes.length !== descriptor.encodedByteLength || createBlobDigest(page.bytes) !== descriptor.encodedDigest) throw Error("图集页缺失或摘要错误");
      }
      const ids = manifest.layoutManifest.images.map(image => image.assetId);
      const selected = ids.map(id => assets.find(asset => asset.assetId === id));
      const publicationSettings = project.manifest.preservedFields?.webPublication as { iconAssetId?: string } | undefined;
      const coverId = (project.ui.preservedFields?.webPlayerAppearance as { coverAssetId?: string } | undefined)?.coverAssetId;
      if (ids.length > 32 || ids.some(id => adopted.has(id) || id === publicationSettings?.iconAssetId || id === coverId) || selected.some(asset => !asset)) throw Error("组成员缺失、重叠或包含发布图标/标题封面");
      const sources = selected as ExportMedia[], rawBytes = sources.reduce((sum, asset) => sum + asset.bytes.length, 0);
      if (fallbackRawBytes + rawBytes > 32 * 1024 * 1024 || manifest.pages.reduce((n,p)=>n+p.width*p.height,0)>8_388_608 || manifest.layoutManifest.images.some(image=>image.width*image.height>4_194_304)) throw Error("组/回退数据超出内存预算");
      const minimumRenderBytes = manifest.pages.reduce((n,p)=>n+p.width*p.height*12,0) + Math.max(...manifest.layoutManifest.images.map(image=>image.width*image.height*8));
      if (minimumRenderBytes > 64 * 1024 * 1024) throw Error("单图原生绘制已超出 64 MiB 预算，保留普通纹理");
      for (const source of sources) { signal?.throwIfAborted(); await verify(source, publication, signal); }
      signal?.throwIfAborted();
      const key = JSON.stringify([groupId, publication.manifestDigest, publication.encodedPages.map(page=>[page.pageId,createBlobDigest(page.bytes)]), sources.map(source=>[source.assetId,source.mimeType,source.digest,createBlobDigest(source.bytes)])]);
      const build = async (jobSignal?: AbortSignal): Promise<PreparedAtlasDelivery> => {
        jobSignal?.throwIfAborted();
        const raw = new Uint8Array(rawBytes); let offset = 0;
        const entries = sources.map(source => { const entry = {assetId:source.assetId,offset,length:source.bytes.length,digest:source.digest}; raw.set(source.bytes,offset); offset+=source.bytes.length; return entry; });
        const compressed = await compressAtlasFallback(raw, jobSignal);
        jobSignal?.throwIfAborted();
        const group: NativeAtlasDelivery = {schemaVersion:1,groupId,manifest:publication.deliveryManifestJson,pages:publication.encodedPages.map(page=>({pageId:page.pageId,url:dataUrl(page.bytes,"image/png")})),fallback:{url:dataUrl(compressed),digest:createBlobDigest(compressed),rawBytes,entries}};
        return { group, payloadBytes: new TextEncoder().encode(JSON.stringify(group)).length };
      };
      // Conservative serialized UTF-16 bound, not codec scratch/process memory.
      const reservedBytes = 4 * (rawBytes + publication.encodedPages.reduce((n,page)=>n+page.bytes.length,0)) + 12 * publication.deliveryManifestJson.length + key.length * 2 + 65536;
      const prepared = verify.prepareDelivery ? await verify.prepareDelivery({ key, reservedBytes, build, ...(signal ? { signal } : {}) }) : { ...await build(signal), reused: false };
      signal?.throwIfAborted();
      const { group, payloadBytes } = prepared;
      const outsideDigests = new Set(assets.filter(asset=>!ids.includes(asset.assetId) && !adopted.has(asset.assetId)).map(asset=>asset.digest));
      const removable = [...new Map(sources.filter(asset=>!outsideDigests.has(asset.digest)).map(asset=>[asset.digest,asset.bytes.length])).values()].reduce((a,b)=>a+b,0);
      // Both formats carry reporting metadata; ZIP also has a separate report copy.
      const reportAllowance = 1024 + sources.length * 1024;
      if (payloadBytes + reportAllowance >= removable) throw Error("包括 Base64、原图回退包、清单和报告余量后无净收益；保留普通纹理");
      groups.push(group); ids.forEach(id=>adopted.add(id)); fallbackRawBytes+=rawBytes;
      rows.push({groupId,adopted:true,detail:`${prepared.reused ? "复用本会话组交付缓存，未重复压缩" : "本组已重新生成交付（首次、内容变更或缓存已释放）"}；当前源与派生完整性、跨组收益及预算重新核对。原生 Canvas 图块绘制；随包压缩原图可离线回退。内存统计为预算记账，不是实际 GPU 测量。`,payloadBytes,pageRgbaBytes:manifest.pages.reduce((n,p)=>n+p.width*p.height*4,0),fallbackRawBytes:rawBytes});
    } catch(error) { signal?.throwIfAborted(); rows.push({groupId,adopted:false,detail:error instanceof Error?error.message:"派生不可用",payloadBytes:0,pageRgbaBytes:0,fallbackRawBytes:0}); }
  }
  return {groups,adopted,rows};
}

import { applyWebPlayerAppearance, applyWebAssetSources, applyWebCredits, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, exportProjectBinaryZip, importProjectBinaryZip, ProjectArchiveError, includesWebAssetCredit, newWebAssetSourceRecord, parseWebAssetSources, readWebAssetSources, readWebCredits, webPlayerCoverAssets, webPlayerFontAssets, webPlayerSkinReferences, type CanonicalProject, type JsonObject, type WebAssetSourceRecord, type WebPlayerAppearance, type WebPlayerSkin } from "@world-studio/project-domain";
import type { AssetImportInput, BlobDigest } from "@world-studio/project-persistence";
import type { AssetLibraryReader } from "./asset-library-card";
import { browserBlobDigest } from "./browser-blob-digest";
import { inspectAssetBytes, mediaInspectionToJson } from "./media-inspection-client";
import { exportPlayerSkinPreset, importPlayerSkinPreset } from "./player-skin-preset";
import { WEB_PLAYER_SKIN_MAX_ASSETS, remapWebPlayerSkinReferences, webPlayerSkinImageReferences } from "@world-studio/project-domain";

export const SKIN_BUNDLE_MAX_BYTES = 64 * 1024 * 1024 + 512 * 1024;
const descriptorPath = "skin.json", blobPath = (digest: string) => `blobs/${digest.slice(7)}`;
export interface SkinBundleAsset { readonly assetId: string; readonly displayName: string; readonly kind: "font" | "cg"; readonly source: { readonly digest: string; readonly byteLength: number; readonly mimeType: string } }
export interface SkinBundle { readonly name: string; readonly appearance: WebPlayerAppearance & { readonly skin: WebPlayerSkin }; readonly assets: readonly SkinBundleAsset[]; readonly blobs: ReadonlyMap<string, Uint8Array>; readonly publicCredits: string; readonly records: readonly WebAssetSourceRecord[] }
export type SkinAssetChoice = { readonly mode: "package" } | { readonly mode: "existing"; readonly assetId: string } | { readonly mode: "file"; readonly bytes: Uint8Array; readonly mimeType: string; readonly name: string } | { readonly mode: "fallback" };
export interface SkinImportPlan {
  readonly baseProjectId: string; readonly baseAssets: string; readonly baseAppearance: string;
  readonly appearance: WebPlayerAppearance; readonly inputs: readonly AssetImportInput[]; readonly mappings: ReadonlyMap<string, string>;
  readonly records: readonly WebAssetSourceRecord[]; readonly publicCredits: string;
  readonly previewProject: CanonicalProject; readonly reader: AssetLibraryReader;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function exact(v: unknown, fields: readonly string[]): v is Record<string, unknown> { return object(v) && Object.keys(v).sort().join(",") === [...fields].sort().join(","); }
const referenceIds = (appearance: WebPlayerAppearance & { skin: WebPlayerSkin }) => [...new Set([appearance.coverAssetId, ...webPlayerSkinReferences(appearance.skin)].filter(Boolean))];
function assetDescriptor(project: CanonicalProject, assetId: string): SkinBundleAsset {
  const asset = project.assets.assets.find(row => (row.assetId ?? row.id) === assetId), source = asset?.source;
  if (!asset || !object(source) || typeof source.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(source.digest) || typeof source.byteLength !== "number" || typeof source.mimeType !== "string") throw Error("皮肤引用的素材信息不完整，请先修复素材。");
  const kind = asset.kind === "font" ? "font" : "cg";
  if (!(kind === "font" ? webPlayerFontAssets(project) : webPlayerCoverAssets(project)).includes(asset)) throw Error(`素材“${String(asset.displayName ?? assetId)}”不适合作为皮肤图片或字体。`);
  return { assetId, displayName: String(asset.displayName ?? assetId).slice(0, 200), kind, source: { digest: source.digest, byteLength: source.byteLength, mimeType: source.mimeType } };
}
export function skinBundleAssets(project: CanonicalProject, appearance: WebPlayerAppearance): readonly SkinBundleAsset[] {
  applyWebPlayerAppearance(project, appearance);
  if (!appearance.skin) throw Error("请先选择或应用一套皮肤。");
  const assets = referenceIds(appearance as WebPlayerAppearance & { skin: WebPlayerSkin }).map(id => assetDescriptor(project, id));
  if (assets.length > WEB_PLAYER_SKIN_MAX_ASSETS || assets.reduce((sum, asset) => sum + asset.source.byteLength, 0) > 64 * 1024 * 1024) throw Error("皮肤素材合计最多 64 MB / 24 项，请缩小素材后再导出。");
  return assets;
}
export async function exportSkinBundle(project: CanonicalProject, appearance: WebPlayerAppearance, name: string, reader: AssetLibraryReader | null, publicCredits: string, includePrivateSources: boolean, signal?: AbortSignal): Promise<Uint8Array> {
  const assets = skinBundleAssets(project, appearance), files: Record<string, Uint8Array> = {};
  const book = readWebAssetSources(project);
  const records = assets.map(asset => {
    const record = book.records.find(row => row.assetId === asset.assetId && row.digest === asset.source.digest);
    return includePrivateSources && record ? record : { ...newWebAssetSourceRecord(asset.assetId, asset.source.digest), credit: record?.credit ?? "" };
  });
  if (publicCredits.length > 12000) throw Error("公开署名与许可最多 12000 个字符。");
  for (const asset of assets) {
    signal?.throwIfAborted(); const bytes = await reader?.read(asset.source.digest as BlobDigest);
    if (!bytes || bytes.byteLength !== asset.source.byteLength || await browserBlobDigest(bytes) !== asset.source.digest) throw Error(`素材“${asset.displayName}”缺失或损坏，皮肤包未生成。`);
    files[blobPath(asset.source.digest)] = bytes;
  }
  signal?.throwIfAborted();
  files[descriptorPath] = new TextEncoder().encode(JSON.stringify({ format: "world-player-skin-bundle", schemaVersion: 1, configuration: exportPlayerSkinPreset(project, appearance, name), assets, publicCredits, sources: { schemaVersion: 1, records } }));
  if (files[descriptorPath].byteLength > 512 * 1024) throw Error("皮肤说明过大，请精简来源记录。");
  return exportProjectBinaryZip(files);
}
export async function readSkinBundle(bytes: Uint8Array, signal?: AbortSignal): Promise<SkinBundle> {
  if (bytes.byteLength > SKIN_BUNDLE_MAX_BYTES) throw Error("皮肤包最大 64 MB 素材加 512 KB 说明。");
  signal?.throwIfAborted();
  let files: Record<string, Uint8Array>;
  try { files = importProjectBinaryZip(bytes, { maxEntries: WEB_PLAYER_SKIN_MAX_ASSETS + 1, maxEntryBytes: 32 * 1024 * 1024, maxTotalBytes: SKIN_BUNDLE_MAX_BYTES }); }
  catch (e) { throw Error(e instanceof ProjectArchiveError && e.code === "UNSUPPORTED_COMPRESSION" ? "请选择本应用导出的 .worldskin.zip；重新压缩的 ZIP 暂不支持，请保留原包。" : "皮肤包目录或内容校验失败，未载入工程。请重新选择完整的皮肤包。"); }
  if (!files[descriptorPath] || files[descriptorPath].byteLength > 512 * 1024) throw Error("缺少有效的皮肤说明 skin.json。");
  let value: unknown; try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(files[descriptorPath])); } catch { throw Error("皮肤说明不是有效的 UTF-8 JSON。"); }
  if (!exact(value, ["format", "schemaVersion", "configuration", "assets", "publicCredits", "sources"]) || value.format !== "world-player-skin-bundle" || value.schemaVersion !== 1 || typeof value.configuration !== "string" || !Array.isArray(value.assets) || value.assets.length > WEB_PLAYER_SKIN_MAX_ASSETS || typeof value.publicCredits !== "string" || value.publicCredits.length > 12000) throw Error("皮肤包格式或版本无效。");
  // Validate the existing portable configuration contract before using its references.
  importPlayerSkinPreset(value.configuration, createProjectTemplate("Skin validation", "018f08d8-71a1-7bc2-a627-2f4a843ee155"), DEFAULT_WEB_PLAYER_APPEARANCE);
  const config = JSON.parse(value.configuration) as { name: string; appearance: WebPlayerAppearance & { skin: WebPlayerSkin }; assets: { assetId: string; digest: string }[] };
  const appearance = { ...DEFAULT_WEB_PLAYER_APPEARANCE, ...config.appearance };
  const ids = referenceIds(appearance), seen = new Set<string>(), blobs = new Map<string, Uint8Array>();
  const assets = value.assets.map((row): SkinBundleAsset => {
    if (!exact(row, ["assetId", "displayName", "kind", "source"]) || typeof row.assetId !== "string" || !ids.includes(row.assetId) || seen.has(row.assetId) || typeof row.displayName !== "string" || !row.displayName.trim() || row.displayName.length > 200 || !["font", "cg"].includes(String(row.kind)) || !exact(row.source, ["digest", "byteLength", "mimeType"])) throw Error("皮肤素材列表无效或重复。");
    const s = row.source;
    if (config.assets.find(asset => asset.assetId === row.assetId)?.digest !== s.digest) throw Error("配置与皮肤素材摘要不一致。");
    if (typeof s.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(s.digest) || typeof s.byteLength !== "number" || !Number.isSafeInteger(s.byteLength) || s.byteLength <= 0 || s.byteLength > (row.kind === "font" ? 32 : 8) * 1024 * 1024 || typeof s.mimeType !== "string" || !(row.kind === "font" ? ["font/woff", "font/woff2", "font/ttf", "font/otf"] : ["image/png", "image/jpeg", "image/webp"]).includes(s.mimeType)) throw Error("皮肤素材大小或类型不受支持。");
    if (Object.values(appearance.skin.fonts).some(font => font === `asset:${row.assetId}`) && row.kind !== "font" || [appearance.coverAssetId, ...webPlayerSkinImageReferences(appearance.skin)].includes(row.assetId) && row.kind !== "cg") throw Error("图片与字体用途不匹配。");
    seen.add(row.assetId); return row as unknown as SkinBundleAsset;
  });
  if (seen.size !== ids.length || assets.reduce((sum, a) => sum + a.source.byteLength, 0) > 64 * 1024 * 1024 || Object.keys(files).some(key => key !== descriptorPath && !assets.some(asset => blobPath(asset.source.digest) === key))) throw Error("皮肤包包含未声明的文件或缺少素材说明。");
  for (const asset of assets) {
    signal?.throwIfAborted(); const data = files[blobPath(asset.source.digest)];
    if (!data) continue; // A missing member is repairable; corrupt bytes are never silently accepted.
    if (data.byteLength !== asset.source.byteLength || await browserBlobDigest(data) !== asset.source.digest) throw Error(`素材“${asset.displayName}”摘要或大小不符，皮肤包未载入。`);
    blobs.set(asset.source.digest, data);
  }
  const records = parseWebAssetSources(value.sources).records;
  if (records.length > WEB_PLAYER_SKIN_MAX_ASSETS || records.some(row => !assets.some(asset => asset.assetId === row.assetId && asset.source.digest === row.digest))) throw Error("皮肤来源记录与素材不符。");
  signal?.throwIfAborted();
  return { name: config.name, appearance, assets, blobs, records, publicCredits: value.publicCredits };
}
export function skinAssetCandidates(project: CanonicalProject, asset: SkinBundleAsset): readonly JsonObject[] { return asset.kind === "font" ? webPlayerFontAssets(project) : webPlayerCoverAssets(project); }
export function defaultSkinChoices(bundle: SkinBundle, project: CanonicalProject): Readonly<Record<string, SkinAssetChoice>> {
  return Object.fromEntries(bundle.assets.flatMap((asset): [string, SkinAssetChoice][] => {
    const existing = skinAssetCandidates(project, asset).find(row => (row.source as JsonObject)?.digest === asset.source.digest);
    return existing ? [[asset.assetId, { mode: "existing", assetId: String(existing.assetId ?? existing.id) }]] : bundle.blobs.has(asset.source.digest) ? [[asset.assetId, { mode: "package" }]] : [];
  }));
}
function remapAppearance(appearance: SkinBundle["appearance"], current: WebPlayerAppearance, mapping: ReadonlyMap<string, string>): WebPlayerAppearance {
  const map = (id: string) => mapping.get(id) ?? id;
  return { ...current, theme: appearance.theme, accent: appearance.accent, coverAssetId: map(appearance.coverAssetId), skin: remapWebPlayerSkinReferences(appearance.skin, map) };
}
export function defaultSkinPortraitChoices(bundle: SkinBundle, project: CanonicalProject): Readonly<Record<string, string>> {
  return Object.fromEntries((bundle.appearance.skin.template?.portrait.bindings ?? []).flatMap(row => project.characters.characters.some(character => character.id === row.characterId) ? [[row.characterId, row.characterId]] : []));
}
function mappedPortraits(bundle: SkinBundle, project: CanonicalProject, choices: Readonly<Record<string, SkinAssetChoice>>, characters: Readonly<Record<string, string>>): SkinBundle["appearance"] {
  const template = bundle.appearance.skin.template;
  if (!template) return bundle.appearance;
  const used = new Set<string>();
  const bindings = template.portrait.bindings.flatMap(row => {
    if (choices[row.assetId]?.mode === "fallback") return [];
    if (!Object.hasOwn(characters, row.characterId)) throw Error(`请为头像角色“${row.characterName}”明确选择当前作品角色，或不使用这个头像。不会自动复制角色。`);
    const id = characters[row.characterId]; if (!id) return [];
    const character = project.characters.characters.find(item => item.id === id);
    if (!character) throw Error("头像对应的角色已变化，请重新选择。");
    if (used.has(id)) throw Error("多个来源头像不能同时对应同一角色，请保留一个或选择不使用。"); used.add(id);
    return [{ ...row, characterId: id, characterName: String(character.displayName ?? id).slice(0, 80) }];
  });
  return { ...bundle.appearance, skin: { ...bundle.appearance.skin, template: { ...template, portrait: { ...template.portrait, bindings } } } };
}
/** Apply only style/provenance deltas to the current project; never replace its plot or credits. */
export function applySkinImportPlan(project: CanonicalProject, plan: Pick<SkinImportPlan, "appearance" | "records" | "publicCredits">): CanonicalProject {
  let next = applyWebPlayerAppearance(project, plan.appearance);
  const credits = readWebCredits(next), additions = plan.publicCredits.trim();
  if (additions && !includesWebAssetCredit(credits.acknowledgements, additions)) next = applyWebCredits(next, { ...credits, acknowledgements: [credits.acknowledgements, additions].filter(Boolean).join("\n\n") });
  const book = readWebAssetSources(next), existing = new Set(book.records.map(row => row.assetId));
  next = applyWebAssetSources(next, { schemaVersion: 1, records: [...book.records, ...plan.records.filter(row => !existing.has(row.assetId))] });
  return next;
}
export async function prepareSkinImport(bundle: SkinBundle, project: CanonicalProject, choices: Readonly<Record<string, SkinAssetChoice>>, reader: AssetLibraryReader | null, signal?: AbortSignal, portraitChoices: Readonly<Record<string, string>> = defaultSkinPortraitChoices(bundle, project)): Promise<SkinImportPlan> {
  const appearance = mappedPortraits(bundle, project, choices, portraitChoices), required = new Set(referenceIds(appearance));
  const inputs: AssetImportInput[] = [], mapping = new Map<string, string>(), verified = new Map<BlobDigest, Uint8Array>(), records: WebAssetSourceRecord[] = [];
  const ids = new Set(project.assets.assets.map(row => String(row.assetId ?? row.id)));
  let previewProject = project;
  let totalBytes = 0;
  for (const asset of bundle.assets.filter(row => required.has(row.assetId))) {
    signal?.throwIfAborted(); const choice = choices[asset.assetId];
    if (!choice) throw Error(`请为“${asset.displayName}”选择包内文件、已有素材、替代文件或可读回退。`);
    if (choice.mode === "fallback") { mapping.set(asset.assetId, ""); continue; }
    let bytes: Uint8Array | null | undefined, mimeType = asset.source.mimeType, existing: JsonObject | undefined;
    if (choice.mode === "existing") { existing = skinAssetCandidates(project, asset).find(row => (row.assetId ?? row.id) === choice.assetId); if (!existing) throw Error("选中的已有素材已变化，请重新对应。"); const source = existing.source as JsonObject; mimeType = String(source.mimeType); bytes = await reader?.read(String(source.digest) as BlobDigest); if (!bytes || bytes.byteLength !== source.byteLength || await browserBlobDigest(bytes) !== source.digest) throw Error(`已有素材“${String(existing.displayName)}”缺失或损坏，请选择包内或替代文件。`); }
    else if (choice.mode === "package") bytes = bundle.blobs.get(asset.source.digest);
    else { bytes = choice.bytes; mimeType = choice.mimeType; }
    if (!bytes || bytes.byteLength > (asset.kind === "font" ? 32 : 8) * 1024 * 1024) throw Error(`素材“${asset.displayName}”缺失或超出大小限制。`);
    totalBytes += bytes.byteLength; if (totalBytes > 64 * 1024 * 1024) throw Error("选用的皮肤素材合计超过 64 MB，请缩小或选择回退。");
    const checked = await inspectAssetBytes(bytes.slice(), mimeType, asset.kind, signal), digest = await browserBlobDigest(checked.bytes);
    if (asset.kind === "cg" && (!checked.report.width || !checked.report.height || checked.report.width * checked.report.height > 4_194_304 || !["image/png", "image/jpeg", "image/webp"].includes(checked.report.detectedMimeType))) throw Error("皮肤图片最多 400 万像素，仅支持 PNG/JPEG/WebP。");
    if (!existing && choice.mode === "package" && digest !== asset.source.digest) throw Error("包内素材摘要已变化，请重新导入皮肤包。");
    let id: string;
    const already = inputs.find(input => verified.has(digest) && (previewProject.assets.assets.find(row => row.assetId === input.assetId)?.source as JsonObject | undefined)?.digest === digest && input.kind === asset.kind);
    if (existing) id = String(existing.assetId ?? existing.id);
    else if (already) id = already.assetId;
    else {
      const base = `skin_${digest.slice(7, 27)}`; id = base; let serial = 1; while (ids.has(id)) id = `${base}_${++serial}`; ids.add(id);
      const input: AssetImportInput = { assetId: id, displayName: choice.mode === "file" && digest !== asset.source.digest ? choice.name.slice(0, 200) : asset.displayName, kind: asset.kind, bytes: checked.bytes, mimeType: checked.report.detectedMimeType, tags: ["皮肤"], preservedFields: { inspection: mediaInspectionToJson(checked.report) } };
      inputs.push(input);
      previewProject = { ...previewProject, assets: { ...previewProject.assets, assets: [...previewProject.assets.assets, { assetId: id, kind: input.kind, displayName: input.displayName, source: { digest, byteLength: checked.bytes.byteLength, mimeType: input.mimeType }, assetIndexMetadata: input.preservedFields! }] } };
    }
    mapping.set(asset.assetId, id); verified.set(digest, checked.bytes);
    const record = bundle.records.find(row => row.assetId === asset.assetId && row.digest === digest);
    if (!records.some(row => row.assetId === id)) records.push(record ? { ...record, assetId: id, permission: "pending" } : newWebAssetSourceRecord(id, digest));
  }
  signal?.throwIfAborted();
  const plan = { baseProjectId: project.manifest.projectId, baseAssets: JSON.stringify(project.assets), baseAppearance: JSON.stringify(project.ui.preservedFields?.webPlayerAppearance ?? null), appearance: remapAppearance(appearance, (project.ui.preservedFields?.webPlayerAppearance as unknown as WebPlayerAppearance | undefined) ?? DEFAULT_WEB_PLAYER_APPEARANCE, mapping), inputs, mappings: mapping, records, publicCredits: bundle.publicCredits };
  previewProject = applySkinImportPlan(previewProject, plan);
  return { ...plan, previewProject, reader: { read: digest => verified.has(digest) ? Promise.resolve(verified.get(digest)!) : reader?.read(digest) ?? Promise.resolve(null) } };
}

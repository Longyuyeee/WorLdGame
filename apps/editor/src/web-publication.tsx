import { useEffect, useState } from "react";
import type { CanonicalProject, JsonObject } from "@world-studio/project-domain";
import type { BlobDigest } from "@world-studio/project-persistence";
import { WebSaveCompatibilitySettings } from "./WebSaveCompatibilitySettings";

export interface WebPublication { readonly name: string; readonly version: string; readonly iconAssetId: string; }
export function readWebPublication(project: CanonicalProject): WebPublication {
  const value = project.manifest.preservedFields?.webPublication as JsonObject | undefined;
  return { name: typeof value?.name === "string" ? value.name : project.manifest.title, version: typeof value?.version === "string" ? value.version : "1.0.0", iconAssetId: typeof value?.iconAssetId === "string" ? value.iconAssetId : "" };
}
export function applyWebPublication(project: CanonicalProject, value: WebPublication): CanonicalProject {
  const name = value.name.trim(), version = value.version.trim();
  if (!name || name.length > 100) throw new Error("发布名称需要 1–100 个字符。");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version)) throw new Error("版本需要 1–64 个字母、数字、点、短横线或下划线，例如 1.0.0。");
  if (value.iconAssetId && !project.assets.assets.some(asset => String(asset.assetId ?? asset.id) === value.iconAssetId && (asset.source as JsonObject | undefined)?.mimeType === "image/png")) throw new Error("图标素材不存在或不是 PNG，请重新选择或恢复默认图标。");
  return { ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields, webPublication: { schemaVersion: 1, name, version, iconAssetId: value.iconAssetId } } } };
}
export function publicationIconSize(bytes: Uint8Array): number {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) throw new Error("发布图标不是有效 PNG，请重新导入。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width !== height || width < 192 || width > 2048) throw new Error("发布图标需为 192–2048 像素的正方形 PNG，建议 512×512；请更换素材或恢复默认图标。");
  return width;
}
export function WebPublicationSettings({ project, onChange, onDirtyChange, reader }: { project: CanonicalProject; onChange: (project: CanonicalProject) => void; onDirtyChange: (dirty: boolean) => void; reader: { read(digest: BlobDigest): Promise<Uint8Array | null> } | null }) {
  const saved = readWebPublication(project);
  const [draft, setDraft] = useState(saved);
  const [message, setMessage] = useState("");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const source = project.assets.assets.find(asset => String(asset.assetId ?? asset.id) === draft.iconAssetId)?.source as JsonObject | undefined;
  const iconDigest = typeof source?.digest === "string" ? source.digest : undefined;
  useEffect(() => {
    let active = true, url: string | undefined;
    setIconUrl(null);
    if (reader && iconDigest) void reader.read(iconDigest as BlobDigest).then(bytes => {
      if (!active || !bytes) return;
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })); setIconUrl(url);
    }).catch(() => { if (active) setMessage("图标暂时无法读取，请重新导入素材或恢复默认图标。"); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [reader, iconDigest]);
  useEffect(() => { setDraft({ name: saved.name, version: saved.version, iconAssetId: saved.iconAssetId }); }, [saved.name, saved.version, saved.iconAssetId]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const icons = project.assets.assets.filter(asset => (asset.source as JsonObject | undefined)?.mimeType === "image/png");
  return <fieldset style={{ minWidth: 0, display: "grid", gap: 8 }}><legend>作品发布设置</legend>
    <label>发布名称<input aria-label="发布名称" value={draft.name} maxLength={100} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>发布版本<input aria-label="发布版本" value={draft.version} maxLength={64} onChange={event => setDraft({ ...draft, version: event.target.value })} /></label>
    <label>发布图标<select aria-label="发布图标" value={draft.iconAssetId} onChange={event => setDraft({ ...draft, iconAssetId: event.target.value })}><option value="">默认 WorLd 图标</option>{draft.iconAssetId && !icons.some(asset => String(asset.assetId ?? asset.id) === draft.iconAssetId) && <option value={draft.iconAssetId}>素材已缺失，请重新选择</option>}{icons.map(asset => <option key={String(asset.assetId ?? asset.id)} value={String(asset.assetId ?? asset.id)}>{String(asset.displayName ?? asset.assetId ?? asset.id)}</option>)}</select></label>
    <small>名称用于玩家标题和安装名称，不改变工程名称。图标请先在资源生产流水线导入正方形 PNG（192–2048 像素，建议 512×512）。设置随工程保存。</small>
    {iconUrl && <img src={iconUrl} alt="发布图标预览" width={64} height={64} style={{ objectFit: "contain" }} />}
    <div><button type="button" disabled={!dirty} onClick={() => { try { onChange(applyWebPublication(project, draft)); setMessage("发布设置已应用，请保存工程；重新构建后生效。"); } catch (error) { setMessage((error as Error).message); } }}>应用发布设置</button> <button type="button" disabled={!dirty} onClick={() => { setDraft(saved); setMessage(""); }}>放弃修改</button></div>
    {dirty && <p>发布设置尚未应用，请先应用或放弃修改再构建。</p>}{message && <p role="status">{message}</p>}
    <WebSaveCompatibilitySettings project={project} dirty={dirty} onChange={onChange} />
  </fieldset>;
}

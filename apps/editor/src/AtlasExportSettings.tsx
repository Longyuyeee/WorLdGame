import { useEffect, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import { atlasExportGroups, setAtlasExportGroups } from "./atlas-export";
import { nativeAtlasEnabled, setNativeAtlas } from "./native-atlas-export";

export function AtlasExportSettings({ project, reader, disabled, onChange }: { project: CanonicalProject; disabled: boolean; onChange(project: CanonicalProject): void;
  reader: { loadLifecycle(): Promise<{ readonly roots: readonly { readonly rootId: string; readonly digests?: readonly string[] }[]; readonly nodes?: readonly { readonly digest: string; readonly parents: readonly string[] }[] }> } | null }) {
  const [available, setAvailable] = useState<string[]>([]), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const [matches, setMatches] = useState<Record<string, string[]>>({});
  const selected = atlasExportGroups(project);
  useEffect(() => {
    let active = true; setAvailable([]); setMatches({}); setError("");
    void reader?.loadLifecycle().then(manifest => {
      if (!active) return;
      const roots = manifest.roots.filter(root => root.rootId.startsWith("build:dicing:"));
      setAvailable(roots.map(root => root.rootId.slice(13)));
      setMatches(Object.fromEntries(roots.map(root => {
        const parents = new Set((manifest.nodes ?? []).filter(node => root.digests?.includes(node.digest)).flatMap(node => node.parents));
        const names = project.assets.assets.filter(asset => { const source = asset.source as { readonly digest?: unknown } | null; return source && typeof source.digest === "string" && parents.has(source.digest); }).map(asset => String(asset.displayName ?? asset.assetId ?? asset.id));
        return [root.rootId.slice(13), names];
      })));
    }).catch(() => { if (active) setError("派生列表不可读；可取消选择并使用原素材构建。"); });
    return () => { active = false; };
  }, [reader, refresh, project.assets]);
  return <fieldset aria-label="Atlas 兼容导出设置" style={{ minWidth: 0 }}><legend>Atlas 交付设置</legend>
    <label><input type="checkbox" aria-label="原生 Atlas 绘制与离线原图回退" checked={nativeAtlasEnabled(project)} disabled={disabled} onChange={event=>onChange(setNativeAtlas(project,event.target.checked))} />原生 Atlas 绘制与离线原图回退</label>
    <small>开启后所选组用于 Preview/正式 Player 的图块绘制。计入压缩原图回退包和清单后无净收益则保留普通素材；Canvas 与图集有额外内存，不保证降低 GPU 内存。</small>
    <small>选择已发布组，构建时核对当前原图。未开启原生绘制时重建普通 PNG，仅采用像素一致且更小的文件；重建文件不复制元数据。原源文件保留，最多选择 8 组。</small>
    <button type="button" disabled={disabled} onClick={() => setRefresh(value => value + 1)}>刷新已发布 Atlas 组</button>
    {[...new Set([...selected, ...available])].map(id => <label key={id} style={{ display: "block", overflowWrap: "anywhere" }}><input type="checkbox" aria-label={`Atlas 兼容导出组：${id}`} checked={selected.includes(id)} disabled={disabled || (!selected.includes(id) && selected.length >= 8)} onChange={event => onChange(setAtlasExportGroups(project, event.target.checked ? [...selected, id] : selected.filter(value => value !== id)))} />{id}{available.includes(id) ? "" : "（本机派生缺失，构建将回退）"}<small style={{ display: "block" }}>当前源文件匹配：{matches[id]?.join("、") || "暂无，构建时将重新校验"}</small></label>)}
    {available.length === 0 && <p>暂无本机已发布组。请到资源保险库分析并发布有收益的 Atlas；工程 ZIP 保留原图，换电脑后需重新生成派生。</p>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}

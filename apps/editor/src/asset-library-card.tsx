import { useEffect, useRef, useState } from "react";
import type { AssetIndexEntry, BlobDigest } from "@world-studio/project-persistence";
import { assetInspectionPassed } from "./production-workspace";

export interface AssetLibraryReader { read(digest: BlobDigest): Promise<Uint8Array | null>; }
function useAssetImage(entry: AssetIndexEntry | undefined, reader: AssetLibraryReader | null, visible: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true; let objectUrl: string | undefined;
    setUrl(null);
    if (visible && reader && entry && entry.source.byteLength <= 8 * 1024 * 1024 && assetInspectionPassed(entry) && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(entry.source.mimeType)) {
      void reader.read(entry.source.digest).then(bytes => {
        if (!active || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: entry.source.mimeType })); setUrl(objectUrl);
      }).catch(() => { /* A missing preview does not hide the asset or its status. */ });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, reader, entry?.source.digest, entry?.source.mimeType, entry?.source.byteLength, entry?.preservedFields]);
  return url;
}
export function AssetLibraryPreview({ entry, reader }: { readonly entry: AssetIndexEntry; readonly reader: AssetLibraryReader | null }) {
  const url = useAssetImage(entry, reader, true);
  return <div className="asset-detail-preview">{url ? <img src={url} alt={entry.displayName} /> : <span>{entry.kind === "audio" ? "♫" : "◇"}</span>}</div>;
}
export function AssetLibraryCard({ entry, reader, onOpen }: { readonly entry: AssetIndexEntry; readonly reader: AssetLibraryReader | null; readonly onOpen: () => void }) {
  const [visible, setVisible] = useState(false);
  const card = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(item => item.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "100px" });
    if (card.current) observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  const url = useAssetImage(entry, reader, visible);
  const labels: Record<string, string> = { background: "背景", character: "角色立绘", cg: "CG", audio: "音频", video: "视频", font: "字体", ui: "界面", other: "其他" };
  return <button type="button" ref={card} className="asset-library-card" data-asset-kind={entry.kind} aria-label={`管理素材：${entry.displayName}`} onClick={onOpen}><div className="asset-library-card__preview">{url ? <img src={url} alt={entry.displayName} loading="lazy" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={entry.kind === "audio" ? "M9 18V5l10-2v13 M9 7l10-2 M9 18c0 3-6 3-6 0s6-3 6 0 M19 16c0 3-6 3-6 0s6-3 6 0" : "M3 4h18v16H3z M3 16l6-6 5 5 3-3 4 5 M16 8h.01"} /></svg>}<span className="asset-kind-badge">{labels[entry.kind]}</span></div><div className="asset-library-card__caption"><strong>{entry.displayName}</strong><span>{labels[entry.kind]} · {(entry.source.byteLength / 1024).toFixed(1)} KB</span><small>{assetInspectionPassed(entry) ? "已通过检查" : "需要检查"}</small></div></button>;
}

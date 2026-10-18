import { useEffect, useRef, useState } from "react";
import { type AssetIndexEntry, type BlobDigest } from "@world-studio/project-persistence";
import { browserBlobDigest } from './browser-blob-digest';
import { assetInspectionPassed } from "./production-workspace";
import { AssetAudioPreview } from './asset-audio-preview';

export interface AssetLibraryReader { read(digest: BlobDigest): Promise<Uint8Array | null>; }
function useAssetImage(entry: AssetIndexEntry | undefined, reader: AssetLibraryReader | null, visible: boolean, attempt = 0) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('正在准备图片…');
  useEffect(() => {
    let active = true; let objectUrl: string | undefined;
    setUrl(null); setStatus('正在准备图片…');
    if (visible && reader && entry && entry.source.byteLength <= 8 * 1024 * 1024 && assetInspectionPassed(entry) && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(entry.source.mimeType)) {
      void reader.read(entry.source.digest).then(async bytes => {
        if (!active) return;
        if (!bytes || bytes.length !== entry.source.byteLength || await browserBlobDigest(bytes) !== entry.source.digest) throw Error('图片缺失或不完整');
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: entry.source.mimeType })); setUrl(objectUrl); setStatus('当前文件图片预览，不会修改故事中的画面。');
      }).catch(() => { if (active) setStatus('图片读取失败，可重试或重新导入素材。'); });
    } else setStatus('图片预览暂不可用。仅预览已检查、8 MB 以内的 PNG、JPEG、WebP 或 GIF；可在素材页检查文件。');
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, reader, entry?.source.digest, entry?.source.mimeType, entry?.source.byteLength, entry?.preservedFields, attempt]);
  return { url, status };
}
export function AssetLibraryPreview({ entry, reader }: { readonly entry: AssetIndexEntry; readonly reader: AssetLibraryReader | null }) {
  if (entry.kind === "audio") return <AssetAudioPreview entry={entry} reader={reader} />;
  return <AssetImagePreview entry={entry} reader={reader} />;
}
function AssetImagePreview({ entry, reader }: { readonly entry: AssetIndexEntry; readonly reader: AssetLibraryReader | null }) {
  const [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
  const { url, status } = useAssetImage(entry, reader, true, attempt);
  useEffect(() => { setFailed(false); }, [url]);
  return <div className="asset-image-preview">
    <div className="asset-detail-preview">{url && !failed ? <img src={url} alt={entry.displayName} onError={() => setFailed(true)} /> : <span aria-hidden="true">◇</span>}</div>
    <p role="status">{failed ? '图片无法显示，可重试或重新导入支持的格式。' : status}</p>
    <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重新准备图片预览</button>
  </div>;
}
export function AssetLibraryCard({ entry, reader, onOpen, actionLabel, selected, disabled }: { readonly entry: AssetIndexEntry; readonly reader: AssetLibraryReader | null; readonly onOpen: () => void; readonly actionLabel?: string; readonly selected?: boolean; readonly disabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  const card = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(item => item.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "100px" });
    if (card.current) observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  const { url } = useAssetImage(entry, reader, visible);
  const labels: Record<string, string> = { background: "背景", character: "角色立绘", cg: "CG", audio: "音频", video: "视频", font: "字体", ui: "界面", other: "其他" };
  return <button type="button" ref={card} className="asset-library-card" disabled={disabled} data-asset-kind={entry.kind} aria-label={actionLabel ?? `管理素材：${entry.displayName}`} aria-pressed={selected} onClick={onOpen}><div className="asset-library-card__preview">{url ? <img src={url} alt={entry.displayName} loading="lazy" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={entry.kind === "audio" ? "M9 18V5l10-2v13 M9 7l10-2 M9 18c0 3-6 3-6 0s6-3 6 0 M19 16c0 3-6 3-6 0s6-3 6 0" : "M3 4h18v16H3z M3 16l6-6 5 5 3-3 4 5 M16 8h.01"} /></svg>}<span className="asset-kind-badge">{labels[entry.kind]}</span></div><div className="asset-library-card__caption"><strong>{entry.displayName}</strong><span>{labels[entry.kind]} · {(entry.source.byteLength / 1024).toFixed(1)} KB</span><small>{assetInspectionPassed(entry) ? "已通过检查" : "需要检查"}</small></div></button>;
}

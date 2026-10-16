import { useEffect, useMemo, useRef, useState } from "react";
import { webPlayerSkinReferences, webPlayerFontAssets, readWebPlayerAppearance, WEB_PLAYER_SCREEN_LABELS, type WebPlayerScreenId, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import type { BlobDigest } from "@world-studio/project-persistence";
import type { AssetLibraryReader } from "./asset-library-card";
import { browserBlobDigest } from "./browser-blob-digest";

export type SkinPreviewSurface = "title" | "reading" | "choice" | WebPlayerScreenId;
export function skinPreviewProject(project: CanonicalProject, surface: SkinPreviewSurface, previewId: string): CanonicalProject | null {
  const all = project.scenes.flatMap(scene => project.scripts[scene.id]?.statements ?? []);
  const sample = surface === "choice" ? all.find(item => item.kind === "choice") : all.find(item => item.kind === "dialogue") ?? all.find(item => item.kind === "narration");
  if ((surface === "reading" || surface === "choice") && !sample) return null;
  const scene = project.scenes.find(item => item.id === project.manifest.entrySceneId) ?? project.scenes[0];
  const chapter = project.chapters[0];
  if (!scene || !chapter) return null;
  const background = all.find(item => item.kind === "direction" && item.command === "background" && /\basset=/u.test(String(item.summary)));
  const character = all.find(item => item.kind === "direction" && item.command === "show" && /\basset=/u.test(String(item.summary)));
  const cues = [background, character].filter(item => !!item);
  // Choices must lead to a reachable ending, rather than looping to the sample.
  const exitId = scene.id === "skin_preview_exit" ? "skin_preview_exit_2" : "skin_preview_exit";
  const ending = { id: "skin_preview_end", kind: "end", endingName: surface === "ending" ? String(all.find(item => item.kind === "end")?.endingName ?? "故事结束") : "外观片段预览完成" };
  const sampleContent = surface === "ending" ? [] : sample ? [{ ...sample, ...(sample.kind === "choice" && Array.isArray(sample.options) ? { options: sample.options.map((option, index) => { const item = option as JsonObject; return { id: String(item.id ?? `skin_preview_option_${index}`), label: String(item.label ?? "选项"), targetSceneId: exitId }; }) } : {}) }] : [{ id: "skin_preview_line", kind: "narration", textId: "skin_preview_words", text: "在这里预览游戏界面。写下正文后，将显示作品中的片段。" }];
  const statements = [...cues, ...sampleContent, ...(surface === "choice" ? [] : [ending])];
  const scenes = [{ ...scene, title: "外观片段预览" }, ...(surface === "choice" ? [{ ...scene, id: exitId, title: "外观预览完成", scriptPath: `scripts/${exitId}.json`, layoutPath: `layouts/${exitId}.json` }] : [])];
  const scripts = { [scene.id]: { schemaVersion: 1 as const, sceneId: scene.id, statements }, ...(surface === "choice" ? { [exitId]: { schemaVersion: 1 as const, sceneId: exitId, statements: [ending] } } : {}) };
  return { ...project, manifest: { ...project.manifest, projectId: previewId, entrySceneId: scene.id }, chapters: [{ ...chapter, scenePaths: scenes.map(item => `scenes/${item.id}.json`) }], scenes, scripts, layouts: Object.fromEntries(scenes.map(item => [item.id, { schemaVersion: 1 as const, sceneId: item.id, nodes: [] }])), testRoutes: { schemaVersion: 1, routes: [] }, ui: { ...project.ui, screens: [] } };
}

export function PlayerSkinPreview({ project, reader, surface, setSurface, storyPreview }: { readonly project: CanonicalProject | null; readonly reader: AssetLibraryReader | null; readonly surface: SkinPreviewSurface; readonly setSurface: (surface: SkinPreviewSurface) => void; readonly storyPreview?: CanonicalProject | null }) {
  const previewId = useRef(`skin_preview_${Math.random().toString(36).slice(2)}`);
  const [runtime, setRuntime] = useState<{ javascript: string; css: string } | null>(null);
  const [media, setMedia] = useState<readonly { assetId: string; displayName: string; mimeType: string; url: string }[]>([]);
  const [assetError, setAssetError] = useState("");
  const [device, setDevice] = useState("desktop"), [replay, setReplay] = useState(0), [expanded, setExpanded] = useState(false);
  const [document, setDocument] = useState("");
  const holder = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [width, setWidth] = useState(440);
  const [viewportHeight, setViewportHeight] = useState(() => typeof window === "undefined" ? 900 : window.innerHeight);
  useEffect(() => { const resize = () => setViewportHeight(window.innerHeight); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  const preview = useMemo(() => storyPreview !== undefined ? storyPreview ? { ...storyPreview, manifest: { ...storyPreview.manifest, projectId: previewId.current } } : null : project ? skinPreviewProject(project, surface, previewId.current) : null, [project, surface, storyPreview]);
  useEffect(() => { let active = true; void import("virtual:world-player-export").then(result => { if (active) setRuntime(result.default); }).catch(() => { if (active) setAssetError("播放器暂时无法加载，请刷新后重试。"); }); return () => { active = false; }; }, []);
  const appearance = project ? readWebPlayerAppearance(project) : null;
  const sampleIds = preview ? Object.values(preview.scripts).flatMap(script => script.statements.flatMap(item => item.kind === "direction" ? [String(item.summary).match(/\basset=([A-Za-z0-9_-]+)/u)?.[1] ?? ""] : [])) : [];
  // Let the formal Player make the same locale-based automatic font selection as an export.
  const automaticFontIds = project && (appearance?.skin?.fonts.body ?? "inherit") === "inherit" ? webPlayerFontAssets(project).map(asset => String(asset.assetId ?? asset.id)) : [];
  const ids = new Set([appearance?.coverAssetId ?? "", ...(appearance?.skin ? webPlayerSkinReferences(appearance.skin) : []), ...automaticFontIds, ...sampleIds].filter(Boolean));
  const assets = project?.assets.assets.filter(asset => ids.has(String(asset.assetId ?? asset.id))) ?? [];
  const assetKey = JSON.stringify(assets);
  useEffect(() => {
    let active = true; const urls: string[] = [];
    setMedia([]); setAssetError("");
    const load = async () => {
      if (assets.length && !reader) throw Error("请在已打开的工程中预览素材。");
      if (assets.reduce((total, asset) => total + Number((asset.source as JsonObject | undefined)?.byteLength ?? 0), 0) > 64 * 1024 * 1024) throw Error("预览素材合计超过 64 MB，请缩小图片或字体后再预览。");
      const loaded = [];
      for (const asset of assets) {
        const source = asset.source as JsonObject | undefined;
        if (!source || typeof source.digest !== "string" || typeof source.mimeType !== "string") throw Error("预览素材信息不完整，请重新导入。");
        const bytes = await reader!.read(source.digest as BlobDigest);
        if (!active) return;
        if (!bytes || bytes.byteLength !== source.byteLength || await browserBlobDigest(bytes) !== source.digest) throw Error(`素材“${String(asset.displayName ?? asset.assetId)}”缺失或已损坏，请重新导入。`);
        if (!active) return;
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: source.mimeType })); urls.push(url);
        loaded.push({ assetId: String(asset.assetId ?? asset.id), displayName: String(asset.displayName ?? asset.assetId), mimeType: source.mimeType, url });
      }
      if (active) setMedia(loaded);
    };
    void load().catch(error => { if (active) setAssetError((error as Error).message); });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [assetKey, reader]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!preview || !runtime || assetError || media.length !== assets.length) { setDocument(""); return; }
      const payload = JSON.stringify({ project: preview, mediaAssets: media, editorPreview: { autoStart: !["title", "preferences", "credits", "additional"].includes(surface), ...(Object.hasOwn(WEB_PLAYER_SCREEN_LABELS, surface) ? { initialPanel: surface } : {}) } }).replaceAll("<", "\\u003c");
      setDocument(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${runtime.css.replace(/<\/style/giu, "<\\/style")}</style></head><body><div id="player-root"></div><script id="world-project" type="application/json">${payload}</script><script>${runtime.javascript.replace(/<\/script/giu, "<\\/script")}</script></body></html>`);
    }, 350);
    return () => clearTimeout(timer);
  }, [preview, runtime, media, assetError, replay]);
  useEffect(() => {
    const element = holder.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 440)); observer.observe(element); return () => observer.disconnect();
  }, [expanded]);
  useEffect(() => { if (expanded && !dialog.current?.open) dialog.current?.showModal(); }, [expanded]);
  const designWidth = device === "phone" ? 390 : 960, designHeight = device === "phone" ? 740 : 620, scale = Math.min(1, width / designWidth, expanded ? Math.max(280, viewportHeight - 270) / designHeight : 1);
  const content = <div className="skin-preview-content">
    <header><div><strong>真实播放器预览</strong><small>{storyPreview !== undefined ? "当前动效草稿" : "当前外观草稿"} · 静音 · 不计入结局试玩</small></div><button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "收起预览" : "放大预览"}</button></header>
    <div className="skin-preview-tools">
      {storyPreview !== undefined ? <span>当前剧情片段</span> : <select aria-label="外观预览页面" value={surface} onChange={event => setSurface(event.target.value as SkinPreviewSurface)}><option value="title">标题画面</option><option value="reading">阅读对白</option><option value="choice">分支选项</option>{Object.entries(WEB_PLAYER_SCREEN_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>}
      <select aria-label="外观预览设备" value={device} onChange={event => setDevice(event.target.value)}><option value="desktop">桌面</option><option value="phone">手机</option></select><button type="button" onClick={() => setReplay(replay + 1)}>重播效果</button>
    </div>
    <div ref={holder} className="skin-preview-holder"><div className="skin-preview-frame" style={{ height: designHeight * scale, width: designWidth * scale, marginInline: "auto" }}>
      {document ? <iframe key={`${device}:${replay}`} title="游戏界面真实预览" sandbox="allow-scripts allow-same-origin" srcDoc={document} style={{ width: designWidth, height: designHeight, transform: `scale(${scale})`, transformOrigin: "top left" }} /> : <p role="status">{assetError || (!project ? "修正参数后可继续预览。" : !preview ? storyPreview !== undefined ? "请先修正左侧动效与目标步骤。" : "先在故事中添加一段对白或选择，再预览这个页面。" : "正在准备静音预览…")}</p>}
    </div></div>
    <p className="skin-preview-note">使用正式播放器显示作品片段与页面。预览存档仅临时保留，完整剧情与结局进度请回到故事试玩。</p>
  </div>;
  return <aside className="skin-preview">{expanded ? <dialog ref={dialog} className="skin-preview-dialog" aria-label="放大外观预览" onCancel={() => setExpanded(false)}>{content}</dialog> : content}</aside>;
}

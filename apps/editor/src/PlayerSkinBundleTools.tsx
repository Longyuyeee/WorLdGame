import { useEffect, useRef, useState } from "react";
import { readWebCredits, type CanonicalProject, type WebPlayerAppearance } from "@world-studio/project-domain";
import type { AssetLibraryReader } from "./asset-library-card";
import { AssetBlobError } from "@world-studio/project-persistence";
import { batchImportError } from "./asset-batch-import";
import { readAssetFile } from "./asset-file-import";
import { PlayerSkinPreview, type SkinPreviewSurface } from "./player-skin-preview";
import { defaultSkinChoices, exportSkinBundle, prepareSkinImport, readSkinBundle, skinAssetCandidates, skinBundleAssets, SKIN_BUNDLE_MAX_BYTES, type SkinAssetChoice, type SkinBundle, type SkinImportPlan } from "./player-skin-bundle";
import "./styles/player-skin-bundle.css";
export type CommitSkinImport = (plan: SkinImportPlan, signal: AbortSignal) => Promise<CanonicalProject>;
export function PlayerSkinBundleTools({ project, appearance, name, reader, importBlocked, onCommit, onBlockingChange }: {
  readonly project: CanonicalProject; readonly appearance: WebPlayerAppearance; readonly name: string; readonly reader: AssetLibraryReader | null;
  readonly importBlocked: boolean; readonly onCommit?: CommitSkinImport | undefined; readonly onBlockingChange: (blocked: boolean) => void;
}) {
  const [mode, setMode] = useState<"export" | SkinBundle | null>(null), [message, setMessage] = useState(""), [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { onBlockingChange(!!mode || loading); }, [mode, loading, onBlockingChange]);
  useEffect(() => () => { controller.current?.abort(); onBlockingChange(false); }, [onBlockingChange]);
  return <section className="skin-bundle-tools" aria-label="携带素材的皮肤复用"><h4>带上图片和字体一起复用</h4><p>皮肤包会携带所选封面、窗体与明确指定的字体，导入前先对应、检查并静音预览。</p>
    <button type="button" disabled={loading} onClick={() => setMode("export")}>导出皮肤与素材</button>
    <label>导入皮肤与素材<input aria-label="导入皮肤与素材" type="file" accept=".zip,application/zip" disabled={loading || importBlocked || !onCommit} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      if (file.size > SKIN_BUNDLE_MAX_BYTES) { setMessage("皮肤包最大 64 MB 素材加 512 KB 说明，请缩小素材后重新导出。"); return; }
      const c = new AbortController(); controller.current = c; setLoading(true); setMessage("正在读取皮肤包，工程尚未改变…");
      void readAssetFile(file, { maxBytes: SKIN_BUNDLE_MAX_BYTES, signal: c.signal }).then(bytes => readSkinBundle(bytes, c.signal)).then(bundle => { setMode(bundle); setMessage(""); }).catch(error => setMessage((error as Error).message)).finally(() => { if (controller.current === c) controller.current = null; setLoading(false); });
    }} /></label>
    {loading && <button type="button" onClick={() => controller.current?.abort()}>停止读取皮肤包</button>}
    {importBlocked && <small>请先应用或放弃当前外观草稿，再导入另一套皮肤。</small>}
    <small>工程标题、简介、剧情与现有素材保留。同标识不同文件不会覆盖；导入的来源记录仍需复核发行条件。</small>
    {message && <p role="status">{message}</p>}
    {mode === "export" && <ExportSkinDialog project={project} appearance={appearance} name={name} reader={reader} onClose={() => setMode(null)} />}
    {mode && mode !== "export" && onCommit && <ImportSkinDialog key={mode.name} bundle={mode} project={project} reader={reader} onCommit={onCommit} onClose={() => setMode(null)} onDone={() => { setMode(null); setMessage("皮肤与素材已一起导入工程，请保存到本机。原剧情和作品信息保持不变。"); }} />}
  </section>;
}
function ExportSkinDialog({ project, appearance, name, reader, onClose }: { readonly project: CanonicalProject; readonly appearance: WebPlayerAppearance; readonly name: string; readonly reader: AssetLibraryReader | null; readonly onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), controller = useRef<AbortController | null>(null);
  const [credits, setCredits] = useState(() => readWebCredits(project).acknowledgements), [privateSources, setPrivateSources] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  let assets: ReturnType<typeof skinBundleAssets> = [], error = ""; try { assets = skinBundleAssets(project, appearance); } catch (e) { error = (e as Error).message; }
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  return <dialog ref={dialog} className="entity-edit-dialog skin-bundle-dialog skin-bundle-export" aria-label="导出带素材皮肤" onCancel={event => { if (busy) { event.preventDefault(); controller.current?.abort(); } else onClose(); }}><form onSubmit={event => {
    event.preventDefault(); if (busy || error) return; const c = new AbortController(); controller.current = c; setBusy(true); setMessage("正在校验文件并打包…");
    void exportSkinBundle(project, appearance, name, reader, credits, privateSources, c.signal).then(bytes => {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" })), anchor = document.createElement("a"); anchor.href = url; anchor.download = `${name.replace(/[<>:"/\\|?*]/g, "-").trim() || "我的游戏皮肤"}.worldskin.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("皮肤包已导出，包含配置与以下素材文件；这不是素材发行许可。");
    }).catch(e => setMessage(c.signal.aborted ? "已停止，工程未改变。" : (e as Error).message)).finally(() => setBusy(false));
  }}><h2>导出皮肤与素材</h2><p>只携带皮肤实际引用的图片与字体，不打包剧情、音乐或整个素材库。</p>
    <ul>{assets.map(asset => <li key={asset.assetId}>{asset.displayName} · {asset.kind === "font" ? "字体" : "图片"} · {(asset.source.byteLength / 1024).toFixed(0)} KB</li>)}</ul>
    {appearance.skin?.fonts.body === "inherit" && <p>正文保持自动字体选择，将跟随目标工程；如需固定字体，请先到字体页选择具体字体。</p>}
    <label>随包公开署名与许可<textarea aria-label="随包公开署名与许可" rows={6} maxLength={12000} value={credits} disabled={busy} onChange={e => setCredits(e.target.value)} /></label><small>默认显示本工程公开鸣谢，可删去无关部分；请保留所用素材要求的署名与许可。</small>
    <label className="skin-bundle-checkbox"><input aria-label="附带内部来源台账" type="checkbox" checked={privateSources} disabled={busy} onChange={e => setPrivateSources(e.target.checked)} />附带内部来源台账（可能含依据、审核人等信息，仅向可信协作者分享）</label>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <footer><button type="button" onClick={() => busy ? controller.current?.abort() : onClose()}>{busy ? "停止打包" : "关闭"}</button><button type="submit" disabled={busy || !!error}>生成皮肤包</button></footer>
  </form></dialog>;
}
function ImportSkinDialog({ bundle, project, reader, onCommit, onClose, onDone }: { readonly bundle: SkinBundle; readonly project: CanonicalProject; readonly reader: AssetLibraryReader | null; readonly onCommit: CommitSkinImport; readonly onClose: () => void; readonly onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), controller = useRef<AbortController | null>(null);
  const [choices, setChoices] = useState(defaultSkinChoices(bundle, project)), [plan, setPlan] = useState<SkinImportPlan | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("先确认每份素材如何对应，再检查并预览；此时不会写入工程。"), [surface, setSurface] = useState<SkinPreviewSurface>("title");
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  const choose = (id: string, value: SkinAssetChoice | undefined) => { setChoices(current => { const next = { ...current }; if (value) next[id] = value; else delete next[id]; return next; }); setPlan(null); setMessage("对应已变化，请重新检查并预览。"); };
  const run = async (commit: boolean) => {
    if (busy) return; const c = new AbortController(); controller.current = c; setBusy(true);
    try { if (commit) { if (!plan) return; setMessage("正在一次性保存皮肤所需素材…"); await onCommit(plan, c.signal); onDone(); }
      else { setMessage("正在核对摘要、文件类型和媒体预算…"); const prepared = await prepareSkinImport(bundle, project, choices, reader, c.signal); setPlan(prepared); setMessage(`检查通过：新增 ${prepared.inputs.length} 项素材；确认导入前仍只在内存预览。来源记录在工程中保持待复核。`); }
    } catch (e) { setPlan(null); setMessage(c.signal.aborted ? "已停止，未完成的提交不算成功；可重新检查后再试。" : batchImportError(e instanceof AssetBlobError ? e.code : undefined, (e as Error).message)); }
    finally { if (controller.current === c) controller.current = null; setBusy(false); }
  };
  return <dialog ref={dialog} className="entity-edit-dialog skin-bundle-dialog skin-bundle-import" aria-label="对应皮肤素材并预览" onCancel={event => { event.preventDefault(); if (busy) controller.current?.abort(); else setMessage("皮肤尚未导入，请确认导入，或点击取消导入放弃这次对应。"); }}>
    <header><h2>把“{bundle.name}”带到当前作品</h2><p>只更新皮肤、所需素材与相关来源/公开署名，保留本作品的标题、简介、剧情和现有文件。</p></header>
    <div className="skin-bundle-import-layout"><div className="skin-bundle-mapping">
      {bundle.assets.map(asset => {
        const selected = choices[asset.assetId], available = bundle.blobs.has(asset.source.digest), candidates = skinAssetCandidates(project, asset), conflict = project.assets.assets.some(row => (row.assetId ?? row.id) === asset.assetId && (row.source as JsonObjectLike | undefined)?.digest !== asset.source.digest);
        const value = !selected ? "" : selected.mode === "existing" ? `existing:${selected.assetId}` : selected.mode;
        return <fieldset key={asset.assetId}><legend>{asset.displayName} · {asset.kind === "font" ? "字体" : "图片"}</legend><p>{available ? "包内文件已核对摘要" : "包内缺少文件，请选已有素材、补齐文件或选择回退"}{conflict ? "；原标识已有不同内容，将保留原文件" : ""}</p>
          <label>对应方式<select aria-label={`对应素材：${asset.displayName}`} value={value} disabled={busy} onChange={e => choose(asset.assetId, !e.target.value ? undefined : e.target.value.startsWith("existing:") ? { mode: "existing", assetId: e.target.value.slice(9) } : { mode: e.target.value as "package" | "fallback" })}><option value="">请先选择…</option>{available && <option value="package">使用包内文件（不覆盖已有素材）</option>}{candidates.map(row => <option key={String(row.assetId ?? row.id)} value={`existing:${String(row.assetId ?? row.id)}`}>已有：{String(row.displayName ?? row.assetId)} · {String((row.source as JsonObjectLike)?.digest).slice(7, 15)}</option>)}{selected?.mode === "file" && <option value="file">替代文件：{selected.name}</option>}<option value="fallback">{asset.kind === "font" ? "使用系统黑体" : "不使用这张图片"}</option></select></label>
          <label>补齐或替代文件<input aria-label={`替代文件：${asset.displayName}`} type="file" accept={asset.kind === "font" ? ".woff,.woff2,.ttf,.otf" : ".png,.jpg,.jpeg,.webp"} disabled={busy} onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            const selectedBytes = Object.entries(choices).reduce((sum, [id, item]) => sum + (id !== asset.assetId && item.mode === "file" ? item.bytes.byteLength : 0), 0);
            if (file.size + selectedBytes > 64 * 1024 * 1024) { setMessage("替代文件合计最多 64 MB，请缩小文件或使用已有素材。"); return; }
            const c = new AbortController(); controller.current = c; setBusy(true);
            void readAssetFile(file, { maxBytes: (asset.kind === "font" ? 32 : 8) * 1024 * 1024, signal: c.signal }).then(bytes => choose(asset.assetId, { mode: "file", name: file.name, mimeType: file.type || "application/octet-stream", bytes })).catch(e => setMessage((e as Error).message)).finally(() => { if (controller.current === c) controller.current = null; setBusy(false); });
          }} /></label>
        </fieldset>;
      })}
      <details><summary>公开署名与来源记录</summary><p>以下公开文字会合并到本作品鸣谢，不替换原名单。包内 {bundle.records.length} 条来源记录仅保留在工程，导入后仍需确认发行条件。</p><pre>{bundle.publicCredits || "未附公开署名。请自行确认素材要求。"}</pre>{bundle.records.filter(row => row.evidence || row.source).map(row => <p key={row.assetId}>{bundle.assets.find(asset => asset.assetId === row.assetId)?.displayName}：{row.source} · {row.evidence} · {row.reviewedBy}</p>)}</details>
    </div><PlayerSkinPreview project={plan?.previewProject ?? null} reader={plan?.reader ?? reader} surface={surface} setSurface={setSurface} /></div>
    <p role="status">{message}</p><footer><button type="button" onClick={() => busy ? controller.current?.abort() : onClose()}>{busy ? "停止当前操作" : "取消导入"}</button><button type="button" disabled={busy} onClick={() => void run(false)}>检查并预览皮肤</button><button type="button" disabled={!plan || busy} onClick={() => void run(true)}>导入皮肤与素材到工程</button></footer>
  </dialog>;
}
type JsonObjectLike = { readonly digest?: unknown };

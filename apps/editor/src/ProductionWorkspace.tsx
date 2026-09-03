import { useEffect, useMemo, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import type {
  AssetIndex,
  AssetKind,
  AssetLifecycleManifest,
  LosslessDicingDiscoveryReport
} from "@world-studio/project-persistence";
import {
  assetInspectionPassed,
  createProductionWorkspaceModel
} from "./production-workspace";
import {
  addLocalizationTarget,
  localizationSourceEntries,
  localizationTranslations,
  normalizeLocaleTag,
  targetLocales,
  updateLocalizationTranslation,
  type LocalizationReviewStatus
} from "./localization-production";
import {
  applyLocalizationImport,
  encodeLocalizationCsv,
  localizationExchangeMatrix,
  parseLocalizationCsv,
  previewLocalizationImport,
  type LocalizationImportPreview
} from "./localization-exchange";
import {
  bindLocalizationVisualAsset,
  bindLocalizationVoiceAsset,
  createLocalizationMediaProductionModel,
  type LocalizationMediaReviewStatus
} from "./localization-media-production";

type ProductionStorageStatus = "loading" | "unavailable" | "ready" | "importing" | "success" | "cancelled" | "error";

interface ProductionWorkspaceProps {
  readonly project: CanonicalProject;
  readonly index: AssetIndex;
  readonly lifecycle: AssetLifecycleManifest;
  readonly dicingReport: LosslessDicingDiscoveryReport | null;
  readonly storageStatus: ProductionStorageStatus;
  readonly onOpenPipeline: () => void;
  readonly onProjectChange: (project: CanonicalProject) => void;
}

const KIND_OPTIONS: readonly { readonly id: "all" | AssetKind; readonly label: string }[] = [
  { id: "all", label: "全部类型" },
  { id: "background", label: "背景" },
  { id: "character", label: "角色" },
  { id: "cg", label: "CG" },
  { id: "audio", label: "音频" },
  { id: "video", label: "视频" },
  { id: "font", label: "字体" },
  { id: "ui", label: "UI" },
  { id: "other", label: "其他" }
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadLocalizationFile(data: BlobPart, type: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readLocalizationFile(file: File, mode: "text"): Promise<string>;
function readLocalizationFile(file: File, mode: "arrayBuffer"): Promise<ArrayBuffer>;
function readLocalizationFile(file: File, mode: "text" | "arrayBuffer"): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    if (mode === "text") reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

const PHASE_STATE_LABEL = {
  blocked: "等待前置",
  current: "当前任务",
  ready: "等待审阅",
  complete: "已验证"
} as const;

export function ProductionWorkspace({
  project,
  index,
  lifecycle,
  dicingReport,
  storageStatus,
  onOpenPipeline,
  onProjectChange
}: ProductionWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | AssetKind>("all");
  const [sourceLocale, setSourceLocale] = useState(project.manifest.defaultLocale === "und" ? "" : project.manifest.defaultLocale);
  const locales = targetLocales(project);
  const [newTargetLocale, setNewTargetLocale] = useState("");
  const [selectedLocale, setSelectedLocale] = useState(locales[0] ?? "");
  const [localizationMessage, setLocalizationMessage] = useState("");
  const [importPreview, setImportPreview] = useState<LocalizationImportPreview | null>(null);
  const [exchangeBusy, setExchangeBusy] = useState(false);
  const mediaLocales = [project.manifest.defaultLocale, ...locales].filter((locale, index, values) => locale !== "und" && values.indexOf(locale) === index);
  const [mediaLocale, setMediaLocale] = useState(mediaLocales[0] ?? "");
  const [voiceDrafts, setVoiceDrafts] = useState<Readonly<Record<string, string>>>({});
  const [visualDrafts, setVisualDrafts] = useState<Readonly<Record<string, string>>>({});
  const [mediaMessage, setMediaMessage] = useState("");
  useEffect(() => {
    if (selectedLocale === "" && locales[0] !== undefined) setSelectedLocale(locales[0]);
  }, [locales, selectedLocale]);
  useEffect(() => {
    if (!mediaLocales.includes(mediaLocale)) setMediaLocale(mediaLocales[0] ?? "");
  }, [mediaLocale, mediaLocales]);
  const storageReady = storageStatus === "ready" || storageStatus === "success" || storageStatus === "cancelled";
  const model = useMemo(
    () => createProductionWorkspaceModel(index, lifecycle, dicingReport, storageReady),
    [dicingReport, index, lifecycle, storageReady]
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAssets = index.assets.filter((entry) =>
    (kind === "all" || entry.kind === kind) &&
    (normalizedQuery.length === 0 || `${entry.assetId}\n${entry.displayName}\n${entry.tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery))
  );
  const mediaModel = useMemo(
    () => createLocalizationMediaProductionModel(project, index, mediaLocale),
    [index, mediaLocale, project]
  );
  const reviewStatusLabel: Record<LocalizationMediaReviewStatus, string> = { missing: "缺失", draft: "草稿", reviewed: "已审阅", locked: "已锁定" };

  return (
    <section className="production-workspace view-enter" aria-labelledby="production-workspace-title">
      <header className="production-workspace__hero">
        <div>
          <p className="eyebrow">PRODUCTION · ONE AUTHORITATIVE ASSET INDEX</p>
          <h2 id="production-workspace-title">资源生产工作区</h2>
          <p>从真实文件入库、隔离检查与派生，到相似 CG 无损切图和 Runtime 交付验证；所有状态来自当前工程，不建立第二份资源清单。</p>
        </div>
        <button type="button" className="production-workspace__primary" onClick={onOpenPipeline}>
          打开资源生产流水线
        </button>
      </header>

      <div className="production-workspace__metrics" aria-label="资源生产指标">
        <span><strong>{model.assetCount}</strong>资源<small>Index r{index.indexRevision}</small></span>
        <span><strong>{model.inspectedCount}/{model.assetCount}</strong>检查通过<small>真实签名与预算</small></span>
        <span><strong>{model.sourceCount}/{model.derivativeCount}</strong>源 / 派生<small>Lifecycle r{lifecycle.lifecycleRevision}</small></span>
        <span><strong>{model.dicingGroupCount}</strong>相似组<small>{formatBytes(model.projectedSavingsBytes)} 代理节省</small></span>
      </div>

      <div className="production-workspace__next" role="status">
        <span aria-hidden="true">→</span>
        <div><small>建议下一步</small><strong>{model.nextAction}</strong></div>
      </div>

      <ol className="production-pipeline" aria-label="资源生产阶段">
        {model.phases.map((phase, indexInPipeline) => (
          <li key={phase.id} data-state={phase.state}>
            <span className="production-pipeline__index">{String(indexInPipeline + 1).padStart(2, "0")}</span>
            <div><strong>{phase.label}</strong><p>{phase.detail}</p></div>
            <span className="production-pipeline__state">{PHASE_STATE_LABEL[phase.state]}</span>
          </li>
        ))}
      </ol>

      <section className="localization-production" aria-labelledby="localization-production-title">
        <div className="production-table__heading">
          <div><p className="eyebrow">N61 · SOURCE · TARGET · REVIEW</p><h3 id="localization-production-title">本地化生产</h3></div>
          <span>{localizationSourceEntries(project).length} 个稳定文本键</span>
        </div>
        <div className="localization-production__controls">
          <label><span>源语言</span><input aria-label="源语言" value={sourceLocale} placeholder="例如 zh-Hans" onChange={(event) => setSourceLocale(event.target.value)} /></label>
          <label><span>新目标语言</span><input aria-label="新目标语言" value={newTargetLocale} placeholder="例如 en" onChange={(event) => setNewTargetLocale(event.target.value)} /></label>
          <button type="button" disabled={sourceLocale.trim() === "" || newTargetLocale.trim() === ""} onClick={() => {
            const normalizedSource = normalizeLocaleTag(sourceLocale);
            const locale = normalizeLocaleTag(newTargetLocale);
            if (normalizedSource === null || locale === null) {
              setLocalizationMessage("语言代码无效，请使用 zh-Hans、ja、en-US 这类 BCP 47 代码。");
              return;
            }
            if (normalizedSource === locale) {
              setLocalizationMessage("目标语言不能与源语言相同。");
              return;
            }
            const existed = locales.includes(locale);
            onProjectChange(addLocalizationTarget(project, normalizedSource, locale));
            setSourceLocale(normalizedSource);
            setSelectedLocale(locale);
            setNewTargetLocale("");
            setImportPreview(null);
            setLocalizationMessage(existed ? `${locale} 已存在，已切换到该语言。` : `已添加 ${locale}，可开始翻译。`);
          }}>添加目标语言</button>
          {locales.length > 0 && <label><span>当前目标语言</span><select aria-label="当前目标语言" value={selectedLocale} onChange={(event) => { setSelectedLocale(event.target.value); setImportPreview(null); }}>{locales.map((locale) => <option key={locale} value={locale}>{locale}</option>)}</select></label>}
        </div>
        {localizationMessage !== "" && <p className="localization-production__message" role="status">{localizationMessage}</p>}
        {selectedLocale === "" ? <p className="localization-production__empty">先设定源语言并添加一个目标语言，随后可直接翻译当前工程的稳定文本。</p> : (
          <>
            <div className="localization-exchange" aria-label="翻译文件交换">
              <button type="button" disabled={exchangeBusy} onClick={() => {
                const csv = encodeLocalizationCsv(localizationExchangeMatrix(project, selectedLocale));
                downloadLocalizationFile(csv, "text/csv;charset=utf-8", `localization-${selectedLocale}.csv`);
                setLocalizationMessage(`已导出 ${selectedLocale} CSV。`);
              }}>导出 CSV</button>
              <button type="button" disabled={exchangeBusy} onClick={async () => {
                setExchangeBusy(true);
                try {
                  const { encodeLocalizationXlsx } = await import("./localization-xlsx");
                  const bytes = encodeLocalizationXlsx(localizationExchangeMatrix(project, selectedLocale));
                  downloadLocalizationFile(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `localization-${selectedLocale}.xlsx`);
                  setLocalizationMessage(`已导出 ${selectedLocale} XLSX。`);
                } catch (error) {
                  setLocalizationMessage(`XLSX 导出失败：${error instanceof Error ? error.message : "未知错误"}`);
                } finally {
                  setExchangeBusy(false);
                }
              }}>导出 XLSX</button>
              <label className="localization-exchange__import">
                <span>{exchangeBusy ? "正在读取…" : "导入 CSV 或 XLSX"}</span>
                <input aria-label="导入 CSV 或 XLSX" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={exchangeBusy} onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file === undefined) return;
                  setExchangeBusy(true);
                  try {
                    const lowerName = file.name.toLocaleLowerCase();
                    const matrix = lowerName.endsWith(".csv")
                      ? parseLocalizationCsv(await readLocalizationFile(file, "text"))
                      : lowerName.endsWith(".xlsx")
                        ? (await import("./localization-xlsx")).parseLocalizationXlsx(await readLocalizationFile(file, "arrayBuffer"))
                        : (() => { throw new Error("仅支持 .csv 或 .xlsx 文件"); })();
                    setImportPreview(previewLocalizationImport(project, selectedLocale, file.name, matrix));
                  } catch (error) {
                    setImportPreview({
                      fileName: file.name,
                      changes: [],
                      unchangedCount: 0,
                      errors: [error instanceof Error ? error.message : "文件读取失败"]
                    });
                  } finally {
                    setExchangeBusy(false);
                  }
                }} />
              </label>
            </div>
            {importPreview !== null && <section className="localization-import-preview" aria-labelledby="localization-import-preview-title">
              <div className="localization-import-preview__heading">
                <div><h4 id="localization-import-preview-title">翻译导入预览</h4><small>{importPreview.fileName}</small></div>
                <strong>{importPreview.changes.length} 项更新 · {importPreview.unchangedCount} 项不变 · {importPreview.errors.length} 项错误</strong>
              </div>
              {importPreview.errors.length > 0 && <ul className="localization-import-preview__errors">{importPreview.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>}
              {importPreview.changes.length > 0 && <ul className="localization-import-preview__changes">{importPreview.changes.map((change) => <li key={change.key}><code>{change.key}</code><span>{change.beforeTranslation || "（空）"} → {change.translation || "（空）"}</span><small>{change.beforeStatus} → {change.status}</small></li>)}</ul>}
              <div className="localization-import-preview__actions">
                <button type="button" disabled={importPreview.errors.length > 0 || importPreview.changes.length === 0} onClick={() => {
                  onProjectChange(applyLocalizationImport(project, selectedLocale, importPreview));
                  setLocalizationMessage(`已将 ${importPreview.changes.length} 项翻译写入 ${selectedLocale}。`);
                  setImportPreview(null);
                }}>确认写入 {importPreview.changes.length} 项</button>
                <button type="button" onClick={() => setImportPreview(null)}>取消导入</button>
              </div>
            </section>}
            <div className="localization-production__scroll">
              <table>
              <thead><tr><th>稳定文本键</th><th>源文</th><th>{selectedLocale} 翻译</th><th>状态</th></tr></thead>
              <tbody>{localizationTranslations(project, selectedLocale).map((entry) => {
                const statusLabel: Record<LocalizationReviewStatus, string> = { missing: "缺失", draft: "草稿", reviewed: "已审阅", outdated: "已过期", locked: "已锁定" };
                return <tr key={entry.key}>
                  <td><code>{entry.key}</code><small>{entry.kind} · {entry.sceneId}</small></td>
                  <td>{entry.sourceText}</td>
                  <td><textarea aria-label={`${entry.key} 的 ${selectedLocale} 翻译`} value={entry.translation} disabled={entry.status === "locked"} onChange={(event) => onProjectChange(updateLocalizationTranslation(project, selectedLocale, entry.key, event.target.value, "draft"))} /></td>
                  <td><span className="localization-review-status" data-status={entry.status}>{statusLabel[entry.status]}</span><select aria-label={`${entry.key} 的状态`} value={entry.status === "missing" || entry.status === "outdated" ? "draft" : entry.status} disabled={entry.translation.trim() === ""} onChange={(event) => onProjectChange(updateLocalizationTranslation(project, selectedLocale, entry.key, entry.translation, event.target.value as "draft" | "reviewed" | "locked"))}><option value="draft">草稿</option><option value="reviewed">已审阅</option><option value="locked">已锁定</option></select></td>
                </tr>;
              })}</tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="localization-media-production" aria-labelledby="localization-media-production-title">
        <div className="production-table__heading">
          <div><p className="eyebrow">N61 · STABLE ID · LOCALE ASSET</p><h3 id="localization-media-production-title">语言媒体与配音</h3></div>
          <span>配音 {mediaModel.boundVoiceCount}/{mediaModel.voiceRows.length} · 媒体 {mediaLocale === project.manifest.defaultLocale ? "源资源" : `${mediaModel.boundVisualCount}/${mediaModel.visualRows.length}`}</span>
        </div>
        <div className="localization-media-production__controls">
          <label><span>媒体与配音语言</span><select aria-label="媒体与配音语言" value={mediaLocale} onChange={(event) => { setMediaLocale(event.target.value); setMediaMessage(""); }}>
            {mediaLocales.map((locale) => <option key={locale} value={locale}>{locale}{locale === project.manifest.defaultLocale ? " · 源语言" : ""}</option>)}
          </select></label>
          <p>先在资源流水线导入通过检查的文件，再把配音绑定到稳定文本 ID、把语言图片或视频绑定到基础 Asset ID。</p>
        </div>
        {mediaMessage !== "" && <p className="localization-media-production__message" role="status">{mediaMessage}</p>}
        {mediaLocales.length === 0 ? <p className="localization-production__empty">请先在上方设定工程源语言。</p> : <>
          <div className="localization-media-production__group">
            <h4>配音文件</h4>
            {mediaModel.audioCandidates.length === 0 && <p className="localization-production__empty">Asset Index 中没有已通过检查的音频；请先打开资源生产流水线导入。</p>}
            <div className="localization-media-production__scroll"><table>
              <thead><tr><th>稳定文本 ID / 配音脚本</th><th>语言文本</th><th>文件</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>{mediaModel.voiceRows.map((row) => {
                const draftKey = `${mediaLocale}:voice:${row.textId}`;
                const selected = voiceDrafts[draftKey] ?? row.assetId ?? "";
                return <tr key={row.textId}>
                  <td data-label="稳定文本 ID / 配音脚本"><code>{row.textId}</code><small>{row.sourceText}</small></td>
                  <td data-label="语言文本">{row.localizedText || "（译文尚未填写）"}</td>
                  <td data-label="文件"><select aria-label={`${row.textId} 的 ${mediaLocale} 配音资源`} value={selected} onChange={(event) => setVoiceDrafts((current) => ({ ...current, [draftKey]: event.target.value }))}>
                    <option value="">未绑定</option>
                    {row.assetId !== null && !row.assetAvailable && <option value={row.assetId}>{row.assetId} · 不在 Asset Index</option>}
                    {mediaModel.audioCandidates.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.displayName} · {asset.assetId}</option>)}
                  </select></td>
                  <td data-label="状态"><span className="localization-review-status" data-status={row.status}>{reviewStatusLabel[row.status]}</span><select aria-label={`${row.textId} 的 ${mediaLocale} 配音状态`} value={row.status === "missing" ? "draft" : row.status} disabled={!row.assetAvailable} onChange={(event) => {
                    onProjectChange(bindLocalizationVoiceAsset(project, row.textId, mediaLocale, row.assetId, event.target.value as "draft" | "reviewed" | "locked"));
                    setMediaMessage(`${row.textId} 的 ${mediaLocale} 配音状态已更新。`);
                  }}><option value="draft">草稿</option><option value="reviewed">已审阅</option><option value="locked">已锁定</option></select></td>
                  <td data-label="操作"><button type="button" disabled={!storageReady || selected === "" || selected === row.assetId} aria-label={`绑定 ${row.textId} 的 ${mediaLocale} 配音`} onClick={() => {
                    onProjectChange(bindLocalizationVoiceAsset(project, row.textId, mediaLocale, selected));
                    setMediaMessage(`已绑定 ${selected} 到 ${row.textId} · ${mediaLocale}。`);
                  }}>绑定/替换</button>{row.assetId !== null && <button type="button" onClick={() => {
                    onProjectChange(bindLocalizationVoiceAsset(project, row.textId, mediaLocale, null));
                    setVoiceDrafts((current) => ({ ...current, [draftKey]: "" }));
                    setMediaMessage(`已解除 ${row.textId} 的 ${mediaLocale} 配音，可重新绑定。`);
                  }}>解除</button>}</td>
                </tr>;
              })}</tbody>
            </table></div>
          </div>
          <div className="localization-media-production__group">
            <h4>图片与视频语言变体</h4>
            {mediaLocale === project.manifest.defaultLocale ? <p className="localization-production__empty">源语言直接使用基础 Asset；切换到目标语言后可绑定同类型变体。</p> : (
              <div className="localization-media-production__scroll"><table>
                <thead><tr><th>基础 Asset ID</th><th>类型</th><th>语言文件</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>{mediaModel.visualRows.map((row) => {
                  const draftKey = `${mediaLocale}:visual:${row.baseAssetId}`;
                  const selected = visualDrafts[draftKey] ?? row.assetId ?? "";
                  const candidates = (mediaModel.visualCandidates[row.kind] ?? []).filter((asset) => asset.assetId !== row.baseAssetId);
                  return <tr key={row.baseAssetId}>
                    <td data-label="基础 Asset ID"><code>{row.baseAssetId}</code><small>{row.displayName}</small></td>
                    <td data-label="类型">{row.kind.toUpperCase()}</td>
                    <td data-label="语言文件"><select aria-label={`${row.baseAssetId} 的 ${mediaLocale} 语言资源`} value={selected} onChange={(event) => setVisualDrafts((current) => ({ ...current, [draftKey]: event.target.value }))}>
                      <option value="">未绑定</option>
                      {row.assetId !== null && !row.assetAvailable && <option value={row.assetId}>{row.assetId} · 不在 Asset Index</option>}
                      {candidates.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.displayName} · {asset.assetId}</option>)}
                    </select></td>
                    <td data-label="状态"><span className="localization-review-status" data-status={row.status}>{reviewStatusLabel[row.status]}</span><select aria-label={`${row.baseAssetId} 的 ${mediaLocale} 语言资源状态`} value={row.status === "missing" ? "draft" : row.status} disabled={!row.assetAvailable} onChange={(event) => {
                      onProjectChange(bindLocalizationVisualAsset(project, row.baseAssetId, mediaLocale, row.assetId, event.target.value as "draft" | "reviewed" | "locked"));
                      setMediaMessage(`${row.baseAssetId} 的 ${mediaLocale} 语言资源状态已更新。`);
                    }}><option value="draft">草稿</option><option value="reviewed">已审阅</option><option value="locked">已锁定</option></select></td>
                    <td data-label="操作"><button type="button" disabled={!storageReady || selected === "" || selected === row.assetId} aria-label={`绑定 ${row.baseAssetId} 的 ${mediaLocale} 资源`} onClick={() => {
                      onProjectChange(bindLocalizationVisualAsset(project, row.baseAssetId, mediaLocale, selected));
                      setMediaMessage(`已绑定 ${selected} 到 ${row.baseAssetId} · ${mediaLocale}。`);
                    }}>绑定/替换</button>{row.assetId !== null && <button type="button" onClick={() => {
                      onProjectChange(bindLocalizationVisualAsset(project, row.baseAssetId, mediaLocale, null));
                      setVisualDrafts((current) => ({ ...current, [draftKey]: "" }));
                      setMediaMessage(`已解除 ${row.baseAssetId} 的 ${mediaLocale} 资源，可重新绑定。`);
                    }}>解除</button>}</td>
                  </tr>;
                })}</tbody>
              </table></div>
            )}
          </div>
        </>}
      </section>

      <section className="production-table" aria-labelledby="production-table-title">
        <div className="production-table__heading">
          <div><p className="eyebrow">FILTER · STATUS · REVIEW</p><h3 id="production-table-title">资源映射批量表</h3></div>
          <span>{visibleAssets.length}/{index.assets.length} 项可见</span>
        </div>
        <div className="production-table__filters" role="search">
          <label><span>搜索资源</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Asset ID、名称或标签" /></label>
          <label><span>筛选资源类型</span><select value={kind} onChange={(event) => setKind(event.target.value as "all" | AssetKind)}>
            {KIND_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select></label>
        </div>
        <div className="production-table__scroll">
          <table>
            <thead><tr><th>Asset ID</th><th>名称</th><th>类型</th><th>媒体检查</th><th>源文件</th><th>审阅状态</th></tr></thead>
            <tbody>
              {visibleAssets.map((entry) => {
                const inspectionPassed = assetInspectionPassed(entry);
                return <tr key={entry.assetId}>
                  <td data-label="Asset ID"><code>{entry.assetId}</code></td>
                  <td data-label="名称">{entry.displayName}</td>
                  <td data-label="类型">{entry.kind.toUpperCase()}</td>
                  <td data-label="媒体检查"><span className="production-status" data-status={inspectionPassed ? "pass" : "attention"}>{inspectionPassed ? "✓ 已通过" : "! 待处理"}</span></td>
                  <td data-label="源文件">{formatBytes(entry.source.byteLength)}<small>{entry.source.mimeType}</small></td>
                  <td data-label="审阅状态"><span className="production-status" data-status="review">◇ 待交付审阅</span></td>
                </tr>;
              })}
              {visibleAssets.length === 0 && <tr><td colSpan={6} className="production-table__empty">
                {index.assets.length === 0 ? "尚无生产资源；从上方流水线导入第一项真实文件。" : "没有符合当前过滤条件的资源。"}
              </td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

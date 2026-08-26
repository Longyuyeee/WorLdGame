import { useMemo, useState } from "react";
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

type ProductionStorageStatus = "loading" | "unavailable" | "ready" | "importing" | "success" | "cancelled" | "error";

interface ProductionWorkspaceProps {
  readonly index: AssetIndex;
  readonly lifecycle: AssetLifecycleManifest;
  readonly dicingReport: LosslessDicingDiscoveryReport | null;
  readonly storageStatus: ProductionStorageStatus;
  readonly onOpenPipeline: () => void;
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

const PHASE_STATE_LABEL = {
  blocked: "等待前置",
  current: "当前任务",
  ready: "等待审阅",
  complete: "已验证"
} as const;

export function ProductionWorkspace({
  index,
  lifecycle,
  dicingReport,
  storageStatus,
  onOpenPipeline
}: ProductionWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | AssetKind>("all");
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

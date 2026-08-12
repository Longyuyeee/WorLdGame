import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  AssetBlobError,
  assetBackupRecordId,
  createAssetLifecycleManifest,
  createAssetIndex,
  ProjectPersistenceError,
  ProjectStoreError,
  CURRENT_PROJECT_SCHEMA_VERSION,
  loadProjectBackups,
  migrateProjectToCurrent,
  parseLosslessDicingPngDeliveryManifest,
  probeProjectVersion,
  restoreProjectBackup,
  saveProjectWithBackups,
  type ProjectBackup,
  type AssetImportInput,
  type AssetIndex,
  type AssetIndexEntry,
  type AssetKind,
  type AssetLifecycleManifest,
  type LosslessDicingDiscoveryReport,
  type ProjectSnapshot,
  type ProjectWriterLease
} from "@world-studio/project-persistence";
import {
  deriveRouteGraph,
  findScene,
  findStatement,
  predictStoryResources,
  type Character,
  type SceneResourceManifest,
  type StoryStatement
} from "@world-studio/story-core";
import {
  MAX_STAGE_Z,
  MAX_DIRECTIVE_BATCH_TARGETS,
  MIN_STAGE_Z,
  SAFE_STAGE_SLOT,
  compileSceneResourceManifest,
  directiveActionRequiresAsset,
  directiveActionOptions,
  inspectDirectiveArguments,
  parseStory,
  resolveDirectiveAction,
  type StoryDocument
} from "@world-studio/story-language";
import {
  activeSourceDraft,
  activeSourceSession,
  createProjectSnapshot,
  createStudioSession,
  hasPendingDraft,
  reduceStudioSession,
  restoreStudioSession,
  type StudioAction,
  type StudioMode,
  type StudioSession
} from "./studio-session";
import { TransactionalTextarea } from "./transactional-textarea";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";
import { createBrowserWriterLeaseOwnerId, markBrowserWriterLeaseOwnerHandoff } from "./writer-lease-owner";
import { IndexedDbAssetRepository } from "./indexeddb-asset-repository";
import {
  WEB_ASSET_IMPORT_MAX_BYTES,
  canonicalAssetId,
  inferAssetKind,
  readAssetFile
} from "./asset-file-import";
import { inspectAssetBytes, mediaInspectionToJson } from "./media-inspection-client";
import { generateThumbnailInWorker } from "./thumbnail-client";
import { analyzeDicingInWorker, buildDicingAtlasInWorker } from "./dicing-analysis-client";
import { resolveDicingRuntimeImageInWorker } from "./dicing-runtime-client";
import { RuntimeResourceScheduler } from "./runtime-resource-scheduler";
import { StoryResourceCoordinator } from "./story-resource-coordinator";
import { selectStageDirectionLane, selectStageDirectionRange, type StageDirectionCommand } from "./stage-selection";
import { createStageSearchIndex, searchStageIndex, type StageSearchMatch } from "./stage-search";
import { createStageWindow, moveStageWindow, revealStageIndex } from "./stage-window";
import {
  DEFAULT_PREVIEW_VIEWPORT_ID,
  MAX_PREVIEW_DIMENSION,
  MIN_PREVIEW_DIMENSION,
  PREVIEW_VIEWPORT_PRESETS,
  findPreviewViewportPreset,
  formatPreviewRatio,
  normalizePreviewDimension,
  type PreviewViewportProfileId
} from "./preview-viewport";
import {
  PREVIEW_SPEED_PROFILES,
  createPreviewTransportState,
  findPreviewSpeedProfile,
  previewStepDelayMs,
  previewStopReasonLabel,
  previewTransportBarrier,
  reducePreviewTransport,
  type PreviewSpeedId
} from "./preview-transport";
import {
  browserPreviewUrlFactory,
  compilePreviewStageTimeline,
  derivePreviewStagePlan,
  loadPreviewMedia,
  releasePreviewMedia,
  type LoadedPreviewMedia,
  type PreviewAudioLayerPlan,
  type PreviewUrlFactory
} from "./preview-media-runtime";

type PersistenceStatus = "loading" | "migrating" | "readonly" | "blocked" | "conflict" |
  "unavailable" | "unsaved" | "dirty" | "saving" | "autosaving" | "saved" |
  "autosaved" | "restored" | "degraded" | "error";

type AssetVaultStatus = "loading" | "unavailable" | "ready" | "importing" |
  "success" | "cancelled" | "error";

type AssetImportPhase = "idle" | "reading" | "inspecting" | "committing" | "success" | "cancelled" | "error";

interface AssetImportViewState {
  readonly phase: AssetImportPhase;
  readonly progress: number;
  readonly detail: string;
  readonly errorCode?: string;
}

const IDLE_ASSET_IMPORT: AssetImportViewState = {
  phase: "idle",
  progress: 0,
  detail: "选择本机文件后，先在隔离检查边界验证签名与媒体预算，再原子发布 Blob 与 Asset Index。"
};

const WRITER_LEASE_TTL_MS = 12_000;
const WRITER_LEASE_HEARTBEAT_MS = 4_000;
const AUTOSAVE_DEBOUNCE_MS = 1_500;
const BACKUP_POLICY = { retention: 5 } as const;

interface PersistenceViewState {
  readonly status: PersistenceStatus;
  readonly revision: number;
  readonly detail?: string;
  readonly errorCode?: string;
  readonly backupCount?: number;
  readonly schemaVersion?: number;
  readonly projectTitle?: string;
}

export function persistenceFailure(error: unknown, revision: number): PersistenceViewState {
  const known = error instanceof ProjectStoreError || error instanceof ProjectPersistenceError || error instanceof AssetBlobError;
  const errorCode = known ? error.code : undefined;
  const message = error instanceof Error ? error.message : "本地存储操作失败";
  return {
    status: "error",
    revision,
    detail: errorCode === undefined ? message : `${errorCode} · ${message}`,
    ...(errorCode === undefined ? {} : { errorCode })
  };
}

export function persistenceErrorLabel(errorCode: string | undefined): string {
  if (errorCode === "LEASE_REQUIRED" || errorCode === "LEASE_LOST") return "另一窗口正在编辑";
  if (errorCode === "CORRUPT_BACKUP") return "备份需要检查";
  if (errorCode === "NO_SPACE") return "本机空间不足";
  if (errorCode === "PERMISSION_DENIED") return "无写入权限";
  if (errorCode === "BUSY") return "存储正忙";
  if (errorCode === "UNAVAILABLE") return "存储已断开";
  if (errorCode === "STALE_STORAGE_REVISION") return "保存版本冲突";
  if (errorCode?.startsWith("CORRUPT_") === true || errorCode === "INCOMPLETE_STAGED_TRANSACTION") {
    return "项目需要恢复";
  }
  return "保存失败";
}

const modeLabels: Record<StudioMode, string> = {
  writer: "Writer",
  script: "Script",
  flow: "Flow"
};

function statementLabel(statement: StoryStatement): string {
  switch (statement.kind) {
    case "dialogue":
      return statement.text;
    case "direction":
      return statement.summary;
    case "choice":
      return statement.prompt;
    case "end":
      return `结局 · ${statement.endingName}`;
  }
}

function statementKindLabel(statement: StoryStatement): string {
  switch (statement.kind) {
    case "dialogue":
      return "对白";
    case "direction":
      return "演出";
    case "choice":
      return "选择";
    case "end":
      return "结局";
  }
}

function findCharacter(
  characters: readonly Character[],
  characterId: string
): Character | undefined {
  return characters.find((character) => character.id === characterId);
}

interface CommonProps {
  readonly session: StudioSession;
  readonly dispatch: (action: StudioAction) => void;
}

interface WorkspaceHeaderProps extends CommonProps {
  readonly mode: StudioMode;
  readonly inputDirty: boolean;
  readonly onModeChange: (mode: StudioMode) => void;
  readonly persistence: PersistenceViewState;
  readonly onSave: () => void;
  readonly onOpenBackups: () => void;
}

function WorkspaceHeader({
  mode,
  session,
  inputDirty,
  onModeChange,
  persistence,
  onSave,
  onOpenBackups,
  dispatch
}: WorkspaceHeaderProps) {
  const sourceSession = activeSourceSession(session);
  const pendingDraft = hasPendingDraft(session);
  return (
    <header className="workspace-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">W</span>
        <div>
          <p className="eyebrow">WorLd Studio · S0.40</p>
          <h1>{session.project.title}</h1>
        </div>
      </div>

      <nav className="mode-switcher" aria-label="编辑模式" role="tablist">
        {(Object.keys(modeLabels) as StudioMode[]).map((candidate) => (
          <button
            className={candidate === mode ? "mode-tab is-active" : "mode-tab"}
            key={candidate}
            onClick={() => onModeChange(candidate)}
            role="tab"
            aria-selected={candidate === mode}
          >
            <span className={`mode-dot mode-dot--${candidate}`} aria-hidden="true" />
            {modeLabels[candidate]}
          </button>
        ))}
      </nav>

      <div className="history-actions" aria-label="脚本历史">
        <button
          className="icon-button"
          aria-label="撤销"
          disabled={sourceSession.history.length === 0 || pendingDraft || inputDirty}
          onClick={() => dispatch({ type: "undo" })}
        >
          ↶
        </button>
        <button
          className="icon-button"
          aria-label="重做"
          disabled={sourceSession.future.length === 0 || pendingDraft || inputDirty}
          onClick={() => dispatch({ type: "redo" })}
        >
          ↷
        </button>
        <span className={pendingDraft ? "save-state is-draft" : inputDirty ? "save-state is-buffered" : "save-state"}>
          <span className="save-state__dot" aria-hidden="true" />
          {pendingDraft
            ? "错误草稿 · 未提交"
            : inputDirty
              ? "输入批次 · 未提交"
              : `本地事务 · r${sourceSession.revision}`}
        </span>
        <button
          className="backup-button"
          onClick={onOpenBackups}
          disabled={persistence.status === "loading" || persistence.status === "saving" ||
            persistence.status === "autosaving" || persistence.status === "unavailable"}
        >
          备份 {persistence.backupCount ?? 0}/{BACKUP_POLICY.retention}
        </button>
        <button
          className={`local-save-button local-save-button--${persistence.status}`}
          disabled={inputDirty || persistence.status === "loading" || persistence.status === "saving" ||
            persistence.status === "autosaving" || persistence.status === "unavailable"}
          onClick={onSave}
          title={persistence.detail ?? "保存项目快照到本机"}
        >
          {persistence.status === "loading" ? "正在恢复"
            : persistence.status === "unavailable" ? "存储不可用"
              : persistence.status === "saving" ? "保存中…"
                : persistence.status === "autosaving" ? "自动保存中…"
                : persistence.status === "saved" ? `已保存 · s${persistence.revision}`
                  : persistence.status === "autosaved" ? `已自动保存 · s${persistence.revision}`
                  : persistence.status === "restored" ? `已恢复 · s${persistence.revision}`
                    : persistence.status === "degraded" ? "自动保存已暂停"
                    : persistence.status === "error" ? persistenceErrorLabel(persistence.errorCode)
                      : "保存到本机"}
        </button>
      </div>
    </header>
  );
}

interface SceneRailProps extends CommonProps {
  readonly assetIndex: AssetIndex;
  readonly assetStatus: AssetVaultStatus;
  readonly onOpenAssets: () => void;
}

function SceneRail({ session, dispatch, assetIndex, assetStatus, onOpenAssets }: SceneRailProps) {
  return (
    <aside className="scene-rail" aria-label="场景列表">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PROJECT</p>
          <h2>场景</h2>
        </div>
        <span className="count-badge">{session.project.scenes.length}</span>
      </div>
      <div className="scene-list">
        {session.project.scenes.map((scene, index) => (
          <button
            className={scene.id === session.activeSceneId ? "scene-item is-active" : "scene-item"}
            key={scene.id}
            onClick={() => dispatch({ type: "select-scene", sceneId: scene.id })}
          >
            <span className="scene-index">{String(index + 1).padStart(2, "0")}</span>
            <span>
              <strong>{scene.title}</strong>
              <small>{scene.statements.length} 个步骤</small>
            </span>
          </button>
        ))}
      </div>
      <div className="rail-card-stack">
        <button className="asset-vault-card" aria-label="打开资源保险库" onClick={onOpenAssets}>
          <div className="asset-vault-card__heading">
            <span className="asset-vault-card__mark" aria-hidden="true">◇</span>
            <span><strong>资源保险库</strong><small>S0.40 SEARCH · STABLE-ID JUMP</small></span>
          </div>
          <div className="asset-vault-card__rules">
            <span>签名验证</span><span>预算闸门</span><span>SHA-256 去重</span>
          </div>
          <p>{assetStatus === "ready" || assetStatus === "success" || assetStatus === "cancelled"
            ? `${assetIndex.assets.length} 项资源 · Index r${assetIndex.indexRevision} · 点击管理`
            : assetStatus === "importing" ? "正在读取并原子提交资源…"
            : assetStatus === "loading" ? "正在校验本地资源索引…"
              : assetStatus === "error" ? "资源索引需要检查 · 点击查看"
                : "本机资源存储不可用 · 点击查看原因"}</p>
        </button>
        <div className="rail-status">
          <span className="status-orb" aria-hidden="true" />
          <span>
            <strong>Source of Truth</strong>
            <small>权威脚本 → 投影 → 三视图</small>
          </span>
        </div>
      </div>
    </aside>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function assetImportErrorLabel(errorCode: string | undefined): string {
  if (errorCode === "RESOURCE_LIMIT") return "媒体超过安全预算";
  if (errorCode === "UNSAFE_MEDIA") return "媒体结构不安全或已损坏";
  if (errorCode === "UNSUPPORTED_MEDIA_TYPE") return "暂不支持此媒体格式";
  if (errorCode === "MIME_MISMATCH") return "文件声明与真实内容不一致";
  if (errorCode === "INSPECTION_UNAVAILABLE") return "媒体检查服务暂不可用";
  if (errorCode === "NO_SPACE") return "本机资源空间不足";
  if (errorCode === "PERMISSION_DENIED") return "无法读取或保存该文件";
  if (errorCode === "LEASE_REQUIRED" || errorCode === "LEASE_LOST") return "资源写入权已失效";
  if (errorCode === "STALE_INDEX_REVISION") return "资源索引已更新，请重试";
  if (errorCode === "CORRUPT_BLOB") return "已有资源完整性异常";
  if (errorCode === "CANCELLED") return "导入已取消";
  if (errorCode === "UNAVAILABLE") return "本地资源存储不可用";
  return "资源导入失败";
}

function assetInspectionLabel(entry: AssetIndex["assets"][number]): string {
  const value = entry.preservedFields?.inspection;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "LEGACY · 未检查";
  const inspection = value as Record<string, unknown>;
  if (inspection.status !== "pass" || typeof inspection.format !== "string") return "UNKNOWN · 检查记录异常";
  const dimensions = typeof inspection.width === "number" && typeof inspection.height === "number"
    ? ` · ${inspection.width}×${inspection.height}`
    : "";
  const isolation = inspection.isolation === "svg-quarantine" ? " · 隔离" : "";
  return `PASS · ${inspection.format}${dimensions}${isolation}`;
}

function canBuildThumbnail(entry: AssetIndex["assets"][number]): boolean {
  const inspection = entry.preservedFields?.inspection;
  return typeof inspection === "object" && inspection !== null && !Array.isArray(inspection) &&
    (inspection as Record<string, unknown>).status === "pass" &&
    (entry.source.mimeType === "image/png" || entry.source.mimeType === "image/jpeg" || entry.source.mimeType === "image/webp");
}

interface AssetVaultDialogProps {
  readonly index: AssetIndex;
  readonly lifecycle: AssetLifecycleManifest;
  readonly gcLocked: boolean;
  readonly gcLockReason: string;
  readonly lifecycleDetail: string;
  readonly dicingReport: LosslessDicingDiscoveryReport | null;
  readonly dicingAnalyzing: boolean;
  readonly dicingPublishingGroupId: string | null;
  readonly dicingRuntimeVerifyingGroupId: string | null;
  readonly runtimeSchedulingGroupId: string | null;
  readonly storyPredictionGroupId: string | null;
  readonly resourceCompilingGroupId: string | null;
  readonly status: AssetVaultStatus;
  readonly importState: AssetImportViewState;
  readonly createSuggestedId: (fileName: string) => string;
  readonly onClose: () => void;
  readonly onCancel: () => void;
  readonly onImport: (file: File, metadata: Omit<AssetImportInput, "bytes" | "mimeType">) => void;
  readonly onScan: () => void;
  readonly onSweep: () => void;
  readonly onRestore: (digest: AssetLifecycleManifest["trash"][number]["digest"]) => void;
  readonly onBuildSidecar: (assetId: string) => void;
  readonly onBuildThumbnail: (assetId: string) => void;
  readonly onAnalyzeDicing: () => void;
  readonly onCancelDicing: () => void;
  readonly onPublishDicingAtlas: (groupId: string) => void;
  readonly onVerifyDicingRuntime: (groupId: string) => void;
  readonly onVerifyRuntimeScheduling: (groupId: string) => void;
  readonly onVerifyStoryPrediction: (groupId: string) => void;
  readonly onVerifyResourceCompilation: (groupId: string) => void;
}

function AssetVaultDialog({
  index,
  lifecycle,
  gcLocked,
  gcLockReason,
  lifecycleDetail,
  dicingReport,
  dicingAnalyzing,
  dicingPublishingGroupId,
  dicingRuntimeVerifyingGroupId,
  runtimeSchedulingGroupId,
  storyPredictionGroupId,
  resourceCompilingGroupId,
  status,
  importState,
  createSuggestedId,
  onClose,
  onCancel,
  onImport,
  onScan,
  onSweep,
  onRestore,
  onBuildSidecar,
  onBuildThumbnail,
  onAnalyzeDicing,
  onCancelDicing,
  onPublishDicingAtlas,
  onVerifyDicingRuntime,
  onVerifyRuntimeScheduling,
  onVerifyStoryPrediction,
  onVerifyResourceCompilation
}: AssetVaultDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [assetId, setAssetId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<AssetKind>("other");
  const importing = importState.phase === "reading" || importState.phase === "inspecting" || importState.phase === "committing";
  const storageReady = status === "ready" || status === "success" || status === "cancelled";
  const selectedExisting = index.assets.find((entry) => entry.assetId === assetId);
  const sourceCount = lifecycle.nodes.filter((node) => node.role === "source").length;
  const derivativeCount = lifecycle.nodes.length - sourceCount;
  const eligibleCount = lifecycle.quarantine.filter((entry) => entry.sweepAfterMs <= Date.now()).length;
  const dicingCandidateCount = index.assets.filter(canBuildThumbnail).length;

  const chooseFile = (selected: File | null) => {
    setFile(selected);
    if (selected === null) return;
    setAssetId(createSuggestedId(selected.name));
    setDisplayName(selected.name.replace(/\.[^.]+$/, ""));
    setKind(inferAssetKind(selected.type || "application/octet-stream"));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file === null || assetId.trim().length === 0 || displayName.trim().length === 0 || importing) return;
    onImport(file, { assetId: assetId.trim(), displayName: displayName.trim(), kind, tags: [] });
  };

  return (
    <div className="asset-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !importing) onClose();
    }}>
      <section className="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
        <div className="asset-dialog__heading">
          <div>
            <p className="eyebrow">CONTENT-ADDRESSED LOCAL VAULT</p>
            <h2 id="asset-dialog-title">资源保险库</h2>
          </div>
          <div className="asset-dialog__summary">
            <span>{index.assets.length} 资源</span><span>Index r{index.indexRevision}</span>
            <button className="icon-button" aria-label="关闭资源保险库" onClick={onClose}>×</button>
          </div>
        </div>
        <p className="asset-dialog__intro">
          单文件上限 {formatBytes(WEB_ASSET_IMPORT_MAX_BYTES)}。Worker 检查真实签名、尺寸、时长与危险 SVG；通过后 Blob 与 Index 才在同一 fenced 事务中提交。
        </p>

        <section className="asset-lifecycle" aria-label="资源生命周期">
          <div className="asset-lifecycle__heading">
            <div><p className="eyebrow">SOURCE → DERIVATIVE LINEAGE</p><h3>资源血缘与安全回收</h3></div>
            <span>Lifecycle r{lifecycle.lifecycleRevision}</span>
          </div>
          <div className="asset-lifecycle__metrics">
            <span><strong>{sourceCount}</strong>源文件</span>
            <span><strong>{derivativeCount}</strong>派生文件</span>
            <span><strong>{lifecycle.roots.length}</strong>保护根</span>
            <span><strong>{lifecycle.quarantine.length}</strong>隔离候选</span>
            <span><strong>{lifecycle.trash.length}</strong>可恢复</span>
          </div>
          <div className={gcLocked ? "asset-lifecycle__notice is-locked" : "asset-lifecycle__notice"} role="status">
            <span aria-hidden="true">{gcLocked ? "⌁" : "✓"}</span>
            <p>{gcLocked
              ? gcLockReason
              : lifecycleDetail}</p>
          </div>
          {gcLocked && <p className="asset-lifecycle__activity" aria-live="polite">{lifecycleDetail}</p>}
          <div className="asset-lifecycle__actions">
            <button type="button" disabled={!storageReady || importing || gcLocked} onClick={onScan}>安全扫描</button>
            <button type="button" disabled={!storageReady || importing || gcLocked || eligibleCount === 0} onClick={onSweep}>
              移入可恢复区{eligibleCount > 0 ? ` · ${eligibleCount}` : ""}
            </button>
            <small>扫描只登记候选；隔离满 24 小时后才能移动，移动后仍保留 7 天恢复期。</small>
          </div>
          <div className="dicing-analysis" aria-label="无损切图候选分析">
            <div className="dicing-analysis__heading">
              <div><p className="eyebrow">TYPED DIRECTIONS · MANIFEST COMPILED</p><h4>跨图片重复块分析</h4></div>
              {dicingAnalyzing
                ? <button type="button" className="danger-button" onClick={onCancelDicing}>取消分析</button>
                : <button type="button" disabled={!storageReady || importing || dicingCandidateCount < 2} onClick={onAnalyzeDicing}>
                    分析候选 · {dicingCandidateCount}
                  </button>}
            </div>
            <p>Compiler 从 asset= 与 transitionAsset= 类型化演出参数生成 Scene Resource Manifest 和语句窗口；位置文本与文件名不会被猜成资源，输出再连接 Story Graph 与 Runtime Loader。</p>
            {dicingReport !== null && <div className={`dicing-analysis__report ${dicingReport.candidateGroups.length > 0 ? "is-adopt" : "is-original"}`} role="status">
              <strong>{dicingReport.candidateGroups.length > 0 ? `发现 ${dicingReport.candidateGroups.length} 个严格相似组` : "没有安全的自动分组"}</strong>
              <span>评估 {dicingReport.evaluatedImageCount} 图 · 阈值 {(dicingReport.minSharedTileRatio * 100).toFixed(0)}% · {dicingReport.unassignedAssetIds.length} 图保持独立</span>
              {dicingReport.candidateGroups.slice(0, 4).map((group) => <article key={group.groupId} className="dicing-analysis__group">
                <strong>{group.groupId} · {group.report.decision === "adopt" ? "建议 Atlas 候选" : "保持 Original"}</strong>
                <span>{group.assetIds.join(" · ")} · 最低两两相似度 {(group.minimumPairSimilarity * 100).toFixed(1)}%</span>
                <span>{group.report.repeatedPlacementCount} 重复放置 · {group.report.duplicateDecodedImageCount} 重复源 · {group.report.netSavingsBytes > 0 ? `RGBA 代理节省 ${(group.report.netSavingsRatio * 100).toFixed(1)}%` : "无净收益"}</span>
                <code>{group.report.planDigest.slice(7, 19)}… · 逐字节重建 PASS</code>
                {group.report.decision === "adopt" && <button type="button" disabled={dicingPublishingGroupId !== null}
                  onClick={() => onPublishDicingAtlas(group.groupId)}>
                  {dicingPublishingGroupId === group.groupId ? "正在编码复决策…" : "编码并复决策发布"}
                </button>}
                {group.report.decision === "adopt" && <button type="button"
                  disabled={dicingPublishingGroupId !== null || dicingRuntimeVerifyingGroupId !== null || runtimeSchedulingGroupId !== null || storyPredictionGroupId !== null}
                  onClick={() => onVerifyDicingRuntime(group.groupId)}>
                  {dicingRuntimeVerifyingGroupId === group.groupId ? "正在验证 Loader…" : "验证 Runtime Loader"}
                </button>}
                {group.report.decision === "adopt" && <button type="button"
                  disabled={dicingPublishingGroupId !== null || dicingRuntimeVerifyingGroupId !== null || runtimeSchedulingGroupId !== null || storyPredictionGroupId !== null}
                  onClick={() => onVerifyRuntimeScheduling(group.groupId)}>
                  {runtimeSchedulingGroupId === group.groupId ? "正在执行内存门禁…" : "验证内存调度"}
                </button>}
                {group.report.decision === "adopt" && <button type="button"
                  disabled={dicingPublishingGroupId !== null || dicingRuntimeVerifyingGroupId !== null || runtimeSchedulingGroupId !== null || storyPredictionGroupId !== null || resourceCompilingGroupId !== null}
                  onClick={() => onVerifyStoryPrediction(group.groupId)}>
                  {storyPredictionGroupId === group.groupId ? "正在验证剧情预测…" : "验证剧情预测"}
                </button>}
                {group.report.decision === "adopt" && <button type="button"
                  disabled={dicingPublishingGroupId !== null || dicingRuntimeVerifyingGroupId !== null || runtimeSchedulingGroupId !== null || storyPredictionGroupId !== null || resourceCompilingGroupId !== null}
                  onClick={() => onVerifyResourceCompilation(group.groupId)}>
                  {resourceCompilingGroupId === group.groupId ? "正在编译资源清单…" : "验证资源编译"}
                </button>}
              </article>)}
              <code>{dicingReport.discoveryDigest.slice(7, 19)}… · 自动分组确定性摘要</code>
            </div>}
          </div>
          {lifecycle.trash.length > 0 && <div className="asset-trash-list" aria-label="可恢复资源">
            {lifecycle.trash.map((entry) => <article key={entry.digest}>
              <div><code>{entry.digest.slice(7, 19)}…</code><span>{formatBytes(entry.byteLength)} · {new Date(entry.purgeAfterMs).toLocaleDateString()} 前可恢复</span></div>
              <button type="button" onClick={() => onRestore(entry.digest)}>恢复</button>
            </article>)}
          </div>}
        </section>

        <form className="asset-import-form" onSubmit={submit}>
          <label className="asset-file-picker">
            <span>{file === null ? "选择图片、音频、视频或字体" : file.name}</span>
            <small>{file === null ? "浏览本机文件" : `${formatBytes(file.size)} · ${file.type || "application/octet-stream"}`}</small>
            <input
              aria-label="选择资源文件"
              type="file"
              accept="image/*,audio/*,video/*,.woff,.woff2,.ttf,.otf"
              disabled={!storageReady || importing}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="asset-metadata-grid">
            <label><span>稳定 Asset ID</span><input aria-label="资源 Asset ID" value={assetId} disabled={importing} onChange={(event) => setAssetId(event.target.value)} /></label>
            <label><span>显示名称</span><input aria-label="资源显示名称" value={displayName} disabled={importing} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label><span>资源类型</span><select aria-label="资源类型" value={kind} disabled={importing} onChange={(event) => setKind(event.target.value as AssetKind)}>
              <option value="background">背景</option><option value="character">角色</option><option value="cg">CG</option>
              <option value="audio">音频</option><option value="video">视频</option><option value="font">字体</option>
              <option value="ui">UI</option><option value="other">其他</option>
            </select></label>
          </div>
          {selectedExisting !== undefined && <p className="asset-replace-notice">将更新稳定 ID <code>{assetId}</code> 的源内容；旧 Blob 保持不可变并进入孤儿审计。</p>}
          <div className={`asset-import-status asset-import-status--${importState.phase}`} aria-live="polite">
            <div><strong>{importState.phase === "reading" ? "正在读取文件"
              : importState.phase === "inspecting" ? "正在执行媒体安全检查"
              : importState.phase === "committing" ? "正在校验并原子提交"
                : importState.phase === "success" ? "资源导入完成"
                  : importState.phase === "cancelled" ? "导入已取消"
                    : importState.phase === "error" ? assetImportErrorLabel(importState.errorCode)
                      : "准备导入"}</strong><span>{Math.round(importState.progress * 100)}%</span></div>
            <progress value={importState.progress} max={1} aria-label="资源导入进度" />
            <p>{importState.detail}</p>
          </div>
          <div className="asset-import-actions">
            {importing ? <button type="button" className="danger-button" onClick={onCancel}>取消导入</button> : null}
            <button type="submit" disabled={!storageReady || file === null || assetId.trim().length === 0 || displayName.trim().length === 0 || importing}>
              {selectedExisting === undefined ? "导入到资源保险库" : "更新此资源"}
            </button>
          </div>
        </form>

        <div className="asset-list" aria-label="已导入资源">
          {index.assets.length === 0 ? <p className="asset-list__empty">尚未导入资源。导入不会修改原始文件，也不会把媒体写入剧情 JSON/WAL。</p> : index.assets.map((entry) => (
            <article className="asset-item" key={entry.assetId}>
              <span className={`asset-item__kind asset-item__kind--${entry.kind}`}>{entry.kind.toUpperCase()}</span>
              <div><strong>{entry.displayName}</strong><code>{entry.assetId}</code></div>
              <div><span>{formatBytes(entry.source.byteLength)} · {assetInspectionLabel(entry)}</span><code>{entry.source.digest.slice(7, 19)}…</code></div>
              <div className="asset-item__derivatives">
                <button type="button" className="asset-item__derive" disabled={!storageReady || importing || !canBuildThumbnail(entry)} onClick={() => onBuildThumbnail(entry.assetId)}>生成缩略图</button>
                <button type="button" className="asset-item__derive" disabled={!storageReady || importing} onClick={() => onBuildSidecar(entry.assetId)}>生成 Sidecar</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

interface WriterViewProps extends CommonProps {
  readonly createCommandId: () => string;
  readonly createEntityId: (prefix: "stmt" | "txt") => string;
  readonly onInputDirtyChange: (dirty: boolean) => void;
  readonly assetIndex: AssetIndex;
}

type DirectionForm = Record<string, string>;
type DirectionCommand = "background" | "show" | "audio";
type BatchDirectionParameter = "transition" | "duration" | "transitionAsset" | "expression" | "position" | "loop" | "volume" | "fade";

const BATCH_DIRECTION_PARAMETERS: Readonly<Record<DirectionCommand, readonly BatchDirectionParameter[]>> = {
  background: ["transition", "duration", "transitionAsset"],
  show: ["expression", "position", "transition", "duration", "transitionAsset"],
  audio: ["loop", "volume", "fade", "transitionAsset"]
};

const BATCH_PARAMETER_LABELS: Readonly<Record<BatchDirectionParameter, string>> = {
  transition: "过渡",
  duration: "时长",
  transitionAsset: "过渡资源",
  expression: "表情",
  position: "位置",
  loop: "循环",
  volume: "音量",
  fade: "淡入/淡出"
};

function compatibleDirectionAssets(
  command: "background" | "show" | "audio",
  assets: readonly AssetIndexEntry[]
): readonly AssetIndexEntry[] {
  return assets.filter((entry) => {
    if (command === "background") return entry.kind === "background" || entry.kind === "cg";
    if (command === "show") return entry.kind === "character";
    return entry.kind === "audio";
  });
}

interface DirectionInspectorProps {
  readonly statement: Extract<StoryStatement, { readonly kind: "direction" }>;
  readonly assetIndex: AssetIndex;
  readonly disabled: boolean;
  readonly createCommandId: () => string;
  readonly dispatch: (action: StudioAction) => void;
}

function DirectionInspector({
  statement,
  assetIndex,
  disabled,
  createCommandId,
  dispatch
}: DirectionInspectorProps) {
  const inspection = inspectDirectiveArguments(statement.summary);
  const [form, setForm] = useState<DirectionForm>(() => ({ ...inspection.parameters }));
  const action = resolveDirectiveAction(statement.command, form.action);
  const assetRequired = action !== undefined && directiveActionRequiresAsset(statement.command, action);
  const compatibleAssets = compatibleDirectionAssets(statement.command, assetIndex.assets);
  const assetId = form.asset ?? "";
  const assetKnown = !assetRequired || compatibleAssets.some((entry) => entry.assetId === assetId);
  const transitionAsset = form.transitionAsset ?? "";
  const transitionAssetKnown = !assetRequired || transitionAsset.length === 0 || assetIndex.assets.some((entry) => entry.assetId === transitionAsset);
  const duration = statement.command === "audio" ? (form.fade ?? "") : (form.duration ?? "");
  const durationValid = !assetRequired || duration.length === 0 || /^\d+(?:\.\d+)?(?:ms|s)$/.test(duration);
  const volumeValid = !assetRequired || statement.command !== "audio" || form.volume === undefined || form.volume.length === 0 ||
    (/^\d+(?:\.\d+)?$/.test(form.volume) && Number(form.volume) >= 0 && Number(form.volume) <= 1);
  const busValid = statement.command !== "audio" || ["voice", "bgm", "sfx", "ambient"].includes(form.bus ?? "");
  const slot = form.slot ?? "primary";
  const slotValid = statement.command !== "show" || SAFE_STAGE_SLOT.test(slot);
  const z = form.z === undefined || form.z.length === 0 ? 0 : Number(form.z);
  const zValid = !assetRequired || statement.command !== "show" || Number.isInteger(z) && z >= MIN_STAGE_Z && z <= MAX_STAGE_Z;
  const canApply = !disabled && inspection.duplicateKeys.length === 0 && action !== undefined && assetKnown && busValid && slotValid && zValid &&
    transitionAssetKnown && durationValid && volumeValid;

  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fieldPatch = (keys: readonly string[]) => Object.fromEntries(
    keys.map((key) => [key, (form[key] ?? "").trim() || null])
  );
  const keys = statement.command === "background"
    ? ["action", "asset", "transition", "transitionAsset", "duration"]
    : statement.command === "show"
      ? ["action", "asset", "slot", "z", "expression", "position", "transition", "transitionAsset", "duration"]
      : ["action", "asset", "bus", "loop", "volume", "fade", "transitionAsset"];
  const inactiveResourcePatch = statement.command === "background"
    ? { asset: null, transition: null, transitionAsset: null, duration: null }
    : statement.command === "show"
      ? { asset: null, z: null, expression: null, position: null, transition: null, transitionAsset: null, duration: null }
      : { asset: null, loop: null, volume: null, fade: null, transitionAsset: null };

  return (
    <form className="direction-inspector" onSubmit={(event) => {
      event.preventDefault();
      if (!canApply) return;
      dispatch({
        type: "patch-direction",
        commandId: createCommandId(),
        statementId: statement.id,
        parameters: {
          ...fieldPatch(keys),
          action: action ?? null,
          ...(!assetRequired ? inactiveResourcePatch : {})
        },
        removeLegacyPositional: inspection.positional.length > 0
      });
    }}>
      <div className="direction-inspector__hero">
        <span className={`direction-command direction-command--${statement.command}`}>@{statement.command}</span>
        <div>
          <strong>图形化演出参数</strong>
          <small>稳定 ID 局部提交 · Index r{assetIndex.indexRevision}</small>
        </div>
      </div>

      {inspection.positional.length > 0 && (
        <div className="migration-notice" role="status">
          <strong>检测到旧式描述</strong>
          <span>{inspection.positional.join(" ")}</span>
          <small>应用时会明确迁移为类型化参数；未知 key=value 与插件元数据继续保留。</small>
        </div>
      )}
      {inspection.duplicateKeys.length > 0 && (
        <p className="direction-error" role="alert">重复参数需要先在 Script 中处理：{inspection.duplicateKeys.join("、")}</p>
      )}

      <div className="direction-field">
        <label htmlFor={`direction-action-${statement.id}`}>动作</label>
        <select id={`direction-action-${statement.id}`} aria-label="演出动作" value={action ?? ""} disabled={disabled} onChange={(event) => setField("action", event.target.value)}>
          {directiveActionOptions(statement.command).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      {assetRequired && <div className="direction-field direction-field--wide">
        <label htmlFor={`direction-asset-${statement.id}`}>主资源</label>
        <input
          id={`direction-asset-${statement.id}`}
          aria-label="演出主资源"
          list={`direction-assets-${statement.id}`}
          value={assetId}
          disabled={disabled}
          placeholder={compatibleAssets.length === 0 ? "先导入兼容资源" : "选择或输入 Asset ID"}
          onChange={(event) => setField("asset", event.target.value)}
        />
        <datalist id={`direction-assets-${statement.id}`}>
          {compatibleAssets.map((entry) => <option key={entry.assetId} value={entry.assetId}>{entry.displayName} · {entry.kind}</option>)}
        </datalist>
        <small className={assetId.length > 0 && !assetKnown ? "is-error" : ""}>
          {compatibleAssets.length === 0
            ? `Asset Index 中没有可用于 @${statement.command} 的资源`
            : assetId.length === 0
              ? `${compatibleAssets.length} 个兼容资源可选`
              : assetKnown ? "资源类型与索引均已验证" : "该 ID 不存在或资源类型不兼容"}
        </small>
      </div>}

      {statement.command !== "audio" && assetRequired && (
        <div className="direction-field">
          <label htmlFor={`direction-transition-${statement.id}`}>过渡</label>
          <select id={`direction-transition-${statement.id}`} aria-label="演出过渡" value={form.transition ?? ""} disabled={disabled} onChange={(event) => setField("transition", event.target.value)}>
            <option value="">无</option><option value="fade">Fade</option><option value="dissolve">Dissolve</option><option value="slide">Slide</option>
          </select>
        </div>
      )}
      {statement.command === "show" && <>
        <div className="direction-field"><label htmlFor={`direction-slot-${statement.id}`}>角色槽位</label><input id={`direction-slot-${statement.id}`} aria-label="角色槽位" value={slot} disabled={disabled} placeholder="primary" onChange={(event) => setField("slot", event.target.value)} />{!slotValid && <small className="is-error">需为稳定标识符</small>}</div>
        {assetRequired && <><div className="direction-field"><label htmlFor={`direction-z-${statement.id}`}>层级</label><input id={`direction-z-${statement.id}`} aria-label="角色层级" type="number" min={MIN_STAGE_Z} max={MAX_STAGE_Z} value={form.z ?? ""} disabled={disabled} placeholder="0" onChange={(event) => setField("z", event.target.value)} />{!zValid && <small className="is-error">范围 {MIN_STAGE_Z}–{MAX_STAGE_Z}</small>}</div>
        <div className="direction-field"><label htmlFor={`direction-expression-${statement.id}`}>表情</label><input id={`direction-expression-${statement.id}`} aria-label="角色表情" value={form.expression ?? ""} disabled={disabled} placeholder="smile" onChange={(event) => setField("expression", event.target.value)} /></div>
        <div className="direction-field"><label htmlFor={`direction-position-${statement.id}`}>位置</label><select id={`direction-position-${statement.id}`} aria-label="角色位置" value={form.position ?? ""} disabled={disabled} onChange={(event) => setField("position", event.target.value)}><option value="">默认</option><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></div></>}
      </>}
      {statement.command === "audio" && <>
        <div className="direction-field"><label htmlFor={`direction-bus-${statement.id}`}>音轨</label><select id={`direction-bus-${statement.id}`} aria-label="音频总线" value={form.bus ?? ""} disabled={disabled} onChange={(event) => setField("bus", event.target.value)}><option value="">请选择</option><option value="voice">Voice</option><option value="bgm">BGM</option><option value="sfx">SFX</option><option value="ambient">Ambient</option></select></div>
        {assetRequired && <><div className="direction-field"><label htmlFor={`direction-loop-${statement.id}`}>循环</label><select id={`direction-loop-${statement.id}`} aria-label="音频循环" value={form.loop ?? ""} disabled={disabled} onChange={(event) => setField("loop", event.target.value)}><option value="">默认</option><option value="true">开启</option><option value="false">关闭</option></select></div>
        <div className="direction-field"><label htmlFor={`direction-volume-${statement.id}`}>音量 0–1</label><input id={`direction-volume-${statement.id}`} aria-label="音频音量" inputMode="decimal" value={form.volume ?? ""} disabled={disabled} placeholder="1" onChange={(event) => setField("volume", event.target.value)} /></div></>}
      </>}
      {assetRequired && <div className="direction-field">
        <label htmlFor={`direction-duration-${statement.id}`}>{statement.command === "audio" ? "淡入/淡出" : "时长"}</label>
        <input id={`direction-duration-${statement.id}`} aria-label="演出时长" value={duration} disabled={disabled} placeholder="300ms / 0.5s" onChange={(event) => setField(statement.command === "audio" ? "fade" : "duration", event.target.value)} />
        {!durationValid && <small className="is-error">必须带 ms 或 s 单位</small>}
      </div>}
      {assetRequired && <div className="direction-field direction-field--wide">
        <label htmlFor={`direction-transition-asset-${statement.id}`}>过渡资源（可选）</label>
        <input id={`direction-transition-asset-${statement.id}`} aria-label="过渡资源" list={`transition-assets-${statement.id}`} value={transitionAsset} disabled={disabled} placeholder="可选 Asset ID" onChange={(event) => setField("transitionAsset", event.target.value)} />
        <datalist id={`transition-assets-${statement.id}`}>{assetIndex.assets.map((entry) => <option key={entry.assetId} value={entry.assetId}>{entry.displayName}</option>)}</datalist>
        {!transitionAssetKnown && <small className="is-error">过渡资源不在 Asset Index 中</small>}
      </div>}
      <div className="direction-inspector__actions">
        <span>{inspection.duplicateKeys.length === 0 ? "未知参数保持原样" : "提交已锁定"}</span>
        <button type="submit" disabled={!canApply}>
          {inspection.positional.length > 0 ? "迁移旧描述并应用" : "应用演出参数"}
        </button>
      </div>
    </form>
  );
}

interface BatchDirectionPanelProps {
  readonly statements: readonly Extract<StoryStatement, { readonly kind: "direction" }>[];
  readonly sceneDirections: readonly Extract<StoryStatement, { readonly kind: "direction" }>[];
  readonly selectionPositions: readonly number[];
  readonly assetIndex: AssetIndex;
  readonly disabled: boolean;
  readonly createCommandId: () => string;
  readonly dispatch: (action: StudioAction) => void;
  readonly onSelectSameCommand: () => void;
  readonly onClearSelection: () => void;
  readonly onSelectLane: (command: StageDirectionCommand) => void;
  readonly onFillRange: () => void;
  readonly selectionNotice: string | null;
}

function BatchDirectionPanel({ statements, sceneDirections, selectionPositions, assetIndex, disabled, createCommandId, dispatch, onSelectSameCommand, onClearSelection, onSelectLane, onFillRange, selectionNotice }: BatchDirectionPanelProps) {
  const command = statements[0]?.command;
  const sameCommand = command !== undefined && statements.every((statement) => statement.command === command);
  const withinLimit = statements.length <= MAX_DIRECTIVE_BATCH_TARGETS;
  const sameCommandSceneCount = command === undefined ? 0 : sceneDirections.filter((statement) => statement.command === command).length;
  const canSelectSameCommand = command !== undefined && sameCommandSceneCount <= MAX_DIRECTIVE_BATCH_TARGETS;
  const parameters = command === undefined ? [] : BATCH_DIRECTION_PARAMETERS[command];
  const [parameter, setParameter] = useState<BatchDirectionParameter>(parameters[0] ?? "transition");
  const [mode, setMode] = useState<"set" | "remove">("set");
  const [value, setValue] = useState("");
  const tokenValid = /^[^\s=@()]+$/.test(value) && value.length <= 256;
  const valueValid = mode === "remove" || (
    parameter === "transition" ? ["fade", "dissolve", "slide"].includes(value) :
      parameter === "position" ? ["left", "center", "right"].includes(value) :
        parameter === "loop" ? ["true", "false"].includes(value) :
          parameter === "duration" || parameter === "fade" ? /^\d+(?:\.\d+)?(?:ms|s)$/.test(value) :
            parameter === "volume" ? /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= 0 && Number(value) <= 1 :
              parameter === "transitionAsset" ? assetIndex.assets.some((entry) => entry.assetId === value) : tokenValid
  );
  const inspectedTargets = statements.map((statement) => ({
    statement,
    inspection: inspectDirectiveArguments(statement.summary)
  }));
  const targetValue = mode === "remove" ? undefined : value;
  const conflictCount = inspectedTargets.filter(({ inspection }) => inspection.duplicateKeys.includes(parameter)).length;
  const unchangedCount = valueValid ? inspectedTargets.filter(({ inspection }) => inspection.parameters[parameter] === targetValue).length : 0;
  const changedCount = valueValid ? statements.length - unchangedCount - conflictCount : 0;
  const canApply = !disabled && statements.length >= 2 && withinLimit && sameCommand && valueValid && conflictCount === 0 && changedCount > 0;
  const positionSummary = selectionPositions.length <= 6
    ? selectionPositions.map((position) => `#${position}`).join("、")
    : `#${selectionPositions[0]}–#${selectionPositions[selectionPositions.length - 1]}`;
  const changeParameter = (next: BatchDirectionParameter) => {
    setParameter(next);
    setValue("");
  };

  return (
    <form className="batch-direction" aria-label="批量演出参数" onSubmit={(event) => {
      event.preventDefault();
      if (!canApply) return;
      dispatch({
        type: "patch-directions",
        commandId: createCommandId(),
        statementIds: statements.map((statement) => statement.id),
        parameters: { [parameter]: mode === "remove" ? null : value }
      });
    }}>
      <div className="batch-direction__heading">
        <div><span className="eyebrow">ATOMIC BATCH</span><strong>{statements.length} 个 Cue · 单步撤销</strong></div>
        <span className={sameCommand ? `direction-command direction-command--${command}` : "direction-command"}>{sameCommand ? `@${command}` : command === undefined ? "尚未选择" : "类型不一致"}</span>
      </div>
      <div className="batch-direction__selection" aria-label="批量选择范围">
        <span><strong>{statements.length}</strong> 已选</span>
        <span>{positionSummary.length > 0 ? `场景步骤 ${positionSummary}` : "尚未选择 Cue"}</span>
        <div>
          <button type="button" disabled={disabled || !canSelectSameCommand} onClick={onSelectSameCommand}>选择本场景同类</button>
          <button type="button" disabled={disabled || statements.length < 2 || !sameCommand} onClick={onFillRange}>填充首尾范围</button>
          <button type="button" disabled={disabled || statements.length === 0} onClick={onClearSelection}>清空选择</button>
        </div>
      </div>
      <div className="batch-direction__lanes" aria-label="按轨道选择演出">
        <span>按轨道替换选择</span>
        <button type="button" disabled={disabled} onClick={() => onSelectLane("background")}>BG · {sceneDirections.filter((item) => item.command === "background").length}</button>
        <button type="button" disabled={disabled} onClick={() => onSelectLane("show")}>CHAR · {sceneDirections.filter((item) => item.command === "show").length}</button>
        <button type="button" disabled={disabled} onClick={() => onSelectLane("audio")}>AUDIO · {sceneDirections.filter((item) => item.command === "audio").length}</button>
      </div>
      {selectionNotice !== null && <p className="batch-direction__notice" role="status" aria-live="polite">{selectionNotice}</p>}
      {!canSelectSameCommand && command !== undefined && <p className="direction-error" role="alert">本场景共有 {sameCommandSceneCount} 个 @{command} Cue，超过单批上限，未自动截断选择。</p>}
      {!withinLimit ? (
        <p className="direction-error" role="alert">单次最多修改 {MAX_DIRECTIVE_BATCH_TARGETS} 个 Cue；当前选择不会被部分修改。</p>
      ) : statements.length < 2 ? (
        <p className="batch-direction__hint">{command === undefined ? "请选择至少两个同类 Cue 后再预检。" : `再选择至少一个 @${command} Cue 后才能批量提交。`}</p>
      ) : !sameCommand ? (
        <p className="direction-error" role="alert">批量参数只允许同一种演出类型；当前选择不会被部分修改。</p>
      ) : (
        <div className="batch-direction__fields">
          <label><span>参数</span><select aria-label="批量演出参数名" value={parameter} disabled={disabled} onChange={(event) => changeParameter(event.target.value as BatchDirectionParameter)}>{parameters.map((item) => <option key={item} value={item}>{BATCH_PARAMETER_LABELS[item]}</option>)}</select></label>
          <label><span>操作</span><select aria-label="批量演出参数操作" value={mode} disabled={disabled} onChange={(event) => setMode(event.target.value as "set" | "remove")}><option value="set">设置</option><option value="remove">移除</option></select></label>
          {mode === "set" && <label className="batch-direction__value"><span>值</span>{parameter === "transition" ? <select aria-label="批量演出参数值" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}><option value="">请选择</option><option value="fade">Fade</option><option value="dissolve">Dissolve</option><option value="slide">Slide</option></select> : parameter === "position" ? <select aria-label="批量演出参数值" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}><option value="">请选择</option><option value="left">左</option><option value="center">中</option><option value="right">右</option></select> : parameter === "loop" ? <select aria-label="批量演出参数值" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}><option value="">请选择</option><option value="true">开启</option><option value="false">关闭</option></select> : <input aria-label="批量演出参数值" list={parameter === "transitionAsset" ? "batch-transition-assets" : undefined} value={value} disabled={disabled} placeholder={parameter === "duration" || parameter === "fade" ? "300ms / 0.5s" : parameter === "volume" ? "0–1" : "输入单 token"} onChange={(event) => setValue(event.target.value)} />}{parameter === "transitionAsset" && <datalist id="batch-transition-assets">{assetIndex.assets.map((entry) => <option key={entry.assetId} value={entry.assetId}>{entry.displayName}</option>)}</datalist>}</label>}
          <button type="submit" disabled={!canApply}>原子应用 {changedCount} 项修改</button>
        </div>
      )}
      {statements.length >= 2 && sameCommand && valueValid && <div className="batch-direction__preflight" role="status" aria-live="polite">
        <span aria-label={`${changedCount} 将修改`}><strong>{changedCount}</strong> 将修改</span>
        <span aria-label={`${unchangedCount} 已一致`}><strong>{unchangedCount}</strong> 已一致</span>
        <span aria-label={`${conflictCount} 冲突`} className={conflictCount > 0 ? "is-conflict" : undefined}><strong>{conflictCount}</strong> 冲突</span>
      </div>}
      <small>{conflictCount > 0 ? "检测到重复参数；真实提交会整批拒绝，请先在 Script 中消除歧义。" : mode === "remove" ? "移除只影响所选参数，未知参数与原始排版保持不变。" : value.length > 0 && !valueValid ? "值未通过类型或资源索引校验。" : changedCount === 0 && valueValid && statements.length >= 2 ? "全部目标已经一致，不会创建空 revision。" : "任一目标失败则整批零写入。"}</small>
    </form>
  );
}

interface DirectionInsertPanelProps {
  readonly command: DirectionCommand;
  readonly afterId: string;
  readonly assetIndex: AssetIndex;
  readonly disabled: boolean;
  readonly createCommandId: () => string;
  readonly createEntityId: (prefix: "stmt" | "txt") => string;
  readonly dispatch: (action: StudioAction) => void;
  readonly onClose: () => void;
}

function DirectionInsertPanel({ command, afterId, assetIndex, disabled, createCommandId, createEntityId, dispatch, onClose }: DirectionInsertPanelProps) {
  const defaultAction = resolveDirectiveAction(command, undefined)!;
  const [action, setAction] = useState(defaultAction);
  const [asset, setAsset] = useState("");
  const [slot, setSlot] = useState("primary");
  const [z, setZ] = useState("0");
  const [bus, setBus] = useState("bgm");
  const compatibleAssets = compatibleDirectionAssets(command, assetIndex.assets);
  const assetRequired = directiveActionRequiresAsset(command, action);
  const assetValid = !assetRequired || compatibleAssets.some((entry) => entry.assetId === asset);
  const slotValid = command !== "show" || SAFE_STAGE_SLOT.test(slot);
  const zNumber = Number(z);
  const zValid = command !== "show" || !assetRequired || Number.isInteger(zNumber) && zNumber >= MIN_STAGE_Z && zNumber <= MAX_STAGE_Z;
  const canSubmit = !disabled && assetValid && slotValid && zValid;
  const commandLabel = command === "background" ? "背景" : command === "show" ? "角色" : "音频";

  return (
    <form className={`direction-insert direction-insert--${command}`} aria-label={`新增${commandLabel}演出`} onSubmit={(event) => {
      event.preventDefault();
      if (!canSubmit) return;
      const parameters: Record<string, string> = { action };
      if (assetRequired) parameters.asset = asset;
      if (command === "show") {
        parameters.slot = slot;
        if (assetRequired) parameters.z = z;
      }
      if (command === "audio") {
        parameters.bus = bus;
        if (assetRequired) {
          parameters.loop = "false";
          parameters.volume = "1";
        }
      }
      dispatch({ type: "insert-direction", commandId: createCommandId(), afterId, statementId: createEntityId("stmt"), command, parameters });
      onClose();
    }} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="direction-insert__heading">
        <div><span className={`track-command track-command--${command}`}>@{command}</span><strong>新增{commandLabel}演出</strong></div>
        <button type="button" aria-label="关闭演出插入面板" onClick={onClose}>×</button>
      </div>
      <p>插入锚点 <code>{afterId}</code></p>
      <div className="direction-insert__fields">
        <label><span>动作</span><select aria-label="新增演出动作" value={action} disabled={disabled} onChange={(event) => setAction(event.target.value as typeof action)}>{directiveActionOptions(command).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        {assetRequired && <label className="direction-insert__asset"><span>资源</span><input aria-label="新增演出资源" list={`insert-assets-${command}`} value={asset} disabled={disabled} placeholder={compatibleAssets.length === 0 ? "请先导入兼容资源" : "选择 Asset ID"} onChange={(event) => setAsset(event.target.value)} /><datalist id={`insert-assets-${command}`}>{compatibleAssets.map((entry) => <option key={entry.assetId} value={entry.assetId}>{entry.displayName}</option>)}</datalist></label>}
        {command === "show" && <label><span>槽位</span><input aria-label="新增角色槽位" value={slot} disabled={disabled} onChange={(event) => setSlot(event.target.value)} /></label>}
        {command === "show" && assetRequired && <label><span>层级</span><input aria-label="新增角色层级" type="number" min={MIN_STAGE_Z} max={MAX_STAGE_Z} value={z} disabled={disabled} onChange={(event) => setZ(event.target.value)} /></label>}
        {command === "audio" && <label><span>总线</span><select aria-label="新增音频总线" value={bus} disabled={disabled} onChange={(event) => setBus(event.target.value)}><option value="voice">Voice</option><option value="bgm">BGM</option><option value="sfx">SFX</option><option value="ambient">Ambient</option></select></label>}
      </div>
      {!assetValid && <small className="is-error">请选择 Asset Index 中类型兼容的资源</small>}
      {!slotValid && <small className="is-error">槽位必须是稳定标识符</small>}
      {!zValid && <small className="is-error">层级必须是 {MIN_STAGE_Z}–{MAX_STAGE_Z} 的整数</small>}
      <div className="direction-insert__actions"><span>提交后写回权威脚本并自动选中新步骤</span><button type="submit" disabled={!canSubmit}>插入演出</button></div>
    </form>
  );
}

function stageLane(statement: StoryStatement): "background" | "character" | "audio" | "story" {
  if (statement.kind !== "direction") return "story";
  return statement.command === "background" ? "background" : statement.command === "show" ? "character" : "audio";
}

function WriterView({
  session,
  dispatch,
  createCommandId,
  createEntityId,
  onInputDirtyChange,
  assetIndex
}: WriterViewProps) {
  const scene = findScene(session.project, session.activeSceneId);
  const selected = findStatement(session.project, scene.id, session.selectedStatementId);
  const selectedIndex = scene.statements.findIndex((statement) => statement.id === selected.id);
  const previousAnchor =
    selectedIndex <= 1 ? scene.id : (scene.statements[selectedIndex - 2]?.id ?? scene.id);
  const nextStatement = scene.statements[selectedIndex + 1];
  const pendingDraft = hasPendingDraft(session);
  const [insertCommand, setInsertCommand] = useState<DirectionCommand | null>(null);
  const [draggedDirectionId, setDraggedDirectionId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedDirectionIds, setSelectedDirectionIds] = useState<readonly string[]>([]);
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [stageWindowStart, setStageWindowStart] = useState(0);
  const [stageSearchQuery, setStageSearchQuery] = useState("");
  const [activeStageSearchResult, setActiveStageSearchResult] = useState(0);
  const [pendingStageFocusId, setPendingStageFocusId] = useState<string | null>(null);
  const stageWindow = createStageWindow(scene.statements.length, stageWindowStart);
  const visibleStatements = scene.statements.slice(stageWindow.start, stageWindow.end);
  const selectedInStageWindow = selectedIndex >= stageWindow.start && selectedIndex < stageWindow.end;
  const stageSearchIndex = useMemo(() => createStageSearchIndex(scene.statements), [scene.statements]);
  const stageSearch = useMemo(() => searchStageIndex(stageSearchIndex, stageSearchQuery), [stageSearchIndex, stageSearchQuery]);
  const resolvedStageSearchResult = Math.min(activeStageSearchResult, Math.max(0, stageSearch.matches.length - 1));
  const selectedSearchMatch = stageSearch.matches[resolvedStageSearchResult];
  const canMoveDirectionLeft = !multiSelectMode && selected.kind === "direction" && selectedIndex > 0 && !pendingDraft;
  const canMoveDirectionRight = !multiSelectMode && selected.kind === "direction" && nextStatement !== undefined && nextStatement.kind !== "end" && !pendingDraft;
  const selectedDirections = scene.statements.filter(
    (statement): statement is Extract<StoryStatement, { readonly kind: "direction" }> =>
      statement.kind === "direction" && selectedDirectionIds.includes(statement.id)
  );
  const sceneDirections = scene.statements.filter(
    (statement): statement is Extract<StoryStatement, { readonly kind: "direction" }> => statement.kind === "direction"
  );
  const selectionPositions = scene.statements.flatMap((statement, index) =>
    selectedDirectionIds.includes(statement.id) ? [index + 1] : []
  );
  const moveDirection = (statementId: string, afterId: string) => dispatch({
    type: "move-direction",
    commandId: createCommandId(),
    statementId,
    afterId
  });
  const deleteDirection = (statementId: string) => dispatch({
    type: "delete-direction",
    commandId: createCommandId(),
    statementId
  });
  const jumpToStageSearchMatch = (match: StageSearchMatch | undefined) => {
    if (match === undefined || draggedDirectionId !== null) return;
    setStageWindowStart(revealStageIndex(stageWindow, match.index).start);
    setPendingStageFocusId(match.statementId);
    dispatch({ type: "select-statement", statementId: match.statementId });
  };
  const cycleStageSearchResult = (direction: -1 | 1) => {
    if (stageSearch.matches.length === 0 || draggedDirectionId !== null) return;
    const next = (activeStageSearchResult + direction + stageSearch.matches.length) % stageSearch.matches.length;
    setActiveStageSearchResult(next);
    jumpToStageSearchMatch(stageSearch.matches[next]);
  };
  const toggleMultiSelect = () => {
    const next = !multiSelectMode;
    setMultiSelectMode(next);
    setSelectedDirectionIds(next && selected.kind === "direction" ? [selected.id] : []);
    setRangeAnchorId(next && selected.kind === "direction" ? selected.id : null);
    setSelectionNotice(null);
  };
  const selectionFailureLabel = (code: "SELECTION_TARGET_NOT_FOUND" | "SELECTION_MIXED_COMMANDS" | "SELECTION_LIMIT") =>
    code === "SELECTION_MIXED_COMMANDS" ? "范围首尾必须是同一种演出类型；选择保持不变。" :
      code === "SELECTION_LIMIT" ? `选择超过 ${MAX_DIRECTIVE_BATCH_TARGETS} 个 Cue；未进行截断。` :
        "范围锚点已经失效；请重新点选起点。";
  const toggleDirectionSelection = (statementId: string, rangeRequested: boolean) => {
    if (rangeRequested && rangeAnchorId !== null) {
      const result = selectStageDirectionRange(sceneDirections, rangeAnchorId, statementId, MAX_DIRECTIVE_BATCH_TARGETS);
      if (!result.ok) {
        setSelectionNotice(selectionFailureLabel(result.error.code));
        return;
      }
      setSelectedDirectionIds(result.statementIds);
      setSelectionNotice(`已从范围锚点选择 ${result.statementIds.length} 个 @${result.command} Cue。`);
      return;
    }
    setRangeAnchorId(statementId);
    setSelectionNotice(null);
    setSelectedDirectionIds((current) => current.includes(statementId)
      ? current.filter((item) => item !== statementId)
      : [...current, statementId]);
  };
  useEffect(() => {
    setMultiSelectMode(false);
    setSelectedDirectionIds([]);
    setRangeAnchorId(null);
    setSelectionNotice(null);
    setStageWindowStart(0);
    setStageSearchQuery("");
    setActiveStageSearchResult(0);
    setPendingStageFocusId(null);
  }, [scene.id]);
  useEffect(() => {
    setActiveStageSearchResult(0);
  }, [stageSearchQuery, stageSearch.totalMatches]);
  useEffect(() => {
    setStageWindowStart((current) => revealStageIndex(
      createStageWindow(scene.statements.length, current),
      selectedIndex
    ).start);
  }, [scene.statements.length, selectedIndex]);
  useEffect(() => {
    const valid = new Set(scene.statements.filter((statement) => statement.kind === "direction").map((statement) => statement.id));
    setSelectedDirectionIds((current) => current.filter((statementId) => valid.has(statementId)));
    setRangeAnchorId((current) => current !== null && valid.has(current) ? current : null);
  }, [scene.statements]);
  useEffect(() => {
    if (pendingStageFocusId === null) return;
    const target = document.getElementById(`statement-card-${pendingStageFocusId}`);
    if (target instanceof HTMLElement) {
      target.focus();
      setPendingStageFocusId(null);
    }
  }, [pendingStageFocusId, selected.id, stageWindow.start]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.altKey || pendingDraft) return;
      const command = event.key === "1" ? "background" : event.key === "2" ? "show" : event.key === "3" ? "audio" : null;
      if (command === null) return;
      event.preventDefault();
      setInsertCommand(command);
    };
    globalThis.addEventListener("keydown", shortcut);
    return () => globalThis.removeEventListener("keydown", shortcut);
  }, [pendingDraft]);

  return (
    <section className="authoring-panel view-enter" aria-labelledby="writer-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">WRITER · STABLE-ID PATCH</p>
          <h2 id="writer-heading">{scene.title}</h2>
        </div>
        <span className="context-chip">权威脚本投影</span>
      </div>

      <div className="statement-toolbar" aria-label="对白结构工具">
        <button
          disabled={selected.kind !== "dialogue" || pendingDraft}
          onClick={() => {
            if (selected.kind !== "dialogue") return;
            dispatch({
              type: "insert-dialogue",
              commandId: createCommandId(),
              afterId: selected.id,
              statementId: createEntityId("stmt"),
              textId: createEntityId("txt"),
              speakerId: selected.speakerId,
              text: "新对白"
            });
          }}
        >
          ＋ 插入对白
        </button>
        <button
          aria-label="对白上移"
          disabled={selected.kind !== "dialogue" || selectedIndex === 0 || pendingDraft}
          onClick={() =>
            dispatch({
              type: "move-dialogue",
              commandId: createCommandId(),
              statementId: selected.id,
              afterId: previousAnchor
            })
          }
        >
          ↑
        </button>
        <button
          aria-label="对白下移"
          disabled={selected.kind !== "dialogue" || nextStatement === undefined || pendingDraft}
          onClick={() => {
            if (nextStatement === undefined) return;
            dispatch({
              type: "move-dialogue",
              commandId: createCommandId(),
              statementId: selected.id,
              afterId: nextStatement.id
            });
          }}
        >
          ↓
        </button>
        <button
          className="danger-button"
          disabled={selected.kind !== "dialogue" || pendingDraft}
          onClick={() =>
            dispatch({
              type: "delete-dialogue",
              commandId: createCommandId(),
              statementId: selected.id
            })
          }
        >
          删除
        </button>
      </div>

      <section className="stage-track" aria-label="图形化演出轨道" data-window-size={stageWindow.size} data-rendered-statements={visibleStatements.length}>
        <div className="stage-track__heading">
          <div><span className="eyebrow">STAGE TRACK</span><strong>演出层级概览</strong></div>
          <div className="stage-track__tools">
            <div className="stage-track__actions" aria-label="当前演出指令操作">
              <button type="button" aria-label="演出左移" disabled={!canMoveDirectionLeft} onClick={() => {
                if (selected.kind === "direction") moveDirection(selected.id, previousAnchor);
              }}>←</button>
              <button type="button" aria-label="演出右移" disabled={!canMoveDirectionRight} onClick={() => {
                if (selected.kind === "direction" && nextStatement !== undefined) moveDirection(selected.id, nextStatement.id);
              }}>→</button>
              <button type="button" aria-label="复制演出" disabled={multiSelectMode || selected.kind !== "direction" || pendingDraft} onClick={() => {
                if (selected.kind === "direction") dispatch({ type: "duplicate-direction", commandId: createCommandId(), statementId: selected.id, newStatementId: createEntityId("stmt") });
              }}>复制</button>
              <button type="button" aria-label={multiSelectMode ? "结束演出多选" : "开始演出多选"} aria-pressed={multiSelectMode} disabled={pendingDraft} onClick={toggleMultiSelect}>{multiSelectMode ? `${selectedDirectionIds.length} 已选` : "多选"}</button>
              <button type="button" className="is-danger" aria-label="删除演出" disabled={multiSelectMode || selected.kind !== "direction" || pendingDraft} onClick={() => {
                if (selected.kind === "direction") deleteDirection(selected.id);
              }}>删除</button>
            </div>
            <div className="stage-track__insert" aria-label="新增演出指令">
              <button type="button" aria-keyshortcuts="Alt+1" disabled={pendingDraft} onClick={() => setInsertCommand("background")}>＋ 背景</button>
              <button type="button" aria-keyshortcuts="Alt+2" disabled={pendingDraft} onClick={() => setInsertCommand("show")}>＋ 角色</button>
              <button type="button" aria-keyshortcuts="Alt+3" disabled={pendingDraft} onClick={() => setInsertCommand("audio")}>＋ 音频</button>
            </div>
          </div>
        </div>
        <form className="stage-search" role="search" aria-label="搜索当前场景步骤" onSubmit={(event: FormEvent) => {
          event.preventDefault();
          jumpToStageSearchMatch(selectedSearchMatch);
        }}>
          <label htmlFor="stage-step-search">定位步骤</label>
          <div className="stage-search__input">
            <span aria-hidden="true">⌕</span>
            <input
              id="stage-step-search"
              type="search"
              value={stageSearchQuery}
              placeholder="步骤号、Statement ID 或对白"
              autoComplete="off"
              aria-controls="stage-search-results"
              aria-describedby="stage-search-status"
              onChange={(event) => setStageSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  cycleStageSearchResult(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  cycleStageSearchResult(-1);
                } else if (event.key === "Escape") {
                  setStageSearchQuery("");
                }
              }}
            />
          </div>
          <output id="stage-search-status" aria-live="polite">
            {stageSearch.query.length === 0 ? "输入后搜索已提交场景" : stageSearch.totalMatches === 0 ? "没有匹配步骤" : `${resolvedStageSearchResult + 1} / ${stageSearch.totalMatches} 项`}
          </output>
          <div className="stage-search__nav" aria-label="搜索结果导航">
            <button type="button" aria-label="上一个搜索结果" disabled={stageSearch.matches.length === 0 || draggedDirectionId !== null} onClick={() => cycleStageSearchResult(-1)}>↑</button>
            <button type="submit" disabled={selectedSearchMatch === undefined || draggedDirectionId !== null}>跳转</button>
            <button type="button" aria-label="下一个搜索结果" disabled={stageSearch.matches.length === 0 || draggedDirectionId !== null} onClick={() => cycleStageSearchResult(1)}>↓</button>
          </div>
          {stageSearch.query.length > 0 && <div id="stage-search-results" className="stage-search__results" role="listbox" aria-label="当前场景搜索结果">
            {stageSearch.matches.map((match, resultIndex) => (
              <button
                type="button"
                role="option"
                aria-selected={resultIndex === resolvedStageSearchResult}
                disabled={draggedDirectionId !== null}
                key={match.statementId}
                onClick={() => {
                  setActiveStageSearchResult(resultIndex);
                  jumpToStageSearchMatch(match);
                }}
              >
                <span>#{match.index + 1}</span><strong>{match.label}</strong><code>{match.statementId}</code>
              </button>
            ))}
            {stageSearch.matches.length === 0 && <p>尝试输入 #65、stmt_… 或对白片段</p>}
            {stageSearch.truncated && <p>仅展示前 {stageSearch.matches.length} 项，结果总数仍完整统计。</p>}
          </div>}
          {pendingDraft && <small>当前 Script 草稿尚未提交；搜索继续使用最后一次有效场景。</small>}
        </form>
        <div className="stage-track__window" role="group" aria-label="演出轨道可视窗口">
          <button type="button" aria-label="上一段演出步骤" disabled={!stageWindow.hasPrevious || draggedDirectionId !== null} onClick={() => setStageWindowStart(moveStageWindow(stageWindow, -1).start)}>← 上一段</button>
          <output aria-live="polite">步骤 {stageWindow.total === 0 ? 0 : stageWindow.start + 1}–{stageWindow.end} / {stageWindow.total}</output>
          <button type="button" aria-label="下一段演出步骤" disabled={!stageWindow.hasNext || draggedDirectionId !== null} onClick={() => setStageWindowStart(moveStageWindow(stageWindow, 1).start)}>下一段 →</button>
          <button type="button" aria-label="定位当前演出步骤" disabled={selectedInStageWindow || draggedDirectionId !== null} onClick={() => setStageWindowStart(revealStageIndex(stageWindow, selectedIndex).start)}>定位当前</button>
          <small>窗口外选择仍保留 · 拖放仅限当前窗口</small>
        </div>
        <div className="stage-track__scroll">
          {(["background", "character", "audio", "story"] as const).map((lane) => (
            <div className={`stage-lane stage-lane--${lane}`} key={lane}>
              <span className="stage-lane__label">{lane === "background" ? "BG" : lane === "character" ? "CHAR" : lane === "audio" ? "AUDIO" : "STORY"}</span>
              <div className="stage-lane__steps">
                {visibleStatements.map((statement, visibleIndex) => {
                  const index = stageWindow.start + visibleIndex;
                  return stageLane(statement) === lane ? (
                  <button
                    type="button"
                    key={statement.id}
                    draggable={statement.kind === "direction" && !pendingDraft && !multiSelectMode}
                    data-dragging={draggedDirectionId === statement.id ? "true" : undefined}
                    className={`${statement.id === selected.id ? "stage-cue is-active" : "stage-cue"}${selectedDirectionIds.includes(statement.id) ? " is-batch-selected" : ""}`}
                    aria-label={`轨道步骤 ${index + 1}：${statementLabel(statement)}`}
                    aria-pressed={multiSelectMode && statement.kind === "direction" ? selectedDirectionIds.includes(statement.id) : undefined}
                    aria-keyshortcuts={statement.kind === "direction" ? multiSelectMode ? "Shift+Space" : "Alt+ArrowLeft Alt+ArrowRight Delete" : undefined}
                    onClick={(event) => {
                      if (multiSelectMode && statement.kind === "direction") toggleDirectionSelection(statement.id, event.shiftKey);
                      else dispatch({ type: "select-statement", statementId: statement.id });
                    }}
                    onDragStart={(event) => {
                      if (statement.kind !== "direction" || pendingDraft) return;
                      setDraggedDirectionId(statement.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", statement.id);
                    }}
                    onDragEnd={() => setDraggedDirectionId(null)}
                    onDragOver={(event) => {
                      const carriesDirection = draggedDirectionId !== null || event.dataTransfer.types.includes("text/plain");
                      if (carriesDirection && draggedDirectionId !== statement.id) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = draggedDirectionId ?? event.dataTransfer.getData("text/plain");
                      setDraggedDirectionId(null);
                      if (sourceId.length > 0 && sourceId !== statement.id) moveDirection(sourceId, statement.id);
                    }}
                    onKeyDown={(event) => {
                      if (statement.kind !== "direction" || pendingDraft) return;
                      if (multiSelectMode) {
                        if (event.shiftKey && (event.key === " " || event.key === "Enter")) {
                          event.preventDefault();
                          toggleDirectionSelection(statement.id, true);
                          return;
                        }
                        if (event.key === "Delete" || event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) event.preventDefault();
                        return;
                      }
                      if (event.altKey && event.key === "ArrowLeft" && index > 0) {
                        event.preventDefault();
                        const anchor = index <= 1 ? scene.id : (scene.statements[index - 2]?.id ?? scene.id);
                        moveDirection(statement.id, anchor);
                      } else if (event.altKey && event.key === "ArrowRight" && scene.statements[index + 1] !== undefined && scene.statements[index + 1]?.kind !== "end") {
                        event.preventDefault();
                        moveDirection(statement.id, scene.statements[index + 1]!.id);
                      } else if (event.key === "Delete") {
                        event.preventDefault();
                        deleteDirection(statement.id);
                      }
                    }}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span><strong>{statement.kind === "direction" ? `@${statement.command}` : statementKindLabel(statement)}</strong>
                  </button>
                ) : <span className="stage-cue stage-cue--empty" aria-hidden="true" key={`${statement.id}:empty`} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {multiSelectMode && <BatchDirectionPanel
        key={`${scene.id}:${selectedDirections[0]?.command ?? "empty"}:${selectedDirections.every((item) => item.command === selectedDirections[0]?.command) ? "same" : "mixed"}`}
        statements={selectedDirections}
        sceneDirections={sceneDirections}
        selectionPositions={selectionPositions}
        assetIndex={assetIndex}
        disabled={pendingDraft}
        createCommandId={createCommandId}
        dispatch={dispatch}
        onSelectSameCommand={() => {
          const command = selectedDirections[0]?.command;
          if (command === undefined) return;
          const ids = sceneDirections.filter((statement) => statement.command === command).map((statement) => statement.id);
          if (ids.length <= MAX_DIRECTIVE_BATCH_TARGETS) {
            setSelectedDirectionIds(ids);
            setSelectionNotice(`已选择本场景全部 ${ids.length} 个 @${command} Cue。`);
          }
        }}
        onClearSelection={() => {
          setSelectedDirectionIds([]);
          setRangeAnchorId(null);
          setSelectionNotice("已清空选择；权威脚本没有变化。");
        }}
        onSelectLane={(command) => {
          const result = selectStageDirectionLane(sceneDirections, command, MAX_DIRECTIVE_BATCH_TARGETS);
          if (!result.ok) {
            setSelectionNotice(selectionFailureLabel(result.error.code));
            return;
          }
          setSelectedDirectionIds(result.statementIds);
          setRangeAnchorId(result.statementIds[0] ?? null);
          setSelectionNotice(result.statementIds.length === 0 ? "该轨道没有 Cue；选择已清空。" : `已选择该轨道全部 ${result.statementIds.length} 个 Cue。`);
        }}
        onFillRange={() => {
          const selectedInScene = sceneDirections.filter((statement) => selectedDirectionIds.includes(statement.id));
          const first = selectedInScene[0];
          const last = selectedInScene[selectedInScene.length - 1];
          if (first === undefined || last === undefined) return;
          const result = selectStageDirectionRange(sceneDirections, first.id, last.id, MAX_DIRECTIVE_BATCH_TARGETS);
          if (!result.ok) {
            setSelectionNotice(selectionFailureLabel(result.error.code));
            return;
          }
          setSelectedDirectionIds(result.statementIds);
          setRangeAnchorId(first.id);
          setSelectionNotice(`已填充首尾范围，共 ${result.statementIds.length} 个 @${result.command} Cue。`);
        }}
        selectionNotice={selectionNotice}
      />}

      {insertCommand !== null && <DirectionInsertPanel
        key={`${insertCommand}:${selected.id}`}
        command={insertCommand}
        afterId={selected.id}
        assetIndex={assetIndex}
        disabled={pendingDraft}
        createCommandId={createCommandId}
        createEntityId={createEntityId}
        dispatch={dispatch}
        onClose={() => setInsertCommand(null)}
      />}

      <div className="statement-list" aria-label={`剧情步骤，当前显示 ${stageWindow.start + 1} 至 ${stageWindow.end}，共 ${stageWindow.total} 步`}>
        {visibleStatements.map((statement, visibleIndex) => {
          const index = stageWindow.start + visibleIndex;
          return (
          <button
            id={`statement-card-${statement.id}`}
            key={statement.id}
            className={
              statement.id === session.selectedStatementId
                ? `statement-card statement-card--${statement.kind} is-active`
                : `statement-card statement-card--${statement.kind}`
            }
            onClick={() => dispatch({ type: "select-statement", statementId: statement.id })}
            aria-label={`选择${statementKindLabel(statement)}：${statementLabel(statement)}`}
          >
            <span className="statement-order">{String(index + 1).padStart(2, "0")}</span>
            <span className="statement-kind">{statementKindLabel(statement)}</span>
            <span className="statement-copy">{statementLabel(statement)}</span>
          </button>
        );
        })}
      </div>

      <div className="inline-inspector">
        <div className="inspector-label-row">
          {selected.kind === "dialogue" ? (
            <label htmlFor="dialogue-editor">对白内容</label>
          ) : (
            <span className="inspector-title">当前步骤（只读）</span>
          )}
          <code>{selected.id}</code>
        </div>
        {selected.kind === "dialogue" ? (
          <TransactionalTextarea
            id="dialogue-editor"
            value={selected.text}
            rows={4}
            disabled={pendingDraft}
            onDirtyChange={onInputDirtyChange}
            onCommit={(text) =>
              dispatch({
                type: "patch-dialogue",
                commandId: createCommandId(),
                statementId: selected.id,
                text
              })
            }
          />
        ) : selected.kind === "direction" ? (
          <DirectionInspector
            key={`${selected.id}:${selected.summary}`}
            statement={selected}
            assetIndex={assetIndex}
            disabled={pendingDraft}
            createCommandId={createCommandId}
            dispatch={dispatch}
          />
        ) : (
          <div className="readonly-step">{statementLabel(selected)}</div>
        )}
        <p className="field-help">
          Writer 不直接修改模型；每次编辑都通过稳定 ID Patch 写回权威脚本，再重新投影。
        </p>
      </div>
    </section>
  );
}

interface ScriptViewProps extends CommonProps {
  readonly createCommandId: () => string;
  readonly inputDirty: boolean;
  readonly onInputDirtyChange: (dirty: boolean) => void;
}

function ScriptView({
  session,
  dispatch,
  createCommandId,
  inputDirty,
  onInputDirtyChange
}: ScriptViewProps) {
  const sourceSession = activeSourceSession(session);
  const source = activeSourceDraft(session);
  const diagnostics = session.diagnostics[session.activeSceneId] ?? [];
  const pendingDraft = hasPendingDraft(session);
  return (
    <section className="script-panel view-enter" aria-labelledby="script-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">SCRIPT · CANONICAL SOURCE</p>
          <h2 id="script-heading">文本脚本</h2>
        </div>
        <span className={pendingDraft ? "context-chip context-chip--draft" : "context-chip"}>
          {pendingDraft
            ? "草稿隔离中"
            : inputDirty
              ? "输入批次未提交"
              : `已提交 · r${sourceSession.revision}`}
        </span>
      </div>

      <div className="script-toolbar">
        <span>WORLD SCRIPT · UTF-8 · Ctrl/Cmd+S 提交 · Esc 回退</span>
        <div>
          <button
            disabled={pendingDraft}
            onClick={() => dispatch({ type: "format-script", commandId: createCommandId() })}
          >
            格式化
          </button>
          <button
            className="danger-button"
            disabled={!pendingDraft}
            onClick={() => dispatch({ type: "discard-draft" })}
          >
            丢弃草稿
          </button>
        </div>
      </div>
      <TransactionalTextarea
        className="script-editor"
        aria-label="权威脚本编辑器"
        value={source}
        spellCheck={false}
        onDirtyChange={onInputDirtyChange}
        onEscapeWhenClean={pendingDraft ? () => dispatch({ type: "discard-draft" }) : undefined}
        onCommit={(nextSource) =>
          dispatch({
            type: "edit-script",
            commandId: createCommandId(),
            source: nextSource
          })
        }
      />

      <div className={diagnostics.length === 0 ? "diagnostics-console is-clear" : "diagnostics-console"}>
        <div className="diagnostics-heading">
          <strong>{diagnostics.length === 0 ? "0 个阻断问题" : `${diagnostics.length} 个诊断`}</strong>
          <span>{pendingDraft ? "PREVIEW LOCKED" : "PROJECTION READY"}</span>
        </div>
        {diagnostics.length === 0 ? (
          <p>语法、稳定 ID 与项目引用检查通过。</p>
        ) : (
          <ul>
            {diagnostics.map((item, index) => (
              <li key={`${item.code}:${item.line ?? 0}:${index}`}>
                <code>{item.code}</code>
                <span>{item.line === undefined ? "" : `L${item.line} · `}{item.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FlowView({ session, dispatch }: CommonProps) {
  const graph = useMemo(() => deriveRouteGraph(session.project), [session.project]);
  return (
    <section className="flow-panel view-enter" aria-labelledby="flow-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">FLOW · DERIVED VIEW</p>
          <h2 id="flow-heading">自动路线图</h2>
        </div>
        <span className="context-chip context-chip--cyan">无语义副本</span>
      </div>
      <div className="flow-canvas">
        <div className="flow-grid" aria-label="路线节点">
          {graph.nodes.map((node, index) => (
            <button
              key={node.id}
              className={node.id === session.activeSceneId ? `route-node route-node--${node.kind} is-active` : `route-node route-node--${node.kind}`}
              style={{ "--node-order": index } as CSSProperties}
              onClick={() => dispatch({ type: "select-scene", sceneId: node.id })}
            >
              <span className="route-node__kind">
                {node.kind === "entry" ? "入口" : node.kind === "ending" ? "结局" : "场景"}
              </span>
              <strong>{node.title}</strong>
              <code>{node.id}</code>
            </button>
          ))}
        </div>
        <div className="edge-list" aria-label="路线连接">
          <p className="eyebrow">CONNECTIONS</p>
          {graph.edges.map((edge) => (
            <div className="edge-row" key={edge.id}>
              <span>{edge.sourceSceneId}</span><span className="edge-arrow">→</span>
              <strong>{edge.label}</strong><span className="edge-arrow">→</span>
              <span>{edge.targetSceneId}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface PreviewPanelProps extends CommonProps {
  readonly inputDirty: boolean;
  readonly assetIndex: AssetIndex;
  readonly assetRepository: IndexedDbAssetRepository | null;
}

type PreviewMediaViewState =
  | { readonly status: "loading"; readonly planKey: string }
  | { readonly status: "ready"; readonly media: LoadedPreviewMedia };

function PreviewAudioLayer({ layer }: { readonly layer: PreviewAudioLayerPlan & { readonly url: string } }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<"starting" | "playing" | "paused" | "blocked" | "error">(
    layer.playback === "paused" ? "paused" : "starting"
  );
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio === null) return;
      audio.pause();
      audio.removeAttribute("src");
    };
  }, [layer.url]);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (layer.playback === "paused") {
      audio.pause();
      setStatus("paused");
      return;
    }
    audio.volume = layer.volume;
    void audio.play().catch(() => setStatus("blocked"));
  }, [layer.playback, layer.volume]);
  return <>
    <audio
      ref={audioRef}
      src={layer.url}
      autoPlay={layer.playback === "playing"}
      loop={layer.loop}
      data-testid={`preview-audio-${layer.bus}`}
      onCanPlay={(event) => {
        event.currentTarget.volume = layer.volume;
        if (layer.playback === "playing") void event.currentTarget.play().catch(() => setStatus("blocked"));
      }}
      onPlay={() => setStatus("playing")}
      onError={() => setStatus("error")}
    />
    <button
      type="button"
      className={`stage-audio-chip stage-audio-chip--${status}`}
      aria-label={`${layer.bus} 音轨${status === "playing" ? "播放中" : status === "paused" ? "已暂停" : "启用播放"}`}
      onClick={() => {
        const audio = audioRef.current;
        if (audio === null || status === "playing" || layer.playback === "paused") return;
        audio.volume = layer.volume;
        void audio.play().catch(() => setStatus("blocked"));
      }}
    >
      {layer.bus.toUpperCase()} · {status === "playing" ? "播放中" : status === "paused" ? "已暂停" : status === "blocked" ? "点击启用" : status === "error" ? "重试播放" : "准备中"}
    </button>
  </>;
}

function PreviewPanel({ session, dispatch, inputDirty, assetIndex, assetRepository }: PreviewPanelProps) {
  const [viewportProfileId, setViewportProfileId] = useState<PreviewViewportProfileId>(
    DEFAULT_PREVIEW_VIEWPORT_ID
  );
  const [customViewport, setCustomViewport] = useState({ width: 1920, height: 1080 });
  const [transport, transportDispatch] = useReducer(
    reducePreviewTransport,
    undefined,
    createPreviewTransportState
  );
  const selectedPreset = findPreviewViewportPreset(viewportProfileId);
  const viewport = viewportProfileId === "custom" ? {
    id: "custom" as const,
    label: "自定义尺寸",
    ratioLabel: formatPreviewRatio(customViewport.width, customViewport.height),
    width: customViewport.width,
    height: customViewport.height,
    orientation: customViewport.width >= customViewport.height ? "landscape" as const : "portrait" as const
  } : selectedPreset;
  const scene = findScene(session.project, session.activeSceneId);
  const statement = scene.statements[session.previewIndex];
  if (statement === undefined) throw new Error(`Preview index is outside scene: ${session.previewIndex}`);
  const speaker = statement.kind === "dialogue"
    ? findCharacter(session.project.characters, statement.speakerId)
    : undefined;
  const sourceSession = activeSourceSession(session);
  const pendingDraft = hasPendingDraft(session);
  const showBufferedNotice = inputDirty && session.notice.tone !== "error";
  const transportBlocked = pendingDraft || inputDirty;
  const transportBarrier = previewTransportBarrier(
    statement,
    session.previewIndex,
    scene.statements.length,
    transportBlocked
  );
  const speedProfile = findPreviewSpeedProfile(transport.speedId);
  const previousTransportSceneId = useRef(session.activeSceneId);
  const stageTimeline = useMemo(() => compilePreviewStageTimeline(scene.statements), [scene.statements]);
  const stagePlan = stageTimeline[session.previewIndex] ?? derivePreviewStagePlan([], 0);
  const urlFactory = useMemo<PreviewUrlFactory>(browserPreviewUrlFactory, []);
  const [mediaView, setMediaView] = useState<PreviewMediaViewState>({
    status: "loading",
    planKey: stagePlan.resourceKey
  });

  useEffect(() => {
    const controller = new AbortController();
    let owned: LoadedPreviewMedia | undefined;
    const requiresRepository = stagePlan.background !== undefined || stagePlan.characters.length > 0 || stagePlan.audio.length > 0;
    setMediaView({ status: "loading", planKey: stagePlan.resourceKey });
    if (assetRepository === null && requiresRepository) {
      setMediaView({
        status: "ready",
        media: {
          planKey: stagePlan.resourceKey,
          characters: [],
          audio: [],
          errors: [...stagePlan.diagnostics, "Preview Asset repository is unavailable"],
          objectUrls: []
        }
      });
      return () => controller.abort();
    }
    const reader = assetRepository ?? { read: async () => null };
    void loadPreviewMedia(stagePlan, assetIndex, reader, urlFactory, controller.signal)
      .then((media) => {
        if (controller.signal.aborted) {
          releasePreviewMedia(media, urlFactory);
          return;
        }
        owned = media;
        setMediaView({ status: "ready", media });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setMediaView({
          status: "ready",
          media: {
            planKey: stagePlan.resourceKey,
            characters: [],
            audio: [],
            errors: [...stagePlan.diagnostics, error instanceof Error ? error.message : "Preview media load failed"],
            objectUrls: []
          }
        });
      });
    return () => {
      controller.abort();
      if (owned !== undefined) releasePreviewMedia(owned, urlFactory);
    };
  }, [assetIndex, assetRepository, stagePlan.resourceKey, urlFactory]);

  const loadedMedia = mediaView.status === "ready" && mediaView.media.planKey === stagePlan.resourceKey
    ? mediaView.media
    : undefined;

  useEffect(() => {
    if (previousTransportSceneId.current === session.activeSceneId) return;
    previousTransportSceneId.current = session.activeSceneId;
    transportDispatch({ type: "reset" });
  }, [session.activeSceneId]);

  useEffect(() => {
    if (!transportBlocked && transport.stopReason === "blocked") {
      transportDispatch({ type: "reset" });
    }
  }, [transportBlocked, transport.stopReason]);

  useEffect(() => {
    if (transport.mode !== "playing") return;
    if (transportBarrier !== undefined) {
      transportDispatch({ type: "pause", reason: transportBarrier });
      return;
    }
    const timer = setTimeout(() => {
      dispatch({ type: "step-preview", direction: 1 });
    }, previewStepDelayMs(statement, transport.speedId));
    return () => clearTimeout(timer);
  }, [
    dispatch,
    session.activeSceneId,
    statement.id,
    transport.mode,
    transport.speedId,
    transportBarrier
  ]);

  const togglePlayback = () => {
    if (transport.mode === "playing") {
      transportDispatch({ type: "pause", reason: "manual" });
      return;
    }
    if (transportBarrier !== undefined) {
      transportDispatch({ type: "pause", reason: transportBarrier });
      return;
    }
    transportDispatch({ type: "play" });
  };

  const stepPreview = (direction: -1 | 1) => {
    transportDispatch({ type: "pause", reason: "manual-step" });
    dispatch({ type: "step-preview", direction });
  };

  const transportStatus = transport.mode === "playing"
    ? `运行中 · ${speedProfile.label}`
    : previewStopReasonLabel(transport.stopReason ?? transportBarrier);
  return (
    <aside className="preview-panel" aria-labelledby="preview-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">LIVE PREVIEW</p><h2 id="preview-heading">即时预览</h2></div>
        <span className={pendingDraft ? "live-badge is-locked" : inputDirty ? "live-badge is-buffered" : "live-badge"}>
          {pendingDraft ? "LOCKED" : inputDirty ? "BUFFER" : "LIVE"}
        </span>
      </div>
      <div className="preview-size-toolbar">
        <label htmlFor="preview-viewport-profile">预览尺寸</label>
        <select
          id="preview-viewport-profile"
          value={viewportProfileId}
          onChange={(event) => setViewportProfileId(event.target.value as PreviewViewportProfileId)}
        >
          {PREVIEW_VIEWPORT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.ratioLabel} · {preset.label}
            </option>
          ))}
          <option value="custom">自定义 · 精确尺寸</option>
        </select>
        <span>{viewport.width} × {viewport.height}</span>
      </div>
      {viewportProfileId === "custom" && (
        <div className="preview-custom-size" aria-label="自定义预览尺寸">
          <label>
            <span>宽</span>
            <input
              aria-label="自定义预览宽度"
              type="number"
              min={MIN_PREVIEW_DIMENSION}
              max={MAX_PREVIEW_DIMENSION}
              value={customViewport.width}
              onChange={(event) => setCustomViewport((current) => ({
                ...current,
                width: normalizePreviewDimension(event.target.valueAsNumber, current.width)
              }))}
            />
          </label>
          <span aria-hidden="true">×</span>
          <label>
            <span>高</span>
            <input
              aria-label="自定义预览高度"
              type="number"
              min={MIN_PREVIEW_DIMENSION}
              max={MAX_PREVIEW_DIMENSION}
              value={customViewport.height}
              onChange={(event) => setCustomViewport((current) => ({
                ...current,
                height: normalizePreviewDimension(event.target.valueAsNumber, current.height)
              }))}
            />
          </label>
          <output aria-label="自定义预览比例">{viewport.ratioLabel}</output>
        </div>
      )}
      <div className="stage-viewport">
        <div
          className={`stage-preview stage-preview--${viewport.orientation}`}
          data-testid="preview-stage"
          data-preview-profile={viewport.id}
          data-preview-width={viewport.width}
          data-preview-height={viewport.height}
          style={{ "--preview-aspect": `${viewport.width} / ${viewport.height}` } as CSSProperties}
        >
          <div className="stage-chrome"><span>{scene.title}</span><span>{viewport.ratioLabel} · Balanced</span></div>
          {loadedMedia?.background === undefined ? (
            <div className="stage-sky" aria-hidden="true">
              <span className="sun" /><span className="school-building" />
              <span className="character-silhouette character-silhouette--left" />
              <span className="character-silhouette character-silhouette--right" />
            </div>
          ) : (
            <img
              className={`stage-media-background stage-transition--${loadedMedia.background.transition ?? "none"}`}
              data-testid="preview-background"
              src={loadedMedia.background.url}
              alt={`背景资源 ${loadedMedia.background.assetId}`}
              style={{ animationDuration: loadedMedia.background.duration ?? "360ms" }}
            />
          )}
          {loadedMedia?.characters.map((character) => (
            <img
              key={character.slot}
              className={`stage-media-character stage-media-character--${character.position ?? "center"} stage-transition--${character.transition ?? "none"}`}
              data-testid={`preview-character-${character.slot}`}
              data-stage-slot={character.slot}
              src={character.url}
              alt={`角色资源 ${character.assetId}${character.expression === undefined ? "" : ` · ${character.expression}`}`}
              style={{ animationDuration: character.duration ?? "360ms", zIndex: character.z ?? 0 }}
            />
          ))}
          <div className="stage-audio-stack" aria-live="polite">
            {loadedMedia?.audio.map((layer) => {
              const playback = stagePlan.audio.find((candidate) => candidate.bus === layer.bus)?.playback ?? layer.playback;
              return <PreviewAudioLayer key={`${layer.bus}:${layer.statementId}:${layer.url}`} layer={{ ...layer, playback }} />;
            })}
          </div>
          {mediaView.status === "loading" && <div className="stage-media-loading" role="status">正在验证预览资源…</div>}
          {loadedMedia !== undefined && loadedMedia.errors.length > 0 && (
            <div className="stage-media-errors" role="status">
              <strong>安全占位</strong><span>{loadedMedia.errors.length} 项资源未执行</span>
            </div>
          )}
          <div className="stage-content" key={statement.id} data-testid="preview-step">
            {statement.kind === "dialogue" && (
              <div className="dialogue-box">
                <span className="speaker-name" style={{ "--speaker-color": speaker?.color ?? "#8B7CFF" } as CSSProperties}>
                  {speaker?.displayName ?? "未知角色"}
                </span>
                <p>{statement.text}</p>
              </div>
            )}
            {statement.kind === "direction" && <div className="stage-note"><span>演出指令</span><strong>{statement.summary}</strong></div>}
            {statement.kind === "choice" && (
              <div className="choice-preview"><strong>{statement.prompt}</strong>{statement.options.map((option) => <span key={option.id}>{option.label}</span>)}</div>
            )}
            {statement.kind === "end" && <div className="ending-preview"><span>ENDING</span><strong>{statement.endingName}</strong></div>}
          </div>
        </div>
      </div>
      <div className="preview-transport">
        <button aria-label="上一步" onClick={() => stepPreview(-1)} disabled={session.previewIndex === 0}>←</button>
        <div><strong>{session.previewIndex + 1} / {scene.statements.length}</strong><small>{statementKindLabel(statement)} · {statement.id}</small></div>
        <button aria-label="下一步" onClick={() => stepPreview(1)} disabled={session.previewIndex === scene.statements.length - 1}>→</button>
      </div>
      <div className="preview-playback" aria-label="预览运行控制">
        <button
          className={transport.mode === "playing" ? "preview-playback__toggle is-playing" : "preview-playback__toggle"}
          onClick={togglePlayback}
          disabled={transport.mode !== "playing" && transportBarrier !== undefined}
          aria-label={transport.mode === "playing" ? "暂停预览" : "开始预览"}
        >
          <span aria-hidden="true">{transport.mode === "playing" ? "Ⅱ" : "▶"}</span>
          {transport.mode === "playing" ? "暂停" : "运行"}
        </button>
        <label>
          <span>测试倍率</span>
          <select
            aria-label="预览测试倍率"
            value={transport.speedId}
            onChange={(event) => transportDispatch({
              type: "set-speed",
              speedId: event.target.value as PreviewSpeedId
            })}
          >
            {PREVIEW_SPEED_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </label>
        <output className={`preview-playback__status preview-playback__status--${transport.mode}`} aria-live="polite">
          {transportStatus}
        </output>
      </div>
      <div className={`diagnostic-card diagnostic-card--${showBufferedNotice ? "draft" : session.notice.tone}`} aria-live="polite">
        <span className="diagnostic-icon" aria-hidden="true">{showBufferedNotice ? "…" : session.notice.tone === "success" ? "✓" : session.notice.tone === "draft" ? "!" : "×"}</span>
        <div>
          <strong>{showBufferedNotice ? "输入批次尚未提交" : session.notice.title}</strong>
          <p>{showBufferedNotice ? "Preview 保持最后有效投影；停止输入、失焦或按 Ctrl/Cmd+S 后提交。" : session.notice.detail}</p>
        </div>
      </div>
      <div className="transaction-strip">
        <span>r{sourceSession.revision}</span><span>semantic {sourceSession.semanticRevision}</span><span>{sourceSession.tombstones.length} tombstone</span>
      </div>
      {sourceSession.tombstones.length > 0 && (
        <div className="tombstone-list" aria-label="已删除步骤记录">
          <p className="eyebrow">TOMBSTONES</p>
          {sourceSession.tombstones.slice(-3).map((item) => <code key={item.statementId}>{item.statementId}</code>)}
        </div>
      )}
    </aside>
  );
}

export function App() {
  const [session, baseDispatch] = useReducer(reduceStudioSession, undefined, createStudioSession);
  const [mode, setMode] = useState<StudioMode>("writer");
  const [inputDirty, setInputDirty] = useState(false);
  const storageAvailable = typeof globalThis.indexedDB !== "undefined";
  const [assetIndex, setAssetIndex] = useState<AssetIndex>(createAssetIndex);
  const assetIndexRef = useRef(assetIndex);
  assetIndexRef.current = assetIndex;
  const [assetLifecycle, setAssetLifecycle] = useState<AssetLifecycleManifest>(() =>
    createAssetLifecycleManifest(createAssetIndex(), Date.now())
  );
  const [assetLifecycleDetail, setAssetLifecycleDetail] = useState("血缘清单已校验；没有执行不可逆删除。");
  const [dicingReport, setDicingReport] = useState<LosslessDicingDiscoveryReport | null>(null);
  const [dicingAnalyzing, setDicingAnalyzing] = useState(false);
  const [dicingPublishingGroupId, setDicingPublishingGroupId] = useState<string | null>(null);
  const [dicingRuntimeVerifyingGroupId, setDicingRuntimeVerifyingGroupId] = useState<string | null>(null);
  const [runtimeSchedulingGroupId, setRuntimeSchedulingGroupId] = useState<string | null>(null);
  const [storyPredictionGroupId, setStoryPredictionGroupId] = useState<string | null>(null);
  const [resourceCompilingGroupId, setResourceCompilingGroupId] = useState<string | null>(null);
  const [assetBackupAuditReady, setAssetBackupAuditReady] = useState(false);
  const [linkedAssetBackupIds, setLinkedAssetBackupIds] = useState<readonly string[]>([]);
  const [unlinkedAssetBackupIds, setUnlinkedAssetBackupIds] = useState<readonly string[]>([]);
  const [assetStatus, setAssetStatus] = useState<AssetVaultStatus>(
    storageAvailable ? "loading" : "unavailable"
  );
  const [assetImportState, setAssetImportState] = useState<AssetImportViewState>(IDLE_ASSET_IMPORT);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const assetRepositoryRef = useRef<IndexedDbAssetRepository | null>(null);
  const assetImportAbortRef = useRef<AbortController | null>(null);
  const dicingAnalysisAbortRef = useRef<AbortController | null>(null);
  const assetFileSerial = useRef(0);
  const [persistence, setPersistence] = useState<PersistenceViewState>(() =>
    storageAvailable ? { status: "loading", revision: 0 } : { status: "unavailable", revision: 0 }
  );
  const storeRef = useRef<IndexedDbProjectFileStore | null>(null);
  const leaseRef = useRef<ProjectWriterLease | null>(null);
  const leaseOwnerId = useRef(createBrowserWriterLeaseOwnerId());
  const [leaseRetry, setLeaseRetry] = useState(0);
  const storageRevision = useRef(0);
  const persistedSnapshotRef = useRef<ProjectSnapshot | null>(null);
  const saveSerial = useRef(0);
  const saveInFlight = useRef(false);
  const autosaveSuspended = useRef(false);
  const editGeneration = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [editVersion, setEditVersion] = useState(0);
  const [backupPanelOpen, setBackupPanelOpen] = useState(false);
  const [backups, setBackups] = useState<readonly ProjectBackup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);

  useEffect(() => {
    if (!backupPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBackupPanelOpen(false);
    };
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [backupPanelOpen]);
  useEffect(() => {
    if (!assetPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && assetImportAbortRef.current === null) setAssetPanelOpen(false);
    };
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [assetPanelOpen]);
  const commandSerial = useRef(0);
  const entitySerial = useRef(0);
  const dispatch = (action: StudioAction) => {
    baseDispatch(action);
    if ([
      "edit-script", "patch-dialogue", "patch-direction", "patch-directions", "insert-dialogue", "insert-direction", "duplicate-direction", "delete-dialogue",
      "move-dialogue", "delete-direction", "move-direction", "format-script", "discard-draft", "undo", "redo"
    ].includes(action.type)) {
      editGeneration.current += 1;
      setEditVersion((value) => value + 1);
      setPersistence((current) => current.status === "unavailable" || current.status === "conflict" ||
        current.status === "readonly" || current.status === "blocked" || current.status === "loading" ||
        current.status === "migrating"
        ? current
        : current.status === "saving" || current.status === "autosaving"
          ? current
          : current.status === "degraded"
            ? current
            : {
                status: "dirty",
                revision: current.revision,
                ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount })
              });
    }
  };
  const createCommandId = () => `cmd_ui_${++commandSerial.current}`;
  const createEntityId = (prefix: "stmt" | "txt") => {
    const used = new Set<string>();
    for (const scene of sessionRef.current.project.scenes) {
      used.add(scene.id);
      for (const statement of scene.statements) {
        used.add(statement.id);
        if (statement.kind === "dialogue") used.add(statement.textId);
        if (statement.kind === "choice") for (const option of statement.options) used.add(option.id);
      }
    }
    for (const sourceSession of Object.values(sessionRef.current.sourceSessions)) {
      for (const tombstone of sourceSession.tombstones) {
        used.add(tombstone.statementId);
        if (tombstone.kind === "dialogue") used.add(tombstone.textId);
      }
    }
    let candidate: string;
    do candidate = `${prefix}_ui_${++entitySerial.current}`; while (used.has(candidate));
    return candidate;
  };

  useEffect(() => {
    if (!storageAvailable) return;
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const store = new IndexedDbProjectFileStore(globalThis.indexedDB, "prj_twilight_broadcast");
    const assetRepository = new IndexedDbAssetRepository(globalThis.indexedDB, "prj_twilight_broadcast");
    setPersistence({ status: "loading", revision: storageRevision.current });
    setAssetStatus("loading");

    const loseLease = (detail: string) => {
      store.activateWriterLease(null);
      assetRepository.activateWriterLease(null);
      leaseRef.current = null;
      storeRef.current = null;
      assetRepositoryRef.current = null;
      assetImportAbortRef.current?.abort();
      assetImportAbortRef.current = null;
      dicingAnalysisAbortRef.current?.abort();
      dicingAnalysisAbortRef.current = null;
      setAssetStatus("error");
      setPersistence({
        status: "conflict",
        revision: storageRevision.current,
        detail,
        errorCode: "LEASE_LOST"
      });
    };

    const start = async () => {
      const acquisition = await store.acquire(
        leaseOwnerId.current,
        Date.now(),
        WRITER_LEASE_TTL_MS
      );
      if (cancelled) return;
      if (acquisition.status === "held") {
        setPersistence({
          status: "conflict",
          revision: storageRevision.current,
          detail: `另一编辑窗口持有写入权，最迟于 ${new Date(acquisition.holderExpiresAtMs).toLocaleTimeString()} 释放。`,
          errorCode: "LEASE_REQUIRED"
        });
        return;
      }

      leaseRef.current = acquisition.lease;
      store.activateWriterLease(acquisition.lease);
      assetRepository.activateWriterLease(acquisition.lease);
      storeRef.current = store;
      assetRepositoryRef.current = assetRepository;
      heartbeat = setInterval(() => {
        const activeLease = leaseRef.current;
        if (activeLease === null || cancelled) return;
        void store.renew(activeLease, Date.now(), WRITER_LEASE_TTL_MS).then((renewal) => {
          if (cancelled) return;
          if (renewal.status === "lost") {
            loseLease("本窗口的编辑租约已失效。请确认其他窗口后重试获取编辑权。");
            return;
          }
          leaseRef.current = renewal.lease;
          store.activateWriterLease(renewal.lease);
          assetRepository.activateWriterLease(renewal.lease);
        }).catch((error: unknown) => {
          if (cancelled) return;
          const failure = persistenceFailure(error, storageRevision.current);
          loseLease(failure.detail ?? "无法续约本窗口的编辑权。");
        });
      }, WRITER_LEASE_HEARTBEAT_MS);

      const probe = await probeProjectVersion(store);
      if (cancelled) return;
      if (probe.status === "future") {
        if (heartbeat !== undefined) clearInterval(heartbeat);
        heartbeat = undefined;
        const activeLease = leaseRef.current;
        store.activateWriterLease(null);
        assetRepository.activateWriterLease(null);
        leaseRef.current = null;
        storeRef.current = null;
        assetRepositoryRef.current = null;
        if (activeLease !== null) await store.release(activeLease).catch(() => false);
        if (cancelled) return;
        setPersistence({
          status: "readonly",
          revision: probe.storageRevision ?? 0,
          schemaVersion: probe.schemaVersion,
          ...(probe.title === undefined ? {} : { projectTitle: probe.title }),
          errorCode: "UNSUPPORTED_FUTURE_SCHEMA",
          detail: `项目使用 schema ${probe.schemaVersion}，当前编辑器仅支持到 schema ${CURRENT_PROJECT_SCHEMA_VERSION}。版本探测没有执行恢复、迁移或写入。`
        });
        return;
      }
      if (probe.status === "legacy") {
        setPersistence({
          status: "migrating",
          revision: probe.storageRevision ?? 0,
          schemaVersion: probe.schemaVersion,
          ...(probe.title === undefined ? {} : { projectTitle: probe.title }),
          detail: `正在为 schema ${probe.schemaVersion} 创建原始快照并执行连续迁移…`
        });
      }
      const migration = await migrateProjectToCurrent(store, {
        transactionId: `migration_to_v${CURRENT_PROJECT_SCHEMA_VERSION}_${++saveSerial.current}`,
        nowMs: Date.now()
      });
      const snapshot = migration?.snapshot ?? null;
      try {
        const restoreResolution = await assetRepository.resolveBackupRestoreIntent(snapshot?.storageRevision ?? 0);
        if (cancelled) return;
        setAssetIndex(restoreResolution.index);
        setAssetLifecycle(restoreResolution.manifest);
        setAssetStatus("ready");
      } catch (error) {
        if (cancelled) return;
        const code = error instanceof AssetBlobError ? error.code : undefined;
        setAssetStatus("error");
        setAssetImportState({
          phase: "error",
          progress: 0,
          detail: error instanceof Error ? error.message : "资源索引加载失败。",
          ...(code === undefined ? {} : { errorCode: code })
        });
        throw error;
      }
      if (cancelled) return;
      if (snapshot === null) {
        persistedSnapshotRef.current = null;
        try {
          const reconciliation = await assetRepository.reconcileBackupSnapshots([]);
          if (cancelled) return;
          setAssetLifecycle(reconciliation.manifest);
          setLinkedAssetBackupIds(reconciliation.linkedRecordIds);
          setUnlinkedAssetBackupIds(reconciliation.unlinkedRecordIds);
          setAssetBackupAuditReady(true);
        } catch {
          if (cancelled) return;
          setAssetBackupAuditReady(false);
        }
        setPersistence({ status: "unsaved", revision: 0, backupCount: 0 });
      } else {
        let backupCount = 0;
        let backupWarning: string | undefined;
        try {
          const loadedBackups = await loadProjectBackups(store, BACKUP_POLICY);
          backupCount = loadedBackups.length;
          setBackups(loadedBackups);
          const reconciliation = await assetRepository.reconcileBackupSnapshots(loadedBackups);
          setAssetLifecycle(reconciliation.manifest);
          setLinkedAssetBackupIds(reconciliation.linkedRecordIds);
          setUnlinkedAssetBackupIds(reconciliation.unlinkedRecordIds);
          setAssetBackupAuditReady(true);
        } catch (error) {
          setAssetBackupAuditReady(false);
          backupWarning = error instanceof Error ? `项目已恢复，但备份索引需要检查：${error.message}` :
            "项目已恢复，但备份索引需要检查。";
        }
        if (cancelled) return;
        const restored = restoreStudioSession(snapshot);
        persistedSnapshotRef.current = snapshot;
        storageRevision.current = snapshot.storageRevision;
        baseDispatch({ type: "restore-session", session: restored });
        setPersistence({
          status: "restored",
          revision: snapshot.storageRevision,
          backupCount,
          schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
          detail: backupWarning ?? (migration?.status === "migrated"
            ? `已从 schema ${migration.fromSchemaVersion} 安全迁移到 ${migration.toSchemaVersion}；原始文件归档于 ${migration.archivePath}；保留 ${migration.preservedUnknownFieldCount} 个未知字段。`
            : "项目 schema 与存储修订已校验。"),
          ...(backupWarning === undefined ? {} : { errorCode: "CORRUPT_BACKUP" })
        });
      }
    };

    void start().catch(async (error: unknown) => {
      if (cancelled) return;
      if (heartbeat !== undefined) clearInterval(heartbeat);
      heartbeat = undefined;
      const activeLease = leaseRef.current;
      store.activateWriterLease(null);
      assetRepository.activateWriterLease(null);
      leaseRef.current = null;
      storeRef.current = null;
      assetRepositoryRef.current = null;
      if (activeLease !== null) await store.release(activeLease).catch(() => false);
      if (cancelled) return;
      const failure = persistenceFailure(error, storageRevision.current);
      setPersistence({ ...failure, status: "blocked" });
    });

    const releaseOnPageHide = (event: PageTransitionEvent) => {
      const activeLease = leaseRef.current;
      if (!event.persisted && activeLease !== null) markBrowserWriterLeaseOwnerHandoff(activeLease.ownerId);
      store.activateWriterLease(null);
      assetRepository.activateWriterLease(null);
      if (storeRef.current === store) storeRef.current = null;
      if (assetRepositoryRef.current === assetRepository) assetRepositoryRef.current = null;
      leaseRef.current = null;
      assetImportAbortRef.current?.abort();
      assetImportAbortRef.current = null;
      dicingAnalysisAbortRef.current?.abort();
      dicingAnalysisAbortRef.current = null;
      if (event.persisted) {
        setPersistence({
          status: "conflict",
          revision: storageRevision.current,
          detail: "页面从后台缓存恢复后必须重新验证编辑权。",
          errorCode: "LEASE_REQUIRED"
        });
      } else if (activeLease !== null) {
        void store.release(activeLease).catch(() => undefined);
      }
    };
    const reacquireAfterPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLeaseRetry((value) => value + 1);
    };
    globalThis.addEventListener("pagehide", releaseOnPageHide);
    globalThis.addEventListener("pageshow", reacquireAfterPageShow);
    return () => {
      cancelled = true;
      if (heartbeat !== undefined) clearInterval(heartbeat);
      globalThis.removeEventListener("pagehide", releaseOnPageHide);
      globalThis.removeEventListener("pageshow", reacquireAfterPageShow);
      if (storeRef.current === store) storeRef.current = null;
      store.activateWriterLease(null);
      if (assetRepositoryRef.current === assetRepository) assetRepositoryRef.current = null;
      assetRepository.activateWriterLease(null);
      assetImportAbortRef.current?.abort();
      assetImportAbortRef.current = null;
    };
  }, [storageAvailable, leaseRetry]);

  const handleBlockingStoreFailure = (
    error: unknown,
    store: IndexedDbProjectFileStore,
    operationLabel: string
  ): boolean => {
    if (!(error instanceof ProjectStoreError) && !(error instanceof AssetBlobError)) return false;
    if (error.code === "LEASE_REQUIRED" || error.code === "LEASE_LOST") {
      store.activateWriterLease(null);
      assetRepositoryRef.current?.activateWriterLease(null);
      assetRepositoryRef.current = null;
      leaseRef.current = null;
      storeRef.current = null;
      setPersistence({
        status: "conflict",
        revision: storageRevision.current,
        detail: `${operationLabel}期间编辑权已失效；未写入不受保护的数据。请重试获取编辑权。`,
        errorCode: error.code
      });
      return true;
    }
    if (error.code === "NO_SPACE" || error.code === "PERMISSION_DENIED") {
      autosaveSuspended.current = true;
      setPersistence((current) => ({
        status: "degraded",
        revision: storageRevision.current,
        ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount }),
        errorCode: error.code,
        detail: `${error.code} · ${operationLabel}已停止，最后有效项目未被覆盖。释放空间或恢复权限后可手动重试。`
      }));
      return true;
    }
    return false;
  };

  const saveToLocal = (reason: "manual" | "auto" = "manual") => {
    const store = storeRef.current;
    const assetRepository = assetRepositoryRef.current;
    if (store === null || inputDirty || saveInFlight.current ||
        (reason === "auto" && autosaveSuspended.current)) return;
    const currentSnapshot = persistedSnapshotRef.current;
    if (currentSnapshot !== null && assetRepository === null) {
      setPersistence((current) => ({
        status: "degraded",
        revision: storageRevision.current,
        ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount }),
        errorCode: "UNAVAILABLE",
        detail: "资源备份协调器不可用；为避免创建缺少资源保护根的备份，本次保存未执行。"
      }));
      return;
    }
    saveInFlight.current = true;
    if (reason === "manual") autosaveSuspended.current = false;
    const generation = editGeneration.current;
    const nextRevision = storageRevision.current + 1;
    const snapshot = createProjectSnapshot(
      sessionRef.current,
      nextRevision,
      persistedSnapshotRef.current
    );
    const transactionId = `${reason}_save_${nextRevision}_${++saveSerial.current}`;
    const nowMs = Date.now();
    setPersistence((current) => ({
      status: reason === "auto" ? "autosaving" : "saving",
      revision: storageRevision.current,
      ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount })
    }));
    const stageBackup = currentSnapshot === null
      ? Promise.resolve(null)
      : assetRepository!.stageBackupSnapshot(
          currentSnapshot.storageRevision % BACKUP_POLICY.retention,
          currentSnapshot.storageRevision,
          nowMs
        );
    void stageBackup.then((staged) => {
      if (staged !== null) setAssetLifecycle(staged.manifest);
      return saveProjectWithBackups(store, snapshot, {
        transactionId,
        expectedStorageRevision: storageRevision.current,
        backupPolicy: BACKUP_POLICY,
        nowMs
      });
    }).then(async () => {
      persistedSnapshotRef.current = snapshot;
      storageRevision.current = nextRevision;
      let verifiedBackups = backups;
      let backupWarning: string | undefined;
      try {
        verifiedBackups = await loadProjectBackups(store, BACKUP_POLICY);
        setBackups(verifiedBackups);
        if (assetRepository !== null) {
          const reconciliation = await assetRepository.reconcileBackupSnapshots(verifiedBackups);
          setAssetLifecycle(reconciliation.manifest);
          setLinkedAssetBackupIds(reconciliation.linkedRecordIds);
          setUnlinkedAssetBackupIds(reconciliation.unlinkedRecordIds);
          setAssetBackupAuditReady(true);
        }
      } catch (error) {
        setAssetBackupAuditReady(false);
        backupWarning = error instanceof Error
          ? `项目已保存，但备份校验失败：${error.message}`
          : "项目已保存，但备份校验失败。";
      }
      const backupCount = verifiedBackups.length;
      const changedDuringSave = editGeneration.current !== generation;
      setPersistence({
        status: changedDuringSave ? "dirty" : reason === "auto" ? "autosaved" : "saved",
        revision: nextRevision,
        backupCount,
        detail: backupWarning ?? (changedDuringSave
          ? "保存期间又发生了编辑，新的内容仍在等待自动保存。"
          : `${reason === "auto" ? "自动" : "手动"}保存已校验；保留 ${backupCount}/${BACKUP_POLICY.retention} 个轮换备份。`),
        ...(backupWarning === undefined ? {} : { errorCode: "CORRUPT_BACKUP" })
      });
    }).catch((error: unknown) => {
      if (handleBlockingStoreFailure(error, store, reason === "auto" ? "自动保存" : "手动保存")) return;
      setPersistence(persistenceFailure(error, storageRevision.current));
    }).finally(() => {
      saveInFlight.current = false;
    });
  };

  useEffect(() => {
    if (inputDirty || persistence.status !== "dirty" || autosaveSuspended.current) return;
    const timer = setTimeout(() => saveToLocal("auto"), AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [editVersion, inputDirty, persistence.status]);

  const openBackups = () => {
    const store = storeRef.current;
    setBackupPanelOpen(true);
    if (store === null) return;
    setBackupsLoading(true);
    void loadProjectBackups(store, BACKUP_POLICY).then((items) => {
      setBackups(items);
      setPersistence((current) => ({ ...current, backupCount: items.length }));
      const repository = assetRepositoryRef.current;
      if (repository !== null) return repository.reconcileBackupSnapshots(items).then((reconciliation) => {
        setAssetLifecycle(reconciliation.manifest);
        setLinkedAssetBackupIds(reconciliation.linkedRecordIds);
        setUnlinkedAssetBackupIds(reconciliation.unlinkedRecordIds);
        setAssetBackupAuditReady(true);
      });
      setAssetBackupAuditReady(false);
      return undefined;
    }).catch((error: unknown) => {
      if (handleBlockingStoreFailure(error, store, "备份恢复")) return;
      setPersistence(persistenceFailure(error, storageRevision.current));
    }).finally(() => setBackupsLoading(false));
  };

  const restoreBackup = (backup: ProjectBackup) => {
    const store = storeRef.current;
    const assetRepository = assetRepositoryRef.current;
    const currentSnapshot = persistedSnapshotRef.current;
    if (store === null || assetRepository === null || currentSnapshot === null || inputDirty || saveInFlight.current) return;
    saveInFlight.current = true;
    const backupRecordId = assetBackupRecordId(backup.slot, backup.sourceStorageRevision);
    const restoresAssets = linkedAssetBackupIds.includes(backupRecordId);
    const nextRevision = storageRevision.current + 1;
    setPersistence((current) => ({
      status: "saving",
      revision: storageRevision.current,
      ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount }),
      detail: restoresAssets
        ? `正在把备份 s${backup.sourceStorageRevision} 的剧情与资源索引一致恢复为新的 s${nextRevision}…`
        : `正在把旧备份 s${backup.sourceStorageRevision} 仅恢复剧情为新的 s${nextRevision}…`
    }));
    const nowMs = Date.now();
    const prepareRestore = restoresAssets
      ? assetRepository.prepareBackupRestore(backup.slot, backup.sourceStorageRevision, storageRevision.current)
      : Promise.resolve(null);
    void prepareRestore.then(() => assetRepository.stageBackupSnapshot(
      currentSnapshot.storageRevision % BACKUP_POLICY.retention,
      currentSnapshot.storageRevision,
      nowMs
    )).then((staged) => {
      setAssetLifecycle(staged.manifest);
      return restoreProjectBackup(store, backup.slot, {
        transactionId: `restore_${nextRevision}_${++saveSerial.current}`,
        expectedStorageRevision: storageRevision.current,
        backupPolicy: BACKUP_POLICY,
        nowMs
      });
    }).then(async (result) => {
      if (restoresAssets) {
        const committed = await assetRepository.commitBackupRestore(result.snapshot.storageRevision);
        setAssetIndex(committed.index);
        setAssetLifecycle(committed.manifest);
      }
      const restored = restoreStudioSession(result.snapshot);
      persistedSnapshotRef.current = result.snapshot;
      storageRevision.current = result.snapshot.storageRevision;
      editGeneration.current += 1;
      baseDispatch({ type: "restore-session", session: restored });
      const items = await loadProjectBackups(store, BACKUP_POLICY);
      const reconciliation = await assetRepository.reconcileBackupSnapshots(items);
      setAssetLifecycle(reconciliation.manifest);
      setLinkedAssetBackupIds(reconciliation.linkedRecordIds);
      setUnlinkedAssetBackupIds(reconciliation.unlinkedRecordIds);
      setAssetBackupAuditReady(true);
      setBackups(items);
      setBackupPanelOpen(false);
      setPersistence({
        status: "restored",
        revision: result.snapshot.storageRevision,
        backupCount: items.length,
        detail: restoresAssets
          ? `已把备份 s${backup.sourceStorageRevision} 的剧情与资源索引一致恢复为新的 s${result.snapshot.storageRevision}；被替换版本仍在轮换备份中。`
          : `已把旧备份 s${backup.sourceStorageRevision} 仅恢复剧情为新的 s${result.snapshot.storageRevision}；资源索引保持当前版本。`
      });
    }).catch((error: unknown) => {
      setPersistence(persistenceFailure(error, storageRevision.current));
    }).finally(() => {
      saveInFlight.current = false;
    });
  };

  const cancelAssetImport = () => assetImportAbortRef.current?.abort();
  const closeAssetPanel = () => {
    if (assetImportAbortRef.current !== null) {
      assetImportAbortRef.current.abort();
      return;
    }
    if (dicingAnalysisAbortRef.current !== null) {
      dicingAnalysisAbortRef.current.abort();
      return;
    }
    setAssetPanelOpen(false);
  };
  const importAssetFile = (
    file: File,
    metadata: Omit<AssetImportInput, "bytes" | "mimeType">
  ) => {
    const repository = assetRepositoryRef.current;
    if (repository === null || assetImportAbortRef.current !== null) {
      setAssetStatus("error");
      setAssetImportState({
        phase: "error",
        progress: 0,
        detail: "当前窗口没有有效的资源写入权；请重新获取编辑权后再试。",
        errorCode: "LEASE_REQUIRED"
      });
      return;
    }
    const controller = new AbortController();
    assetImportAbortRef.current = controller;
    setAssetStatus("importing");
    setAssetImportState({ phase: "reading", progress: 0, detail: `正在读取 ${file.name}…` });
    void readAssetFile(file, {
      maxBytes: WEB_ASSET_IMPORT_MAX_BYTES,
      signal: controller.signal,
      onProgress: (progress) => setAssetImportState({
        phase: "reading",
        progress: progress.ratio * 0.78,
        detail: `已读取 ${formatBytes(progress.loadedBytes)} / ${formatBytes(progress.totalBytes)}`
      })
    }).then(async (bytes) => {
      const declaredMimeType = (file.type || "application/octet-stream").toLowerCase();
      setAssetImportState({ phase: "inspecting", progress: 0.8, detail: "正在隔离 Worker 中核对文件签名、结构与媒体预算…" });
      const inspected = await inspectAssetBytes(bytes, declaredMimeType, metadata.kind, controller.signal);
      setAssetImportState({
        phase: "committing",
        progress: 0.88,
        detail: `${inspected.report.format} 检查通过${inspected.report.isolation === "svg-quarantine" ? "（保持 SVG 隔离）" : ""}；正在计算 SHA-256…`
      });
      const result = await repository.importAsset({
        ...metadata,
        mimeType: inspected.report.detectedMimeType,
        bytes: inspected.bytes,
        preservedFields: {
          ...(metadata.preservedFields ?? {}),
          inspection: mediaInspectionToJson(inspected.report)
        }
      }, {
        expectedIndexRevision: assetIndexRef.current.indexRevision,
        maxBytes: WEB_ASSET_IMPORT_MAX_BYTES,
        signal: controller.signal,
        onPhase: (phase) => setAssetImportState({
          phase: "committing",
          progress: phase === "blob-ready" ? 0.92 : 0.97,
          detail: phase === "blob-ready"
            ? "Blob 已校验，正在准备原子 Index 发布…"
            : "正在提交 writer-fenced IndexedDB 事务…"
        })
      });
      setAssetIndex(result.index);
      setAssetLifecycle(result.lifecycle);
      setAssetStatus("success");
      setAssetImportState({
        phase: "success",
        progress: 1,
        detail: result.blobStatus === "existing"
          ? `媒体检查通过并复用相同 SHA-256 Blob；${result.entry.assetId} 已写入 Index r${result.index.indexRevision}。`
          : `媒体检查通过；新 Blob 与 ${result.entry.assetId} 已原子写入 Index r${result.index.indexRevision}。`
      });
    }).catch((error: unknown) => {
      const code = error instanceof AssetBlobError ? error.code : undefined;
      const wasCancelled = code === "CANCELLED" || controller.signal.aborted;
      const fatal = code === "LEASE_REQUIRED" || code === "LEASE_LOST" ||
        code === "CORRUPT_BLOB" || code === "UNSUPPORTED_INDEX_SCHEMA" ||
        code === "UNAVAILABLE" || code === "IO_FAILURE" || code === "INSPECTION_UNAVAILABLE";
      setAssetStatus(wasCancelled ? "cancelled" : fatal ? "error" : "ready");
      setAssetImportState({
        phase: wasCancelled ? "cancelled" : "error",
        progress: 0,
        detail: error instanceof Error ? error.message : "资源导入失败；现有 Blob 与 Index 未被修改。",
        ...(code === undefined ? {} : { errorCode: code })
      });
      if (code === "LEASE_REQUIRED" || code === "LEASE_LOST") {
        repository.activateWriterLease(null);
        assetRepositoryRef.current = null;
        storeRef.current?.activateWriterLease(null);
        storeRef.current = null;
        leaseRef.current = null;
        setPersistence({
          status: "conflict",
          revision: storageRevision.current,
          detail: "资源导入期间编辑权已失效；Blob 与 Index 事务已回滚。",
          errorCode: code
        });
      }
    }).finally(() => {
      if (assetImportAbortRef.current === controller) assetImportAbortRef.current = null;
    });
  };

  const runAssetLifecycleOperation = async (operation: "scan" | "sweep" | "restore", digest?: AssetLifecycleManifest["trash"][number]["digest"]) => {
    const repository = assetRepositoryRef.current;
    if (repository === null) return;
    setAssetLifecycleDetail(operation === "scan" ? "正在计算保护根可达性…" : operation === "sweep" ? "正在原子移动合格候选…" : "正在校验并恢复 Blob…");
    try {
      if (operation === "scan") {
        const result = await repository.planGarbageCollection();
        setAssetLifecycle(result.manifest);
        setAssetLifecycleDetail(result.affectedDigests.length === 0
          ? "扫描完成：所有 Blob 均受当前、历史或显式保护根保护。"
          : `扫描完成：${result.affectedDigests.length} 个不可达 Blob 已进入 24 小时隔离观察；尚未移动任何数据。`);
      } else if (operation === "sweep") {
        const result = await repository.sweepGarbageCollection();
        setAssetLifecycle(result.manifest);
        setAssetLifecycleDetail(`已将 ${result.affectedDigests.length} 个候选原子移入可恢复区；原位置不再占用活跃资源空间。`);
      } else if (digest !== undefined) {
        const manifest = await repository.restoreTrash(digest);
        setAssetLifecycle(manifest);
        setAssetLifecycleDetail("Blob 已校验并恢复；临时恢复根会阻止它立即再次进入隔离。");
      }
    } catch (error) {
      setAssetLifecycleDetail(error instanceof Error ? `操作未执行：${error.message}` : "生命周期操作未执行。");
    }
  };

  const buildAssetSidecar = async (assetId: string) => {
    const repository = assetRepositoryRef.current;
    if (repository === null) return;
    setAssetLifecycleDetail(`正在为 ${assetId} 生成确定性资源清单…`);
    try {
      const result = await repository.buildMetadataSidecar(assetId);
      setAssetLifecycle(result.manifest);
      setAssetLifecycleDetail(result.blobStatus === "existing"
        ? `${assetId} 的 Sidecar 已按相同 recipe 精确复用；没有产生重复 Blob。`
        : `${assetId} 的 Sidecar 已原子发布，并登记 Derivative 父图与 Build 根。`);
    } catch (error) {
      setAssetLifecycleDetail(error instanceof Error ? `派生任务未发布：${error.message}` : "派生任务未发布。");
    }
  };

  const buildAssetThumbnail = async (assetId: string) => {
    const repository = assetRepositoryRef.current;
    const entry = assetIndex.assets.find((candidate) => candidate.assetId === assetId);
    if (repository === null || entry === undefined) return;
    setAssetLifecycleDetail(`正在隔离 Worker 中解码并缩放 ${assetId}…`);
    try {
      const source = await repository.read(entry.source.digest);
      if (source === null) throw new AssetBlobError("CORRUPT_BLOB", "read", entry.source.digest, "缩略图源 Blob 不存在");
      const generated = await generateThumbnailInWorker(source, entry.source.mimeType, 320);
      const result = await repository.publishThumbnail(assetId, entry.source.digest, generated);
      setAssetLifecycle(result.manifest);
      setAssetLifecycleDetail(result.blobStatus === "existing"
        ? `${assetId} 的 320px PNG 缩略图已复用相同输出；未产生重复 Blob。`
        : `${assetId} 的 320px PNG 缩略图已从隔离 Worker 原子发布，并登记来源血缘。`);
    } catch (error) {
      setAssetLifecycleDetail(error instanceof Error ? `缩略图未发布：${error.message}` : "缩略图未发布。");
    }
  };

  const analyzeDicingCandidates = async () => {
    const repository = assetRepositoryRef.current;
    if (repository === null || dicingAnalysisAbortRef.current !== null) return;
    const candidates = assetIndex.assets.filter(canBuildThumbnail).slice(0, 32);
    if (candidates.length < 2) return;
    const controller = new AbortController();
    dicingAnalysisAbortRef.current = controller;
    setDicingAnalyzing(true);
    setDicingReport(null);
    setAssetLifecycleDetail(`正在隔离 Worker 中解码 ${candidates.length} 张图片并执行精确切块重建…`);
    try {
      const inputs = await Promise.all(candidates.map(async (entry) => {
        const bytes = await repository.read(entry.source.digest);
        if (bytes === null) throw new AssetBlobError("CORRUPT_BLOB", "read", entry.source.digest, "Dicing 源 Blob 不存在");
        return { assetId: entry.assetId, mimeType: entry.source.mimeType, bytes };
      }));
      const report = await analyzeDicingInWorker(inputs, 64, controller.signal);
      setDicingReport(report);
      const adopted = report.candidateGroups.filter((group) => group.report.decision === "adopt");
      setAssetLifecycleDetail(report.candidateGroups.length === 0
        ? `自动分组完成：${report.evaluatedImageCount} 张图片没有形成满足严格两两阈值的安全组；全部保持独立。`
        : `自动分组完成：发现 ${report.candidateGroups.length} 组，其中 ${adopted.length} 组通过 RGBA 代理收益门；尚未发布 Atlas。`);
    } catch (error) {
      setAssetLifecycleDetail(error instanceof AssetBlobError && error.code === "CANCELLED"
        ? "Dicing 候选分析已取消；没有发布或修改任何资源。"
        : error instanceof Error ? `Dicing 候选分析未完成：${error.message}` : "Dicing 候选分析未完成。");
    } finally {
      if (dicingAnalysisAbortRef.current === controller) dicingAnalysisAbortRef.current = null;
      setDicingAnalyzing(false);
    }
  };

  const publishDicingAtlas = async (groupId: string) => {
    const repository = assetRepositoryRef.current;
    const group = dicingReport?.candidateGroups.find((candidate) => candidate.groupId === groupId);
    if (repository === null || group === undefined || group.report.decision !== "adopt" || dicingPublishingGroupId !== null) return;
    setDicingPublishingGroupId(groupId);
    setAssetLifecycleDetail(`正在隔离 Worker 中生成 ${groupId}、编码无损 PNG，并按实际字节复决策…`);
    try {
      const entries = group.assetIds.map((assetId) => assetIndex.assets.find((entry) => entry.assetId === assetId));
      if (entries.some((entry) => entry === undefined)) throw new AssetBlobError("STALE_INDEX_REVISION", "index", groupId, "Dicing 组成员已变化");
      const completeEntries = entries as AssetIndex["assets"];
      const inputs = await Promise.all(completeEntries.map(async (entry) => {
        const bytes = await repository.read(entry.source.digest);
        if (bytes === null) throw new AssetBlobError("CORRUPT_BLOB", "read", entry.source.digest, "Dicing 源 Blob 不存在");
        return { assetId: entry.assetId, mimeType: entry.source.mimeType, bytes };
      }));
      const artifact = await buildDicingAtlasInWorker(inputs, group.assetIds, group.report.planDigest, group.report.cellSize);
      if (artifact.decision.decision !== "adopt") {
        setAssetLifecycleDetail(`${groupId} 编码后无净收益：源文件 ${artifact.decision.sourceEncodedBytes} B，PNG Pages＋Manifest ${artifact.decision.publicationBytes} B；保持 Original，未进入发布事务。`);
        return;
      }
      const result = await repository.publishDicingAtlas({
        groupId,
        expectedPlanDigest: group.report.planDigest,
        sources: completeEntries.map((entry) => ({ assetId: entry.assetId, sourceDigest: entry.source.digest })),
        deliveryManifestJson: artifact.deliveryManifestJson,
        pages: artifact.pages
      });
      setAssetLifecycle(result.manifest);
      setAssetLifecycleDetail(result.blobStatus === "existing"
        ? `${groupId} 已按相同 PNG recipe 精确复用；Manifest 与 ${result.pageDigests.length} 个 Atlas Page 未产生重复 Blob。`
        : `${groupId} 已原子发布 Manifest 与 ${result.pageDigests.length} 个无损 PNG Atlas Page，共创建 ${result.createdBlobCount} 个内容寻址派生 Blob；实际净节省 ${result.decision.netSavingsBytes} B，Original 保持受保护。`);
    } catch (error) {
      setAssetLifecycleDetail(error instanceof Error ? `Atlas 未发布：${error.message}` : "Atlas 未发布；事务已回滚。");
    } finally {
      setDicingPublishingGroupId(null);
    }
  };

  const verifyDicingRuntime = async (groupId: string) => {
    const repository = assetRepositoryRef.current;
    const group = dicingReport?.candidateGroups.find((candidate) => candidate.groupId === groupId);
    if (repository === null || group === undefined || dicingRuntimeVerifyingGroupId !== null) return;
    setDicingRuntimeVerifyingGroupId(groupId);
    setAssetLifecycleDetail(`正在受控 Runtime Worker 中验证 ${groupId} 的派生加载与 Original 回退…`);
    try {
      const assetId = group.assetIds[0]!;
      const entry = assetIndex.assets.find((candidate) => candidate.assetId === assetId);
      if (entry === undefined) throw new AssetBlobError("STALE_INDEX_REVISION", "read", assetId, "Runtime 验证源已变化");
      const originalBytes = await repository.read(entry.source.digest);
      if (originalBytes === null) throw new AssetBlobError("CORRUPT_BLOB", "read", entry.source.digest, "当前 Original 不存在");
      let publication;
      try { publication = await repository.loadDicingRuntimePublication(groupId); } catch { publication = null; }
      const resolution = await resolveDicingRuntimeImageInWorker({
        assetId,
        originalMimeType: entry.source.mimeType,
        originalBytes,
        ...(publication === null ? {} : {
          deliveryManifestJson: publication.deliveryManifestJson,
          encodedPages: publication.encodedPages.map((page) => ({ pageId: page.pageId, bytes: page.bytes }))
        })
      });
      setAssetLifecycleDetail(resolution.strategy === "atlas"
        ? `${groupId} Runtime Loader PASS：${assetId} 已从受验证 Atlas 重建 ${resolution.width}×${resolution.height} RGBA；当前 Original 身份匹配。`
        : `${groupId} Runtime Loader SAFE FALLBACK：派生原因 ${resolution.reason}；已返回当前 Original ${resolution.width}×${resolution.height} RGBA。`);
    } catch (error) {
      setAssetLifecycleDetail(error instanceof Error ? `Runtime Loader 无法解析当前 Original：${error.message}` : "Runtime Loader 无法解析当前 Original。");
    } finally {
      setDicingRuntimeVerifyingGroupId(null);
    }
  };

  const verifyRuntimeScheduling = async (groupId: string) => {
    const repository = assetRepositoryRef.current;
    const group = dicingReport?.candidateGroups.find((candidate) => candidate.groupId === groupId);
    if (repository === null || group === undefined || runtimeSchedulingGroupId !== null) return;
    setRuntimeSchedulingGroupId(groupId);
    setAssetLifecycleDetail(`正在用并发上限、RGBA 硬预算、引用保护与 LRU 验证 ${groupId}…`);
    try {
      const publication = await repository.loadDicingRuntimePublication(groupId);
      if (publication === null) throw new AssetBlobError("DERIVATIVE_UNAVAILABLE", "read", groupId, "Runtime publication is unavailable");
      const manifest = parseLosslessDicingPngDeliveryManifest(publication.deliveryManifestJson);
      const targets = group.assetIds.map((assetId) => {
        const entry = assetIndex.assets.find((candidate) => candidate.assetId === assetId);
        const image = manifest.layoutManifest.images.find((candidate) => candidate.assetId === assetId);
        if (entry === undefined || image === undefined) throw new AssetBlobError("STALE_INDEX_REVISION", "read", assetId, "Runtime scheduling target changed");
        return { entry, reservedBytes: image.width * image.height * 4 };
      });
      const residentBudget = Math.max(...targets.map((target) => target.reservedBytes));
      const scheduler = new RuntimeResourceScheduler<Awaited<ReturnType<typeof resolveDicingRuntimeImageInWorker>>>({
        maxConcurrentLoads: 2,
        maxResidentBytes: residentBudget
      });
      let atlasLoads = 0;
      let fallbackLoads = 0;
      for (const target of targets) {
        const lease = await scheduler.acquire({
          key: target.entry.assetId,
          priority: atlasLoads === 0 && fallbackLoads === 0 ? "critical" : "scene",
          reservedBytes: target.reservedBytes,
          load: async (signal) => {
            const originalBytes = await repository.read(target.entry.source.digest);
            if (signal.aborted) throw new AssetBlobError("CANCELLED", "read", target.entry.assetId, "Runtime scheduling was cancelled");
            if (originalBytes === null) throw new AssetBlobError("CORRUPT_BLOB", "read", target.entry.source.digest, "Current Original is missing");
            const resolution = await resolveDicingRuntimeImageInWorker({
              assetId: target.entry.assetId,
              originalMimeType: target.entry.source.mimeType,
              originalBytes,
              deliveryManifestJson: publication.deliveryManifestJson,
              encodedPages: publication.encodedPages.map((page) => ({ pageId: page.pageId, bytes: page.bytes })),
              maxDecodedPixels: target.reservedBytes / 4
            });
            return { value: resolution, byteLength: resolution.rgba.byteLength };
          }
        });
        if (lease.value.strategy === "atlas") atlasLoads += 1;
        else fallbackLoads += 1;
        lease.release();
      }
      const beforePressure = scheduler.snapshot();
      const afterPressure = scheduler.handleMemoryPressure();
      setAssetLifecycleDetail(`${groupId} MEMORY SCHEDULER PASS：${targets.length} 个目标（Atlas ${atlasLoads} / Original ${fallbackLoads}）；` +
        `峰值计账 ${formatBytes(beforePressure.peakAccountedBytes)} / 硬预算 ${formatBytes(residentBudget)}，LRU 回收 ${afterPressure.evictions}，` +
        `压力清理后驻留 ${formatBytes(afterPressure.residentBytes)}、任务 ${afterPressure.activeLoads + afterPressure.queuedLoads}。`);
    } catch (error) {
      setAssetLifecycleDetail(error instanceof Error ? `内存调度门禁失败：${error.message}` : "内存调度门禁失败。");
    } finally {
      setRuntimeSchedulingGroupId(null);
    }
  };

  const verifyStoryPrediction = async (groupId: string) => {
    const repository = assetRepositoryRef.current;
    const group = dicingReport?.candidateGroups.find((candidate) => candidate.groupId === groupId);
    if (repository === null || group === undefined || group.assetIds.length < 2 || storyPredictionGroupId !== null) return;
    setStoryPredictionGroupId(groupId);
    setAssetLifecycleDetail(`正在用显式 Scene Resource Manifest 验证 ${groupId} 的分支公共预取、回滚与画廊引用…`);
    let coordinator: StoryResourceCoordinator<Awaited<ReturnType<typeof resolveDicingRuntimeImageInWorker>>> | null = null;
    try {
      const publication = await repository.loadDicingRuntimePublication(groupId);
      if (publication === null) throw new AssetBlobError("DERIVATIVE_UNAVAILABLE", "read", groupId, "Runtime publication is unavailable");
      const delivery = parseLosslessDicingPngDeliveryManifest(publication.deliveryManifestJson);
      const project = sessionRef.current.project;
      const entrySceneId = project.entrySceneId;
      const firstAssetId = group.assetIds[0]!;
      const branchAssetId = group.assetIds[1]!;
      const resourceManifest: SceneResourceManifest = {
        schemaVersion: 1,
        scenes: project.scenes.map((scene) => ({
          sceneId: scene.id,
          assetIds: scene.id === entrySceneId ? [firstAssetId] : [branchAssetId]
        }))
      };
      const targetById = new Map(group.assetIds.map((assetId) => {
        const entry = assetIndex.assets.find((candidate) => candidate.assetId === assetId);
        const image = delivery.layoutManifest.images.find((candidate) => candidate.assetId === assetId);
        if (entry === undefined || image === undefined) throw new AssetBlobError("STALE_INDEX_REVISION", "read", assetId, "Story prediction target changed");
        return [assetId, { entry, reservedBytes: image.width * image.height * 4 }] as const;
      }));
      const residentBudget = [...targetById.values()].reduce((total, target) => total + target.reservedBytes, 0);
      const scheduler = new RuntimeResourceScheduler<Awaited<ReturnType<typeof resolveDicingRuntimeImageInWorker>>>({
        maxConcurrentLoads: 2,
        maxResidentBytes: residentBudget
      });
      coordinator = new StoryResourceCoordinator(scheduler);
      const resolveDescriptor = (assetId: string) => {
        const target = targetById.get(assetId);
        if (target === undefined) throw new AssetBlobError("DERIVATIVE_UNAVAILABLE", "read", assetId, "Asset is absent from the verified prediction profile");
        return { reservedBytes: target.reservedBytes, load: async (signal: AbortSignal) => {
          const originalBytes = await repository.read(target.entry.source.digest);
          if (signal.aborted) throw new AssetBlobError("CANCELLED", "read", assetId, "Story prediction was superseded");
          if (originalBytes === null) throw new AssetBlobError("CORRUPT_BLOB", "read", target.entry.source.digest, "Current Original is missing");
          const resolution = await resolveDicingRuntimeImageInWorker({
            assetId,
            originalMimeType: target.entry.source.mimeType,
            originalBytes,
            deliveryManifestJson: publication.deliveryManifestJson,
            encodedPages: publication.encodedPages.map((page) => ({ pageId: page.pageId, bytes: page.bytes })),
            maxDecodedPixels: target.reservedBytes / 4
          });
          return { value: resolution, byteLength: resolution.rgba.byteLength };
        } };
      };

      const entryPlan = predictStoryResources(project, resourceManifest, entrySceneId);
      const entryReport = await coordinator.transition(entryPlan, resolveDescriptor);
      await coordinator.waitForIdle();
      const branchCommonCount = entryPlan.resources.filter((item) => item.reason === "branch-common").length;
      const galleryPlan = predictStoryResources(project, resourceManifest, entrySceneId, { galleryAssetIds: [branchAssetId] });
      await coordinator.transition(galleryPlan, resolveDescriptor);
      const galleryReferences = coordinator.snapshot().galleryReferences;
      await coordinator.transition(entryPlan, resolveDescriptor);
      await coordinator.waitForIdle();
      const targetSceneId = entryPlan.outgoingSceneIds[0];
      if (targetSceneId === undefined) throw new Error("Sample Story Graph has no outgoing scene");
      const targetPlan = predictStoryResources(project, resourceManifest, targetSceneId, { rollbackSceneIds: [entrySceneId] });
      await coordinator.transition(targetPlan, resolveDescriptor);
      const beforePressure = coordinator.snapshot();
      const afterPressure = coordinator.handleMemoryPressure();
      const disposed = coordinator.dispose();
      setAssetLifecycleDetail(`${groupId} STORY PREDICTION PASS：当前 ${targetSceneId} · 分支公共预取 ${branchCommonCount} · ` +
        `入口预取任务 ${entryReport.scheduledPrefetches} · 回滚引用 ${beforePressure.rollbackReferences} · 画廊临时引用 ${galleryReferences}；` +
        `低内存后保留当前 ${afterPressure.currentReferences}、回滚 ${afterPressure.rollbackReferences}，最终驻留 ${formatBytes(disposed.scheduler.residentBytes)}、任务 ${disposed.scheduler.activeLoads + disposed.scheduler.queuedLoads}。`);
    } catch (error) {
      coordinator?.dispose();
      setAssetLifecycleDetail(error instanceof Error ? `剧情资源预测门禁失败：${error.message}` : "剧情资源预测门禁失败。");
    } finally {
      setStoryPredictionGroupId(null);
    }
  };

  const verifyResourceCompilation = (groupId: string) => {
    const group = dicingReport?.candidateGroups.find((candidate) => candidate.groupId === groupId);
    if (group === undefined || group.assetIds.length < 2 || resourceCompilingGroupId !== null) return;
    setResourceCompilingGroupId(groupId);
    setAssetLifecycleDetail(`正在把当前剧情的类型化演出命令编译为 ${groupId} 的 Scene Resource Manifest…`);
    try {
      const project = sessionRef.current.project;
      const entryAssetId = group.assetIds[0]!;
      const branchAssetId = group.assetIds[1]!;
      const documents: Record<string, StoryDocument> = {};
      let typedDirectionCount = 0;
      let transitionDependencyCount = 0;
      for (const scene of project.scenes) {
        const sourceSession = sessionRef.current.sourceSessions[scene.id];
        if (sourceSession === undefined) throw new Error(`Missing canonical source for ${scene.id}`);
        const backgroundAssetId = scene.id === project.entrySceneId ? entryAssetId : branchAssetId;
        const typedSource = sourceSession.committedSource.replace(
          /^@background\s+.*?\s+@id\(([^)]+)\)\s*$/m,
          (_line, statementId: string) => `@background asset=${backgroundAssetId}${scene.id === project.entrySceneId ? " transition=fade" : ` transition=fade transitionAsset=${entryAssetId}`} @id(${statementId})`
        );
        typedDirectionCount += typedSource.match(/^@(background|show|audio)\b/gm)?.length ?? 0;
        transitionDependencyCount += typedSource.match(/\btransitionAsset=/g)?.length ?? 0;
        documents[scene.id] = parseStory(typedSource);
      }
      const result = compileSceneResourceManifest(project, documents, { knownAssetIds: assetIndex.assets.map((entry) => entry.assetId) });
      if (!result.ok) throw new Error(`${result.diagnostics[0]?.code ?? "COMPILATION_FAILED"} · ${result.diagnostics[0]?.message ?? "Resource compilation failed"}`);
      const plan = predictStoryResources(project, result.compilation.manifest, project.entrySceneId);
      const sceneAssetCount = new Set(result.compilation.manifest.scenes.flatMap((scene) => scene.assetIds)).size;
      const statementWindowCount = result.compilation.timelines.reduce((total, timeline) => total + timeline.statements.length, 0);
      const branchCommonCount = plan.resources.filter((resource) => resource.reason === "branch-common").length;
      setAssetLifecycleDetail(`${groupId} RESOURCE COMPILER PASS：${result.compilation.manifest.scenes.length} 场景 · ` +
        `${statementWindowCount} 语句窗口 · ${typedDirectionCount} 条类型化演出 · ${sceneAssetCount} 个已验证 Asset；` +
        `转场依赖 ${transitionDependencyCount} · 分支公共预取 ${branchCommonCount} · 未从描述文字猜测资源。`);
    } catch (error) {
      setAssetLifecycleDetail(error instanceof Error ? `资源清单编译门禁失败：${error.message}` : "资源清单编译门禁失败。");
    } finally {
      setResourceCompilingGroupId(null);
    }
  };

  if (persistence.status === "loading" || persistence.status === "migrating") {
    return (
      <div className="startup-gate" role="status" aria-live="polite">
        <span className="startup-gate__orb" aria-hidden="true" />
        <p className="eyebrow">{persistence.status === "migrating" ? "SAFE SCHEMA MIGRATION" : "SINGLE-WRITER STARTUP"}</p>
        <h1>{persistence.status === "migrating" ? "正在安全升级项目格式…" : "正在获取安全编辑权…"}</h1>
        <p>{persistence.detail ?? "取得带 fencing token 的写入租约后，再检查版本、WAL 与 SHA-256 完整性。"}</p>
      </div>
    );
  }

  if (persistence.status === "readonly") {
    return (
      <div className="startup-gate startup-gate--readonly" role="alert" aria-live="assertive">
        <span className="startup-gate__lock startup-gate__lock--readonly" aria-hidden="true">◇</span>
        <p className="eyebrow">FUTURE PROJECT · READ ONLY</p>
        <h1>项目来自更新版本</h1>
        <p>{persistence.projectTitle === undefined ? "此项目" : `“${persistence.projectTitle}”`} 使用 schema {persistence.schemaVersion}；当前编辑器支持到 schema {CURRENT_PROJECT_SCHEMA_VERSION}。</p>
        <p>{persistence.detail}</p>
        <button className="startup-gate__retry" onClick={() => setLeaseRetry((value) => value + 1)}>
          重新检测项目版本
        </button>
      </div>
    );
  }

  if (persistence.status === "blocked") {
    return (
      <div className="startup-gate startup-gate--blocked" role="alert" aria-live="assertive">
        <span className="startup-gate__lock" aria-hidden="true">!</span>
        <p className="eyebrow">PROJECT OPEN BLOCKED</p>
        <h1>项目尚未开放编辑</h1>
        <p>{persistence.detail ?? "启动校验未完成；编辑器没有加载默认内容覆盖项目。"}</p>
        <button className="startup-gate__retry" onClick={() => setLeaseRetry((value) => value + 1)}>
          重新执行安全检查
        </button>
      </div>
    );
  }

  if (persistence.status === "conflict") {
    return (
      <div className="startup-gate startup-gate--conflict" role="alert" aria-live="assertive">
        <span className="startup-gate__lock" aria-hidden="true">⌁</span>
        <p className="eyebrow">WRITER LEASE CONFLICT</p>
        <h1>此项目已在另一个窗口编辑</h1>
        <p>{persistence.detail ?? "为避免两个窗口相互覆盖，本窗口尚未开放编辑。"}</p>
        <button className="startup-gate__retry" onClick={() => setLeaseRetry((value) => value + 1)}>
          重试获取编辑权
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <WorkspaceHeader mode={mode} session={session} inputDirty={inputDirty} onModeChange={setMode} persistence={persistence} onSave={() => saveToLocal("manual")} onOpenBackups={openBackups} dispatch={dispatch} />
      <main className="workspace-grid">
        <SceneRail
          session={session}
          dispatch={dispatch}
          assetIndex={assetIndex}
          assetStatus={assetStatus}
          onOpenAssets={() => setAssetPanelOpen(true)}
        />
        {mode === "writer" ? (
          <WriterView session={session} dispatch={dispatch} createCommandId={createCommandId} createEntityId={createEntityId} onInputDirtyChange={setInputDirty} assetIndex={assetIndex} />
        ) : mode === "script" ? (
          <ScriptView session={session} dispatch={dispatch} createCommandId={createCommandId} inputDirty={inputDirty} onInputDirtyChange={setInputDirty} />
        ) : (
          <FlowView session={session} dispatch={dispatch} />
        )}
        <PreviewPanel session={session} dispatch={dispatch} inputDirty={inputDirty} assetIndex={assetIndex} assetRepository={assetRepositoryRef.current} />
      </main>
      <footer className="workspace-footer">
        <span>本地优先</span><span>无账户</span><span>schema {CURRENT_PROJECT_SCHEMA_VERSION}</span><span>备份 {persistence.backupCount ?? 0}/{BACKUP_POLICY.retention}</span><span className="footer-accent">S0.40 SEARCH · STABLE-ID JUMP</span>
      </footer>
      {backupPanelOpen && (
        <div className="backup-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setBackupPanelOpen(false);
        }}>
          <section className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title">
            <div className="backup-dialog__heading">
              <div>
                <p className="eyebrow">VERIFIED LOCAL HISTORY</p>
                <h2 id="backup-dialog-title">备份与恢复</h2>
              </div>
              <button className="icon-button" aria-label="关闭备份面板" onClick={() => setBackupPanelOpen(false)}>×</button>
            </div>
            <p className="backup-dialog__intro">恢复总会创建新的 revision。关联备份会一致恢复剧情与资源索引；早期未携带资源快照的备份会明确保持“仅剧情恢复”。</p>
            <div className="backup-list" aria-live="polite">
              {backupsLoading ? <p>正在校验备份…</p> : backups.length === 0 ? (
                <p>完成第二次保存后，这里会出现第一份可恢复快照。</p>
              ) : backups.map((backup) => (
                <article className="backup-item" key={`${backup.slot}-${backup.sourceStorageRevision}`}>
                  <div>
                    <strong>s{backup.sourceStorageRevision}</strong>
                    <span>槽位 {backup.slot + 1} · {new Date(backup.createdAtMs).toLocaleString()}</span>
                    <span>{linkedAssetBackupIds.includes(assetBackupRecordId(backup.slot, backup.sourceStorageRevision))
                      ? "剧情 + 资源索引 · 崩溃可续"
                      : "旧备份 · 仅剧情 · 资源回收锁定"}</span>
                  </div>
                  <button onClick={() => restoreBackup(backup)} disabled={inputDirty || saveInFlight.current}>
                    {linkedAssetBackupIds.includes(assetBackupRecordId(backup.slot, backup.sourceStorageRevision))
                      ? "一致恢复为新版本"
                      : "仅恢复剧情"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {assetPanelOpen && (
        <AssetVaultDialog
          index={assetIndex}
          lifecycle={assetLifecycle}
          gcLocked={!assetBackupAuditReady || unlinkedAssetBackupIds.length > 0}
          gcLockReason={!assetBackupAuditReady
            ? "正在核对项目备份与资源保护根；完成前安全回收保持锁定。"
            : `检测到 ${unlinkedAssetBackupIds.length} 份尚未携带资源快照的旧备份。为避免误删其依赖 Blob，安全回收已锁定。`}
          lifecycleDetail={assetLifecycleDetail}
          dicingReport={dicingReport}
          dicingAnalyzing={dicingAnalyzing}
          dicingPublishingGroupId={dicingPublishingGroupId}
          dicingRuntimeVerifyingGroupId={dicingRuntimeVerifyingGroupId}
          runtimeSchedulingGroupId={runtimeSchedulingGroupId}
          storyPredictionGroupId={storyPredictionGroupId}
          resourceCompilingGroupId={resourceCompilingGroupId}
          status={assetStatus}
          importState={assetImportState}
          createSuggestedId={(fileName) => canonicalAssetId(fileName, ++assetFileSerial.current)}
          onClose={closeAssetPanel}
          onCancel={cancelAssetImport}
          onImport={importAssetFile}
          onScan={() => void runAssetLifecycleOperation("scan")}
          onSweep={() => void runAssetLifecycleOperation("sweep")}
          onRestore={(digest) => void runAssetLifecycleOperation("restore", digest)}
          onBuildSidecar={(assetId) => void buildAssetSidecar(assetId)}
          onBuildThumbnail={(assetId) => void buildAssetThumbnail(assetId)}
          onAnalyzeDicing={() => void analyzeDicingCandidates()}
          onCancelDicing={() => dicingAnalysisAbortRef.current?.abort()}
          onPublishDicingAtlas={(groupId) => void publishDicingAtlas(groupId)}
          onVerifyDicingRuntime={(groupId) => void verifyDicingRuntime(groupId)}
          onVerifyRuntimeScheduling={(groupId) => void verifyRuntimeScheduling(groupId)}
          onVerifyStoryPrediction={(groupId) => void verifyStoryPrediction(groupId)}
          onVerifyResourceCompilation={verifyResourceCompilation}
        />
      )}
    </div>
  );
}

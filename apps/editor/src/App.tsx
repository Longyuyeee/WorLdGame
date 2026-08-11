import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  AssetBlobError,
  createAssetLifecycleManifest,
  createAssetIndex,
  ProjectPersistenceError,
  ProjectStoreError,
  CURRENT_PROJECT_SCHEMA_VERSION,
  loadProjectBackups,
  migrateProjectToCurrent,
  probeProjectVersion,
  restoreProjectBackup,
  saveProjectWithBackups,
  type ProjectBackup,
  type AssetImportInput,
  type AssetIndex,
  type AssetKind,
  type AssetLifecycleManifest,
  type ProjectSnapshot,
  type ProjectWriterLease
} from "@world-studio/project-persistence";
import {
  deriveRouteGraph,
  findScene,
  findStatement,
  type Character,
  type StoryStatement
} from "@world-studio/story-core";
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
  const known = error instanceof ProjectStoreError || error instanceof ProjectPersistenceError;
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
          <p className="eyebrow">WorLd Studio · S0.19</p>
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
            <span><strong>资源保险库</strong><small>S0.19 ASSET LINEAGE</small></span>
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

interface AssetVaultDialogProps {
  readonly index: AssetIndex;
  readonly lifecycle: AssetLifecycleManifest;
  readonly gcLocked: boolean;
  readonly lifecycleDetail: string;
  readonly status: AssetVaultStatus;
  readonly importState: AssetImportViewState;
  readonly createSuggestedId: (fileName: string) => string;
  readonly onClose: () => void;
  readonly onCancel: () => void;
  readonly onImport: (file: File, metadata: Omit<AssetImportInput, "bytes" | "mimeType">) => void;
  readonly onScan: () => void;
  readonly onSweep: () => void;
  readonly onRestore: (digest: AssetLifecycleManifest["trash"][number]["digest"]) => void;
}

function AssetVaultDialog({
  index,
  lifecycle,
  gcLocked,
  lifecycleDetail,
  status,
  importState,
  createSuggestedId,
  onClose,
  onCancel,
  onImport,
  onScan,
  onSweep,
  onRestore
}: AssetVaultDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [assetId, setAssetId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<AssetKind>("other");
  const importing = importState.phase === "reading" || importState.phase === "committing";
  const storageReady = status === "ready" || status === "success" || status === "cancelled";
  const selectedExisting = index.assets.find((entry) => entry.assetId === assetId);
  const sourceCount = lifecycle.nodes.filter((node) => node.role === "source").length;
  const derivativeCount = lifecycle.nodes.length - sourceCount;
  const eligibleCount = lifecycle.quarantine.filter((entry) => entry.sweepAfterMs <= Date.now()).length;

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
              ? "检测到尚未携带资源根的项目备份。为避免误删其依赖 Blob，安全回收已锁定。"
              : lifecycleDetail}</p>
          </div>
          <div className="asset-lifecycle__actions">
            <button type="button" disabled={!storageReady || importing || gcLocked} onClick={onScan}>安全扫描</button>
            <button type="button" disabled={!storageReady || importing || gcLocked || eligibleCount === 0} onClick={onSweep}>
              移入可恢复区{eligibleCount > 0 ? ` · ${eligibleCount}` : ""}
            </button>
            <small>扫描只登记候选；隔离满 24 小时后才能移动，移动后仍保留 7 天恢复期。</small>
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
}

function WriterView({
  session,
  dispatch,
  createCommandId,
  createEntityId,
  onInputDirtyChange
}: WriterViewProps) {
  const scene = findScene(session.project, session.activeSceneId);
  const selected = findStatement(session.project, scene.id, session.selectedStatementId);
  const selectedIndex = scene.statements.findIndex((statement) => statement.id === selected.id);
  const previousAnchor =
    selectedIndex <= 1 ? scene.id : (scene.statements[selectedIndex - 2]?.id ?? scene.id);
  const nextStatement = scene.statements[selectedIndex + 1];
  const pendingDraft = hasPendingDraft(session);

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

      <div className="statement-list" aria-label="剧情步骤">
        {scene.statements.map((statement, index) => (
          <button
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
        ))}
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
}

function PreviewPanel({ session, dispatch, inputDirty }: PreviewPanelProps) {
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
          <div className="stage-sky" aria-hidden="true">
            <span className="sun" /><span className="school-building" />
            <span className="character-silhouette character-silhouette--left" />
            <span className="character-silhouette character-silhouette--right" />
          </div>
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
        <div className="tombstone-list" aria-label="已删除对白记录">
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
  const [assetStatus, setAssetStatus] = useState<AssetVaultStatus>(
    storageAvailable ? "loading" : "unavailable"
  );
  const [assetImportState, setAssetImportState] = useState<AssetImportViewState>(IDLE_ASSET_IMPORT);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const assetRepositoryRef = useRef<IndexedDbAssetRepository | null>(null);
  const assetImportAbortRef = useRef<AbortController | null>(null);
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
      "edit-script", "patch-dialogue", "insert-dialogue", "delete-dialogue",
      "move-dialogue", "format-script", "discard-draft", "undo", "redo"
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
  const createEntityId = (prefix: "stmt" | "txt") => `${prefix}_ui_${++entitySerial.current}`;

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
      try {
        const [loadedAssetIndex, loadedAssetLifecycle] = await Promise.all([
          assetRepository.loadIndex(),
          assetRepository.loadLifecycle()
        ]);
        if (cancelled) return;
        setAssetIndex(loadedAssetIndex);
        setAssetLifecycle(loadedAssetLifecycle);
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
      }
      const snapshot = migration?.snapshot ?? null;
      if (cancelled) return;
      if (snapshot === null) {
        persistedSnapshotRef.current = null;
        setPersistence({ status: "unsaved", revision: 0, backupCount: 0 });
      } else {
        let backupCount = 0;
        let backupWarning: string | undefined;
        try {
          const loadedBackups = await loadProjectBackups(store, BACKUP_POLICY);
          backupCount = loadedBackups.length;
          setBackups(loadedBackups);
        } catch (error) {
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
    if (!(error instanceof ProjectStoreError)) return false;
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
    if (store === null || inputDirty || saveInFlight.current ||
        (reason === "auto" && autosaveSuspended.current)) return;
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
    setPersistence((current) => ({
      status: reason === "auto" ? "autosaving" : "saving",
      revision: storageRevision.current,
      ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount })
    }));
    void saveProjectWithBackups(store, snapshot, {
      transactionId,
      expectedStorageRevision: storageRevision.current,
      backupPolicy: BACKUP_POLICY,
      nowMs: Date.now()
    }).then(async () => {
      persistedSnapshotRef.current = snapshot;
      storageRevision.current = nextRevision;
      let verifiedBackups = backups;
      let backupWarning: string | undefined;
      try {
        verifiedBackups = await loadProjectBackups(store, BACKUP_POLICY);
        setBackups(verifiedBackups);
      } catch (error) {
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
    }).catch((error: unknown) => {
      if (handleBlockingStoreFailure(error, store, "备份恢复")) return;
      setPersistence(persistenceFailure(error, storageRevision.current));
    }).finally(() => setBackupsLoading(false));
  };

  const restoreBackup = (backup: ProjectBackup) => {
    const store = storeRef.current;
    if (store === null || inputDirty || saveInFlight.current) return;
    saveInFlight.current = true;
    const nextRevision = storageRevision.current + 1;
    setPersistence((current) => ({
      status: "saving",
      revision: storageRevision.current,
      ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount }),
      detail: `正在把备份 s${backup.sourceStorageRevision} 恢复为新的 s${nextRevision}…`
    }));
    void restoreProjectBackup(store, backup.slot, {
      transactionId: `restore_${nextRevision}_${++saveSerial.current}`,
      expectedStorageRevision: storageRevision.current,
      backupPolicy: BACKUP_POLICY,
      nowMs: Date.now()
    }).then(async (result) => {
      const restored = restoreStudioSession(result.snapshot);
      persistedSnapshotRef.current = result.snapshot;
      storageRevision.current = result.snapshot.storageRevision;
      editGeneration.current += 1;
      baseDispatch({ type: "restore-session", session: restored });
      const items = await loadProjectBackups(store, BACKUP_POLICY);
      setBackups(items);
      setBackupPanelOpen(false);
      setPersistence({
        status: "restored",
        revision: result.snapshot.storageRevision,
        backupCount: items.length,
        detail: `已把备份 s${backup.sourceStorageRevision} 恢复为新的 s${result.snapshot.storageRevision}；被替换版本仍在轮换备份中。`
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
          <WriterView session={session} dispatch={dispatch} createCommandId={createCommandId} createEntityId={createEntityId} onInputDirtyChange={setInputDirty} />
        ) : mode === "script" ? (
          <ScriptView session={session} dispatch={dispatch} createCommandId={createCommandId} inputDirty={inputDirty} onInputDirtyChange={setInputDirty} />
        ) : (
          <FlowView session={session} dispatch={dispatch} />
        )}
        <PreviewPanel session={session} dispatch={dispatch} inputDirty={inputDirty} />
      </main>
      <footer className="workspace-footer">
        <span>本地优先</span><span>无账户</span><span>schema {CURRENT_PROJECT_SCHEMA_VERSION}</span><span>备份 {persistence.backupCount ?? 0}/{BACKUP_POLICY.retention}</span><span className="footer-accent">S0.19 ASSET LINEAGE · RECOVERABLE GC</span>
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
            <p className="backup-dialog__intro">每次覆盖项目前先保存上一份完整快照；恢复会创建新的 revision，不会抹掉当前版本。</p>
            <div className="backup-list" aria-live="polite">
              {backupsLoading ? <p>正在校验备份…</p> : backups.length === 0 ? (
                <p>完成第二次保存后，这里会出现第一份可恢复快照。</p>
              ) : backups.map((backup) => (
                <article className="backup-item" key={`${backup.slot}-${backup.sourceStorageRevision}`}>
                  <div>
                    <strong>s{backup.sourceStorageRevision}</strong>
                    <span>槽位 {backup.slot + 1} · {new Date(backup.createdAtMs).toLocaleString()}</span>
                  </div>
                  <button onClick={() => restoreBackup(backup)} disabled={inputDirty || saveInFlight.current}>
                    恢复为新版本
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
          gcLocked={backups.length > assetLifecycle.roots.filter((root) => root.kind === "backup").length}
          lifecycleDetail={assetLifecycleDetail}
          status={assetStatus}
          importState={assetImportState}
          createSuggestedId={(fileName) => canonicalAssetId(fileName, ++assetFileSerial.current)}
          onClose={closeAssetPanel}
          onCancel={cancelAssetImport}
          onImport={importAssetFile}
          onScan={() => void runAssetLifecycleOperation("scan")}
          onSweep={() => void runAssetLifecycleOperation("sweep")}
          onRestore={(digest) => void runAssetLifecycleOperation("restore", digest)}
        />
      )}
    </div>
  );
}

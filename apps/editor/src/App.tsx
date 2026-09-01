import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
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
  findScene,
  findStatement,
  predictStoryResources,
  type Character,
  type SceneResourceManifest,
  type StoryStatement
} from "@world-studio/story-core";
import { assignRouteSceneGroup, buildRouteGraph, buildRouteGraphFromCompilation, buildRouteGraphIncremental, createRouteGraphIndex, deleteRouteGroup, locateRouteDiagnostic, queryRouteGraphWindow, renameRouteScene, resetRouteSceneLayout, reviewRouteToEnding, setRouteScenePosition, setRouteViewport, toggleRouteGroup, upsertRouteGroup, ROUTE_GRAPH_WINDOW_LIMIT, type RenameRouteSceneResult, type RouteNodeKind, type RouteProjectMutationResult, type RouteSceneNodeV1 } from "@world-studio/route-graph";
import {
  CAMERA_GEOMETRY_PARAMETERS,
  DIALOGUE_TEMPLATES,
  MAX_CAMERA_OFFSET,
  MAX_CAMERA_ROTATION,
  MAX_CAMERA_ZOOM,
  MAX_STAGE_Z,
  MAX_STAGE_ANCHOR,
  MAX_STAGE_PERCENT,
  MAX_STAGE_ROTATION,
  MAX_STAGE_SCALE,
  MAX_DIRECTIVE_BATCH_TARGETS,
  MIN_CAMERA_OFFSET,
  MIN_CAMERA_ROTATION,
  MIN_CAMERA_ZOOM,
  MIN_STAGE_Z,
  MIN_STAGE_ANCHOR,
  MIN_STAGE_PERCENT,
  MIN_STAGE_ROTATION,
  MIN_STAGE_SCALE,
  SAFE_STAGE_SLOT,
  STAGE_EASINGS,
  STAGE_TRANSITIONS,
  STAGE_MOVE_GEOMETRY_PARAMETERS,
  compileSceneResourceManifest,
  directiveActionRequiresAsset,
  directiveActionOptions,
  inspectDirectiveArguments,
  isStageEasing,
  isStageTransition,
  isDialogueTemplate,
  validateStageBezierMotionParameters,
  parseStory,
  resolveDirectiveAction,
  type DialogueTemplate,
  type StoryDocument
} from "@world-studio/story-language";
import { semanticHash, type CanonicalProject } from "@world-studio/project-domain";
import {
  createGalSettingsApplicationV1,
  galAudioGainV1,
  galTextRevealDurationMillisecondsV1,
  type GalAudioBusV1
} from "@world-studio/gal-settings";
import type { StoryProject } from "@world-studio/story-core";
import {
  activeSourceDraft,
  activeSourceSession,
  createProjectSnapshot,
  createStudioSession,
  createStudioSessionFromCanonical,
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
import { WORKSPACE_MODES, workspaceModeDescriptor, type WorkspaceModeId } from "./workspace-modes";
import { MobileFocusWorkspace } from "./MobileFocusWorkspace";
import {
  EXPERIENCE_LEVELS,
  experienceLevelDescriptor,
  visibleEditorViews,
  visibleWorkspaceModes,
  type ExperienceLevelId
} from "./experience-level";
import {
  createWorkspaceContext,
  persistWorkspaceContext,
  restoreWorkspaceContext,
  workspaceContextProjection
} from "./workspace-context";
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
import type { EditorProjectCompilerState } from "./editor-project-compilation";
import { createProjectSearchIndex, searchProjectIndex, type ProjectSearchMatch } from "./project-search";
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
  type PreviewUrlFactory
} from "./preview-media-runtime";
import { createSequenceInsertPlan, duplicateSequencePlan, sequenceMoveAfterId, sequenceRangeSelection, type SequenceInsertKind } from "./sequence-editor-model";
import { createStageSurfaceMetrics, mapClientPointToStage, type StageDesignPoint } from "./stage-surface";
import { createStagePlacementPatch } from "./stage-director";
import {
  deriveStageMoveKeyframeSeed,
  planStageMoveKeyframe,
  type StageMoveKeyframeSeed
} from "./stage-keyframe";
import {
  defaultStageMotionPathDraft,
  planStageMotionPath,
  stageMotionPathDirectiveArguments,
  type StageMotionPathDraft
} from "./stage-motion-path";
import {
  defaultStageBezierPathDraft,
  planStageBezierPath,
  type StageBezierPathDraft
} from "./stage-bezier-path";
import { formatStageTimelineTime, projectStageTimeline, stageTimelineLane } from "./stage-timeline";
import {
  createPreviewMediaHostState,
  previewMediaErrorCount,
  reducePreviewMediaHost,
  type PreviewMediaRole
} from "./preview-media-host";
import { createPreviewRenderFrame } from "./preview-render-host";
import { PreviewCanvasHost } from "./preview-canvas-host";
import { PreviewAudioLayer } from "./preview-audio-layer";
import { deriveDialoguePresentation } from "./dialogue-presentation";
import { createPlayableWebDownload, type PlayableWebArtifact } from "./playable-web-export";
import { projectCanonicalFromStory, projectCanonicalWithAssetIndex, projectCanonicalWithStory } from "./canonical-project-adapter";
import { choiceOptionTarget, planRouteChoiceRetarget } from "./route-repair";
import {
  approveFormalPreviewBarrier,
  advanceFormalPreview,
  backFormalPreview,
  cancelFormalPreviewEffect,
  completeFormalPreviewEffect,
  createIdleFormalPreviewState,
  forwardFormalPreview,
  observeFormalPreview,
  runFormalPreviewToStatement,
  selectFormalPreviewChoice,
  startFormalPreview,
  startFormalPreviewFromScene,
  startFormalPreviewFromStatement,
  stepOverFormalPreview,
  type FormalPreviewState
} from "./formal-preview-runtime";
import { updateFormalPreviewProject, type FormalPreviewHotUpdateResult } from "./formal-preview-hot-update";
import { MotionPreferenceControl } from "./MotionPreferenceControl";
import {
  effectiveMotionLevel,
  loadMotionPreference,
  storeMotionPreference,
  type MotionPreferenceId
} from "./motion-preference";
import { motionFrameAuditPasses, motionFrameAuditRequested, useMotionFrameAudit } from "./motion-frame-audit";
import { crossViewSyncAuditPasses, crossViewSyncAuditRequested, useCrossViewSyncAudit } from "./cross-view-sync-audit";
import { routeNodeNudge, type RouteNodeNudgeDirection } from "./input-equivalence";
import { ProductionWorkspace } from "./ProductionWorkspace";
import { DebugQaWorkspace } from "./DebugQaWorkspace";
import { SettingsWorkspace } from "./SettingsWorkspace";

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
  sequence: "Sequence",
  script: "Script",
  flow: "Flow"
};

function statementLabel(statement: StoryStatement): string {
  switch (statement.kind) {
    case "dialogue":
    case "narration":
      return statement.text;
    case "direction":
      return statement.summary;
    case "choice":
      return statement.prompt;
    case "end":
      return `结局 · ${statement.endingName}`;
    case "label": return statement.name;
    case "jump":
    case "call": return statement.targetLabel;
    case "return": return "返回";
    case "set": return `${statement.variable} = ${statement.expression}`;
    case "condition": return `${statement.expression} → ${statement.targetLabel}`;
    case "wait": return statement.duration;
    case "checkpoint": return `检查点 · ${statement.id}`;
  }
}

function statementKindLabel(statement: StoryStatement): string {
  switch (statement.kind) {
    case "dialogue":
      return "对白";
    case "narration": return "旁白";
    case "direction":
      return "演出";
    case "choice":
      return "选择";
    case "end":
      return "结局";
    case "label": return "标签";
    case "jump": return "跳转";
    case "call": return "调用";
    case "return": return "返回";
    case "set": return "变量";
    case "condition": return "条件";
    case "wait": return "等待";
    case "checkpoint": return "检查点";
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
  readonly workspaceMode: WorkspaceModeId;
  readonly experienceLevel: ExperienceLevelId;
  readonly motionPreference: MotionPreferenceId;
  readonly effectiveMotion: MotionPreferenceId;
  readonly systemReducedMotion: boolean;
  readonly inputDirty: boolean;
  readonly onModeChange: (mode: StudioMode) => void;
  readonly onWorkspaceModeChange: (mode: WorkspaceModeId) => void;
  readonly onExperienceLevelChange: (level: ExperienceLevelId) => void;
  readonly onMotionPreferenceChange: (preference: MotionPreferenceId) => void;
  readonly persistence: PersistenceViewState;
  readonly onSave: () => void;
  readonly onOpenBackups: () => void;
  readonly settingsOpen: boolean;
  readonly onOpenSettings: () => void;
}

interface WorkspaceNavigationProps {
  readonly mode: StudioMode;
  readonly workspaceMode: WorkspaceModeId;
  readonly experienceLevel: ExperienceLevelId;
  readonly motionPreference: MotionPreferenceId;
  readonly effectiveMotion: MotionPreferenceId;
  readonly systemReducedMotion: boolean;
  readonly inputDirty: boolean;
  readonly contextStatementId: string;
  readonly onModeChange: (mode: StudioMode) => void;
  readonly onWorkspaceModeChange: (mode: WorkspaceModeId) => void;
  readonly onExperienceLevelChange: (level: ExperienceLevelId) => void;
  readonly onMotionPreferenceChange: (preference: MotionPreferenceId) => void;
}

const WorkspaceNavigation = memo(function WorkspaceNavigation({
  mode,
  workspaceMode,
  experienceLevel,
  motionPreference,
  effectiveMotion,
  systemReducedMotion,
  inputDirty,
  contextStatementId,
  onModeChange,
  onWorkspaceModeChange,
  onExperienceLevelChange,
  onMotionPreferenceChange
}: WorkspaceNavigationProps) {
  const visibleModeIds = visibleWorkspaceModes(
    experienceLevel,
    workspaceMode,
    WORKSPACE_MODES.map((candidate) => candidate.id)
  );
  const visibleViews = visibleEditorViews(experienceLevel, mode, Object.keys(modeLabels) as StudioMode[]);
  return (
    <div className="workspace-navigation">
      <nav className="workspace-mode-switcher" aria-label="工作模式" role="radiogroup">
        {WORKSPACE_MODES.filter((candidate) => visibleModeIds.includes(candidate.id)).map((candidate) => (
          <button
            type="button"
            role="radio"
            className={candidate.id === workspaceMode ? "workspace-mode-button is-active" : "workspace-mode-button"}
            key={candidate.id}
            aria-checked={candidate.id === workspaceMode}
            disabled={!candidate.available || (inputDirty && candidate.id !== workspaceMode)}
            title={inputDirty && candidate.id !== workspaceMode ? "请先提交或放弃当前输入" : candidate.summary}
            onClick={() => onWorkspaceModeChange(candidate.id)}
          >
            <span className={`workspace-mode-dot workspace-mode-dot--${candidate.id}`} aria-hidden="true" />
            {candidate.label}
            {!candidate.available && <span className="workspace-mode-lock" aria-hidden="true">·</span>}
          </button>
        ))}
      </nav>
      <div className="workspace-navigation__lower">
        <div className="experience-switcher" role="radiogroup" aria-label="编辑复杂度">
          {EXPERIENCE_LEVELS.map((candidate) => (
            <button
              type="button"
              role="radio"
              aria-checked={candidate.id === experienceLevel}
              className={candidate.id === experienceLevel ? "experience-button is-active" : "experience-button"}
              key={candidate.id}
              title={candidate.summary}
              onClick={() => onExperienceLevelChange(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
          <output aria-live="polite">{experienceLevelDescriptor(experienceLevel).summary}</output>
        </div>
        <output className="workspace-mode-summary" aria-label="统一工作上下文" aria-live="polite">
          {workspaceModeDescriptor(workspaceMode).summary} · {contextStatementId}
        </output>
        <MotionPreferenceControl
          preference={motionPreference}
          effectiveLevel={effectiveMotion}
          systemReducedMotion={systemReducedMotion}
          onChange={onMotionPreferenceChange}
        />
        <nav className="mode-switcher" aria-label="编辑视图" role="tablist">
          {visibleViews.map((candidate) => (
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
      </div>
    </div>
  );
});

function WorkspaceHeader({
  mode,
  workspaceMode,
  experienceLevel,
  motionPreference,
  effectiveMotion,
  systemReducedMotion,
  session,
  inputDirty,
  onModeChange,
  onWorkspaceModeChange,
  onExperienceLevelChange,
  onMotionPreferenceChange,
  persistence,
  onSave,
  onOpenBackups,
  settingsOpen,
  onOpenSettings,
  dispatch
}: WorkspaceHeaderProps) {
  const sourceSession = activeSourceSession(session);
  const pendingDraft = hasPendingDraft(session);
  return (
    <header className="workspace-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">W</span>
        <div>
          <p className="eyebrow">WorLd Studio · S0.41</p>
          <h1>{session.project.title}</h1>
        </div>
      </div>

      <WorkspaceNavigation
        mode={mode}
        workspaceMode={workspaceMode}
        experienceLevel={experienceLevel}
        motionPreference={motionPreference}
        effectiveMotion={effectiveMotion}
        systemReducedMotion={systemReducedMotion}
        inputDirty={inputDirty}
        contextStatementId={session.selectedStatementId}
        onModeChange={onModeChange}
        onWorkspaceModeChange={onWorkspaceModeChange}
        onExperienceLevelChange={onExperienceLevelChange}
        onMotionPreferenceChange={onMotionPreferenceChange}
      />

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
          type="button"
          className={settingsOpen ? "settings-open-button is-active" : "settings-open-button"}
          aria-pressed={settingsOpen}
          onClick={onOpenSettings}
        >
          项目设置
        </button>
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
  readonly onGlobalJump: (match: ProjectSearchMatch) => void;
}

function SceneRail({ session, dispatch, assetIndex, assetStatus, onOpenAssets, onGlobalJump }: SceneRailProps) {
  const [query, setQuery] = useState("");
  const [activeResult, setActiveResult] = useState(0);
  const index = useMemo(() => createProjectSearchIndex(session.project), [session.project]);
  const result = useMemo(() => searchProjectIndex(index, query), [index, query]);
  const resolvedResult = Math.min(activeResult, Math.max(0, result.matches.length - 1));
  const selectedMatch = result.matches[resolvedResult];
  const draftSceneCount = Object.entries(session.sourceDrafts).filter(([sceneId, source]) =>
    source !== session.sourceSessions[sceneId]?.committedSource
  ).length;
  const jump = (match: ProjectSearchMatch | undefined) => {
    if (match !== undefined) onGlobalJump(match);
  };
  const cycle = (direction: -1 | 1) => {
    if (result.matches.length === 0) return;
    const next = (activeResult + direction + result.matches.length) % result.matches.length;
    setActiveResult(next);
    jump(result.matches[next]);
  };
  useEffect(() => setActiveResult(0), [query, result.totalMatches]);
  return (
    <aside className="scene-rail" aria-label="场景列表">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PROJECT</p>
          <h2>场景</h2>
        </div>
        <span className="count-badge">{session.project.scenes.length}</span>
      </div>
      <form className="project-search" role="search" aria-label="搜索全部场景" onSubmit={(event) => {
        event.preventDefault();
        jump(selectedMatch);
      }}>
        <label htmlFor="project-search-input">全局搜索</label>
        <div className="project-search__field"><span aria-hidden="true">⌕</span><input
          id="project-search-input"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="场景、ID 或内容"
          aria-controls="project-search-results"
          aria-describedby="project-search-status"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); cycle(1); }
            else if (event.key === "ArrowUp") { event.preventDefault(); cycle(-1); }
            else if (event.key === "Escape") setQuery("");
          }}
        /></div>
        <div className="project-search__meta">
          <output id="project-search-status" aria-live="polite">{result.query.length === 0 ? "搜索已提交工程" : result.totalMatches === 0 ? "没有全局匹配" : `${resolvedResult + 1} / ${result.totalMatches} 项`}</output>
          <span>{session.project.scenes.length} 场景</span>
        </div>
        <div className="project-search__nav" aria-label="全局搜索结果导航">
          <button type="button" aria-label="上一个全局搜索结果" disabled={selectedMatch === undefined} onClick={() => cycle(-1)}>↑</button>
          <button type="submit" disabled={selectedMatch === undefined}>打开</button>
          <button type="button" aria-label="下一个全局搜索结果" disabled={selectedMatch === undefined} onClick={() => cycle(1)}>↓</button>
        </div>
        {result.query.length > 0 && <div id="project-search-results" className="project-search__results" role="listbox" aria-label="全部场景搜索结果">
          {result.matches.map((match, matchIndex) => {
            const startsGroup = matchIndex === 0 || result.matches[matchIndex - 1]?.sceneId !== match.sceneId;
            return <div className="project-search__result" key={`${match.sceneId}:${match.statementId}:${match.matchedBy}`}>
              {startsGroup && <span className="project-search__scene">{String(match.sceneIndex + 1).padStart(2, "0")} · {match.sceneTitle}</span>}
              <button type="button" role="option" aria-selected={matchIndex === resolvedResult} onClick={() => { setActiveResult(matchIndex); jump(match); }}>
                <span>#{match.statementIndex + 1}</span><strong>{match.label}</strong><code>{match.statementId}</code>
              </button>
            </div>;
          })}
          {result.matches.length === 0 && <p>尝试输入场景标题、stmt_… 或对白片段</p>}
          {result.truncated && <p>仅展示前 {result.matches.length} 项；总数仍完整统计。</p>}
        </div>}
        {draftSceneCount > 0 && <small>{draftSceneCount} 个场景有未提交草稿；全局搜索仍使用最后一次有效投影。</small>}
      </form>
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
            <span><strong>资源保险库</strong><small>S0.41 PROJECT · GLOBAL SEARCH</small></span>
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

interface SequenceViewProps extends CommonProps {
  readonly createCommandId: () => string;
  readonly createEntityId: (prefix: string) => string;
  readonly onInputDirtyChange: (dirty: boolean) => void;
  readonly assetIndex: AssetIndex;
  readonly variableIds: readonly string[];
  readonly requestedFocusStatementId: string | null;
  readonly onRequestedFocusHandled: () => void;
  readonly runtimeRouteTrace: RuntimeRouteTrace;
}

type DirectionForm = Record<string, string>;
type DirectionCommand = "background" | "show" | "camera" | "audio" | "textbox";
type BatchDirectionParameter = "transition" | "duration" | "easing" | "transitionAsset" | "expression" | "position" | "x" | "y" | "scale" | "zoom" | "rotation" | "anchorX" | "anchorY" | "loop" | "volume" | "fade" | "template";

const BATCH_DIRECTION_PARAMETERS: Readonly<Record<DirectionCommand, readonly BatchDirectionParameter[]>> = {
  background: ["transition", "duration", "transitionAsset"],
  show: ["expression", "position", "x", "y", "scale", "rotation", "anchorX", "anchorY", "transition", "duration", "easing", "transitionAsset"],
  camera: ["x", "y", "zoom", "rotation", "duration", "easing"],
  audio: ["loop", "volume", "fade", "transitionAsset"],
  textbox: ["template"]
};

const BATCH_PARAMETER_LABELS: Readonly<Record<BatchDirectionParameter, string>> = {
  transition: "过渡",
  duration: "时长",
  easing: "移动缓动",
  transitionAsset: "过渡资源",
  expression: "表情",
  position: "位置",
  x: "水平位置",
  y: "垂直位置",
  scale: "缩放",
  zoom: "镜头倍率",
  rotation: "旋转",
  anchorX: "水平锚点",
  anchorY: "垂直锚点",
  loop: "循环",
  volume: "音量",
  fade: "淡入/淡出",
  template: "文本模板"
};

function compatibleDirectionAssets(
  command: DirectionCommand,
  assets: readonly AssetIndexEntry[]
): readonly AssetIndexEntry[] {
  return assets.filter((entry) => {
    if (command === "background") return entry.kind === "background" || entry.kind === "cg";
    if (command === "show") return entry.kind === "character";
    return command === "audio" && entry.kind === "audio";
  });
}

function validOptionalStageNumber(form: DirectionForm, key: string, minimum: number, maximum: number): boolean {
  const source = form[key];
  return source === undefined || source.length === 0 ||
    /^-?\d+(?:\.\d+)?$/.test(source) && Number(source) >= minimum && Number(source) <= maximum;
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
  const characterGeometryActive = statement.command === "show" && (action === "show" || action === "move");
  const cameraMoveActive = statement.command === "camera" && action === "move";
  const visualTransitionActive = (statement.command === "background" && (action === "set" || action === "clear")) ||
    statement.command === "show" && (characterGeometryActive || action === "hide");
  const durationActive = visualTransitionActive || statement.command === "camera" || statement.command === "audio" && action === "play";
  const compatibleAssets = compatibleDirectionAssets(statement.command, assetIndex.assets);
  const assetId = form.asset ?? "";
  const assetKnown = !assetRequired || compatibleAssets.some((entry) => entry.assetId === assetId);
  const transitionAsset = form.transitionAsset ?? "";
  const transitionAssetKnown = !assetRequired || transitionAsset.length === 0 || assetIndex.assets.some((entry) => entry.assetId === transitionAsset);
  const duration = statement.command === "audio" ? (form.fade ?? "") : (form.duration ?? "");
  const durationValid = !durationActive || duration.length === 0 || /^\d+(?:\.\d+)?(?:ms|s)$/.test(duration);
  const volumeValid = !assetRequired || statement.command !== "audio" || form.volume === undefined || form.volume.length === 0 ||
    (/^\d+(?:\.\d+)?$/.test(form.volume) && Number(form.volume) >= 0 && Number(form.volume) <= 1);
  const busValid = statement.command !== "audio" || ["voice", "bgm", "sfx", "ambient"].includes(form.bus ?? "");
  const slot = form.slot ?? "primary";
  const slotValid = statement.command !== "show" || SAFE_STAGE_SLOT.test(slot);
  const z = form.z === undefined || form.z.length === 0 ? 0 : Number(form.z);
  const zValid = !characterGeometryActive || Number.isInteger(z) && z >= MIN_STAGE_Z && z <= MAX_STAGE_Z;
  const geometryValid = !characterGeometryActive || [
    validOptionalStageNumber(form, "x", MIN_STAGE_PERCENT, MAX_STAGE_PERCENT),
    validOptionalStageNumber(form, "y", MIN_STAGE_PERCENT, MAX_STAGE_PERCENT),
    validOptionalStageNumber(form, "scale", MIN_STAGE_SCALE, MAX_STAGE_SCALE),
    validOptionalStageNumber(form, "rotation", MIN_STAGE_ROTATION, MAX_STAGE_ROTATION),
    validOptionalStageNumber(form, "anchorX", MIN_STAGE_ANCHOR, MAX_STAGE_ANCHOR),
    validOptionalStageNumber(form, "anchorY", MIN_STAGE_ANCHOR, MAX_STAGE_ANCHOR)
  ].every(Boolean);
  const bezierError = statement.command === "show" && action === "move" ? validateStageBezierMotionParameters(form) : undefined;
  const cameraGeometryValid = !cameraMoveActive || [
    validOptionalStageNumber(form, "x", MIN_CAMERA_OFFSET, MAX_CAMERA_OFFSET),
    validOptionalStageNumber(form, "y", MIN_CAMERA_OFFSET, MAX_CAMERA_OFFSET),
    validOptionalStageNumber(form, "zoom", MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM),
    validOptionalStageNumber(form, "rotation", MIN_CAMERA_ROTATION, MAX_CAMERA_ROTATION)
  ].every(Boolean);
  const moveHasGeometry = action !== "move" || (statement.command === "camera" ? CAMERA_GEOMETRY_PARAMETERS : STAGE_MOVE_GEOMETRY_PARAMETERS).some((key) => (form[key] ?? "").trim().length > 0);
  const easingValid = statement.command !== "camera" && action !== "move" || form.easing === undefined || form.easing.length === 0 || isStageEasing(form.easing);
  const transitionValid = form.transition === undefined || form.transition.length === 0 || isStageTransition(form.transition);
  const templateValid = statement.command !== "textbox" || action === "reset" || isDialogueTemplate(form.template ?? "");
  const canApply = !disabled && inspection.duplicateKeys.length === 0 && action !== undefined && assetKnown && busValid && slotValid && zValid && templateValid &&
    geometryValid && bezierError === undefined && cameraGeometryValid && moveHasGeometry && easingValid && transitionValid && transitionAssetKnown && durationValid && volumeValid;

  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fieldPatch = (keys: readonly string[]) => Object.fromEntries(
    keys.map((key) => [key, (form[key] ?? "").trim() || null])
  );
  const keys = statement.command === "background"
    ? ["action", "asset", "transition", "transitionAsset", "duration"]
    : statement.command === "show"
      ? ["action", "asset", "slot", "z", "expression", "position", "x", "y", "scale", "rotation", "anchorX", "anchorY", "curve", "control1X", "control1Y", "control2X", "control2Y", "transition", "transitionAsset", "duration", "easing"]
      : statement.command === "camera"
        ? ["action", "x", "y", "zoom", "rotation", "duration", "easing"]
        : statement.command === "textbox" ? ["action", "template"] : ["action", "asset", "bus", "loop", "volume", "fade", "transitionAsset"];
  const inactiveResourcePatch = statement.command === "background"
    ? { asset: null, transitionAsset: null }
    : statement.command === "show"
      ? action === "move"
        ? { asset: null, expression: null, transitionAsset: null }
        : action === "hide"
          ? { asset: null, z: null, expression: null, position: null, x: null, y: null, scale: null, rotation: null, anchorX: null, anchorY: null, curve: null, control1X: null, control1Y: null, control2X: null, control2Y: null, transitionAsset: null, easing: null }
          : { asset: null, z: null, expression: null, position: null, x: null, y: null, scale: null, rotation: null, anchorX: null, anchorY: null, curve: null, control1X: null, control1Y: null, control2X: null, control2Y: null, transition: null, transitionAsset: null, duration: null }
      : statement.command === "camera"
        ? action === "reset" ? { x: null, y: null, zoom: null, rotation: null } : {}
        : statement.command === "textbox" ? action === "reset" ? { template: null } : {} : { asset: null, loop: null, volume: null, fade: null, transitionAsset: null };

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
          ...(statement.command === "show" && action === "show" ? { easing: null, curve: null, control1X: null, control1Y: null, control2X: null, control2Y: null } : {}),
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

      {statement.command === "textbox" && action === "set" && <div className="direction-field">
        <label htmlFor={`direction-template-${statement.id}`}>文本模板</label>
        <select id={`direction-template-${statement.id}`} aria-label="文本框模板" value={form.template ?? "adv"} disabled={disabled} onChange={(event) => setField("template", event.target.value)}>
          {DIALOGUE_TEMPLATES.map((template) => <option key={template} value={template}>{template.toUpperCase()}</option>)}
        </select>
        {!templateValid && <small className="is-error">仅支持 ADV、NVL 或 Bubble</small>}
      </div>}

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

      {visualTransitionActive && (
        <div className="direction-field">
          <label htmlFor={`direction-transition-${statement.id}`}>过渡</label>
          <select id={`direction-transition-${statement.id}`} aria-label="演出过渡" value={form.transition ?? ""} disabled={disabled} onChange={(event) => setField("transition", event.target.value)}>
            <option value="">无</option>{STAGE_TRANSITIONS.map((transition) => <option key={transition} value={transition}>{transition[0]!.toUpperCase() + transition.slice(1)}</option>)}
          </select>
          {!transitionValid && <small className="is-error">仅支持 fade、dissolve 或 slide</small>}
        </div>
      )}
      {statement.command === "show" && <>
        <div className="direction-field"><label htmlFor={`direction-slot-${statement.id}`}>角色槽位</label><input id={`direction-slot-${statement.id}`} aria-label="角色槽位" value={slot} disabled={disabled} placeholder="primary" onChange={(event) => setField("slot", event.target.value)} />{!slotValid && <small className="is-error">需为稳定标识符</small>}</div>
        {characterGeometryActive && <div className="direction-field"><label htmlFor={`direction-z-${statement.id}`}>层级</label><input id={`direction-z-${statement.id}`} aria-label="角色层级" type="number" min={MIN_STAGE_Z} max={MAX_STAGE_Z} value={form.z ?? ""} disabled={disabled} placeholder="0" onChange={(event) => setField("z", event.target.value)} />{!zValid && <small className="is-error">范围 {MIN_STAGE_Z}–{MAX_STAGE_Z}</small>}</div>}
        {assetRequired && <div className="direction-field"><label htmlFor={`direction-expression-${statement.id}`}>表情</label><input id={`direction-expression-${statement.id}`} aria-label="角色表情" value={form.expression ?? ""} disabled={disabled} placeholder="smile" onChange={(event) => setField("expression", event.target.value)} /></div>}
        {characterGeometryActive && <div className="direction-field"><label htmlFor={`direction-position-${statement.id}`}>位置</label><select id={`direction-position-${statement.id}`} aria-label="角色位置" value={form.position ?? ""} disabled={disabled} onChange={(event) => setField("position", event.target.value)}><option value="">默认</option><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></div>}
        {characterGeometryActive && <div className="direction-geometry" aria-label="角色舞台几何">
          <div className="direction-field"><label htmlFor={`direction-x-${statement.id}`}>X（%）</label><input id={`direction-x-${statement.id}`} aria-label="角色水平位置" type="number" min={MIN_STAGE_PERCENT} max={MAX_STAGE_PERCENT} step="0.1" value={form.x ?? ""} disabled={disabled} placeholder="50" onChange={(event) => setField("x", event.target.value)} /></div>
          <div className="direction-field"><label htmlFor={`direction-y-${statement.id}`}>Y（%）</label><input id={`direction-y-${statement.id}`} aria-label="角色垂直位置" type="number" min={MIN_STAGE_PERCENT} max={MAX_STAGE_PERCENT} step="0.1" value={form.y ?? ""} disabled={disabled} placeholder="100" onChange={(event) => setField("y", event.target.value)} /></div>
          <div className="direction-field"><label htmlFor={`direction-scale-${statement.id}`}>缩放</label><input id={`direction-scale-${statement.id}`} aria-label="角色缩放" type="number" min={MIN_STAGE_SCALE} max={MAX_STAGE_SCALE} step="0.01" value={form.scale ?? ""} disabled={disabled} placeholder="1" onChange={(event) => setField("scale", event.target.value)} /></div>
          <div className="direction-field"><label htmlFor={`direction-rotation-${statement.id}`}>旋转（°）</label><input id={`direction-rotation-${statement.id}`} aria-label="角色旋转" type="number" min={MIN_STAGE_ROTATION} max={MAX_STAGE_ROTATION} step="0.1" value={form.rotation ?? ""} disabled={disabled} placeholder="0" onChange={(event) => setField("rotation", event.target.value)} /></div>
          <div className="direction-field"><label htmlFor={`direction-anchor-x-${statement.id}`}>锚点 X</label><input id={`direction-anchor-x-${statement.id}`} aria-label="角色水平锚点" type="number" min={MIN_STAGE_ANCHOR} max={MAX_STAGE_ANCHOR} step="0.01" value={form.anchorX ?? ""} disabled={disabled} placeholder="0.5" onChange={(event) => setField("anchorX", event.target.value)} /></div>
          <div className="direction-field"><label htmlFor={`direction-anchor-y-${statement.id}`}>锚点 Y</label><input id={`direction-anchor-y-${statement.id}`} aria-label="角色垂直锚点" type="number" min={MIN_STAGE_ANCHOR} max={MAX_STAGE_ANCHOR} step="0.01" value={form.anchorY ?? ""} disabled={disabled} placeholder="1" onChange={(event) => setField("anchorY", event.target.value)} /></div>
          {!geometryValid && <small className="is-error">位置 0–100，缩放 0.1–4，旋转 -360–360，锚点 0–1</small>}
        </div>}
        {action === "move" && !moveHasGeometry && <small className="is-error">Move 至少需要一个位置、缩放、旋转、锚点或层级参数</small>}
        {action === "move" && <div className="direction-field"><label htmlFor={`direction-curve-${statement.id}`}>空间路径</label><select id={`direction-curve-${statement.id}`} aria-label="角色空间路径" value={form.curve ?? ""} disabled={disabled} onChange={(event) => {
          const curve = event.target.value;
          setForm((current) => curve === "" ? { ...current, curve: "", control1X: "", control1Y: "", control2X: "", control2Y: "" } : { ...current, curve });
        }}><option value="">直线</option><option value="bezier">三次贝塞尔</option></select></div>}
        {action === "move" && form.curve === "bezier" && <div className="direction-geometry" aria-label="贝塞尔控制点参数">
          {(["control1X", "control1Y", "control2X", "control2Y"] as const).map((key, index) => <div className="direction-field" key={key}><label htmlFor={`direction-${key}-${statement.id}`}>{`控制点 ${index < 2 ? 1 : 2} ${key.endsWith("X") ? "X" : "Y"}`}</label><input id={`direction-${key}-${statement.id}`} aria-label={`角色贝塞尔控制点 ${index < 2 ? 1 : 2} ${key.endsWith("X") ? "X" : "Y"}`} type="number" min={MIN_STAGE_PERCENT} max={MAX_STAGE_PERCENT} step="0.1" value={form[key] ?? ""} disabled={disabled} onChange={(event) => setField(key, event.target.value)} /></div>)}
          {bezierError !== undefined && <small className="is-error">{bezierError}</small>}
        </div>}
        {action === "move" && <div className="direction-field"><label htmlFor={`direction-easing-${statement.id}`}>移动缓动</label><select id={`direction-easing-${statement.id}`} aria-label="移动缓动" value={form.easing ?? ""} disabled={disabled} onChange={(event) => setField("easing", event.target.value)}><option value="">Linear（兼容默认）</option>{STAGE_EASINGS.filter((value) => value !== "linear").map((value) => <option key={value} value={value}>{value}</option>)}</select>{!easingValid && <small className="is-error">请选择冻结的缓动曲线</small>}</div>}
      </>}
      {statement.command === "camera" && <>
        {cameraMoveActive && <div className="direction-geometry direction-geometry--camera" aria-label="镜头构图参数">
          <div className="direction-field"><label htmlFor={`camera-x-${statement.id}`}>偏移 X（%）</label><input id={`camera-x-${statement.id}`} aria-label="镜头水平偏移" type="number" min={MIN_CAMERA_OFFSET} max={MAX_CAMERA_OFFSET} step="0.1" value={form.x ?? ""} disabled={disabled} placeholder="0" onChange={(event) => setField("x", event.target.value)} /></div>
          <div className="direction-field"><label htmlFor={`camera-y-${statement.id}`}>偏移 Y（%）</label><input id={`camera-y-${statement.id}`} aria-label="镜头垂直偏移" type="number" min={MIN_CAMERA_OFFSET} max={MAX_CAMERA_OFFSET} step="0.1" value={form.y ?? ""} disabled={disabled} placeholder="0" onChange={(event) => setField("y", event.target.value)} /></div>
          <div className="direction-field"><label htmlFor={`camera-zoom-${statement.id}`}>倍率</label><input id={`camera-zoom-${statement.id}`} aria-label="镜头倍率" type="number" min={MIN_CAMERA_ZOOM} max={MAX_CAMERA_ZOOM} step="0.05" value={form.zoom ?? ""} disabled={disabled} placeholder="1" onChange={(event) => setField("zoom", event.target.value)} /></div>
          <div className="direction-field"><label htmlFor={`camera-rotation-${statement.id}`}>旋转（°）</label><input id={`camera-rotation-${statement.id}`} aria-label="镜头旋转" type="number" min={MIN_CAMERA_ROTATION} max={MAX_CAMERA_ROTATION} step="0.1" value={form.rotation ?? ""} disabled={disabled} placeholder="0" onChange={(event) => setField("rotation", event.target.value)} /></div>
          {!cameraGeometryValid && <small className="is-error">偏移 -100–100，倍率 0.5–3，旋转 -30–30</small>}
        </div>}
        {cameraMoveActive && !moveHasGeometry && <small className="is-error">Camera Move 至少需要一个构图参数</small>}
        <div className="direction-field"><label htmlFor={`camera-easing-${statement.id}`}>镜头缓动</label><select id={`camera-easing-${statement.id}`} aria-label="镜头缓动" value={form.easing ?? ""} disabled={disabled} onChange={(event) => setField("easing", event.target.value)}><option value="">Linear（兼容默认）</option>{STAGE_EASINGS.filter((value) => value !== "linear").map((value) => <option key={value} value={value}>{value}</option>)}</select>{!easingValid && <small className="is-error">请选择冻结的缓动曲线</small>}</div>
      </>}
      {statement.command === "audio" && <>
        <div className="direction-field"><label htmlFor={`direction-bus-${statement.id}`}>音轨</label><select id={`direction-bus-${statement.id}`} aria-label="音频总线" value={form.bus ?? ""} disabled={disabled} onChange={(event) => setField("bus", event.target.value)}><option value="">请选择</option><option value="voice">Voice</option><option value="bgm">BGM</option><option value="sfx">SFX</option><option value="ambient">Ambient</option></select></div>
        {assetRequired && <><div className="direction-field"><label htmlFor={`direction-loop-${statement.id}`}>循环</label><select id={`direction-loop-${statement.id}`} aria-label="音频循环" value={form.loop ?? ""} disabled={disabled} onChange={(event) => setField("loop", event.target.value)}><option value="">默认</option><option value="true">开启</option><option value="false">关闭</option></select></div>
        <div className="direction-field"><label htmlFor={`direction-volume-${statement.id}`}>音量 0–1</label><input id={`direction-volume-${statement.id}`} aria-label="音频音量" inputMode="decimal" value={form.volume ?? ""} disabled={disabled} placeholder="1" onChange={(event) => setField("volume", event.target.value)} /></div></>}
      </>}
      {durationActive && <div className="direction-field">
        <label htmlFor={`direction-duration-${statement.id}`}>{statement.command === "audio" ? "淡入/淡出" : statement.command === "camera" ? "镜头时长" : "时长"}</label>
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
    parameter === "transition" ? (STAGE_TRANSITIONS as readonly string[]).includes(value) :
      parameter === "easing" ? isStageEasing(value) :
      parameter === "position" ? ["left", "center", "right"].includes(value) :
        parameter === "x" || parameter === "y" ? /^-?\d+(?:\.\d+)?$/.test(value) && Number(value) >= (command === "camera" ? MIN_CAMERA_OFFSET : MIN_STAGE_PERCENT) && Number(value) <= (command === "camera" ? MAX_CAMERA_OFFSET : MAX_STAGE_PERCENT) :
          parameter === "scale" ? /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= MIN_STAGE_SCALE && Number(value) <= MAX_STAGE_SCALE :
            parameter === "zoom" ? /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= MIN_CAMERA_ZOOM && Number(value) <= MAX_CAMERA_ZOOM :
            parameter === "rotation" ? /^-?\d+(?:\.\d+)?$/.test(value) && Number(value) >= (command === "camera" ? MIN_CAMERA_ROTATION : MIN_STAGE_ROTATION) && Number(value) <= (command === "camera" ? MAX_CAMERA_ROTATION : MAX_STAGE_ROTATION) :
              parameter === "anchorX" || parameter === "anchorY" ? /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= MIN_STAGE_ANCHOR && Number(value) <= MAX_STAGE_ANCHOR :
        parameter === "loop" ? ["true", "false"].includes(value) :
          parameter === "duration" || parameter === "fade" ? /^\d+(?:\.\d+)?(?:ms|s)$/.test(value) :
            parameter === "volume" ? /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= 0 && Number(value) <= 1 :
              parameter === "transitionAsset" ? assetIndex.assets.some((entry) => entry.assetId === value) :
                parameter === "template" ? isDialogueTemplate(value) : tokenValid
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
        <button type="button" disabled={disabled} onClick={() => onSelectLane("camera")}>CAM · {sceneDirections.filter((item) => item.command === "camera").length}</button>
        <button type="button" disabled={disabled} onClick={() => onSelectLane("audio")}>AUDIO · {sceneDirections.filter((item) => item.command === "audio").length}</button>
        <button type="button" disabled={disabled} onClick={() => onSelectLane("textbox")}>TEXT · {sceneDirections.filter((item) => item.command === "textbox").length}</button>
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
          {mode === "set" && <label className="batch-direction__value"><span>值</span>{parameter === "transition" ? <select aria-label="批量演出参数值" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}><option value="">请选择</option><option value="fade">Fade</option><option value="dissolve">Dissolve</option><option value="slide">Slide</option></select> : parameter === "easing" ? <select aria-label="批量演出参数值" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}><option value="">请选择</option>{STAGE_EASINGS.map((item) => <option key={item} value={item}>{item}</option>)}</select> : parameter === "template" ? <select aria-label="批量演出参数值" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}><option value="">请选择</option>{DIALOGUE_TEMPLATES.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select> : parameter === "position" ? <select aria-label="批量演出参数值" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}><option value="">请选择</option><option value="left">左</option><option value="center">中</option><option value="right">右</option></select> : parameter === "loop" ? <select aria-label="批量演出参数值" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)}><option value="">请选择</option><option value="true">开启</option><option value="false">关闭</option></select> : <input aria-label="批量演出参数值" list={parameter === "transitionAsset" ? "batch-transition-assets" : undefined} value={value} disabled={disabled} placeholder={parameter === "duration" || parameter === "fade" ? "300ms / 0.5s" : parameter === "volume" ? "0–1" : "输入单 token"} onChange={(event) => setValue(event.target.value)} />}{parameter === "transitionAsset" && <datalist id="batch-transition-assets">{assetIndex.assets.map((entry) => <option key={entry.assetId} value={entry.assetId}>{entry.displayName}</option>)}</datalist>}</label>}
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
  const [x, setX] = useState(command === "camera" ? "0" : "50");
  const [y, setY] = useState(command === "camera" ? "0" : "100");
  const [zoom, setZoom] = useState("1.15");
  const [rotation, setRotation] = useState("0");
  const [duration, setDuration] = useState("600ms");
  const [easing, setEasing] = useState("ease-in-out");
  const [transition, setTransition] = useState("");
  const [bus, setBus] = useState("bgm");
  const [template, setTemplate] = useState<DialogueTemplate>("adv");
  const compatibleAssets = compatibleDirectionAssets(command, assetIndex.assets);
  const assetRequired = directiveActionRequiresAsset(command, action);
  const moveActive = command === "show" && action === "move";
  const cameraMoveActive = command === "camera" && action === "move";
  const assetValid = !assetRequired || compatibleAssets.some((entry) => entry.assetId === asset);
  const slotValid = command !== "show" || SAFE_STAGE_SLOT.test(slot);
  const zNumber = Number(z);
  const zValid = command !== "show" || !assetRequired || Number.isInteger(zNumber) && zNumber >= MIN_STAGE_Z && zNumber <= MAX_STAGE_Z;
  const moveGeometryValid = !moveActive || [x, y].every((value) => /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= MIN_STAGE_PERCENT && Number(value) <= MAX_STAGE_PERCENT);
  const cameraGeometryValid = !cameraMoveActive || [
    validOptionalStageNumber({ x }, "x", MIN_CAMERA_OFFSET, MAX_CAMERA_OFFSET),
    validOptionalStageNumber({ y }, "y", MIN_CAMERA_OFFSET, MAX_CAMERA_OFFSET),
    validOptionalStageNumber({ zoom }, "zoom", MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM),
    validOptionalStageNumber({ rotation }, "rotation", MIN_CAMERA_ROTATION, MAX_CAMERA_ROTATION)
  ].every(Boolean);
  const durationValid = command !== "camera" && !(command === "background" && transition.length > 0) || /^\d+(?:\.\d+)?(?:ms|s)$/.test(duration);
  const transitionValid = transition.length === 0 || (STAGE_TRANSITIONS as readonly string[]).includes(transition);
  const templateValid = command !== "textbox" || action === "reset" || isDialogueTemplate(template);
  const canSubmit = !disabled && assetValid && slotValid && zValid && moveGeometryValid && cameraGeometryValid && durationValid && transitionValid && templateValid;
  const commandLabel = command === "background" ? "背景" : command === "show" ? "角色" : command === "camera" ? "镜头" : command === "textbox" ? "文本框" : "音频";

  return (
    <form className={`direction-insert direction-insert--${command}`} aria-label={`新增${commandLabel}演出`} onSubmit={(event) => {
      event.preventDefault();
      if (!canSubmit) return;
      const parameters: Record<string, string> = { action };
      if (assetRequired) parameters.asset = asset;
      if (command === "background" && transition.length > 0) {
        parameters.transition = transition;
        parameters.duration = duration;
      }
      if (command === "show") {
        parameters.slot = slot;
        if (assetRequired) parameters.z = z;
        if (moveActive) {
          parameters.x = x;
          parameters.y = y;
          parameters.transition = "slide";
          parameters.duration = "300ms";
          parameters.easing = easing;
        } else if (action === "hide") {
          parameters.transition = "fade";
          parameters.duration = "300ms";
        }
      }
      if (command === "audio") {
        parameters.bus = bus;
        if (assetRequired) {
          parameters.loop = "false";
          parameters.volume = "1";
        }
      }
      if (command === "camera") {
        parameters.duration = duration;
        parameters.easing = easing;
        if (cameraMoveActive) Object.assign(parameters, { x, y, zoom, rotation });
      }
      if (command === "textbox" && action === "set") parameters.template = template;
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
        {moveActive && <><label><span>X（%）</span><input aria-label="新增移动水平位置" type="number" min={MIN_STAGE_PERCENT} max={MAX_STAGE_PERCENT} step="0.1" value={x} disabled={disabled} onChange={(event) => setX(event.target.value)} /></label><label><span>Y（%）</span><input aria-label="新增移动垂直位置" type="number" min={MIN_STAGE_PERCENT} max={MAX_STAGE_PERCENT} step="0.1" value={y} disabled={disabled} onChange={(event) => setY(event.target.value)} /></label><label><span>缓动</span><select aria-label="新增移动缓动" value={easing} disabled={disabled} onChange={(event) => setEasing(event.target.value)}>{STAGE_EASINGS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></>}
        {cameraMoveActive && <><label><span>偏移 X（%）</span><input aria-label="新增镜头水平偏移" type="number" min={MIN_CAMERA_OFFSET} max={MAX_CAMERA_OFFSET} step="0.1" value={x} disabled={disabled} onChange={(event) => setX(event.target.value)} /></label><label><span>偏移 Y（%）</span><input aria-label="新增镜头垂直偏移" type="number" min={MIN_CAMERA_OFFSET} max={MAX_CAMERA_OFFSET} step="0.1" value={y} disabled={disabled} onChange={(event) => setY(event.target.value)} /></label><label><span>倍率</span><input aria-label="新增镜头倍率" type="number" min={MIN_CAMERA_ZOOM} max={MAX_CAMERA_ZOOM} step="0.05" value={zoom} disabled={disabled} onChange={(event) => setZoom(event.target.value)} /></label><label><span>旋转</span><input aria-label="新增镜头旋转" type="number" min={MIN_CAMERA_ROTATION} max={MAX_CAMERA_ROTATION} step="0.1" value={rotation} disabled={disabled} onChange={(event) => setRotation(event.target.value)} /></label></>}
        {command === "background" && <><label><span>转场</span><select aria-label="新增背景转场" value={transition} disabled={disabled} onChange={(event) => setTransition(event.target.value)}><option value="">无</option>{STAGE_TRANSITIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{transition.length > 0 && <label><span>时长</span><input aria-label="新增背景转场时长" value={duration} disabled={disabled} onChange={(event) => setDuration(event.target.value)} /></label>}</>}
        {command === "camera" && <><label><span>时长</span><input aria-label="新增镜头时长" value={duration} disabled={disabled} onChange={(event) => setDuration(event.target.value)} /></label><label><span>缓动</span><select aria-label="新增镜头缓动" value={easing} disabled={disabled} onChange={(event) => setEasing(event.target.value)}>{STAGE_EASINGS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></>}
        {command === "audio" && <label><span>总线</span><select aria-label="新增音频总线" value={bus} disabled={disabled} onChange={(event) => setBus(event.target.value)}><option value="voice">Voice</option><option value="bgm">BGM</option><option value="sfx">SFX</option><option value="ambient">Ambient</option></select></label>}
        {command === "textbox" && action === "set" && <label><span>模板</span><select aria-label="新增文本框模板" value={template} disabled={disabled} onChange={(event) => setTemplate(event.target.value as DialogueTemplate)}>{DIALOGUE_TEMPLATES.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>}
      </div>
      {!assetValid && <small className="is-error">请选择 Asset Index 中类型兼容的资源</small>}
      {!slotValid && <small className="is-error">槽位必须是稳定标识符</small>}
      {!zValid && <small className="is-error">层级必须是 {MIN_STAGE_Z}–{MAX_STAGE_Z} 的整数</small>}
      {!moveGeometryValid && <small className="is-error">移动位置必须在 0–100 之间</small>}
      {!cameraGeometryValid && <small className="is-error">镜头偏移 -100–100，倍率 0.5–3，旋转 -30–30</small>}
      {!durationValid && <small className="is-error">转场或镜头时长必须带 ms 或 s 单位</small>}
      <div className="direction-insert__actions"><span>提交后写回权威脚本并自动选中新步骤</span><button type="submit" disabled={!canSubmit}>插入演出</button></div>
    </form>
  );
}

interface StageKeyframeInsertPanelProps {
  readonly seed: StageMoveKeyframeSeed;
  readonly disabled: boolean;
  readonly createCommandId: () => string;
  readonly createEntityId: (prefix: "stmt" | "txt") => string;
  readonly dispatch: (action: StudioAction) => void;
  readonly onClose: () => void;
}

function StageKeyframeInsertPanel({ seed, disabled, createCommandId, createEntityId, dispatch, onClose }: StageKeyframeInsertPanelProps) {
  const [draft, setDraft] = useState(() => ({
    z: String(seed.z), x: String(seed.x), y: String(seed.y), scale: String(seed.scale), rotation: String(seed.rotation),
    anchorX: String(seed.anchorX), anchorY: String(seed.anchorY), duration: seed.duration, easing: seed.easing
  }));
  const plan = planStageMoveKeyframe(seed, draft);
  const set = (field: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const message = plan.ok ? "将写入稳定 ID 的 @show action=move，并自动选中新步骤。" :
    plan.code === "NO_GEOMETRY_CHANGE" ? "请调整至少一个舞台几何值；不会创建空关键帧。" :
      plan.code === "INVALID_DURATION" ? "时长必须是正数，并使用 ms 或 s。" :
        plan.code === "INVALID_EASING" ? "请选择受支持的缓动曲线。" :
          "几何值超出舞台边界；位置 0–100、缩放 0.1–4、锚点 0–1。";
  return <form className="direction-insert keyframe-insert" aria-label="新增角色关键帧" onSubmit={(event) => {
    event.preventDefault();
    if (!plan.ok || disabled) return;
    dispatch({ type: "insert-direction", commandId: createCommandId(), afterId: seed.sourceStatementId, statementId: createEntityId("stmt"), command: "show", parameters: plan.parameters });
    onClose();
  }} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div className="direction-insert__heading">
      <div><span className="track-command track-command--show">KF</span><strong>下一角色关键帧</strong></div>
      <button type="button" aria-label="关闭关键帧插入面板" onClick={onClose}>×</button>
    </div>
    <div className="keyframe-insert__path" aria-label="关键帧插入路径"><code>{seed.sourceStatementId}</code><span>→</span><strong>{seed.slot} · NEW KEYFRAME</strong></div>
    <div className="direction-insert__fields keyframe-insert__fields">
      <label><span>X（%）</span><input aria-label="关键帧水平位置" type="number" min={MIN_STAGE_PERCENT} max={MAX_STAGE_PERCENT} step="0.1" value={draft.x} disabled={disabled} onChange={(event) => set("x", event.target.value)} /></label>
      <label><span>Y（%）</span><input aria-label="关键帧垂直位置" type="number" min={MIN_STAGE_PERCENT} max={MAX_STAGE_PERCENT} step="0.1" value={draft.y} disabled={disabled} onChange={(event) => set("y", event.target.value)} /></label>
      <label><span>缩放</span><input aria-label="关键帧缩放" type="number" min={MIN_STAGE_SCALE} max={MAX_STAGE_SCALE} step="0.01" value={draft.scale} disabled={disabled} onChange={(event) => set("scale", event.target.value)} /></label>
      <label><span>旋转</span><input aria-label="关键帧旋转" type="number" min={MIN_STAGE_ROTATION} max={MAX_STAGE_ROTATION} step="0.1" value={draft.rotation} disabled={disabled} onChange={(event) => set("rotation", event.target.value)} /></label>
      <label><span>锚点 X</span><input aria-label="关键帧水平锚点" type="number" min={MIN_STAGE_ANCHOR} max={MAX_STAGE_ANCHOR} step="0.01" value={draft.anchorX} disabled={disabled} onChange={(event) => set("anchorX", event.target.value)} /></label>
      <label><span>锚点 Y</span><input aria-label="关键帧垂直锚点" type="number" min={MIN_STAGE_ANCHOR} max={MAX_STAGE_ANCHOR} step="0.01" value={draft.anchorY} disabled={disabled} onChange={(event) => set("anchorY", event.target.value)} /></label>
      <label><span>层级</span><input aria-label="关键帧层级" type="number" min={MIN_STAGE_Z} max={MAX_STAGE_Z} step="1" value={draft.z} disabled={disabled} onChange={(event) => set("z", event.target.value)} /></label>
      <label><span>时长</span><input aria-label="关键帧时长" value={draft.duration} disabled={disabled} onChange={(event) => set("duration", event.target.value)} /></label>
      <label className="keyframe-insert__easing"><span>缓动</span><select aria-label="关键帧缓动" value={draft.easing} disabled={disabled} onChange={(event) => set("easing", event.target.value)}>{STAGE_EASINGS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <p className={plan.ok ? "keyframe-insert__status" : "keyframe-insert__status is-error"} role="status">{message}</p>
    <div className="direction-insert__actions"><span>单一权威脚本 · 可撤销 · Preview/Runtime 同语义</span><button type="submit" disabled={disabled || !plan.ok}>插入关键帧</button></div>
  </form>;
}

function StageMotionPathPanel({ seed, disabled, createCommandId, createEntityId, dispatch, onClose }: StageKeyframeInsertPanelProps) {
  const [draft, setDraft] = useState<StageMotionPathDraft>(() => defaultStageMotionPathDraft(seed));
  const [activePoint, setActivePoint] = useState<keyof StageMotionPathDraft>("waypoint");
  const plan = planStageMotionPath(seed, draft);
  const setPoint = (point: keyof StageMotionPathDraft, field: keyof StageMotionPathDraft["waypoint"], value: string) => {
    setDraft((current) => ({ ...current, [point]: { ...current[point], [field]: value } }));
  };
  const plotted = (point: keyof StageMotionPathDraft) => ({
    x: Math.min(100, Math.max(0, Number(draft[point].x) || 0)),
    y: Math.min(100, Math.max(0, Number(draft[point].y) || 0))
  });
  const waypoint = plotted("waypoint");
  const destination = plotted("destination");
  const message = plan.ok ? "将原子写入两个连续、稳定 ID 的 Move 关键帧；路径本身不另存模型。" :
    plan.code === "EMPTY_FIRST_SEGMENT" ? "路径第一段不能停留在当前角色位置。" :
      plan.code === "EMPTY_SECOND_SEGMENT" ? "终点必须不同于路径点。" :
        plan.code === "INVALID_WAYPOINT" ? "路径点坐标、时长或缓动无效。" : "终点坐标、时长或缓动无效。";
  return <form className="direction-insert keyframe-insert motion-path-insert" aria-label="新增角色运动路径" onSubmit={(event) => {
    event.preventDefault();
    if (!plan.ok || disabled) return;
    const waypointId = createEntityId("stmt");
    const destinationId = createEntityId("stmt");
    dispatch({
      type: "p0-batch",
      commandId: createCommandId(),
      operations: [
        { kind: "insert", afterId: seed.sourceStatementId, node: { kind: "directive", command: "show", id: waypointId, argumentsRaw: stageMotionPathDirectiveArguments(plan.segments[0].parameters) } },
        { kind: "insert", afterId: waypointId, node: { kind: "directive", command: "show", id: destinationId, argumentsRaw: stageMotionPathDirectiveArguments(plan.segments[1].parameters) } }
      ],
      selectedStatementId: destinationId
    });
    onClose();
  }} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div className="direction-insert__heading">
      <div><span className="track-command track-command--show">PATH</span><strong>两段角色运动路径</strong></div>
      <button type="button" aria-label="关闭运动路径面板" onClick={onClose}>×</button>
    </div>
    <div className="motion-path-editor">
      <svg
        viewBox="0 0 100 100"
        className="motion-path-editor__canvas"
        aria-label={`运动路径画布，当前编辑${activePoint === "waypoint" ? "路径点" : "终点"}`}
        onPointerDown={(event: ReactPointerEvent<SVGSVGElement>) => {
          if (disabled) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = Math.min(100, Math.max(0, (event.clientX - bounds.left) / bounds.width * 100));
          const y = Math.min(100, Math.max(0, (event.clientY - bounds.top) / bounds.height * 100));
          setPoint(activePoint, "x", x.toFixed(1));
          setPoint(activePoint, "y", y.toFixed(1));
        }}
      >
        <defs><linearGradient id="motion-path-gradient"><stop stopColor="#79e6ff"/><stop offset="0.5" stopColor="#c58cff"/><stop offset="1" stopColor="#ff75b7"/></linearGradient></defs>
        <path d={`M ${seed.x} ${seed.y} L ${waypoint.x} ${waypoint.y} L ${destination.x} ${destination.y}`} />
        <circle className="is-source" cx={seed.x} cy={seed.y} r="2.4" />
        <circle className={activePoint === "waypoint" ? "is-active" : ""} cx={waypoint.x} cy={waypoint.y} r="3" />
        <circle className={activePoint === "destination" ? "is-active" : ""} cx={destination.x} cy={destination.y} r="3" />
      </svg>
      <div className="motion-path-editor__legend"><span>START {seed.x}/{seed.y}</span><strong>{seed.slot}</strong><small>点击画布设置当前节点</small></div>
    </div>
    <div className="motion-path-points">
      {(["waypoint", "destination"] as const).map((point, index) => <fieldset key={point} data-active={activePoint === point}>
        <legend><button type="button" aria-pressed={activePoint === point} onClick={() => setActivePoint(point)}>{index === 0 ? "01 · 路径点" : "02 · 终点"}</button></legend>
        <label><span>X（%）</span><input aria-label={`${index === 0 ? "路径点" : "终点"}水平位置`} type="number" min={0} max={100} step="0.1" value={draft[point].x} disabled={disabled} onFocus={() => setActivePoint(point)} onChange={(event) => setPoint(point, "x", event.target.value)} /></label>
        <label><span>Y（%）</span><input aria-label={`${index === 0 ? "路径点" : "终点"}垂直位置`} type="number" min={0} max={100} step="0.1" value={draft[point].y} disabled={disabled} onFocus={() => setActivePoint(point)} onChange={(event) => setPoint(point, "y", event.target.value)} /></label>
        <label><span>时长</span><input aria-label={`${index === 0 ? "路径点" : "终点"}移动时长`} value={draft[point].duration} disabled={disabled} onFocus={() => setActivePoint(point)} onChange={(event) => setPoint(point, "duration", event.target.value)} /></label>
        <label><span>缓动</span><select aria-label={`${index === 0 ? "路径点" : "终点"}缓动`} value={draft[point].easing} disabled={disabled} onFocus={() => setActivePoint(point)} onChange={(event) => setPoint(point, "easing", event.target.value)}>{STAGE_EASINGS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </fieldset>)}
    </div>
    <p className={plan.ok ? "keyframe-insert__status" : "keyframe-insert__status is-error"} role="status">{message}</p>
    <div className="direction-insert__actions"><span>一次事务 · 两个 Canonical Move · Runtime/Preview 同语义</span><button type="submit" disabled={disabled || !plan.ok}>创建运动路径</button></div>
  </form>;
}

function StageBezierPathPanel({ seed, disabled, createCommandId, createEntityId, dispatch, onClose }: StageKeyframeInsertPanelProps) {
  const [draft, setDraft] = useState<StageBezierPathDraft>(() => defaultStageBezierPathDraft(seed));
  const [activePoint, setActivePoint] = useState<"control1" | "control2" | "destination">("destination");
  const plan = planStageBezierPath(seed, draft);
  const set = (field: keyof StageBezierPathDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const point = (x: string, y: string) => ({ x: Math.min(100, Math.max(0, Number(x) || 0)), y: Math.min(100, Math.max(0, Number(y) || 0)) });
  const control1 = point(draft.control1X, draft.control1Y);
  const control2 = point(draft.control2X, draft.control2Y);
  const destination = point(draft.x, draft.y);
  const message = plan.ok ? "将写入一个稳定 ID 的 Move；空间贝塞尔与时间缓动相互独立。" :
    plan.code === "INVALID_CONTROL_POINT" ? "两个控制点都必须位于 0–100 的舞台范围。" :
      plan.code === "INVALID_DESTINATION" ? "终点必须位于 0–100 的舞台范围。" :
        plan.code === "EMPTY_PATH" ? "终点不能与当前角色位置相同。" : "时长或缓动无效。";
  const selectPoint = (next: typeof activePoint, x: number, y: number) => {
    setActivePoint(next);
    if (next === "control1") { set("control1X", x.toFixed(1)); set("control1Y", y.toFixed(1)); }
    else if (next === "control2") { set("control2X", x.toFixed(1)); set("control2Y", y.toFixed(1)); }
    else { set("x", x.toFixed(1)); set("y", y.toFixed(1)); }
  };
  return <form className="direction-insert keyframe-insert motion-path-insert bezier-path-insert" aria-label="新增贝塞尔角色路径" onSubmit={(event) => {
    event.preventDefault();
    if (!plan.ok || disabled) return;
    dispatch({ type: "insert-direction", commandId: createCommandId(), afterId: seed.sourceStatementId, statementId: createEntityId("stmt"), command: "show", parameters: plan.parameters });
    onClose();
  }} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div className="direction-insert__heading">
      <div><span className="track-command track-command--show">BÉZIER</span><strong>三次贝塞尔角色路径</strong></div>
      <button type="button" aria-label="关闭贝塞尔路径面板" onClick={onClose}>×</button>
    </div>
    <div className="motion-path-editor">
      <svg viewBox="0 0 100 100" className="motion-path-editor__canvas" aria-label={`贝塞尔路径画布，当前编辑${activePoint}`} onPointerDown={(event: ReactPointerEvent<SVGSVGElement>) => {
        if (disabled) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        selectPoint(activePoint, Math.min(100, Math.max(0, (event.clientX - bounds.left) / bounds.width * 100)), Math.min(100, Math.max(0, (event.clientY - bounds.top) / bounds.height * 100)));
      }}>
        <defs><linearGradient id="bezier-path-gradient"><stop stopColor="#67e8f9"/><stop offset="0.5" stopColor="#a78bfa"/><stop offset="1" stopColor="#fb7185"/></linearGradient></defs>
        <g className="bezier-guides"><path d={`M ${seed.x} ${seed.y} L ${control1.x} ${control1.y}`} /><path d={`M ${destination.x} ${destination.y} L ${control2.x} ${control2.y}`} /></g>
        <path className="bezier-curve" d={`M ${seed.x} ${seed.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${destination.x} ${destination.y}`} />
        <circle className="is-source" cx={seed.x} cy={seed.y} r="2.4" />
        <circle className={activePoint === "control1" ? "is-active is-control" : "is-control"} cx={control1.x} cy={control1.y} r="2.7" />
        <circle className={activePoint === "control2" ? "is-active is-control" : "is-control"} cx={control2.x} cy={control2.y} r="2.7" />
        <circle className={activePoint === "destination" ? "is-active" : ""} cx={destination.x} cy={destination.y} r="3" />
      </svg>
      <div className="motion-path-editor__legend"><span>START {seed.x}/{seed.y}</span><strong>{seed.slot}</strong><small>选择节点后点击画布定位</small></div>
    </div>
    <div className="bezier-path-fields">
      {(["control1", "control2", "destination"] as const).map((name, index) => {
        const xKey = name === "control1" ? "control1X" : name === "control2" ? "control2X" : "x";
        const yKey = name === "control1" ? "control1Y" : name === "control2" ? "control2Y" : "y";
        const label = name === "destination" ? "终点" : `控制点 ${index + 1}`;
        return <fieldset key={name} data-active={activePoint === name}><legend><button type="button" aria-pressed={activePoint === name} onClick={() => setActivePoint(name)}>{label}</button></legend>
          <label><span>X</span><input aria-label={`贝塞尔${label} X`} type="number" min="0" max="100" step="0.1" value={draft[xKey]} onFocus={() => setActivePoint(name)} onChange={(event) => set(xKey, event.target.value)} /></label>
          <label><span>Y</span><input aria-label={`贝塞尔${label} Y`} type="number" min="0" max="100" step="0.1" value={draft[yKey]} onFocus={() => setActivePoint(name)} onChange={(event) => set(yKey, event.target.value)} /></label>
        </fieldset>;
      })}
      <label><span>时长</span><input aria-label="贝塞尔移动时长" value={draft.duration} onChange={(event) => set("duration", event.target.value)} /></label>
      <label><span>时间缓动</span><select aria-label="贝塞尔时间缓动" value={draft.easing} onChange={(event) => set("easing", event.target.value)}>{STAGE_EASINGS.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    <p className={plan.ok ? "keyframe-insert__status" : "keyframe-insert__status is-error"} role="status">{message}</p>
    <div className="direction-insert__actions"><span>单一 Canonical Move · Canvas/Runtime 同语义</span><button type="submit" disabled={disabled || !plan.ok}>创建贝塞尔路径</button></div>
  </form>;
}

function isCharacterMoveCue(statement: StoryStatement): boolean {
  if (statement.kind !== "direction" || statement.command !== "show") return false;
  const inspected = inspectDirectiveArguments(statement.summary);
  return inspected.duplicateKeys.length === 0 && inspected.positional.length === 0 && resolveDirectiveAction("show", inspected.parameters.action) === "move";
}

interface SequenceInspectorProps { readonly statement: Exclude<StoryStatement,{readonly kind:"dialogue"|"direction"}>;readonly disabled:boolean;readonly characterIds:readonly string[];readonly targetIds:readonly string[];readonly variableIds:readonly string[];readonly createCommandId:()=>string;readonly dispatch:(action:StudioAction)=>void; }
function SequenceInspector({statement,disabled,targetIds,variableIds,createCommandId,dispatch}:SequenceInspectorProps){
  if(statement.kind==="return")return <div className="readonly-step">返回调用方；该语句没有可编辑参数。</div>;
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget),value=(name:string)=>String(data.get(name)??"").trim();let patch:Readonly<Record<string,unknown>>={};
    if(statement.kind==="narration")patch={textRaw:JSON.stringify(value("text"))};
    else if(statement.kind==="choice"){const operations=[{kind:"update" as const,statementId:statement.id,patch:{promptRaw:JSON.stringify(value("prompt"))}},...statement.options.map((option)=>({kind:"update" as const,statementId:option.id,patch:{labelRaw:JSON.stringify(value(`label:${option.id}`)),targetLabel:value(`target:${option.id}`)}}))];dispatch({type:"p0-batch",commandId:createCommandId(),operations,selectedStatementId:statement.id});return;}
    else if(statement.kind==="label")patch={name:value("name")};
    else if(statement.kind==="jump"||statement.kind==="call")patch={targetLabel:value("target")};
    else if(statement.kind==="set")patch={variable:value("variable"),expressionRaw:value("expression")};
    else if(statement.kind==="condition")patch={expressionRaw:value("expression"),targetLabel:value("target")};
    else if(statement.kind==="wait")patch={durationRaw:value("duration")};
    else patch={nameRaw:JSON.stringify(value("ending"))};
    dispatch({type:"p0-update",commandId:createCommandId(),statementId:statement.id,patch});
  };
  return <form key={`${statement.id}:${statementLabel(statement)}`} className="sequence-inspector" aria-label={`${statementKindLabel(statement)}类型化参数`} onSubmit={submit}>
    {statement.kind==="narration"&&<label><span>旁白文本</span><textarea name="text" defaultValue={statement.text} rows={3} required disabled={disabled}/></label>}
    {statement.kind==="choice"&&<><label><span>选择提示</span><input name="prompt" defaultValue={statement.prompt} required disabled={disabled}/></label>{statement.options.map((option)=><fieldset key={option.id}><legend>{option.id}</legend><label><span>选项文本</span><input name={`label:${option.id}`} defaultValue={option.label} required disabled={disabled}/></label><label><span>目标稳定 ID</span><select name={`target:${option.id}`} defaultValue={option.targetSceneId} disabled={disabled}>{[...new Set([option.targetSceneId,...targetIds])].map((id)=><option key={id} value={id}>{id}</option>)}</select></label></fieldset>)}</>}
    {statement.kind==="label"&&<label><span>标签稳定名</span><input name="name" defaultValue={statement.name} required pattern="[A-Za-z_][A-Za-z0-9_.-]*" disabled={disabled}/></label>}
    {(statement.kind==="jump"||statement.kind==="call")&&<label><span>目标稳定 ID</span><select name="target" defaultValue={statement.targetLabel} disabled={disabled}>{[...new Set([statement.targetLabel,...targetIds])].map((id)=><option key={id} value={id}>{id}</option>)}</select></label>}
    {statement.kind==="set"&&<><label><span>变量稳定 ID</span><select name="variable" defaultValue={statement.variable} disabled={disabled}>{[...new Set([statement.variable,...variableIds])].map((id)=><option key={id} value={id}>{id}</option>)}</select></label><label><span>类型化表达式</span><input name="expression" defaultValue={statement.expression} required disabled={disabled}/></label></>}
    {statement.kind==="condition"&&<><label><span>条件表达式</span><input name="expression" defaultValue={statement.expression} required disabled={disabled}/></label><label><span>成立时目标</span><select name="target" defaultValue={statement.targetLabel} disabled={disabled}>{[...new Set([statement.targetLabel,...targetIds])].map((id)=><option key={id} value={id}>{id}</option>)}</select></label></>}
    {statement.kind==="wait"&&<label><span>等待时长</span><input name="duration" defaultValue={statement.duration} required pattern="[0-9]+(?:\.[0-9]+)?(?:ms|s)" disabled={disabled}/></label>}
    {statement.kind==="end"&&<label><span>结局名称</span><input name="ending" defaultValue={statement.endingName} required disabled={disabled}/></label>}
    <button type="submit" disabled={disabled}>应用类型化参数</button><small>字段按 AST 类型提交，不解析卡片显示文本。</small>
  </form>;
}

function SequenceView({
  session,
  dispatch,
  createCommandId,
  createEntityId,
  onInputDirtyChange,
  assetIndex,
  variableIds,
  requestedFocusStatementId,
  onRequestedFocusHandled,
  runtimeRouteTrace
}: SequenceViewProps) {
  const scene = findScene(session.project, session.activeSceneId);
  const selected = findStatement(session.project, scene.id, session.selectedStatementId);
  const selectedIndex = scene.statements.findIndex((statement) => statement.id === selected.id);
  const previousAnchor =
    selectedIndex <= 1 ? scene.id : (scene.statements[selectedIndex - 2]?.id ?? scene.id);
  const nextStatement = scene.statements[selectedIndex + 1];
  const pendingDraft = hasPendingDraft(session);
  const [insertCommand, setInsertCommand] = useState<DirectionCommand | null>(null);
  const [keyframeInsertOpen, setKeyframeInsertOpen] = useState(false);
  const [motionPathOpen, setMotionPathOpen] = useState(false);
  const [bezierPathOpen, setBezierPathOpen] = useState(false);
  const [draggedDirectionId, setDraggedDirectionId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedDirectionIds, setSelectedDirectionIds] = useState<readonly string[]>([]);
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [stageWindowStart, setStageWindowStart] = useState(0);
  const [stageSearchQuery, setStageSearchQuery] = useState("");
  const [activeStageSearchResult, setActiveStageSearchResult] = useState(0);
  const [pendingStageFocusId, setPendingStageFocusId] = useState<string | null>(null);
  const [sequenceInsertKind,setSequenceInsertKind]=useState<SequenceInsertKind>("dialogue");
  const [sequenceMultiSelect,setSequenceMultiSelect]=useState(false);
  const [sequenceSelectedIds,setSequenceSelectedIds]=useState<readonly string[]>([]);
  const [sequenceRangeAnchor,setSequenceRangeAnchor]=useState<string|null>(null);
  const [collapsedStatementIds,setCollapsedStatementIds]=useState<readonly string[]>([]);
  const stageWindow = createStageWindow(scene.statements.length, stageWindowStart);
  const visibleStatements = scene.statements.slice(stageWindow.start, stageWindow.end);
  const selectedInStageWindow = selectedIndex >= stageWindow.start && selectedIndex < stageWindow.end;
  const stageSearchIndex = useMemo(() => createStageSearchIndex(scene.statements), [scene.statements]);
  const stageSearch = useMemo(() => searchStageIndex(stageSearchIndex, stageSearchQuery), [stageSearchIndex, stageSearchQuery]);
  const resolvedStageSearchResult = Math.min(activeStageSearchResult, Math.max(0, stageSearch.matches.length - 1));
  const selectedSearchMatch = stageSearch.matches[resolvedStageSearchResult];
  const keyframeSeed = useMemo(() => deriveStageMoveKeyframeSeed(scene.statements, selectedIndex), [scene.statements, selectedIndex]);
  const runtimeCurrentStatementId = runtimeRouteTrace.active && runtimeRouteTrace.currentSceneId === scene.id
    ? runtimeRouteTrace.currentStatementId
    : null;
  const runtimeCurrentIndex = runtimeCurrentStatementId === null
    ? -1
    : scene.statements.findIndex((statement) => statement.id === runtimeCurrentStatementId);
  const stageTimeline = useMemo(() => projectStageTimeline(scene.statements), [scene.statements]);
  const timelineFollowsRuntime = runtimeCurrentIndex >= 0;
  const timelinePlayheadIndex = timelineFollowsRuntime ? runtimeCurrentIndex : selectedIndex;
  const timelinePlayheadCue = stageTimeline.cues[timelinePlayheadIndex];
  const syntaxNodes=activeSourceSession(session).committedDocument.nodes;
  const sequenceReferences={characterIds:session.project.characters.map((item)=>item.id),sceneIds:session.project.scenes.map((item)=>item.id),labelIds:syntaxNodes.flatMap((item)=>item.kind==="label"?[item.name]:[]),variableIds:[...new Set([...variableIds,...syntaxNodes.flatMap((item)=>item.kind==="set"?[item.variable]:[])])],assetIds:assetIndex.assets.map((item)=>item.assetId)};
  const sequenceInsertRequirement = sequenceInsertKind === "dialogue" && sequenceReferences.characterIds.length === 0
    ? "插入对白前，请先返回项目结构创建至少一名角色。"
    : (sequenceInsertKind === "set" || sequenceInsertKind === "condition") && sequenceReferences.variableIds.length === 0
      ? "插入变量语句前，请先返回项目结构创建至少一个变量。"
      : (sequenceInsertKind === "background" || sequenceInsertKind === "show" || sequenceInsertKind === "audio") && sequenceReferences.assetIds.length === 0
        ? "插入演出语句前，请先打开资源保险库导入资源。"
        : null;
  const targetIds=[...new Set([...sequenceReferences.labelIds,...sequenceReferences.sceneIds])];
  const selectedSequenceIds=sequenceMultiSelect?sequenceSelectedIds:[selected.id];
  const insertionAnchor=selected.kind==="choice"?selected.options.at(-1)?.id??selected.id:selected.id;
  const insertPlan=(plan:ReturnType<typeof createSequenceInsertPlan>)=>{const first=plan[0]?.node,selectedStatementId=first===undefined?undefined:first.kind==="dialogue"||first.kind==="narration"?first.statementId:first.id;dispatch({type:"p0-batch",commandId:createCommandId(),operations:plan.map((step)=>({kind:"insert" as const,afterId:step.afterId,node:step.node})),...(selectedStatementId===undefined?{}:{selectedStatementId})});};
  const choiceChildren=(statement:StoryStatement)=>statement.kind==="choice"?statement.options.map((item)=>item.id):[];
  const duplicateSelected=()=>insertPlan(duplicateSequencePlan(selected,insertionAnchor,createEntityId));
  const deleteSelected=()=>{const ids=scene.statements.filter((item)=>selectedSequenceIds.includes(item.id)).flatMap((item)=>[item.id,...choiceChildren(item)]);dispatch({type:"p0-batch",commandId:createCommandId(),operations:ids.map((statementId)=>({kind:"delete" as const,statementId}))});setSequenceSelectedIds([]);};
  const moveStatement=(statement:StoryStatement,direction:-1|1)=>{const afterId=sequenceMoveAfterId(scene.statements,scene.id,statement.id,direction);if(afterId===undefined)return;const operations=[{kind:"move" as const,statementId:statement.id,afterId}];if(statement.kind==="choice"){let anchor=statement.id;for(const option of statement.options){operations.push({kind:"move" as const,statementId:option.id,afterId:anchor});anchor=option.id;}}dispatch({type:"p0-batch",commandId:createCommandId(),operations,selectedStatementId:statement.id});};
  const moveSelected=(direction:-1|1)=>moveStatement(selected,direction);
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
    setSequenceMultiSelect(false);setSequenceSelectedIds([]);setSequenceRangeAnchor(null);setCollapsedStatementIds([]);
  }, [scene.id]);
  useEffect(() => { setKeyframeInsertOpen(false); }, [selected.id]);
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
    if (runtimeCurrentIndex < 0) return;
    setStageWindowStart((current) => revealStageIndex(
      createStageWindow(scene.statements.length, current),
      runtimeCurrentIndex
    ).start);
  }, [scene.statements.length, runtimeCurrentIndex]);
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
    if (requestedFocusStatementId === null || requestedFocusStatementId !== selected.id) return;
    setStageWindowStart(revealStageIndex(stageWindow, selectedIndex).start);
    setPendingStageFocusId(requestedFocusStatementId);
    onRequestedFocusHandled();
  }, [requestedFocusStatementId, selected.id, selectedIndex]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.altKey || pendingDraft) return;
      const command = event.key === "1" ? "background" : event.key === "2" ? "show" : event.key === "3" ? "audio" : event.key === "4" ? "camera" : event.key === "5" ? "textbox" : null;
      if (command === null) return;
      event.preventDefault();
      setInsertCommand(command);
    };
    globalThis.addEventListener("keydown", shortcut);
    return () => globalThis.removeEventListener("keydown", shortcut);
  }, [pendingDraft]);
  useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if(!pendingDraft&&sequenceInsertRequirement===null&&event.ctrlKey&&event.key==="Enter"){event.preventDefault();insertPlan(createSequenceInsertPlan(sequenceInsertKind,insertionAnchor,sequenceReferences,createEntityId));}};globalThis.addEventListener("keydown",shortcut);return()=>globalThis.removeEventListener("keydown",shortcut);},[pendingDraft,sequenceInsertKind,sequenceInsertRequirement,insertionAnchor,session.project,assetIndex]);

  return (
    <section className="authoring-panel view-enter" aria-labelledby="sequence-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">SEQUENCE · CANONICAL STABLE-ID PATCH</p>
          <h2 id="sequence-heading">{scene.title}</h2>
        </div>
        <span className="context-chip">权威脚本投影</span>
      </div>

      <div
        className={runtimeRouteTrace.active ? "sequence-runtime-trace is-active" : "sequence-runtime-trace"}
        role="status"
        aria-label="Sequence 运行步骤高亮"
      >
        <span aria-hidden="true">◆</span>
        {runtimeCurrentIndex >= 0 ? (
          <span>Runtime 当前步骤 · <strong>{runtimeCurrentStatementId}</strong></span>
        ) : runtimeRouteTrace.active && runtimeRouteTrace.currentSceneId !== scene.id ? (
          <span>Runtime 当前位于其他场景 · <strong>{runtimeRouteTrace.currentSceneId}</strong></span>
        ) : runtimeRouteTrace.active ? (
          <span>Runtime 当前内部指令未映射到剧情步骤</span>
        ) : (
          <span>Runtime 未运行 · 启动试玩后高亮正式执行位置</span>
        )}
      </div>

      <div className="statement-toolbar" aria-label="对白结构工具">
        <label className="sequence-insert"><span>插入语句</span><select aria-label="插入 P0 语句类型" value={sequenceInsertKind} disabled={pendingDraft} onChange={(event)=>setSequenceInsertKind(event.target.value as SequenceInsertKind)}>{([['dialogue','对白'],['narration','旁白'],['choice','两选项选择'],['label','标签'],['jump','跳转'],['call','调用'],['return','返回'],['set','设置变量'],['condition','条件分支'],['wait','等待'],['end','结局'],['background','背景'],['show','角色演出'],['camera','镜头'],['audio','音频'],['textbox','文本框模板']] as const).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <button type="button" aria-keyshortcuts="Control+Enter" disabled={pendingDraft||sequenceInsertRequirement!==null} onClick={()=>insertPlan(createSequenceInsertPlan(sequenceInsertKind,insertionAnchor,sequenceReferences,createEntityId))}>＋ 插入</button>
        <button type="button" disabled={pendingDraft||sequenceMultiSelect} onClick={duplicateSelected}>复制</button>
        <button type="button" aria-label="语句上移" disabled={pendingDraft||sequenceMultiSelect||sequenceMoveAfterId(scene.statements,scene.id,selected.id,-1)===undefined} onClick={()=>moveSelected(-1)}>↑</button>
        <button type="button" aria-label="语句下移" disabled={pendingDraft||sequenceMultiSelect||sequenceMoveAfterId(scene.statements,scene.id,selected.id,1)===undefined} onClick={()=>moveSelected(1)}>↓</button>
        <button type="button" aria-pressed={sequenceMultiSelect} disabled={pendingDraft} onClick={()=>{const next=!sequenceMultiSelect;setSequenceMultiSelect(next);setSequenceSelectedIds(next?[selected.id]:[]);setSequenceRangeAnchor(next?selected.id:null);}}>{sequenceMultiSelect?`${sequenceSelectedIds.length} 已选`:'多选'}</button>
        <button type="button" disabled={selectedSequenceIds.length===0} onClick={()=>setCollapsedStatementIds((current)=>[...new Set([...current,...selectedSequenceIds])])}>折叠</button>
        <button type="button" disabled={selectedSequenceIds.length===0} onClick={()=>setCollapsedStatementIds((current)=>current.filter((id)=>!selectedSequenceIds.includes(id)))}>展开</button>
        <button type="button" className="danger-button" disabled={pendingDraft||selectedSequenceIds.length===0} onClick={deleteSelected}>删除所选</button>
      </div>
      {sequenceInsertRequirement !== null && <p className="sequence-insert-requirement" role="status">{sequenceInsertRequirement}</p>}

      <div className="statement-toolbar statement-toolbar--legacy" aria-label="对白快捷工具">
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
              {([['background', '＋ 背景', 'Alt+1'], ['show', '＋ 角色', 'Alt+2'], ['audio', '＋ 音频', 'Alt+3'], ['camera', '＋ 镜头', 'Alt+4'], ['textbox', '＋ 文本框', 'Alt+5']] as const).map(([command, label, shortcut]) => <button key={command} type="button" aria-keyshortcuts={shortcut} disabled={pendingDraft} onClick={() => { setKeyframeInsertOpen(false); setMotionPathOpen(false); setBezierPathOpen(false); setInsertCommand(command); }}>{label}</button>)}
              <button type="button" className="stage-keyframe-button" disabled={pendingDraft || multiSelectMode || !keyframeSeed.ok} title={keyframeSeed.ok ? "从当前角色状态创建下一关键帧" : "请先选择舞台上有效的角色 Show 或 Move Cue"} onClick={() => { setInsertCommand(null); setMotionPathOpen(false); setBezierPathOpen(false); setKeyframeInsertOpen(true); }}>＋ 关键帧</button>
              <button type="button" className="stage-motion-path-button" disabled={pendingDraft || multiSelectMode || !keyframeSeed.ok} title={keyframeSeed.ok ? "从当前角色状态创建两段运动路径" : "请先选择舞台上有效的角色 Show 或 Move Cue"} onClick={() => { setInsertCommand(null); setKeyframeInsertOpen(false); setBezierPathOpen(false); setMotionPathOpen(true); }}>＋ 路径</button>
              <button type="button" className="stage-bezier-path-button" disabled={pendingDraft || multiSelectMode || !keyframeSeed.ok} title={keyframeSeed.ok ? "创建单一三次贝塞尔角色路径" : "请先选择舞台上有效的角色 Show 或 Move Cue"} onClick={() => { setInsertCommand(null); setKeyframeInsertOpen(false); setMotionPathOpen(false); setBezierPathOpen(true); }}>＋ 贝塞尔</button>
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
        <div className="stage-timeline-transport" role="group" aria-label="时间线播放头" data-playhead-source={timelineFollowsRuntime ? "runtime" : "selection"}>
          <div>
            <span>{timelineFollowsRuntime ? "RUNTIME" : "EDIT"}</span>
            <strong>{formatStageTimelineTime(timelinePlayheadCue?.startMilliseconds ?? 0)}</strong>
            <small>{timelineFollowsRuntime ? `正式运行 · ${runtimeCurrentStatementId}` : `选中步骤 · ${selected.id}`}</small>
          </div>
          <input
            type="range"
            aria-label="时间线播放头位置"
            min={0}
            max={Math.max(0, scene.statements.length - 1)}
            step={1}
            value={Math.max(0, timelinePlayheadIndex)}
            disabled={timelineFollowsRuntime || pendingDraft || scene.statements.length <= 1}
            onChange={(event) => {
              const statement = scene.statements[Number(event.target.value)];
              if (statement !== undefined) dispatch({ type: "select-statement", statementId: statement.id });
            }}
          />
          <output>{formatStageTimelineTime(timelinePlayheadCue?.startMilliseconds ?? 0)} / {formatStageTimelineTime(stageTimeline.totalDurationMilliseconds)}</output>
        </div>
        <div className="stage-track__scroll">
          <div className="stage-timeline-ruler stage-lane" aria-label="时间标尺">
            <span className="stage-lane__label">TIME</span>
            <div className="stage-lane__steps">
              {stageTimeline.cues.slice(stageWindow.start, stageWindow.end).map((cue) => (
                <button
                  type="button"
                  className={cue.statementIndex === timelinePlayheadIndex ? "stage-timeline-tick is-playhead" : "stage-timeline-tick"}
                  key={cue.statementId}
                  aria-label={`时间标记 ${formatStageTimelineTime(cue.startMilliseconds)}，步骤 ${cue.statementIndex + 1}`}
                  disabled={timelineFollowsRuntime || pendingDraft}
                  onClick={() => dispatch({ type: "select-statement", statementId: cue.statementId })}
                >
                  <span>{formatStageTimelineTime(cue.startMilliseconds)}</span>
                  <small>{cue.durationMilliseconds}ms</small>
                </button>
              ))}
            </div>
          </div>
          {(["background", "character", "camera", "audio", "text", "story"] as const).map((lane) => (
            <div className={`stage-lane stage-lane--${lane}`} key={lane}>
              <span className="stage-lane__label">{lane === "background" ? "BG" : lane === "character" ? "CHAR" : lane === "camera" ? "CAM" : lane === "audio" ? "AUDIO" : lane === "text" ? "TEXT" : "STORY"}</span>
              <div className="stage-lane__steps">
                {visibleStatements.map((statement, visibleIndex) => {
                  const index = stageWindow.start + visibleIndex;
                  return stageTimelineLane(statement) === lane ? (
                  <button
                    type="button"
                    key={statement.id}
                    draggable={statement.kind === "direction" && !pendingDraft && !multiSelectMode}
                    data-dragging={draggedDirectionId === statement.id ? "true" : undefined}
                    className={`${statement.id === selected.id ? "stage-cue is-active" : "stage-cue"}${selectedDirectionIds.includes(statement.id) ? " is-batch-selected" : ""}${index === timelinePlayheadIndex ? " is-playhead" : ""}`}
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
                    <span>{String(index + 1).padStart(2, "0")}</span><strong>{statement.kind === "direction" ? `@${statement.command}` : statementKindLabel(statement)}</strong>{isCharacterMoveCue(statement) && <em className="stage-cue__keyframe">KF</em>}
                  </button>
                ) : <span className={`stage-cue stage-cue--empty${index === timelinePlayheadIndex ? " is-playhead" : ""}`} aria-hidden="true" key={`${statement.id}:empty`} />;
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

      {keyframeInsertOpen && keyframeSeed.ok && <StageKeyframeInsertPanel
        key={keyframeSeed.seed.sourceStatementId}
        seed={keyframeSeed.seed}
        disabled={pendingDraft}
        createCommandId={createCommandId}
        createEntityId={createEntityId}
        dispatch={dispatch}
        onClose={() => setKeyframeInsertOpen(false)}
      />}

      {motionPathOpen && keyframeSeed.ok && <StageMotionPathPanel
        key={keyframeSeed.seed.sourceStatementId}
        seed={keyframeSeed.seed}
        disabled={pendingDraft}
        createCommandId={createCommandId}
        createEntityId={createEntityId}
        dispatch={dispatch}
        onClose={() => setMotionPathOpen(false)}
      />}

      {bezierPathOpen && keyframeSeed.ok && <StageBezierPathPanel
        key={keyframeSeed.seed.sourceStatementId}
        seed={keyframeSeed.seed}
        disabled={pendingDraft}
        createCommandId={createCommandId}
        createEntityId={createEntityId}
        dispatch={dispatch}
        onClose={() => setBezierPathOpen(false)}
      />}

      <div className="statement-list" aria-label={`剧情步骤，当前显示 ${stageWindow.start + 1} 至 ${stageWindow.end}，共 ${stageWindow.total} 步`}>
        {visibleStatements.map((statement, visibleIndex) => {
          const index = stageWindow.start + visibleIndex;
          const runtimeCurrent = statement.id === runtimeCurrentStatementId;
          return (
          <button
            id={`statement-card-${statement.id}`}
            key={statement.id}
            className={[
              `statement-card statement-card--${statement.kind}`,
              statement.id === session.selectedStatementId ? "is-active" : "",
              runtimeCurrent ? "is-runtime-current" : ""
            ].filter(Boolean).join(" ")}
            onClick={(event) => {dispatch({ type: "select-statement", statementId: statement.id });if(sequenceMultiSelect){if(event.shiftKey&&sequenceRangeAnchor!==null)setSequenceSelectedIds(sequenceRangeSelection(scene.statements,sequenceRangeAnchor,statement.id));else{setSequenceRangeAnchor(statement.id);setSequenceSelectedIds((current)=>current.includes(statement.id)?current.filter((id)=>id!==statement.id):[...current,statement.id]);}}}}
            aria-pressed={sequenceMultiSelect?sequenceSelectedIds.includes(statement.id):undefined}
            aria-current={runtimeCurrent ? "step" : undefined}
            data-runtime-current={runtimeCurrent}
            aria-label={`选择${statementKindLabel(statement)}：${statementLabel(statement)}`}
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete Shift+Space"
            onKeyDown={(event)=>{if(pendingDraft)return;if(sequenceMultiSelect&&event.shiftKey&&(event.key===" "||event.key==="Enter")){event.preventDefault();const ids=sequenceRangeAnchor===null?[statement.id]:sequenceRangeSelection(scene.statements,sequenceRangeAnchor,statement.id);setSequenceSelectedIds(ids);return;}if(!sequenceMultiSelect&&event.altKey&&event.key==="ArrowUp"){event.preventDefault();moveStatement(statement,-1);}else if(!sequenceMultiSelect&&event.altKey&&event.key==="ArrowDown"){event.preventDefault();moveStatement(statement,1);}else if(event.key==="Delete"){event.preventDefault();deleteSelected();}}}
            onDoubleClick={()=>setCollapsedStatementIds((current)=>current.includes(statement.id)?current.filter((id)=>id!==statement.id):[...current,statement.id])}
          >
            <span className="statement-order">{String(index + 1).padStart(2, "0")}</span>
            <span className="statement-kind">{statementKindLabel(statement)}</span>
            <span className="statement-copy">{collapsedStatementIds.includes(statement.id)?"已折叠":statementLabel(statement)}</span>
          </button>
        );
        })}
      </div>

      <div className="inline-inspector">
        <div className="inspector-label-row">
          {selected.kind === "dialogue" ? (
            <label htmlFor="dialogue-editor">对白内容</label>
          ) : (
            <span className="inspector-title">当前步骤 · 类型化参数</span>
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
        ) : <SequenceInspector statement={selected} disabled={pendingDraft} characterIds={sequenceReferences.characterIds} targetIds={targetIds} variableIds={sequenceReferences.variableIds} createCommandId={createCommandId} dispatch={dispatch}/>}
        <p className="field-help">
          Sequence 不持有第二份剧情；每次编辑都通过稳定 ID Patch 写回权威 Script，再重新投影。
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

interface FlowViewProps extends CommonProps {
  readonly canonicalProject: CanonicalProject;
  readonly runtimeRouteTrace: RuntimeRouteTrace;
  readonly routeCompiler?: EditorProjectCompilerState;
  readonly hasLocalChanges: boolean;
  readonly trustedChangedSceneIds?: readonly string[];
  readonly createCommandId: () => string;
  readonly onOpenSequence: (sceneId: string, statementId?: string) => void;
  readonly onRenameScene: (sceneId: string, title: string) => RenameRouteSceneResult;
  readonly onSetScenePosition: (sceneId: string, x: number, y: number) => RouteProjectMutationResult;
  readonly onResetSceneLayout: (sceneId: string) => RouteProjectMutationResult;
  readonly onUpsertGroup: (groupId: string, title: string) => RouteProjectMutationResult;
  readonly onToggleGroup: (groupId: string) => RouteProjectMutationResult;
  readonly onDeleteGroup: (groupId: string) => RouteProjectMutationResult;
  readonly onAssignGroup: (sceneId: string, groupId?: string) => RouteProjectMutationResult;
  readonly onSetViewport: (x: number, y: number, zoom: number) => RouteProjectMutationResult;
}

export interface RuntimeRouteTrace {
  readonly active: boolean;
  readonly currentSceneId: string | null;
  readonly currentStatementId: string | null;
  readonly visitedSceneIds: readonly string[];
  readonly visitedEdgeIds: readonly string[];
}

export function runtimeRouteAnchorSceneId(trace: RuntimeRouteTrace, selectedSceneId: string): string {
  return trace.active && trace.currentSceneId !== null ? trace.currentSceneId : selectedSceneId;
}

const IDLE_RUNTIME_ROUTE_TRACE: RuntimeRouteTrace = {
  active: false,
  currentSceneId: null,
  currentStatementId: null,
  visitedSceneIds: [],
  visitedEdgeIds: []
};

const compilerCacheLabels = {
  unsupported: "宿主不支持缓存",
  miss: "缓存未命中",
  hit: "缓存命中",
  corrupt: "缓存损坏后重建",
  incompatible: "缓存版本不兼容后重建",
  "inventory-mismatch": "文件清单变化后重建",
  "source-mismatch": "源正文变化后重建"
} as const;

function FlowView({ session, dispatch, canonicalProject, runtimeRouteTrace, routeCompiler, hasLocalChanges, trustedChangedSceneIds, createCommandId, onOpenSequence, onRenameScene, onSetScenePosition, onResetSceneLayout, onUpsertGroup, onToggleGroup, onDeleteGroup, onAssignGroup, onSetViewport }: FlowViewProps) {
  const canonicalHash = useMemo(() => hasLocalChanges ? undefined : semanticHash(canonicalProject), [canonicalProject, hasLocalChanges]);
  const compilerAligned = routeCompiler !== undefined && routeCompiler.projectHash === canonicalHash;
  const incrementalProjection = useMemo(() => !compilerAligned && routeCompiler !== undefined ? buildRouteGraphIncremental(canonicalProject, routeCompiler.compilation.cache, trustedChangedSceneIds) : undefined, [canonicalProject, compilerAligned, routeCompiler, trustedChangedSceneIds]);
  const graph = useMemo(() => compilerAligned ? buildRouteGraphFromCompilation(canonicalProject, routeCompiler.compilation) : incrementalProjection?.graph ?? buildRouteGraph(canonicalProject), [canonicalProject, compilerAligned, incrementalProjection, routeCompiler]);
  const compilerStatus = compilerAligned
    ? `${compilerCacheLabels[routeCompiler.cacheStatus]} · ${routeCompiler.compilation.stats.compiledSceneIds.length} 编译 / ${routeCompiler.compilation.stats.reusedSceneIds.length} 复用`
    : incrementalProjection === undefined ? "未接入宿主缓存 · 内存全量编译" : `存在未保存改动 · 内存增量分析 · ${incrementalProjection.analysis.stats.compiledSceneIds.length} 编译 / ${incrementalProjection.analysis.stats.reusedSceneIds.length} 复用`;
  const routeIndex = useMemo(() => createRouteGraphIndex(graph), [graph]);
  const [query, setQuery] = useState("");
  const [chapterFilter,setChapterFilter]=useState("");
  const [kindFilter,setKindFilter]=useState<""|RouteNodeKind>("");
  const [groupFilter,setGroupFilter]=useState("");
  const [windowOffset, setWindowOffset] = useState<number | undefined>(undefined);
  const [endingSceneId, setEndingSceneId] = useState("");
  const [endingCandidateIndex, setEndingCandidateIndex] = useState(0);
  const [endingRouteStep, setEndingRouteStep] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState(session.activeSceneId);
  const selected = graph.nodes.find((node) => node.id === selectedSceneId) ?? graph.nodes[0];
  const [title, setTitle] = useState(selected?.title ?? "");
  const [layoutX, setLayoutX] = useState(selected?.layout.x ?? 0);
  const [layoutY, setLayoutY] = useState(selected?.layout.y ?? 0);
  const [selectedGroupId,setSelectedGroupId]=useState(selected?.layout.groupId??"");
  const [newGroupId,setNewGroupId]=useState("");
  const [newGroupTitle,setNewGroupTitle]=useState("");
  const [viewportX,setViewportX]=useState(graph.viewport.x);
  const [viewportY,setViewportY]=useState(graph.viewport.y);
  const [viewportZoom,setViewportZoom]=useState(graph.viewport.zoom);
  const [editResult, setEditResult] = useState<{ readonly tone: "success" | "error"; readonly text: string } | null>(null);
  const [repairTargets, setRepairTargets] = useState<Readonly<Record<string, string>>>({});
  const [repairEdgeId, setRepairEdgeId] = useState("");
  const [repairEditorOpen, setRepairEditorOpen] = useState(false);
  const [pendingRepair, setPendingRepair] = useState<{ readonly sourceSceneId: string; readonly optionId: string; readonly previousTargetSceneId: string; readonly targetSceneId: string } | null>(null);
  const runtimeVisitedScenes = useMemo(() => new Set(runtimeRouteTrace.visitedSceneIds), [runtimeRouteTrace.visitedSceneIds]);
  const runtimeVisitedEdges = useMemo(() => new Set(runtimeRouteTrace.visitedEdgeIds), [runtimeRouteTrace.visitedEdgeIds]);
  const runtimeCurrentTitle = graph.nodes.find((node) => node.id === runtimeRouteTrace.currentSceneId)?.title ?? runtimeRouteTrace.currentSceneId;
  const endingNodes = useMemo(() => graph.nodes.filter((node) => node.facts.some((item) => item.kind === "ending")), [graph]);
  const endingRouteReview = useMemo(() => endingSceneId === "" ? null : reviewRouteToEnding(graph, endingSceneId), [endingSceneId, graph]);
  const endingCandidate = endingRouteReview?.candidates[endingCandidateIndex] ?? endingRouteReview?.candidates[0];
  const reviewedSceneIds = useMemo(() => new Set(endingCandidate?.sceneIds ?? []), [endingCandidate]);
  const reviewedEdgeIds = useMemo(() => new Set(endingCandidate?.edgeIds ?? []), [endingCandidate]);
  const endingRouteAnchorSceneId = endingCandidate?.sceneIds[endingRouteStep];
  const routeWindowAnchorSceneId = endingSceneId !== "" && endingRouteAnchorSceneId !== undefined
    ? endingRouteAnchorSceneId
    : runtimeRouteAnchorSceneId(runtimeRouteTrace, selectedSceneId);
  useEffect(() => setTitle(selected?.title ?? ""), [selected?.id, selected?.title]);
  useEffect(() => { setLayoutX(selected?.layout.x ?? 0);setLayoutY(selected?.layout.y ?? 0); }, [selected?.id, selected?.layout.x, selected?.layout.y]);
  useEffect(()=>setSelectedGroupId(selected?.layout.groupId??""),[selected?.id,selected?.layout.groupId]);
  useEffect(()=>{setViewportX(graph.viewport.x);setViewportY(graph.viewport.y);setViewportZoom(graph.viewport.zoom);},[graph.viewport.x,graph.viewport.y,graph.viewport.zoom]);
  useEffect(() => setWindowOffset(undefined), [query,chapterFilter,kindFilter,groupFilter]);
  useEffect(() => {
    if (!runtimeRouteTrace.active || runtimeRouteTrace.currentSceneId === null) return;
    setSelectedSceneId(runtimeRouteTrace.currentSceneId);
    setWindowOffset(undefined);
  }, [runtimeRouteTrace.active, runtimeRouteTrace.currentSceneId]);
  useEffect(() => {
    if (pendingRepair === null) return;
    const actualTarget = choiceOptionTarget(session.project, pendingRepair.sourceSceneId, pendingRepair.optionId);
    if (actualTarget === pendingRepair.targetSceneId) {
      setEditResult({ tone: "success", text: `路线目标已提交 · ${pendingRepair.previousTargetSceneId}→${pendingRepair.targetSceneId} · 请保存并用正式 Runtime 复核` });
      setPendingRepair(null);
      return;
    }
    if (session.notice.tone === "error") {
      setEditResult({ tone: "error", text: `路线修复失败关闭 · ${session.notice.detail}` });
      setPendingRepair(null);
    }
  }, [pendingRepair, session.notice, session.project]);
  const routeWindow = useMemo(() => queryRouteGraphWindow(routeIndex, {
    query,
    ...(chapterFilter===""?{}:{chapterId:chapterFilter}),
    ...(kindFilter===""?{}:{kind:kindFilter}),
    ...(groupFilter===""?{}:{groupId:groupFilter==="__ungrouped__"?null:groupFilter}),
    ...(windowOffset === undefined ? { anchorSceneId: routeWindowAnchorSceneId } : { offset: windowOffset })
  }), [query,chapterFilter,kindFilter,groupFilter,routeIndex, routeWindowAnchorSceneId, windowOffset]);
  const visibleNodes = routeWindow.nodes;
  const selectedOutgoingEdges = selected === undefined ? [] : graph.edges.filter((edge)=>edge.sourceSceneId===selected.id);
  const repairEdge = selectedOutgoingEdges.find((edge)=>edge.id===repairEdgeId) ?? selectedOutgoingEdges[0];
  const saveTitle = () => {
    if (selected === undefined) return;
    const result = onRenameScene(selected.id, title);
    if (!result.ok) {
      setEditResult({ tone: "error", text: `${result.error.code} · ${result.error.message}` });
      return;
    }
    setEditResult({ tone: "success", text: `Project Service 已提交 · ${result.changeSet.beforeHash.slice(0, 8)}→${result.changeSet.afterHash.slice(0, 8)}` });
  };
  const saveLayout = () => {
    if (selected === undefined) return;
    const result = onSetScenePosition(selected.id, layoutX, layoutY);
    if (!result.ok) { setEditResult({ tone: "error", text: `${result.error.code} · ${result.error.message}` });return; }
    setEditResult({ tone: "success", text: "布局 Sidecar 已提交 · 脚本与 Compiler 图未修改" });
  };
  const resetLayout = () => {
    if (selected === undefined) return;
    const result = onResetSceneLayout(selected.id);
    if (!result.ok) { setEditResult({ tone: "error", text: `${result.error.code} · ${result.error.message}` });return; }
    setEditResult({ tone: "success", text: "已重建自动布局 · 脚本与 Compiler 图未修改" });
  };
  const commitMutation=(result:RouteProjectMutationResult,success:string)=>{if(!result.ok){setEditResult({tone:"error",text:`${result.error.code} · ${result.error.message}`});return false;}setEditResult({tone:"success",text:success});return true;};
  const createGroup=()=>{if(commitMutation(onUpsertGroup(newGroupId,newGroupTitle),"路线分组已写入 Layout Sidecar")){setNewGroupId("");setNewGroupTitle("");}};
  const assignGroup=()=>{if(selected!==undefined)commitMutation(onAssignGroup(selected.id,selectedGroupId===""?undefined:selectedGroupId),"节点分组已提交 · 剧情语义未修改");};
  const saveViewport=()=>commitMutation(onSetViewport(viewportX,viewportY,viewportZoom),"路线视口已写入 Layout Sidecar");
  const moveNode=(node:RouteSceneNodeV1,dx:number,dy:number)=>commitMutation(onSetScenePosition(node.id,node.layout.x+dx,node.layout.y+dy),"节点位置已提交 · 支持撤销与重开");
  const nudgeNode=(node:RouteSceneNodeV1,direction:RouteNodeNudgeDirection)=>{const delta=routeNodeNudge(direction);moveNode(node,delta.dx,delta.dy);};
  const nudgeSelected=(direction:RouteNodeNudgeDirection)=>{if(selected!==undefined)nudgeNode(selected,direction);};
  const applyChoiceTarget=(sourceSceneId:string,optionId:string,currentTargetSceneId:string)=>{
    const targetSceneId=repairTargets[optionId]??currentTargetSceneId;
    if(session.activeSceneId!==sourceSceneId){setEditResult({tone:"error",text:"路线修复失败关闭 · 请先重新选中来源场景，避免写入错误 Source revision"});return;}
    const result=planRouteChoiceRetarget(session.project,sourceSceneId,optionId,targetSceneId);
    if(!result.ok){setEditResult({tone:"error",text:`${result.code} · ${result.message}`});return;}
    setPendingRepair({sourceSceneId,optionId,previousTargetSceneId:result.plan.previousTargetSceneId,targetSceneId});
    dispatch({type:"p0-batch",commandId:createCommandId(),operations:[result.plan.operation],selectedStatementId:result.plan.choiceStatementId});
  };
  const focusRouteScene = (sceneId: string) => {
    if (!graph.nodes.some((node) => node.id === sceneId)) return;
    setEndingSceneId("");setEndingCandidateIndex(0);setEndingRouteStep(0);
    setQuery("");setChapterFilter("");setKindFilter("");setGroupFilter("");setWindowOffset(undefined);
    setSelectedSceneId(sceneId);setEditResult(null);
    dispatch({ type: "select-scene", sceneId });
  };
  const focusEndingRouteStep = (step: number) => {
    if (endingCandidate === undefined) return;
    const nextStep = Math.max(0, Math.min(endingCandidate.sceneIds.length - 1, step));
    const sceneId = endingCandidate.sceneIds[nextStep];
    if (sceneId === undefined) return;
    setEndingRouteStep(nextStep);
    setWindowOffset(undefined);
    setSelectedSceneId(sceneId);
    setEditResult(null);
    dispatch({ type: "select-scene", sceneId });
  };
  const selectEnding = (sceneId: string) => {
    setEndingSceneId(sceneId);
    setEndingCandidateIndex(0);
    setQuery("");setChapterFilter("");setKindFilter("");setGroupFilter("");setWindowOffset(undefined);
    if (sceneId === "") return;
    const review = reviewRouteToEnding(graph, sceneId);
    const candidate = review.candidates[0];
    const step = Math.max(0, (candidate?.sceneIds.length ?? 1) - 1);
    setEndingRouteStep(step);
    const focusSceneId = candidate?.sceneIds[step] ?? sceneId;
    setSelectedSceneId(focusSceneId);
    dispatch({ type: "select-scene", sceneId: focusSceneId });
  };
  const selectEndingCandidate = (index: number) => {
    const candidate = endingRouteReview?.candidates[index];
    if (candidate === undefined) return;
    setEndingCandidateIndex(index);
    setEndingRouteStep(candidate.sceneIds.length - 1);
    setWindowOffset(undefined);
    const sceneId = candidate.sceneIds.at(-1)!;
    setSelectedSceneId(sceneId);
    dispatch({ type: "select-scene", sceneId });
  };
  return (
    <section className="flow-panel view-enter" aria-labelledby="flow-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">N40 · CANONICAL ROUTE GRAPH</p>
          <h2 id="flow-heading">Route Map</h2>
        </div>
        <span className="context-chip context-chip--cyan">Compiler 图事实</span>
      </div>
      <div className="route-toolbar">
        <div className="route-compiler-cache" role="status" aria-label="Route Compiler 缓存状态">{compilerStatus}</div>
        <label><span>搜索路线图</span><input type="search" aria-label="搜索路线图" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="场景、稳定 ID、标签或结局" /></label>
        <div className="route-filter-controls" aria-label="路线 P0 过滤器">
          <label><span>章节</span><select aria-label="路线章节过滤" value={chapterFilter} onChange={(event)=>setChapterFilter(event.target.value)}><option value="">全部章节</option>{graph.chapters.map((chapter)=><option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
          <label><span>节点类型</span><select aria-label="路线节点类型过滤" value={kindFilter} onChange={(event)=>setKindFilter(event.target.value as ""|RouteNodeKind)}><option value="">全部类型</option><option value="entry">入口</option><option value="scene">普通场景</option><option value="ending">结局</option></select></label>
          <label><span>视觉分组</span><select aria-label="路线分组过滤" value={groupFilter} onChange={(event)=>setGroupFilter(event.target.value)}><option value="">全部分组</option><option value="__ungrouped__">未分组</option>{graph.groups.map((group)=><option key={group.groupId} value={group.groupId}>{group.title}</option>)}</select></label>
          <button type="button" disabled={chapterFilter===""&&kindFilter===""&&groupFilter===""} onClick={()=>{setChapterFilter("");setKindFilter("");setGroupFilter("");}}>清除路线过滤</button>
        </div>
        <div className="route-summary" aria-label="路线图统计"><span>{graph.nodes.length} 场景</span><span>{graph.edges.length} 连接</span><span>{graph.diagnostics.length} 诊断</span></div>
      </div>
      <div className="route-layout-toolbar" aria-label="路线布局工具">
        <div className="route-group-create"><label><span>分组 ID</span><input aria-label="新路线分组 ID" value={newGroupId} onChange={(event)=>setNewGroupId(event.target.value)} placeholder="group_route" /></label><label><span>分组名称</span><input aria-label="新路线分组名称" value={newGroupTitle} onChange={(event)=>setNewGroupTitle(event.target.value)} placeholder="路线名称" /></label><button type="button" onClick={createGroup}>创建路线分组</button></div>
        <div className="route-groups" aria-label="路线分组列表">{graph.groups.map((group)=><span className="route-group-chip" key={group.groupId}><button type="button" aria-label={`${group.collapsed?"展开":"折叠"}分组：${group.title}`} aria-pressed={group.collapsed} onClick={()=>commitMutation(onToggleGroup(group.groupId),group.collapsed?"路线分组已展开":"路线分组已折叠")}>{group.collapsed?"＋":"−"} {group.title} · {graph.nodes.filter((node)=>node.layout.groupId===group.groupId).length}</button><button type="button" aria-label={`删除分组：${group.title}`} onClick={()=>commitMutation(onDeleteGroup(group.groupId),"路线分组已删除 · 节点已解除视觉分组")}>×</button></span>)}{graph.groups.length===0&&<span>尚无自定义分组</span>}</div>
        <div className="route-viewport-controls"><label><span>视口 X</span><input type="number" aria-label="路线视口 X" value={viewportX} onChange={(event)=>setViewportX(event.currentTarget.valueAsNumber)} /></label><label><span>视口 Y</span><input type="number" aria-label="路线视口 Y" value={viewportY} onChange={(event)=>setViewportY(event.currentTarget.valueAsNumber)} /></label><label><span>缩放</span><input type="number" min="0.5" max="2" step="0.25" aria-label="路线视口缩放" value={viewportZoom} onChange={(event)=>setViewportZoom(event.currentTarget.valueAsNumber)} /></label><button type="button" onClick={saveViewport}>保存路线视口</button></div>
      </div>
      <section className="route-ending-review" aria-label="指定结局路线审阅">
        <div>
          <p className="eyebrow">ENDING ROUTE REVIEW</p>
          <label><span>目标结局</span><select aria-label="审阅结局路线" value={endingSceneId} onChange={(event)=>selectEnding(event.target.value)}><option value="">选择一个结局</option>{endingNodes.map((node)=><option key={node.id} value={node.id}>{node.title} · {node.id}</option>)}</select></label>
        </div>
        {endingRouteReview !== null && <>
          <div className={`route-ending-review__status route-ending-review__status--${endingRouteReview.status}`} role="status" aria-label="结局路线审阅状态">
            {endingRouteReview.status === "found"
              ? `已找到 ${endingRouteReview.candidates.length} 条候选路线${endingRouteReview.truncated ? "（已达安全上限）" : ""} · 忽略 ${endingRouteReview.ignoredDanglingEdgeCount} 条悬空连接`
              : endingRouteReview.status === "unreachable" ? "目标结局从项目入口不可达" : "目标不是有效结局场景"}
          </div>
          {endingCandidate !== undefined && <div className="route-ending-review__controls">
            <label><span>候选路线</span><select aria-label="结局候选路线" value={endingCandidateIndex} onChange={(event)=>selectEndingCandidate(Number(event.target.value))}>{endingRouteReview.candidates.map((candidate,index)=><option key={candidate.candidateId} value={index}>路线 {index+1} · {candidate.sceneIds.length} 场景</option>)}</select></label>
            <button type="button" aria-label="上一个审阅路线节点" disabled={endingRouteStep<=0} onClick={()=>focusEndingRouteStep(endingRouteStep-1)}>← 上一步</button>
            <span role="status" aria-label="结局路线步骤">{endingRouteStep+1} / {endingCandidate.sceneIds.length}</span>
            <button type="button" aria-label="下一个审阅路线节点" disabled={endingRouteStep>=endingCandidate.sceneIds.length-1} onClick={()=>focusEndingRouteStep(endingRouteStep+1)}>下一步 →</button>
          </div>}
        </>}
      </section>
      <div className="route-window-controls" aria-label="路线局部窗口">
        <button type="button" aria-label="上一段路线场景" disabled={!routeWindow.hasPrevious} onClick={() => setWindowOffset(Math.max(0, routeWindow.start - ROUTE_GRAPH_WINDOW_LIMIT))}>← 上一段</button>
        <span role="status" aria-label="路线窗口范围">{routeWindow.totalMatches === 0 ? "0 / 0" : `${routeWindow.start + 1}–${routeWindow.end} / ${routeWindow.totalMatches}`}</span>
        <button type="button" aria-label="下一段路线场景" disabled={!routeWindow.hasNext} onClick={() => setWindowOffset(routeWindow.end)}>下一段 →</button>
        <small>最多挂载 {ROUTE_GRAPH_WINDOW_LIMIT} 个节点 · 当前相关连接 {routeWindow.edges.length}/{routeWindow.totalLocalEdges}</small>
      </div>
      <div className={runtimeRouteTrace.active ? "route-runtime-trace is-active" : "route-runtime-trace"} role="status" aria-label="运行路线高亮">
        {runtimeRouteTrace.active
          ? <>Runtime History · 当前：<strong>{runtimeCurrentTitle ?? "未知场景"}</strong> · 已访问 {runtimeVisitedScenes.size} 场景 · 已走连接 {runtimeVisitedEdges.size}</>
          : "Runtime 未运行 · 启动试玩后将在此投影当前、已访问和已走连接"}
      </div>
      <div className="flow-canvas">
        <div className="flow-grid" aria-label="路线场景节点" onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault();const sceneId=event.dataTransfer.getData("text/plain"),rect=event.currentTarget.getBoundingClientRect();if(sceneId!=="")commitMutation(onSetScenePosition(sceneId,(event.clientX-rect.left+graph.viewport.x)/graph.viewport.zoom,(event.clientY-rect.top+graph.viewport.y)/graph.viewport.zoom),"拖拽位置已写入 Layout Sidecar");}}>
          <div className="flow-grid__surface" aria-label="路线画布表面" style={{transform:`translate(-${graph.viewport.x}px, -${graph.viewport.y}px) scale(${graph.viewport.zoom})`} as CSSProperties}>
          {visibleNodes.map((node, index) => {
            const runtimeCurrent = runtimeRouteTrace.active && node.id === runtimeRouteTrace.currentSceneId;
            const runtimeVisited = runtimeRouteTrace.active && runtimeVisitedScenes.has(node.id);
            const routeReviewed = reviewedSceneIds.has(node.id);
            const className = [
              `route-node route-node--${node.kind}`,
              node.id === session.activeSceneId ? "is-active" : "",
              routeReviewed ? "is-route-reviewed" : "",
              runtimeVisited ? "is-runtime-visited" : "",
              runtimeCurrent ? "is-runtime-current" : ""
            ].filter(Boolean).join(" ");
            return (
            <button
              key={node.id}
              className={className}
              style={{ "--node-order": index, "--route-x": `${node.layout.x}px`, "--route-y": `${node.layout.y}px` } as CSSProperties}
              aria-label={`路线场景：${node.title} · ${node.id}`}
              aria-pressed={node.id === selectedSceneId}
              aria-current={runtimeCurrent ? "step" : undefined}
              aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
              data-runtime-visited={runtimeVisited}
              data-route-reviewed={routeReviewed}
              data-route-group={node.layout.groupId}
              draggable
              onDragStart={(event)=>{event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",node.id);}}
              onKeyDown={(event)=>{if(!event.altKey)return;if(event.key==="ArrowLeft"){event.preventDefault();nudgeNode(node,"left");}else if(event.key==="ArrowRight"){event.preventDefault();nudgeNode(node,"right");}else if(event.key==="ArrowUp"){event.preventDefault();nudgeNode(node,"up");}else if(event.key==="ArrowDown"){event.preventDefault();nudgeNode(node,"down");}}}
              onClick={() => focusRouteScene(node.id)}
              onDoubleClick={() => onOpenSequence(node.id)}
            >
              <span className="route-node__kind">
                {node.kind === "entry" ? "入口" : node.kind === "ending" ? "结局" : "场景"}
              </span>
              <strong>{node.title}</strong>
              <code>{node.id}</code>
              <span className="route-node__chapter">{graph.chapters.find((chapter) => chapter.id === node.chapterId)?.title ?? "未分组"}</span>
              <span className="route-node__facts">{node.facts.length === 0 ? "无控制流事实" : node.facts.map((item) => `${item.kind}:${item.label}${item.targetLabel === undefined ? "" : `→${item.targetLabel}`}`).join(" · ")}</span>
              {runtimeCurrent ? <span className="route-node__runtime-state">当前运行</span> : runtimeVisited ? <span className="route-node__runtime-state">已访问</span> : null}
              {routeReviewed && <span className="route-node__review-state">结局路线</span>}
            </button>
            );
          })}
          {visibleNodes.length === 0 && <p className="route-empty">没有匹配的路线场景；权威工程未被修改。</p>}
          </div>
        </div>
        <div className="edge-list" aria-label="路线连接">
          <p className="eyebrow">CONNECTIONS</p>
          {routeWindow.edges.map((edge) => {
            const runtimeVisited = runtimeRouteTrace.active && runtimeVisitedEdges.has(edge.id);
            const routeReviewed = reviewedEdgeIds.has(edge.id);
            return (
            <div className={["edge-row",runtimeVisited?"is-runtime-visited":"",routeReviewed?"is-route-reviewed":""].filter(Boolean).join(" ")} key={edge.id} data-testid={`route-edge-${edge.id}`} data-runtime-visited={runtimeVisited} data-route-reviewed={routeReviewed}>
              <span>{edge.sourceSceneId}</span><span className="edge-arrow">→</span>
              <strong>{edge.label}</strong><span className="edge-arrow">→</span>
              {edge.status === "valid"
                ? <button type="button" className="edge-row__target" aria-label={`定位路线目标：${edge.label} · ${edge.targetSceneId}`} onClick={()=>focusRouteScene(edge.targetSceneId)}>{edge.targetSceneId}</button>
                : <span>{edge.targetSceneId}</span>}{edge.status === "dangling" && <em>悬空</em>}{runtimeVisited && <em className="edge-row__runtime-state">已走过</em>}{routeReviewed && <em className="edge-row__review-state">结局路线</em>}
            </div>
            );
          })}
          {routeWindow.edgesTruncated && <p className="route-empty">当前相关连接超过局部上限；请缩小搜索或切换窗口。</p>}
        </div>
      </div>
      {selected !== undefined && <aside className="route-inspector" aria-label="路线场景 Inspector">
        <div><p className="eyebrow">STABLE SCENE</p><strong>{selected.title}</strong><code>{selected.id}</code></div>
        <label><span>路线场景名称</span><input aria-label="路线场景名称" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>节点 X</span><input type="number" aria-label="路线节点 X" value={layoutX} onChange={(event) => setLayoutX(event.currentTarget.valueAsNumber)} /></label>
        <label><span>节点 Y</span><input type="number" aria-label="路线节点 Y" value={layoutY} onChange={(event) => setLayoutY(event.currentTarget.valueAsNumber)} /></label>
        <label><span>所属分组</span><select aria-label="节点所属分组" value={selectedGroupId} onChange={(event)=>setSelectedGroupId(event.target.value)}><option value="">不分组</option>{graph.groups.map((group)=><option key={group.groupId} value={group.groupId}>{group.title}</option>)}</select></label>
        <div className="route-target-navigation" aria-label="控制流目标导航">
          <span>控制流目标</span>
          {selected.facts.filter((fact)=>fact.targetLabel!==undefined).map((fact)=>{const target=selected.facts.find((candidate)=>candidate.kind==="label"&&candidate.label===fact.targetLabel);return <button type="button" key={fact.id} disabled={target===undefined} aria-label={`打开标签目标：${fact.targetLabel}`} onClick={()=>{if(target!==undefined)onOpenSequence(selected.id,target.id);}}>{fact.kind} → {fact.targetLabel}{target===undefined?" · 缺失":""}</button>;})}
          {selectedOutgoingEdges.map((edge)=><button type="button" key={edge.id} disabled={edge.status!=="valid"} aria-label={`定位场景目标：${edge.label} · ${edge.targetSceneId}`} onClick={()=>focusRouteScene(edge.targetSceneId)}>{edge.label} → {edge.targetSceneId}{edge.status==="dangling"?" · 悬空":""}</button>)}
          {repairEdge!==undefined&&<button type="button" className="route-target-repair-toggle" aria-expanded={repairEditorOpen} aria-controls={`route-target-repair-${selected.id}`} onClick={()=>setRepairEditorOpen((open)=>!open)}>{repairEditorOpen?"收起 Choice 目标修复":"修改 Choice 目标"}</button>}
          {repairEdge!==undefined&&repairEditorOpen&&<div id={`route-target-repair-${selected.id}`} className="route-target-repair" aria-label="路线 Choice 目标修复"><label><span>选择连接</span><select aria-label="选择待修复路线连接" value={repairEdge.id} onChange={(event)=>setRepairEdgeId(event.target.value)}>{selectedOutgoingEdges.map((edge)=><option key={edge.id} value={edge.id}>{edge.label} · {edge.id}</option>)}</select></label><label><span>目标稳定 ID</span><input aria-label={`修改选择目标：${repairEdge.label}`} list={`route-repair-targets-${selected.id}`} value={repairTargets[repairEdge.id]??repairEdge.targetSceneId} onChange={(event)=>setRepairTargets((current)=>({...current,[repairEdge.id]:event.target.value}))}/><datalist id={`route-repair-targets-${selected.id}`}>{visibleNodes.map((node)=><option key={node.id} value={node.id}>{node.title}</option>)}</datalist></label><button type="button" aria-label={`应用选择目标：${repairEdge.label}`} disabled={(repairTargets[repairEdge.id]??repairEdge.targetSceneId)===repairEdge.targetSceneId||pendingRepair!==null} onClick={()=>applyChoiceTarget(repairEdge.sourceSceneId,repairEdge.id,repairEdge.targetSceneId)}>应用目标</button><small>候选仅显示当前 64 节点窗口；提交时按完整工程验证 stable ID。</small></div>}
          {selected.facts.every((fact)=>fact.targetLabel===undefined)&&graph.edges.every((edge)=>edge.sourceSceneId!==selected.id)&&<small>当前场景没有可导航目标</small>}
        </div>
        <div className="route-nudge" aria-label="节点键盘与触控移动"><button type="button" aria-label="节点左移 24" onClick={()=>nudgeSelected("left")}>←</button><button type="button" aria-label="节点上移 24" onClick={()=>nudgeSelected("up")}>↑</button><button type="button" aria-label="节点下移 24" onClick={()=>nudgeSelected("down")}>↓</button><button type="button" aria-label="节点右移 24" onClick={()=>nudgeSelected("right")}>→</button><small>Alt＋方向键亦可移动</small></div>
        <div className="route-inspector__actions"><button type="button" onClick={saveTitle}>通过 Project Service 保存</button><button type="button" onClick={saveLayout}>保存节点布局</button><button type="button" onClick={assignGroup}>保存节点分组</button><button type="button" onClick={resetLayout}>重建自动布局</button><button type="button" onClick={() => onOpenSequence(selected.id)}>进入 Sequence</button></div>
        {editResult !== null && <p className={`route-edit-result route-edit-result--${editResult.tone}`} role={editResult.tone === "error" ? "alert" : "status"}>{editResult.text}</p>}
      </aside>}
      <section className="route-diagnostics" aria-label="Route Compiler 诊断">
        <p className="eyebrow">COMPILER DIAGNOSTICS · {graph.diagnostics.length}</p>
        {graph.diagnostics.length === 0 ? <p>正式 Compiler 未报告路线阻断。</p> : <ul>{graph.diagnostics.map((item, index) => {const location=locateRouteDiagnostic(graph,item);const statementExists=location.status==="located"&&location.statementId!==undefined&&session.project.scenes.find((scene)=>scene.id===location.sceneId)?.statements.some((statement)=>statement.id===location.statementId)===true;return <li key={`${item.code}:${item.sceneId ?? "project"}:${item.statementId ?? index}`}><div><code>{item.code}</code><span>{item.message}</span></div><div className="route-diagnostics__actions"><button type="button" disabled={location.status!=="located"} aria-label={`定位诊断：${item.code} · ${item.sceneId??"全局"}`} onClick={()=>{if(location.status==="located")focusRouteScene(location.sceneId!);}}>定位 Route</button>{statementExists&&<button type="button" aria-label={`进入诊断内容：${item.code} · ${item.statementId}`} onClick={()=>onOpenSequence(location.sceneId!,location.statementId)}>进入内容</button>}</div></li>;})}</ul>}
      </section>
    </section>
  );
}

interface PreviewPanelProps extends CommonProps {
  readonly createCommandId: () => string;
  readonly inputDirty: boolean;
  readonly assetIndex: AssetIndex;
  readonly assetRepository: IndexedDbAssetRepository | null;
  readonly canonicalProject: CanonicalProject;
  readonly onRouteTraceChange: (trace: RuntimeRouteTrace) => void;
}

function browserDevicePixelRatio(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio;
}

function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(browserDevicePixelRatio);
  useEffect(() => {
    const update = () => setRatio(browserDevicePixelRatio());
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return ratio;
}

function PreviewPanel({ session, dispatch, createCommandId, inputDirty, assetIndex, assetRepository, canonicalProject, onRouteTraceChange }: PreviewPanelProps) {
  const [viewportProfileId, setViewportProfileId] = useState<PreviewViewportProfileId>(
    DEFAULT_PREVIEW_VIEWPORT_ID
  );
  const [customViewport, setCustomViewport] = useState({ width: 1920, height: 1080 });
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [lastStagePoint, setLastStagePoint] = useState<StageDesignPoint | null>(null);
  const [stageDirectorMessage, setStageDirectorMessage] = useState<string | null>(null);
  const devicePixelRatio = useDevicePixelRatio();
  const settingsApplication = useMemo(() => createGalSettingsApplicationV1(canonicalProject.settings, "web"), [canonicalProject.settings]);
  const [transport, transportDispatch] = useReducer(
    reducePreviewTransport,
    undefined,
    createPreviewTransportState
  );
  const [playable, setPlayable] = useState<FormalPreviewState>(createIdleFormalPreviewState);
  const [runtimeDetailsOpen, setRuntimeDetailsOpen] = useState(false);
  const [hotUpdate, setHotUpdate] = useState<Exclude<FormalPreviewHotUpdateResult, { readonly kind: "unchanged" }> | null>(null);
  const [webBuild, setWebBuild] = useState<(PlayableWebArtifact & { readonly href: string; readonly dispose: () => void }) | null>(null);
  const [webBuildError, setWebBuildError] = useState<string | null>(null);
  const playableActive = playable.status !== "idle";
  const previewObservation = observeFormalPreview(playable);
  useEffect(() => {
    if (playableActive) setRuntimeDetailsOpen(true);
  }, [playableActive]);
  useEffect(() => {
    onRouteTraceChange(playableActive ? {
      active: true,
      currentSceneId: playable.sceneId,
      currentStatementId: previewObservation.current?.statementId ?? null,
      visitedSceneIds: playable.visitedSceneIds,
      visitedEdgeIds: playable.visitedRouteEdgeIds
    } : IDLE_RUNTIME_ROUTE_TRACE);
  }, [onRouteTraceChange, playable.sceneId, playable.visitedRouteEdgeIds, playable.visitedSceneIds, playableActive, previewObservation.current?.statementId]);
  const selectedPreset = findPreviewViewportPreset(viewportProfileId);
  const viewport = viewportProfileId === "custom" ? {
    id: "custom" as const,
    label: "自定义尺寸",
    ratioLabel: formatPreviewRatio(customViewport.width, customViewport.height),
    width: customViewport.width,
    height: customViewport.height,
    orientation: customViewport.width >= customViewport.height ? "landscape" as const : "portrait" as const
  } : selectedPreset;
  const stageSurface = createStageSurfaceMetrics(
    viewport.width,
    viewport.height,
    Math.min(devicePixelRatio, settingsApplication.display.maximumDevicePixelRatio)
  );
  const previewSceneId = playableActive && playable.sceneId !== null ? playable.sceneId : session.activeSceneId;
  const previewIndex = playableActive ? playable.statementIndex : session.previewIndex;
  const scene = findScene(session.project, previewSceneId);
  const statement = scene.statements[previewIndex];
  if (statement === undefined) throw new Error(`Preview index is outside scene: ${previewIndex}`);
  const sourceSession = activeSourceSession(session);
  const pendingDraft = hasPendingDraft(session);
  const showBufferedNotice = inputDirty && session.notice.tone !== "error";
  const transportBlocked = pendingDraft || inputDirty || playableActive;
  const transportBarrier = previewTransportBarrier(
    statement,
    previewIndex,
    scene.statements.length,
    transportBlocked
  );
  const speedProfile = findPreviewSpeedProfile(transport.speedId);
  const previousTransportSceneId = useRef(session.activeSceneId);
  const stageTimeline = useMemo(
    () => compilePreviewStageTimeline(scene.statements, settingsApplication.ui.defaultTextboxTemplate),
    [scene.statements, settingsApplication.ui.defaultTextboxTemplate]
  );
  const hostCommitPending = previewObservation.pendingEffect !== null || previewObservation.pendingBarrier !== null;
  const committedPreviewIndex = playableActive && hostCommitPending ? previewIndex - 1 : previewIndex;
  const stagePlan = committedPreviewIndex < 0
    ? derivePreviewStagePlan([], 0, settingsApplication.ui.defaultTextboxTemplate)
    : stageTimeline[committedPreviewIndex] ?? derivePreviewStagePlan([], 0, settingsApplication.ui.defaultTextboxTemplate);
  const dialoguePresentation = deriveDialoguePresentation(scene.statements, committedPreviewIndex, stagePlan.dialogueTemplate);
  const dialogueText = dialoguePresentation.lines.map((line) => line.text).join("\n");
  const dialogueRevealDuration = dialogueText === "" ? 0 : galTextRevealDurationMillisecondsV1(settingsApplication, dialogueText);
  const voiceScheduled = stagePlan.audio.some((layer) => layer.bus === "voice" && layer.playback === "playing");
  const urlFactory = useMemo<PreviewUrlFactory>(browserPreviewUrlFactory, []);
  const [mediaView, mediaViewDispatch] = useReducer(
    reducePreviewMediaHost,
    stagePlan.resourceKey,
    createPreviewMediaHostState
  );
  const mediaGenerationRef = useRef(0);

  useEffect(() => {
    if (!playableActive) return;
    const result = updateFormalPreviewProject(canonicalProject, playable);
    if (result.kind === "unchanged") return;
    if (result.kind === "applied") setPlayable(result.state);
    setHotUpdate(result);
  }, [canonicalProject, playableActive]);

  useEffect(() => {
    const { designWidth: width, designHeight: height } = settingsApplication.display;
    const selected = findPreviewViewportPreset(viewportProfileId);
    if (viewportProfileId !== "custom" && selected.width === width && selected.height === height) return;
    setCustomViewport({ width, height });
    setViewportProfileId("custom");
  }, [settingsApplication.display.designHeight, settingsApplication.display.designWidth]);

  useEffect(() => () => webBuild?.dispose(), [webBuild]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = mediaGenerationRef.current + 1;
    mediaGenerationRef.current = generation;
    let owned: LoadedPreviewMedia | undefined;
    const requiresRepository = stagePlan.background !== undefined || stagePlan.characters.length > 0 || stagePlan.audio.length > 0;
    mediaViewDispatch({ type: "begin", generation, planKey: stagePlan.resourceKey });
    if (assetRepository === null && requiresRepository) {
      mediaViewDispatch({
        type: "ready",
        generation,
        planKey: stagePlan.resourceKey,
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
        if (controller.signal.aborted || generation !== mediaGenerationRef.current) {
          releasePreviewMedia(media, urlFactory);
          return;
        }
        owned = media;
        mediaViewDispatch({ type: "ready", generation, planKey: stagePlan.resourceKey, media });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (controller.signal.aborted) return;
        mediaViewDispatch({
          type: "failed",
          generation,
          planKey: stagePlan.resourceKey,
          errors: [...stagePlan.diagnostics, error instanceof Error ? error.message : "Preview media load failed"]
        });
      });
    return () => {
      controller.abort();
      if (owned !== undefined) releasePreviewMedia(owned, urlFactory);
    };
  }, [assetIndex, assetRepository, stagePlan.resourceKey, urlFactory]);

  const loadedMedia = mediaView.status === "ready" && mediaView.planKey === stagePlan.resourceKey && mediaView.media.planKey === stagePlan.resourceKey
    ? mediaView.media
    : undefined;
  const reportRuntimeMediaError = (
    role: PreviewMediaRole,
    layer: { readonly statementId: string; readonly assetId: string }
  ) => mediaViewDispatch({
    type: "runtime-error",
    generation: mediaView.generation,
    planKey: stagePlan.resourceKey,
    error: { role, statementId: layer.statementId, assetId: layer.assetId, code: "decode-failed" }
  });
  const renderFrame = createPreviewRenderFrame(mediaView, stagePlan.resourceKey);
  const mediaErrorCount = previewMediaErrorCount(mediaView);
  const selectedStageStatement = scene.statements.find((candidate) => candidate.id === session.selectedStatementId);
  const placeOnStage = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, .stage-chrome") !== null) return;
    const point = mapClientPointToStage(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), viewport.width, viewport.height);
    if (point === null) {
      setStageDirectorMessage("画布坐标无效，未修改剧情");
      return;
    }
    setLastStagePoint(point);
    if (stagePlan.camera !== undefined && (stagePlan.camera.x !== 0 || stagePlan.camera.y !== 0 || stagePlan.camera.zoom !== 1 || stagePlan.camera.rotation !== 0)) {
      setStageDirectorMessage("镜头构图生效时角色点选定位已锁定；请先选择 Camera Reset，避免写入屏幕坐标而污染舞台坐标");
      return;
    }
    if (playableActive || pendingDraft || inputDirty || selectedStageStatement === undefined) {
      setStageDirectorMessage(playableActive ? "正式 Runtime 运行中，画布编辑已锁定" : "请先提交草稿并选择角色 Show/Move 演出");
      return;
    }
    const placement = createStagePlacementPatch(selectedStageStatement, point, viewport.width, viewport.height);
    if (!placement.ok) {
      setStageDirectorMessage(placement.message);
      return;
    }
    dispatch({
      type: "patch-direction",
      commandId: createCommandId(),
      statementId: placement.statementId,
      parameters: placement.parameters
    });
    setStageDirectorMessage(`${placement.slot} 已定位到 X ${placement.xPercent}% · Y ${placement.yPercent}%`);
  };

  useEffect(() => {
    if (previousTransportSceneId.current === session.activeSceneId) return;
    previousTransportSceneId.current = session.activeSceneId;
    transportDispatch({ type: "reset" });
  }, [session.activeSceneId]);

  useEffect(() => {
    if (!playableActive || playable.sceneId === null) return;
    if (session.activeSceneId !== playable.sceneId) {
      dispatch({ type: "select-scene", sceneId: playable.sceneId });
    }
  }, [dispatch, playable.sceneId, playableActive, session.activeSceneId]);

  useEffect(() => {
    if (!playableActive || transport.mode !== "playing") return;
    transportDispatch({ type: "pause", reason: "manual" });
  }, [playableActive, transport.mode]);

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
    if (playableActive) return;
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
    if (playableActive) return;
    transportDispatch({ type: "pause", reason: "manual-step" });
    dispatch({ type: "step-preview", direction });
  };

  const beginPlayablePreview = () => {
    transportDispatch({ type: "reset" });
    setHotUpdate(null);
    setPlayable(startFormalPreview(canonicalProject));
  };

  const beginPlayablePreviewFromScene = () => {
    transportDispatch({ type: "reset" });
    setHotUpdate(null);
    setPlayable(startFormalPreviewFromScene(canonicalProject, session.activeSceneId));
  };

  const beginPlayablePreviewFromStatement = () => {
    transportDispatch({ type: "reset" });
    setHotUpdate(null);
    setPlayable(startFormalPreviewFromStatement(canonicalProject, session.activeSceneId, session.selectedStatementId));
  };

  const restartPlayablePreview = () => {
    transportDispatch({ type: "reset" });
    setHotUpdate(null);
    setPlayable(startFormalPreview(canonicalProject, playable.startTarget ?? { kind: "entry" }));
  };

  const exitPlayablePreview = () => {
    setHotUpdate(null);
    setPlayable(createIdleFormalPreviewState());
  };

  const preparePlayableWeb = () => {
    webBuild?.dispose();
    setWebBuildError(null);
    try { setWebBuild(createPlayableWebDownload(session.project)); }
    catch (error) { setWebBuild(null); setWebBuildError(error instanceof Error ? error.message : String(error)); }
  };

  const playableStatus = playable.status === "waiting-choice"
    ? `请选择路线 · 已经过 ${playable.visitedSceneIds.length} 个场景`
    : playable.status === "waiting-effect"
      ? `等待 Effect Host · ${previewObservation.pendingEffect?.descriptorId ?? "未知 Effect"}`
      : playable.status === "waiting-barrier"
        ? `等待明确批准 · ${previewObservation.pendingBarrier?.descriptorId ?? "未知 Barrier"}`
    : playable.status === "ended"
      ? `流程完成：${playable.endingName ?? "未命名结局"}`
      : playable.status === "error"
        ? `流程中止：${playable.error ?? "未知错误"}`
        : playable.status === "paused"
          ? `已暂停 · ${scene.title} · ${playable.statementId ?? "光标位置"}`
          : `试玩中 · ${scene.title} · ${playable.visitedStatementIds.length} 个节点`;
  const reconciliationOperationCount = (previewObservation.reconciliation?.compensations.length ?? 0) + (previewObservation.reconciliation?.replayEffects.length ?? 0);
  const historyStatus = previewObservation.history?.transient
    ? "光标临时状态"
    : previewObservation.reconciliation === null
      ? "确定性 checkpoint"
      : reconciliationOperationCount === 0
        ? `${previewObservation.reconciliation.direction} · checkpoint 已恢复`
        : `${previewObservation.reconciliation.direction} · ${reconciliationOperationCount} 项 Host 协调`;

  const transportStatus = playableActive
    ? "完整流程试玩接管中"
    : transport.mode === "playing"
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
        <label className="preview-safe-toggle"><input type="checkbox" checked={showSafeArea} onChange={(event) => setShowSafeArea(event.target.checked)} />安全区</label>
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
      <div className="stage-director-strip" role="status" data-stage-director={playableActive ? "locked" : "ready"}>
        <strong>DIRECTOR · 画布定位</strong>
        <span>{stageDirectorMessage ?? "先选择角色 Show/Move 演出，再点击画布空白处写入稳定语义坐标"}</span>
      </div>
      <div className="stage-viewport">
        <div
          className={`stage-preview stage-preview--${viewport.orientation}`}
          data-testid="preview-stage"
          data-preview-profile={viewport.id}
          data-preview-width={viewport.width}
          data-preview-height={viewport.height}
          data-stage-surface="design-pixels"
          data-stage-dpr={stageSurface.effectiveDpr}
          data-stage-requested-dpr={stageSurface.requestedDpr}
          data-stage-pixel-width={stageSurface.pixelWidth}
          data-stage-pixel-height={stageSurface.pixelHeight}
          data-stage-resolution-limited={stageSurface.resolutionLimited}
          data-host-commit-pending={hostCommitPending}
          data-settings-platform="web"
          data-settings-application={settingsApplication.version}
          data-settings-quality={settingsApplication.display.quality}
          data-settings-safe-area={settingsApplication.display.safeArea}
          data-settings-orientation={settingsApplication.display.orientation}
          data-settings-text-cps={settingsApplication.text.charactersPerSecond}
          data-settings-text-minimum={settingsApplication.text.minimumDisplayMilliseconds}
          data-settings-text-punctuation={settingsApplication.text.punctuationDelayMilliseconds}
          data-settings-allow-hold={settingsApplication.advance.allowHold}
          data-settings-wait-for-voice={settingsApplication.advance.waitForVoice}
          data-settings-input-pointer={settingsApplication.input.pointer}
          data-settings-input-keyboard={settingsApplication.input.keyboard}
          data-settings-input-touch={settingsApplication.input.touch}
          data-settings-input-gamepad={settingsApplication.input.gamepad}
          data-settings-high-contrast={settingsApplication.accessibility.highContrast}
          data-settings-reduce-motion={settingsApplication.accessibility.reduceMotion}
          data-settings-reduce-flashing={settingsApplication.accessibility.reduceFlashing}
          data-settings-audio-master={settingsApplication.resolved.values.audio.master}
          data-settings-audio-bgm={settingsApplication.resolved.values.audio.bgm}
          data-settings-audio-voice={settingsApplication.resolved.values.audio.voice}
          data-settings-audio-sfx={settingsApplication.resolved.values.audio.sfx}
          data-settings-audio-ambient={settingsApplication.resolved.values.audio.ambient}
          data-settings-audio-ui={settingsApplication.resolved.values.audio.ui}
          data-settings-audio-voice-ducking={settingsApplication.resolved.values.audio.voiceDucking}
          data-settings-stage-duration={settingsApplication.stage.defaultDurationMilliseconds}
          data-settings-stage-easing={settingsApplication.stage.defaultEasing}
          data-settings-choice-layout={settingsApplication.choice.layout}
          data-settings-choice-numbers={settingsApplication.choice.showOptionNumbers}
          data-settings-textbox-default={settingsApplication.ui.defaultTextboxTemplate}
          data-settings-input-hints={settingsApplication.ui.showInputHints}
          data-settings-audio-resume={settingsApplication.audio.resumeAfterInterruption}
          data-text-reveal-duration={dialogueRevealDuration}
          onPointerDown={placeOnStage}
          style={{
            "--preview-aspect": `${viewport.width} / ${viewport.height}`,
            "--gal-font-scale": settingsApplication.text.fontScale,
            "--gal-message-opacity": settingsApplication.text.messageWindowOpacity,
            "--gal-line-height": settingsApplication.text.lineHeight,
            "--gal-letter-spacing": `${settingsApplication.text.letterSpacingEm}em`,
            "--gal-text-reveal-duration": `${dialogueRevealDuration}ms`
          } as CSSProperties}
        >
          <div className="stage-chrome">
            <span>{scene.title}</span>
            <span className="stage-chrome__metrics">
              <span>{viewport.ratioLabel} · Balanced</span>
              <small>
                DPR {stageSurface.effectiveDpr.toFixed(2)}
                {lastStagePoint === null ? "" : ` · ${Math.round(lastStagePoint.x)},${Math.round(lastStagePoint.y)}`}
              </small>
            </span>
          </div>
          {showSafeArea && settingsApplication.display.safeArea === "system" && <div className="stage-safe-area" data-testid="preview-safe-area" aria-hidden="true" />}
          <PreviewCanvasHost
            frame={renderFrame}
            designWidth={viewport.width}
            designHeight={viewport.height}
            pixelWidth={stageSurface.pixelWidth}
            pixelHeight={stageSurface.pixelHeight}
            selectedStatementId={session.selectedStatementId}
            onSelect={(statementId) => dispatch({ type: "select-statement", statementId })}
            onStagePoint={setLastStagePoint}
            onRuntimeError={reportRuntimeMediaError}
            defaultDurationMilliseconds={settingsApplication.stage.defaultDurationMilliseconds}
            defaultEasing={settingsApplication.stage.defaultEasing}
          />
          <div className="stage-audio-stack" aria-live="polite">
            {loadedMedia?.audio.map((layer) => {
              const playback = stagePlan.audio.find((candidate) => candidate.bus === layer.bus)?.playback ?? layer.playback;
              return <PreviewAudioLayer
                key={`${layer.bus}:${layer.statementId}:${layer.url}`}
                layer={{ ...layer, playback }}
                appliedVolume={galAudioGainV1(
                  settingsApplication,
                  (["bgm", "voice", "sfx", "ambient", "ui"].includes(layer.bus) ? layer.bus : "sfx") as GalAudioBusV1,
                  layer.volume,
                  voiceScheduled
                )}
                onDecodeError={() => reportRuntimeMediaError("audio", layer)}
              />;
            })}
          </div>
          {mediaView.status === "loading" && <div className="stage-media-loading" role="status">正在验证预览资源…</div>}
          {loadedMedia !== undefined && mediaErrorCount > 0 && (
            <div className="stage-media-errors" role="status" data-runtime-errors={mediaView.runtimeErrors.length}>
              <strong>安全占位</strong><span>{mediaErrorCount} 项资源未执行</span>
            </div>
          )}
          <div className="stage-content" key={statement.id} data-testid="preview-step">
            {(statement.kind === "dialogue" || statement.kind === "narration") && <div key={`${statement.id}:${dialogueRevealDuration}`} className={`dialogue-presentation dialogue-presentation--${dialoguePresentation.template}`} data-dialogue-template={dialoguePresentation.template}>
              {dialoguePresentation.lines.map((item) => {
                const character = item.speakerId === undefined ? undefined : findCharacter(session.project.characters, item.speakerId);
                return <div className="dialogue-presentation__line" key={item.statementId}>
                  <span className="speaker-name" style={{ "--speaker-color": character?.color ?? "#8B7CFF" } as CSSProperties}>{character?.displayName ?? (item.speakerId === undefined ? "旁白" : "未知角色")}</span>
                  <p>{item.text}</p>
                </div>;
              })}
            </div>}
            {statement.kind === "direction" && <div className="stage-note"><span>演出指令</span><strong>{statement.summary}</strong></div>}
            {statement.kind === "wait" && <div className="stage-note"><span>等待</span><strong>{statement.duration} ms</strong></div>}
            {statement.kind === "choice" && (
              <div className="choice-preview" data-choice-layout={settingsApplication.choice.layout}>
                <strong>{statement.prompt}</strong>
                {statement.options.map((option, optionIndex) => playable.status === "waiting-choice"
                  ? <button key={option.id} type="button" onClick={() => setPlayable(selectFormalPreviewChoice(playable, option.id))} aria-label={`选择路线：${option.label}`}>{settingsApplication.choice.showOptionNumbers && <b data-choice-number aria-hidden="true">{optionIndex + 1}</b>}{option.label}</button>
                  : <span key={option.id}>{settingsApplication.choice.showOptionNumbers && <b data-choice-number aria-hidden="true">{optionIndex + 1}</b>}{option.label}</span>)}
              </div>
            )}
            {statement.kind === "end" && <div className="ending-preview"><span>ENDING</span><strong>{statement.endingName}</strong></div>}
          </div>
        </div>
      </div>
      <div className="preview-control-dock" aria-label="预览核心控制">
        <div className="preview-transport">
          <button aria-label="上一步" onClick={() => stepPreview(-1)} disabled={playableActive || previewIndex === 0}>←</button>
          <div><strong>{previewIndex + 1} / {scene.statements.length}</strong><small>{statementKindLabel(statement)} · {statement.id}</small></div>
          <button aria-label="下一步" onClick={() => stepPreview(1)} disabled={playableActive || previewIndex === scene.statements.length - 1}>→</button>
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
      </div>
      <div className={`playable-preview playable-preview--${playable.status}`} aria-label="完整流程试玩">
        <div>
          <strong>正式 Runtime 试玩</strong>
          <small>{playableActive ? playableStatus : "Project Compiler → Runtime · 从入口执行到结局"}</small>
        </div>
        {!playableActive && (
          <button type="button" onClick={beginPlayablePreview} disabled={pendingDraft || inputDirty}>试玩完整流程</button>
        )}
        {(playable.status === "ended" || playable.status === "error") && (
          <button type="button" onClick={restartPlayablePreview}>重新试玩</button>
        )}
        {playableActive && <button type="button" className="playable-preview__secondary" onClick={exitPlayablePreview}>退出试玩</button>}
      </div>
      {playableActive && playable.status !== "error" && (
        <div className="runtime-debug-actions" aria-label="Runtime 调试控制" role="group">
          <div className="runtime-debug-actions__history">
            <strong>History {previewObservation.history?.cursor ?? 0}/{previewObservation.history?.length ?? 0}</strong>
            <small>{historyStatus}</small>
          </div>
          <button type="button" onClick={() => setPlayable(backFormalPreview(playable))} disabled={!previewObservation.history?.canBack} aria-label="Runtime 后退一步">← Back</button>
          <button type="button" onClick={() => setPlayable(forwardFormalPreview(playable))} disabled={!previewObservation.history?.canForward} aria-label="Runtime 前进一步">Forward →</button>
          <button type="button" onClick={() => setPlayable(advanceFormalPreview(playable))} disabled={playable.status !== "presenting" && playable.status !== "paused"}>Continue</button>
          <button type="button" onClick={() => setPlayable(stepOverFormalPreview(playable))} disabled={playable.status !== "presenting" && playable.status !== "paused"}>Step Over</button>
          <button type="button" onClick={() => setPlayable(runFormalPreviewToStatement(playable, session.activeSceneId, session.selectedStatementId))} disabled={pendingDraft || inputDirty}>Run to Cursor</button>
        </div>
      )}
      {playableActive && (previewObservation.pendingEffect !== null || previewObservation.pendingBarrier !== null || previewObservation.effectHost.operationCount > 0) && (
        <section className="runtime-effect-host" aria-label="Runtime Effect Host">
          <header>
            <div><span aria-hidden="true">◆</span><strong>Effect / Stage Host</strong></div>
            <small>{previewObservation.effectHost.activeChannels.length} active · {previewObservation.effectHost.operationCount} operations</small>
          </header>
          {previewObservation.pendingEffect !== null && (
            <div className="runtime-effect-host__request" data-host-state="awaited">
              <div><strong>等待宿主完成</strong><code>{previewObservation.pendingEffect.descriptorId}</code></div>
              <p>{previewObservation.pendingEffect.kind} · {previewObservation.pendingEffect.channel} · scope {previewObservation.pendingEffect.cancellationScope}</p>
              <div className="runtime-effect-host__actions">
                <button type="button" onClick={() => setPlayable(completeFormalPreviewEffect(playable))}>完成 Effect</button>
                <button type="button" className="is-secondary" onClick={() => setPlayable(cancelFormalPreviewEffect(playable))}>安全取消</button>
              </div>
            </div>
          )}
          {previewObservation.pendingBarrier !== null && (
            <div className="runtime-effect-host__request runtime-effect-host__request--barrier" data-host-state="barrier">
              <div><strong>不可逆边界</strong><code>{previewObservation.pendingBarrier.descriptorId}</code></div>
              <p>{previewObservation.pendingBarrier.reason}</p>
              <div className="runtime-effect-host__actions">
                <button type="button" onClick={() => setPlayable(approveFormalPreviewBarrier(playable))}>理解并批准</button>
                <button type="button" className="is-secondary" onClick={exitPlayablePreview}>拒绝并退出试玩</button>
              </div>
            </div>
          )}
          {previewObservation.pendingEffect === null && previewObservation.pendingBarrier === null && (
            <p className="runtime-effect-host__settled"><span aria-hidden="true">✓</span> Host 已协调 · last {previewObservation.effectHost.lastOperation ?? "none"}{previewObservation.effectHost.checkpointId === null ? "" : ` · ${previewObservation.effectHost.checkpointId.slice(0, 12)}`}</p>
          )}
        </section>
      )}
      {playableActive && hotUpdate !== null && (
        <section className={`runtime-hot-update runtime-hot-update--${hotUpdate.kind}`} aria-label="Runtime 热更新" aria-live="polite">
          {hotUpdate.kind === "applied" ? (
            <>
              <header><div><span aria-hidden="true">↻</span><strong>安全热更新已应用</strong></div><small>STATE PRESERVED</small></header>
              <p>新 IR 已用记录输入重新回放；State、History、分支位置与已执行 Host receipt 保持一致。</p>
              <code>{hotUpdate.previousBuildId.slice(0, 10)} → {hotUpdate.buildId.slice(0, 10)}</code>
            </>
          ) : (
            <>
              <header><div><span aria-hidden="true">!</span><strong>需要明确重启试玩</strong></div><small>OLD SESSION PRESERVED</small></header>
              <p>当前试玩仍运行旧 IR，没有静默迁移或自动重启。</p>
              <ul>{hotUpdate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <div className="runtime-hot-update__actions">
                <button type="button" onClick={restartPlayablePreview}>以当前启动目标重启</button>
                <button type="button" className="is-secondary" onClick={exitPlayablePreview}>退出试玩并保留编辑</button>
              </div>
            </>
          )}
        </section>
      )}
      {!playableActive && (
        <div className="runtime-start-actions" aria-label="Runtime 启动位置" role="group">
          <div><strong>Fresh Run</strong><small>变量恢复工程默认值 · 调用栈为空</small></div>
          <button type="button" onClick={beginPlayablePreviewFromScene} disabled={pendingDraft || inputDirty}>从当前场景运行</button>
          <button type="button" onClick={beginPlayablePreviewFromStatement} disabled={pendingDraft || inputDirty}>从当前语句运行</button>
        </div>
      )}
      <details
        className="preview-disclosure preview-disclosure--runtime"
        open={runtimeDetailsOpen}
        onToggle={(event) => setRuntimeDetailsOpen(event.currentTarget.open)}
      >
        <summary>
          <span><strong>Runtime 诊断</strong><small>变量、调用栈与结构化诊断</small></span>
          <span>r{previewObservation.stateRevision ?? "—"} · h{previewObservation.history?.cursor ?? "—"}/{previewObservation.history?.length ?? "—"}</span>
        </summary>
      <section className={`runtime-inspector runtime-inspector--${playable.status}`} aria-label="Runtime 状态检查器">
        <header className="runtime-inspector__header">
          <div><span className="runtime-inspector__pulse" aria-hidden="true" /><strong>Preview Session</strong><small>正式 Runtime 状态观察</small></div>
          <div className="runtime-inspector__metrics">
            <span>r{previewObservation.stateRevision ?? "—"}</span>
            <span>{previewObservation.logicalTimeMilliseconds ?? 0} ms</span>
            <span>h{previewObservation.history?.cursor ?? "—"}/{previewObservation.history?.length ?? "—"}</span>
          </div>
        </header>
        <div className="runtime-inspector__current">
          <span>当前 IR / Statement</span>
          {previewObservation.current === null
            ? <strong>启动完整流程后显示精确位置</strong>
            : <><strong>{previewObservation.current.opcode ?? "unknown"} · {previewObservation.current.instructionId}</strong><code>{previewObservation.current.sceneId} / {previewObservation.current.statementId ?? "unmapped"} #{previewObservation.current.statementIndex ?? "—"}</code></>}
        </div>
        <div className="runtime-inspector__grid">
          <section aria-label="Runtime 变量">
            <div className="runtime-inspector__section-title"><strong>变量</strong><span>{previewObservation.variables.length}</span></div>
            {previewObservation.variables.length === 0
              ? <p>暂无 Runtime 变量</p>
              : <ul>{previewObservation.variables.map((variable) => <li key={variable.id}><code>{variable.id}</code><span>{variable.type}</span><strong>{variable.value === null ? "null" : String(variable.value)}</strong></li>)}</ul>}
          </section>
          <section aria-label="Runtime 调用栈">
            <div className="runtime-inspector__section-title"><strong>调用栈</strong><span>{previewObservation.callStack.length}</span></div>
            {previewObservation.callStack.length === 0
              ? <p>栈为空 · 当前位于顶层场景</p>
              : <ol>{previewObservation.callStack.map((frame) => <li key={`${frame.depth}:${frame.sceneId}:${frame.instructionIndex}`}><span>#{frame.depth + 1}</span><code>{frame.sceneId} · {frame.statementId ?? frame.instructionId ?? frame.instructionIndex}</code></li>)}</ol>}
          </section>
        </div>
        <section className="runtime-inspector__diagnostics" aria-label="Runtime 结构化诊断">
          <div className="runtime-inspector__section-title"><strong>结构化诊断</strong><span>{previewObservation.diagnostics.length}</span></div>
          {previewObservation.diagnostics.length === 0
            ? <p><span aria-hidden="true">✓</span> 当前 Session 无诊断</p>
            : <ul>{previewObservation.diagnostics.map((diagnostic, index) => <li className={`runtime-inspector__diagnostic--${diagnostic.severity}`} key={`${diagnostic.code}:${index}`}><strong>{diagnostic.code}</strong><span>{diagnostic.origin}</span><p>{diagnostic.message}</p><code>{diagnostic.sceneId ?? "global"} / {diagnostic.statementId ?? diagnostic.instructionId ?? "unmapped"}</code></li>)}</ul>}
        </section>
      </section>
      </details>
      <details className="preview-disclosure preview-disclosure--build">
        <summary>
          <span><strong>构建与导出</strong><small>独立、离线、可交付试玩产物</small></span>
          <span>{webBuild === null ? "按需构建" : `${(webBuild.byteLength / 1024).toFixed(1)} KiB`}</span>
        </summary>
      <div className="playable-web-export" aria-label="独立试玩导出">
        <div><strong>独立试玩产物</strong><small>生成无需编辑器和网络即可运行的单文件 HTML</small></div>
        <button type="button" onClick={preparePlayableWeb} disabled={pendingDraft || inputDirty}>构建试玩 HTML</button>
        {webBuild && <a href={webBuild.href} download={webBuild.filename}>下载 {(webBuild.byteLength / 1024).toFixed(1)} KiB</a>}
        {webBuildError && <p role="alert">{webBuildError}</p>}
      </div>
      </details>
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

export interface AppProps {
  readonly initialProject?: CanonicalProject;
  readonly routeCompiler?: EditorProjectCompilerState;
  readonly onProjectChange?: (project: StoryProject) => void;
  readonly onProjectSave?: (project: StoryProject) => Promise<void>;
  readonly onCanonicalProjectSave?: (project: CanonicalProject) => Promise<void>;
  readonly onCanonicalProjectChange?: (project: CanonicalProject) => void;
  readonly autosaveDebounceMs?: number;
}
export function App({ initialProject, routeCompiler, onProjectChange, onProjectSave, onCanonicalProjectSave, onCanonicalProjectChange, autosaveDebounceMs = AUTOSAVE_DEBOUNCE_MS }: AppProps = {}) {
  const [session, baseDispatch] = useReducer(reduceStudioSession, initialProject, (project) => project === undefined ? createStudioSession() : createStudioSessionFromCanonical(project));
  const [canonicalBase, setCanonicalBase] = useState<CanonicalProject>(() => initialProject ?? projectCanonicalFromStory(session.project, "n32-editor-preview"));
  const [assetIndex, setAssetIndex] = useState<AssetIndex>(createAssetIndex);
  const previewCanonicalProject = useMemo(
    () => projectCanonicalWithAssetIndex(projectCanonicalWithStory(canonicalBase, session.project), assetIndex),
    [assetIndex, canonicalBase, session.project]
  );
  const previewCanonicalProjectRef = useRef(previewCanonicalProject);
  previewCanonicalProjectRef.current = previewCanonicalProject;
  const projectStorageId = initialProject?.manifest.projectId ?? "prj_twilight_broadcast";
  const lifecycleHosted = initialProject !== undefined;
  const canonicalVariableIds = useMemo(() => initialProject?.variables.variables.flatMap((item) =>
    typeof item.id === "string" ? [item.id] : []) ?? [], [initialProject]);
  const [mode, setMode] = useState<StudioMode>("sequence");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceModeId>("writer");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevelId>("pro");
  const [motionPreference, setMotionPreference] = useState<MotionPreferenceId>(() => {
    try { return loadMotionPreference(globalThis.localStorage); } catch { return "simplified"; }
  });
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const effectiveMotion = effectiveMotionLevel(motionPreference, systemReducedMotion);
  const motionFrameAudit = useMotionFrameAudit(
    typeof globalThis.location !== "undefined" && motionFrameAuditRequested(globalThis.location.search),
    `${mode}:${workspaceMode}:${effectiveMotion}`
  );
  const crossViewSyncAudit = useCrossViewSyncAudit(
    typeof globalThis.location !== "undefined" && crossViewSyncAuditRequested(globalThis.location.search),
    activeSourceSession(session).revision
  );
  const [workspaceContextStatus, setWorkspaceContextStatus] = useState<"session" | "restored" | "missing" | "invalid">("session");
  const modeRef = useRef(mode);
  const workspaceModeRef = useRef(workspaceMode);
  const experienceLevelRef = useRef(experienceLevel);
  modeRef.current = mode;
  workspaceModeRef.current = workspaceMode;
  experienceLevelRef.current = experienceLevel;
  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;
    const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(query.matches);
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener?.(update);
    return () => query.removeListener?.(update);
  }, []);
  useEffect(() => {
    try { storeMotionPreference(globalThis.localStorage, motionPreference); } catch { /* local preference is fail-soft */ }
  }, [motionPreference]);
  const selectWorkspaceMode = useCallback((nextMode: WorkspaceModeId) => {
    const descriptor = workspaceModeDescriptor(nextMode);
    if (!descriptor.available) return;
    setWorkspaceMode(nextMode);
    setMode(descriptor.defaultView);
    setSettingsOpen(false);
  }, []);
  const [runtimeRouteTrace, setRuntimeRouteTrace] = useState<RuntimeRouteTrace>(IDLE_RUNTIME_ROUTE_TRACE);
  const [requestedFocusStatementId, setRequestedFocusStatementId] = useState<string | null>(null);
  const [inputDirty, setInputDirty] = useState(false);
  const storageAvailable = typeof globalThis.indexedDB !== "undefined";
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
  const routeChangedSceneIds = useRef<Set<string> | null>(new Set());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onProjectChangeRef = useRef(onProjectChange);
  const onProjectSaveRef = useRef(onProjectSave);
  const onCanonicalProjectSaveRef = useRef(onCanonicalProjectSave);
  onProjectChangeRef.current = onProjectChange;
  onProjectSaveRef.current = onProjectSave;
  onCanonicalProjectSaveRef.current = onCanonicalProjectSave;
  const [editVersion, setEditVersion] = useState(0);
  const [backupPanelOpen, setBackupPanelOpen] = useState(false);
  const [backups, setBackups] = useState<readonly ProjectBackup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);

  const restoreSessionAndContext = useCallback((snapshot: ProjectSnapshot, restoredSession: StudioSession) => {
    const resolution = restoreWorkspaceContext(snapshot, restoredSession);
    setWorkspaceMode(resolution.context.workspaceMode);
    setMode(resolution.context.editorView);
    setExperienceLevel(resolution.context.experienceLevel);
    setRequestedFocusStatementId(resolution.context.statementId);
    setWorkspaceContextStatus(resolution.status);
    return resolution.session;
  }, []);

  useEffect(() => {
    if (lifecycleHosted) onProjectChangeRef.current?.(session.project);
  }, [lifecycleHosted, session.project]);

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
    const editsStory = [
      "edit-script", "patch-dialogue", "patch-direction", "patch-directions", "insert-dialogue", "insert-direction", "duplicate-direction", "delete-dialogue",
      "move-dialogue", "delete-direction", "move-direction", "p0-insert", "p0-update", "p0-delete", "p0-move", "p0-batch", "format-script", "discard-draft", "undo", "redo"
    ].includes(action.type);
    if (editsStory) crossViewSyncAudit.begin(action.type, sessionRef.current.selectedStatementId, activeSourceSession(sessionRef.current).revision);
    baseDispatch(action);
    if (editsStory) {
      routeChangedSceneIds.current?.add(sessionRef.current.activeSceneId);
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
  const createEntityId = (prefix: string) => {
    const used = new Set<string>();
    for (const scene of sessionRef.current.project.scenes) {
      used.add(scene.id);
      for (const statement of scene.statements) {
        used.add(statement.id);
        if (statement.kind === "dialogue" || statement.kind === "narration") used.add(statement.textId);
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
  const renameSceneFromRouteMap = (sceneId: string, title: string): RenameRouteSceneResult => {
    const result = renameRouteScene(previewCanonicalProject, createCommandId(), sceneId, title);
    if (!result.ok) return result;
    routeChangedSceneIds.current?.add(sceneId);
    setCanonicalBase(result.project);
    const nextSession = createStudioSessionFromCanonical(result.project);
    const selectedScene = nextSession.project.scenes.find((item) => item.id === sceneId);
    baseDispatch({
      type: "restore-session",
      session: selectedScene === undefined ? nextSession : {
        ...nextSession,
        activeSceneId: sceneId,
        selectedStatementId: selectedScene.statements[0]?.id ?? nextSession.selectedStatementId
      }
    });
    editGeneration.current += 1;
    setEditVersion((value) => value + 1);
    setPersistence((current) => current.status === "unavailable" || current.status === "conflict" || current.status === "readonly" || current.status === "blocked" || current.status === "loading" || current.status === "migrating"
      ? current
      : { status: "dirty", revision: current.revision, ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount }) });
    return result;
  };
  const applyRouteLayoutMutation = (result: RouteProjectMutationResult): RouteProjectMutationResult => {
    if (!result.ok) return result;
    setCanonicalBase(result.project);
    onCanonicalProjectChange?.(result.project);
    editGeneration.current += 1;
    setEditVersion((value) => value + 1);
    setPersistence((current) => current.status === "unavailable" || current.status === "conflict" || current.status === "readonly" || current.status === "blocked" || current.status === "loading" || current.status === "migrating"
      ? current
      : { status: "dirty", revision: current.revision, ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount }) });
    return result;
  };
  const setScenePositionFromRouteMap = (sceneId: string, x: number, y: number) => applyRouteLayoutMutation(setRouteScenePosition(previewCanonicalProject, createCommandId(), sceneId, x, y));
  const resetSceneLayoutFromRouteMap = (sceneId: string) => applyRouteLayoutMutation(resetRouteSceneLayout(previewCanonicalProject, createCommandId(), sceneId));
  const upsertRouteGroupFromMap=(groupId:string,title:string)=>applyRouteLayoutMutation(upsertRouteGroup(previewCanonicalProject,createCommandId(),groupId,title));
  const toggleRouteGroupFromMap=(groupId:string)=>applyRouteLayoutMutation(toggleRouteGroup(previewCanonicalProject,createCommandId(),groupId));
  const deleteRouteGroupFromMap=(groupId:string)=>applyRouteLayoutMutation(deleteRouteGroup(previewCanonicalProject,createCommandId(),groupId));
  const assignRouteSceneGroupFromMap=(sceneId:string,groupId?:string)=>applyRouteLayoutMutation(assignRouteSceneGroup(previewCanonicalProject,createCommandId(),sceneId,groupId));
  const setRouteViewportFromMap=(x:number,y:number,zoom:number)=>applyRouteLayoutMutation(setRouteViewport(previewCanonicalProject,createCommandId(),x,y,zoom));
  const applySettingsProject = (project: CanonicalProject) => {
    setCanonicalBase(project);
    onCanonicalProjectChange?.(project);
    editGeneration.current += 1;
    setEditVersion((value) => value + 1);
    setPersistence((current) => current.status === "unavailable" || current.status === "conflict" || current.status === "readonly" || current.status === "blocked" || current.status === "loading" || current.status === "migrating"
      ? current
      : { status: "dirty", revision: current.revision, ...(current.backupCount === undefined ? {} : { backupCount: current.backupCount }), detail: "设置 ChangeSet 已进入 Canonical Project，等待保存。" });
  };

  useEffect(() => {
    if (!storageAvailable) return;
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let conflictRetry: ReturnType<typeof setTimeout> | undefined;
    const store = new IndexedDbProjectFileStore(globalThis.indexedDB, projectStorageId);
    const assetRepository = new IndexedDbAssetRepository(globalThis.indexedDB, projectStorageId);
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
      if (cancelled) {
        if (acquisition.status === "acquired") await store.release(acquisition.lease).catch(() => false);
        return;
      }
      if (acquisition.status === "held") {
        const retryDelayMs = Math.max(100, acquisition.holderExpiresAtMs - Date.now() + 100);
        setPersistence({
          status: "conflict",
          revision: storageRevision.current,
          detail: `另一编辑窗口持有写入权，最迟于 ${new Date(acquisition.holderExpiresAtMs).toLocaleTimeString()} 释放；届时将自动重试。`,
          errorCode: "LEASE_REQUIRED"
        });
        conflictRetry = setTimeout(() => {
          if (!cancelled) setLeaseRetry((value) => value + 1);
        }, retryDelayMs);
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
        const restored = restoreSessionAndContext(
          snapshot,
          restoreStudioSession(snapshot, sessionRef.current.project)
        );
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
      if (conflictRetry !== undefined) clearTimeout(conflictRetry);
      globalThis.removeEventListener("pagehide", releaseOnPageHide);
      globalThis.removeEventListener("pageshow", reacquireAfterPageShow);
      const activeLease = leaseRef.current;
      if (activeLease !== null) markBrowserWriterLeaseOwnerHandoff(activeLease.ownerId);
      leaseRef.current = null;
      if (storeRef.current === store) storeRef.current = null;
      store.activateWriterLease(null);
      if (assetRepositoryRef.current === assetRepository) assetRepositoryRef.current = null;
      assetRepository.activateWriterLease(null);
      assetImportAbortRef.current?.abort();
      assetImportAbortRef.current = null;
      dicingAnalysisAbortRef.current?.abort();
      dicingAnalysisAbortRef.current = null;
      if (activeLease !== null) void store.release(activeLease).catch(() => false);
    };
  }, [storageAvailable, leaseRetry, projectStorageId]);

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
    const projectAtSaveStart = sessionRef.current.project;
    const canonicalProjectAtSaveStart = previewCanonicalProjectRef.current;
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
    const snapshot = persistWorkspaceContext(
      createProjectSnapshot(
        sessionRef.current,
        nextRevision,
        persistedSnapshotRef.current
      ),
      createWorkspaceContext(sessionRef.current, workspaceModeRef.current, modeRef.current, experienceLevelRef.current)
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
      if (onCanonicalProjectSaveRef.current !== undefined) await onCanonicalProjectSaveRef.current(canonicalProjectAtSaveStart);
      else await onProjectSaveRef.current?.(projectAtSaveStart);
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
    const timer = setTimeout(() => saveToLocal("auto"), autosaveDebounceMs);
    return () => clearTimeout(timer);
  }, [autosaveDebounceMs, editVersion, inputDirty, persistence.status]);

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
      const restored = restoreSessionAndContext(
        result.snapshot,
        restoreStudioSession(result.snapshot, sessionRef.current.project)
      );
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
      const canonicalWithAssets = projectCanonicalWithAssetIndex(
        projectCanonicalWithStory(canonicalBase, sessionRef.current.project),
        result.index
      );
      setCanonicalBase(canonicalWithAssets);
      onCanonicalProjectChange?.(canonicalWithAssets);
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
        typedDirectionCount += typedSource.match(/^@(background|show|camera|audio|textbox)\b/gm)?.length ?? 0;
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

  const workspaceContext = createWorkspaceContext(session, workspaceMode, mode, experienceLevel);
  const contextProjection = workspaceContextProjection(workspaceContext);
  return (
    <div
      className="app-shell"
      data-workspace-mode={workspaceMode}
      data-editor-view={mode}
      data-experience-level={experienceLevel}
      data-motion-preference={motionPreference}
      data-motion-level={effectiveMotion}
      data-system-reduced-motion={systemReducedMotion}
      data-motion-frame-status={motionFrameAudit.status}
      data-motion-frame-samples={motionFrameAudit.samples}
      data-motion-frame-p95={motionFrameAudit.p95Milliseconds ?? ""}
      data-motion-frame-max={motionFrameAudit.maxMilliseconds ?? ""}
      data-motion-frame-over-budget={motionFrameAudit.overBudgetFrames}
      data-motion-frame-result={motionFrameAudit.status === "complete" ? (motionFrameAuditPasses(motionFrameAudit) ? "pass" : "fail") : motionFrameAudit.status}
      data-sync-audit-status={crossViewSyncAudit.result.status}
      data-sync-audit-action={crossViewSyncAudit.result.action}
      data-sync-audit-statement-id={crossViewSyncAudit.result.statementId}
      data-sync-audit-source-revision={crossViewSyncAudit.result.sourceRevision}
      data-sync-audit-projected-revision={crossViewSyncAudit.result.projectedRevision}
      data-sync-audit-duration={crossViewSyncAudit.result.durationMilliseconds ?? ""}
      data-sync-audit-result={crossViewSyncAudit.result.status === "complete" ? (crossViewSyncAuditPasses(crossViewSyncAudit.result) ? "pass" : "fail") : crossViewSyncAudit.result.status}
      data-context-scene-id={workspaceContext.sceneId}
      data-context-statement-id={contextProjection.selectionId}
      data-inspector-object-id={contextProjection.inspectorObjectId}
      data-runtime-scene-id={contextProjection.runtimeSceneId}
      data-runtime-statement-id={contextProjection.runtimeStatementId}
      data-context-restore-status={workspaceContextStatus}
      data-settings-open={settingsOpen}
      data-testid="workspace-shell"
    >
      <WorkspaceHeader
        mode={mode}
        workspaceMode={workspaceMode}
        experienceLevel={experienceLevel}
        motionPreference={motionPreference}
        effectiveMotion={effectiveMotion}
        systemReducedMotion={systemReducedMotion}
        session={session}
        inputDirty={inputDirty}
        onModeChange={(nextMode) => { setSettingsOpen(false); setMode(nextMode); }}
        onWorkspaceModeChange={selectWorkspaceMode}
        onExperienceLevelChange={setExperienceLevel}
        onMotionPreferenceChange={setMotionPreference}
        persistence={persistence}
        onSave={() => saveToLocal("manual")}
        onOpenBackups={openBackups}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen((value) => !value)}
        dispatch={dispatch}
      />
      <main className="workspace-grid" data-workspace-mode={workspaceMode} data-settings-open={settingsOpen}>
        {settingsOpen ? <>
          <SettingsWorkspace
            project={previewCanonicalProject}
            saveStatus={persistence.status}
            {...(persistence.detail === undefined ? {} : { saveDetail: persistence.detail })}
            onProjectChange={applySettingsProject}
            onSave={() => saveToLocal("manual")}
            onClose={() => setSettingsOpen(false)}
          />
          <PreviewPanel session={session} dispatch={dispatch} createCommandId={createCommandId} inputDirty={inputDirty} assetIndex={assetIndex} assetRepository={assetRepositoryRef.current} canonicalProject={previewCanonicalProject} onRouteTraceChange={setRuntimeRouteTrace} />
        </> : workspaceMode === "production" ? (
          <ProductionWorkspace
            index={assetIndex}
            lifecycle={assetLifecycle}
            dicingReport={dicingReport}
            storageStatus={assetStatus}
            onOpenPipeline={() => setAssetPanelOpen(true)}
          />
        ) : workspaceMode === "debug-qa" ? (
          <DebugQaWorkspace
            project={previewCanonicalProject}
            diagnostics={session.diagnostics}
            selectedSceneId={session.activeSceneId}
            selectedStatementId={session.selectedStatementId}
            onOpenSource={(sceneId, statementId) => {
              if (statementId === undefined) dispatch({ type: "select-scene", sceneId });
              else {
                setRequestedFocusStatementId(statementId);
                dispatch({ type: "select-project-result", sceneId, statementId });
              }
              setWorkspaceMode("writer");
              setMode("sequence");
            }}
          />
        ) : workspaceMode === "mobile-focus" ? (
          <MobileFocusWorkspace
            session={session}
            dispatch={dispatch}
            createCommandId={createCommandId}
            onInputDirtyChange={setInputDirty}
          />
        ) : <>
          <SceneRail
          session={session}
          dispatch={dispatch}
          assetIndex={assetIndex}
          assetStatus={assetStatus}
          onOpenAssets={() => setAssetPanelOpen(true)}
          onGlobalJump={(match) => {
            setMode("sequence");
            setRequestedFocusStatementId(match.statementId);
            dispatch({ type: "select-project-result", sceneId: match.sceneId, statementId: match.statementId });
          }}
        />
        {mode === "sequence" ? (
          <SequenceView session={session} dispatch={dispatch} createCommandId={createCommandId} createEntityId={createEntityId} onInputDirtyChange={setInputDirty} assetIndex={assetIndex} variableIds={canonicalVariableIds} requestedFocusStatementId={requestedFocusStatementId} onRequestedFocusHandled={() => setRequestedFocusStatementId(null)} runtimeRouteTrace={runtimeRouteTrace} />
        ) : mode === "script" ? (
          <ScriptView session={session} dispatch={dispatch} createCommandId={createCommandId} inputDirty={inputDirty} onInputDirtyChange={setInputDirty} />
        ) : (
          <FlowView
            session={session}
            dispatch={dispatch}
            canonicalProject={previewCanonicalProject}
            runtimeRouteTrace={runtimeRouteTrace}
            {...(routeCompiler===undefined?{}:{routeCompiler})}
            hasLocalChanges={editGeneration.current > 0}
            {...(routeChangedSceneIds.current===null?{}:{trustedChangedSceneIds:[...routeChangedSceneIds.current]})}
            createCommandId={createCommandId}
            onRenameScene={renameSceneFromRouteMap}
            onSetScenePosition={setScenePositionFromRouteMap}
            onResetSceneLayout={resetSceneLayoutFromRouteMap}
            onUpsertGroup={upsertRouteGroupFromMap}
            onToggleGroup={toggleRouteGroupFromMap}
            onDeleteGroup={deleteRouteGroupFromMap}
            onAssignGroup={assignRouteSceneGroupFromMap}
            onSetViewport={setRouteViewportFromMap}
            onOpenSequence={(sceneId, statementId) => {if(statementId===undefined){dispatch({type:"select-scene",sceneId});}else{setRequestedFocusStatementId(statementId);dispatch({type:"select-project-result",sceneId,statementId});}setMode("sequence");}}
          />
        )}
          <PreviewPanel session={session} dispatch={dispatch} createCommandId={createCommandId} inputDirty={inputDirty} assetIndex={assetIndex} assetRepository={assetRepositoryRef.current} canonicalProject={previewCanonicalProject} onRouteTraceChange={setRuntimeRouteTrace} />
        </>}
      </main>
      <footer className="workspace-footer">
        <span>本地优先</span><span>无账户</span><span>schema {CURRENT_PROJECT_SCHEMA_VERSION}</span><span>备份 {persistence.backupCount ?? 0}/{BACKUP_POLICY.retention}</span><span className="footer-accent">S0.41 PROJECT · GLOBAL SEARCH</span>
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

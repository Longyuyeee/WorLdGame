import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { releaseAnimationsOnDetach } from "./owned-animations";
import { storyMotionStyle } from "./story-motion-style";
import "./story-motion.css";
import { RecoverySessionError, RecoverySessionRunner } from "./recovery-session-client";
import { useStoryAdvance } from './use-story-advance';
import { usePlaybackAdvance } from './use-playback-advance';
import { notifyPlayerAutoVoiceFailure, startPlayerAutoClock } from "./auto-playback-clock";
import { readPlayerReadingPace, storePlayerReadingPace, readingMillisecondsPerUnit, type PlayerReadingPace } from './player-reading';
import { useCompactReadingLayout, useReadingMediaQuery, useReadingSurface } from './use-reading-surface';
import { applyPlayerPreferences } from './player-preferences';
import { usePlayerPreferences } from './use-player-preferences';
import { restorePlayerCollection, usePlayerCollection } from './use-player-collection';
import { restorePlayerReplayArchive, usePlayerReplayArchive } from './use-player-replay-archive';
import { usePlayerFullscreen } from './use-player-fullscreen';
import { PlayerPreferencesPanel } from './PlayerPreferencesPanel';
import { PlayerPublicationTools } from './PlayerPublicationTools';
import { PlayerCreditsPanel } from './PlayerCreditsPanel';
import { PlayerHistoryContent } from './PlayerHistoryContent';
import { PlayerMusicPreview } from './PlayerMusicPreview';
import { DEFAULT_WEB_CREDITS, readWebCredits, hasWebCredits } from '@world-studio/project-domain';
import { cancelPlayerAudioRequest, requestPlayerAudioPlayback, cancelPlayerMediaRequest, requestPlayerMediaPlayback } from "./audio-playback-request";
import { playerAudioFailureHint } from './audio-failure';
import { NativeAtlasImage } from "./NativeAtlasImage";
import { DeferredAtlasImage } from "./DeferredAtlasImage";
import {
  createGalSettingsApplicationV1,
  createGalSettingsDocument,
  galAdvanceInputEnabledV1,
  galAudioGainV1,
  galTextRevealDurationMillisecondsV1,
  type GalAdvanceInputV1,
  type GalAudioBusV1,
  type GalSettingsPlatform
} from "@world-studio/gal-settings";
import { semanticHash, readWebPlayerAppearance, webPlayerCoverAssets, type CanonicalProject } from "@world-studio/project-domain";
import { ForegroundSessionError,ForegroundSessionRunner,runForegroundSessionTask } from "./foreground-session-client";
import {
  createPlayerCore,
  canEnterPlayerCoreReplayV1,
  createPlayerCoreSnapshotV1,
  configurePlayerCoreLocaleV1,
  configurePlayerCoreHistoryPolicyV1,
  dispatchPlayerCoreIntentV1,
  schedulePlayerCorePlaybackV1,
  type PlayerCorePlaybackPolicyV1,
  type PlayerCoreIntentV1
} from "@world-studio/player-core";
import { derivePlayerStagePresentationV1, type PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";
import { playerSaveLabel } from './player-save-label';
import { PlayerSaveCard, PlayerSaveDetails } from './PlayerSaveCard';
import { PlayerSaveBackupPanel } from "./PlayerSaveBackupPanel";
import { resolvePlayerLocalizedMediaV1 } from "./player-localized-media";
import { parsePlayerRichTextV1, resolvePlayerTypographyV1 } from "./player-typography";
import { usePlayerSkinFonts } from "./use-player-skin-fonts";
import { playerSkinStyle } from "./player-skin";
import { playerScreenProps } from "./player-screen-skin";
import type { WebPlayerScreenId } from "@world-studio/project-domain";
import { browserGamepadFrameV1, createPlayerGamepadTrackerV1, type PlayerGamepadActionV1 } from "./player-input";
import {
  WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES,
  WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_HEIGHT,
  WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_WIDTH,
  createWorldPlayerSaveSlotV3,
  worldPlayerSavePreviewSha256V1,
  type WorldPlayerSavePreviewV2,
  type WorldPlayerSaveSummaryV3,
  listWorldPlayerSaveSummariesV3,
  type WorldPlayerSaveStoreV3
} from "./player-save-store";
import {
  WorldPlayerRecoveryWriteCoordinatorV1,
  WorldPlayerSaveWriteCoordinatorV1,
  worldPlayerAutoSaveAllowedV1,
  worldPlayerSaveSceneIdentityV1
} from "./player-save-policy";
import {
  createWorldPlayerRecoveryRecordV1,
  type WorldPlayerRecoveryRecordV1,
  type WorldPlayerRecoveryStoreV1
} from "./player-recovery-store";
import {
  DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1,
  validateWorldPlayerPlaybackPolicyV1,
  type WorldPlayerSkipActivationV1,
  type WorldPlayerSkipSpeedV1,
  type WorldPlayerPlaybackPolicyV1
} from "./player-playback-policy";
import "./player-shell.css";
import "./player-reading-controls.css";
import "./player-save-flow.css";
import "./player-ending-flow.css";
import "./player-replay-flow.css";
import "./player-skin.css";
import "./player-screen-skin.css";
import "./player-skin-images.css";
import { useSkinButtonFeedback } from "./use-skin-button-feedback";
import { PlayerDialogueIdentity } from "./PlayerDialogueIdentity";
import { captureBrowserSavePreview } from "./browser-save-preview";
import { saveReadingExcerpt } from "./save-reading-excerpt";
import { PlayerLayoutBox, PlayerLayoutComponents, usePlayerLayout } from "./PlayerLayout";
import { webLayoutActions, webLayoutIsAdditional, WEB_ADDITIONAL_LAYOUT_LABELS, type WebAdditionalLayoutSurface, type WebLayoutAction } from "@world-studio/project-domain";
import { PlayerPanelRegion, usePlayerPanelLayout, type PlayerLayoutPanel } from "./PlayerPanelLayout";
import "./player-skin-template.css";
// Load after the legacy page templates so opted-in viewport layouts keep their geometry.
import "./player-panel-layout.css";
import "./player-additional-layout.css";

export interface PlayerEditorPreviewOptions { readonly autoStart: boolean; readonly initialPanel?: WebPlayerScreenId; readonly initialAdditionalView?: Exclude<WebAdditionalLayoutSurface, "additional">; }

export interface PlayerShellProps {
  readonly project: CanonicalProject;
  readonly mediaAssets?: readonly PlayerMediaAssetSourceV1[];
  readonly onRetryMedia?: () => void;
  readonly hostActivity?: PlayerHostActivityV1;
  readonly platform?: GalSettingsPlatform;
  readonly saveStore?: WorldPlayerSaveStoreV3;
  readonly recoveryStore?: WorldPlayerRecoveryStoreV1;
  readonly previewCapture?: WorldPlayerPreviewCaptureV1;
  readonly now?: () => number;
  readonly playbackPolicy?: WorldPlayerPlaybackPolicyV1;
  readonly memoryPressureRequest?: { readonly serial: number; readonly level: "moderate" | "critical" };
  readonly onReleaseIdleResources?: () => void;
  readonly editorPreview?: PlayerEditorPreviewOptions;
}

type PlayerInputSource = "lifecycle" | GalAdvanceInputV1 | "system";
export type PlayerHostActivityV1 = "active" | "suspended";
export type PlayerMemoryPressureStatusV1 = "idle" | "protecting" | "released" | "protected" | "deferred" | "error";

export interface WorldPlayerPreviewCaptureRequestV1 {
  readonly projectId: string;
  readonly sceneId: string;
  /** Freeze this view synchronously, before any asynchronous host work. */
  readonly runtimeStateHash?: string;
  readonly maximumWidth: typeof WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_WIDTH;
  readonly maximumHeight: typeof WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_HEIGHT;
  readonly maximumBytes: typeof WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES;
  readonly mimeTypes: readonly ["image/webp", "image/png"];
}

export interface WorldPlayerPreviewCaptureResultV1 {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

export interface WorldPlayerPreviewCaptureV1 {
  readonly version: "1.0.0";
  readonly owner: "player-host-compositor";
  capture(request: WorldPlayerPreviewCaptureRequestV1): Promise<WorldPlayerPreviewCaptureResultV1 | null>;
}

function PlayerRichText({ text, locale }: { readonly text: string; readonly locale: string }) {
  return <>{parsePlayerRichTextV1(text).map((segment, index) => segment.kind === "text"
    ? <Fragment key={`text:${index}`}>{segment.text}</Fragment>
    : <ruby key={`ruby:${index}`} lang={locale}>{segment.base}<rp>（</rp><rt>{segment.annotation}</rt><rp>）</rp></ruby>)}</>;
}

export function PlayerSavePreview({ projectId, slot, store }: { readonly projectId: string; readonly slot: WorldPlayerSaveSummaryV3 | undefined; readonly store: WorldPlayerSaveStoreV3 }) {
  const [source, setSource] = useState<{ slot: WorldPlayerSaveSummaryV3; url: string } | null>(null);
  const [failed, setFailed] = useState<WorldPlayerSaveSummaryV3 | null>(null);

  useEffect(() => {
    setSource(null);
    setFailed(null);
    if (slot?.preview.status !== "available") {
      setSource(null);
      return;
    }
    let disposed = false;
    let objectUrl: string | null = null;
    void store.readPreview(projectId, slot.slotId).then((blob) => {
      if (disposed) return;
      if (blob === null || typeof URL.createObjectURL !== "function") { setFailed(slot); return; }
      objectUrl = URL.createObjectURL(blob);
      setSource({ slot, url: objectUrl });
    }).catch(() => {
      if (!disposed) { setSource(null); setFailed(slot); }
    });
    return () => {
      disposed = true;
      if (objectUrl !== null && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, slot, store]);

  const hasFailed = slot !== undefined && failed === slot;
  return source === null || source.slot !== slot || hasFailed
    ? <span className="player-save__preview" data-preview-status={hasFailed ? "error" : slot?.preview.status ?? "empty"} aria-label={hasFailed ? "截图读取失败" : slot?.preview.status === "available" ? "截图正在读取" : "没有存档截图"} />
    : <img className="player-save__preview" src={source.url} alt={`${slot?.sceneTitle ?? "存档"} 截图`} onError={() => { if (slot) setFailed(slot); }} />;
}

function playerLocalePreferenceKey(projectId: string): string {
  return `world-player.locale.${projectId}`;
}

function createLocalizedPlayerCore(project: CanonicalProject, historyPolicy: Parameters<typeof createPlayerCore>[1], persist = true) {
  const created = createPlayerCore(project, historyPolicy, { checkpointSaveMode: "deferred" });
  if (!persist) return created;
  const core = restorePlayerReplayArchive(restorePlayerCollection(created));
  try {
    const preferred = globalThis.localStorage?.getItem(playerLocalePreferenceKey(project.manifest.projectId));
    return preferred === null || preferred === undefined ? core : configurePlayerCoreLocaleV1(core, preferred);
  } catch {
    return core;
  }
}

function storePlayerLocalePreference(projectId: string, locale: string): void {
  try {
    globalThis.localStorage?.setItem(playerLocalePreferenceKey(projectId), locale);
  } catch {
    // Player preferences are fail-soft; the active session still switches language.
  }
}

const EMPTY_MEDIA_ASSETS: readonly PlayerMediaAssetSourceV1[] = [];
export function PlayerShell({ project, mediaAssets = EMPTY_MEDIA_ASSETS, onRetryMedia, hostActivity = "active", platform = "web", saveStore, recoveryStore, previewCapture, now = Date.now, playbackPolicy = DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, memoryPressureRequest, onReleaseIdleResources, editorPreview }: PlayerShellProps) {
  const appearance = readWebPlayerAppearance(project);
  const skin = appearance?.skin;
  const coverAllowed = appearance !== null && webPlayerCoverAssets(project).some(asset => String(asset.assetId ?? asset.id) === appearance.coverAssetId);
  const cover = coverAllowed ? mediaAssets.find(asset => asset.assetId === appearance?.coverAssetId && ["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) : undefined;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const personal = usePlayerPreferences(project.manifest.projectId, !editorPreview);
  const effectiveMuted = !!editorPreview || personal.preferences.muted;
  const baseSettings = useMemo(() => createGalSettingsApplicationV1(project.settings, platform), [platform, project.settings]);
  const settingsApplication = useMemo(() => applyPlayerPreferences(baseSettings, editorPreview ? { ...personal.preferences, muted: true, revealMode: "instant" } : personal.preferences), [baseSettings, personal.preferences, editorPreview]);
  const fullscreen = usePlayerFullscreen();
  useSkinButtonFeedback(fullscreen.element, !!skin?.images && Object.values(skin.images.buttons).some(Boolean));
  const [preferencesOpen, setPreferencesOpen] = useState(editorPreview?.initialPanel === 'preferences' || editorPreview?.initialPanel === 'credits');
  const [infoView, setInfoView] = useState<'preferences' | 'credits'>(editorPreview?.initialPanel === 'credits' ? 'credits' : 'preferences');
  const infoTrigger = useRef<HTMLElement | null>(null);
  const credits = useMemo(() => { try { return readWebCredits(project); } catch { return DEFAULT_WEB_CREDITS; } }, [project]);
  const preferencesPanel = useRef<HTMLDivElement | null>(null), preferencesTrigger = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState(() => { const initial = createLocalizedPlayerCore(project, settingsApplication.history, !editorPreview); return editorPreview?.autoStart ? dispatchPlayerCoreIntentV1(initial, project, { kind: "primary" }) : initial; });
  const collection = usePlayerCollection(state, setState, !editorPreview);
  const replayArchive = usePlayerReplayArchive(state, setState, !editorPreview);
  const liveState = useRef(state);
  liveState.current = state;
  const [memoryPressureStatus, setMemoryPressureStatus] = useState<PlayerMemoryPressureStatusV1>("idle");
  const [handledMemorySerial, setHandledMemorySerial] = useState(0);
  const [memoryPressureMessage, setMemoryPressureMessage] = useState("");
  const [memoryPressureRetry, setMemoryPressureRetry] = useState(0);
  const memoryWritePending = useRef<WorldPlayerRecoveryWriteCoordinatorV1 | null>(null);
  const recoveryWritePending = useRef<{ coordinator: WorldPlayerRecoveryWriteCoordinatorV1; timer: ReturnType<typeof setTimeout>; controller: AbortController } | null>(null);
  const [recoveryWriteRevision, setRecoveryWriteRevision] = useState(0);
  const [mediaErrors, setMediaErrors] = useState<readonly string[]>([]);
  const [silentReading, setSilentReading] = useState(false);
  const [audioAttempts, setAudioAttempts] = useState<Readonly<Record<string, number>>>({});
  const [mediaGeneration, setMediaGeneration] = useState(0);
  const [imageAttempt, setImageAttempt] = useState(0);
  const imageGeneration = `${mediaGeneration}:${imageAttempt}`;
  const [imageReadiness, setImageReadiness] = useState<Record<string, string>>({});
  const reportImage = useCallback((key: string, status: string) => setImageReadiness(current => {
    if (current[key] === status || (status === "released" && !(key in current))) return current;
    const next = { ...current }; if (status === "released") delete next[key]; else next[key] = status; return next;
  }), []);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState(0);
  const [lastInputSource, setLastInputSource] = useState<PlayerInputSource>("lifecycle");
  const [lastInputAccepted, setLastInputAccepted] = useState(true);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [textReady, setTextReady] = useState(true);
  const compactReading = useCompactReadingLayout();
  const reducedReadingMotion = useReadingMediaQuery('(prefers-reduced-motion: reduce)');
  const [readingMenuOpen, setReadingMenuOpen] = useState(editorPreview?.initialPanel === 'menu');
  const [artworkView, setArtworkView] = useState(false);
  const readingMenu = useRef<HTMLDivElement | null>(null), readingMenuTrigger = useRef<HTMLButtonElement | null>(null);
  const readingMenuReturnTrigger = useRef<HTMLElement | null>(null), additionalContentReturnTrigger = useRef<HTMLElement | null>(null);
  const deferredMenuCompletion = useRef<{ stateHash: string | null; hostHash: string } | null>(null);
  const initialPace = () => {
    const fallback = playbackPolicy === DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 ? 'standard' : 'policy';
    try { return readPlayerReadingPace(globalThis.localStorage, project.manifest.projectId, fallback); } catch { return fallback; }
  };
  const [readingPace, setReadingPace] = useState<PlayerReadingPace>(initialPace);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoPlayback, setAutoPlayback] = useState<"off" | "waiting-reading" | "waiting-text" | "waiting-voice" | "waiting-video" | "waiting" | "advancing" | "suspended" | "stopped">("off");
  const [skipMode, setSkipMode] = useState<"skipRead" | "skipAll" | null>(null);
  const [skipActivation, setSkipActivation] = useState<WorldPlayerSkipActivationV1>(() => playbackPolicy.skip?.defaultActivation ?? DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.skip.defaultActivation);
  const [skipSpeed, setSkipSpeed] = useState<WorldPlayerSkipSpeedV1>(() => playbackPolicy.skip?.defaultSpeed ?? DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.skip.defaultSpeed);
  const [videoPolicyStopReason, setVideoPolicyStopReason] = useState<"none" | "unreadBoundary">("none");
  const [historyPanelOpen, setHistoryPanelOpen] = useState(editorPreview?.initialPanel === 'history');
  const [additionalContentOpen, setAdditionalContentOpen] = useState(editorPreview?.initialPanel === 'additional');
  const [additionalContentView, setAdditionalContentView] = useState<"overview" | "gallery" | "replay" | "music" | "endings">(editorPreview?.initialPanel === "additional" && editorPreview.initialAdditionalView && webLayoutIsAdditional(editorPreview.initialAdditionalView) ? editorPreview.initialAdditionalView : "overview");
  const [selectedGalleryAssetId, setSelectedGalleryAssetId] = useState<string | null>(null);
  const [additionalContentMediaErrors, setAdditionalContentMediaErrors] = useState<readonly string[]>([]);
  const [savePanelOpen, setSavePanelOpen] = useState(editorPreview?.initialPanel === 'save');
  const [saveSlots, setSaveSlots] = useState<readonly WorldPlayerSaveSummaryV3[]>([]);
  const [savePage, setSavePage] = useState(0);
  const [saveView, setSaveView] = useState<"manual" | "auto" | "quick" | "checkpoint" | "backup">("manual");
  const [saveIntent, setSaveIntent] = useState<'save' | 'load'>('save');
  const [pendingRead, setPendingRead] = useState<{ slotId: string; expectedArtifactHash?: string; slot: WorldPlayerSaveSummaryV3 | undefined } | null>(null);
  const readIntentTrigger = useRef<HTMLButtonElement | null>(null);
  const [pendingOverwriteSlotId, setPendingOverwriteSlotId] = useState<string | null>(null);
  const [saveOperation, setSaveOperation] = useState<"idle" | "busy" | "saved" | "loaded" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("请选择槽位");
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [backgroundSaveFailure, setBackgroundSaveFailure] = useState<{ kind: "auto" | "checkpoint"; message: string } | null>(null);
  const saveDialog = useRef<HTMLDialogElement | null>(null);
  const saveDialogTrigger = useRef<HTMLElement | null>(null);
  const historyDialogTrigger = useRef<HTMLElement | null>(null);
  const titleSaveTrigger = useRef<HTMLButtonElement | null>(null);
  const titlePreferencesTrigger = useRef<HTMLButtonElement | null>(null);
  const titleAdditionalContentTrigger = useRef<HTMLButtonElement | null>(null);
  const saveToggle = useRef<HTMLButtonElement | null>(null);
  const [recoveryCandidate, setRecoveryCandidate] = useState<WorldPlayerRecoveryRecordV1 | null>(null);
  const [recoveryOperation, setRecoveryOperation] = useState<"scanning" | "idle" | "available" | "ready" | "loaded" | "error">("scanning");
  const [recoveryMessage, setRecoveryMessage] = useState("正在检查恢复记录…");
  const [recoveryErrorAction, setRecoveryErrorAction] = useState<"clear" | "retry" | "load" | null>(null);
  const [newStoryConfirmation, setNewStoryConfirmation] = useState(false);
  const [recoveryScanAttempt, setRecoveryScanAttempt] = useState(0);
  const recoveryGeneration = useRef(0);
  const choiceButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const additionalContentTrigger = useRef<HTMLButtonElement | null>(null);
  const additionalContentPanel = useRef<HTMLElement | null>(null);
  const additionalContentClose = useRef<HTMLButtonElement | null>(null);
  const replayExitButton = useRef<HTMLButtonElement | null>(null);
  const additionalContentWasOpen = useRef(false);
  const galleryOverviewTrigger = useRef<HTMLButtonElement | null>(null);
  const replayOverviewTrigger = useRef<HTMLButtonElement | null>(null);
  const musicOverviewTrigger = useRef<HTMLButtonElement | null>(null);
  const endingOverviewTrigger = useRef<HTMLButtonElement | null>(null);
  const additionalContentDetailBack = useRef<HTMLButtonElement | null>(null);
  const previousAdditionalContentView = useRef<"overview" | "gallery" | "replay" | "music" | "endings">("overview");
  const galleryPreviewTrigger = useRef<HTMLButtonElement | null>(null);
  const galleryPreviewClose = useRef<HTMLButtonElement | null>(null);
  const galleryPreviewWasOpen = useRef(false);
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const [, refreshAudioTransport] = useState(0);
  const audioActivity = useRef({ hostActivity, skipActive: skipMode !== null });
  audioActivity.current = { hostActivity, skipActive: skipMode !== null };
  const audioFailed = useCallback((element: HTMLAudioElement, error?: unknown) => {
    if (!element.isConnected || audioElements.current.get(element.dataset.audioBus ?? '') !== element) return;
    element.dataset.playerPlayback = 'error';
    element.dataset.audioFailureCode = String(element.error?.code ?? (error instanceof DOMException && error.name === 'NotSupportedError' ? 4 : 0));
    if (element.dataset.audioBus === 'voice') { element.dataset.voiceFailed = 'true'; setVoicePlaying(false); notifyPlayerAutoVoiceFailure(element); }
    const id = element.dataset.assetId;
    if (id) setMediaErrors(current => current.includes(id) ? current : [...current, id]);
    refreshAudioTransport(revision => revision + 1);
  }, []);
  const requestAudio = useCallback((element: HTMLAudioElement, reason: "resuming" | "resuming-after-skip" = "resuming") => {
    const isCurrent = () => element.isConnected && audioElements.current.get(element.dataset.audioBus ?? "") === element
      && audioActivity.current.hostActivity === "active" && !audioActivity.current.skipActive;
    if (!isCurrent()) return;
    requestPlayerAudioPlayback(element, isCurrent, () => refreshAudioTransport(revision => revision + 1), reason, error => audioFailed(element, error));
  }, [audioFailed]);
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const [, refreshVideoTransport] = useState(0);
  const requestVideo = useCallback((element: HTMLVideoElement) => {
    const isCurrent = () => element.isConnected && videoElement.current === element
      && audioActivity.current.hostActivity === "active" && !audioActivity.current.skipActive
      && element.dataset.shouldPlay === "true" && !element.ended && !element.error;
    if (!isCurrent()) return;
    requestPlayerMediaPlayback(element, isCurrent, () => refreshVideoTransport(revision => revision + 1));
    refreshVideoTransport(revision => revision + 1);
  }, []);
  const pointerInput = useRef<"pointer" | "touch">("pointer");
  const previousHostActivity = useRef(hostActivity);
  const previousSkipActive = useRef(false);
  const skipModeCurrent = useRef<"skipRead" | "skipAll" | null>(null);
  const skipAwaitingDispatch = useRef(false);
  const replayPlaybackReturn = useRef<{
    autoEnabled: boolean;
    autoPlayback: typeof autoPlayback;
    skipMode: "skipRead" | "skipAll" | null;
    skipActivation: WorldPlayerSkipActivationV1;
    skipSpeed: WorldPlayerSkipSpeedV1;
  } | null>(null);
  const additionalContentPlaybackReturn = useRef<typeof replayPlaybackReturn.current>(null);
  const saveContext = useRef({ projectId: project.manifest.projectId, store: saveStore, previewCapture });
  const saveListGeneration = useRef(0);
  const recoveryContext = useRef({ projectId: project.manifest.projectId, store: recoveryStore });
  const autoSavedSceneIdentities = useRef(new Set<string>());
  const consumedCheckpointCandidates = useRef(new WeakSet<object>());
  const lastRecoveryRuntimeStateHash = useRef<string | null>(null);
  saveContext.current = { projectId: project.manifest.projectId, store: saveStore, previewCapture };
  recoveryContext.current = { projectId: project.manifest.projectId, store: recoveryStore };
  const executableProjectHash = useMemo(() => semanticHash({ ...project, settings: createGalSettingsDocument() }), [project]);
  // The state initializer already built this exact project. Only replace it
  // after a real executable change, including during effect replay in dev.
  const initializedProjectHash = useRef(executableProjectHash);
  const sessionRunner=useMemo(()=>new ForegroundSessionRunner(),[executableProjectHash,saveStore,recoveryStore,previewCapture]);
  const recoverySessionRunner=useMemo(()=>new RecoverySessionRunner(),[executableProjectHash,recoveryStore]);
  useEffect(()=>{sessionRunner.resume();setSaveOperation("idle");setSaveMessage("请选择槽位");setBackgroundSaveFailure(null);setPendingRead(null);return()=>sessionRunner.cancelPending();},[sessionRunner]);
  useEffect(()=>()=>recoverySessionRunner.releaseIdle(),[recoverySessionRunner]);
  useEffect(()=>{if(hostActivity!=="active"){sessionRunner.releaseIdle();recoverySessionRunner.releaseIdle();}},[hostActivity,sessionRunner,recoverySessionRunner]);
  useEffect(()=>{if(memoryPressureRequest!==undefined){sessionRunner.releaseIdle();recoverySessionRunner.releaseIdle();}},[memoryPressureRequest,sessionRunner,recoverySessionRunner]);
  const snapshot = useMemo(() => createPlayerCoreSnapshotV1(state), [state]);
  const recoveryBuildCompatible = recoveryCandidate === null || recoveryCandidate.buildId === state.artifacts?.manifest.buildId || state.compatibleSaveBuildIds.includes(recoveryCandidate.buildId);
  const buildStopInstructionIds = state.artifacts?.playerPlaybackPolicy.stopInstructionIds ?? [];
  const saveCoordinator = useMemo(() => saveStore === undefined ? undefined : new WorldPlayerSaveWriteCoordinatorV1(saveStore), [saveStore]);
  const recoveryCoordinator = useMemo(() => recoveryStore === undefined ? undefined : new WorldPlayerRecoveryWriteCoordinatorV1(recoveryStore), [recoveryStore]);
  const content = snapshot.presentation;
  const layoutSurface = content.kind === "title" ? "title" : "reading";
  const layoutEligible = content.kind === "title" || content.kind === "dialogue" || content.kind === "narration";
  const { layout: componentLayout, probe: layoutProbe } = usePlayerLayout(layoutEligible ? skin?.layout?.[layoutSurface] : undefined, layoutSurface);
  const menuLayout = usePlayerPanelLayout(skin?.layout?.menu, "menu", readingMenuOpen);
  const saveLayout = usePlayerPanelLayout(skin?.layout?.save, "save", savePanelOpen);
  const historyLayout = usePlayerPanelLayout(skin?.layout?.history, "history", historyPanelOpen);
  const preferencesLayout = usePlayerPanelLayout(skin?.layout?.preferences, "preferences", preferencesOpen && infoView === "preferences");
  const creditsLayout = usePlayerPanelLayout(skin?.layout?.credits, "credits", preferencesOpen && infoView === "credits");
  const endingLayout = usePlayerPanelLayout(skin?.layout?.ending, "ending", content.kind === "ending");
  const additionalSurface: WebAdditionalLayoutSurface = additionalContentView === "overview" ? "additional" : additionalContentView;
  const overviewLayout = usePlayerPanelLayout(skin?.layout?.additional, "additional", additionalContentOpen && additionalSurface === "additional");
  const galleryLayout = usePlayerPanelLayout(skin?.layout?.gallery, "gallery", additionalContentOpen && additionalSurface === "gallery");
  const musicLayout = usePlayerPanelLayout(skin?.layout?.music, "music", additionalContentOpen && additionalSurface === "music");
  const replayLayout = usePlayerPanelLayout(skin?.layout?.replay, "replay", additionalContentOpen && additionalSurface === "replay");
  const endingsLayout = usePlayerPanelLayout(skin?.layout?.endings, "endings", additionalContentOpen && additionalSurface === "endings");
  const panelLayouts = { menu: menuLayout, save: saveLayout, history: historyLayout, preferences: preferencesLayout, credits: creditsLayout, ending: endingLayout, additional: overviewLayout, gallery: galleryLayout, music: musicLayout, replay: replayLayout, endings: endingsLayout };
  const additionalLayout = panelLayouts[additionalSurface];
  const saveBoundaryAllowed = worldPlayerAutoSaveAllowedV1(snapshot.status, snapshot.presentation.kind);
  const storyAdvance = useStoryAdvance(state, setState, sessionRunner, !editorPreview && hostActivity === 'active' && !artworkView && !preferencesOpen && !readingMenuOpen && !historyPanelOpen && !savePanelOpen && !additionalContentOpen && !autoEnabled && skipMode === null && memoryPressureStatus !== 'protecting' && (memoryPressureRequest === undefined || memoryPressureRequest.serial === handledMemorySerial));
  const quickSlot = saveSlots.find((slot) => slot.slotId === "quick-1");
  const latestSlot = saveSlots.slice().sort((a, b) => b.savedAtEpochMilliseconds - a.savedAtEpochMilliseconds || a.slotId.localeCompare(b.slotId))[0];
  const mediaSignature = useMemo(() => mediaAssets.map((asset) => `${asset.assetId}\0${asset.mimeType}\0${asset.url}`).join("\x01"), [mediaAssets]);
  const presentedTextId = content.kind === "dialogue" || content.kind === "narration" ? content.textId : null;
  const localizedMedia = useMemo(
    () => resolvePlayerLocalizedMediaV1(snapshot.localization.selectedLocale, snapshot.localization.sourceLocale, presentedTextId, project.assets.assets, mediaAssets),
    [mediaAssets, mediaSignature, presentedTextId, project.assets.assets, snapshot.localization.selectedLocale, snapshot.localization.sourceLocale]
  );
  const additionalContentSources = useMemo(
    () => new Map(localizedMedia.stageSources.map((source) => [source.assetId, source])),
    [localizedMedia.stageSources]
  );
  const stage = useMemo(
    () => derivePlayerStagePresentationV1(snapshot, localizedMedia.stageSources, settingsApplication.stage, settingsApplication.ui),
    [localizedMedia.stageSources, settingsApplication.stage, settingsApplication.ui, snapshot]
  );
  const stageImageStates = [
    ...(stage.background && (stage.background.atlas || stage.background.canvasSampling) ? [imageReadiness[`${imageGeneration}:background:${stage.background.assetId}`]] : []),
    ...stage.characters.filter(image => image.atlas || image.canvasSampling).map(image => imageReadiness[`${imageGeneration}:${image.slot}:${image.assetId}`])
  ];
  const stageImagesPending = stageImageStates.some(status => status !== "ready");
  const stageImageError = stageImageStates.some(status => status === "error" || status === "timeout" || status === "budget");
  const localizedVoice = localizedMedia.voice === null ? [] : [{
    ...localizedMedia.voice,
    bus: "voice",
    loop: false,
    volume: 1,
    status: "playing" as const
  }];
  const audibleTracks = [...stage.audio.filter((track) => !(localizedMedia.voiceMapped && track.bus === "voice")), ...localizedVoice];
  const appliedAudio = (silentReading ? [] : audibleTracks).map((track) => ({
    ...track,
    appliedVolume: galAudioGainV1(
      settingsApplication,
      (["bgm", "voice", "sfx", "ambient", "ui"].includes(track.bus) ? track.bus : "sfx") as GalAudioBusV1,
      track.volume,
      voicePlaying
    )
  }));
  const failedAudio = appliedAudio.filter(track => mediaErrors.includes(track.assetId) && audioElements.current.get(track.bus)?.dataset.playerPlayback === 'error');
  const currentMediaIds = new Set([stage.background?.assetId, ...stage.characters.map(item => item.assetId), stage.video?.assetId, ...failedAudio.map(track => track.assetId)]);
  const visibleMediaErrors = mediaErrors.filter(id => currentMediaIds.has(id));
  const visualMediaErrors = visibleMediaErrors.filter(id => !appliedAudio.some(track => track.assetId === id));
  const audioPlaybackSignature = appliedAudio.map(track => `${mediaGeneration}:${audioAttempts[track.bus] ?? 0}:${track.bus}:${track.assetId}:${track.status}`).join("|");
  const autoVoice = appliedAudio.find(track => track.bus === 'voice');
  // A retry or restored sound is a new owner even with the same narrative asset.
  // Do not restart reading time for unrelated music gain or transport renders.
  const autoVoiceIdentity = autoVoice ? `${mediaGeneration}:${audioAttempts.voice ?? 0}:${autoVoice.assetId}:${autoVoice.status}` : null;
  useEffect(() => {
    for (const element of audioElements.current.values()) {
      const shouldPlay = element.dataset.shouldPlay;
      if (shouldPlay !== element.dataset.observedShouldPlay) {
        element.dataset.observedShouldPlay = shouldPlay;
        if (shouldPlay === "true" && element.readyState >= 2 && element.paused && !element.ended) requestAudio(element);
      }
    }
  }, [audioPlaybackSignature, requestAudio]);
  const typography = useMemo(
    () => resolvePlayerTypographyV1(snapshot.localization.selectedLocale, project.assets.assets, mediaAssets, skin?.fonts.body),
    [mediaAssets, mediaSignature, project.assets.assets, snapshot.localization.selectedLocale, skin?.fonts.body]
  );
  const skinFonts = usePlayerSkinFonts(typography, project, mediaAssets, skin);
  const fontStatus = skinFonts.bodyStatus;
  const lastEffectOperation = snapshot.effects.operations.at(-1) ?? null;
  const speakerNames = useMemo(() => Object.fromEntries(project.characters.characters.flatMap((character) => {
    const id = typeof character.id === "string" ? character.id : undefined;
    const displayName = typeof character.displayName === "string" ? character.displayName : undefined;
    return id === undefined || displayName === undefined ? [] : [[id, displayName] as const];
  })), [project.characters.characters]);
  const presentedText = content.kind === "dialogue" || content.kind === "narration" ? content.text : "";
  const canViewArtwork = content.kind === "dialogue" || content.kind === "narration" || snapshot.status === "waiting-effect" && stage.video !== null;
  const textRevealDuration = useMemo(
    () => presentedText === "" || reducedReadingMotion ? 0 : galTextRevealDurationMillisecondsV1(settingsApplication, presentedText),
    [presentedText, settingsApplication, reducedReadingMotion]
  );
  const reading = useReadingSurface(`${project.manifest.projectId}:${presentedTextId}:${snapshot.history?.cursor}:${snapshot.localization.selectedLocale}:${presentedText}`, `${compactReading}:${readingMenuOpen}:${fontStatus}:${textReady}:${settingsApplication.text.fontScale}:${fullscreen.active}`);
  const readingRef = useCallback((element: HTMLButtonElement | null) => { reading.element.current = element; return releaseAnimationsOnDetach(element); }, [reading.element]);
  const closeHistoryPanel = useCallback(() => { setHistoryPanelOpen(false); queueMicrotask(() => {
    const trigger = historyDialogTrigger.current;
    if (trigger?.isConnected) trigger.focus();
    if (!trigger || document.activeElement !== trigger) readingMenuTrigger.current?.focus();
  }); }, []);
  const historyPanelElement = useRef<HTMLElement>(null);
  useEffect(() => { if (historyPanelOpen) historyPanelElement.current?.querySelector<HTMLButtonElement>("header button")?.focus(); }, [historyPanelOpen]);
  useEffect(() => { setReadingPace(initialPace()); setReadingMenuOpen(editorPreview?.initialPanel === 'menu'); setArtworkView(false); }, [project.manifest.projectId]);
  const closeReadingMenu = useCallback(() => { setReadingMenuOpen(false); queueMicrotask(() => {
    const trigger = readingMenuReturnTrigger.current;
    if (trigger?.isConnected) trigger.focus();
    if (!trigger || document.activeElement !== trigger) readingMenuTrigger.current?.focus();
  }); }, []);
  const closePreferences = useCallback(() => { setPreferencesOpen(false); queueMicrotask(() => {
    const trigger = infoTrigger.current;
    if (trigger?.isConnected) trigger.focus();
    if (!trigger || document.activeElement !== trigger) (content.kind === 'title' ? titlePreferencesTrigger.current : readingMenuTrigger.current)?.focus();
  }); }, [content.kind, infoView]);
  const openCredits = () => { infoTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; stopSkip(); setReadingMenuOpen(false); setInfoView('credits'); setPreferencesOpen(true); };
  const openSavePanel = useCallback((intent?: 'save' | 'load') => {
    saveDialogTrigger.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setSaveIntent(intent ?? (content.kind === 'title' ? 'load' : 'save')); setPendingRead(null);
    setReadingMenuOpen(false); setHistoryPanelOpen(false); setPendingOverwriteSlotId(null); setSavePanelOpen(true);
  }, [content.kind]);
  const closeSavePanel = useCallback(() => {
    setPendingRead(null); setSavePanelOpen(false);
    queueMicrotask(() => {
      const trigger = saveDialogTrigger.current;
      if (trigger?.isConnected) trigger.focus();
      if (!trigger || document.activeElement !== trigger) (content.kind === 'title' ? titleSaveTrigger.current : readingMenuTrigger.current)?.focus();
    });
  }, [content.kind]);
  const openPublicationBackup = () => {
    if (!saveStore || !saveCoordinator || saveOperation === 'busy' || hostActivity !== 'active') return false;
    stopSkip(); setAutoEnabled(false); setAutoPlayback('off'); setSaveView('backup'); openSavePanel('load'); return true;
  };
  const cancelRead = useCallback(() => { setPendingRead(null); queueMicrotask(() => readIntentTrigger.current?.focus()); }, []);
  useEffect(() => {
    if (!savePanelOpen || !saveDialog.current) return;
    const dialog = saveDialog.current;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    return () => { if (dialog.open && typeof dialog.close === 'function') dialog.close(); };
  }, [savePanelOpen]);
  useEffect(() => {
    if (!saveFeedback) return;
    const timer = window.setTimeout(() => setSaveFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [saveFeedback]);
  useEffect(() => { if (readingMenuOpen) readingMenu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, [readingMenuOpen]);
  useEffect(() => { if (preferencesOpen) preferencesPanel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, [preferencesOpen]);
  const canonicalPlaybackPolicy = validateWorldPlayerPlaybackPolicyV1(playbackPolicy) ? playbackPolicy : DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1;
  const skipActive = skipMode !== null;
  const playbackOwnership = useMemo(() => ({}), [autoEnabled, skipMode, skipActivation, skipSpeed, canonicalPlaybackPolicy, buildStopInstructionIds, readingPace, autoVoiceIdentity, mediaGeneration]);
  const playbackAdvance = usePlaybackAdvance(state, setState, sessionRunner,
    (autoEnabled || skipActive) && hostActivity === 'active' && !artworkView && !preferencesOpen && !readingMenuOpen && !historyPanelOpen && !savePanelOpen && !additionalContentOpen && !stageImagesPending &&
    (!autoEnabled || textReady && !reading.unread) && memoryPressureStatus !== 'protecting' && (memoryPressureRequest === undefined || memoryPressureRequest.serial === handledMemorySerial), playbackOwnership, !editorPreview);

  useEffect(() => {
    setVoicePlaying(false);
  }, [localizedMedia.voice?.assetId]);

  const stopSkip = useCallback(() => {
    playbackAdvance.cancel();
    skipModeCurrent.current = null;
    setSkipMode(null);
  }, [playbackAdvance.cancel]);
  useEffect(() => {
    if (!playbackAdvance.error) return;
    skipModeCurrent.current = null; setSkipMode(null); setAutoEnabled(false); setAutoPlayback('stopped');
  }, [playbackAdvance.error]);
  useEffect(() => { if (storyAdvance.busy || storyAdvance.error || playbackAdvance.busy || playbackAdvance.error) setSaveFeedback(null); }, [storyAdvance.busy, storyAdvance.error, playbackAdvance.busy, playbackAdvance.error]);
  const startSkip = useCallback((mode: "skipRead" | "skipAll") => {
    setReadingMenuOpen(false);
    skipAwaitingDispatch.current = true;
    skipModeCurrent.current = mode;
    setVideoPolicyStopReason("none");
    setAutoEnabled(false);
    setAutoPlayback("off");
    setSkipMode(mode);
  }, []);

  const restoreReading = useCallback(() => { setArtworkView(false); queueMicrotask(() => (reading.element.current ?? readingMenuTrigger.current)?.focus()); }, [reading.element]);
  const showArtwork = useCallback(() => { stopSkip(); setAutoEnabled(false); setAutoPlayback("off"); setReadingMenuOpen(false); setArtworkView(true); }, [stopSkip]);

  const restorePlaybackControls = useCallback((playback: NonNullable<typeof replayPlaybackReturn.current>) => {
    setAutoEnabled(playback.autoEnabled);
    setAutoPlayback(playback.autoPlayback);
    setSkipActivation(playback.skipActivation);
    setSkipSpeed(playback.skipSpeed);
    skipModeCurrent.current = playback.skipMode;
    setSkipMode(playback.skipMode);
  }, []);

  const openAdditionalContent = useCallback(() => {
    additionalContentReturnTrigger.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setReadingMenuOpen(false);
    additionalContentPlaybackReturn.current = { autoEnabled, autoPlayback, skipMode, skipActivation, skipSpeed };
    setAutoEnabled(false);
    setAutoPlayback("off");
    stopSkip();
    setHistoryPanelOpen(false);
    setSavePanelOpen(false);
    setAdditionalContentOpen(true);
  }, [autoEnabled, autoPlayback, skipActivation, skipMode, skipSpeed, stopSkip]);

  const closeAdditionalContent = useCallback(() => {
    setAdditionalContentOpen(false);
    const playback = additionalContentPlaybackReturn.current;
    additionalContentPlaybackReturn.current = null;
    if (playback !== null) restorePlaybackControls(playback);
  }, [restorePlaybackControls]);

  const enterSceneReplay = useCallback((replayId: string) => {
    const next = dispatchPlayerCoreIntentV1(state, project, { kind: "enter-scene-replay", replayId });
    setState(next);
    if (next.replaySession === null) return;
    replayPlaybackReturn.current = additionalContentPlaybackReturn.current ?? { autoEnabled, autoPlayback, skipMode, skipActivation, skipSpeed };
    additionalContentPlaybackReturn.current = null;
    setAutoEnabled(false);
    setAutoPlayback("off");
    stopSkip();
    setHistoryPanelOpen(false);
    setSavePanelOpen(false);
    setAdditionalContentOpen(false);
    setSaveFeedback(null);
    setMediaErrors([]);
  }, [autoEnabled, autoPlayback, project, skipActivation, skipMode, skipSpeed, state, stopSkip]);

  const exitSceneReplay = useCallback(() => {
    if (state.replaySession === null) return;
    setState((current) => dispatchPlayerCoreIntentV1(current, project, { kind: "exit-scene-replay" }));
    const playback = replayPlaybackReturn.current;
    replayPlaybackReturn.current = null;
    if (playback !== null) {
      restorePlaybackControls(playback);
    }
    setMediaErrors([]);
    setTimeout(() => (titleAdditionalContentTrigger.current ?? readingMenuTrigger.current ?? additionalContentTrigger.current)?.focus(), 0);
  }, [project, restorePlaybackControls, state.replaySession]);

  const refreshSaveSlots = useCallback(async (reportFailure = true) => {
    if (saveStore === undefined) return;
    const projectId = project.manifest.projectId;
    const generation = ++saveListGeneration.current;
    try {
      const slots = await listWorldPlayerSaveSummariesV3(saveStore, projectId);
      if (generation !== saveListGeneration.current || saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      setSaveSlots(slots);
    } catch {
      if (generation !== saveListGeneration.current || saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      if (reportFailure) { setSaveOperation("error"); setSaveMessage("存档存储不可用"); }
    }
  }, [project.manifest.projectId, saveStore]);

  useEffect(() => { if (savePanelOpen) void refreshSaveSlots(); }, [savePanelOpen, refreshSaveSlots]);

  const previewPending = useRef(0);
  const previewControllers = useRef(new Set<AbortController>());
  useEffect(() => () => { for (const controller of previewControllers.current) controller.abort(); }, [sessionRunner]);
  const captureSavePreview = useCallback(async (projectId: string, sceneId: string, runtimeStateHash: string | null): Promise<{ readonly metadata: WorldPlayerSavePreviewV2; readonly blob?: Blob }> => {
    if (saveStore?.previewStorage === 'unavailable') return { metadata: { status: 'unavailable', reason: 'capture-unavailable' } };
    if (previewCapture === undefined && platform !== "web" || runtimeStateHash === null || fullscreen.element.current?.dataset.runtimeStateHash !== runtimeStateHash || previewPending.current >= 2) return { metadata: { status: "unavailable", reason: "capture-unavailable" } };
    previewPending.current++;
    const controller = new AbortController();
    previewControllers.current.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request: WorldPlayerPreviewCaptureRequestV1 = {
        projectId,
        sceneId,
        runtimeStateHash,
        maximumWidth: WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_WIDTH,
        maximumHeight: WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_HEIGHT,
        maximumBytes: WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES,
        mimeTypes: ["image/webp", "image/png"]
      };
      const pending = previewCapture ? previewCapture.capture(request) : captureBrowserSavePreview(fullscreen.element.current, request, skinFonts.captureFonts, controller.signal);
      const captured = await Promise.race([pending, new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, 3000); })]);
      if (captured === null) return { metadata: { status: "unavailable", reason: "capture-unavailable" } };
      const valid = (captured.blob.type === "image/webp" || captured.blob.type === "image/png") && captured.blob.size > 0 && captured.blob.size <= WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES &&
        Number.isSafeInteger(captured.width) && captured.width > 0 && captured.width <= WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_WIDTH &&
        Number.isSafeInteger(captured.height) && captured.height > 0 && captured.height <= WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_HEIGHT;
      if (!valid) return { metadata: { status: "unavailable", reason: "capture-invalid" } };
      return {
        metadata: { status: "available", mimeType: captured.blob.type, width: captured.width, height: captured.height, byteLength: captured.blob.size, sha256: await worldPlayerSavePreviewSha256V1(captured.blob) },
        blob: captured.blob
      };
    } catch {
      return { metadata: { status: "unavailable", reason: "capture-failed" } };
    } finally { clearTimeout(timer); controller.abort(); previewControllers.current.delete(controller); previewPending.current--; }
  }, [previewCapture, platform, fullscreen.element, skinFonts.captureFonts, saveStore]);

  const captureCurrentSlot = useCallback(async (kind: "manual" | "auto" | "quick", slotId: string, capturedState = state, capturedSnapshot = snapshot, prepared = { preview: captureSavePreview(project.manifest.projectId, capturedState.runtimeState?.cursor.sceneId ?? "", capturedSnapshot.runtimeStateHash), savedAt: now() }) => {
    if (capturedSnapshot.identities.buildId === null || capturedSnapshot.runtimeStateHash === null || capturedState.runtimeState === null) throw new Error("WORLD_PLAYER_SAVE_NOT_READY");
    if(capturedState.projectId!==project.manifest.projectId)throw new Error("WORLD_PLAYER_SAVE_NOT_READY");
    const {result:created}=await sessionRunner.run({kind:"save",source:{replaySession:capturedState.replaySession,artifacts:capturedState.artifacts,historySession:capturedState.historySession,runtimeState:capturedState.runtimeState}});
    const projectId = project.manifest.projectId;
      const sceneId = capturedState.runtimeState.cursor.sceneId;
      const sceneIndex = project.scenes.findIndex((scene) => scene.id === sceneId);
      const scene = project.scenes[sceneIndex];
      if (scene === undefined) throw new Error("WORLD_PLAYER_SAVE_SCENE_MISSING");
      const scenePath = project.chapters.flatMap((chapter) => chapter.scenePaths)[sceneIndex];
      const chapter = scenePath === undefined ? undefined : project.chapters.find((candidate) => candidate.scenePaths.includes(scenePath));
      const captured = await prepared.preview;
      const slot = createWorldPlayerSaveSlotV3({
        kind,
        slotId,
        projectId,
        buildId: capturedState.runtimeState.buildId,
        savedAtEpochMilliseconds: prepared.savedAt,
        title: capturedSnapshot.title,
        chapterId: chapter?.id ?? null,
        chapterTitle: chapter?.title ?? null,
        sceneId,
        sceneTitle: scene.title,
        route: null,
        customMetadata: {},
        ...(saveReadingExcerpt(capturedSnapshot.presentation) ? { readingExcerpt: saveReadingExcerpt(capturedSnapshot.presentation)! } : {}),
        preview: captured.metadata,
        presentationKind: capturedSnapshot.presentation.kind,
        runtimeStateHash: capturedSnapshot.runtimeStateHash,
        sessionArtifactHash: created.artifactHash,
        serializedSessionSave: created.serialized,
        checkpointStepId: null
      });
      return { slot, ...(captured.blob === undefined ? {} : { preview: captured.blob }) };
  }, [captureSavePreview, now, project, snapshot, state,sessionRunner]);

  const persistCurrentSlot = useCallback(async (kind: "manual" | "auto" | "quick", slotId: string, capturedState = state, capturedSnapshot = snapshot, prepared?: { preview: ReturnType<typeof captureSavePreview>; savedAt: number }) => {
    if (saveStore === undefined) throw new Error("WORLD_PLAYER_SAVE_NOT_READY");
    const captured = await captureCurrentSlot(kind, slotId, capturedState, capturedSnapshot, prepared);
    if(!sessionRunner.active||saveContext.current.projectId!==captured.slot.projectId||saveContext.current.store!==saveStore)throw new DOMException("Save scope changed","AbortError");
    await saveStore.write(captured.slot, captured.preview);
    return saveStore.previewStorage === 'unavailable' ? 'unavailable' : captured.slot.preview.status;
  }, [captureCurrentSlot, saveStore, snapshot, state,sessionRunner]);

  const saveToSlot = useCallback(async (kind: "manual" | "quick", slotId: string) => {
    storyAdvance.cancel();
    if (saveCoordinator === undefined) return;
    setSaveOperation("busy");
    setSaveMessage("正在写入…");
    setSaveFeedback(null);
    const projectId = project.manifest.projectId;
    const prepared = { preview: captureSavePreview(projectId, state.runtimeState?.cursor.sceneId ?? "", snapshot.runtimeStateHash), savedAt: now() };
    try {
      const previewStatus = await saveCoordinator.writeFixed(() => persistCurrentSlot(kind, slotId, state, snapshot, prepared));
      if (!sessionRunner.active || saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore || saveContext.current.previewCapture !== previewCapture) return;
      await refreshSaveSlots();
      if(!sessionRunner.active||saveContext.current.projectId!==projectId||saveContext.current.store!==saveStore)return;
      setPendingOverwriteSlotId(null);
      setSaveOperation("saved");
      setSaveMessage(`${playerSaveLabel(slotId)}已保存${previewStatus === "available" ? "（含截图）" : "（预览不可用）"}`);
      setSaveFeedback((kind === 'quick' ? '快速存档已保存' : '手动存档已保存') + (saveStore?.previewStorage === 'unavailable' ? '（截图不可用）' : ''));
      setBackgroundSaveFailure(null);
    } catch {
      if(!sessionRunner.active||saveContext.current.projectId!==projectId||saveContext.current.store!==saveStore)return;
      setSaveOperation("error");
      setSaveMessage("写入失败，原存档保持不变");
      if (kind === 'quick') setSaveView('quick');
      openSavePanel();
    }
  }, [persistCurrentSlot, previewCapture, project.manifest.projectId, refreshSaveSlots, saveCoordinator, saveStore, openSavePanel,sessionRunner, captureSavePreview, now, state, snapshot]);

  const requestSaveToSlot = useCallback((slotId: string, occupied: boolean) => {
    if (occupied && pendingOverwriteSlotId !== slotId) {
      setPendingOverwriteSlotId(slotId);
      setSaveOperation("idle");
      setSaveMessage(`${playerSaveLabel(slotId)}已有存档，请再次确认覆盖`);
      return;
    }
    void saveToSlot("manual", slotId);
  }, [pendingOverwriteSlotId, saveToSlot]);

  const loadFromSlot = useCallback(async (slotId: string, expectedArtifactHash?: string) => {
    storyAdvance.cancel();
    if (saveStore === undefined) return;
    setSaveOperation("busy");
    setSaveMessage("正在校验…");
    const projectId = project.manifest.projectId;
    try {
      const slot = await saveStore.read(projectId, slotId);
      if (!sessionRunner.active || saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      if (slot === null) throw new Error("WORLD_PLAYER_SAVE_MISSING");
      if (expectedArtifactHash !== undefined && slot.sessionArtifactHash !== expectedArtifactHash) throw new Error("WORLD_PLAYER_SAVE_CHANGED");
      const {result:loaded}=await sessionRunner.run({kind:"load",state,serialized:slot.serializedSessionSave});
      if(!sessionRunner.active||saveContext.current.projectId!==projectId||saveContext.current.store!==saveStore)return;
      if (!loaded.ok && loaded.diagnostics[0]?.code === "RUNTIME_SAVE_BUILD_MISMATCH") throw new Error("WORLD_PLAYER_SAVE_VERSION_UNVERIFIED");
      if (!loaded.ok || loaded.artifactHash !== slot.sessionArtifactHash) throw new Error("WORLD_PLAYER_SAVE_REJECTED");
      const loadedSnapshot = createPlayerCoreSnapshotV1(loaded.state);
      if (slot.projectId !== projectId || slot.buildId !== loaded.savedBuildId || slot.runtimeStateHash !== loaded.savedRuntimeStateHash ||
          slot.sceneId !== loaded.savedSceneId || slot.presentationKind !== loadedSnapshot.presentation.kind || slot.title !== loadedSnapshot.title) {
        throw new Error("WORLD_PLAYER_SAVE_METADATA_MISMATCH");
      }
      if (loadedSnapshot.identities.buildId !== null) autoSavedSceneIdentities.current.add(worldPlayerSaveSceneIdentityV1(loadedSnapshot.identities.buildId, slot.sceneId));
      // An explicit slot load supersedes an in-flight startup scan or old recovery prompt.
      recoveryGeneration.current++;
      recoveryWritePending.current?.controller.abort();
      // A cancelled computation may never have reached durable storage, even
      // when the loaded hash equals it. Re-establish protection after loading.
      lastRecoveryRuntimeStateHash.current = null;
      setRecoveryCandidate(null);
      setRecoveryOperation(recoveryStore === undefined ? "idle" : "loaded");
      setRecoveryErrorAction(null);
      setNewStoryConfirmation(false);
      setAutoEnabled(false); setAutoPlayback("off"); stopSkip(); setArtworkView(false); deferredMenuCompletion.current = null; setPendingRead(null);
      setState(loaded.state);
      setSaveOperation("loaded");
      setSaveMessage(`${playerSaveLabel(slotId)}已读取`);
      setSavePanelOpen(false);
      setSaveFeedback(loaded.compatibility === "verified-previous" ? '已读取核对过的旧版存档，可以继续故事' : '存档已读取，继续当前故事');
    } catch (error) {
      if (!sessionRunner.active || saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      try { await refreshSaveSlots(); } catch { /* Keep the load error and the current story. */ }
      if (saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      setSaveOperation("error");
      setSaveMessage(error instanceof Error && error.message === "WORLD_PLAYER_SAVE_VERSION_UNVERIFIED"
        ? "这个存档来自尚未核对的游戏版本。当前进度和原存档保持不变，请使用原版继续或联系作品作者。"
        : error instanceof Error && error.message === "WORLD_PLAYER_SAVE_CHANGED"
          ? "这个槽位已经更新，请重新核对后读取，或把备份重新导入空槽位。当前进度保持不变。"
          : error instanceof ForegroundSessionError ? "后台存档校验未完成，请重试读取。当前进度和原存档保持不变。" : "存档损坏或与当前构建不兼容");
      if (slotId.startsWith("quick-")) setSaveView("quick");
      openSavePanel("load");
    }
  }, [project.manifest.projectId, recoveryStore, saveStore, state, openSavePanel, stopSkip, refreshSaveSlots,sessionRunner]);

  const requestLoadFromSlot = useCallback((slotId: string, expectedArtifactHash?: string) => {
    const slot = saveSlots.find(candidate => candidate.slotId === slotId), expected = expectedArtifactHash ?? slot?.sessionArtifactHash;
    if (content.kind === 'title') { void loadFromSlot(slotId, expected); return; }
    openSavePanel('load');
    setSaveView(slot?.kind ?? 'manual');
    setPendingRead({ slotId, ...(expected !== undefined ? { expectedArtifactHash: expected } : {}), slot });
  }, [saveSlots, content.kind, loadFromSlot, openSavePanel]);

  const restoreRecovery = useCallback(async () => {
    storyAdvance.cancel();
    if (recoveryCandidate === null || recoveryStore === undefined) return;
    setRecoveryOperation("scanning");
    setRecoveryMessage("正在校验恢复记录…");
    const generation=++recoveryGeneration.current;
    try {
      const {result:loaded}=await sessionRunner.run({kind:"load",state,serialized:recoveryCandidate.serializedSessionSave});
      if(!sessionRunner.active||generation!==recoveryGeneration.current)return;
      if (!loaded.ok || loaded.artifactHash !== recoveryCandidate.sessionArtifactHash) throw new Error("WORLD_PLAYER_RECOVERY_REJECTED");
      const loadedSnapshot = createPlayerCoreSnapshotV1(loaded.state);
      if (recoveryCandidate.projectId !== project.manifest.projectId || recoveryCandidate.buildId !== loaded.savedBuildId ||
          recoveryCandidate.runtimeStateHash !== loaded.savedRuntimeStateHash || recoveryCandidate.sceneId !== loaded.savedSceneId ||
          recoveryCandidate.presentationKind !== loadedSnapshot.presentation.kind || recoveryCandidate.title !== loadedSnapshot.title) {
        throw new Error("WORLD_PLAYER_RECOVERY_METADATA_MISMATCH");
      }
      if (recoveryContext.current.projectId !== project.manifest.projectId || recoveryContext.current.store !== recoveryStore) return;
      lastRecoveryRuntimeStateHash.current = recoveryCandidate.runtimeStateHash;
      if (loadedSnapshot.identities.buildId !== null) autoSavedSceneIdentities.current.add(worldPlayerSaveSceneIdentityV1(loadedSnapshot.identities.buildId, recoveryCandidate.sceneId));
      setState(loaded.state);
      setRecoveryCandidate(null);
      setRecoveryOperation("loaded");
      setRecoveryMessage(loaded.compatibility === "verified-previous" ? "已恢复核对过的旧版进度" : "已恢复上次安全进度");
      setRecoveryErrorAction(null);
    } catch(error) {
      if(!sessionRunner.active||generation!==recoveryGeneration.current)return;
      setRecoveryOperation("error");
      setRecoveryMessage(error instanceof ForegroundSessionError?"后台恢复校验未完成，可以重试；原恢复点和正式存档保持不变。":"恢复记录损坏或与当前构建不兼容，正式存档未受影响");
      setRecoveryErrorAction(error instanceof ForegroundSessionError?"load":"clear");
    }
  }, [project.manifest.projectId, recoveryCandidate, recoveryStore, state,sessionRunner]);

  const clearRecovery = useCallback(async () => {
    if (recoveryCoordinator === undefined || recoveryStore === undefined) return false;
    const projectId = project.manifest.projectId;
    const generation = ++recoveryGeneration.current;
    recoveryWritePending.current?.controller.abort();
    setRecoveryOperation("scanning");
    try {
      await recoveryCoordinator.clear(projectId);
      if (generation !== recoveryGeneration.current || recoveryContext.current.projectId !== projectId || recoveryContext.current.store !== recoveryStore) return false;
      setRecoveryCandidate(null);
      setRecoveryOperation("idle");
      setRecoveryMessage("恢复记录已清除");
      setRecoveryErrorAction(null);
      lastRecoveryRuntimeStateHash.current = null;
      return true;
    } catch {
      if (generation !== recoveryGeneration.current || recoveryContext.current.projectId !== projectId || recoveryContext.current.store !== recoveryStore) return false;
      setRecoveryOperation("error");
      setRecoveryMessage("恢复记录无法清除，未修改正式存档");
      setRecoveryErrorAction("retry");
      return false;
    }
  }, [project.manifest.projectId, recoveryCoordinator, recoveryStore]);

  const applyIntent = useCallback((intent: PlayerCoreIntentV1, source: PlayerInputSource) => {
    if (intent.kind !== 'primary') storyAdvance.cancel();
    else if (storyAdvance.isPending()) return;
    // Pointer callbacks and already queued media completions must honor the same
    // host ceiling as keyboard/Auto, including the final event before pagehide.
    if (audioActivity.current.hostActivity !== 'active') return;
    if (content.kind === 'title' && saveOperation === 'busy') return;
    if (source === 'system' && intent.kind === 'primary' && (artworkView || preferencesOpen || readingMenuOpen || historyPanelOpen || savePanelOpen || additionalContentOpen)) {
      deferredMenuCompletion.current = { stateHash: snapshot.runtimeStateHash, hostHash: snapshot.runtimeHostSnapshotHash };
      return;
    }
    if (artworkView || preferencesOpen) return;
    if ((savePanelOpen || historyPanelOpen || additionalContentOpen) && (intent.kind === 'primary' || intent.kind === 'select-choice')) return;
    if (readingMenuOpen) {
      if (intent.kind === 'back' || intent.kind === 'forward') setReadingMenuOpen(false);
      else return;
    }
    if (content.kind === "title" && intent.kind === "primary" && recoveryStore !== undefined) {
      if (recoveryOperation === "scanning") return;
      if (recoveryCandidate !== null || recoveryOperation === "error") {
        setNewStoryConfirmation(true);
        return;
      }
    }
    setLastInputSource(source);
    if ((intent.kind === "primary" || intent.kind === "select-choice")
      && source !== "lifecycle" && source !== "system"
      && !galAdvanceInputEnabledV1(settingsApplication, source)) {
      setLastInputAccepted(false);
      return;
    }
    if (intent.kind === 'primary' && playbackAdvance.busy && source !== 'system' && source !== 'lifecycle') {
      // A key/gamepad takeover stops the uncommitted batch first, just like
      // the visible stop button. Do not synchronously repeat a long advance.
      playbackAdvance.cancel(); stopSkip(); setAutoEnabled(false); setAutoPlayback('off'); setLastInputAccepted(false); return;
    }
    // Reading another screen is not a request to leave Auto or change story.
    // Check input permission first; an ignored input must not change its mode.
    if (intent.kind === 'primary' && (content.kind === 'dialogue' || content.kind === 'narration') && textReady && reading.nextPage()) {
      stopSkip(); setLastInputAccepted(false); return;
    }
    if (source !== "system") {
      setAutoEnabled(false);
      setAutoPlayback("off");
      stopSkip();
    }
    if (intent.kind === "primary" && (content.kind === "dialogue" || content.kind === "narration") && !textReady) {
      setTextReady(true);
      setLastInputAccepted(false);
      return;
    }
    if (intent.kind === "primary" && settingsApplication.advance.waitForVoice && voicePlaying) {
      setLastInputAccepted(false);
      return;
    }
    setLastInputAccepted(true);
    if (intent.kind === 'primary' && source !== 'system' && source !== 'lifecycle' && storyAdvance.tryStart()) return;
    setState((current) => dispatchPlayerCoreIntentV1(current, project, intent));
  }, [artworkView, content.kind, project, recoveryCandidate, recoveryOperation, recoveryStore, saveOperation, settingsApplication, stopSkip, textReady, voicePlaying, preferencesOpen, readingMenuOpen, historyPanelOpen, savePanelOpen, additionalContentOpen, snapshot.runtimeStateHash, snapshot.runtimeHostSnapshotHash, reading, playbackAdvance.busy, playbackAdvance.cancel]);
  useEffect(() => {
    if (hostActivity !== 'active' || artworkView || preferencesOpen || readingMenuOpen || historyPanelOpen || savePanelOpen || additionalContentOpen || !deferredMenuCompletion.current) return;
    const completion = deferredMenuCompletion.current;
    deferredMenuCompletion.current = null;
    // A load or history navigation must not complete a different pending effect.
    if (snapshot.status === 'waiting-effect' && completion.stateHash === snapshot.runtimeStateHash && completion.hostHash === snapshot.runtimeHostSnapshotHash) applyIntent({ kind: 'primary' }, 'system');
  }, [artworkView, hostActivity, preferencesOpen, readingMenuOpen, historyPanelOpen, savePanelOpen, additionalContentOpen, snapshot.status, snapshot.runtimeStateHash, snapshot.runtimeHostSnapshotHash, applyIntent]);

  useEffect(() => {
    if (initializedProjectHash.current === executableProjectHash) return;
    initializedProjectHash.current = executableProjectHash;
    autoSavedSceneIdentities.current.clear();
    consumedCheckpointCandidates.current = new WeakSet();
    lastRecoveryRuntimeStateHash.current = null;
    replayPlaybackReturn.current = null;
    additionalContentPlaybackReturn.current = null;
    setState(createLocalizedPlayerCore(project, settingsApplication.history, !editorPreview));
    setReadingMenuOpen(false); setArtworkView(false); setPendingRead(null); deferredMenuCompletion.current = null;
    setPreferencesOpen(false);
    setMediaErrors([]);
    setMediaGeneration(0);
    setSilentReading(false); setAudioAttempts({});
    setSelectedChoiceIndex(0);
    setLastInputSource("lifecycle");
    setLastInputAccepted(true);
    setVoicePlaying(false);
    setAutoEnabled(false);
    setAutoPlayback("off");
    setHistoryPanelOpen(false);
    setSkipMode(null);
    setSkipActivation(canonicalPlaybackPolicy.skip.defaultActivation);
    setSkipSpeed(canonicalPlaybackPolicy.skip.defaultSpeed);
  }, [executableProjectHash]);

  useEffect(() => {
    setState((current) => configurePlayerCoreHistoryPolicyV1(current, settingsApplication.history));
  }, [settingsApplication.history]);

  useEffect(() => {
    const projectId = project.manifest.projectId;
    const generation = ++recoveryGeneration.current;
    setNewStoryConfirmation(false);
    setRecoveryCandidate(null);
    setRecoveryErrorAction(null);
    if (recoveryStore === undefined) {
      setRecoveryOperation("idle");
      setRecoveryMessage("恢复存储不可用");
      return;
    }
    setRecoveryOperation("scanning");
    setRecoveryMessage("正在检查恢复记录…");
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled || generation !== recoveryGeneration.current) return;
      settled = true;
      setRecoveryOperation("error");
      setRecoveryMessage("恢复检查超时，可重新检查或确认开始新故事；旧记录尚未修改");
      setRecoveryErrorAction("clear");
    }, 8000);
    void recoveryStore.read(projectId).then((candidate) => {
      if (settled || generation !== recoveryGeneration.current || recoveryContext.current.projectId !== projectId || recoveryContext.current.store !== recoveryStore) return;
      settled = true;
      window.clearTimeout(timeout);
      setRecoveryCandidate(candidate);
      setRecoveryOperation(candidate === null ? "idle" : "available");
      setRecoveryMessage(candidate === null ? "没有待恢复进度" : "发现上次未完成的安全进度");
    }).catch(() => {
      if (settled || generation !== recoveryGeneration.current) return;
      settled = true;
      window.clearTimeout(timeout);
      if (recoveryContext.current.projectId !== projectId || recoveryContext.current.store !== recoveryStore) return;
      setRecoveryOperation("error");
      setRecoveryMessage("恢复记录损坏，已与正式存档隔离");
      setRecoveryErrorAction("clear");
    });
    return () => { recoveryGeneration.current++; window.clearTimeout(timeout); };
  }, [project.manifest.projectId, recoveryStore, recoveryScanAttempt]);

  useEffect(() => {
    setSaveSlots([]); setPendingRead(null);
    setSavePage(0);
    setSaveView("manual");
    setPendingOverwriteSlotId(null);
    setSaveOperation("idle");
    setSaveMessage("请选择槽位");
    setSaveFeedback(null);
    void refreshSaveSlots();
  }, [refreshSaveSlots]);

  useEffect(() => {
    if (snapshot.sceneReplay.active || saveCoordinator === undefined || saveStore === undefined || hostActivity !== "active" || snapshot.identities.buildId === null || state.runtimeState === null ||
        !worldPlayerAutoSaveAllowedV1(snapshot.status, snapshot.presentation.kind)) return;
    const sceneIdentity = worldPlayerSaveSceneIdentityV1(snapshot.identities.buildId, state.runtimeState.cursor.sceneId);
    if (autoSavedSceneIdentities.current.has(sceneIdentity)) return;
    autoSavedSceneIdentities.current.add(sceneIdentity);
    const capturedState = state;
    const capturedSnapshot = snapshot;
    const prepared = { preview: captureSavePreview(project.manifest.projectId, state.runtimeState.cursor.sceneId, snapshot.runtimeStateHash), savedAt: now() };
    void saveCoordinator.writeAuto(project.manifest.projectId, sceneIdentity, async (slotId) => { await persistCurrentSlot("auto", slotId, capturedState, capturedSnapshot, prepared); }).then(async (result) => {
      if (!sessionRunner.active || saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) return;
      await refreshSaveSlots(false);
      if(!sessionRunner.active)return;
      if (result.status === "written") {
        setSaveFeedback("进度已自动保存");
        setBackgroundSaveFailure(current => current?.kind === "auto" ? null : current);
      }
    }).catch(() => {
      if (!sessionRunner.active || saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) return;
      setBackgroundSaveFailure({ kind: "auto", message: "自动保存失败，原存档保持不变。可以手动保存当前进度，或继续阅读。" });
    });
  }, [hostActivity, persistCurrentSlot, project.manifest.projectId, refreshSaveSlots, saveCoordinator, saveStore, snapshot, state, captureSavePreview, now]);

  useEffect(() => {
    if (snapshot.sceneReplay.active || saveCoordinator === undefined || saveStore === undefined || hostActivity !== "active" || snapshot.identities.buildId === null) return;
    for (const candidate of [...state.checkpointSaveCandidates, ...state.deferredCheckpointSaveCandidates]) {
      const buildId = candidate.buildId;
      if (consumedCheckpointCandidates.current.has(candidate)) continue;
      consumedCheckpointCandidates.current.add(candidate);
      void saveCoordinator.writeCheckpoint(project.manifest.projectId, buildId, candidate.stepId, async (slotId) => {
        const assertOwner = () => { if (!sessionRunner.active || saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) throw new DOMException("Checkpoint scope closed", "AbortError"); };
        assertOwner();
        const created = "historySession" in candidate
          ? (await sessionRunner.run({ kind: "save", source: { artifacts: state.artifacts, historySession: candidate.historySession, runtimeState: candidate.historySession.checkpoints[candidate.historySession.cursor]!.state, replaySession: null } })).result
          : { ok: true as const, serialized: candidate.serializedSessionSave, artifactHash: candidate.artifactHash };
        assertOwner();
        const sceneIndex = project.scenes.findIndex((scene) => scene.id === candidate.sceneId);
        const scene = project.scenes[sceneIndex];
        if (scene === undefined) throw new Error("WORLD_PLAYER_SAVE_SCENE_MISSING");
        const scenePath = project.chapters.flatMap((chapter) => chapter.scenePaths)[sceneIndex];
        const chapter = scenePath === undefined ? undefined : project.chapters.find((item) => item.scenePaths.includes(scenePath));
        // Checkpoints are non-visible interpreter boundaries. A later sentence
        // must never be attached to that older exact session.
        const captured = { metadata: { status: "unavailable", reason: "capture-unavailable" } as WorldPlayerSavePreviewV2, blob: undefined };
        assertOwner();
        await saveStore.write(createWorldPlayerSaveSlotV3({
          kind: "checkpoint", slotId, projectId: project.manifest.projectId, buildId, savedAtEpochMilliseconds: now(), title: snapshot.title,
          chapterId: chapter?.id ?? null, chapterTitle: chapter?.title ?? null, sceneId: candidate.sceneId, sceneTitle: scene.title,
          route: null, customMetadata: {}, preview: captured.metadata, presentationKind: snapshot.presentation.kind,
          runtimeStateHash: candidate.runtimeStateHash, sessionArtifactHash: created.artifactHash,
          serializedSessionSave: created.serialized, checkpointStepId: candidate.stepId
        }), captured.blob);
      }).then(async () => {
        if (!sessionRunner.active || saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) return;
        await refreshSaveSlots(false);
        if (!sessionRunner.active) return;
        setSaveFeedback("剧情检查点已保存");
        setBackgroundSaveFailure(current => current?.kind === "checkpoint" ? null : current);
      }).catch(() => {
        if (!sessionRunner.active || saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) return;
        setBackgroundSaveFailure({ kind: "checkpoint", message: "剧情检查点保存失败，旧检查点保持不变。可以手动保存当前进度，或继续阅读。" });
      });
    }
  }, [captureSavePreview, hostActivity, now, project, refreshSaveSlots, saveCoordinator, saveStore, sessionRunner, snapshot, state.artifacts, state.checkpointSaveCandidates, state.deferredCheckpointSaveCandidates, state.runtimeState]);

  useEffect(() => () => {
    if (recoveryWritePending.current !== null) {
      clearTimeout(recoveryWritePending.current.timer);
      recoveryWritePending.current.controller.abort();
    }
  }, [recoveryCoordinator, project.manifest.projectId]);

  useEffect(() => {
    if (snapshot.sceneReplay.active || recoveryCoordinator === undefined || recoveryStore === undefined || recoveryWritePending.current?.coordinator === recoveryCoordinator || memoryWritePending.current === recoveryCoordinator || hostActivity !== "active" || state.runtimeState === null ||
        snapshot.identities.buildId === null || snapshot.runtimeStateHash === null || !saveBoundaryAllowed || recoveryCandidate !== null ||
        !["idle", "ready", "loaded"].includes(recoveryOperation) || lastRecoveryRuntimeStateHash.current === snapshot.runtimeStateHash) return;
    const projectId = project.manifest.projectId, runtimeState = state.runtimeState;
    lastRecoveryRuntimeStateHash.current = snapshot.runtimeStateHash;
    const generation = recoveryGeneration.current;
    const current = () => generation === recoveryGeneration.current && recoveryContext.current.projectId === projectId && recoveryContext.current.store === recoveryStore;
    let timedOut = false;
    const pending = { coordinator: recoveryCoordinator, controller: new AbortController(), timer: setTimeout(() => {
      if (!current()) return;
      timedOut = true;
      setRecoveryOperation("error");
      setRecoveryMessage("恢复保护保存超时，存储操作仍未结束。剧情可继续；请勿关闭游戏，可尝试手动保存。重试不会重复排队。");
      setRecoveryErrorAction("retry");
    }, 8000) };
    recoveryWritePending.current = pending;
    void recoverySessionRunner.run({ artifacts: state.artifacts, historySession: state.historySession, runtimeState, replaySession: state.replaySession }, pending.controller.signal).then(async created => {
      if (!current()) return;
      const record = createWorldPlayerRecoveryRecordV1({
        projectId, buildId: runtimeState.buildId, savedAtEpochMilliseconds: now(), title: snapshot.title,
        sceneId: runtimeState.cursor.sceneId, presentationKind: snapshot.presentation.kind,
        runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: created.artifactHash, serializedSessionSave: created.serialized
      });
      await recoveryCoordinator.write(record);
      if (!current()) return;
      // A late physical success is real, but must not silently dismiss the timeout warning.
      if (timedOut) {
        lastRecoveryRuntimeStateHash.current = null;
        setRecoveryMessage("先前的恢复点已保存，但不一定包含最新进度。请重试恢复保护以保存当前进度。");
        setRecoveryOperation("error");
        setRecoveryErrorAction("retry");
        return;
      }
      setRecoveryOperation("ready");
      setRecoveryMessage("当前进度已写入独立恢复区");
      setRecoveryErrorAction(null);
    }).catch((error: unknown) => {
      if (!current()) return;
      lastRecoveryRuntimeStateHash.current = null;
      setRecoveryOperation("error");
      setRecoveryMessage(error instanceof RecoverySessionError
        ? "恢复保护后台校验失败，旧恢复点和正式存档保持不变；可重试或手动保存。"
        : typeof error === "object" && error !== null && "name" in error && error.name === "QuotaExceededError"
        ? "设备存储空间不足，恢复保护未写入。旧恢复点和正式存档保持不变；请释放空间后重试，不要清除本游戏的网站数据。"
        : "恢复保护写入失败，旧恢复点和正式存档保持不变");
      setRecoveryErrorAction("retry");
    }).finally(() => {
      clearTimeout(pending.timer);
      if (recoveryWritePending.current === pending) recoveryWritePending.current = null;
      // Serialize only the newest live state after IO settles, not every skipped line.
      if (recoveryContext.current.store === recoveryStore) setRecoveryWriteRevision(revision => revision + 1);
    });
  }, [hostActivity, now, project.manifest.projectId, recoveryCandidate, recoveryCoordinator, recoveryOperation, recoveryStore, recoverySessionRunner, recoveryWriteRevision, saveBoundaryAllowed, snapshot, state]);

  useEffect(() => {
    if (memoryPressureRequest === undefined) { setMemoryPressureStatus("idle"); setMemoryPressureMessage(""); return; }
    setHandledMemorySerial(memoryPressureRequest.serial);
    setAutoEnabled(false); setAutoPlayback("off"); stopSkip();
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const fail = (message: string) => { if (active) { setMemoryPressureStatus("error"); setMemoryPressureMessage(message); } };
    try {
      onReleaseIdleResources?.();
      if (recoveryCoordinator !== undefined && (memoryWritePending.current === recoveryCoordinator || recoveryWritePending.current?.coordinator === recoveryCoordinator)) {
        fail("上次恢复点保存仍未结束，未继续排队。回滚历史不变，可先手动保存。"); return;
      }
      const protectedState = liveState.current;
      const retainedBackSteps = memoryPressureRequest.level === 'critical' ? 64 : 128;
      if (protectedState.artifacts === null || protectedState.historySession === null || protectedState.replaySession !== null ||
          !['presenting', 'waiting-choice', 'ended'].includes(protectedState.status) || protectedState.historySession.cursor <= retainedBackSteps) {
        setMemoryPressureStatus("released"); setMemoryPressureMessage("已请求释放闲置资源；当前进度和回滚窗口保持不变。");
        return;
      }
      if (recoveryCoordinator === undefined || recoveryStore === undefined || !saveBoundaryAllowed || snapshot.sceneReplay.active || recoveryCandidate !== null) {
        fail("闲置资源已处理，但当前无法保护恢复点，回滚历史保持不变。可先手动保存。"); return;
      }
      if (snapshot.identities.buildId === null || snapshot.runtimeStateHash === null || protectedState.runtimeState === null) throw Error('Cannot protect current state');
      setMemoryPressureStatus("protecting"); setMemoryPressureMessage("内存保护：正在整理并保存恢复点，暂不收缩历史。");
      timeout = setTimeout(() => { fail("恢复点保存超时，回滚历史未收缩。请检查存储后重试。"); active = false; controller.abort(); }, 8000);
      memoryWritePending.current = recoveryCoordinator;
      void runForegroundSessionTask({ kind: 'protect', state: protectedState, retainedBackSteps }, controller.signal).then(async reply => {
        if (!active || reply.kind !== 'protect') return;
        if (liveState.current !== protectedState) { setMemoryPressureStatus('deferred'); setMemoryPressureMessage('进度已改变，已跳过本次历史收缩。可重新执行内存保护。'); return; }
        const created = reply.result;
        const record = createWorldPlayerRecoveryRecordV1({ projectId: project.manifest.projectId, buildId: protectedState.runtimeState!.buildId,
          savedAtEpochMilliseconds: now(), title: snapshot.title, sceneId: protectedState.runtimeState!.cursor.sceneId,
          presentationKind: snapshot.presentation.kind, runtimeStateHash: snapshot.runtimeStateHash!,
          sessionArtifactHash: created.artifactHash, serializedSessionSave: created.serialized });
        await recoveryCoordinator.write(record);
        if (!active) return;
        clearTimeout(timeout);
        if (liveState.current !== protectedState) { setMemoryPressureStatus("deferred"); setMemoryPressureMessage("进度已改变，已跳过本次历史收缩。可重新执行内存保护。"); return; }
        // Preserve live artifacts, host identity and replay entries; only install
        // the worker's history proposal and the same Core playback reset.
        setState({ ...protectedState, historySession: created.historySession, schedulerSession: null, playback: created.playback });
        setMemoryPressureStatus("protected");
        setMemoryPressureMessage("恢复点已保存，较早历史已转为只读归档；当前句和正式存档不变。自动播放已停止。");
      }).catch(error => { clearTimeout(timeout); fail(error instanceof ForegroundSessionError ? '内存保护后台整理失败，回滚历史与正式存档保持不变。可重试。' : "恢复点保存失败，回滚历史未收缩，正式存档保持不变。可重试。"); })
        .finally(() => {
          clearTimeout(timeout);
          if (memoryWritePending.current === recoveryCoordinator) memoryWritePending.current = null;
          if (recoveryContext.current.projectId === project.manifest.projectId && recoveryContext.current.store === recoveryStore) setRecoveryWriteRevision(revision => revision + 1);
        });
    } catch { fail("内存保护未完成，回滚历史保持不变。可重试或手动保存。"); }
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
    // A request is a transaction for one exact state, not a reaction to every story step.
  }, [memoryPressureRequest, memoryPressureRetry, project, recoveryCoordinator, recoveryStore]);

  useEffect(() => {
    if (presentedText === "" || textRevealDuration === 0) {
      setTextReady(true);
      return;
    }
    setTextReady(false);
    const timer = window.setTimeout(() => setTextReady(true), textRevealDuration);
    return () => window.clearTimeout(timer);
  }, [presentedText, textRevealDuration]);

  useEffect(() => {
    if (!autoEnabled) return;
    const stopReason = snapshot.playback.stopReason;
    if (stopReason !== null && stopReason !== "storyBoundary" && stopReason !== "budget" && !(stopReason === "effect" && stage.video?.awaited === true)) {
      setAutoEnabled(false);
      setAutoPlayback("stopped");
      return;
    }
    if (hostActivity !== "active" || artworkView || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen || readingMenuOpen) {
      setAutoPlayback("suspended");
      return;
    }
    if (snapshot.status === "waiting-effect" && stage.video?.awaited === true && canonicalPlaybackPolicy.auto.video === "wait-for-end") {
      setAutoPlayback("waiting-video");
      return;
    }
    if (snapshot.status !== "presenting" || (content.kind !== "dialogue" && content.kind !== "narration")) {
      setAutoEnabled(false);
      setAutoPlayback("stopped");
      return;
    }
    if (stageImagesPending) { setAutoPlayback("suspended"); return; }
    if (!textReady) {
      setAutoPlayback("waiting-text");
      return;
    }
    if (reading.unread) { setAutoPlayback('waiting-reading'); return; }

    const voice = audioElements.current.get("voice");
    const readableUnits = Array.from(content.text).length;
    const policy = {
      schemaVersion: 1 as const,
      mode: "auto" as const,
      skipActivation: null,
      speed: "normal" as const,
      stopInstructionIds: buildStopInstructionIds,
      unavailableEffectDescriptorIds: [],
      instantInstructionBudget: canonicalPlaybackPolicy.auto.instantInstructionBudget,
      autoTiming: {
        baseDelayMilliseconds: canonicalPlaybackPolicy.auto.baseDelayMilliseconds,
        millisecondsPerReadableUnit: readingMillisecondsPerUnit(readingPace, canonicalPlaybackPolicy.auto.millisecondsPerReadableUnit),
        readableUnits,
        // The host clock waits for actual ended/error before invoking the core scheduler.
        voiceDurationMilliseconds: 0,
        voiceTailMilliseconds: 0
      }
    };
    const delay = policy.autoTiming.baseDelayMilliseconds + policy.autoTiming.millisecondsPerReadableUnit * readableUnits;
    setAutoPlayback(voice?.dataset.shouldPlay === "true" && !voice.ended && !voice.error && voice.dataset.voiceCompleted !== "true" && voice.dataset.voiceFailed !== "true" ? "waiting-voice" : "waiting");
    return startPlayerAutoClock(voice, delay, canonicalPlaybackPolicy.auto.voiceTailMilliseconds, () => {
      setAutoPlayback("advancing");
      if (!playbackAdvance.tryStart(policy)) setState((current) => schedulePlayerCorePlaybackV1(current, policy));
    });
  }, [artworkView, autoEnabled, autoVoiceIdentity, preferencesOpen, historyPanelOpen, savePanelOpen, additionalContentOpen, stageImagesPending, buildStopInstructionIds, canonicalPlaybackPolicy, content, hostActivity, snapshot.playback.stopReason, snapshot.status, stage.video, stage.audio, textReady, mediaGeneration, localizedMedia.voice?.assetId, readingMenuOpen, reading.unread, readingPace, playbackAdvance.tryStart]);

  useEffect(() => {
    if (!autoEnabled) return;
    const reason = snapshot.playback.stopReason;
    if (reason !== null && reason !== "storyBoundary" && reason !== "budget" && !(reason === "effect" && stage.video?.awaited === true)) {
      setAutoEnabled(false);
      setAutoPlayback("stopped");
    }
  }, [autoEnabled, snapshot.playback.stopReason, stage.video]);

  useEffect(() => {
    if (!skipActive || skipMode === null) return;
    // Do not cancel an awaited video or dispatch a batch while the player is away.
    if (hostActivity !== "active" || artworkView || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen || readingMenuOpen) {
      stopSkip();
      return;
    }
    if (snapshot.status === "waiting-effect" && stage.video?.awaited === true && canonicalPlaybackPolicy.skip.video === "cancel-and-continue") {
      setState((current) => dispatchPlayerCoreIntentV1(current, project, { kind: "cancel" }));
      if (skipMode === "skipRead") {
        setVideoPolicyStopReason("unreadBoundary");
        stopSkip();
      }
      return;
    }
    if (hostActivity !== "active" || snapshot.status !== "presenting") {
      stopSkip();
      return;
    }
    if (stageImagesPending) return;
    if (snapshot.playback.mode === skipMode && snapshot.playback.stopReason !== null && snapshot.playback.stopReason !== "budget") {
      stopSkip();
      return;
    }
    setTextReady(true);
    const timer = window.setTimeout(() => {
      if (skipModeCurrent.current !== skipMode) return;
      skipAwaitingDispatch.current = false;
      const policy: PlayerCorePlaybackPolicyV1 = {
        schemaVersion: 1,
        mode: skipMode,
        skipActivation,
        speed: skipSpeed,
        stopInstructionIds: buildStopInstructionIds,
        unavailableEffectDescriptorIds: [],
        instantInstructionBudget: canonicalPlaybackPolicy.skip.instantInstructionBudget,
        autoTiming: {
          baseDelayMilliseconds: 0,
          millisecondsPerReadableUnit: 0,
          readableUnits: 0,
          voiceDurationMilliseconds: 0,
          voiceTailMilliseconds: 0
        }
      };
      if (!playbackAdvance.tryStart(policy)) setState((current) => schedulePlayerCorePlaybackV1(current, policy));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [artworkView, preferencesOpen, historyPanelOpen, savePanelOpen, additionalContentOpen, stageImagesPending, buildStopInstructionIds, canonicalPlaybackPolicy.skip, hostActivity, project, skipActivation, skipActive, skipMode, skipSpeed, snapshot.history?.cursor, snapshot.playback.accumulatedInstructions, snapshot.playback.executedInstructions, snapshot.playback.mode, snapshot.playback.stopReason, snapshot.status, stage.video, stopSkip, readingMenuOpen, playbackAdvance.tryStart, state, playbackOwnership]);

  useEffect(() => {
    if (!skipActive) return;
    const reason = snapshot.playback.stopReason;
    if (!skipAwaitingDispatch.current && snapshot.playback.mode === skipMode && reason !== null && reason !== "budget" && !(reason === "effect" && stage.video?.awaited === true)) stopSkip();
  }, [skipActive, skipMode, snapshot.playback.mode, snapshot.playback.stopReason, stage.video, stopSkip]);

  useEffect(() => {
    if (skipActivation !== "hold" || !skipActive) return;
    const stop = () => stopSkip();
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keyup", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keyup", stop);
      window.removeEventListener("blur", stop);
    };
  }, [skipActivation, skipActive, stopSkip]);

  useEffect(() => {
    setMediaErrors([]);
  }, [mediaSignature]);

  useEffect(() => {
    if (content.kind !== "choice") {
      setSelectedChoiceIndex(0);
      return;
    }
    setSelectedChoiceIndex((current) => Math.min(current, Math.max(0, content.options.length - 1)));
  }, [content.kind, content.kind === "choice" ? content.options.length : 0]);

  useEffect(() => {
    if (content.kind === "choice") choiceButtons.current[selectedChoiceIndex]?.focus();
  }, [content.kind, selectedChoiceIndex]);

  useEffect(() => {
    if (additionalContentOpen) {
      additionalContentWasOpen.current = true;
      additionalContentClose.current?.focus();
      return;
    }
    if (additionalContentWasOpen.current) {
      additionalContentWasOpen.current = false;
      const trigger = additionalContentReturnTrigger.current;
      if (trigger?.isConnected) trigger.focus();
      if (!trigger || document.activeElement !== trigger) (titleAdditionalContentTrigger.current ?? readingMenuTrigger.current ?? additionalContentTrigger.current)?.focus();
    }
    setAdditionalContentView("overview");
    setSelectedGalleryAssetId(null);
    setAdditionalContentMediaErrors([]);
  }, [additionalContentOpen]);

  useEffect(() => {
    if (snapshot.sceneReplay.active) replayExitButton.current?.focus();
  }, [snapshot.sceneReplay.active]);

  useEffect(() => {
    const previousView = previousAdditionalContentView.current;
    if (previousView === additionalContentView) return;
    previousAdditionalContentView.current = additionalContentView;
    if (!additionalContentOpen) return;
    if (additionalContentView === "overview") {
      (previousView === "gallery" ? galleryOverviewTrigger.current
        : previousView === "replay" ? replayOverviewTrigger.current
          : previousView === "music" ? musicOverviewTrigger.current
            : endingOverviewTrigger.current)?.focus();
      return;
    }
    additionalContentDetailBack.current?.focus();
  }, [additionalContentOpen, additionalContentView]);

  useEffect(() => {
    if (selectedGalleryAssetId !== null) {
      galleryPreviewWasOpen.current = true;
      galleryPreviewClose.current?.focus();
      return;
    }
    if (galleryPreviewWasOpen.current) {
      galleryPreviewWasOpen.current = false;
      const trigger = galleryPreviewTrigger.current;
      if (trigger?.isConnected) trigger.focus();
      if (!trigger || document.activeElement !== trigger) additionalContentDetailBack.current?.focus();
    }
  }, [selectedGalleryAssetId]);

  useEffect(() => {
    if (hostActivity !== "active") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (artworkView) {
        if (!event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && ['h', 'H', 'Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); restoreReading(); }
        return;
      }
      if (preferencesOpen) {
        if (event.key === 'Escape') { event.preventDefault(); closePreferences(); }
        if (event.key === 'Tab') {
          const controls = [...(preferencesPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href]') ?? [])];
          const index = controls.indexOf(document.activeElement as HTMLElement);
          if (controls.length) { event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus(); }
        }
        return;
      }
      if (readingMenuOpen) {
        if (event.key === 'Escape') { event.preventDefault(); closeReadingMenu(); }
        if (event.key === 'Tab') {
          const buttons = [...(readingMenu.current?.querySelectorAll<HTMLElement>('button,select,summary') ?? [])].filter(control => !control.matches(':disabled') && !control.closest('[hidden]') && (!control.closest('details:not([open])') || control.tagName === 'SUMMARY'));
          if (buttons.length) { const index = buttons.indexOf(document.activeElement as HTMLElement); event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); }
        }
        return;
      }
      if (additionalContentOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          if (selectedGalleryAssetId !== null) {
            setSelectedGalleryAssetId(null);
            return;
          }
          if (additionalContentView !== "overview") {
            setAdditionalContentView("overview");
            return;
          }
          closeAdditionalContent();
          return;
        }
        if (event.key === "Tab") {
          const scope = selectedGalleryAssetId !== null ? galleryPreviewClose.current?.closest("figure") : additionalContentPanel.current;
          const focusable = Array.from(scope?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], audio[controls], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
          ) ?? []);
          if (focusable.length === 0) return;
          const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
          const nextIndex = event.shiftKey
            ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
            : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
          event.preventDefault();
          focusable[nextIndex]?.focus();
        }
        return;
      }
      if (historyPanelOpen || savePanelOpen) {
        if (event.key === "Escape") { event.preventDefault(); if (saveOperation === "busy") return; if (pendingRead) cancelRead(); else if (historyPanelOpen) closeHistoryPanel(); else closeSavePanel(); }
        return;
      }
      if (event.key === 'Escape' && snapshot.sceneReplay.active) { event.preventDefault(); exitSceneReplay(); return; }
      if (!event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'h' && canViewArtwork && !(event.target instanceof HTMLElement && event.target.closest('input,select,textarea,summary,[contenteditable]'))) { event.preventDefault(); showArtwork(); return; }
      if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea,summary,[contenteditable],button:not(.player-dialogue)')) return;
      if (event.repeat && !settingsApplication.advance.allowHold || event.altKey || event.ctrlKey || event.metaKey) return;
      if (content.kind === "choice" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        const delta = event.key === "ArrowUp" ? -1 : 1;
        setSelectedChoiceIndex((current) => (current + delta + content.options.length) % content.options.length);
        return;
      }
      if (content.kind === "choice" && /^[1-9]$/u.test(event.key)) {
        const option = content.options[Number(event.key) - 1];
        if (option !== undefined) applyIntent({ kind: "select-choice", optionId: option.optionId }, "keyboard");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (snapshot.sceneReplay.active) {
          exitSceneReplay();
          return;
        }
        applyIntent({ kind: "cancel" }, "keyboard");
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const selected = content.kind === "choice" ? content.options[selectedChoiceIndex] : undefined;
        applyIntent(selected === undefined ? { kind: "primary" } : { kind: "select-choice", optionId: selected.optionId }, "keyboard");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingRead, cancelRead, saveOperation, artworkView, canViewArtwork, restoreReading, showArtwork, preferencesOpen, closePreferences, historyPanelOpen, savePanelOpen, closeSavePanel, additionalContentOpen, additionalContentView, applyIntent, closeAdditionalContent, content, exitSceneReplay, hostActivity, selectedChoiceIndex, selectedGalleryAssetId, settingsApplication.advance.allowHold, snapshot.sceneReplay.active, readingMenuOpen, closeReadingMenu, closeHistoryPanel]);

  const gamepadAction = useRef<(action: PlayerGamepadActionV1) => void>(() => {});
  // Keep the polling session's edge history while dispatching against the latest story.
  gamepadAction.current = (action) => {
    if (artworkView) { if (action === 'cancel' || action === 'primary') restoreReading(); return; }
    if (savePanelOpen) { if (action === 'cancel' && saveOperation !== 'busy') { if (pendingRead) cancelRead(); else closeSavePanel(); } return; }
    if (historyPanelOpen) { if (action === 'cancel') closeHistoryPanel(); return; }
    if (preferencesOpen) { if (action === 'cancel') closePreferences(); return; }
    if (readingMenuOpen) { if (action === 'cancel') closeReadingMenu(); return; }
    if (action === "previous-choice" || action === "next-choice") {
      if (content.kind === "choice") {
        const delta = action === "previous-choice" ? -1 : 1;
        setSelectedChoiceIndex((index) => (index + delta + content.options.length) % content.options.length);
        setLastInputSource("gamepad");
      }
    } else if (action === "primary") {
      const selected = content.kind === "choice" ? content.options[selectedChoiceIndex] : undefined;
      applyIntent(selected === undefined ? { kind: "primary" } : { kind: "select-choice", optionId: selected.optionId }, "gamepad");
    } else if (action === "cancel") {
      applyIntent({ kind: "cancel" }, "gamepad");
    }
  };
  useEffect(() => {
    if (hostActivity !== "active" || historyPanelOpen || savePanelOpen || additionalContentOpen) return;
    if (typeof navigator.getGamepads !== "function") return;
    let animationFrame = 0;
    const track = createPlayerGamepadTrackerV1();
    const poll = () => {
      const gamepad = navigator.getGamepads().find((candidate) => candidate !== null && candidate.connected);
      const action = track(gamepad ? { device: `${gamepad.index}:${gamepad.id}`, frame: browserGamepadFrameV1(gamepad) } : null);
      if (action !== null) gamepadAction.current(action);
      animationFrame = requestAnimationFrame(poll);
    };
    animationFrame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animationFrame);
  }, [historyPanelOpen, savePanelOpen, additionalContentOpen, hostActivity]);

  useEffect(() => {
    const previous = previousHostActivity.current;
    previousHostActivity.current = hostActivity;
    if (previous === hostActivity) return;
    for (const element of audioElements.current.values()) {
      if (hostActivity === "suspended") {
        cancelPlayerAudioRequest(element);
        element.dataset.playerPlayback = "suspended";
        element.pause();
      } else if (element.dataset.shouldPlay === "true" && !element.ended && !element.error && element.dataset.voiceCompleted !== "true" && element.dataset.voiceFailed !== "true" && settingsApplication.audio.resumeAfterInterruption) {
        requestAudio(element);
      } else if (element.dataset.shouldPlay === "true") {
        element.dataset.playerPlayback = "paused-by-policy";
        refreshAudioTransport(revision => revision + 1);
      }
    }
    const video = videoElement.current;
    if (video !== null) {
      if (hostActivity === "suspended") {
        cancelPlayerMediaRequest(video);
        video.dataset.playerPlayback = "suspended";
        video.pause();
      } else if (video.dataset.shouldPlay === "true" && settingsApplication.audio.resumeAfterInterruption) {
        requestVideo(video);
      } else if (video.dataset.shouldPlay === "true") {
        video.dataset.playerPlayback = "paused-by-policy";
        refreshVideoTransport(revision => revision + 1);
      }
    }
  }, [hostActivity, requestAudio, requestVideo, settingsApplication.audio.resumeAfterInterruption]);

  useEffect(() => {
    const wasActive = previousSkipActive.current;
    previousSkipActive.current = skipActive;
    for (const element of audioElements.current.values()) {
      if (skipActive) {
        cancelPlayerAudioRequest(element);
        element.dataset.playerPlayback = "skipped";
        element.pause();
      } else if (wasActive && hostActivity === "active" && element.dataset.shouldPlay === "true" && !element.ended && !element.error && element.dataset.voiceCompleted !== "true" && element.dataset.voiceFailed !== "true") {
        requestAudio(element, "resuming-after-skip");
      }
    }
  }, [hostActivity, requestAudio, skipActive]);

  useEffect(() => () => {
    for (const element of audioElements.current.values()) {
      cancelPlayerAudioRequest(element);
      if (!element.paused) element.pause();
    }
    const video = videoElement.current;
    if (video !== null) { cancelPlayerMediaRequest(video); if (!video.paused) video.pause(); }
  }, []);

  const layoutDisabled = hostActivity !== "active" || saveOperation === "busy" || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen || readingMenuOpen || artworkView;
  const layoutActionEnabled = (action: WebLayoutAction) => {
    if (action === "start") return content.kind === "title" && recoveryOperation !== "scanning";
    if (action === "load") return saveStore !== undefined;
    if (action === "save") return saveStore !== undefined && saveBoundaryAllowed && !snapshot.sceneReplay.active;
    if (action === "credits") return hasWebCredits(credits);
    if (action === "additional") return !snapshot.sceneReplay.active;
    if (action === "artwork") return canViewArtwork;
    return true;
  };
  const layoutAction = (action: WebLayoutAction, trigger: HTMLButtonElement, source: "pointer" | "touch" | "keyboard") => {
    if (layoutDisabled || !layoutActionEnabled(action)) return;
    trigger.focus({ preventScroll: true });
    if (action === "start") applyIntent({ kind: "primary" }, source);
    else if (action === "save" || action === "load") openSavePanel(action);
    else if (action === "preferences") { infoTrigger.current = trigger; stopSkip(); setInfoView("preferences"); setPreferencesOpen(true); }
    else if (action === "credits") openCredits();
    else if (action === "additional") openAdditionalContent();
    else if (action === "artwork") showArtwork();
    else if (action === "history") { historyDialogTrigger.current = trigger; setReadingMenuOpen(false); setHistoryPanelOpen(true); }
    else if (action === "menu") { readingMenuReturnTrigger.current = trigger; stopSkip(); setReadingMenuOpen(true); }
  };
  const inlineLayoutComponents = <PlayerLayoutComponents rows={componentLayout?.components} inline media={mediaAssets} disabled={layoutDisabled} onAction={layoutAction} actionEnabled={layoutActionEnabled} />;
  const endingActionBlocked = hostActivity !== "active" || saveOperation === "busy" || preferencesOpen || savePanelOpen || additionalContentOpen || historyPanelOpen || readingMenuOpen;
  const panelAction = (surface: PlayerLayoutPanel, action: WebLayoutAction, trigger: HTMLButtonElement, source: "pointer" | "touch" | "keyboard") => {
    if (hostActivity !== "active" || saveOperation === "busy" || !panelLayouts[surface].layout || !webLayoutActions(surface).includes(action) || !layoutActionEnabled(action)) return;
    if (surface === "ending" && endingActionBlocked) return;
    if (webLayoutIsAdditional(surface) && (!additionalContentOpen || surface !== additionalSurface || selectedGalleryAssetId !== null)) return;
    if (action === "resume") {
      if (surface === "menu") closeReadingMenu();
      else if (surface === "history") closeHistoryPanel();
      else if (surface === "preferences" || surface === "credits") closePreferences();
      else if (surface === "ending") { if (snapshot.sceneReplay.active) exitSceneReplay(); else applyIntent({ kind: "restart" }, source); }
      else if (webLayoutIsAdditional(surface)) { if (surface === "additional") closeAdditionalContent(); else setAdditionalContentView("overview"); }
      else closeSavePanel();
      return;
    }
    if (surface !== "menu") return;
    trigger.focus({ preventScroll: true }); setReadingMenuOpen(false);
    if (action === "save" || action === "load") openSavePanel(action);
    else if (action === "preferences") { infoTrigger.current = trigger; stopSkip(); setInfoView("preferences"); setPreferencesOpen(true); }
    else if (action === "history") { historyDialogTrigger.current = trigger; setHistoryPanelOpen(true); }
    else if (action === "credits") openCredits();
    else if (action === "additional") openAdditionalContent();
  };
  const panelComponents = (surface: PlayerLayoutPanel, inline = false) => {
    const rows = panelLayouts[surface].layout?.components.map(row => surface === "ending" && snapshot.sceneReplay.active && row.component.kind === "button" ? { ...row, component: { ...row.component, text: "返回原剧情" } } : row);
    return <PlayerLayoutComponents rows={rows} inline={inline} media={mediaAssets} disabled={hostActivity !== "active" || saveOperation === "busy" || surface === "ending" && endingActionBlocked} onAction={(action, trigger, source) => panelAction(surface, action, trigger, source)} actionEnabled={layoutActionEnabled} />;
  };
  const panelProps = (surface: PlayerLayoutPanel) => ({ ...playerScreenProps(skin, webLayoutIsAdditional(surface) ? "additional" : surface), "data-layout-panel-surface": panelLayouts[surface].enabled ? surface : undefined, "data-panel-layout": panelLayouts[surface].layout ? surface : undefined });
  const panelAudit = (surface: PlayerLayoutPanel) => editorPreview && panelLayouts[surface].layout?.fallback ? <p className="player-layout-audit" role="status">布局保护：内容与返回区使用安全布局，冲突按钮并入内容操作区。</p> : null;
  const panelContent = (surface: PlayerLayoutPanel) => ({ enabled: panelLayouts[surface].enabled, layout: panelLayouts[surface].layout, inline: panelComponents(surface, true), floating: panelComponents(surface), audit: panelAudit(surface) });
  const endingReturn = <button className="player-secondary" type="button" disabled={endingActionBlocked} onPointerDown={event => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => snapshot.sceneReplay.active ? exitSceneReplay() : applyIntent({ kind: "restart" }, pointerInput.current)}>{snapshot.sceneReplay.active ? "结束回想，返回原剧情" : skin?.screens?.ending.returnLabel ?? "回到标题"}</button>;

  return (
    <main ref={fullscreen.element}
      className="player-shell"
      data-player-status={snapshot.status}
      data-story-operation={storyAdvance.busy ? 'busy' : storyAdvance.error ? 'error' : 'idle'}
      data-playback-operation={playbackAdvance.busy ? 'busy' : playbackAdvance.error ? 'error' : 'idle'}
      data-layout-title={!!componentLayout && layoutSurface === "title"}
      data-layout-reading={!!componentLayout && layoutSurface === "reading"}
      data-layout-fallback={componentLayout?.fallback ?? false}
      data-artwork-view={artworkView}
      data-reading-menu-open={readingMenuOpen}
      data-compact-reading={compactReading}
      data-reading-unread-below={reading.unread}
      data-reading-pace={readingPace}
      data-preferences-open={preferencesOpen}
      data-player-muted={effectiveMuted}
      data-player-fullscreen={fullscreen.active}
      data-player-locale={snapshot.localization.selectedLocale}
      data-player-media-locale={snapshot.localization.selectedLocale}
      data-player-media-fallbacks={localizedMedia.fallbackResourceIds.length}
      data-player-media-missing={localizedMedia.missingResourceIds.length}
      data-player-locale-fallbacks={snapshot.localization.missingTranslationCount}
      data-player-font={fontStatus}
      data-player-typography={typography.cjk ? "cjk-strict" : "standard"}
      data-player-core={snapshot.playerCoreVersion}
      data-compiler={snapshot.identities.compilerVersion}
      data-runtime={snapshot.identities.runtimeVersion}
      data-runtime-host={snapshot.identities.runtimeHostVersion}
      data-effect-operation={lastEffectOperation?.kind ?? "none"}
      data-history-cursor={snapshot.history?.cursor ?? 0}
      data-history-length={snapshot.history?.length ?? 0}
      data-history-can-back={snapshot.history?.canBack ?? false}
      data-history-can-forward={snapshot.history?.canForward ?? false}
      data-history-panel={historyPanelOpen ? "open" : "closed"}
      data-additional-content={additionalContentOpen ? "open" : "closed"}
      data-history-archives={snapshot.history?.archives.length ?? 0}
      data-memory-pressure={memoryPressureStatus}
      data-memory-pressure-serial={handledMemorySerial}
      data-history-forward-policy={snapshot.history?.forwardPolicy.allowForwardAfterBack ?? settingsApplication.history.allowForwardAfterBack}
      data-save-store={saveStore?.backend ?? "unavailable"}
      data-save-store-version={saveStore?.version ?? "none"}
      data-save-operation={saveOperation}
      data-recovery-store={recoveryStore?.backend ?? "unavailable"}
      data-recovery-store-version={recoveryStore?.version ?? "none"}
      data-recovery-operation={recoveryOperation}
      data-input-source={lastInputSource}
      data-input-accepted={lastInputAccepted}
      data-host-activity={hostActivity}
      data-audio-mode={silentReading ? 'silent' : 'enabled'}
      data-playback-policy={canonicalPlaybackPolicy.policyVersion}
      data-playback-mode={autoEnabled ? "auto" : skipMode ?? snapshot.playback.mode}
      data-playback-activation={skipMode === null ? snapshot.playback.skipActivation ?? "none" : skipActivation}
      data-playback-speed={skipMode === null ? snapshot.playback.speed : skipSpeed}
      data-playback-stop-reason={snapshot.playback.stopReason ?? "none"}
      data-auto-playback={autoPlayback}
      data-skip-active={skipActive}
      data-stage-images-pending={stageImagesPending}
      data-skip-media={skipActive ? "accelerated" : "normal"}
      data-video-policy-stop-reason={videoPolicyStopReason}
      data-runtime-state-hash={snapshot.runtimeStateHash ?? "none"}
      data-runtime-host-snapshot-hash={snapshot.runtimeHostSnapshotHash}
      data-scene-replay={snapshot.sceneReplay.active ? snapshot.sceneReplay.replayId : "inactive"}
      data-settings-platform={platform}
      data-player-theme={appearance?.theme}
      data-player-skin={skin?.schemaVersion}
      data-editor-preview={editorPreview ? "true" : undefined}
      data-skin-title-align={skin?.title.align}
      data-skin-reading-position={skin?.reading.position}
      data-skin-title-motion={skin?.motion.title}
      data-skin-dialogue-motion={skin?.motion.dialogue}
      data-skin-text-motion={skin?.motion.text}
      data-skin-control-motion={skin?.motion.controls}
      data-skin-button-images={skin?.images ? Object.values(skin.images.buttons).some(Boolean) : undefined}
      data-skin-button-frame={!!skin?.template?.frames.buttons.enabled}
      data-skin-window-frame={!!skin?.template?.frames.window.enabled && !!skin.reading.windowAssetId}
      data-player-accent={appearance?.accent}
      data-settings-application={settingsApplication.version}
      data-settings-quality={settingsApplication.display.quality}
      data-settings-safe-area={settingsApplication.display.safeArea}
      data-settings-orientation={settingsApplication.display.orientation}
      data-settings-input-pointer={settingsApplication.input.pointer}
      data-settings-input-keyboard={settingsApplication.input.keyboard}
      data-settings-input-touch={settingsApplication.input.touch}
      data-settings-input-gamepad={settingsApplication.input.gamepad}
      data-settings-high-contrast={settingsApplication.accessibility.highContrast}
      data-settings-reduce-motion={settingsApplication.accessibility.reduceMotion}
      data-settings-reduce-flashing={settingsApplication.accessibility.reduceFlashing}
      data-settings-text-cps={settingsApplication.text.charactersPerSecond}
      data-settings-text-minimum={settingsApplication.text.minimumDisplayMilliseconds}
      data-settings-text-punctuation={settingsApplication.text.punctuationDelayMilliseconds}
      data-settings-allow-hold={settingsApplication.advance.allowHold}
      data-settings-wait-for-voice={settingsApplication.advance.waitForVoice}
      data-settings-audio-master={settingsApplication.resolved.values.audio.master}
      data-settings-audio-bgm={settingsApplication.resolved.values.audio.bgm}
      data-settings-audio-voice={settingsApplication.resolved.values.audio.voice}
      data-settings-audio-sfx={settingsApplication.resolved.values.audio.sfx}
      data-settings-audio-ambient={settingsApplication.resolved.values.audio.ambient}
      data-settings-audio-ui={settingsApplication.resolved.values.audio.ui}
      data-settings-audio-voice-ducking={settingsApplication.resolved.values.audio.voiceDucking}
      data-settings-audio-resume={settingsApplication.audio.resumeAfterInterruption}
      data-settings-stage-duration={settingsApplication.stage.defaultDurationMilliseconds}
      data-settings-stage-easing={settingsApplication.stage.defaultEasing}
      data-settings-choice-layout={settingsApplication.choice.layout}
      data-settings-choice-numbers={settingsApplication.choice.showOptionNumbers}
      data-settings-textbox-default={settingsApplication.ui.defaultTextboxTemplate}
      data-settings-input-hints={settingsApplication.ui.showInputHints}
      data-settings-history-forward={settingsApplication.history.allowForwardAfterBack}
      style={{
        "--gal-stage-aspect": settingsApplication.display.aspectRatio,
        "--gal-stage-ratio": settingsApplication.display.designWidth / settingsApplication.display.designHeight,
        "--gal-font-scale": settingsApplication.text.fontScale,
        "--gal-message-opacity": settingsApplication.text.messageWindowOpacity,
        "--gal-line-height": settingsApplication.text.lineHeight,
        "--gal-letter-spacing": `${settingsApplication.text.letterSpacingEm}em`,
        "--player-font-family": skinFonts.families.body,
        "--skin-font-title": skinFonts.families.title,
        "--skin-font-name": skinFonts.families.name,
        "--skin-font-ui": skinFonts.families.ui,
        ...playerSkinStyle(skin, mediaAssets)
      } as React.CSSProperties}
    >
      {menuLayout.probe}{saveLayout.probe}{historyLayout.probe}{preferencesLayout.probe}{creditsLayout.probe}{endingLayout.probe}{overviewLayout.probe}{galleryLayout.probe}{musicLayout.probe}{replayLayout.probe}{endingsLayout.probe}
      <div className="player-glow player-glow--violet" />
      <div className="player-glow player-glow--cyan" />
      {preferencesOpen && (infoView === 'credits' ? <PlayerCreditsPanel skin={skin} layout={panelContent('credits')} credits={credits} title={snapshot.title} panel={preferencesPanel} close={closePreferences} /> : <PlayerPreferencesPanel skin={skin} layout={panelContent('preferences')} panel={preferencesPanel} preferences={personal.preferences} update={personal.update} saved={personal.saved} active={hostActivity === 'active'} close={closePreferences} fullscreen={fullscreen} />)}
      <section className="player-stage" inert={preferencesOpen} aria-label={`${snapshot.title} 游戏画面`}>
        {layoutProbe}
        {componentLayout && <div className="player-layout-components" style={{ display: "contents" }} inert={layoutDisabled}><PlayerLayoutComponents rows={componentLayout.components} media={mediaAssets} disabled={layoutDisabled} onAction={layoutAction} actionEnabled={layoutActionEnabled} /></div>}
        {editorPreview && componentLayout?.fallback && <p className="player-layout-audit" role="status">布局保护：重叠的主组件使用安全布局；冲突按钮并入操作区。</p>}
        {content.kind === "title" && cover && failedCover !== cover.url && skin?.title.coverMode === "stage" && <img className="player-title-backdrop" src={cover.url} alt="" onError={() => setFailedCover(cover.url)} />}
        {stageImageError && <div role="alert" style={{position:"absolute",zIndex:20,inset:"30% 10% auto",padding:16,background:"#181827",color:"white"}}>
          {stageImageStates.includes("budget") ? "画面资源超过安全预算或仍在释放，已停止自动推进。可稍后重试当前画面或手动继续。" : <>{stageImageStates.includes("timeout") ? "画面加载超时，已停止自动推进。" : "画面资源未能加载，已停止自动推进。"}可以重试当前画面或手动继续；若仍失败，请重新下载完整游戏。</>}
          <button type="button" style={{minHeight:44}} onClick={event => { event.stopPropagation(); setImageAttempt(value => value + 1); }}>重试画面资源</button>
        </div>}
        <div className="player-stage-world" data-skip-media={skipActive ? "accelerated" : "normal"} style={{ transform: stage.cameraTransform }} aria-label="正式媒体舞台">
          {stage.background !== null && (
            <NativeAtlasImage atlas={stage.background.atlas} canvasSampling={stage.background.canvasSampling} hideResourceError
              onResourceState={status=>reportImage(`${imageGeneration}:background:${stage.background!.assetId}`,status)}
              onResourceFailure={() => { setAutoEnabled(false); setAutoPlayback("stopped"); stopSkip(); }}
              key={`${imageGeneration}:background:${stage.background.assetId}`}
              className={`player-stage-background player-transition--${stage.background.transition}`}
              src={stage.background.url}
              alt={stage.background.displayName}
              data-asset-id={stage.background.assetId}
              style={{ animationDuration: `${stage.background.durationMilliseconds}ms`, animationTimingFunction: stage.background.easing }}
              onError={() => { if (!stage.background!.atlas && !stage.background!.canvasSampling) setMediaErrors((current) => [...new Set([...current, stage.background!.assetId])]); }}
            />
          )}
          {stage.video !== null && (
            <video
              key={`${mediaGeneration}:video:${stage.video.effectId}`}
              className="player-stage-background player-stage-video"
              src={stage.video.url}
              aria-label={stage.video.displayName}
              data-asset-id={stage.video.assetId}
              data-video-policy={stage.video.awaited ? "awaited" : "active"}
              autoPlay={hostActivity === "active" && stage.video.status === "playing"}
              playsInline
              ref={(element) => {
                if (element !== null) {
                  videoElement.current = element;
                  element.volume = settingsApplication.resolved.values.audio.master;
                  element.dataset.shouldPlay = String(stage.video?.status === "playing");
                  if (element.dataset.playerPlayback === undefined) element.dataset.playerPlayback = hostActivity === "suspended" ? "suspended" : stage.video?.status ?? "ended";
                  return () => {
                    if (videoElement.current === element) videoElement.current = null;
                    // Saving, Auto and audio events rerender the shell. Ref replay is
                    // not a video interruption: release only a truly detached owner.
                    queueMicrotask(() => {
                      if (!element.isConnected) { cancelPlayerMediaRequest(element); if (!element.paused) element.pause(); }
                    });
                  };
                }
              }}
              onCanPlay={(event) => {
                const video = event.currentTarget;
                if (video.paused && !["blocked", "interrupted", "paused-by-policy", "resuming", "error"].includes(video.dataset.playerPlayback ?? "")) requestVideo(video);
              }}
              onPlaying={(event) => {
                const video = event.currentTarget;
                if (audioActivity.current.hostActivity !== "active" || audioActivity.current.skipActive || videoElement.current !== video) {
                  cancelPlayerMediaRequest(video); video.dataset.playerPlayback = "suspended"; video.pause();
                } else video.dataset.playerPlayback = "playing";
                refreshVideoTransport(revision => revision + 1);
              }}
              onPause={(event) => {
                const video = event.currentTarget;
                if (audioActivity.current.hostActivity === "active" && !audioActivity.current.skipActive && video.dataset.shouldPlay === "true" && !video.ended && !["suspended", "resuming", "blocked", "error"].includes(video.dataset.playerPlayback ?? "")) {
                  cancelPlayerMediaRequest(video);
                  video.dataset.playerPlayback = "interrupted";
                  refreshVideoTransport(revision => revision + 1);
                }
              }}
              onEnded={() => {
                const video = videoElement.current;
                if (video !== null) {
                  cancelPlayerMediaRequest(video);
                  video.dataset.shouldPlay = "false";
                  video.dataset.playerPlayback = "ended";
                }
                if (stage.video?.awaited === true && hostActivity === "active") applyIntent({ kind: "primary" }, "system");
              }}
              onError={() => {
                const video = videoElement.current;
                if (video !== null) {
                  cancelPlayerMediaRequest(video);
                  video.dataset.shouldPlay = "false";
                  video.dataset.playerPlayback = "error";
                  video.pause();
                }
                setMediaErrors((current) => [...new Set([...current, stage.video!.assetId])]);
              }}
            />
          )}
          {stage.background === null && stage.sceneDescription !== null && (
            <div className="player-scene-description" aria-label="场景描述">{stage.sceneDescription}</div>
          )}
          {stage.characters.map((character) => (
            <NativeAtlasImage atlas={character.atlas} canvasSampling={character.canvasSampling}
              motionOwner={character.motion !== undefined}
              hideResourceError
              onResourceState={status=>reportImage(`${imageGeneration}:${character.slot}:${character.assetId}`,status)}
              onResourceFailure={() => { setAutoEnabled(false); setAutoPlayback("stopped"); stopSkip(); }}
              key={`${imageGeneration}:${character.slot}:${character.assetId}:${character.motionKey ?? ""}`}
              className={`player-stage-character player-transition--${character.motion ? "none" : character.transition}`}
              src={character.url}
              alt={character.displayName}
              data-asset-id={character.assetId}
              data-stage-slot={character.slot}
              data-story-motion={character.motion?.kind}
              aria-hidden={character.motion?.kind === "fade-out" ? true : undefined}
              style={{ left: `${character.x}%`, top: `${character.y}%`, zIndex: character.z, transform: `translate(${-character.anchorX * 100}%, ${-character.anchorY * 100}%) scale(${character.scale}) rotate(${character.rotation}deg)`, animationDuration: `${character.durationMilliseconds}ms`, animationTimingFunction: character.easing, ...storyMotionStyle(character.motion) }}
              onError={() => { if (!character.atlas && !character.canvasSampling) setMediaErrors((current) => [...new Set([...current, character.assetId])]); }}
            />
          ))}
        </div>
        {appliedAudio.map((track) => (
          <audio
            key={`${mediaGeneration}:${audioAttempts[track.bus] ?? 0}:${track.bus}:${track.assetId}`}
            muted={effectiveMuted}
            ref={(element) => {
              if (element !== null) {
                audioElements.current.set(track.bus, element);
                element.volume = track.appliedVolume;
                element.dataset.appliedVolume = String(element.volume);
                element.dataset.shouldPlay = String(track.status === "playing");
                if (element.dataset.playerPlayback === undefined) element.dataset.playerPlayback = hostActivity === "suspended" ? "suspended" : track.status;
                return () => {
                  if (audioElements.current.get(track.bus) === element) audioElements.current.delete(track.bus);
                  // React ref replay is not a media interruption; only release truly detached owners.
                  queueMicrotask(() => {
                    if (element.isConnected) return;
                    cancelPlayerAudioRequest(element);
                    if (!element.paused) element.pause();
                    element.removeAttribute('src');
                    element.load();
                  });
                };
              }
            }}
            src={track.url}
            data-audio-bus={track.bus}
            data-asset-id={track.assetId}
            data-volume={track.volume}
            data-applied-volume={track.appliedVolume}
            aria-label={`${track.displayName} · ${track.bus}`}
            loop={track.loop}
            onCanPlay={(event) => {
              const element = event.currentTarget;
              if (element.paused && !element.ended && element.dataset.shouldPlay === "true" && !["blocked", "paused-by-policy", "interrupted"].includes(element.dataset.playerPlayback ?? "")) requestAudio(element);
            }}
            onPlay={(event) => {
              event.currentTarget.dataset.playerPlayback = "playing";
              refreshAudioTransport(revision => revision + 1);
              if (track.bus === "voice") {
                event.currentTarget.dataset.voiceCompleted = "false";
                event.currentTarget.dataset.voiceFailed = "false";
                setVoicePlaying(true);
              }
            }}
            onPause={(event) => {
              const element = event.currentTarget;
              if (audioActivity.current.hostActivity === "active" && !audioActivity.current.skipActive && !element.ended && element.dataset.shouldPlay === "true" && element.dataset.playerPlayback === "playing") {
                element.dataset.playerPlayback = "interrupted";
                refreshAudioTransport(revision => revision + 1);
              }
              if (track.bus === "voice") setVoicePlaying(false);
            }}
            onEnded={(event) => {
              event.currentTarget.dataset.playerPlayback = "ended";
              refreshAudioTransport(revision => revision + 1);
              if (track.bus === "voice") {
                event.currentTarget.dataset.voiceCompleted = "true";
                setVoicePlaying(false);
              }
            }}
            onError={(event) => audioFailed(event.currentTarget)}
          />
        ))}
        {hostActivity === "active" && !skipActive && appliedAudio.some(track => {
          const element = audioElements.current.get(track.bus);
          return element?.isConnected && element.dataset.assetId === track.assetId && element.dataset.shouldPlay === "true" && !element.ended && !element.error && ["blocked", "interrupted", "paused-by-policy"].includes(element.dataset.playerPlayback ?? "");
        }) && (
          <aside className="player-audio-recovery" role="status" aria-live="polite">
            <span>声音尚未播放或已中断。点击恢复声音；也可关闭自动播放，手动阅读。</span>
            <button type="button" onClick={() => {
              for (const element of audioElements.current.values()) {
                if (element.paused && element.dataset.shouldPlay === "true" && !element.ended && !element.error && element.dataset.voiceCompleted !== "true" && element.dataset.voiceFailed !== "true") requestAudio(element);
              }
            }}>恢复声音</button>
          </aside>
        )}
        {hostActivity === "active" && !skipActive && stage.video !== null && videoElement.current?.isConnected && !videoElement.current.ended && !videoElement.current.error && ["blocked", "interrupted", "paused-by-policy"].includes(videoElement.current.dataset.playerPlayback ?? "") && (
          <aside className="player-audio-recovery" role="status" aria-live="polite">
            <span>视频尚未播放或已中断。点击恢复视频，继续观看当前内容。</span>
            <button type="button" onClick={() => { if (videoElement.current !== null) requestVideo(videoElement.current); }}>恢复视频</button>
          </aside>
        )}
        {memoryPressureMessage !== "" && !readingMenuOpen && !historyPanelOpen && !savePanelOpen && !preferencesOpen && !additionalContentOpen && !artworkView && <aside className="player-memory-pressure" role="status" aria-live="polite"><span>{memoryPressureMessage}</span>
          {["error", "deferred"].includes(memoryPressureStatus) && <button type="button" onClick={() => setMemoryPressureRetry(attempt => attempt + 1)}>重试内存保护</button>}
          {memoryPressureStatus !== "protecting" && <button type="button" onClick={() => setMemoryPressureMessage("")}>知道了</button>}
        </aside>}
        {hostActivity === "suspended" && (
          <div className="player-host-suspended" role="status" aria-live="polite">
            <span>PLAYER PAUSED</span>
            <strong>宿主已暂停</strong>
            <p>剧情状态已冻结，返回应用后继续。</p>
          </div>
        )}
        <header hidden={content.kind === 'title' || appearance !== null} className="player-brand" aria-label="播放器状态">
          <span className="player-brand__mark" aria-hidden="true">W</span>
          <span>WorLd Player</span>
          <span className="player-brand__status">{snapshot.status}</span>
          {lastEffectOperation !== null && <span className="player-brand__effect">FX {lastEffectOperation.sequence + 1} · {lastEffectOperation.kind}</span>}
        </header>
        {snapshot.sceneReplay.active && (
          <aside className="player-replay-status" role="status" aria-label="场景回想状态">
            <div><span>SCENE REPLAY</span><strong>正在回想：{snapshot.sceneReplay.title}</strong><small>回想期间不会覆盖原剧情进度</small></div>
            <button ref={replayExitButton} type="button" aria-label="退出回想，返回原剧情" onClick={exitSceneReplay}>退出回想</button>
          </aside>
        )}
        {content.kind !== 'title' && <div className="player-compact-toolbar" inert={artworkView} style={componentLayout && layoutSurface === "reading" ? componentLayout.secondary : undefined}>
          {layoutSurface === "reading" && inlineLayoutComponents}
          {canViewArtwork && <button type="button" className="player-artwork-trigger" aria-label="欣赏画面" title="隐藏对白并停止自动推进（H）" disabled={hostActivity !== 'active' || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen || readingMenuOpen} onClick={showArtwork}><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-7 5 8" /></svg> {silentReading ? '画面' : '欣赏画面'}</button>}
          {silentReading && <><span className="player-sound-status" role="status">本次无声阅读。进度和个人音量未改变；恢复时会重新播放当前声音。</span><button type="button" aria-label="恢复当前声音" title="本次无声阅读；点击重新播放当前声音，不改变剧情进度或个人音量" disabled={hostActivity !== 'active' || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen || readingMenuOpen} onClick={() => { setSilentReading(false); setMediaErrors(current => current.filter(id => !audibleTracks.some(track => track.assetId === id))); queueMicrotask(() => reading.element.current?.focus({ preventScroll: true })); }}>无声 · 恢复</button></>}
          {autoEnabled && <button type="button" aria-label="停止自动阅读" onClick={() => { playbackAdvance.cancel(); setAutoEnabled(false); setAutoPlayback('off'); }}>自动中 · 停止</button>}
          <button ref={readingMenuTrigger} type="button" aria-label={readingMenuOpen ? '关闭阅读菜单' : '打开阅读菜单'} aria-expanded={readingMenuOpen} aria-controls="player-reading-menu" disabled={hostActivity !== 'active' || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen} onClick={event => { if (readingMenuOpen) closeReadingMenu(); else { readingMenuReturnTrigger.current = event.currentTarget; stopSkip(); setReadingMenuOpen(true); } }}>{readingMenuOpen ? '返回故事 ×' : '菜单 ☰'}</button>
        </div>}
        {compactReading && content.kind !== 'title' && !silentReading && !autoEnabled && <p className="player-portrait-hint">横屏更适合观看演出</p>}
        <div {...(readingMenuOpen ? panelProps('menu') : {})} id="player-reading-menu" ref={readingMenu} className="player-control-layer" data-open={readingMenuOpen} inert={artworkView} role={readingMenuOpen ? 'dialog' : undefined} aria-modal={readingMenuOpen ? true : undefined} aria-label={readingMenuOpen ? '阅读菜单' : undefined}>
        <PlayerPanelRegion enabled={menuLayout.enabled} rect={menuLayout.layout?.secondary} kind="secondary">
          {readingMenuOpen && <header className="player-reading-menu-heading"><strong>阅读菜单</strong><span>剧情暂停推进，设置后返回当前段落。</span><button type="button" onClick={closeReadingMenu}>返回故事</button></header>}
        </PlayerPanelRegion>
        <PlayerPanelRegion enabled={menuLayout.enabled} rect={menuLayout.layout?.primary} kind="primary">
        {readingMenuOpen && panelComponents("menu", true)}
        <nav hidden={content.kind === 'title'} className="player-history-controls" aria-label="剧情历史控制">
          <h3 className="player-menu-only player-menu-section-title">回看与内容</h3>
          <button className="player-menu-only" ref={preferencesTrigger} type="button" aria-label="打开玩家设置" disabled={hostActivity !== 'active' || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen} onClick={event => { infoTrigger.current = event.currentTarget; stopSkip(); setReadingMenuOpen(false); setInfoView('preferences'); setPreferencesOpen(true); }}>设置</button>
          {hasWebCredits(credits) && <button className="player-menu-only" type="button" disabled={hostActivity !== 'active' || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen} onClick={openCredits}>制作名单</button>}
          <button
            type="button"
            aria-label="后退一步"
            disabled={hostActivity !== "active" || snapshot.history?.canBack !== true}
            onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }}
            onClick={() => applyIntent({ kind: "back" }, pointerInput.current)}
          ><span aria-hidden="true">←</span><span>后退</span></button>
          <span className="player-history-controls__position" aria-label="历史位置">{snapshot.history?.cursor ?? 0}/{snapshot.history?.length ?? 0}</span>
          <button
            type="button"
            aria-label="前进一步"
            disabled={hostActivity !== "active" || snapshot.history?.canForward !== true}
            onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }}
            onClick={() => applyIntent({ kind: "forward" }, pointerInput.current)}
          ><span>前进</span><span aria-hidden="true">→</span></button>
          <button
            type="button"
            className="player-history-controls__open"
            aria-label={historyPanelOpen ? "关闭剧情历史" : "打开剧情历史"}
            aria-expanded={historyPanelOpen}
            onClick={event => { historyDialogTrigger.current = event.currentTarget; setReadingMenuOpen(false); if (historyPanelOpen) closeHistoryPanel(); else setHistoryPanelOpen(true); }}
          ><span aria-hidden="true">☰</span><span>历史</span></button>
          <button
            ref={additionalContentTrigger}
            type="button"
            className="player-history-controls__additional player-menu-only"
            aria-label={additionalContentOpen ? "关闭附加内容" : "打开附加内容"}
            aria-expanded={additionalContentOpen}
            disabled={snapshot.sceneReplay.active || hostActivity !== "active" || snapshot.status === "waiting-effect" || snapshot.status === "waiting-barrier"}
            onClick={() => {
              if (additionalContentOpen) closeAdditionalContent();
              else openAdditionalContent();
            }}
          ><span aria-hidden="true">✦</span><span>附加内容</span></button>
        </nav>
        {historyPanelOpen && (
          <aside {...panelProps('history')} ref={historyPanelElement} className="player-history-panel" role="dialog" aria-label="剧情历史" aria-modal="false">
            <PlayerPanelRegion enabled={historyLayout.enabled} rect={historyLayout.layout?.secondary} kind="secondary">
            <header>
              <div><span>HISTORY</span><h2>剧情历史</h2></div>
              <button type="button" aria-label="关闭剧情历史" onClick={closeHistoryPanel}>关闭</button>
            </header>
            </PlayerPanelRegion>
            <PlayerPanelRegion enabled={historyLayout.enabled} rect={historyLayout.layout?.primary} kind="primary">
            {panelComponents("history", true)}
            {snapshot.history === null ? <p className="player-history-panel__empty">故事开始后会在这里显示历史。</p> : <PlayerHistoryContent history={snapshot.history} locale={typography.locale} canNavigate={hostActivity === 'active'} renderText={text => <PlayerRichText text={text} locale={typography.locale} />} onNavigate={entryId => {
              applyIntent({ kind: 'history-back-to', entryId }, pointerInput.current);
              setHistoryPanelOpen(false);
              queueMicrotask(() => reading.element.current?.focus({ preventScroll: true }));
            }} />}
            </PlayerPanelRegion>
            {panelComponents("history")}{panelAudit("history")}
          </aside>
        )}
        {additionalContentOpen && (
          <aside {...panelProps(additionalSurface)} ref={additionalContentPanel} className="player-additional-content" data-gallery-preview={selectedGalleryAssetId !== null} role="dialog" aria-label="附加内容" aria-modal="true">
            <PlayerPanelRegion enabled={additionalLayout.enabled} rect={additionalLayout.layout?.secondary} kind="secondary">
            <header>
              <div><span>EXTRAS</span><h2>{additionalLayout.enabled ? WEB_ADDITIONAL_LAYOUT_LABELS[additionalSurface] : "附加内容"}</h2></div>
              <button ref={additionalContentClose} type="button" aria-label="返回剧情" onClick={closeAdditionalContent}>返回剧情</button>
              {additionalLayout.enabled && additionalContentView !== "overview" && <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => setAdditionalContentView("overview")}>← 返回总览</button>}
            </header>
            </PlayerPanelRegion>
            <PlayerPanelRegion enabled={additionalLayout.enabled} rect={additionalLayout.layout?.primary} kind="primary">
            {collection.error && <p className="player-collection-error" role="alert">本机收藏记录暂时无法读取或保存。本次记录仍在，请保留故事存档后重试。<button type="button" onClick={collection.retry}>重试保存收藏</button></p>}
            {replayArchive.error && <p className="player-collection-error" role="alert">本机回想记录暂时无法读取或保存。本次游玩仍可继续，请稍后重试。<button type="button" onClick={replayArchive.retry}>重试保存回想</button></p>}
            {additionalContentView === "overview" && <>
              <p className="player-additional-content__intro">随着剧情推进，已发现的收藏与结局会自动记录在这里。</p>
              <div className="player-additional-content__grid">
                {([
                  ["CG 画廊", "在剧情中看过的画面会自动收录", snapshot.additionalContent.gallery, "gallery"],
                  ["场景回想", "达成相关结局后，可以重温对应场景", snapshot.additionalContent.replay, "replay"],
                  ["音乐室", "在剧情中听过的音乐会自动收录", snapshot.additionalContent.music, "music"],
                  ["结局", "达成的结局会自动记录", snapshot.additionalContent.endings, "endings"]
                ] as const).map(([title, description, category, target]) => (
                  <section key={title} role="group" aria-label={title} data-empty={category.total === 0} data-locked={category.locked}>
                    <span>{category.total === 0 ? "暂无内容" : `${category.unlocked} / ${category.total} 已发现`}</span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                    {category.total > 0 && category.locked > 0 && <small>{category.locked} 项尚未发现</small>}
                    {target !== null && <button ref={target === "gallery" ? galleryOverviewTrigger : target === "replay" ? replayOverviewTrigger : target === "music" ? musicOverviewTrigger : endingOverviewTrigger} type="button" disabled={category.total === 0} aria-label={`查看 ${title}`} onClick={() => setAdditionalContentView(target)}>查看内容</button>}
                  </section>
                ))}
              </div>
            </>}
            {additionalContentView === "gallery" && <section className="player-additional-content__detail" role="region" aria-label="CG 画廊内容">
              {!additionalLayout.enabled && <div className="player-additional-content__detail-heading">
                <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => { setSelectedGalleryAssetId(null); setAdditionalContentView("overview"); }}>← 返回总览</button>
                <div><span>GALLERY</span><h3>CG 画廊</h3><p>{snapshot.additionalContent.gallery.unlocked} / {snapshot.additionalContent.gallery.total} 已发现</p></div>
              </div>}
              {additionalLayout.enabled && <p>{snapshot.additionalContent.gallery.unlocked} / {snapshot.additionalContent.gallery.total} 已发现</p>}
              {snapshot.additionalContent.galleryItems.length === 0
                ? <p className="player-additional-content__empty">这个故事暂时没有可收录的画面。</p>
                : <div className="player-additional-content__items">
                  {snapshot.additionalContent.galleryItems.map((item, index) => {
                    if (!item.unlocked && item.displayName === null) return <article className="player-additional-content__item is-locked" key={item.assetId}>
                      <div aria-hidden="true">?</div><strong>未发现的画面</strong><span>继续推进剧情来发现</span>
                    </article>;
                    if (!item.unlocked) {
                      const cover = item.coverAssetId === null ? undefined : additionalContentSources.get(item.coverAssetId);
                      return <article className="player-additional-content__item is-locked is-revealed" key={item.assetId}>
                        {cover?.mimeType.startsWith("image/") === true ? <DeferredAtlasImage atlas={cover.atlas} src={cover.url} alt="" /> : <div aria-hidden="true">◇</div>}
                        <strong>{item.displayName}</strong><span>尚未发现</span>
                      </article>;
                    }
                    if (item.displayName === null) return null;
                    const source = additionalContentSources.get(item.assetId);
                    const unavailable = source === undefined || !source.mimeType.startsWith("image/") || additionalContentMediaErrors.includes(item.assetId);
                    return <article className="player-additional-content__item" key={item.assetId} data-resource={unavailable ? "missing" : "ready"}>
                      {unavailable ? <div className="player-additional-content__missing" role="status" aria-label={`${item.displayName} 资源状态`}>
                        <strong>{item.displayName}</strong><span>资源暂不可用</span><small>收藏记录仍然保留，请稍后重试。</small>
                        {(source !== undefined || onRetryMedia !== undefined) && <button type="button" onClick={() => { setAdditionalContentMediaErrors(current => current.filter(id => id !== item.assetId)); onRetryMedia?.(); }}>重试资源</button>}
                      </div> : <button type="button" aria-label={`查看画面 ${item.displayName}`} onClick={(event) => { galleryPreviewTrigger.current = event.currentTarget; setSelectedGalleryAssetId(item.assetId); }}>
                        <DeferredAtlasImage atlas={source.atlas} src={source.url} alt={item.displayName} onResourceFailure={() => setAdditionalContentMediaErrors((current) => [...new Set([...current, item.assetId])])} onError={() => setAdditionalContentMediaErrors((current) => [...new Set([...current, item.assetId])])} />
                        <span><small>画面 {index + 1}</small><strong>{item.displayName}</strong></span>
                      </button>}
                    </article>;
                  })}
                </div>}
            </section>}
            {additionalContentView === "replay" && <section className="player-additional-content__detail" role="region" aria-label="场景回想内容">
              {!additionalLayout.enabled && <div className="player-additional-content__detail-heading">
                <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => setAdditionalContentView("overview")}>← 返回总览</button>
                <div><span>SCENE REPLAY</span><h3>场景回想</h3><p>{snapshot.additionalContent.replay.unlocked} / {snapshot.additionalContent.replay.total} 已解锁</p></div>
              </div>}
              {additionalLayout.enabled && <p>{snapshot.additionalContent.replay.unlocked} / {snapshot.additionalContent.replay.total} 已解锁</p>}
              <p className="player-additional-content__replay-note">回想会从你实际走过的场景入口重新开始；退出后，剧情、演出和播放状态都会回到进入前。</p>
              {snapshot.sceneReplay.error !== null && <p className="player-additional-content__replay-error" role="alert">{snapshot.sceneReplay.error}</p>}
              {snapshot.additionalContent.replayItems.some(item => item.unlocked && !canEnterPlayerCoreReplayV1(state, item.replayId)) && <div className="player-replay-context">
                <p>这段回想尚未保留路线入口。请读取包含该场景的旧存档，或重新走过对应路线；之后可直接从这里重温。</p>
                {saveStore && <button type="button" onClick={() => { setAdditionalContentOpen(false); openSavePanel('load'); }}>读取路线存档</button>}
              </div>}
              {snapshot.additionalContent.replayItems.length === 0
                ? <p className="player-additional-content__empty">这个故事暂时没有可回想的场景。</p>
                : <ol className="player-additional-content__replay">
                  {snapshot.additionalContent.replayItems.map((item, index) => <li key={item.replayId} data-unlocked={item.unlocked}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item.coverAssetId !== null && additionalContentSources.get(item.coverAssetId)?.mimeType.startsWith("image/") === true && <DeferredAtlasImage atlas={additionalContentSources.get(item.coverAssetId)!.atlas} className="player-additional-content__catalog-cover" src={additionalContentSources.get(item.coverAssetId)!.url} alt="" />}
                    <div><strong>{item.title ?? "未解锁的场景"}</strong><small>{!item.unlocked ? "达成相关结局后解锁" : canEnterPlayerCoreReplayV1(state, item.replayId) ? "按当时的路线重温 · 原进度保持" : "已解锁 · 等待路线入口"}</small></div>
                    <button type="button" disabled={!canEnterPlayerCoreReplayV1(state, item.replayId)} aria-label={item.unlocked ? `开始回想 ${item.title}` : `场景 ${index + 1} 尚未解锁`} onClick={() => enterSceneReplay(item.replayId)}>{item.unlocked ? "开始回想" : "未解锁"}</button>
                  </li>)}
                </ol>}
            </section>}
            {additionalContentView === "music" && <section className="player-additional-content__detail" role="region" aria-label="音乐室内容">
              {!additionalLayout.enabled && <div className="player-additional-content__detail-heading">
                <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => setAdditionalContentView("overview")}>← 返回总览</button>
                <div><span>MUSIC</span><h3>音乐室</h3><p>{snapshot.additionalContent.music.unlocked} / {snapshot.additionalContent.music.total} 已收录</p></div>
              </div>}
              {additionalLayout.enabled && <p>{snapshot.additionalContent.music.unlocked} / {snapshot.additionalContent.music.total} 已收录</p>}
              {snapshot.additionalContent.musicItems.length === 0
                ? <p className="player-additional-content__empty">这个故事暂时没有可收录的音乐。</p>
                : <ol className="player-additional-content__music">
                  {snapshot.additionalContent.musicItems.map((item, index) => {
                    if (!item.unlocked) return <li className="is-locked" key={item.assetId}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {item.coverAssetId !== null && additionalContentSources.get(item.coverAssetId)?.mimeType.startsWith("image/") === true && <DeferredAtlasImage atlas={additionalContentSources.get(item.coverAssetId)!.atlas} className="player-additional-content__catalog-cover" src={additionalContentSources.get(item.coverAssetId)!.url} alt="" />}
                      <div><strong>{item.displayName ?? "未发现的音乐"}</strong><small>继续推进剧情来收录</small></div>
                    </li>;
                    const source = additionalContentSources.get(item.assetId);
                    const unavailable = source === undefined || !source.mimeType.startsWith("audio/") || additionalContentMediaErrors.includes(item.assetId);
                    return <li key={item.assetId} data-resource={unavailable ? "missing" : "ready"}>
                      <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.displayName}</strong>{unavailable
                        ? <><small role="status">资源暂不可用，收录记录仍然保留。</small>{onRetryMedia !== undefined && <button type="button" onClick={() => { setAdditionalContentMediaErrors([]); onRetryMedia(); }}>重试资源</button>}</>
                        : <PlayerMusicPreview src={source.url} label={`试听 ${item.displayName}`} muted={effectiveMuted} volume={galAudioGainV1(settingsApplication, 'bgm')} active={hostActivity === "active"} onError={() => setAdditionalContentMediaErrors((current) => [...new Set([...current, item.assetId])])} />}</div>
                    </li>;
                  })}
                </ol>}
            </section>}
            {additionalContentView === "endings" && <section className="player-additional-content__detail" role="region" aria-label="结局内容">
              {!additionalLayout.enabled && <div className="player-additional-content__detail-heading">
                <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => setAdditionalContentView("overview")}>← 返回总览</button>
                <div><span>ENDINGS</span><h3>结局</h3><p>{snapshot.additionalContent.endings.unlocked} / {snapshot.additionalContent.endings.total} 已达成</p></div>
              </div>}
              {additionalLayout.enabled && <p>{snapshot.additionalContent.endings.unlocked} / {snapshot.additionalContent.endings.total} 已达成</p>}
              {snapshot.additionalContent.endingItems.length === 0
                ? <p className="player-additional-content__empty">这个故事暂时没有可记录的结局。</p>
                : <ol className="player-additional-content__endings">
                  {snapshot.additionalContent.endingItems.map((item, index) => <li key={item.endingId} data-unlocked={item.unlocked}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item.coverAssetId !== null && additionalContentSources.get(item.coverAssetId)?.mimeType.startsWith("image/") === true && <DeferredAtlasImage atlas={additionalContentSources.get(item.coverAssetId)!.atlas} className="player-additional-content__catalog-cover" src={additionalContentSources.get(item.coverAssetId)!.url} alt="" />}
                    <div><strong>{item.name ?? "未发现的结局"}</strong><small>{item.unlocked ? "已达成" : "继续探索不同选择"}</small></div>
                  </li>)}
                </ol>}
            </section>}
            {panelComponents(additionalSurface, true)}</PlayerPanelRegion>
            {panelComponents(additionalSurface)}{panelAudit(additionalSurface)}
            {selectedGalleryAssetId !== null && (() => {
              const item = snapshot.additionalContent.galleryItems.find(candidate => candidate.assetId === selectedGalleryAssetId);
              const source = additionalContentSources.get(selectedGalleryAssetId);
              const name = item?.unlocked ? item.displayName ?? "画面" : "画面";
              const unavailable = !item?.unlocked || !source?.mimeType.startsWith("image/") || additionalContentMediaErrors.includes(selectedGalleryAssetId);
              return <figure className="player-additional-content__preview" role="dialog" aria-modal="true" aria-label={`${name} 画面预览`}>
                {unavailable || !source ? <p role="status">资源暂不可用，关闭后可在画廊重试。收藏记录仍然保留。</p> : <DeferredAtlasImage atlas={source.atlas} src={source.url} alt="" onResourceFailure={() => setAdditionalContentMediaErrors(current => [...new Set([...current, selectedGalleryAssetId])])} onError={() => setAdditionalContentMediaErrors(current => [...new Set([...current, selectedGalleryAssetId])])} />}
                <figcaption><strong>{name}</strong><button ref={galleryPreviewClose} type="button" aria-label="关闭画面预览" onClick={() => setSelectedGalleryAssetId(null)}>关闭预览</button></figcaption>
              </figure>;
            })()}
          </aside>
        )}
        {typography.projectFont !== null && <output className="player-font-status" role="status" aria-label="字体状态">
          {fontStatus === "ready" ? `${typography.projectFont.displayName} · 项目字体已加载`
            : fontStatus === "loading" ? `${typography.projectFont.displayName} · 正在加载项目字体`
              : `${typography.projectFont.displayName} 加载失败，已回退到 ${typography.locale} 可读字体`}
        </output>}
        {(localizedMedia.fallbackResourceIds.length > 0 || localizedMedia.missingResourceIds.length > 0) && (
          <output className={`player-media-locale-status${typography.projectFont === null ? " player-media-locale-status--first" : ""}`} role="status" aria-label="语言资源状态">
            {localizedMedia.fallbackResourceIds.length > 0
              ? `${snapshot.localization.selectedLocale} 缺少 ${localizedMedia.fallbackResourceIds.length} 个语言资源，已使用 ${snapshot.localization.sourceLocale} 资源`
              : `${snapshot.localization.selectedLocale} 缺少 ${localizedMedia.missingResourceIds.length} 个语言资源，当前资源不可用`}
          </output>
        )}
        <div hidden={content.kind === 'title'} className="player-playback-controls" aria-label="播放控制">
          <h3 className="player-menu-only player-menu-section-title">自动阅读与快进</h3>
          <label className="player-menu-only">自动阅读节奏<select aria-label="自动阅读节奏" value={readingPace} onChange={event => {
            const pace = event.target.value as PlayerReadingPace; setReadingPace(pace);
            try { if (!editorPreview) storePlayerReadingPace(globalThis.localStorage, project.manifest.projectId, pace); } catch { /* Denied storage does not block reading. */ }
          }}><option value="standard">标准</option><option value="calm">从容</option><option value="brisk">快速</option><option value="policy">原速</option></select></label>
          {content.kind !== 'title' && snapshot.localization.availableLocales.length > 1 && <>
            <label className="player-locale-control player-menu-only">语言<select aria-label="显示语言" value={snapshot.localization.selectedLocale} onChange={(event) => {
              const locale = event.target.value;
              setState((current) => configurePlayerCoreLocaleV1(current, locale));
              if (!editorPreview) storePlayerLocalePreference(project.manifest.projectId, locale);
            }}>{snapshot.localization.availableLocales.map((locale) => <option key={locale} value={locale}>{locale}</option>)}</select></label>
            <span className="player-menu-only" role="status" aria-label="语言状态">{snapshot.localization.selectedLocale === snapshot.localization.sourceLocale
              ? `${snapshot.localization.sourceLocale} · 工程源语言`
              : snapshot.localization.missingTranslationCount > 0
                ? `${snapshot.localization.selectedLocale} · ${snapshot.localization.missingTranslationCount} 项缺失译文继续显示 ${snapshot.localization.sourceLocale} 原文`
                : `${snapshot.localization.selectedLocale} · 翻译完整`}</span>
          </>}
          <button
            type="button"
            aria-label="自动播放"
            aria-pressed={autoEnabled}
            disabled={snapshot.status !== "presenting" || (content.kind !== "dialogue" && content.kind !== "narration")}
            onClick={() => {
              stopSkip();
              setAutoEnabled((enabled) => {
                setAutoPlayback(enabled ? "off" : hostActivity === "active" ? (textReady ? "waiting" : "waiting-text") : "suspended");
                return !enabled;
              });
            }}
          >自动</button>
          <button
            type="button"
            aria-label="快进已读"
            aria-pressed={skipMode === "skipRead"}
            disabled={snapshot.status !== "presenting"}
            onPointerDown={() => { if (skipActivation === "hold") startSkip("skipRead"); }}
            onKeyDown={(event) => { if (skipActivation === "hold" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); startSkip("skipRead"); } }}
            onClick={() => { if (skipActivation === "toggle") { if (skipMode === "skipRead") stopSkip(); else startSkip("skipRead"); } }}
          >已读</button>
          <button
            type="button"
            className="player-menu-only"
            aria-label="快进全部"
            aria-pressed={skipMode === "skipAll"}
            disabled={snapshot.status !== "presenting"}
            onPointerDown={() => { if (skipActivation === "hold") startSkip("skipAll"); }}
            onKeyDown={(event) => { if (skipActivation === "hold" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); startSkip("skipAll"); } }}
            onClick={() => { if (skipActivation === "toggle") { if (skipMode === "skipAll") stopSkip(); else startSkip("skipAll"); } }}
          >全部</button>
          <label className="player-menu-only">方式<select aria-label="快进激活方式" value={skipActivation} onChange={(event) => { stopSkip(); setSkipActivation(event.target.value as WorldPlayerSkipActivationV1); }}><option value="toggle">切换</option><option value="hold">按住</option></select></label>
          <label className="player-menu-only">速度<select aria-label="快进速度" value={String(skipSpeed)} onChange={(event) => { stopSkip(); setSkipSpeed(event.target.value === "instant" ? "instant" : Number(event.target.value) as 5 | 10 | 20 | 40); }}><option value="5">5×</option><option value="10">10×</option><option value="20">20×</option><option value="40">40×</option><option value="instant">瞬时</option></select></label>
          <span aria-live="polite">{(autoEnabled || skipActive) && stageImagesPending ? "等待画面资源，准备好后继续" : autoEnabled ? readingMenuOpen ? "返回故事后继续自动阅读" : autoPlayback === 'waiting-reading' ? "请向下读完本段，再自动继续" : autoPlayback === "suspended" ? "自动播放已暂停" : autoPlayback === "waiting-voice" ? "等待语音结束，可关闭自动播放切回手动" : "自动播放中" : autoPlayback === "stopped" ? "自动播放已停止" : "自动播放关闭"}</span>
        </div>
        {saveStore !== undefined && !snapshot.sceneReplay.active && (
          <aside className="player-save" data-open={savePanelOpen}>
            <h3 hidden={content.kind === 'title'} className="player-menu-only player-menu-section-title">进度与备份</h3>
            <div hidden={content.kind === 'title'} className="player-save__quick-controls player-menu-only" aria-label="快速存读档">
              <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || !saveBoundaryAllowed} onClick={() => void saveToSlot("quick", "quick-1")}>快速保存</button>
              <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || quickSlot === undefined} onClick={() => requestLoadFromSlot("quick-1")}>快速读取</button>
            </div>
            <button
              ref={saveToggle}
              hidden={content.kind === 'title'}
              className="player-save__toggle"
              type="button"
              aria-expanded={savePanelOpen}
              aria-controls="player-save-panel"
              onClick={() => {
                if (savePanelOpen) closeSavePanel(); else { setSaveView("manual"); openSavePanel("save"); }
              }}
            >存读档</button>
            {savePanelOpen && (
              <dialog {...panelProps('save')} ref={saveDialog} id="player-save-panel" className="player-save__panel" aria-label="存读档槽位" aria-modal="true" onCancel={event => { event.preventDefault(); if (saveOperation !== "busy") { if (pendingRead) cancelRead(); else closeSavePanel(); } }}>
                <PlayerPanelRegion enabled={saveLayout.enabled} rect={saveLayout.layout?.secondary} kind="secondary">
                <header><strong>{saveView === "backup" ? "存档备份与恢复" : saveIntent === "save" ? "保存进度" : "读取进度"}</strong><button type="button" aria-label="关闭存读档" autoFocus disabled={saveOperation === "busy"} onClick={closeSavePanel}>返回故事 ×</button><span data-save-message role={saveOperation === "error" ? "alert" : "status"}>{saveMessage}{saveOperation === "error" && saveMessage === "存档损坏或与当前构建不兼容" && <small>读取失败不会修改当前剧情或原存档，可返回故事或尝试其他存档。</small>}</span></header>
                </PlayerPanelRegion>
                <PlayerPanelRegion enabled={saveLayout.enabled} rect={saveLayout.layout?.primary} kind="primary">
                {panelComponents("save", true)}
                {pendingRead ? <section className="player-load-confirm" role="region" aria-label="确认读取存档">
                  <h3>读取{playerSaveLabel(pendingRead.slotId)}？</h3><p>当前未保存的进度会被所选存档替换。取消可回到槽位列表。</p>
                  <p>当前：{project.scenes.find(scene => scene.id === state.runtimeState?.cursor.sceneId)?.title ?? '当前故事'}</p>
                  <div className="player-load-confirm__target"><strong>将读取的进度</strong><div><PlayerSaveDetails slot={pendingRead.slot} /></div></div>
                  <footer><button type="button" autoFocus disabled={saveOperation === 'busy'} onClick={cancelRead}>取消读取</button><button type="button" disabled={hostActivity !== 'active' || saveOperation === 'busy'} onClick={() => void loadFromSlot(pendingRead.slotId, pendingRead.expectedArtifactHash)}>确认读取</button></footer>
                </section> : <>
                <nav className="player-save-intent" aria-label="存读档操作"><button type="button" disabled={saveOperation === 'busy' || !saveBoundaryAllowed || snapshot.sceneReplay.active} aria-pressed={saveIntent === 'save'} onClick={() => { setSaveIntent('save'); setPendingOverwriteSlotId(null); if (saveView !== 'manual' && saveView !== 'quick') setSaveView('manual'); }}>保存进度</button><button ref={readIntentTrigger} type="button" disabled={saveOperation === 'busy'} aria-pressed={saveIntent === 'load'} onClick={() => { setSaveIntent('load'); setPendingOverwriteSlotId(null); }}>读取进度</button></nav>
                <p className="player-save-intro">{saveIntent === 'save' ? '选择一个手动或快速槽位保存当前故事。已有存档需要确认覆盖。' : '选择一个已有存档继续阅读。空槽位没有可读取的进度。'}</p>
                <nav className="player-save__views" aria-label="存档类型">
                  <button type="button" disabled={saveOperation === "busy"} aria-pressed={saveView === "manual"} onClick={() => setSaveView("manual")}>手动</button>
                  <button type="button" disabled={saveOperation === "busy"} aria-pressed={saveView === "auto"} onClick={() => { setSaveIntent("load"); setSaveView("auto"); }}>自动</button>
                  <button type="button" disabled={saveOperation === "busy"} aria-pressed={saveView === "quick"} onClick={() => setSaveView("quick")}>快速</button>
                  <button type="button" disabled={saveOperation === "busy"} aria-pressed={saveView === "checkpoint"} onClick={() => { setSaveIntent("load"); setSaveView("checkpoint"); }}>检查点</button>
                  <button type="button" disabled={saveOperation === "busy"} aria-pressed={saveView === "backup"} onClick={() => setSaveView("backup")}>备份</button>
                </nav>
                {saveView === "backup" && saveCoordinator !== undefined && <PlayerSaveBackupPanel key={`${project.manifest.projectId}:${snapshot.identities.buildId}`} state={state} store={saveStore} coordinator={saveCoordinator} slots={saveSlots}
                  currentAllowed={saveBoundaryAllowed && !snapshot.sceneReplay.active} captureCurrent={() => captureCurrentSlot("manual", "manual-1")}
                  onImported={async () => { await refreshSaveSlots(); }} onRead={requestLoadFromSlot} externalBusy={saveOperation === "busy"}
                  onBusyChange={busy => { setSaveOperation(busy ? "busy" : "idle"); setSaveMessage(busy ? "正在处理备份…" : "备份与恢复"); }}
                  isCurrent={() => saveContext.current.projectId === project.manifest.projectId && saveContext.current.store === saveStore && liveState.current.artifacts?.manifest.buildId === snapshot.identities.buildId} />}
                {saveView !== 'backup' && <div className="player-save-grid">{(saveView === 'manual' ? Array.from({ length: 6 }, (_, index) => `manual-${savePage * 6 + index + 1}`) : saveView === 'auto' ? Array.from({ length: 5 }, (_, index) => `auto-${index + 1}`) : saveView === 'checkpoint' ? Array.from({ length: 3 }, (_, index) => `checkpoint-${index + 1}`) : ['quick-1']).map(slotId => {
                  const slot = saveSlots.find(candidate => candidate.slotId === slotId);
                  return <PlayerSaveCard key={slotId} slotId={slotId} slot={slot} intent={saveIntent} disabled={hostActivity !== 'active' || saveOperation === 'busy'} canSave={saveBoundaryAllowed && !snapshot.sceneReplay.active} overwrite={pendingOverwriteSlotId === slotId}
                    preview={<PlayerSavePreview projectId={project.manifest.projectId} slot={slot} store={saveStore} />}
                    onSave={() => slotId.startsWith('quick-') ? void saveToSlot('quick', slotId) : requestSaveToSlot(slotId, slot !== undefined)} onRead={() => requestLoadFromSlot(slotId)} />;
                })}</div>}
                {saveView === 'manual' && <nav className="player-save__pages" aria-label="手动存档分页"><button type="button" disabled={savePage === 0 || saveOperation === 'busy'} onClick={() => { setSavePage(0); setPendingOverwriteSlotId(null); }}>上一页</button><span>第 {savePage + 1} / 2 页</span><button type="button" disabled={savePage === 1 || saveOperation === 'busy'} onClick={() => { setSavePage(1); setPendingOverwriteSlotId(null); }}>下一页</button></nav>}
                </>}
                </PlayerPanelRegion>
                {panelComponents("save")}{panelAudit("save")}
              </dialog>
            )}
          </aside>
        )}
        {readingMenuOpen && !editorPreview && <PlayerPublicationTools onOpenBackup={openPublicationBackup} />}
        </PlayerPanelRegion>
        {readingMenuOpen && <>{panelComponents("menu")}{panelAudit("menu")}</>}
        </div>
        {saveFeedback && !savePanelOpen && !storyAdvance.busy && !storyAdvance.error && !playbackAdvance.busy && !playbackAdvance.error && <p className="player-save-feedback" role="status" aria-live="polite">{saveFeedback}</p>}
        {backgroundSaveFailure && content.kind !== "title" && !savePanelOpen && !readingMenuOpen && !preferencesOpen && !historyPanelOpen && !additionalContentOpen && !artworkView && !snapshot.sceneReplay.active && <aside className="player-background-save-notice" role="alert" aria-label="后台保存提醒">
          <div><strong>{backgroundSaveFailure.kind === "auto" ? "自动保存未完成" : "检查点未保存"}</strong><p>{backgroundSaveFailure.message}</p></div>
          <div className="player-background-save-notice__actions"><button type="button" disabled={!saveBoundaryAllowed || hostActivity !== "active"} onClick={() => { setSaveIntent("save"); setSaveView("manual"); setPendingOverwriteSlotId(null); openSavePanel(); }}>保存当前进度</button><button type="button" aria-label="关闭保存提醒" onClick={() => setBackgroundSaveFailure(null)}>知道了</button></div>
        </aside>}
        {(playbackAdvance.busy || playbackAdvance.error) && !readingMenuOpen && !preferencesOpen && !historyPanelOpen && !savePanelOpen && !additionalContentOpen && !artworkView && <aside className="player-story-progress" role={playbackAdvance.error ? 'alert' : 'status'}>
          <span>{playbackAdvance.error ?? (autoEnabled ? '正在自动继续，当前句保持不变…' : '正在快进，当前句保持不变…')}</span>
          <button type="button" onClick={() => { playbackAdvance.cancel(); stopSkip(); setAutoEnabled(false); setAutoPlayback('off'); reading.element.current?.focus({ preventScroll: true }); }}>{playbackAdvance.error ? '切回手动阅读' : '停止并留在当前句'}</button>
        </aside>}
        {content.kind !== "title" && recoveryStore !== undefined && !snapshot.sceneReplay.active && (recoveryCandidate !== null || recoveryOperation === "error") && (
          <aside className="player-recovery" role={recoveryOperation === "error" ? "alert" : "status"} aria-live="polite">
            <div>
              <strong>{recoveryOperation === "error" ? "恢复保护需要处理" : "发现可恢复进度"}</strong>
              <span>{recoveryMessage}</span>
              {recoveryCandidate !== null && <small>{recoveryCandidate.sceneId} · {new Date(recoveryCandidate.savedAtEpochMilliseconds).toLocaleString("zh-CN", { hour12: false })} · 本地时间</small>}
            </div>
            {recoveryCandidate !== null && <button type="button" disabled={hostActivity !== "active" || !recoveryBuildCompatible} onClick={() => void restoreRecovery()}>恢复上次进度</button>}
            <button type="button" disabled={recoveryErrorAction === "retry" && recoveryWritePending.current?.coordinator === recoveryCoordinator} onClick={() => {
              if(recoveryErrorAction === "load"){void restoreRecovery();return;}
              if (recoveryErrorAction === "retry") {
                setRecoveryOperation("idle");
                setRecoveryErrorAction(null);
              } else void clearRecovery();
            }}>{recoveryErrorAction === "load" ? "重试读取恢复记录" : recoveryErrorAction === "retry" ? "重试恢复保护" : "放弃并清除"}</button>
          </aside>
        )}

        {(stage.missingAssetIds.length > 0 || visibleMediaErrors.length > 0) && (
          <div className="player-media-error" role="alert">
            {(stage.missingAssetIds.length > 0 || visualMediaErrors.length > 0) && <span>媒体未能安全呈现：{[...new Set([...stage.missingAssetIds, ...visualMediaErrors])].join("、")}</span>}
            {failedAudio.map(track => <span key={track.bus}>声音“{track.displayName}”：{playerAudioFailureHint(Number(audioElements.current.get(track.bus)?.dataset.audioFailureCode))}</span>)}
            <button type="button" disabled={hostActivity !== 'active'} onClick={() => {
              if (stage.missingAssetIds.length === 0 && visualMediaErrors.length === 0) {
                setMediaErrors(current => current.filter(id => !failedAudio.some(track => track.assetId === id)));
                setAudioAttempts(current => Object.fromEntries(appliedAudio.map(track => [track.bus, (current[track.bus] ?? 0) + (failedAudio.some(failed => failed.bus === track.bus) ? 1 : 0)])));
                onRetryMedia?.();
              } else { setMediaErrors([]); setMediaGeneration(current => current + 1); onRetryMedia?.(); }
              queueMicrotask(() => reading.element.current?.focus({ preventScroll: true }));
            }}>重试媒体</button>
            {failedAudio.length > 0 && <button type="button" disabled={hostActivity !== 'active'} onClick={() => { setAutoEnabled(false); setAutoPlayback('off'); stopSkip(); setVoicePlaying(false); setSilentReading(true); setMediaErrors(current => current.filter(id => !appliedAudio.some(track => track.assetId === id))); queueMicrotask(() => reading.element.current?.focus({ preventScroll: true })); }}>本次先无声阅读</button>}
          </div>
        )}

        {content.kind === "title" && (
          <div className="player-title-screen">
            {cover?.url && failedCover !== cover.url && skin?.title.coverMode !== "stage" && <img className="player-title-cover" src={cover.url} alt="" onError={() => setFailedCover(cover.url)} />}
            <PlayerLayoutBox rect={componentLayout?.primary} kind="info">
            <p className="player-eyebrow">{appearance === null ? "A WORLd STUDIO STORY" : "视觉小说"}</p>
            <h1>{snapshot.title}</h1>
            {appearance === null ? <p>同一个故事核心，面向每一块屏幕。</p> : appearance.titleTagline && <p className="player-title-tagline">{appearance.titleTagline}</p>}
            </PlayerLayoutBox>
            <PlayerLayoutBox rect={componentLayout?.secondary} kind="actions">
            {layoutSurface === "title" && inlineLayoutComponents}
            {latestSlot && saveStore && recoveryOperation !== 'scanning' && (recoveryCandidate === null || !recoveryBuildCompatible) && <section className="player-recent-save" aria-label="最近存档"><button className="player-primary" type="button" disabled={hostActivity !== 'active' || saveOperation === 'busy'} onClick={() => requestLoadFromSlot(latestSlot.slotId, latestSlot.sessionArtifactHash)}>继续最近存档 <span aria-hidden="true">→</span></button><p>{playerSaveLabel(latestSlot.slotId)} · {latestSlot.sceneTitle} · {new Date(latestSlot.savedAtEpochMilliseconds).toLocaleString('zh-CN', { hour12: false })} · 本地时间</p></section>}
            {saveOperation === 'busy' && !savePanelOpen && <p className="player-title-load-status" role="status">正在校验存档，完成后回到故事…</p>}
            <button className={latestSlot || recoveryCandidate !== null && recoveryBuildCompatible ? 'player-secondary' : 'player-primary'} type="button" disabled={hostActivity !== "active" || saveOperation === 'busy' || recoveryOperation === "scanning"} onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => applyIntent({ kind: "primary" }, pointerInput.current)}>
              {skin?.title.startLabel ?? "开始故事"}
              <span aria-hidden="true">→</span>
            </button>
            {settingsApplication.ui.showInputHints && saveOperation !== 'busy' && recoveryOperation !== 'scanning' && <span className="player-hint">按 Enter 或空格开始</span>}
            <nav className="player-title-actions" aria-label="作品菜单">
              {saveStore !== undefined && <button ref={titleSaveTrigger} type="button" disabled={hostActivity !== 'active' || saveOperation === 'busy'} onClick={() => openSavePanel("load")}>读取存档</button>}
              <button ref={titlePreferencesTrigger} type="button" aria-label="打开玩家设置" disabled={hostActivity !== 'active' || saveOperation === 'busy'} onClick={event => { infoTrigger.current = event.currentTarget; setInfoView('preferences'); setPreferencesOpen(true); }}>设置</button>
              {hasWebCredits(credits) && <button type="button" disabled={hostActivity !== 'active' || saveOperation === 'busy'} onClick={openCredits}>制作名单</button>}
              <button ref={titleAdditionalContentTrigger} type="button" aria-label="打开附加内容" disabled={hostActivity !== 'active' || saveOperation === 'busy'} onClick={openAdditionalContent}>附加内容</button>
              {snapshot.localization.availableLocales.length > 1 && <label className="player-title-locale">语言<select aria-label="显示语言" disabled={saveOperation === 'busy'} value={snapshot.localization.selectedLocale} onChange={event => {
                const locale = event.target.value; setState(current => configurePlayerCoreLocaleV1(current, locale)); if (!editorPreview) storePlayerLocalePreference(project.manifest.projectId, locale);
              }}>{snapshot.localization.availableLocales.map(locale => <option key={locale} value={locale}>{locale}</option>)}</select></label>}
            </nav>
            {!editorPreview && <PlayerPublicationTools onOpenBackup={openPublicationBackup} />}
            {recoveryStore !== undefined && (recoveryCandidate !== null || recoveryOperation === 'scanning' || recoveryOperation === 'error' || newStoryConfirmation) && <div className="player-title-recovery" aria-label="开始与恢复进度">
              <div className="player-recovery" role={recoveryOperation === "error" ? "alert" : "status"} aria-live="polite" aria-busy={recoveryOperation === "scanning"}>
                <div><strong>{newStoryConfirmation ? "确认开始新故事？" : recoveryCandidate ? "发现可恢复进度" : "恢复保护"}</strong>
                  <span>{newStoryConfirmation ? "将清除旧的自动恢复记录。手动、快速及检查点存档保持不变。" : recoveryMessage}</span>
                  {!newStoryConfirmation && recoveryCandidate !== null && <small>{project.scenes.find(scene => scene.id === recoveryCandidate.sceneId)?.title ?? recoveryCandidate.sceneId} · {new Date(recoveryCandidate.savedAtEpochMilliseconds).toLocaleString("zh-CN", { hour12: false })} · 本地时间</small>}
                  {!newStoryConfirmation && recoveryCandidate !== null && recoveryCandidate.buildId !== state.artifacts?.manifest.buildId && <span>{recoveryBuildCompatible ? "这份旧版进度已核对兼容，可以继续上次的故事。" : "这个进度来自尚未核对的游戏版本，不能在当前版本恢复。原记录仍保留，可用对应版本继续或确认开始新故事。"}</span>}
                  {newStoryConfirmation && recoveryOperation === "error" && <span>{recoveryMessage}</span>}
                </div>
                {newStoryConfirmation ? <>
                  <button type="button" disabled={hostActivity !== "active" || recoveryOperation === "scanning"} onClick={() => {
                    void clearRecovery().then(cleared => {
                      if (!cleared) return;
                      setNewStoryConfirmation(false);
                      if (audioActivity.current.hostActivity !== "active") return;
                      setState(current => dispatchPlayerCoreIntentV1(current, project, { kind: "primary" }));
                    });
                  }}>确认开始新故事</button>
                  <button type="button" disabled={recoveryOperation === "scanning"} onClick={() => setNewStoryConfirmation(false)}>保留原进度</button>
                </> : <>
                  {recoveryOperation === "error" && <button type="button" onClick={() => {if(recoveryErrorAction==='load')void restoreRecovery();else setRecoveryScanAttempt(attempt=>attempt+1);}}>{recoveryErrorAction==='load'?'重试读取恢复记录':'重新检查恢复记录'}</button>}
                  {recoveryCandidate !== null && <button className="player-primary" type="button" disabled={hostActivity !== "active" || recoveryOperation === "scanning" || !recoveryBuildCompatible} onClick={() => void restoreRecovery()}>恢复上次进度</button>}
                  {(recoveryCandidate !== null || recoveryOperation === "error") && <button type="button" disabled={hostActivity !== "active" || recoveryOperation === "scanning"} onClick={() => void clearRecovery()}>放弃并清除</button>}
                </>}
              </div>
            </div>}
            </PlayerLayoutBox>
          </div>
        )}

        {(storyAdvance.busy || storyAdvance.error) && <aside className="player-story-progress" role={storyAdvance.error ? 'alert' : 'status'}>
          <span>{storyAdvance.error ?? '正在继续故事，当前句保持不变…'}</span>
          {storyAdvance.error ? <><button type="button" onClick={() => applyIntent({ kind: 'primary' }, 'pointer')}>重试推进</button><button type="button" onClick={() => { storyAdvance.useCompatibility(); applyIntent({ kind: 'primary' }, 'pointer'); }}>使用兼容模式继续</button></>
            : <button type="button" onClick={() => { storyAdvance.cancel(); reading.element.current?.focus({ preventScroll: true }); }}>取消推进</button>}
        </aside>}
        {artworkView && <button type="button" className="player-artwork-return" aria-label="恢复阅读" autoFocus onClick={restoreReading}><span>恢复阅读 <kbd>H / Esc</kbd></span></button>}
        {(content.kind === "dialogue" || content.kind === "narration") && (
          <button
            inert={artworkView || readingMenuOpen}
            className={`player-dialogue player-dialogue--${stage.textboxTemplate}`}
            style={componentLayout && layoutSurface === "reading" ? componentLayout.primary : undefined}
            ref={readingRef}
            type="button"
            disabled={storyAdvance.busy}
            aria-busy={storyAdvance.busy || playbackAdvance.busy}
            data-text-ready={textReady}
            data-text-reveal-duration={textRevealDuration}
            onScroll={reading.measure}
            onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; reading.gesture.current = { x: event.clientX, y: event.clientY, moved: false }; }}
            onPointerMove={event => { if (Math.abs(event.clientX - reading.gesture.current.x) + Math.abs(event.clientY - reading.gesture.current.y) > 10) reading.gesture.current.moved = true; }}
            onPointerCancel={() => { reading.gesture.current.moved = true; }}
            onClick={event => { if (event.detail > 0 && reading.gesture.current.moved) return; applyIntent({ kind: "primary" }, pointerInput.current); }}
            aria-label="继续下一句"
          >
            {content.kind === "dialogue" && <PlayerDialogueIdentity speakerId={content.speakerId} name={speakerNames[content.speakerId] ?? content.speakerId} skin={skin} media={mediaAssets} />}
            <span
              key={`${presentedText}:${textRevealDuration}`}
              ref={releaseAnimationsOnDetach}
              className="player-dialogue__text player-typography-text"
              lang={typography.locale}
              data-cjk-line-break={typography.cjk ? "strict" : "standard"}
              aria-live="polite"
              style={{ "--gal-text-reveal-duration": `${textRevealDuration}ms` } as React.CSSProperties}
            ><span className="player-story-text-motion" data-story-motion={stage.textMotion?.kind} style={storyMotionStyle(stage.textMotion)}><PlayerRichText text={content.text} locale={typography.locale} /></span></span>
            <i aria-hidden="true">{!textReady ? autoEnabled ? '显示全文并切回手动' : '点击显示全文' : reading.unread ? autoEnabled ? '读完本段后自动继续 ⌄' : '向下阅读 ⌄' : autoEnabled ? '自动阅读中 · 点按切回手动' : '点击继续 →'}</i>
          </button>
        )}
        {compactReading && (content.kind === 'dialogue' || content.kind === 'narration') && !readingMenuOpen && !preferencesOpen && <p className="player-reading-caption">{!textReady ? autoEnabled ? '自动显示中，点文字切回手动' : '点击文字显示全文' : reading.unread ? autoEnabled ? '自动等待：下滑或点文字读完本段' : '下滑或点文字，读本段下一屏' : autoEnabled ? '自动阅读中，点文字切回手动' : '点击文字继续故事'}</p>}

        {content.kind === "choice" && (
          <div className="player-choice" data-choice-layout={skin?.reading.choiceLayout && skin.reading.choiceLayout !== "inherit" ? skin.reading.choiceLayout === "columns" ? "responsive-grid" : "vertical" : settingsApplication.choice.layout} role="group" aria-labelledby="player-choice-prompt">
            <p id="player-choice-prompt" className="player-typography-text" lang={typography.locale} data-cjk-line-break={typography.cjk ? "strict" : "standard"}><PlayerRichText text={content.prompt} locale={typography.locale} /></p>
            {content.options.map((option, index) => (
              <button
                key={option.optionId}
                ref={(element) => { choiceButtons.current[index] = element; }}
                type="button"
                className={index === selectedChoiceIndex ? "is-selected" : undefined}
                data-player-selected={index === selectedChoiceIndex ? "true" : "false"}
                onFocus={() => setSelectedChoiceIndex(index)}
                onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }}
                onClick={() => applyIntent({ kind: "select-choice", optionId: option.optionId }, pointerInput.current)}
              >
                {settingsApplication.choice.showOptionNumbers && <span data-choice-number aria-hidden="true">{index + 1}</span>}<span className="player-typography-text" lang={typography.locale} data-cjk-line-break={typography.cjk ? "strict" : "standard"}><PlayerRichText text={option.label} locale={typography.locale} /></span>
              </button>
            ))}
          </div>
        )}

        {content.kind === "ending" && (
          <div {...panelProps('ending')} className="player-ending" inert={preferencesOpen || savePanelOpen || additionalContentOpen || historyPanelOpen || readingMenuOpen} role="status">
            <PlayerPanelRegion enabled={endingLayout.enabled} rect={endingLayout.layout?.primary} kind="primary">
            <span>{snapshot.sceneReplay.active ? '回想结束' : skin?.screens?.ending.caption ?? '故事告一段落'}</span>
            <h2 className="player-typography-text" lang={typography.locale} data-cjk-line-break={typography.cjk ? "strict" : "standard"}><PlayerRichText text={content.name} locale={typography.locale} /></h2>
            {!snapshot.sceneReplay.active && <>
              <p className="player-ending-progress">已达成 {snapshot.additionalContent.endings.unlocked} / {snapshot.additionalContent.endings.total} 个结局</p>
              {(skin?.screens?.ending.note ?? '已读、画廊、音乐与结局记录会保留。可以查看收藏，或读取存档探索其他选择。') && <p className="player-ending-note">{skin?.screens?.ending.note ?? '已读、画廊、音乐与结局记录会保留。可以查看收藏，或读取存档探索其他选择。'}</p>}
              {collection.error && <p className="player-collection-error" role="alert">本机收藏记录暂未保存，请保留故事存档后重试。<button type="button" onClick={collection.retry}>重试保存收藏</button></p>}
            </>}
            <div className="player-ending-actions">
            {!snapshot.sceneReplay.active && <>
              <button className="player-primary" type="button" onClick={() => { openAdditionalContent(); setAdditionalContentView('endings'); }}>查看收藏与结局</button>
              {hasWebCredits(credits) && <button className="player-secondary" type="button" disabled={hostActivity !== 'active'} onClick={openCredits}>制作名单</button>}
              {saveStore && <button className="player-secondary" type="button" onClick={() => openSavePanel('load')}>读取存档探索其他路线</button>}
            </>}
            {!endingLayout.enabled && endingReturn}
            </div>
            {panelComponents('ending', true)}</PlayerPanelRegion>
            <PlayerPanelRegion enabled={endingLayout.enabled} rect={endingLayout.layout?.secondary} kind="secondary">{endingLayout.enabled && <header>{endingReturn}</header>}</PlayerPanelRegion>
            {panelComponents('ending')}{panelAudit('ending')}
          </div>
        )}

        {content.kind === "error" && (
          <div className="player-error" role="alert">
            <span>无法安全启动</span>
            <h1>{snapshot.title}</h1>
            <p>{content.diagnostics[0]?.message ?? "未知 Player Core 错误"}</p>
            <code>{content.diagnostics[0]?.code ?? "PLAYER_UNKNOWN_ERROR"}</code>
            <button className="player-secondary" type="button" onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => snapshot.sceneReplay.active ? exitSceneReplay() : applyIntent({ kind: "restart" }, pointerInput.current)}>{snapshot.sceneReplay.active ? "退出回想，返回原剧情" : "重新载入工程"}</button>
          </div>
        )}

        {content.kind === "effect" && (
          <div className="player-boundary" role="status" aria-label={`正在呈现动效 ${content.descriptorId}`}>
            <span>正式 Runtime Host</span>
            <strong>{stage.video?.awaited === true ? "视频播放中" : "正在呈现动效"}</strong>
            <code>{content.descriptorId}</code>
            {stage.video?.awaited !== true && <div
              key={snapshot.effects.pending?.effectId}
              className="player-effect-progress"
              data-testid="player-effect-progress"
              style={{ animationDuration: `${stage.pendingDurationMilliseconds}ms` }}
              onAnimationEnd={() => {
                if (hostActivity === "active" && stage.missingAssetIds.length === 0 && mediaErrors.length === 0) applyIntent({ kind: "primary" }, "system");
              }}
            />}
            <div className="player-boundary__actions">
              <button type="button" disabled={stage.missingAssetIds.length > 0 || mediaErrors.length > 0} onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => applyIntent({ kind: "primary" }, pointerInput.current)}>完成动效</button>
              {content.canCancel && <button type="button" onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => applyIntent({ kind: "cancel" }, pointerInput.current)}>跳过动效</button>}
            </div>
          </div>
        )}

        {content.kind === "barrier" && (
          <div className="player-boundary" role="alertdialog" aria-label={`确认不可逆步骤 ${content.descriptorId}`}>
            <span>不可逆边界</span><strong>{content.reason}</strong><code>{content.descriptorId}</code>
            <button type="button" onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => applyIntent({ kind: "primary" }, pointerInput.current)}>确认继续</button>
          </div>
        )}

        {content.kind === "wait" && <div className="player-boundary" role="status">等待 {content.durationMilliseconds}ms</div>}
      </section>
    </main>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { releaseAnimationsOnDetach } from "./owned-animations";
import { startPlayerAutoClock } from "./auto-playback-clock";
import { readPlayerReadingPace, storePlayerReadingPace, readingMillisecondsPerUnit, type PlayerReadingPace } from './player-reading';
import { useCompactReadingLayout, useReadingMediaQuery, useReadingSurface } from './use-reading-surface';
import { applyPlayerPreferences } from './player-preferences';
import { usePlayerPreferences } from './use-player-preferences';
import { restorePlayerCollection, usePlayerCollection } from './use-player-collection';
import { restorePlayerReplayArchive, usePlayerReplayArchive } from './use-player-replay-archive';
import { usePlayerFullscreen } from './use-player-fullscreen';
import { PlayerPreferencesPanel } from './PlayerPreferencesPanel';
import { PlayerCreditsPanel } from './PlayerCreditsPanel';
import { DEFAULT_WEB_CREDITS, readWebCredits, hasWebCredits } from '@world-studio/project-domain';
import { cancelPlayerAudioRequest, requestPlayerAudioPlayback, cancelPlayerMediaRequest, requestPlayerMediaPlayback } from "./audio-playback-request";
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
import {
  createPlayerCore,
  canEnterPlayerCoreReplayV1,
  compactPlayerCoreHistoryV1,
  createPlayerCoreSessionSaveV1,
  createPlayerCoreSnapshotV1,
  configurePlayerCoreLocaleV1,
  configurePlayerCoreHistoryPolicyV1,
  dispatchPlayerCoreIntentV1,
  loadPlayerCoreSessionSaveV1,
  schedulePlayerCorePlaybackV1,
  type PlayerCoreIntentV1,
  type PlayerHistoryVisibleEventV1
} from "@world-studio/player-core";
import { derivePlayerStagePresentationV1, type PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";
import { playerSaveLabel } from './player-save-label';
import { PlayerSaveCard, PlayerSaveDetails } from './PlayerSaveCard';
import { PlayerSaveBackupPanel } from "./PlayerSaveBackupPanel";
import { resolvePlayerLocalizedMediaV1 } from "./player-localized-media";
import { parsePlayerRichTextV1, resolvePlayerTypographyV1 } from "./player-typography";
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
}

type PlayerInputSource = "lifecycle" | GalAdvanceInputV1 | "system";
export type PlayerHostActivityV1 = "active" | "suspended";
export type PlayerMemoryPressureStatusV1 = "idle" | "protecting" | "released" | "protected" | "deferred" | "error";

export interface WorldPlayerPreviewCaptureRequestV1 {
  readonly projectId: string;
  readonly sceneId: string;
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

function playerHistoryEventLabel(event: PlayerHistoryVisibleEventV1): string {
  switch (event.kind) {
    case "dialogue": return event.text;
    case "narration": return event.text;
    case "choice": return event.prompt;
    case "wait": return `等待 ${event.durationMilliseconds} 毫秒`;
    case "ending": return event.name;
  }
}

function playerHistoryEventKind(event: PlayerHistoryVisibleEventV1): string {
  switch (event.kind) {
    case "dialogue": return "对白";
    case "narration": return "旁白";
    case "choice": return "选择";
    case "wait": return "等待";
    case "ending": return "结局";
  }
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
  return source === null || source.slot !== slot
    ? <span className="player-save__preview" data-preview-status={hasFailed ? "error" : slot?.preview.status ?? "empty"} aria-label={hasFailed ? "截图读取失败" : slot?.preview.status === "available" ? "截图正在读取" : "没有存档截图"} />
    : <img className="player-save__preview" src={source.url} alt={`${slot?.sceneTitle ?? "存档"} 截图`} />;
}

function playerLocalePreferenceKey(projectId: string): string {
  return `world-player.locale.${projectId}`;
}

function createLocalizedPlayerCore(project: CanonicalProject, historyPolicy: Parameters<typeof createPlayerCore>[1]) {
  const core = restorePlayerReplayArchive(restorePlayerCollection(createPlayerCore(project, historyPolicy)));
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

export function PlayerShell({ project, mediaAssets = [], onRetryMedia, hostActivity = "active", platform = "web", saveStore, recoveryStore, previewCapture, now = Date.now, playbackPolicy = DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, memoryPressureRequest, onReleaseIdleResources }: PlayerShellProps) {
  const appearance = readWebPlayerAppearance(project);
  const coverAllowed = appearance !== null && webPlayerCoverAssets(project).some(asset => String(asset.assetId ?? asset.id) === appearance.coverAssetId);
  const cover = coverAllowed ? mediaAssets.find(asset => asset.assetId === appearance?.coverAssetId && ["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) : undefined;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const personal = usePlayerPreferences(project.manifest.projectId);
  const baseSettings = useMemo(() => createGalSettingsApplicationV1(project.settings, platform), [platform, project.settings]);
  const settingsApplication = useMemo(() => applyPlayerPreferences(baseSettings, personal.preferences), [baseSettings, personal.preferences]);
  const fullscreen = usePlayerFullscreen();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [infoView, setInfoView] = useState<'preferences' | 'credits'>('preferences');
  const infoTrigger = useRef<HTMLElement | null>(null);
  const credits = useMemo(() => { try { return readWebCredits(project); } catch { return DEFAULT_WEB_CREDITS; } }, [project]);
  const preferencesPanel = useRef<HTMLDivElement | null>(null), preferencesTrigger = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState(() => createLocalizedPlayerCore(project, settingsApplication.history));
  const collection = usePlayerCollection(state, setState);
  const replayArchive = usePlayerReplayArchive(state, setState);
  const liveState = useRef(state);
  liveState.current = state;
  const [memoryPressureStatus, setMemoryPressureStatus] = useState<PlayerMemoryPressureStatusV1>("idle");
  const [handledMemorySerial, setHandledMemorySerial] = useState(0);
  const [memoryPressureMessage, setMemoryPressureMessage] = useState("");
  const [memoryPressureRetry, setMemoryPressureRetry] = useState(0);
  const memoryWritePending = useRef<WorldPlayerRecoveryWriteCoordinatorV1 | null>(null);
  const recoveryWritePending = useRef<{ coordinator: WorldPlayerRecoveryWriteCoordinatorV1; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [recoveryWriteRevision, setRecoveryWriteRevision] = useState(0);
  const [mediaErrors, setMediaErrors] = useState<readonly string[]>([]);
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
  const [readingMenuOpen, setReadingMenuOpen] = useState(false);
  const [artworkView, setArtworkView] = useState(false);
  const readingMenu = useRef<HTMLDivElement | null>(null), readingMenuTrigger = useRef<HTMLButtonElement | null>(null);
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
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [additionalContentOpen, setAdditionalContentOpen] = useState(false);
  const [additionalContentView, setAdditionalContentView] = useState<"overview" | "gallery" | "replay" | "music" | "endings">("overview");
  const [selectedGalleryAssetId, setSelectedGalleryAssetId] = useState<string | null>(null);
  const [additionalContentMediaErrors, setAdditionalContentMediaErrors] = useState<readonly string[]>([]);
  const [savePanelOpen, setSavePanelOpen] = useState(false);
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
  const saveDialog = useRef<HTMLDialogElement | null>(null);
  const saveDialogTrigger = useRef<HTMLElement | null>(null);
  const titleSaveTrigger = useRef<HTMLButtonElement | null>(null);
  const titlePreferencesTrigger = useRef<HTMLButtonElement | null>(null);
  const titleAdditionalContentTrigger = useRef<HTMLButtonElement | null>(null);
  const saveToggle = useRef<HTMLButtonElement | null>(null);
  const [recoveryCandidate, setRecoveryCandidate] = useState<WorldPlayerRecoveryRecordV1 | null>(null);
  const [recoveryOperation, setRecoveryOperation] = useState<"scanning" | "idle" | "available" | "ready" | "loaded" | "error">("scanning");
  const [recoveryMessage, setRecoveryMessage] = useState("正在检查恢复记录…");
  const [recoveryErrorAction, setRecoveryErrorAction] = useState<"clear" | "retry" | null>(null);
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
  const requestAudio = useCallback((element: HTMLAudioElement, reason: "resuming" | "resuming-after-skip" = "resuming") => {
    const isCurrent = () => element.isConnected && audioElements.current.get(element.dataset.audioBus ?? "") === element
      && audioActivity.current.hostActivity === "active" && !audioActivity.current.skipActive;
    if (!isCurrent()) return;
    requestPlayerAudioPlayback(element, isCurrent, () => refreshAudioTransport(revision => revision + 1), reason);
  }, []);
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
  const consumedCheckpointCandidates = useRef(new Set<string>());
  const lastRecoveryRuntimeStateHash = useRef<string | null>(null);
  saveContext.current = { projectId: project.manifest.projectId, store: saveStore, previewCapture };
  recoveryContext.current = { projectId: project.manifest.projectId, store: recoveryStore };
  const executableProjectHash = useMemo(() => semanticHash({ ...project, settings: createGalSettingsDocument() }), [project]);
  const snapshot = useMemo(() => createPlayerCoreSnapshotV1(state), [state]);
  const recoveryBuildCompatible = recoveryCandidate === null || recoveryCandidate.buildId === state.artifacts?.manifest.buildId || state.compatibleSaveBuildIds.includes(recoveryCandidate.buildId);
  const buildStopInstructionIds = state.artifacts?.playerPlaybackPolicy.stopInstructionIds ?? [];
  const saveCoordinator = useMemo(() => saveStore === undefined ? undefined : new WorldPlayerSaveWriteCoordinatorV1(saveStore), [saveStore]);
  const recoveryCoordinator = useMemo(() => recoveryStore === undefined ? undefined : new WorldPlayerRecoveryWriteCoordinatorV1(recoveryStore), [recoveryStore]);
  const content = snapshot.presentation;
  const saveBoundaryAllowed = worldPlayerAutoSaveAllowedV1(snapshot.status, snapshot.presentation.kind);
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
  const appliedAudio = audibleTracks.map((track) => ({
    ...track,
    appliedVolume: galAudioGainV1(
      settingsApplication,
      (["bgm", "voice", "sfx", "ambient", "ui"].includes(track.bus) ? track.bus : "sfx") as GalAudioBusV1,
      track.volume,
      voicePlaying
    )
  }));
  const audioPlaybackSignature = appliedAudio.map(track => `${mediaGeneration}:${track.bus}:${track.assetId}:${track.status}`).join("|");
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
    () => resolvePlayerTypographyV1(snapshot.localization.selectedLocale, project.assets.assets, mediaAssets),
    [mediaAssets, mediaSignature, project.assets.assets, snapshot.localization.selectedLocale]
  );
  const [fontStatus, setFontStatus] = useState<"system" | "loading" | "ready" | "fallback">("system");
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
  const reading = useReadingSurface(`${presentedTextId}:${snapshot.history?.cursor}:${snapshot.localization.selectedLocale}:${presentedText}`, `${compactReading}:${readingMenuOpen}:${fontStatus}:${textReady}:${settingsApplication.text.fontScale}:${fullscreen.active}`);
  const readingRef = useCallback((element: HTMLButtonElement | null) => { reading.element.current = element; return releaseAnimationsOnDetach(element); }, [reading.element]);
  useEffect(() => { setReadingPace(initialPace()); setReadingMenuOpen(false); setArtworkView(false); }, [project.manifest.projectId]);
  const closeReadingMenu = useCallback(() => { setReadingMenuOpen(false); queueMicrotask(() => readingMenuTrigger.current?.focus()); }, []);
  const closePreferences = useCallback(() => { setPreferencesOpen(false); queueMicrotask(() => {
    const trigger = infoView === 'credits' ? infoTrigger.current : null;
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

  useEffect(() => {
    const selected = typography.projectFont;
    if (selected === null) {
      setFontStatus("system");
      return;
    }
    const FontFaceConstructor = globalThis.FontFace;
    const fontSet = globalThis.document?.fonts;
    if (FontFaceConstructor === undefined || fontSet === undefined) {
      setFontStatus("fallback");
      return;
    }
    let active = true;
    let loadedFace: FontFace | null = null;
    setFontStatus("loading");
    try {
      const face = new FontFaceConstructor(selected.runtimeFamily, `url("${selected.url.replaceAll('"', '\\"')}")`);
      void face.load().then((loaded) => {
        if (!active) return;
        loadedFace = loaded;
        fontSet.add(loaded);
        setFontStatus("ready");
      }).catch(() => { if (active) setFontStatus("fallback"); });
    } catch {
      setFontStatus("fallback");
    }
    return () => {
      active = false;
      if (loadedFace !== null) fontSet.delete(loadedFace);
    };
  }, [typography]);

  useEffect(() => {
    setVoicePlaying(false);
  }, [localizedMedia.voice?.assetId]);

  const stopSkip = useCallback(() => {
    skipModeCurrent.current = null;
    setSkipMode(null);
  }, []);
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

  const refreshSaveSlots = useCallback(async () => {
    if (saveStore === undefined) return;
    const projectId = project.manifest.projectId;
    const generation = ++saveListGeneration.current;
    try {
      const slots = await listWorldPlayerSaveSummariesV3(saveStore, projectId);
      if (generation !== saveListGeneration.current || saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      setSaveSlots(slots);
    } catch {
      if (generation !== saveListGeneration.current || saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      setSaveOperation("error");
      setSaveMessage("存档存储不可用");
    }
  }, [project.manifest.projectId, saveStore]);

  useEffect(() => { if (savePanelOpen) void refreshSaveSlots(); }, [savePanelOpen, refreshSaveSlots]);

  const captureSavePreview = useCallback(async (projectId: string, sceneId: string): Promise<{ readonly metadata: WorldPlayerSavePreviewV2; readonly blob?: Blob }> => {
    if (previewCapture === undefined) return { metadata: { status: "unavailable", reason: "capture-unavailable" } };
    try {
      const captured = await previewCapture.capture({
        projectId,
        sceneId,
        maximumWidth: WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_WIDTH,
        maximumHeight: WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_HEIGHT,
        maximumBytes: WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES,
        mimeTypes: ["image/webp", "image/png"]
      });
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
    }
  }, [previewCapture]);

  const captureCurrentSlot = useCallback(async (kind: "manual" | "auto" | "quick", slotId: string, capturedState = state, capturedSnapshot = snapshot) => {
    if (capturedSnapshot.identities.buildId === null || capturedSnapshot.runtimeStateHash === null || capturedState.runtimeState === null) throw new Error("WORLD_PLAYER_SAVE_NOT_READY");
    const created = createPlayerCoreSessionSaveV1(capturedState);
    if (!created.ok) {
      throw new Error(created.diagnostics[0]?.message ?? "WORLD_PLAYER_SAVE_NOT_READY");
    }
    const projectId = project.manifest.projectId;
      const sceneId = capturedState.runtimeState.cursor.sceneId;
      const sceneIndex = project.scenes.findIndex((scene) => scene.id === sceneId);
      const scene = project.scenes[sceneIndex];
      if (scene === undefined) throw new Error("WORLD_PLAYER_SAVE_SCENE_MISSING");
      const scenePath = project.chapters.flatMap((chapter) => chapter.scenePaths)[sceneIndex];
      const chapter = scenePath === undefined ? undefined : project.chapters.find((candidate) => candidate.scenePaths.includes(scenePath));
      const captured = await captureSavePreview(projectId, sceneId);
      const slot = createWorldPlayerSaveSlotV3({
        kind,
        slotId,
        projectId,
        buildId: capturedState.runtimeState.buildId,
        savedAtEpochMilliseconds: now(),
        title: capturedSnapshot.title,
        chapterId: chapter?.id ?? null,
        chapterTitle: chapter?.title ?? null,
        sceneId,
        sceneTitle: scene.title,
        route: null,
        customMetadata: {},
        preview: captured.metadata,
        presentationKind: capturedSnapshot.presentation.kind,
        runtimeStateHash: capturedSnapshot.runtimeStateHash,
        sessionArtifactHash: created.artifactHash,
        serializedSessionSave: created.serialized,
        checkpointStepId: null
      });
      return { slot, ...(captured.blob === undefined ? {} : { preview: captured.blob }) };
  }, [captureSavePreview, now, project, snapshot, state]);

  const persistCurrentSlot = useCallback(async (kind: "manual" | "auto" | "quick", slotId: string, capturedState = state, capturedSnapshot = snapshot) => {
    if (saveStore === undefined) throw new Error("WORLD_PLAYER_SAVE_NOT_READY");
    const captured = await captureCurrentSlot(kind, slotId, capturedState, capturedSnapshot);
    await saveStore.write(captured.slot, captured.preview);
    return captured.slot.preview.status;
  }, [captureCurrentSlot, saveStore, snapshot, state]);

  const saveToSlot = useCallback(async (kind: "manual" | "quick", slotId: string) => {
    if (saveCoordinator === undefined) return;
    setSaveOperation("busy");
    setSaveMessage("正在写入…");
    setSaveFeedback(null);
    const projectId = project.manifest.projectId;
    try {
      const previewStatus = await saveCoordinator.writeFixed(() => persistCurrentSlot(kind, slotId));
      if (saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore || saveContext.current.previewCapture !== previewCapture) return;
      await refreshSaveSlots();
      setPendingOverwriteSlotId(null);
      setSaveOperation("saved");
      setSaveMessage(`${playerSaveLabel(slotId)}已保存${previewStatus === "available" ? "（含截图）" : "（预览不可用）"}`);
      setSaveFeedback(kind === 'quick' ? '快速存档已保存' : '手动存档已保存');
    } catch {
      setSaveOperation("error");
      setSaveMessage("写入失败，原存档保持不变");
      if (kind === 'quick') setSaveView('quick');
      openSavePanel();
    }
  }, [persistCurrentSlot, previewCapture, project.manifest.projectId, refreshSaveSlots, saveCoordinator, saveStore, openSavePanel]);

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
    if (saveStore === undefined) return;
    setSaveOperation("busy");
    setSaveMessage("正在校验…");
    const projectId = project.manifest.projectId;
    try {
      const slot = await saveStore.read(projectId, slotId);
      if (saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      if (slot === null) throw new Error("WORLD_PLAYER_SAVE_MISSING");
      if (expectedArtifactHash !== undefined && slot.sessionArtifactHash !== expectedArtifactHash) throw new Error("WORLD_PLAYER_SAVE_CHANGED");
      const loaded = loadPlayerCoreSessionSaveV1(state, slot.serializedSessionSave);
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
      if (saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      try { await refreshSaveSlots(); } catch { /* Keep the load error and the current story. */ }
      if (saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      setSaveOperation("error");
      setSaveMessage(error instanceof Error && error.message === "WORLD_PLAYER_SAVE_VERSION_UNVERIFIED"
        ? "这个存档来自尚未核对的游戏版本。当前进度和原存档保持不变，请使用原版继续或联系作品作者。"
        : error instanceof Error && error.message === "WORLD_PLAYER_SAVE_CHANGED"
          ? "这个槽位已经更新，请重新核对后读取，或把备份重新导入空槽位。当前进度保持不变。"
          : "存档损坏或与当前构建不兼容");
      if (slotId.startsWith("quick-")) setSaveView("quick");
      openSavePanel("load");
    }
  }, [project.manifest.projectId, recoveryStore, saveStore, state, openSavePanel, stopSkip, refreshSaveSlots]);

  const requestLoadFromSlot = useCallback((slotId: string, expectedArtifactHash?: string) => {
    const slot = saveSlots.find(candidate => candidate.slotId === slotId), expected = expectedArtifactHash ?? slot?.sessionArtifactHash;
    if (content.kind === 'title') { void loadFromSlot(slotId, expected); return; }
    openSavePanel('load');
    setSaveView(slot?.kind ?? 'manual');
    setPendingRead({ slotId, ...(expected !== undefined ? { expectedArtifactHash: expected } : {}), slot });
  }, [saveSlots, content.kind, loadFromSlot, openSavePanel]);

  const restoreRecovery = useCallback(async () => {
    if (recoveryCandidate === null || recoveryStore === undefined) return;
    setRecoveryOperation("scanning");
    setRecoveryMessage("正在校验恢复记录…");
    try {
      const loaded = loadPlayerCoreSessionSaveV1(state, recoveryCandidate.serializedSessionSave);
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
    } catch {
      setRecoveryOperation("error");
      setRecoveryMessage("恢复记录损坏或与当前构建不兼容，正式存档未受影响");
      setRecoveryErrorAction("clear");
    }
  }, [project.manifest.projectId, recoveryCandidate, recoveryStore, state]);

  const clearRecovery = useCallback(async () => {
    if (recoveryCoordinator === undefined || recoveryStore === undefined) return false;
    const projectId = project.manifest.projectId;
    const generation = recoveryGeneration.current;
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
    if (source !== "system") {
      setAutoEnabled(false);
      setAutoPlayback("off");
      stopSkip();
    }
    setLastInputSource(source);
    if ((intent.kind === "primary" || intent.kind === "select-choice")
      && source !== "lifecycle" && source !== "system"
      && !galAdvanceInputEnabledV1(settingsApplication, source)) {
      setLastInputAccepted(false);
      return;
    }
    if (intent.kind === "primary" && (content.kind === "dialogue" || content.kind === "narration") && !textReady) {
      setTextReady(true);
      setLastInputAccepted(false);
      return;
    }
    if (intent.kind === "primary" && (content.kind === "dialogue" || content.kind === "narration") && reading.nextPage()) {
      setLastInputAccepted(false); return;
    }
    if (intent.kind === "primary" && settingsApplication.advance.waitForVoice && voicePlaying) {
      setLastInputAccepted(false);
      return;
    }
    setLastInputAccepted(true);
    setState((current) => dispatchPlayerCoreIntentV1(current, project, intent));
  }, [artworkView, content.kind, project, recoveryCandidate, recoveryOperation, recoveryStore, settingsApplication, stopSkip, textReady, voicePlaying, preferencesOpen, readingMenuOpen, historyPanelOpen, savePanelOpen, additionalContentOpen, snapshot.runtimeStateHash, snapshot.runtimeHostSnapshotHash, reading]);
  useEffect(() => {
    if (hostActivity !== 'active' || artworkView || preferencesOpen || readingMenuOpen || historyPanelOpen || savePanelOpen || additionalContentOpen || !deferredMenuCompletion.current) return;
    const completion = deferredMenuCompletion.current;
    deferredMenuCompletion.current = null;
    // A load or history navigation must not complete a different pending effect.
    if (snapshot.status === 'waiting-effect' && completion.stateHash === snapshot.runtimeStateHash && completion.hostHash === snapshot.runtimeHostSnapshotHash) applyIntent({ kind: 'primary' }, 'system');
  }, [artworkView, hostActivity, preferencesOpen, readingMenuOpen, historyPanelOpen, savePanelOpen, additionalContentOpen, snapshot.status, snapshot.runtimeStateHash, snapshot.runtimeHostSnapshotHash, applyIntent]);

  useEffect(() => {
    autoSavedSceneIdentities.current.clear();
    consumedCheckpointCandidates.current.clear();
    lastRecoveryRuntimeStateHash.current = null;
    replayPlaybackReturn.current = null;
    additionalContentPlaybackReturn.current = null;
    setState(createLocalizedPlayerCore(project, settingsApplication.history));
    setReadingMenuOpen(false); setArtworkView(false); setPendingRead(null); deferredMenuCompletion.current = null;
    setPreferencesOpen(false);
    setMediaErrors([]);
    setMediaGeneration(0);
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
    void saveCoordinator.writeAuto(project.manifest.projectId, sceneIdentity, async (slotId) => { await persistCurrentSlot("auto", slotId, capturedState, capturedSnapshot); }).then(async (result) => {
      if (saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) return;
      await refreshSaveSlots();
      if (result.status === "written") setSaveMessage(`${result.slotId} 已自动保存`);
    }).catch(() => {
      if (saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) return;
      setSaveOperation("error");
      setSaveMessage("自动保存失败，原存档保持不变");
    });
  }, [hostActivity, persistCurrentSlot, project.manifest.projectId, refreshSaveSlots, saveCoordinator, saveStore, snapshot, state]);

  useEffect(() => {
    if (snapshot.sceneReplay.active || saveCoordinator === undefined || saveStore === undefined || hostActivity !== "active" || snapshot.identities.buildId === null || state.checkpointSaveCandidates.length === 0) return;
    for (const candidate of state.checkpointSaveCandidates) {
      const buildId = candidate.buildId;
      const identity = `${buildId}\0${candidate.stepId}\0${candidate.artifactHash}`;
      if (consumedCheckpointCandidates.current.has(identity)) continue;
      consumedCheckpointCandidates.current.add(identity);
      void saveCoordinator.writeCheckpoint(project.manifest.projectId, buildId, candidate.stepId, async (slotId) => {
        const sceneIndex = project.scenes.findIndex((scene) => scene.id === candidate.sceneId);
        const scene = project.scenes[sceneIndex];
        if (scene === undefined) throw new Error("WORLD_PLAYER_SAVE_SCENE_MISSING");
        const scenePath = project.chapters.flatMap((chapter) => chapter.scenePaths)[sceneIndex];
        const chapter = scenePath === undefined ? undefined : project.chapters.find((item) => item.scenePaths.includes(scenePath));
        const captured = await captureSavePreview(project.manifest.projectId, state.runtimeState?.cursor.sceneId ?? candidate.sceneId);
        await saveStore.write(createWorldPlayerSaveSlotV3({
          kind: "checkpoint", slotId, projectId: project.manifest.projectId, buildId, savedAtEpochMilliseconds: now(), title: snapshot.title,
          chapterId: chapter?.id ?? null, chapterTitle: chapter?.title ?? null, sceneId: candidate.sceneId, sceneTitle: scene.title,
          route: null, customMetadata: {}, preview: captured.metadata, presentationKind: snapshot.presentation.kind,
          runtimeStateHash: candidate.runtimeStateHash, sessionArtifactHash: candidate.artifactHash,
          serializedSessionSave: candidate.serializedSessionSave, checkpointStepId: candidate.stepId
        }), captured.blob);
      }).then(async (result) => {
        if (saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) return;
        await refreshSaveSlots();
        setSaveMessage(`${result.slotId} 已写入剧情检查点`);
      }).catch(() => {
        if (saveContext.current.projectId !== project.manifest.projectId || saveContext.current.store !== saveStore) return;
        setSaveOperation("error");
        setSaveMessage("检查点写入失败，旧检查点保持不变，剧情继续");
      });
    }
  }, [captureSavePreview, hostActivity, now, project, refreshSaveSlots, saveCoordinator, saveStore, snapshot, state.checkpointSaveCandidates, state.runtimeState]);

  useEffect(() => () => {
    if (recoveryWritePending.current !== null) clearTimeout(recoveryWritePending.current.timer);
  }, [recoveryCoordinator]);

  useEffect(() => {
    if (snapshot.sceneReplay.active || recoveryCoordinator === undefined || recoveryStore === undefined || recoveryWritePending.current?.coordinator === recoveryCoordinator || memoryWritePending.current === recoveryCoordinator || hostActivity !== "active" || state.runtimeState === null ||
        snapshot.identities.buildId === null || snapshot.runtimeStateHash === null || !saveBoundaryAllowed || recoveryCandidate !== null ||
        !["idle", "ready", "loaded"].includes(recoveryOperation) || lastRecoveryRuntimeStateHash.current === snapshot.runtimeStateHash) return;
    const created = createPlayerCoreSessionSaveV1(state);
    if (!created.ok) return;
    const record = createWorldPlayerRecoveryRecordV1({
      projectId: project.manifest.projectId,
      buildId: state.runtimeState.buildId,
      savedAtEpochMilliseconds: now(),
      title: snapshot.title,
      sceneId: state.runtimeState.cursor.sceneId,
      presentationKind: snapshot.presentation.kind,
      runtimeStateHash: snapshot.runtimeStateHash,
      sessionArtifactHash: created.artifactHash,
      serializedSessionSave: created.serialized
    });
    lastRecoveryRuntimeStateHash.current = snapshot.runtimeStateHash;
    const generation = recoveryGeneration.current;
    const current = () => generation === recoveryGeneration.current && recoveryContext.current.projectId === record.projectId && recoveryContext.current.store === recoveryStore;
    let timedOut = false;
    const pending = { coordinator: recoveryCoordinator, timer: setTimeout(() => {
      if (!current()) return;
      timedOut = true;
      setRecoveryOperation("error");
      setRecoveryMessage("恢复保护保存超时，存储操作仍未结束。剧情可继续；请勿关闭游戏，可尝试手动保存。重试不会重复排队。");
      setRecoveryErrorAction("retry");
    }, 8000) };
    recoveryWritePending.current = pending;
    void recoveryCoordinator.write(record).then(() => {
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
      setRecoveryMessage(typeof error === "object" && error !== null && "name" in error && error.name === "QuotaExceededError"
        ? "设备存储空间不足，恢复保护未写入。旧恢复点和正式存档保持不变；请释放空间后重试，不要清除本游戏的网站数据。"
        : "恢复保护写入失败，旧恢复点和正式存档保持不变");
      setRecoveryErrorAction("retry");
    }).finally(() => {
      clearTimeout(pending.timer);
      if (recoveryWritePending.current === pending) recoveryWritePending.current = null;
      // Serialize only the newest live state after IO settles, not every skipped line.
      if (recoveryContext.current.projectId === record.projectId && recoveryContext.current.store === recoveryStore) setRecoveryWriteRevision(revision => revision + 1);
    });
  }, [hostActivity, now, project.manifest.projectId, recoveryCandidate, recoveryCoordinator, recoveryOperation, recoveryStore, recoveryWriteRevision, saveBoundaryAllowed, snapshot, state]);

  useEffect(() => {
    if (memoryPressureRequest === undefined) { setMemoryPressureStatus("idle"); setMemoryPressureMessage(""); return; }
    setHandledMemorySerial(memoryPressureRequest.serial);
    setAutoEnabled(false); setAutoPlayback("off"); stopSkip();
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = (message: string) => { if (active) { setMemoryPressureStatus("error"); setMemoryPressureMessage(message); } };
    try {
      onReleaseIdleResources?.();
      if (recoveryCoordinator !== undefined && (memoryWritePending.current === recoveryCoordinator || recoveryWritePending.current?.coordinator === recoveryCoordinator)) {
        fail("上次恢复点保存仍未结束，未继续排队。回滚历史不变，可先手动保存。"); return;
      }
      const protectedState = liveState.current;
      const compacted = compactPlayerCoreHistoryV1(protectedState, memoryPressureRequest.level === "critical" ? 64 : 128);
      if (compacted === protectedState) {
        setMemoryPressureStatus("released"); setMemoryPressureMessage("已请求释放闲置资源；当前进度和回滚窗口保持不变。");
        return;
      }
      if (recoveryCoordinator === undefined || recoveryStore === undefined || !saveBoundaryAllowed || snapshot.sceneReplay.active || recoveryCandidate !== null) {
        fail("闲置资源已处理，但当前无法保护恢复点，回滚历史保持不变。可先手动保存。"); return;
      }
      const created = createPlayerCoreSessionSaveV1(protectedState);
      if (!created.ok || snapshot.identities.buildId === null || snapshot.runtimeStateHash === null || protectedState.runtimeState === null) throw Error("Cannot protect current state");
      const record = createWorldPlayerRecoveryRecordV1({ projectId: project.manifest.projectId, buildId: protectedState.runtimeState.buildId,
        savedAtEpochMilliseconds: now(), title: snapshot.title, sceneId: protectedState.runtimeState.cursor.sceneId,
        presentationKind: snapshot.presentation.kind, runtimeStateHash: snapshot.runtimeStateHash,
        sessionArtifactHash: created.artifactHash, serializedSessionSave: created.serialized });
      setMemoryPressureStatus("protecting"); setMemoryPressureMessage("内存保护：正在保存恢复点，暂不收缩历史。");
      timeout = setTimeout(() => { fail("恢复点保存超时，回滚历史未收缩。请检查存储后重试。"); active = false; }, 8000);
      memoryWritePending.current = recoveryCoordinator;
      void recoveryCoordinator.write(record).then(() => {
        if (!active) return;
        clearTimeout(timeout);
        if (liveState.current !== protectedState) { setMemoryPressureStatus("deferred"); setMemoryPressureMessage("进度已改变，已跳过本次历史收缩。可重新执行内存保护。"); return; }
        setState(compacted);
        setMemoryPressureStatus("protected");
        setMemoryPressureMessage("恢复点已保存，较早历史已转为只读归档；当前句和正式存档不变。自动播放已停止。");
      }).catch(() => { clearTimeout(timeout); fail("恢复点保存失败，回滚历史未收缩，正式存档保持不变。可重试。"); })
        .finally(() => {
          if (memoryWritePending.current === recoveryCoordinator) memoryWritePending.current = null;
          if (recoveryContext.current.projectId === record.projectId && recoveryContext.current.store === recoveryStore) setRecoveryWriteRevision(revision => revision + 1);
        });
    } catch { fail("内存保护未完成，回滚历史保持不变。可重试或手动保存。"); }
    return () => { active = false; clearTimeout(timeout); };
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
      setState((current) => schedulePlayerCorePlaybackV1(current, policy));
    });
  }, [artworkView, autoEnabled, preferencesOpen, historyPanelOpen, savePanelOpen, additionalContentOpen, stageImagesPending, buildStopInstructionIds, canonicalPlaybackPolicy, content, hostActivity, snapshot.playback.stopReason, snapshot.status, stage.video, stage.audio, textReady, mediaGeneration, localizedMedia.voice?.assetId, readingMenuOpen, reading.unread, readingPace]);

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
      setState((current) => schedulePlayerCorePlaybackV1(current, {
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
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [artworkView, preferencesOpen, historyPanelOpen, savePanelOpen, additionalContentOpen, stageImagesPending, buildStopInstructionIds, canonicalPlaybackPolicy.skip, hostActivity, project, skipActivation, skipActive, skipMode, skipSpeed, snapshot.history?.cursor, snapshot.playback.accumulatedInstructions, snapshot.playback.executedInstructions, snapshot.playback.mode, snapshot.playback.stopReason, snapshot.status, stage.video, stopSkip, readingMenuOpen]);

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
      (titleAdditionalContentTrigger.current ?? readingMenuTrigger.current ?? additionalContentTrigger.current)?.focus();
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
      galleryPreviewTrigger.current?.focus();
    }
  }, [selectedGalleryAssetId]);

  useEffect(() => {
    if (hostActivity !== "active") return;
    const onKeyDown = (event: KeyboardEvent) => {
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
          const buttons = [...(readingMenu.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)') ?? [])];
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
          const focusable = Array.from(additionalContentPanel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
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
        if (event.key === "Escape") { event.preventDefault(); if (saveOperation === "busy") return; if (pendingRead) cancelRead(); else { setHistoryPanelOpen(false); closeSavePanel(); } }
        return;
      }
      if (event.key === 'Escape' && snapshot.sceneReplay.active) { event.preventDefault(); exitSceneReplay(); return; }
      if (!event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'h' && canViewArtwork && !(event.target instanceof HTMLElement && event.target.closest('input,select,textarea,[contenteditable]'))) { event.preventDefault(); showArtwork(); return; }
      if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea,button:not(.player-dialogue)')) return;
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
  }, [pendingRead, cancelRead, saveOperation, artworkView, canViewArtwork, restoreReading, showArtwork, preferencesOpen, closePreferences, historyPanelOpen, savePanelOpen, closeSavePanel, additionalContentOpen, additionalContentView, applyIntent, closeAdditionalContent, content, exitSceneReplay, hostActivity, selectedChoiceIndex, selectedGalleryAssetId, settingsApplication.advance.allowHold, snapshot.sceneReplay.active, readingMenuOpen, closeReadingMenu]);

  const gamepadAction = useRef<(action: PlayerGamepadActionV1) => void>(() => {});
  // Keep the polling session's edge history while dispatching against the latest story.
  gamepadAction.current = (action) => {
    if (artworkView) { if (action === 'cancel' || action === 'primary') restoreReading(); return; }
    if (savePanelOpen) { if (action === 'cancel' && saveOperation !== 'busy') { if (pendingRead) cancelRead(); else closeSavePanel(); } return; }
    if (historyPanelOpen) { if (action === 'cancel') setHistoryPanelOpen(false); return; }
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

  return (
    <main ref={fullscreen.element}
      className="player-shell"
      data-player-status={snapshot.status}
      data-artwork-view={artworkView}
      data-reading-menu-open={readingMenuOpen}
      data-compact-reading={compactReading}
      data-reading-unread-below={reading.unread}
      data-reading-pace={readingPace}
      data-preferences-open={preferencesOpen}
      data-player-muted={personal.preferences.muted}
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
        "--player-font-family": fontStatus === "ready" && typography.projectFont !== null
          ? `"${typography.projectFont.runtimeFamily}", ${typography.fallbackStack}`
          : typography.fallbackStack
      } as React.CSSProperties}
    >
      <div className="player-glow player-glow--violet" />
      <div className="player-glow player-glow--cyan" />
      {preferencesOpen && (infoView === 'credits' ? <PlayerCreditsPanel credits={credits} title={snapshot.title} panel={preferencesPanel} close={closePreferences} /> : <PlayerPreferencesPanel panel={preferencesPanel} preferences={personal.preferences} update={personal.update} saved={personal.saved} active={hostActivity === 'active'} close={closePreferences} fullscreen={fullscreen} />)}
      <section className="player-stage" inert={preferencesOpen} aria-label={`${snapshot.title} 游戏画面`}>
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
              hideResourceError
              onResourceState={status=>reportImage(`${imageGeneration}:${character.slot}:${character.assetId}`,status)}
              onResourceFailure={() => { setAutoEnabled(false); setAutoPlayback("stopped"); stopSkip(); }}
              key={`${imageGeneration}:${character.slot}:${character.assetId}`}
              className={`player-stage-character player-transition--${character.transition}`}
              src={character.url}
              alt={character.displayName}
              data-asset-id={character.assetId}
              data-stage-slot={character.slot}
              style={{ left: `${character.x}%`, top: `${character.y}%`, zIndex: character.z, transform: `translate(${-character.anchorX * 100}%, ${-character.anchorY * 100}%) scale(${character.scale}) rotate(${character.rotation}deg)`, animationDuration: `${character.durationMilliseconds}ms`, animationTimingFunction: character.easing }}
              onError={() => { if (!character.atlas && !character.canvasSampling) setMediaErrors((current) => [...new Set([...current, character.assetId])]); }}
            />
          ))}
        </div>
        {appliedAudio.map((track) => (
          <audio
            key={`${mediaGeneration}:${track.bus}:${track.assetId}`}
            muted={personal.preferences.muted}
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
            onError={(event) => {
              event.currentTarget.dataset.playerPlayback = "error";
              refreshAudioTransport(revision => revision + 1);
              if (track.bus === "voice") {
                event.currentTarget.dataset.voiceFailed = "true";
                setVoicePlaying(false);
              }
              setMediaErrors((current) => [...new Set([...current, track.assetId])]);
            }}
          />
        ))}
        {hostActivity === "active" && !skipActive && [...audioElements.current.values()].some(element => element.isConnected && element.dataset.shouldPlay === "true" && !element.ended && !element.error && ["blocked", "interrupted", "paused-by-policy"].includes(element.dataset.playerPlayback ?? "")) && (
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
        {memoryPressureMessage !== "" && <aside className="player-memory-pressure" role="status" aria-live="polite"><span>{memoryPressureMessage}</span>
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
        {content.kind !== 'title' && <div className="player-compact-toolbar" inert={artworkView}>
          {canViewArtwork && <button type="button" className="player-artwork-trigger" title="隐藏对白并停止自动推进（H）" disabled={hostActivity !== 'active' || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen || readingMenuOpen} onClick={showArtwork}><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-7 5 8" /></svg> 欣赏画面</button>}
          {autoEnabled && <button type="button" aria-label="停止自动阅读" onClick={() => { setAutoEnabled(false); setAutoPlayback('off'); }}>自动中 · 停止</button>}
          <button ref={readingMenuTrigger} type="button" aria-label={readingMenuOpen ? '关闭阅读菜单' : '打开阅读菜单'} aria-expanded={readingMenuOpen} aria-controls="player-reading-menu" disabled={hostActivity !== 'active' || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen} onClick={() => { if (readingMenuOpen) closeReadingMenu(); else { stopSkip(); setReadingMenuOpen(true); } }}>{readingMenuOpen ? '返回故事 ×' : '菜单 ☰'}</button>
        </div>}
        {compactReading && content.kind !== 'title' && <p className="player-portrait-hint">横屏更适合观看演出</p>}
        <div id="player-reading-menu" ref={readingMenu} className="player-control-layer" data-open={readingMenuOpen} inert={artworkView} role={readingMenuOpen ? 'dialog' : undefined} aria-modal={readingMenuOpen ? true : undefined} aria-label={readingMenuOpen ? '阅读菜单' : undefined}>
        {readingMenuOpen && <header className="player-reading-menu-heading"><strong>阅读菜单</strong><span>剧情暂停推进，设置后返回当前段落。</span><button type="button" onClick={closeReadingMenu}>返回故事</button></header>}
        <nav hidden={content.kind === 'title'} className="player-history-controls" aria-label="剧情历史控制">
          <h3 className="player-menu-only player-menu-section-title">回看与内容</h3>
          <button className="player-menu-only" ref={preferencesTrigger} type="button" aria-label="打开玩家设置" disabled={hostActivity !== 'active' || preferencesOpen || historyPanelOpen || savePanelOpen || additionalContentOpen} onClick={() => { stopSkip(); setReadingMenuOpen(false); setInfoView('preferences'); setPreferencesOpen(true); }}>设置</button>
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
            onClick={() => { setReadingMenuOpen(false); setHistoryPanelOpen((open) => !open); }}
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
          <aside className="player-history-panel" role="dialog" aria-label="剧情历史" aria-modal="false">
            <header>
              <div><span>HISTORY</span><h2>剧情历史</h2></div>
              <button type="button" aria-label="关闭剧情历史" onClick={() => setHistoryPanelOpen(false)}>关闭</button>
            </header>
            {snapshot.history === null ? <p className="player-history-panel__empty">故事开始后会在这里显示历史。</p> : <>
              {snapshot.history.forwardPolicy.blocked && <p className="player-history-panel__notice" role="status">项目设置禁止在回退后沿原分支前进。</p>}
              {snapshot.history.backwardBarrier !== null && (
                <p className="player-history-panel__barrier" role="status">
                  <strong>不可逆边界</strong>
                  <span>{snapshot.history.backwardBarrier.reason}</span>
                  <small>距离当前位置 {snapshot.history.backwardBarrier.distance} 步 · {snapshot.history.backwardBarrier.descriptorId}</small>
                </p>
              )}
              <section className="player-history-panel__section">
                <h3>当前主线</h3>
                {snapshot.history.activeEntries.length === 0 ? <p className="player-history-panel__empty">尚无可显示条目。</p> : (
                  <ol className="player-history-list">
                    {snapshot.history.activeEntries.map((entry) => {
                      const label = playerHistoryEventLabel(entry.event);
                      return <li key={entry.entryId} data-history-position={entry.position}>
                        {entry.canNavigateBack ? (
                          <button type="button" aria-label={`回退到：${label}`} disabled={hostActivity !== "active"} onClick={() => {
                            applyIntent({ kind: "history-back-to", entryId: entry.entryId }, pointerInput.current);
                            setHistoryPanelOpen(false);
                          }}>
                            <span>{playerHistoryEventKind(entry.event)} · {entry.position === "past" ? "已读" : entry.position === "current" ? "当前" : "前方"}</span>
                            <strong className="player-typography-text" lang={typography.locale}><PlayerRichText text={label} locale={typography.locale} /></strong>
                          </button>
                        ) : <div><span>{playerHistoryEventKind(entry.event)} · 不可回退</span><strong className="player-typography-text" lang={typography.locale}><PlayerRichText text={label} locale={typography.locale} /></strong></div>}
                      </li>;
                    })}
                  </ol>
                )}
              </section>
              {snapshot.history.archives.map((archive, archiveIndex) => (
                <section className="player-history-panel__section player-history-panel__archive" key={archive.archiveId} data-archive-id={archive.archiveId}>
                  <h3>归档记录 {archiveIndex + 1}</h3>
                  <p>旧分支或内存保护归档 · 只读，不支持回滚</p>
                  <ol className="player-history-list">
                    {archive.entries.map((entry) => <li key={entry.entryId}><div><span>{playerHistoryEventKind(entry.event)} · 归档</span><strong className="player-typography-text" lang={typography.locale}><PlayerRichText text={playerHistoryEventLabel(entry.event)} locale={typography.locale} /></strong></div></li>)}
                  </ol>
                </section>
              ))}
            </>}
          </aside>
        )}
        {additionalContentOpen && (
          <aside ref={additionalContentPanel} className="player-additional-content" role="dialog" aria-label="附加内容" aria-modal="true">
            <header>
              <div><span>EXTRAS</span><h2>附加内容</h2></div>
              <button ref={additionalContentClose} type="button" aria-label="返回剧情" onClick={closeAdditionalContent}>返回剧情</button>
            </header>
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
              <div className="player-additional-content__detail-heading">
                <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => { setSelectedGalleryAssetId(null); setAdditionalContentView("overview"); }}>← 返回总览</button>
                <div><span>GALLERY</span><h3>CG 画廊</h3><p>{snapshot.additionalContent.gallery.unlocked} / {snapshot.additionalContent.gallery.total} 已发现</p></div>
              </div>
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
              {selectedGalleryAssetId !== null && (() => {
                const item = snapshot.additionalContent.galleryItems.find((candidate) => candidate.assetId === selectedGalleryAssetId);
                const source = additionalContentSources.get(selectedGalleryAssetId);
                if (item?.displayName === null || item === undefined || source === undefined) return null;
                return <figure className="player-additional-content__preview" role="group" aria-label={`${item.displayName} 画面预览`}>
                  <DeferredAtlasImage atlas={source.atlas} src={source.url} alt="" />
                  <figcaption><strong>{item.displayName}</strong><button ref={galleryPreviewClose} type="button" aria-label="关闭画面预览" onClick={() => setSelectedGalleryAssetId(null)}>关闭预览</button></figcaption>
                </figure>;
              })()}
            </section>}
            {additionalContentView === "replay" && <section className="player-additional-content__detail" role="region" aria-label="场景回想内容">
              <div className="player-additional-content__detail-heading">
                <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => setAdditionalContentView("overview")}>← 返回总览</button>
                <div><span>SCENE REPLAY</span><h3>场景回想</h3><p>{snapshot.additionalContent.replay.unlocked} / {snapshot.additionalContent.replay.total} 已解锁</p></div>
              </div>
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
              <div className="player-additional-content__detail-heading">
                <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => setAdditionalContentView("overview")}>← 返回总览</button>
                <div><span>MUSIC</span><h3>音乐室</h3><p>{snapshot.additionalContent.music.unlocked} / {snapshot.additionalContent.music.total} 已收录</p></div>
              </div>
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
                        : <audio controls preload="metadata" muted={personal.preferences.muted} ref={element => { if (element) element.volume = galAudioGainV1(settingsApplication, 'bgm'); }} aria-label={`试听 ${item.displayName}`} src={source.url} onError={() => setAdditionalContentMediaErrors((current) => [...new Set([...current, item.assetId])])} />}</div>
                    </li>;
                  })}
                </ol>}
            </section>}
            {additionalContentView === "endings" && <section className="player-additional-content__detail" role="region" aria-label="结局内容">
              <div className="player-additional-content__detail-heading">
                <button ref={additionalContentDetailBack} type="button" aria-label="返回附加内容总览" onClick={() => setAdditionalContentView("overview")}>← 返回总览</button>
                <div><span>ENDINGS</span><h3>结局</h3><p>{snapshot.additionalContent.endings.unlocked} / {snapshot.additionalContent.endings.total} 已达成</p></div>
              </div>
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
            try { storePlayerReadingPace(globalThis.localStorage, project.manifest.projectId, pace); } catch { /* Denied storage does not block reading. */ }
          }}><option value="standard">标准</option><option value="calm">从容</option><option value="brisk">快速</option><option value="policy">原速</option></select></label>
          {content.kind !== 'title' && snapshot.localization.availableLocales.length > 1 && <>
            <label className="player-locale-control player-menu-only">语言<select aria-label="显示语言" value={snapshot.localization.selectedLocale} onChange={(event) => {
              const locale = event.target.value;
              setState((current) => configurePlayerCoreLocaleV1(current, locale));
              storePlayerLocalePreference(project.manifest.projectId, locale);
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
              <dialog ref={saveDialog} id="player-save-panel" className="player-save__panel" aria-label="存读档槽位" aria-modal="true" onCancel={event => { event.preventDefault(); if (saveOperation !== "busy") { if (pendingRead) cancelRead(); else closeSavePanel(); } }}>
                <header><strong>{saveView === "backup" ? "存档备份与恢复" : saveIntent === "save" ? "保存进度" : "读取进度"}</strong><button type="button" aria-label="关闭存读档" autoFocus disabled={saveOperation === "busy"} onClick={closeSavePanel}>返回故事 ×</button><span data-save-message role={saveOperation === "error" ? "alert" : undefined}>{saveMessage}{saveOperation === "error" && saveMessage === "存档损坏或与当前构建不兼容" && <small>读取失败不会修改当前剧情或原存档，可返回故事或尝试其他存档。</small>}</span></header>
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
              </dialog>
            )}
          </aside>
        )}
        </div>
        {saveFeedback && !savePanelOpen && <p className="player-save-feedback" role="status" aria-live="polite">{saveFeedback}</p>}
        {content.kind !== "title" && recoveryStore !== undefined && !snapshot.sceneReplay.active && (recoveryCandidate !== null || recoveryOperation === "error") && (
          <aside className="player-recovery" role={recoveryOperation === "error" ? "alert" : "status"} aria-live="polite">
            <div>
              <strong>{recoveryOperation === "error" ? "恢复保护需要处理" : "发现可恢复进度"}</strong>
              <span>{recoveryMessage}</span>
              {recoveryCandidate !== null && <small>{recoveryCandidate.sceneId} · {new Date(recoveryCandidate.savedAtEpochMilliseconds).toLocaleString("zh-CN", { hour12: false })} · 本地时间</small>}
            </div>
            {recoveryCandidate !== null && <button type="button" disabled={hostActivity !== "active" || !recoveryBuildCompatible} onClick={() => void restoreRecovery()}>恢复上次进度</button>}
            <button type="button" disabled={recoveryErrorAction === "retry" && recoveryWritePending.current?.coordinator === recoveryCoordinator} onClick={() => {
              if (recoveryErrorAction === "retry") {
                setRecoveryOperation("idle");
                setRecoveryErrorAction(null);
              } else void clearRecovery();
            }}>{recoveryErrorAction === "retry" ? "重试恢复保护" : "放弃并清除"}</button>
          </aside>
        )}

        {(stage.missingAssetIds.length > 0 || mediaErrors.length > 0) && (
          <div className="player-media-error" role="alert">
            <span>媒体未能安全呈现：{[...new Set([...stage.missingAssetIds, ...mediaErrors])].join("、")}</span>
            <button type="button" onClick={() => {
              setMediaErrors([]);
              setMediaGeneration((current) => current + 1);
              onRetryMedia?.();
            }}>重试媒体</button>
          </div>
        )}

        {content.kind === "title" && (
          <div className="player-title-screen">
            {cover?.url && failedCover !== cover.url && <img className="player-title-cover" src={cover.url} alt="" onError={() => setFailedCover(cover.url)} />}
            <p className="player-eyebrow">{appearance === null ? "A WORLd STUDIO STORY" : "视觉小说"}</p>
            <h1>{snapshot.title}</h1>
            {appearance === null ? <p>同一个故事核心，面向每一块屏幕。</p> : appearance.titleTagline && <p className="player-title-tagline">{appearance.titleTagline}</p>}
            {latestSlot && saveStore && recoveryOperation !== 'scanning' && (recoveryCandidate === null || !recoveryBuildCompatible) && <section className="player-recent-save" aria-label="最近存档"><button className="player-primary" type="button" disabled={hostActivity !== 'active' || saveOperation === 'busy'} onClick={() => requestLoadFromSlot(latestSlot.slotId, latestSlot.sessionArtifactHash)}>继续最近存档 <span aria-hidden="true">→</span></button><p>{playerSaveLabel(latestSlot.slotId)} · {latestSlot.sceneTitle} · {new Date(latestSlot.savedAtEpochMilliseconds).toLocaleString('zh-CN', { hour12: false })} · 本地时间</p></section>}
            <button className={latestSlot || recoveryCandidate !== null && recoveryBuildCompatible ? 'player-secondary' : 'player-primary'} type="button" disabled={hostActivity !== "active" || (recoveryStore !== undefined && recoveryOperation === "scanning")} onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => applyIntent({ kind: "primary" }, pointerInput.current)}>
              开始故事
              <span aria-hidden="true">→</span>
            </button>
            {settingsApplication.ui.showInputHints && <span className="player-hint">按 Enter 或空格开始</span>}
            <nav className="player-title-actions" aria-label="作品菜单">
              {saveStore !== undefined && <button ref={titleSaveTrigger} type="button" disabled={hostActivity !== 'active'} onClick={() => openSavePanel("load")}>读取存档</button>}
              <button ref={titlePreferencesTrigger} type="button" aria-label="打开玩家设置" disabled={hostActivity !== 'active'} onClick={() => { setInfoView('preferences'); setPreferencesOpen(true); }}>设置</button>
              {hasWebCredits(credits) && <button type="button" disabled={hostActivity !== 'active'} onClick={openCredits}>制作名单</button>}
              <button ref={titleAdditionalContentTrigger} type="button" aria-label="打开附加内容" disabled={hostActivity !== 'active'} onClick={openAdditionalContent}>附加内容</button>
              {snapshot.localization.availableLocales.length > 1 && <label className="player-title-locale">语言<select aria-label="显示语言" value={snapshot.localization.selectedLocale} onChange={event => {
                const locale = event.target.value; setState(current => configurePlayerCoreLocaleV1(current, locale)); storePlayerLocalePreference(project.manifest.projectId, locale);
              }}>{snapshot.localization.availableLocales.map(locale => <option key={locale} value={locale}>{locale}</option>)}</select></label>}
            </nav>
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
                  {recoveryOperation === "error" && <button type="button" onClick={() => setRecoveryScanAttempt(attempt => attempt + 1)}>重新检查恢复记录</button>}
                  {recoveryCandidate !== null && <button className="player-primary" type="button" disabled={hostActivity !== "active" || recoveryOperation === "scanning" || !recoveryBuildCompatible} onClick={() => void restoreRecovery()}>恢复上次进度</button>}
                  {(recoveryCandidate !== null || recoveryOperation === "error") && <button type="button" disabled={hostActivity !== "active" || recoveryOperation === "scanning"} onClick={() => void clearRecovery()}>放弃并清除</button>}
                </>}
              </div>
            </div>}
          </div>
        )}

        {artworkView && <button type="button" className="player-artwork-return" aria-label="恢复阅读" autoFocus onClick={restoreReading}><span>恢复阅读 <kbd>H / Esc</kbd></span></button>}
        {(content.kind === "dialogue" || content.kind === "narration") && (
          <button
            inert={artworkView || readingMenuOpen}
            className={`player-dialogue player-dialogue--${stage.textboxTemplate}`}
            ref={readingRef}
            type="button"
            data-text-ready={textReady}
            data-text-reveal-duration={textRevealDuration}
            onScroll={reading.measure}
            onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; reading.gesture.current = { x: event.clientX, y: event.clientY, moved: false }; }}
            onPointerMove={event => { if (Math.abs(event.clientX - reading.gesture.current.x) + Math.abs(event.clientY - reading.gesture.current.y) > 10) reading.gesture.current.moved = true; }}
            onPointerCancel={() => { reading.gesture.current.moved = true; }}
            onClick={event => { if (event.detail > 0 && reading.gesture.current.moved) return; applyIntent({ kind: "primary" }, pointerInput.current); }}
            aria-label="继续下一句"
          >
            {content.kind === "dialogue" && <strong>{speakerNames[content.speakerId] ?? content.speakerId}</strong>}
            <span
              key={`${presentedText}:${textRevealDuration}`}
              ref={releaseAnimationsOnDetach}
              className="player-dialogue__text player-typography-text"
              lang={typography.locale}
              data-cjk-line-break={typography.cjk ? "strict" : "standard"}
              aria-live="polite"
              style={{ "--gal-text-reveal-duration": `${textRevealDuration}ms` } as React.CSSProperties}
            ><PlayerRichText text={content.text} locale={typography.locale} /></span>
            <i aria-hidden="true">{reading.unread ? '向下阅读 ⌄' : !textReady ? '点击显示全文' : '点击继续 →'}</i>
          </button>
        )}
        {compactReading && (content.kind === 'dialogue' || content.kind === 'narration') && !readingMenuOpen && !preferencesOpen && <p className="player-reading-caption">{reading.unread ? '下滑或点文字，读本段下一屏' : !textReady ? '点击文字显示全文' : '点击文字继续故事'}</p>}

        {content.kind === "choice" && (
          <div className="player-choice" data-choice-layout={settingsApplication.choice.layout} role="group" aria-labelledby="player-choice-prompt">
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
          <div className="player-ending" role="status">
            <span>{snapshot.sceneReplay.active ? '回想结束' : '故事告一段落'}</span>
            <h2 className="player-typography-text" lang={typography.locale} data-cjk-line-break={typography.cjk ? "strict" : "standard"}><PlayerRichText text={content.name} locale={typography.locale} /></h2>
            {!snapshot.sceneReplay.active && <>
              <p className="player-ending-progress">已达成 {snapshot.additionalContent.endings.unlocked} / {snapshot.additionalContent.endings.total} 个结局</p>
              <p className="player-ending-note">已读、画廊、音乐与结局记录会保留。可以查看收藏，或读取存档探索其他选择。</p>
              {collection.error && <p className="player-collection-error" role="alert">本机收藏记录暂未保存，请保留故事存档后重试。<button type="button" onClick={collection.retry}>重试保存收藏</button></p>}
              <button className="player-primary" type="button" onClick={() => { openAdditionalContent(); setAdditionalContentView('endings'); }}>查看收藏与结局</button>
              {hasWebCredits(credits) && <button className="player-secondary" type="button" disabled={hostActivity !== 'active'} onClick={openCredits}>制作名单</button>}
              {saveStore && <button className="player-secondary" type="button" onClick={() => openSavePanel('load')}>读取存档探索其他路线</button>}
            </>}
            <button className="player-secondary" type="button" onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => snapshot.sceneReplay.active ? exitSceneReplay() : applyIntent({ kind: "restart" }, pointerInput.current)}>{snapshot.sceneReplay.active ? "结束回想，返回原剧情" : "回到标题"}</button>
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

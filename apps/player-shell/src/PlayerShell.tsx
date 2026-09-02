import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { semanticHash, type CanonicalProject } from "@world-studio/project-domain";
import {
  createPlayerCore,
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
import { browserGamepadFrameV1, createEmptyPlayerGamepadFrameV1, playerGamepadActionV1 } from "./player-input";
import {
  WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES,
  WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_HEIGHT,
  WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_WIDTH,
  createWorldPlayerSaveSlotV3,
  worldPlayerSavePreviewSha256V1,
  type WorldPlayerSavePreviewV2,
  type WorldPlayerSaveSlotV3,
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
}

type PlayerInputSource = "lifecycle" | GalAdvanceInputV1 | "system";
export type PlayerHostActivityV1 = "active" | "suspended";

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

function PlayerSavePreview({ projectId, slot, store }: { readonly projectId: string; readonly slot: WorldPlayerSaveSlotV3 | undefined; readonly store: WorldPlayerSaveStoreV3 }) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    if (slot?.preview.status !== "available") {
      setSource(null);
      return;
    }
    let disposed = false;
    let objectUrl: string | null = null;
    void store.readPreview(projectId, slot.slotId).then((blob) => {
      if (disposed || blob === null || typeof URL.createObjectURL !== "function") return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => {
      if (!disposed) setSource(null);
    });
    return () => {
      disposed = true;
      if (objectUrl !== null && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, slot, store]);

  return source === null
    ? <span className="player-save__preview" data-preview-status={slot?.preview.status ?? "empty"} aria-label={slot?.preview.status === "available" ? "截图正在读取" : "没有存档截图"} />
    : <img className="player-save__preview" src={source} alt={`${slot?.sceneTitle ?? "存档"} 截图`} />;
}

function playerLocalePreferenceKey(projectId: string): string {
  return `world-player.locale.${projectId}`;
}

function createLocalizedPlayerCore(project: CanonicalProject, historyPolicy: Parameters<typeof createPlayerCore>[1]) {
  const core = createPlayerCore(project, historyPolicy);
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

export function PlayerShell({ project, mediaAssets = [], onRetryMedia, hostActivity = "active", platform = "web", saveStore, recoveryStore, previewCapture, now = Date.now, playbackPolicy = DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 }: PlayerShellProps) {
  const settingsApplication = useMemo(() => createGalSettingsApplicationV1(project.settings, platform), [platform, project.settings]);
  const [state, setState] = useState(() => createLocalizedPlayerCore(project, settingsApplication.history));
  const [mediaErrors, setMediaErrors] = useState<readonly string[]>([]);
  const [mediaGeneration, setMediaGeneration] = useState(0);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState(0);
  const [lastInputSource, setLastInputSource] = useState<PlayerInputSource>("lifecycle");
  const [lastInputAccepted, setLastInputAccepted] = useState(true);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceEnded, setVoiceEnded] = useState(false);
  const [voiceMetadataRevision, setVoiceMetadataRevision] = useState(0);
  const [textReady, setTextReady] = useState(true);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoPlayback, setAutoPlayback] = useState<"off" | "waiting-text" | "waiting-voice-metadata" | "waiting-video" | "waiting" | "advancing" | "suspended" | "stopped">("off");
  const [skipMode, setSkipMode] = useState<"skipRead" | "skipAll" | null>(null);
  const [skipActivation, setSkipActivation] = useState<WorldPlayerSkipActivationV1>(() => playbackPolicy.skip?.defaultActivation ?? DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.skip.defaultActivation);
  const [skipSpeed, setSkipSpeed] = useState<WorldPlayerSkipSpeedV1>(() => playbackPolicy.skip?.defaultSpeed ?? DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.skip.defaultSpeed);
  const [videoPolicyStopReason, setVideoPolicyStopReason] = useState<"none" | "unreadBoundary">("none");
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [saveSlots, setSaveSlots] = useState<readonly WorldPlayerSaveSlotV3[]>([]);
  const [savePage, setSavePage] = useState(0);
  const [saveView, setSaveView] = useState<"manual" | "auto" | "quick" | "checkpoint">("manual");
  const [pendingOverwriteSlotId, setPendingOverwriteSlotId] = useState<string | null>(null);
  const [saveOperation, setSaveOperation] = useState<"idle" | "busy" | "saved" | "loaded" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("请选择槽位");
  const [recoveryCandidate, setRecoveryCandidate] = useState<WorldPlayerRecoveryRecordV1 | null>(null);
  const [recoveryOperation, setRecoveryOperation] = useState<"scanning" | "idle" | "available" | "ready" | "loaded" | "error">("scanning");
  const [recoveryMessage, setRecoveryMessage] = useState("正在检查恢复记录…");
  const [recoveryErrorAction, setRecoveryErrorAction] = useState<"clear" | "retry" | null>(null);
  const choiceButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const pointerInput = useRef<"pointer" | "touch">("pointer");
  const previousHostActivity = useRef(hostActivity);
  const previousSkipActive = useRef(false);
  const skipModeCurrent = useRef<"skipRead" | "skipAll" | null>(null);
  const skipAwaitingDispatch = useRef(false);
  const saveContext = useRef({ projectId: project.manifest.projectId, store: saveStore, previewCapture });
  const recoveryContext = useRef({ projectId: project.manifest.projectId, store: recoveryStore });
  const autoSavedSceneIdentities = useRef(new Set<string>());
  const consumedCheckpointCandidates = useRef(new Set<string>());
  const lastRecoveryRuntimeStateHash = useRef<string | null>(null);
  saveContext.current = { projectId: project.manifest.projectId, store: saveStore, previewCapture };
  recoveryContext.current = { projectId: project.manifest.projectId, store: recoveryStore };
  const executableProjectHash = useMemo(() => semanticHash({ ...project, settings: createGalSettingsDocument() }), [project]);
  const snapshot = useMemo(() => createPlayerCoreSnapshotV1(state), [state]);
  const buildStopInstructionIds = state.artifacts?.playerPlaybackPolicy.stopInstructionIds ?? [];
  const saveCoordinator = useMemo(() => saveStore === undefined ? undefined : new WorldPlayerSaveWriteCoordinatorV1(saveStore), [saveStore]);
  const recoveryCoordinator = useMemo(() => recoveryStore === undefined ? undefined : new WorldPlayerRecoveryWriteCoordinatorV1(recoveryStore), [recoveryStore]);
  const content = snapshot.presentation;
  const saveBoundaryAllowed = worldPlayerAutoSaveAllowedV1(snapshot.status, snapshot.presentation.kind);
  const quickSlot = saveSlots.find((slot) => slot.slotId === "quick-1");
  const stage = useMemo(
    () => derivePlayerStagePresentationV1(snapshot, mediaAssets, settingsApplication.stage, settingsApplication.ui),
    [mediaAssets, settingsApplication.stage, settingsApplication.ui, snapshot]
  );
  const appliedAudio = stage.audio.map((track) => ({
    ...track,
    appliedVolume: galAudioGainV1(
      settingsApplication,
      (["bgm", "voice", "sfx", "ambient", "ui"].includes(track.bus) ? track.bus : "sfx") as GalAudioBusV1,
      track.volume,
      voicePlaying
    )
  }));
  const mediaSignature = useMemo(() => mediaAssets.map((asset) => `${asset.assetId}\0${asset.mimeType}\0${asset.url}`).join("\x01"), [mediaAssets]);
  const lastEffectOperation = snapshot.effects.operations.at(-1) ?? null;
  const speakerNames = useMemo(() => Object.fromEntries(project.characters.characters.flatMap((character) => {
    const id = typeof character.id === "string" ? character.id : undefined;
    const displayName = typeof character.displayName === "string" ? character.displayName : undefined;
    return id === undefined || displayName === undefined ? [] : [[id, displayName] as const];
  })), [project.characters.characters]);
  const presentedText = content.kind === "dialogue" || content.kind === "narration" ? content.text : "";
  const textRevealDuration = useMemo(
    () => presentedText === "" ? 0 : galTextRevealDurationMillisecondsV1(settingsApplication, presentedText),
    [presentedText, settingsApplication]
  );
  const canonicalPlaybackPolicy = validateWorldPlayerPlaybackPolicyV1(playbackPolicy) ? playbackPolicy : DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1;
  const skipActive = skipMode !== null;

  const stopSkip = useCallback(() => {
    skipModeCurrent.current = null;
    setSkipMode(null);
  }, []);
  const startSkip = useCallback((mode: "skipRead" | "skipAll") => {
    skipAwaitingDispatch.current = true;
    skipModeCurrent.current = mode;
    setVideoPolicyStopReason("none");
    setAutoEnabled(false);
    setAutoPlayback("off");
    setSkipMode(mode);
  }, []);

  const refreshSaveSlots = useCallback(async () => {
    if (saveStore === undefined) return;
    const projectId = project.manifest.projectId;
    try {
      const slots = await saveStore.list(projectId);
      if (saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      setSaveSlots(slots);
    } catch {
      setSaveOperation("error");
      setSaveMessage("存档存储不可用");
    }
  }, [project.manifest.projectId, saveStore]);

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

  const persistCurrentSlot = useCallback(async (kind: "manual" | "auto" | "quick", slotId: string, capturedState = state, capturedSnapshot = snapshot) => {
    if (saveStore === undefined || capturedSnapshot.identities.buildId === null || capturedSnapshot.runtimeStateHash === null || capturedState.runtimeState === null) throw new Error("WORLD_PLAYER_SAVE_NOT_READY");
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
      await saveStore.write(createWorldPlayerSaveSlotV3({
        kind,
        slotId,
        projectId,
        buildId: capturedSnapshot.identities.buildId,
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
      }), captured.blob);
      return captured.metadata.status;
  }, [captureSavePreview, now, project, saveStore, snapshot, state]);

  const saveToSlot = useCallback(async (kind: "manual" | "quick", slotId: string) => {
    if (saveCoordinator === undefined) return;
    setSaveOperation("busy");
    setSaveMessage("正在写入…");
    const projectId = project.manifest.projectId;
    try {
      const previewStatus = await saveCoordinator.writeFixed(() => persistCurrentSlot(kind, slotId));
      if (saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore || saveContext.current.previewCapture !== previewCapture) return;
      await refreshSaveSlots();
      setPendingOverwriteSlotId(null);
      setSaveOperation("saved");
      setSaveMessage(`${slotId} 已保存${previewStatus === "available" ? "（含截图）" : "（预览不可用）"}`);
    } catch {
      setSaveOperation("error");
      setSaveMessage("写入失败，原存档保持不变");
    }
  }, [persistCurrentSlot, previewCapture, project.manifest.projectId, refreshSaveSlots, saveCoordinator, saveStore]);

  const requestSaveToSlot = useCallback((slotId: string, occupied: boolean) => {
    if (occupied && pendingOverwriteSlotId !== slotId) {
      setPendingOverwriteSlotId(slotId);
      setSaveOperation("idle");
      setSaveMessage(`${slotId} 已有存档，请再次确认覆盖`);
      return;
    }
    void saveToSlot("manual", slotId);
  }, [pendingOverwriteSlotId, saveToSlot]);

  const loadFromSlot = useCallback(async (slotId: string) => {
    if (saveStore === undefined) return;
    setSaveOperation("busy");
    setSaveMessage("正在校验…");
    const projectId = project.manifest.projectId;
    try {
      const slot = await saveStore.read(projectId, slotId);
      if (saveContext.current.projectId !== projectId || saveContext.current.store !== saveStore) return;
      if (slot === null) throw new Error("WORLD_PLAYER_SAVE_MISSING");
      const loaded = loadPlayerCoreSessionSaveV1(state, slot.serializedSessionSave);
      if (!loaded.ok || loaded.artifactHash !== slot.sessionArtifactHash) throw new Error("WORLD_PLAYER_SAVE_REJECTED");
      const loadedSnapshot = createPlayerCoreSnapshotV1(loaded.state);
      if (slot.projectId !== projectId || slot.buildId !== loadedSnapshot.identities.buildId || slot.runtimeStateHash !== loaded.savedRuntimeStateHash ||
          slot.sceneId !== loaded.savedSceneId || slot.presentationKind !== loadedSnapshot.presentation.kind || slot.title !== loadedSnapshot.title) {
        throw new Error("WORLD_PLAYER_SAVE_METADATA_MISMATCH");
      }
      if (loadedSnapshot.identities.buildId !== null) autoSavedSceneIdentities.current.add(worldPlayerSaveSceneIdentityV1(loadedSnapshot.identities.buildId, slot.sceneId));
      setState(loaded.state);
      setSaveOperation("loaded");
      setSaveMessage(`${slotId} 已读取`);
      setSavePanelOpen(false);
    } catch {
      setSaveOperation("error");
      setSaveMessage("存档损坏或与当前构建不兼容");
    }
  }, [project.manifest.projectId, saveStore, state]);

  const restoreRecovery = useCallback(async () => {
    if (recoveryCandidate === null || recoveryStore === undefined) return;
    setRecoveryOperation("scanning");
    setRecoveryMessage("正在校验恢复记录…");
    try {
      const loaded = loadPlayerCoreSessionSaveV1(state, recoveryCandidate.serializedSessionSave);
      if (!loaded.ok || loaded.artifactHash !== recoveryCandidate.sessionArtifactHash) throw new Error("WORLD_PLAYER_RECOVERY_REJECTED");
      const loadedSnapshot = createPlayerCoreSnapshotV1(loaded.state);
      if (recoveryCandidate.projectId !== project.manifest.projectId || recoveryCandidate.buildId !== loadedSnapshot.identities.buildId ||
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
      setRecoveryMessage("已恢复上次安全进度");
      setRecoveryErrorAction(null);
    } catch {
      setRecoveryOperation("error");
      setRecoveryMessage("恢复记录损坏或与当前构建不兼容，正式存档未受影响");
      setRecoveryErrorAction("clear");
    }
  }, [project.manifest.projectId, recoveryCandidate, recoveryStore, state]);

  const clearRecovery = useCallback(async () => {
    if (recoveryCoordinator === undefined || recoveryStore === undefined) return;
    const projectId = project.manifest.projectId;
    try {
      await recoveryCoordinator.clear(projectId);
      if (recoveryContext.current.projectId !== projectId || recoveryContext.current.store !== recoveryStore) return;
      setRecoveryCandidate(null);
      setRecoveryOperation("idle");
      setRecoveryMessage("恢复记录已清除");
      setRecoveryErrorAction(null);
      lastRecoveryRuntimeStateHash.current = null;
    } catch {
      setRecoveryOperation("error");
      setRecoveryMessage("恢复记录无法清除，未修改正式存档");
      setRecoveryErrorAction("retry");
    }
  }, [project.manifest.projectId, recoveryCoordinator, recoveryStore]);

  const applyIntent = useCallback((intent: PlayerCoreIntentV1, source: PlayerInputSource) => {
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
    if (intent.kind === "primary" && settingsApplication.advance.waitForVoice && voicePlaying) {
      setLastInputAccepted(false);
      return;
    }
    setLastInputAccepted(true);
    setState((current) => dispatchPlayerCoreIntentV1(current, project, intent));
  }, [content.kind, project, settingsApplication, stopSkip, textReady, voicePlaying]);

  useEffect(() => {
    autoSavedSceneIdentities.current.clear();
    consumedCheckpointCandidates.current.clear();
    lastRecoveryRuntimeStateHash.current = null;
    setState(createLocalizedPlayerCore(project, settingsApplication.history));
    setMediaErrors([]);
    setMediaGeneration(0);
    setSelectedChoiceIndex(0);
    setLastInputSource("lifecycle");
    setLastInputAccepted(true);
    setVoicePlaying(false);
    setVoiceEnded(false);
    setVoiceMetadataRevision(0);
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
    setRecoveryCandidate(null);
    setRecoveryErrorAction(null);
    if (recoveryStore === undefined) {
      setRecoveryOperation("idle");
      setRecoveryMessage("恢复存储不可用");
      return;
    }
    setRecoveryOperation("scanning");
    setRecoveryMessage("正在检查恢复记录…");
    void recoveryStore.read(projectId).then((candidate) => {
      if (recoveryContext.current.projectId !== projectId || recoveryContext.current.store !== recoveryStore) return;
      setRecoveryCandidate(candidate);
      setRecoveryOperation(candidate === null ? "idle" : "available");
      setRecoveryMessage(candidate === null ? "没有待恢复进度" : "发现上次未完成的安全进度");
    }).catch(() => {
      if (recoveryContext.current.projectId !== projectId || recoveryContext.current.store !== recoveryStore) return;
      setRecoveryOperation("error");
      setRecoveryMessage("恢复记录损坏，已与正式存档隔离");
      setRecoveryErrorAction("clear");
    });
  }, [project.manifest.projectId, recoveryStore]);

  useEffect(() => {
    setSaveSlots([]);
    setSavePage(0);
    setSaveView("manual");
    setPendingOverwriteSlotId(null);
    setSaveOperation("idle");
    setSaveMessage("请选择槽位");
    void refreshSaveSlots();
  }, [refreshSaveSlots]);

  useEffect(() => {
    if (saveCoordinator === undefined || saveStore === undefined || hostActivity !== "active" || snapshot.identities.buildId === null || state.runtimeState === null ||
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
    if (saveCoordinator === undefined || saveStore === undefined || hostActivity !== "active" || snapshot.identities.buildId === null || state.checkpointSaveCandidates.length === 0) return;
    const buildId = snapshot.identities.buildId;
    for (const candidate of state.checkpointSaveCandidates) {
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

  useEffect(() => {
    if (recoveryCoordinator === undefined || recoveryStore === undefined || hostActivity !== "active" || state.runtimeState === null ||
        snapshot.identities.buildId === null || snapshot.runtimeStateHash === null || !saveBoundaryAllowed || recoveryCandidate !== null ||
        !["idle", "ready", "loaded"].includes(recoveryOperation) || lastRecoveryRuntimeStateHash.current === snapshot.runtimeStateHash) return;
    const created = createPlayerCoreSessionSaveV1(state);
    if (!created.ok) return;
    const record = createWorldPlayerRecoveryRecordV1({
      projectId: project.manifest.projectId,
      buildId: snapshot.identities.buildId,
      savedAtEpochMilliseconds: now(),
      title: snapshot.title,
      sceneId: state.runtimeState.cursor.sceneId,
      presentationKind: snapshot.presentation.kind,
      runtimeStateHash: snapshot.runtimeStateHash,
      sessionArtifactHash: created.artifactHash,
      serializedSessionSave: created.serialized
    });
    lastRecoveryRuntimeStateHash.current = snapshot.runtimeStateHash;
    void recoveryCoordinator.write(record).then(() => {
      if (recoveryContext.current.projectId !== record.projectId || recoveryContext.current.store !== recoveryStore) return;
      setRecoveryOperation("ready");
      setRecoveryMessage("当前进度已写入独立恢复区");
      setRecoveryErrorAction(null);
    }).catch(() => {
      if (recoveryContext.current.projectId !== record.projectId || recoveryContext.current.store !== recoveryStore) return;
      lastRecoveryRuntimeStateHash.current = null;
      setRecoveryOperation("error");
      setRecoveryMessage("恢复保护写入失败，旧恢复点和正式存档保持不变");
      setRecoveryErrorAction("retry");
    });
  }, [hostActivity, now, project.manifest.projectId, recoveryCandidate, recoveryCoordinator, recoveryOperation, recoveryStore, saveBoundaryAllowed, snapshot, state]);

  useEffect(() => {
    if (presentedText === "") {
      setTextReady(true);
      return;
    }
    setTextReady(false);
    const timer = window.setTimeout(() => setTextReady(true), textRevealDuration);
    return () => window.clearTimeout(timer);
  }, [presentedText, textRevealDuration]);

  useEffect(() => {
    if (!autoEnabled) return;
    if (hostActivity !== "active") {
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
    if (!textReady) {
      setAutoPlayback("waiting-text");
      return;
    }

    const voice = audioElements.current.get("voice");
    let voiceDurationMilliseconds = 0;
    const voiceShouldContinue = voice !== undefined
      && !voiceEnded
      && (voicePlaying || voice.dataset.shouldPlay === "true");
    if (voiceShouldContinue) {
      const remainingSeconds = voice.duration - voice.currentTime;
      if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) {
        setAutoPlayback("waiting-voice-metadata");
        return;
      }
      voiceDurationMilliseconds = Math.ceil(remainingSeconds * 1000);
    }
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
        millisecondsPerReadableUnit: canonicalPlaybackPolicy.auto.millisecondsPerReadableUnit,
        readableUnits,
        voiceDurationMilliseconds,
        voiceTailMilliseconds: voiceDurationMilliseconds > 0 ? canonicalPlaybackPolicy.auto.voiceTailMilliseconds : 0
      }
    };
    const delay = Math.max(
      policy.autoTiming.baseDelayMilliseconds + policy.autoTiming.millisecondsPerReadableUnit * readableUnits,
      policy.autoTiming.voiceDurationMilliseconds + policy.autoTiming.voiceTailMilliseconds
    );
    setAutoPlayback("waiting");
    const timer = window.setTimeout(() => {
      setAutoPlayback("advancing");
      setState((current) => schedulePlayerCorePlaybackV1(current, policy));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [autoEnabled, buildStopInstructionIds, canonicalPlaybackPolicy, content, hostActivity, snapshot.status, stage.video, textReady, voiceEnded, voiceMetadataRevision, voicePlaying]);

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
  }, [buildStopInstructionIds, canonicalPlaybackPolicy.skip, hostActivity, project, skipActivation, skipActive, skipMode, skipSpeed, snapshot.history?.cursor, snapshot.playback.accumulatedInstructions, snapshot.playback.executedInstructions, snapshot.playback.mode, snapshot.playback.stopReason, snapshot.status, stage.video, stopSkip]);

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
    if (hostActivity !== "active") return;
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [applyIntent, content, hostActivity, selectedChoiceIndex, settingsApplication.advance.allowHold]);

  useEffect(() => {
    if (hostActivity !== "active") return;
    if (typeof navigator.getGamepads !== "function") return;
    let animationFrame = 0;
    let previous = createEmptyPlayerGamepadFrameV1();
    const poll = () => {
      const gamepad = navigator.getGamepads().find((candidate) => candidate !== null);
      if (gamepad !== undefined && gamepad !== null) {
        const current = browserGamepadFrameV1(gamepad);
        const action = playerGamepadActionV1(previous, current);
        previous = current;
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
      } else {
        previous = createEmptyPlayerGamepadFrameV1();
      }
      animationFrame = requestAnimationFrame(poll);
    };
    animationFrame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animationFrame);
  }, [applyIntent, content, hostActivity, selectedChoiceIndex]);

  useEffect(() => {
    const previous = previousHostActivity.current;
    previousHostActivity.current = hostActivity;
    if (previous === hostActivity) return;
    for (const element of audioElements.current.values()) {
      if (hostActivity === "suspended") {
        element.dataset.playerPlayback = "suspended";
        element.pause();
      } else if (element.dataset.shouldPlay === "true" && settingsApplication.audio.resumeAfterInterruption) {
        element.dataset.playerPlayback = "resuming";
        const resumed = element.play();
        resumed?.then(() => {
          element.dataset.playerPlayback = "playing";
        }).catch(() => {
          element.dataset.playerPlayback = "blocked";
        });
      } else if (element.dataset.shouldPlay === "true") {
        element.dataset.playerPlayback = "paused-by-policy";
      }
    }
    const video = videoElement.current;
    if (video !== null) {
      if (hostActivity === "suspended") {
        video.dataset.playerPlayback = "suspended";
        video.pause();
      } else if (video.dataset.shouldPlay === "true" && settingsApplication.audio.resumeAfterInterruption) {
        video.dataset.playerPlayback = "resuming";
        const resumed = video.play();
        resumed?.then(() => { video.dataset.playerPlayback = "playing"; }).catch(() => { video.dataset.playerPlayback = "blocked"; });
      } else if (video.dataset.shouldPlay === "true") video.dataset.playerPlayback = "paused-by-policy";
    }
  }, [hostActivity, settingsApplication.audio.resumeAfterInterruption]);

  useEffect(() => {
    const wasActive = previousSkipActive.current;
    previousSkipActive.current = skipActive;
    for (const element of audioElements.current.values()) {
      if (skipActive) {
        element.dataset.playerPlayback = "skipped";
        element.pause();
      } else if (wasActive && hostActivity === "active" && element.dataset.shouldPlay === "true") {
        element.dataset.playerPlayback = "resuming-after-skip";
        const resumed = element.play();
        resumed?.then(() => { element.dataset.playerPlayback = "playing"; }).catch(() => { element.dataset.playerPlayback = "blocked"; });
      }
    }
  }, [hostActivity, skipActive]);

  useEffect(() => () => {
    for (const element of audioElements.current.values()) {
      if (!element.paused) element.pause();
    }
    const video = videoElement.current;
    if (video !== null && !video.paused) video.pause();
  }, []);

  return (
    <main
      className="player-shell"
      data-player-status={snapshot.status}
      data-player-locale={snapshot.localization.selectedLocale}
      data-player-locale-fallbacks={snapshot.localization.missingTranslationCount}
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
      data-history-archives={snapshot.history?.archives.length ?? 0}
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
      data-skip-media={skipActive ? "accelerated" : "normal"}
      data-video-policy-stop-reason={videoPolicyStopReason}
      data-settings-platform={platform}
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
        "--gal-letter-spacing": `${settingsApplication.text.letterSpacingEm}em`
      } as React.CSSProperties}
    >
      <div className="player-glow player-glow--violet" />
      <div className="player-glow player-glow--cyan" />
      <section className="player-stage" aria-label={`${snapshot.title} 游戏画面`}>
        <div className="player-stage-world" data-skip-media={skipActive ? "accelerated" : "normal"} style={{ transform: stage.cameraTransform }} aria-label="正式媒体舞台">
          {stage.background !== null && (
            <img
              key={`${mediaGeneration}:background:${stage.background.assetId}`}
              className={`player-stage-background player-transition--${stage.background.transition}`}
              src={stage.background.url}
              alt={stage.background.displayName}
              data-asset-id={stage.background.assetId}
              style={{ animationDuration: `${stage.background.durationMilliseconds}ms`, animationTimingFunction: stage.background.easing }}
              onError={() => setMediaErrors((current) => [...new Set([...current, stage.background!.assetId])])}
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
                  element.dataset.shouldPlay = String(stage.video?.status === "playing");
                  element.dataset.playerPlayback = hostActivity === "suspended" ? "suspended" : stage.video?.status ?? "ended";
                } else {
                  const previous = videoElement.current;
                  if (previous !== null && !previous.paused) previous.pause();
                  videoElement.current = null;
                }
              }}
              onEnded={() => {
                const video = videoElement.current;
                if (video !== null) {
                  video.dataset.shouldPlay = "false";
                  video.dataset.playerPlayback = "ended";
                }
                if (stage.video?.awaited === true && hostActivity === "active") applyIntent({ kind: "primary" }, "system");
              }}
              onError={() => {
                const video = videoElement.current;
                if (video !== null) {
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
            <img
              key={`${mediaGeneration}:${character.slot}:${character.assetId}`}
              className={`player-stage-character player-transition--${character.transition}`}
              src={character.url}
              alt={character.displayName}
              data-asset-id={character.assetId}
              data-stage-slot={character.slot}
              style={{ left: `${character.x}%`, top: `${character.y}%`, zIndex: character.z, transform: `translate(${-character.anchorX * 100}%, ${-character.anchorY * 100}%) scale(${character.scale}) rotate(${character.rotation}deg)`, animationDuration: `${character.durationMilliseconds}ms`, animationTimingFunction: character.easing }}
              onError={() => setMediaErrors((current) => [...new Set([...current, character.assetId])])}
            />
          ))}
        </div>
        {appliedAudio.map((track) => (
          <audio
            key={`${mediaGeneration}:${track.bus}:${track.assetId}`}
            ref={(element) => {
              if (element !== null) {
                audioElements.current.set(track.bus, element);
                element.volume = track.appliedVolume;
                element.dataset.appliedVolume = String(element.volume);
                element.dataset.shouldPlay = String(track.status === "playing");
                element.dataset.playerPlayback = hostActivity === "suspended" ? "suspended" : track.status;
              } else audioElements.current.delete(track.bus);
            }}
            src={track.url}
            data-audio-bus={track.bus}
            data-asset-id={track.assetId}
            data-volume={track.volume}
            data-applied-volume={track.appliedVolume}
            aria-label={`${track.displayName} · ${track.bus}`}
            autoPlay={hostActivity === "active" && track.status === "playing"}
            loop={track.loop}
            onLoadedMetadata={() => {
              if (track.bus === "voice") {
                setVoiceEnded(false);
                setVoiceMetadataRevision((revision) => revision + 1);
              }
            }}
            onPlay={() => {
              if (track.bus === "voice") {
                setVoiceEnded(false);
                setVoicePlaying(true);
              }
            }}
            onPause={() => { if (track.bus === "voice") setVoicePlaying(false); }}
            onEnded={() => {
              if (track.bus === "voice") {
                setVoiceEnded(true);
                setVoicePlaying(false);
              }
            }}
            onError={() => setMediaErrors((current) => [...new Set([...current, track.assetId])])}
          />
        ))}
        {hostActivity === "suspended" && (
          <div className="player-host-suspended" role="status" aria-live="polite">
            <span>PLAYER PAUSED</span>
            <strong>宿主已暂停</strong>
            <p>剧情状态已冻结，返回应用后继续。</p>
          </div>
        )}
        <header className="player-brand" aria-label="播放器状态">
          <span className="player-brand__mark" aria-hidden="true">W</span>
          <span>WorLd Player</span>
          <span className="player-brand__status">{snapshot.status}</span>
          {lastEffectOperation !== null && <span className="player-brand__effect">FX {lastEffectOperation.sequence + 1} · {lastEffectOperation.kind}</span>}
        </header>
        <nav className="player-history-controls" aria-label="剧情历史控制">
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
            onClick={() => setHistoryPanelOpen((open) => !open)}
          ><span aria-hidden="true">☰</span><span>历史</span></button>
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
                            <strong>{label}</strong>
                          </button>
                        ) : <div><span>{playerHistoryEventKind(entry.event)} · 不可回退</span><strong>{label}</strong></div>}
                      </li>;
                    })}
                  </ol>
                )}
              </section>
              {snapshot.history.archives.map((archive, archiveIndex) => (
                <section className="player-history-panel__section player-history-panel__archive" key={archive.archiveId} data-archive-id={archive.archiveId}>
                  <h3>旧分支 {archiveIndex + 1}</h3>
                  <p>从历史位置 {archive.branchPointHistoryIndex} 分岔 · 只读</p>
                  <ol className="player-history-list">
                    {archive.entries.map((entry) => <li key={entry.entryId}><div><span>{playerHistoryEventKind(entry.event)} · 旧分支</span><strong>{playerHistoryEventLabel(entry.event)}</strong></div></li>)}
                  </ol>
                </section>
              ))}
            </>}
          </aside>
        )}
        <div className="player-playback-controls" aria-label="播放控制">
          {snapshot.localization.availableLocales.length > 1 && <>
            <label className="player-locale-control">语言<select aria-label="显示语言" value={snapshot.localization.selectedLocale} onChange={(event) => {
              const locale = event.target.value;
              setState((current) => configurePlayerCoreLocaleV1(current, locale));
              storePlayerLocalePreference(project.manifest.projectId, locale);
            }}>{snapshot.localization.availableLocales.map((locale) => <option key={locale} value={locale}>{locale}</option>)}</select></label>
            <span role="status" aria-label="语言状态">{snapshot.localization.selectedLocale === snapshot.localization.sourceLocale
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
            aria-label="快进全部"
            aria-pressed={skipMode === "skipAll"}
            disabled={snapshot.status !== "presenting"}
            onPointerDown={() => { if (skipActivation === "hold") startSkip("skipAll"); }}
            onKeyDown={(event) => { if (skipActivation === "hold" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); startSkip("skipAll"); } }}
            onClick={() => { if (skipActivation === "toggle") { if (skipMode === "skipAll") stopSkip(); else startSkip("skipAll"); } }}
          >全部</button>
          <label>方式<select aria-label="快进激活方式" value={skipActivation} onChange={(event) => { stopSkip(); setSkipActivation(event.target.value as WorldPlayerSkipActivationV1); }}><option value="toggle">切换</option><option value="hold">按住</option></select></label>
          <label>速度<select aria-label="快进速度" value={String(skipSpeed)} onChange={(event) => { stopSkip(); setSkipSpeed(event.target.value === "instant" ? "instant" : Number(event.target.value) as 5 | 10 | 20 | 40); }}><option value="5">5×</option><option value="10">10×</option><option value="20">20×</option><option value="40">40×</option><option value="instant">瞬时</option></select></label>
          <span aria-live="polite">{autoEnabled ? autoPlayback === "suspended" ? "自动播放已暂停" : "自动播放中" : autoPlayback === "stopped" ? "自动播放已停止" : "自动播放关闭"}</span>
        </div>
        {saveStore !== undefined && (
          <aside className="player-save" data-open={savePanelOpen}>
            <div className="player-save__quick-controls" aria-label="快速存读档">
              <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || !saveBoundaryAllowed} onClick={() => void saveToSlot("quick", "quick-1")}>快速保存</button>
              <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || quickSlot === undefined} onClick={() => void loadFromSlot("quick-1")}>快速读取</button>
            </div>
            <button
              className="player-save__toggle"
              type="button"
              aria-expanded={savePanelOpen}
              aria-controls="player-save-panel"
              onClick={() => {
                setPendingOverwriteSlotId(null);
                setSavePanelOpen((open) => !open);
              }}
            >存读档</button>
            {savePanelOpen && (
              <div id="player-save-panel" className="player-save__panel" aria-label="存读档槽位">
                <header><strong>{saveView === "manual" ? "手动存档" : saveView === "auto" ? "自动存档" : saveView === "quick" ? "快速存档" : "剧情检查点"}</strong><span data-save-message>{saveMessage}</span></header>
                <nav className="player-save__views" aria-label="存档类型">
                  <button type="button" aria-pressed={saveView === "manual"} onClick={() => setSaveView("manual")}>手动</button>
                  <button type="button" aria-pressed={saveView === "auto"} onClick={() => setSaveView("auto")}>自动</button>
                  <button type="button" aria-pressed={saveView === "quick"} onClick={() => setSaveView("quick")}>快速</button>
                  <button type="button" aria-pressed={saveView === "checkpoint"} onClick={() => setSaveView("checkpoint")}>检查点</button>
                </nav>
                {saveView === "manual" && Array.from({ length: 6 }, (_, index) => savePage * 6 + index + 1).map((slotNumber) => {
                  const slotId = `manual-${slotNumber}`;
                  const slot = saveSlots.find((candidate) => candidate.slotId === slotId);
                  return <section className="player-save__slot" key={slotId}>
                    <PlayerSavePreview projectId={project.manifest.projectId} slot={slot} store={saveStore} />
                    <div><strong>槽位 {slotNumber}</strong><span>{slot === undefined ? "空槽位" : `${slot.chapterTitle === null ? "未归属章节" : slot.chapterTitle} / ${slot.sceneTitle} · ${new Date(slot.savedAtEpochMilliseconds).toISOString().slice(0, 16).replace("T", " ")} UTC · ${slot.preview.status === "available" ? "有截图" : "无预览"}`}</span></div>
                    <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || snapshot.history === null} onClick={() => requestSaveToSlot(slotId, slot !== undefined)}>{pendingOverwriteSlotId === slotId ? "确认覆盖" : "保存"}</button>
                    <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || slot === undefined} onClick={() => void loadFromSlot(slotId)}>读取</button>
                  </section>;
                })}
                {saveView === "manual" && <nav className="player-save__pages" aria-label="手动存档分页">
                  <button type="button" disabled={savePage === 0 || saveOperation === "busy"} onClick={() => { setSavePage(0); setPendingOverwriteSlotId(null); }}>上一页</button>
                  <span>第 {savePage + 1} / 2 页</span>
                  <button type="button" disabled={savePage === 1 || saveOperation === "busy"} onClick={() => { setSavePage(1); setPendingOverwriteSlotId(null); }}>下一页</button>
                </nav>}
                {saveView === "auto" && Array.from({ length: 5 }, (_, index) => index + 1).map((slotNumber) => {
                  const slotId = `auto-${slotNumber}`;
                  const slot = saveSlots.find((candidate) => candidate.slotId === slotId);
                  return <section className="player-save__slot" key={slotId}>
                    <PlayerSavePreview projectId={project.manifest.projectId} slot={slot} store={saveStore} />
                    <div><strong>自动 {slotNumber}</strong><span>{slot === undefined ? "空槽位" : `${slot.chapterTitle ?? "未归属章节"} / ${slot.sceneTitle} · ${new Date(slot.savedAtEpochMilliseconds).toISOString().slice(0, 16).replace("T", " ")} UTC`}</span></div>
                    <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || slot === undefined} onClick={() => void loadFromSlot(slotId)}>读取</button>
                  </section>;
                })}
                {saveView === "quick" && <section className="player-save__slot">
                  <PlayerSavePreview projectId={project.manifest.projectId} slot={quickSlot} store={saveStore} />
                  <div><strong>快速槽位</strong><span>{quickSlot === undefined ? "空槽位" : `${quickSlot.chapterTitle ?? "未归属章节"} / ${quickSlot.sceneTitle} · ${new Date(quickSlot.savedAtEpochMilliseconds).toISOString().slice(0, 16).replace("T", " ")} UTC`}</span></div>
                  <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || !saveBoundaryAllowed} onClick={() => void saveToSlot("quick", "quick-1")}>保存</button>
                  <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || quickSlot === undefined} onClick={() => void loadFromSlot("quick-1")}>读取</button>
                </section>}
                {saveView === "checkpoint" && Array.from({ length: 3 }, (_, index) => index + 1).map((slotNumber) => {
                  const slotId = `checkpoint-${slotNumber}`;
                  const slot = saveSlots.find((candidate) => candidate.slotId === slotId);
                  return <section className="player-save__slot" key={slotId}>
                    <PlayerSavePreview projectId={project.manifest.projectId} slot={slot} store={saveStore} />
                    <div><strong>检查点 {slotNumber}</strong><span>{slot === undefined ? "空槽位" : `${slot.sceneTitle} · ${slot.checkpointStepId} · ${new Date(slot.savedAtEpochMilliseconds).toISOString().slice(0, 16).replace("T", " ")} UTC`}</span></div>
                    <button type="button" disabled={hostActivity !== "active" || saveOperation === "busy" || slot === undefined} onClick={() => void loadFromSlot(slotId)}>读取</button>
                  </section>;
                })}
              </div>
            )}
          </aside>
        )}
        {recoveryStore !== undefined && (recoveryCandidate !== null || recoveryOperation === "error") && (
          <aside className="player-recovery" role={recoveryOperation === "error" ? "alert" : "status"} aria-live="polite">
            <div>
              <strong>{recoveryOperation === "error" ? "恢复保护需要处理" : "发现可恢复进度"}</strong>
              <span>{recoveryMessage}</span>
              {recoveryCandidate !== null && <small>{recoveryCandidate.sceneId} · {new Date(recoveryCandidate.savedAtEpochMilliseconds).toISOString().slice(0, 16).replace("T", " ")} UTC</small>}
            </div>
            {recoveryCandidate !== null && <button type="button" disabled={hostActivity !== "active" || recoveryCandidate.buildId !== state.artifacts?.manifest.buildId} onClick={() => void restoreRecovery()}>恢复上次进度</button>}
            <button type="button" onClick={() => {
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
            <p className="player-eyebrow">A WORLd STUDIO STORY</p>
            <h1>{snapshot.title}</h1>
            <p>同一个故事核心，面向每一块屏幕。</p>
            <button className="player-primary" type="button" onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => applyIntent({ kind: "primary" }, pointerInput.current)}>
              开始故事
              <span aria-hidden="true">→</span>
            </button>
            {settingsApplication.ui.showInputHints && <span className="player-hint">Enter / Space</span>}
          </div>
        )}

        {(content.kind === "dialogue" || content.kind === "narration") && (
          <button
            className={`player-dialogue player-dialogue--${stage.textboxTemplate}`}
            type="button"
            data-text-ready={textReady}
            data-text-reveal-duration={textRevealDuration}
            onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }}
            onClick={() => applyIntent({ kind: "primary" }, pointerInput.current)}
            aria-label="继续下一句"
          >
            {content.kind === "dialogue" && <strong>{speakerNames[content.speakerId] ?? content.speakerId}</strong>}
            <span key={`${presentedText}:${textRevealDuration}`} aria-live="polite" style={{ "--gal-text-reveal-duration": `${textRevealDuration}ms` } as React.CSSProperties}>{content.text}</span>
            <i aria-hidden="true">⌄</i>
          </button>
        )}

        {content.kind === "choice" && (
          <div className="player-choice" data-choice-layout={settingsApplication.choice.layout} role="group" aria-labelledby="player-choice-prompt">
            <p id="player-choice-prompt">{content.prompt}</p>
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
                {settingsApplication.choice.showOptionNumbers && <span data-choice-number aria-hidden="true">{index + 1}</span>}{option.label}
              </button>
            ))}
          </div>
        )}

        {content.kind === "ending" && (
          <div className="player-ending" role="status">
            <span>ENDING</span>
            <h2>{content.name}</h2>
            <button className="player-secondary" type="button" onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => applyIntent({ kind: "restart" }, pointerInput.current)}>回到标题</button>
          </div>
        )}

        {content.kind === "error" && (
          <div className="player-error" role="alert">
            <span>无法安全启动</span>
            <h1>{snapshot.title}</h1>
            <p>{content.diagnostics[0]?.message ?? "未知 Player Core 错误"}</p>
            <code>{content.diagnostics[0]?.code ?? "PLAYER_UNKNOWN_ERROR"}</code>
            <button className="player-secondary" type="button" onPointerDown={(event) => { pointerInput.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={() => applyIntent({ kind: "restart" }, pointerInput.current)}>重新载入工程</button>
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

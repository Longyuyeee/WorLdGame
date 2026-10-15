import {
  PROJECT_COMPILER_VERSION,
  compileProject,
  compilerBuildIdForSource,
  type CompilerArtifactsV1,
  type CompilerDiagnostic
} from "@world-studio/project-compiler";
import { semanticHash, readWebSaveCompatibility, webProjectAtPublicationVersion, type CanonicalProject, type JsonObject, type JsonValue } from "@world-studio/project-domain";
import {
  RUNTIME_VERSION,
  compactRuntimeHistoryV1,
  advanceRuntimeHistoryV1,
  backRuntimeHistoryV1,
  createRuntimeHistorySessionV1,
  createRuntimeSchedulerSessionV1,
  createRuntimeSessionSaveV1,
  createRuntimeState,
  forwardRuntimeHistoryV1,
  loadRuntimeSessionSaveV1,
  mergeRuntimeMetaProgressV1,
  mergeRuntimeHistoryMetaProgressV1,
  validateRuntimeMetaProgressV1,
  runtimeStateHashV1,
  traceRuntimeSceneEntriesV1,
  scheduleRuntimeBatchV1,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeHistoryReconciliationPlanV1,
  type RuntimeHistorySessionV1,
  type RuntimeInputV1,
  type RuntimeSchedulePolicyV1,
  type RuntimeScheduleStopReasonV1,
  type RuntimeSchedulerSessionV1,
  type RuntimeScalar,
  type RuntimeStateV1
} from "@world-studio/runtime";
import {
  RUNTIME_PRESENTATION_HOST_VERSION,
  consumeRuntimePresentationEffectsV1,
  createRuntimePresentationHostSnapshotV1,
  createRuntimePresentationHostStateV1,
  rehydrateRuntimePresentationHostV1,
  reconcileRuntimePresentationHostV1,
  settleRuntimePresentationEffectV1,
  type RuntimePresentationHostStateV1
} from "@world-studio/runtime-host";
import { createPlayerReplayEntryV1, loadPlayerReplayEntryV1, type PlayerReplayEntryV1 } from './player-replay-entry';

export const PLAYER_CORE_VERSION = "0.5.0" as const;
const MAX_PLAYER_DRIVE_STEPS = 10_000;

export type PlayerCoreStatus =
  | "title"
  | "presenting"
  | "waiting-choice"
  | "waiting-effect"
  | "waiting-barrier"
  | "ended"
  | "error";

export interface PlayerCoreDiagnostic {
  readonly origin: "compiler" | "runtime" | "player";
  readonly code: string;
  readonly message: string;
  readonly sceneId: string | null;
  readonly statementId: string | null;
  readonly instructionId: string | null;
}

export interface PlayerCoreState {
  readonly status: PlayerCoreStatus;
  readonly projectId: string;
  readonly title: string;
  readonly artifacts: CompilerArtifactsV1 | null;
  readonly compatibleSaveBuildIds: readonly string[];
  readonly runtimeState: RuntimeStateV1 | null;
  readonly retainedMetaProgress: RuntimeStateV1["metaProgress"] | null;
  readonly historySession: RuntimeHistorySessionV1 | null;
  readonly historyPolicy: PlayerCoreHistoryPolicyV1;
  readonly localization: PlayerCoreLocalizationStateV1;
  readonly schedulerSession: RuntimeSchedulerSessionV1 | null;
  readonly playback: PlayerCorePlaybackSnapshotV1;
  readonly hostState: RuntimePresentationHostStateV1;
  readonly currentEvent: RuntimeEventV1 | null;
  readonly checkpointSaveCandidates: readonly PlayerCheckpointSaveCandidateV1[];
  readonly diagnostics: readonly PlayerCoreDiagnostic[];
  readonly replaySession: PlayerCoreReplaySessionV1 | null;
  readonly replayError: string | null;
  readonly replayEntries: readonly PlayerReplayEntryV1[];
}

export interface PlayerCoreReplaySessionV1 {
  readonly replayId: string;
  readonly title: string;
  readonly sceneId: string;
  readonly checkpoint: PlayerCoreState;
}

export interface PlayerCoreLocalizationStateV1 {
  readonly sourceLocale: string;
  readonly selectedLocale: string;
}

export interface PlayerCorePlaybackSnapshotV1 {
  readonly schemaVersion: 1;
  readonly mode: RuntimeSchedulePolicyV1["mode"];
  readonly skipActivation: RuntimeSchedulePolicyV1["skipActivation"];
  readonly speed: RuntimeSchedulePolicyV1["speed"];
  readonly stopReason: RuntimeScheduleStopReasonV1 | null;
  readonly executedInstructions: number;
  readonly accumulatedInstructions: number;
  readonly autoAdvanceDelayMilliseconds: number | null;
}

export type PlayerCorePlaybackPolicyV1 = RuntimeSchedulePolicyV1;

export interface PlayerCoreHistoryPolicyV1 {
  readonly allowForwardAfterBack: boolean;
}

export type PlayerHistoryVisibleEventV1 = Exclude<RuntimeEventV1,
  { readonly kind: "direction" } | { readonly kind: "checkpoint-reached" }>;

export interface PlayerHistoryEntrySnapshotV1 {
  readonly entryId: string;
  readonly historyIndex: number;
  readonly position: "past" | "current" | "future";
  readonly canNavigateBack: boolean;
  readonly event: PlayerHistoryVisibleEventV1;
}

export interface PlayerHistoryArchiveSnapshotV1 {
  readonly archiveId: string;
  readonly branchPointHistoryIndex: number;
  readonly entries: readonly {
    readonly entryId: string;
    readonly historyIndex: number;
    readonly event: PlayerHistoryVisibleEventV1;
  }[];
}

export interface PlayerHistoryBarrierSnapshotV1 {
  readonly descriptorId: string;
  readonly reason: string;
  readonly distance: number;
}

export interface PlayerCheckpointSaveCandidateV1 {
  readonly buildId: string;
  readonly stepId: string;
  readonly sceneId: string;
  readonly serializedSessionSave: string;
  readonly artifactHash: string;
  readonly runtimeStateHash: string;
}

export interface PlayerCoreSnapshotV1 {
  readonly schemaVersion: 1;
  readonly playerCoreVersion: typeof PLAYER_CORE_VERSION;
  readonly identities: {
    readonly compilerVersion: typeof PROJECT_COMPILER_VERSION;
    readonly runtimeVersion: typeof RUNTIME_VERSION;
    readonly runtimeHostVersion: typeof RUNTIME_PRESENTATION_HOST_VERSION;
    readonly projectId: string;
    readonly buildId: string | null;
  };
  readonly title: string;
  readonly status: PlayerCoreStatus;
  readonly localization: {
    readonly sourceLocale: string;
    readonly selectedLocale: string;
    readonly availableLocales: readonly string[];
    readonly missingTranslationCount: number;
    readonly fallbackUsed: boolean;
  };
  readonly additionalContent: PlayerAdditionalContentSnapshotV1;
  readonly sceneReplay: {
    readonly active: boolean;
    readonly replayId: string | null;
    readonly title: string | null;
    readonly error: string | null;
  };
  readonly effects: {
    readonly active: readonly PlayerCoreEffectSnapshotV1[];
    readonly pending: PlayerCoreEffectSnapshotV1 | null;
    readonly operations: readonly PlayerCoreEffectOperationSnapshotV1[];
  };
  readonly history: {
    readonly cursor: number;
    readonly length: number;
    readonly canBack: boolean;
    readonly canForward: boolean;
    readonly hasForward: boolean;
    readonly forwardPolicy: {
      readonly allowForwardAfterBack: boolean;
      readonly blocked: boolean;
    };
    readonly backwardBarrier: PlayerHistoryBarrierSnapshotV1 | null;
    readonly activeEntries: readonly PlayerHistoryEntrySnapshotV1[];
    readonly archives: readonly PlayerHistoryArchiveSnapshotV1[];
  } | null;
  readonly playback: PlayerCorePlaybackSnapshotV1;
  readonly presentation:
    | { readonly kind: "title" }
    | { readonly kind: "dialogue"; readonly speakerId: string; readonly textId: string; readonly text: string }
    | { readonly kind: "narration"; readonly textId: string; readonly text: string }
    | { readonly kind: "choice"; readonly prompt: string; readonly options: readonly { readonly optionId: string; readonly label: string }[] }
    | { readonly kind: "wait"; readonly durationMilliseconds: number }
    | { readonly kind: "effect"; readonly descriptorId: string; readonly canCancel: boolean }
    | { readonly kind: "barrier"; readonly descriptorId: string; readonly reason: string }
    | { readonly kind: "ending"; readonly endingId: string; readonly name: string }
    | { readonly kind: "error"; readonly diagnostics: readonly PlayerCoreDiagnostic[] };
  readonly runtimeStateHash: string | null;
  readonly runtimeHostSnapshotHash: string;
}

export interface PlayerAdditionalContentCategorySnapshotV1 {
  readonly total: number;
  readonly unlocked: number;
  readonly locked: number;
}

export interface PlayerAdditionalContentSnapshotV1 {
  readonly schemaVersion: 1;
  readonly gallery: PlayerAdditionalContentCategorySnapshotV1;
  readonly replay: PlayerAdditionalContentCategorySnapshotV1;
  readonly music: PlayerAdditionalContentCategorySnapshotV1;
  readonly endings: PlayerAdditionalContentCategorySnapshotV1;
  readonly galleryItems: readonly {
    readonly assetId: string;
    readonly displayName: string | null;
    readonly coverAssetId: string | null;
    readonly kind: string;
    readonly unlocked: boolean;
  }[];
  readonly musicItems: readonly {
    readonly assetId: string;
    readonly displayName: string | null;
    readonly coverAssetId: string | null;
    readonly unlocked: boolean;
  }[];
  readonly replayItems: readonly {
    readonly replayId: string;
    readonly title: string | null;
    readonly sceneId: string;
    readonly coverAssetId: string | null;
    readonly unlocked: boolean;
  }[];
  readonly endingItems: readonly {
    readonly endingId: string;
    readonly name: string | null;
    readonly sceneId: string;
    readonly coverAssetId: string | null;
    readonly unlocked: boolean;
  }[];
}

export interface PlayerCoreEffectSnapshotV1 {
  readonly effectId: string;
  readonly descriptorId: string;
  readonly channel: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, RuntimeScalar>>;
  readonly policy: "pure" | "reversible" | "barrier";
  readonly awaitMode: "detached" | "awaited";
}

export interface PlayerCoreEffectOperationSnapshotV1 {
  readonly sequence: number;
  readonly kind: "execute" | "complete" | "cancel" | "compensate" | "replay" | "rehydrate";
  readonly effectId: string;
  readonly descriptorId: string;
  readonly channel: string;
}

export type PlayerCoreIntentV1 =
  | { readonly kind: "primary" }
  | { readonly kind: "select-choice"; readonly optionId: string }
  | { readonly kind: "cancel" }
  | { readonly kind: "back" }
  | { readonly kind: "forward" }
  | { readonly kind: "history-back-to"; readonly entryId: string }
  | { readonly kind: "enter-scene-replay"; readonly replayId: string }
  | { readonly kind: "exit-scene-replay" }
  | { readonly kind: "restart" };

function idlePlayback(): PlayerCorePlaybackSnapshotV1 {
  return { schemaVersion: 1, mode: "normal", skipActivation: null, speed: "normal", stopReason: null, executedInstructions: 0, accumulatedInstructions: 0, autoAdvanceDelayMilliseconds: null };
}

function resetPlayback(state: PlayerCoreState): PlayerCoreState {
  return { ...state, schedulerSession: null, playback: idlePlayback() };
}

function effectSnapshot(effect: import("@world-studio/runtime").RuntimeEffectIntentV1): PlayerCoreEffectSnapshotV1 {
  return {
    effectId: effect.effectId,
    descriptorId: effect.descriptorId,
    channel: effect.channel,
    kind: effect.kind,
    payload: effect.payload,
    policy: effect.policy,
    awaitMode: effect.awaitMode
  };
}

function scalar(value: JsonValue | undefined): RuntimeScalar | undefined {
  return value === null || typeof value === "boolean" || typeof value === "string" ||
    (typeof value === "number" && Number.isSafeInteger(value)) ? value : undefined;
}

function initialVariables(project: CanonicalProject): Readonly<Record<string, RuntimeScalar>> {
  return Object.fromEntries(project.variables.variables.flatMap((variable) => {
    const id = typeof variable.id === "string" ? variable.id : undefined;
    const value = scalar(variable.defaultValue ?? variable.initialValue ?? variable.value);
    return id === undefined || value === undefined ? [] : [[id, value] as const];
  }));
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function availablePlayerLocales(state: PlayerCoreState): readonly string[] {
  const targets = state.artifacts?.catalogs.localization.flatMap((record) => {
    const locale = stringValue(record.locale);
    return stringValue(record.sourceLocale) === state.localization.sourceLocale && locale !== undefined ? [locale] : [];
  }) ?? [];
  return [state.localization.sourceLocale, ...targets].filter((locale, index, values) => values.indexOf(locale) === index);
}

function localeEntries(state: PlayerCoreState): ReadonlyMap<string, JsonObject> {
  if (state.localization.selectedLocale === state.localization.sourceLocale) return new Map();
  const record = state.artifacts?.catalogs.localization.find((candidate) =>
    stringValue(candidate.locale) === state.localization.selectedLocale && stringValue(candidate.sourceLocale) === state.localization.sourceLocale
  );
  const entries = Array.isArray(record?.entries) ? record.entries : [];
  return new Map(entries.flatMap((value) => {
    const entry = objectValue(value);
    const key = stringValue(entry?.key);
    return entry === undefined || key === undefined ? [] : [[key, entry] as const];
  }));
}

function translatedPlayerText(state: PlayerCoreState, entries: ReadonlyMap<string, JsonObject>, key: string, sourceText: string): { readonly text: string; readonly fallback: boolean } {
  if (state.localization.selectedLocale === state.localization.sourceLocale) return { text: sourceText, fallback: false };
  const entry = entries.get(key);
  const translation = stringValue(entry?.translation);
  const status = stringValue(entry?.status);
  const valid = translation !== undefined && translation.trim() !== "" && stringValue(entry?.sourceText) === sourceText && (status === "draft" || status === "reviewed" || status === "locked");
  return valid ? { text: translation, fallback: false } : { text: sourceText, fallback: true };
}

function playerSourceTexts(state: PlayerCoreState): readonly { readonly key: string; readonly text: string }[] {
  const story = state.artifacts?.story.scenes.flatMap((scene) => scene.instructions.flatMap((instruction) => {
    const operands = instruction.operands;
    if (instruction.opcode === "dialogue" || instruction.opcode === "narration") {
      const key = stringValue(operands.textId); const text = stringValue(operands.text);
      return key === undefined || text === undefined ? [] : [{ key, text }];
    }
    if (instruction.opcode === "choice") {
      const prompt = stringValue(operands.prompt);
      const options = Array.isArray(operands.options) ? operands.options.flatMap((value) => {
        const option = objectValue(value); const key = stringValue(option?.optionId); const text = stringValue(option?.label);
        return key === undefined || text === undefined ? [] : [{ key, text }];
      }) : [];
      return [...(prompt === undefined ? [] : [{ key: instruction.instructionId, text: prompt }]), ...options];
    }
    if (instruction.opcode === "end") {
      const key = stringValue(operands.endingId); const text = stringValue(operands.name);
      return key === undefined || text === undefined ? [] : [{ key, text }];
    }
    return [];
  })) ?? [];
  const catalogs = state.artifacts?.catalogs;
  const catalog = [
    ...(catalogs?.gallery.map((entry) => ({ key: entry.assetId, text: entry.displayName })) ?? []),
    ...(catalogs?.music.map((entry) => ({ key: entry.assetId, text: entry.displayName })) ?? []),
    ...(catalogs?.replay.map((entry) => ({ key: entry.replayId, text: entry.title })) ?? []),
    ...(catalogs?.endings.map((entry) => ({ key: entry.endingId, text: entry.name })) ?? [])
  ];
  return [...new Map([...story, ...catalog].map((entry) => [entry.key, entry])).values()];
}

function compilerDiagnostic(item: CompilerDiagnostic): PlayerCoreDiagnostic {
  return {
    origin: "compiler",
    code: item.code,
    message: item.message,
    sceneId: item.sceneId ?? null,
    statementId: item.statementId ?? null,
    instructionId: null
  };
}

function runtimeDiagnostic(item: RuntimeDiagnosticV1): PlayerCoreDiagnostic {
  return {
    origin: "runtime",
    code: item.code,
    message: item.message,
    sceneId: item.sceneId,
    statementId: null,
    instructionId: item.instructionId
  };
}

function playerError(state: PlayerCoreState, code: string, message: string): PlayerCoreState {
  return {
    ...state,
    status: "error",
    currentEvent: null,
    diagnostics: [...state.diagnostics, { origin: "player", code, message, sceneId: state.runtimeState?.cursor.sceneId ?? null, statementId: null, instructionId: null }]
  };
}

export function createPlayerCore(project: CanonicalProject, historyPolicy: PlayerCoreHistoryPolicyV1 = { allowForwardAfterBack: true }): PlayerCoreState {
  const hostState = createRuntimePresentationHostStateV1();
  const compiled = compileProject(project, "release");
  if (!compiled.ok) {
    return {
      status: "error",
      projectId: project.manifest.projectId,
      title: project.manifest.title,
      artifacts: null,
      compatibleSaveBuildIds: [],
      runtimeState: null,
      retainedMetaProgress: null,
      replayEntries: [],
      historySession: null,
      historyPolicy,
      localization: { sourceLocale: project.manifest.defaultLocale, selectedLocale: project.manifest.defaultLocale },
      schedulerSession: null,
      playback: idlePlayback(),
      hostState,
      currentEvent: null,
      checkpointSaveCandidates: [],
      diagnostics: compiled.diagnostics.map(compilerDiagnostic),
      replaySession: null,
      replayError: null
    };
  }
  return {
    status: "title",
    projectId: project.manifest.projectId,
    title: project.manifest.title,
    artifacts: compiled.artifacts,
    compatibleSaveBuildIds: (() => {
      const receipt = readWebSaveCompatibility(project);
      return receipt.status !== "verified" ? [] : receipt.versions.map(version => compilerBuildIdForSource(
        project.manifest.projectId, semanticHash(webProjectAtPublicationVersion(project, version)), compiled.artifacts.manifest.artifacts, "release"));
    })(),
    runtimeState: null,
    retainedMetaProgress: null,
    replayEntries: [],
    historySession: null,
    historyPolicy,
    localization: { sourceLocale: project.manifest.defaultLocale, selectedLocale: project.manifest.defaultLocale },
    schedulerSession: null,
    playback: idlePlayback(),
    hostState,
    currentEvent: null,
    checkpointSaveCandidates: [],
    diagnostics: compiled.diagnostics.map(compilerDiagnostic),
    replaySession: null,
    replayError: null
  };
}

function drivePlayerCore(base: PlayerCoreState, initialHistory: RuntimeHistorySessionV1, input?: RuntimeInputV1): PlayerCoreState {
  const artifacts = base.artifacts;
  if (artifacts === null) return playerError(base, "PLAYER_BUILD_MISSING", "Player Core has no verified Compiler artifacts");
  let historySession = initialHistory;
  let runtimeState = historySession.checkpoints[historySession.cursor]!.state;
  let hostState = base.hostState;
  let replayEntries = base.replayEntries;
  const checkpointSaveCandidates: PlayerCheckpointSaveCandidateV1[] = [];
  let nextInput = input;
  for (let step = 0; step < MAX_PLAYER_DRIVE_STEPS; step += 1) {
    const beforeCursor = historySession.cursor;
    const result = advanceRuntimeHistoryV1(artifacts.story, historySession, nextInput === undefined ? {} : { input: nextInput });
    replayEntries = captureReplayEntries({ ...base, replayEntries }, result.session, beforeCursor, hostState);
    nextInput = undefined;
    historySession = result.session;
    runtimeState = result.state;
    hostState = consumeRuntimePresentationEffectsV1(hostState, result.effects);
    if (result.event?.kind === "checkpoint-reached") {
      const created = createRuntimeSessionSaveV1(artifacts.story, historySession);
      if (!created.ok) return { ...base, runtimeState, historySession, hostState, currentEvent: null, checkpointSaveCandidates, status: "error", diagnostics: [...base.diagnostics, ...created.diagnostics.map(runtimeDiagnostic)] };
      checkpointSaveCandidates.push({ buildId: runtimeState.buildId, stepId: result.event.stepId, sceneId: runtimeState.cursor.sceneId, serializedSessionSave: created.serialized, artifactHash: created.artifactHash, runtimeStateHash: runtimeStateHashV1(runtimeState) });
    }
    const current = { ...base, runtimeState, historySession, hostState, replayEntries, currentEvent: result.event, checkpointSaveCandidates };
    if (result.diagnostics.length > 0) {
      return { ...current, status: "error", currentEvent: null, diagnostics: [...base.diagnostics, ...result.diagnostics.map(runtimeDiagnostic)] };
    }
    if (runtimeState.pendingEffect !== null) return { ...current, status: "waiting-effect" };
    if (runtimeState.pendingBarrier !== null) return { ...current, status: "waiting-barrier" };
    if (result.event?.kind === "choice") return { ...current, status: "waiting-choice" };
    if (result.event?.kind === "ending" || runtimeState.terminal.kind === "ended") return { ...current, status: "ended" };
    if (result.event !== null && result.event.kind !== "direction" && result.event.kind !== "checkpoint-reached") return { ...current, status: "presenting" };
  }
  return playerError({ ...base, runtimeState, historySession, hostState }, "PLAYER_DRIVE_LIMIT", `Player Core exceeded ${MAX_PLAYER_DRIVE_STEPS} internal steps without a presentation boundary`);
}

export type CreatePlayerCoreSessionSaveResultV1 =
  | { readonly ok: true; readonly serialized: string; readonly artifactHash: string }
  | { readonly ok: false; readonly diagnostics: readonly PlayerCoreDiagnostic[] };

export type LoadPlayerCoreSessionSaveResultV1 =
  | { readonly ok: true; readonly state: PlayerCoreState; readonly artifactHash: string; readonly savedBuildId: string; readonly compatibility: "current" | "verified-previous"; readonly savedRuntimeStateHash: string; readonly savedSceneId: string }
  | { readonly ok: false; readonly diagnostics: readonly PlayerCoreDiagnostic[] };

export function startPlayerCore(state: PlayerCoreState, project: CanonicalProject): PlayerCoreState {
  if (state.status !== "title" || state.artifacts === null) return state;
  if (project.manifest.projectId !== state.projectId) return playerError(state, "PLAYER_PROJECT_MISMATCH", "Player Core project identity changed before Start");
  const created = createRuntimeState(state.artifacts.story, {
    buildId: state.artifacts.manifest.buildId,
    executionId: `player.${state.artifacts.manifest.buildId.slice(0, 24)}`,
    progressScopeId: "player",
    initialVariables: initialVariables(project)
  });
  if (!created.ok) return { ...state, status: "error", diagnostics: [...state.diagnostics, ...created.diagnostics.map(runtimeDiagnostic)] };
  const progress = playerCoreMetaProgressV1(state);
  const merged = progress === null ? null : mergeRuntimeMetaProgressV1(created.state.metaProgress, progress);
  const history = createRuntimeHistorySessionV1(state.artifacts.story, merged?.ok ? { ...created.state, metaProgress: merged.progress } : created.state);
  if (history.diagnostics.length > 0) return { ...state, status: "error", diagnostics: [...state.diagnostics, ...history.diagnostics.map(runtimeDiagnostic)] };
  return drivePlayerCore(resetPlayback(state), history.session);
}

export function advancePlayerCore(state: PlayerCoreState): PlayerCoreState {
  return state.status === "presenting" && state.historySession !== null
    ? drivePlayerCore(resetPlayback(state), state.historySession)
    : state;
}

export function selectPlayerCoreChoice(state: PlayerCoreState, optionId: string): PlayerCoreState {
  const pending = state.runtimeState?.pendingChoice ?? null;
  if (state.status !== "waiting-choice" || state.runtimeState === null || pending === null) return state;
  if (!pending.options.some((option) => option.optionId === optionId)) return playerError(state, "PLAYER_CHOICE_MISSING", `Choice option does not exist: ${optionId}`);
  const input: RuntimeInputV1 = {
    schemaVersion: 1,
    kind: "choiceSelected",
    inputId: `player.input.${state.runtimeState.nextInputSequence}.choice.${optionId}`,
    executionId: state.runtimeState.executionId,
    expectedStateRevision: state.runtimeState.stateRevision,
    logicalSequence: pending.logicalSequence,
    requestId: pending.requestId,
    instructionId: pending.instructionId,
    optionId
  };
  if (state.historySession === null) return playerError(state, "PLAYER_HISTORY_MISSING", "Player Core has no Runtime History Session");
  return drivePlayerCore(resetPlayback(state), state.historySession, input);
}

export function settlePlayerCoreEffect(state: PlayerCoreState, outcome: "complete" | "cancel"): PlayerCoreState {
  const pending = state.runtimeState?.pendingEffect ?? null;
  if (state.status !== "waiting-effect" || state.runtimeState === null || pending === null) return state;
  const input: RuntimeInputV1 = outcome === "complete" ? {
    schemaVersion: 1,
    kind: "effectCompleted",
    inputId: `player.input.${state.runtimeState.nextInputSequence}.complete`,
    executionId: state.runtimeState.executionId,
    expectedStateRevision: state.runtimeState.stateRevision,
    logicalSequence: pending.logicalSequence,
    effectId: pending.effectId,
    replayKey: pending.replayKey
  } : {
    schemaVersion: 1,
    kind: "effectCancelled",
    inputId: `player.input.${state.runtimeState.nextInputSequence}.cancel`,
    executionId: state.runtimeState.executionId,
    expectedStateRevision: state.runtimeState.stateRevision,
    logicalSequence: pending.logicalSequence,
    effectId: pending.effectId,
    cancellationScope: pending.cancellationScope
  };
  const hostState = settleRuntimePresentationEffectV1(state.hostState, pending, outcome);
  if (state.historySession === null) return playerError(state, "PLAYER_HISTORY_MISSING", "Player Core has no Runtime History Session");
  return drivePlayerCore(resetPlayback({ ...state, hostState }), state.historySession, input);
}

export function approvePlayerCoreBarrier(state: PlayerCoreState): PlayerCoreState {
  const pending = state.runtimeState?.pendingBarrier ?? null;
  if (state.status !== "waiting-barrier" || state.runtimeState === null || pending === null) return state;
  const input: RuntimeInputV1 = {
    schemaVersion: 1,
    kind: "barrierApproved",
    inputId: `player.input.${state.runtimeState.nextInputSequence}.approve`,
    executionId: state.runtimeState.executionId,
    expectedStateRevision: state.runtimeState.stateRevision,
    logicalSequence: pending.logicalSequence,
    requestId: pending.requestId,
    descriptorId: pending.descriptorId
  };
  if (state.historySession === null) return playerError(state, "PLAYER_HISTORY_MISSING", "Player Core has no Runtime History Session");
  return drivePlayerCore(resetPlayback(state), state.historySession, input);
}

/** Call only after the host has successfully protected this exact state. */
export function compactPlayerCoreHistoryV1(state: PlayerCoreState, retainedBackSteps = 64): PlayerCoreState {
  if (state.artifacts === null || state.historySession === null || state.replaySession !== null || !["presenting", "waiting-choice", "ended"].includes(state.status)) return state;
  const compacted = compactRuntimeHistoryV1(state.artifacts.story, state.historySession, retainedBackSteps);
  if (compacted.diagnostics.length > 0 || compacted.session === state.historySession) return state;
  return resetPlayback({ ...state, historySession: compacted.session });
}

export function configurePlayerCoreHistoryPolicyV1(state: PlayerCoreState, historyPolicy: PlayerCoreHistoryPolicyV1): PlayerCoreState {
  return state.historyPolicy.allowForwardAfterBack === historyPolicy.allowForwardAfterBack
    ? state
    : { ...state, historyPolicy };
}

export function configurePlayerCoreLocaleV1(state: PlayerCoreState, locale: string): PlayerCoreState {
  return locale === state.localization.selectedLocale || !availablePlayerLocales(state).includes(locale)
    ? state
    : { ...state, localization: { ...state.localization, selectedLocale: locale } };
}

function playbackSnapshot(policy: RuntimeSchedulePolicyV1, stopReason: RuntimeScheduleStopReasonV1, executedInstructions: number, session: RuntimeSchedulerSessionV1, autoAdvanceDelayMilliseconds: number | null): PlayerCorePlaybackSnapshotV1 {
  return {
    schemaVersion: 1,
    mode: policy.mode,
    skipActivation: policy.skipActivation,
    speed: policy.speed,
    stopReason,
    executedInstructions,
    accumulatedInstructions: session.accumulatedInstructions,
    autoAdvanceDelayMilliseconds
  };
}

function checkpointCandidateAtCursor(artifacts: CompilerArtifactsV1, history: RuntimeHistorySessionV1, cursor: number): PlayerCheckpointSaveCandidateV1 | null {
  const entry = history.entries[cursor - 1];
  if (entry?.event?.kind !== "checkpoint-reached") return null;
  const exactHistory: RuntimeHistorySessionV1 = {
    ...history,
    cursor,
    entries: history.entries.slice(0, cursor),
    checkpoints: history.checkpoints.slice(0, cursor + 1)
  };
  const created = createRuntimeSessionSaveV1(artifacts.story, exactHistory);
  if (!created.ok) return null;
  const runtimeState = exactHistory.checkpoints[cursor]!.state;
  return {
    buildId: runtimeState.buildId,
    stepId: entry.event.stepId,
    sceneId: runtimeState.cursor.sceneId,
    serializedSessionSave: created.serialized,
    artifactHash: created.artifactHash,
    runtimeStateHash: runtimeStateHashV1(runtimeState)
  };
}

/** Executes one formal playback batch. Runtime remains the sole scheduler authority. */
export function schedulePlayerCorePlaybackV1(state: PlayerCoreState, policy: PlayerCorePlaybackPolicyV1): PlayerCoreState {
  if (state.status !== "presenting" || state.artifacts === null || state.historySession === null || state.runtimeState === null) return state;
  const created = state.schedulerSession !== null && state.schedulerSession.history === state.historySession
    ? { ok: true as const, session: state.schedulerSession }
    : createRuntimeSchedulerSessionV1(state.artifacts.story, state.historySession);
  if (!created.ok) {
    const stopReason: RuntimeScheduleStopReasonV1 = created.diagnostics.some((item) => item.code === "RUNTIME_HISTORY_FORWARD_REQUIRED") ? "history" : "diagnostic";
    return {
      ...state,
      schedulerSession: null,
      playback: {
        schemaVersion: 1,
        mode: policy.mode,
        skipActivation: policy.skipActivation,
        speed: policy.speed,
        stopReason,
        executedInstructions: 0,
        accumulatedInstructions: 0,
        autoAdvanceDelayMilliseconds: null
      },
      ...(stopReason === "diagnostic" ? { status: "error" as const, currentEvent: null, diagnostics: [...state.diagnostics, ...created.diagnostics.map(runtimeDiagnostic)] } : {})
    };
  }

  let scheduler = created.session;
  let current = state;
  let executedInstructions = 0;
  let checkpointSaveCandidates = [...state.checkpointSaveCandidates];
  for (let step = 0; step < MAX_PLAYER_DRIVE_STEPS; step += 1) {
    const beforeCursor = scheduler.history.cursor;
    const result = scheduleRuntimeBatchV1(state.artifacts.story, scheduler, policy);
    const replayEntries = captureReplayEntries(current, result.session.history, beforeCursor, current.hostState);
    scheduler = result.session;
    executedInstructions += result.executedInstructions;
    const hostState = consumeRuntimePresentationEffectsV1(current.hostState, result.effects);
    for (let cursor = beforeCursor + 1; cursor <= scheduler.history.cursor; cursor += 1) {
      const candidate = checkpointCandidateAtCursor(state.artifacts, scheduler.history, cursor);
      if (candidate !== null) checkpointSaveCandidates.push(candidate);
    }
    const visibleEvent = [...result.events].reverse().find((event) => event.kind !== "direction" && event.kind !== "checkpoint-reached") ?? null;
    const event = visibleEvent ?? current.currentEvent;
    const playback = playbackSnapshot(policy, result.stopReason, executedInstructions, scheduler, result.autoAdvanceDelayMilliseconds);
    current = {
      ...current,
      runtimeState: result.state,
      historySession: scheduler.history,
      schedulerSession: scheduler,
      hostState,
      currentEvent: event,
      checkpointSaveCandidates,
      replayEntries,
      playback
    };

    if (result.stopReason === "diagnostic" || result.stopReason === "history") {
      return { ...current, status: "error", currentEvent: null, diagnostics: [...current.diagnostics, ...result.diagnostics.map(runtimeDiagnostic)] };
    }
    if (result.stopReason === "resourceUnavailable" || result.stopReason === "budget") return current;
    if (result.state.pendingEffect !== null) return { ...current, status: "waiting-effect" };
    if (result.state.pendingBarrier !== null) return { ...current, status: "waiting-barrier" };
    if (visibleEvent?.kind === "choice" || result.stopReason === "input") return { ...current, status: "waiting-choice" };
    if (visibleEvent?.kind === "ending" || result.state.terminal.kind === "ended") return { ...current, status: "ended" };
    if (visibleEvent !== null || result.stopReason === "stopPoint" || result.stopReason === "unreadBoundary") return { ...current, status: "presenting" };
    // Normal/Auto may stop on internal Direction or Checkpoint boundaries. They are
    // bridged inside Core so Shell observes the next presentable story boundary.
  }
  return playerError(resetPlayback(current), "PLAYER_SCHEDULER_DRIVE_LIMIT", `Player Core exceeded ${MAX_PLAYER_DRIVE_STEPS} Scheduler boundaries without a presentation`);
}

function eventAtHistoryCursor(history: RuntimeHistorySessionV1): RuntimeEventV1 | null {
  return history.cursor === 0 ? null : history.entries[history.cursor - 1]?.event ?? null;
}

function visibleHistoryEvent(event: RuntimeEventV1 | null): event is PlayerHistoryVisibleEventV1 {
  return event !== null && event.kind !== "direction" && event.kind !== "checkpoint-reached";
}

function checkpointEffects(history: RuntimeHistorySessionV1) {
  const activeByChannel = new Map<string, import("@world-studio/runtime").RuntimeEffectIntentV1>();
  for (const entry of history.entries.slice(0, history.cursor)) {
    for (const effect of entry.effects) activeByChannel.set(effect.channel, effect);
    if (entry.input?.kind === "effectCancelled") {
      for (const [channel, effect] of activeByChannel) {
        if (effect.effectId === entry.input.effectId) activeByChannel.delete(channel);
      }
    }
  }
  return [...activeByChannel.values()];
}

function replayCheckpointIndex(state: PlayerCoreState, sceneId: string): number {
  if (state.historySession === null) return -1;
  for (let index = Math.min(state.historySession.cursor, state.historySession.checkpoints.length - 1); index >= 0; index -= 1) {
    const candidate = state.historySession.checkpoints[index]!.state;
    if (candidate.cursor.sceneId === sceneId && candidate.cursor.instructionIndex === 0 && candidate.terminal.kind === "running" &&
        candidate.pendingChoice === null && candidate.pendingEffect === null && candidate.pendingBarrier === null) return index;
  }
  return -1;
}

/** Re-execute only newly committed formal steps to recover entrances hidden inside jumps/choices. */
function captureReplayEntries(state: PlayerCoreState, history: RuntimeHistorySessionV1, fromCursor: number, initialHost: RuntimePresentationHostStateV1): readonly PlayerReplayEntryV1[] {
  if (state.replaySession !== null || state.artifacts === null || state.artifacts.catalogs.replay.length === 0) return state.replayEntries;
  let entries = state.replayEntries;
  const effects = new Map(Object.values(initialHost.activeByChannel).map(effect => [effect.channel, effect]));
  for (let cursor = fromCursor; cursor < history.cursor; cursor++) {
    const step = history.entries[cursor]!, before = history.checkpoints[cursor]!.state;
    const traced = traceRuntimeSceneEntriesV1(state.artifacts.story, before, { ...(step.input === null ? {} : { input: step.input }), instructionBudget: Math.max(1024, step.executedInstructions) });
    if (traced.diagnostics.length === 0 && runtimeStateHashV1(traced.state) === history.checkpoints[cursor + 1]!.stateHash) {
      if (step.input?.kind === 'effectCancelled') for (const [channel, effect] of effects) if (effect.effectId === step.input.effectId) effects.delete(channel);
      for (const entrance of traced.sceneEntries) {
        const entry = createPlayerReplayEntryV1(state.artifacts, entrance, [...effects.values()]);
        if (entry !== null) entries = [...entries.filter(item => item.sceneId !== entry.sceneId), entry];
      }
    }
    for (const effect of step.effects) effects.set(effect.channel, effect);
  }
  return entries;
}

export function mergePlayerCoreReplayEntriesV1(state: PlayerCoreState, incoming: readonly PlayerReplayEntryV1[]): PlayerCoreState {
  if (state.artifacts === null || state.replaySession !== null) return state;
  let entries = state.replayEntries;
  for (const item of incoming) {
    const loaded = loadPlayerReplayEntryV1(state.artifacts, item, state.compatibleSaveBuildIds);
    if (loaded === null || entries.some(existing => existing.sceneId === item.sceneId)) continue;
    entries = [...entries, loaded.entry];
  }
  return entries === state.replayEntries ? state : { ...state, replayEntries: entries };
}

export function canEnterPlayerCoreReplayV1(state: PlayerCoreState, replayId: string): boolean {
  if (state.replaySession !== null || state.artifacts === null || state.runtimeState?.pendingEffect || state.runtimeState?.pendingBarrier) return false;
  const replay = state.artifacts.catalogs.replay.find(item => item.replayId === replayId);
  return replay !== undefined && replay.endingIds.some(id => playerCoreMetaProgressV1(state)?.reachedEndingIds.includes(id)) && (state.replayEntries.some(entry => entry.sceneId === replay.sceneId) || replayCheckpointIndex(state, replay.sceneId) >= 0);
}

export function enterPlayerCoreReplayV1(state: PlayerCoreState, replayId: string): PlayerCoreState {
  if (state.replaySession !== null || state.artifacts === null || state.runtimeState?.pendingEffect || state.runtimeState?.pendingBarrier) return state;
  const replay = state.artifacts.catalogs.replay.find((item) => item.replayId === replayId);
  if (replay === undefined || !replay.endingIds.some((endingId) => playerCoreMetaProgressV1(state)?.reachedEndingIds.includes(endingId))) {
    return { ...state, replayError: "这个回想尚未解锁。" };
  }
  const checkpointIndex = replayCheckpointIndex(state, replay.sceneId);
  const stored = state.replayEntries.find(entry => entry.sceneId === replay.sceneId);
  const archived = stored ? loadPlayerReplayEntryV1(state.artifacts, stored, state.compatibleSaveBuildIds) : null;
  const checkpoint = checkpointIndex < 0 ? null : state.historySession!.checkpoints[checkpointIndex]!;
  const entrance = archived?.state ?? checkpoint?.state;
  if (!entrance) return { ...state, replayError: "当前记录中找不到可安全开始的场景位置，原剧情未改变。" };
  const created = createRuntimeHistorySessionV1(state.artifacts.story, entrance);
  if (created.diagnostics.length > 0) return { ...state, replayError: "场景回想无法安全启动，原剧情未改变。" };
  const inherited = archived?.entry.inheritedEffects ?? checkpointEffects({ ...state.historySession!, cursor: checkpointIndex });
  const hostState = rehydrateRuntimePresentationHostV1(inherited, created.session.checkpoints[0]!.checkpointId);
  const replayState: PlayerCoreState = {
    ...state,
    status: "presenting",
    runtimeState: entrance,
    historySession: created.session,
    schedulerSession: null,
    playback: idlePlayback(),
    hostState,
    currentEvent: null,
    checkpointSaveCandidates: [],
    replaySession: { replayId: replay.replayId, title: replay.title, sceneId: replay.sceneId, checkpoint: state },
    replayError: null
  };
  return drivePlayerCore(replayState, created.session);
}

export function exitPlayerCoreReplayV1(state: PlayerCoreState): PlayerCoreState {
  return state.replaySession === null ? state : { ...state.replaySession.checkpoint, replayError: null };
}

export function createPlayerCoreSessionSaveV1(state: Pick<PlayerCoreState, "replaySession" | "artifacts" | "historySession" | "runtimeState">): CreatePlayerCoreSessionSaveResultV1 {
  if (state.replaySession !== null) {
    return { ok: false, diagnostics: [{ origin: "player", code: "PLAYER_SAVE_REPLAY_ISOLATED", message: "Scene Replay is isolated from formal saves", sceneId: state.runtimeState?.cursor.sceneId ?? null, statementId: null, instructionId: null }] };
  }
  if (state.artifacts === null || state.historySession === null || state.runtimeState === null) {
    return { ok: false, diagnostics: [{ origin: "player", code: "PLAYER_SAVE_UNAVAILABLE", message: "Player Core has no active Runtime History Session to save", sceneId: null, statementId: null, instructionId: null }] };
  }
  const created = createRuntimeSessionSaveV1(state.artifacts.story, state.historySession);
  return created.ok
    ? { ok: true, serialized: created.serialized, artifactHash: created.artifactHash }
    : { ok: false, diagnostics: created.diagnostics.map(runtimeDiagnostic) };
}

export function loadPlayerCoreSessionSaveV1(state: PlayerCoreState, serialized: string): LoadPlayerCoreSessionSaveResultV1 {
  if (state.replaySession !== null) {
    return { ok: false, diagnostics: [{ origin: "player", code: "PLAYER_LOAD_REPLAY_ISOLATED", message: "Exit Scene Replay before loading a formal save", sceneId: state.runtimeState?.cursor.sceneId ?? null, statementId: null, instructionId: null }] };
  }
  if (state.artifacts === null) {
    return { ok: false, diagnostics: [{ origin: "player", code: "PLAYER_BUILD_MISSING", message: "Player Core has no verified Compiler artifacts", sceneId: null, statementId: null, instructionId: null }] };
  }
  const options = {
    expectedBuildId: state.artifacts.manifest.buildId,
    ...(playerCoreMetaProgressV1(state) === null ? {} : { currentMetaProgress: playerCoreMetaProgressV1(state)! })
  };
  let loaded = loadRuntimeSessionSaveV1(state.artifacts.story, serialized, options);
  if (!loaded.ok && loaded.diagnostics[0]?.code === "RUNTIME_SAVE_BUILD_MISMATCH") {
    // The first strict parse already checked canonical bytes/envelope/project/version.
    const buildId = (JSON.parse(serialized) as { buildId: unknown }).buildId;
    if (typeof buildId === "string" && state.compatibleSaveBuildIds.includes(buildId)) {
      loaded = loadRuntimeSessionSaveV1(state.artifacts.story, serialized, { ...options, expectedBuildId: buildId });
    }
  }
  if (!loaded.ok) return { ok: false, diagnostics: loaded.diagnostics.map(runtimeDiagnostic) };
  const event = eventAtHistoryCursor(loaded.session);
  const status = navigatedStatus(loaded.session, event);
  if (status === "continue" && event?.kind !== "checkpoint-reached") {
    return { ok: false, diagnostics: [{ origin: "player", code: "PLAYER_SAVE_BOUNDARY_INVALID", message: "Player Session Save does not point at a presentable boundary", sceneId: loaded.state.cursor.sceneId, statementId: null, instructionId: null }] };
  }
  const checkpoint = loaded.session.checkpoints[loaded.session.cursor]!;
  const savedCheckpoint = loaded.save.history.checkpoints[loaded.save.cursor]!;
  const hostState = rehydrateRuntimePresentationHostV1(checkpointEffects(loaded.session), checkpoint.checkpointId);
  const replayEntries = captureReplayEntries(state, loaded.session, 0, createRuntimePresentationHostStateV1());
  const loadedState: PlayerCoreState = { ...state, replayEntries, status: status === "continue" ? "presenting" : status, runtimeState: loaded.state, historySession: loaded.session, schedulerSession: null, playback: idlePlayback(), hostState, currentEvent: event, checkpointSaveCandidates: [] };
  const restoredState = status === "continue" ? drivePlayerCore(loadedState, loaded.session) : loadedState;
  return {
    ok: true,
    artifactHash: loaded.artifactHash,
    savedBuildId: loaded.save.buildId,
    compatibility: loaded.save.buildId === state.artifacts.manifest.buildId ? "current" : "verified-previous",
    savedRuntimeStateHash: runtimeStateHashV1(savedCheckpoint.state),
    savedSceneId: savedCheckpoint.state.cursor.sceneId,
    state: { ...restoredState, checkpointSaveCandidates: [] }
  };
}

function navigatedStatus(history: RuntimeHistorySessionV1, event: RuntimeEventV1 | null): PlayerCoreStatus | "continue" {
  const state = history.checkpoints[history.cursor]!.state;
  if (history.cursor === 0) return "title";
  if (state.pendingEffect !== null) return "waiting-effect";
  if (state.pendingBarrier !== null) return "waiting-barrier";
  if (event?.kind === "choice") return "waiting-choice";
  if (event?.kind === "ending" || state.terminal.kind === "ended") return "ended";
  if (event?.kind === "checkpoint-reached") return "continue";
  if (event !== null && event.kind !== "direction") return "presenting";
  return "continue";
}

function navigatePlayerHistory(state: PlayerCoreState, direction: "back" | "forward"): PlayerCoreState {
  if (state.artifacts === null || state.historySession === null) return state;
  let current = resetPlayback(state);
  for (let step = 0; step < MAX_PLAYER_DRIVE_STEPS; step += 1) {
    const history = current.historySession!;
    const moved = direction === "back"
      ? backRuntimeHistoryV1(current.artifacts!.story, history)
      : forwardRuntimeHistoryV1(current.artifacts!.story, history);
    if (moved.diagnostics.length > 0) {
      const boundary = moved.diagnostics[0]?.code === "RUNTIME_HISTORY_AT_START" || moved.diagnostics[0]?.code === "RUNTIME_HISTORY_AT_END";
      return boundary ? current : playerError(current, moved.diagnostics[0]!.code, moved.diagnostics[0]!.message);
    }
    const plan = moved.reconciliationPlan as RuntimeHistoryReconciliationPlanV1;
    const hostState = reconcileRuntimePresentationHostV1(current.hostState, plan, checkpointEffects(moved.session));
    const event = eventAtHistoryCursor(moved.session);
    const status = navigatedStatus(moved.session, event);
    current = { ...current, status: status === "continue" ? current.status : status, runtimeState: moved.state, historySession: moved.session, hostState, currentEvent: event, checkpointSaveCandidates: [] };
    if (status !== "continue") return current;
  }
  return playerError(current, "PLAYER_HISTORY_DRIVE_LIMIT", `Player Core exceeded ${MAX_PLAYER_DRIVE_STEPS} History boundaries without a presentation`);
}

export function backPlayerCore(state: PlayerCoreState): PlayerCoreState {
  return navigatePlayerHistory(state, "back");
}

export function forwardPlayerCore(state: PlayerCoreState): PlayerCoreState {
  if (!state.historyPolicy.allowForwardAfterBack && state.historySession !== null && state.historySession.cursor < state.historySession.entries.length) return state;
  return navigatePlayerHistory(state, "forward");
}

export function backPlayerCoreToHistoryEntryV1(state: PlayerCoreState, entryId: string): PlayerCoreState {
  if (state.artifacts === null || state.historySession === null) return state;
  const target = state.historySession.entries.find((entry) => entry.entryId === entryId && visibleHistoryEvent(entry.event));
  if (target === undefined || target.historyIndex + 1 > state.historySession.cursor) return state;
  let current = resetPlayback(state);
  const targetCursor = target.historyIndex + 1;
  while (current.historySession!.cursor > targetCursor) {
    const moved = backRuntimeHistoryV1(current.artifacts!.story, current.historySession!);
    if (moved.diagnostics.length > 0) return playerError(current, moved.diagnostics[0]!.code, moved.diagnostics[0]!.message);
    const hostState = reconcileRuntimePresentationHostV1(current.hostState, moved.reconciliationPlan!, checkpointEffects(moved.session));
    current = { ...current, runtimeState: moved.state, historySession: moved.session, hostState, currentEvent: eventAtHistoryCursor(moved.session), checkpointSaveCandidates: [] };
  }
  const event = eventAtHistoryCursor(current.historySession!);
  const status = navigatedStatus(current.historySession!, event);
  return { ...current, status: status === "continue" ? current.status : status, currentEvent: event };
}

export function dispatchPlayerCoreIntentV1(state: PlayerCoreState, project: CanonicalProject, intent: PlayerCoreIntentV1): PlayerCoreState {
  if (intent.kind === "enter-scene-replay") return enterPlayerCoreReplayV1(state, intent.replayId);
  if (intent.kind === "exit-scene-replay") return exitPlayerCoreReplayV1(state);
  if (state.replaySession !== null && (state.status === 'ended' || state.status === 'error') && (intent.kind === 'primary' || intent.kind === 'restart')) return exitPlayerCoreReplayV1(state);
  if (intent.kind === "select-choice") return selectPlayerCoreChoice(state, intent.optionId);
  if (intent.kind === "cancel") return settlePlayerCoreEffect(state, "cancel");
  if (intent.kind === "back") return backPlayerCore(state);
  if (intent.kind === "forward") return forwardPlayerCore(state);
  if (intent.kind === "history-back-to") return backPlayerCoreToHistoryEntryV1(state, intent.entryId);
  if (intent.kind === "restart") return state.status === "ended" || state.status === "error"
    ? restartPlayerCoreWithProgress(state, project)
    : state;
  if (state.status === "title") return state.historySession === null ? startPlayerCore(state, project) : forwardPlayerCore(state);
  if (state.status === "presenting") return advancePlayerCore(state);
  if (state.status === "waiting-effect") return settlePlayerCoreEffect(state, "complete");
  if (state.status === "waiting-barrier") return approvePlayerCoreBarrier(state);
  if (state.status === "ended" || state.status === "error") return restartPlayerCoreWithProgress(state, project);
  return state;
}

function presentation(state: PlayerCoreState): { readonly value: PlayerCoreSnapshotV1["presentation"]; readonly fallbackUsed: boolean } {
  if (state.status === "title") return { value: { kind: "title" }, fallbackUsed: false };
  if (state.status === "error") return { value: { kind: "error", diagnostics: state.diagnostics }, fallbackUsed: false };
  if (state.status === "waiting-effect" && state.runtimeState?.pendingEffect !== null && state.runtimeState?.pendingEffect !== undefined) {
    return { value: { kind: "effect", descriptorId: state.runtimeState.pendingEffect.descriptorId, canCancel: true }, fallbackUsed: false };
  }
  if (state.status === "waiting-barrier" && state.runtimeState?.pendingBarrier !== null && state.runtimeState?.pendingBarrier !== undefined) {
    return { value: { kind: "barrier", descriptorId: state.runtimeState.pendingBarrier.descriptorId, reason: state.runtimeState.pendingBarrier.reason }, fallbackUsed: false };
  }
  const event = state.currentEvent;
  const entries = localeEntries(state);
  if (event?.kind === "dialogue") {
    const text = translatedPlayerText(state, entries, event.textId, event.text);
    return { value: { kind: "dialogue", speakerId: event.speakerId, textId: event.textId, text: text.text }, fallbackUsed: text.fallback };
  }
  if (event?.kind === "narration") {
    const text = translatedPlayerText(state, entries, event.textId, event.text);
    return { value: { kind: "narration", textId: event.textId, text: text.text }, fallbackUsed: text.fallback };
  }
  if (event?.kind === "choice") {
    const prompt = translatedPlayerText(state, entries, event.instructionId, event.prompt);
    const options = event.options.map(({ optionId, label }) => ({ optionId, ...translatedPlayerText(state, entries, optionId, label) }));
    return { value: { kind: "choice", prompt: prompt.text, options: options.map(({ optionId, text }) => ({ optionId, label: text })) }, fallbackUsed: prompt.fallback || options.some((option) => option.fallback) };
  }
  if (event?.kind === "wait") return { value: { kind: "wait", durationMilliseconds: event.durationMilliseconds }, fallbackUsed: false };
  if (event?.kind === "ending") {
    const name = translatedPlayerText(state, entries, event.endingId, event.name);
    return { value: { kind: "ending", endingId: event.endingId, name: name.text }, fallbackUsed: name.fallback };
  }
  if (state.runtimeState?.terminal.kind === "ended") {
    const terminal = state.runtimeState.terminal;
    const name = translatedPlayerText(state, entries, terminal.endingId, terminal.name);
    return { value: { kind: "ending", endingId: terminal.endingId, name: name.text }, fallbackUsed: name.fallback };
  }
  return { value: { kind: "error", diagnostics: [...state.diagnostics, { origin: "player", code: "PLAYER_PRESENTATION_MISSING", message: "Player Core reached a state without a presentable boundary", sceneId: state.runtimeState?.cursor.sceneId ?? null, statementId: null, instructionId: null }] }, fallbackUsed: false };
}

function localizedHistoryEvent(state: PlayerCoreState, event: PlayerHistoryVisibleEventV1, entries: ReadonlyMap<string, JsonObject>): PlayerHistoryVisibleEventV1 {
  if (event.kind === "dialogue") return { ...event, text: translatedPlayerText(state, entries, event.textId, event.text).text };
  if (event.kind === "narration") return { ...event, text: translatedPlayerText(state, entries, event.textId, event.text).text };
  if (event.kind === "choice") return {
    ...event,
    prompt: translatedPlayerText(state, entries, event.instructionId, event.prompt).text,
    options: event.options.map((option) => ({ ...option, label: translatedPlayerText(state, entries, option.optionId, option.label).text }))
  };
  if (event.kind === "ending") return { ...event, name: translatedPlayerText(state, entries, event.endingId, event.name).text };
  return event;
}

export function playerCoreMetaProgressV1(state: PlayerCoreState): RuntimeStateV1["metaProgress"] | null {
  return state.replaySession !== null ? playerCoreMetaProgressV1(state.replaySession.checkpoint) : state.runtimeState?.metaProgress ?? state.retainedMetaProgress;
}

/** Merge collection knowledge without moving the story cursor or executing effects. */
export function mergePlayerCoreMetaProgressV1(state: PlayerCoreState, incoming: RuntimeStateV1["metaProgress"]): PlayerCoreState {
  if (state.replaySession !== null || incoming.projectId !== state.projectId || incoming.progressScopeId !== "player" || validateRuntimeMetaProgressV1(incoming).length > 0) return state;
  const current = playerCoreMetaProgressV1(state), merged = mergeRuntimeMetaProgressV1(current ?? { schemaVersion: 1, projectId: state.projectId, progressScopeId: "player", readTextIds: [], unlockedGalleryAssetIds: [], reachedEndingIds: [] }, incoming);
  if (!merged.ok || current !== null && !merged.changed) return state;
  if (state.historySession !== null && state.artifacts !== null && state.runtimeState !== null) {
    const history = mergeRuntimeHistoryMetaProgressV1(state.artifacts.story, state.historySession, merged.progress);
    return history.diagnostics.length > 0 ? state : { ...state, retainedMetaProgress: merged.progress, historySession: history.session, runtimeState: history.state };
  }
  return { ...state, retainedMetaProgress: merged.progress };
}

function restartPlayerCoreWithProgress(state: PlayerCoreState, project: CanonicalProject): PlayerCoreState {
  const fresh = { ...configurePlayerCoreLocaleV1(createPlayerCore(project, state.historyPolicy), state.localization.selectedLocale), replayEntries: state.replayEntries }, progress = playerCoreMetaProgressV1(state);
  return progress === null ? fresh : mergePlayerCoreMetaProgressV1(fresh, progress);
}

function additionalContentSnapshot(state: PlayerCoreState): PlayerAdditionalContentSnapshotV1 {
  const catalogs = state.artifacts?.catalogs;
  const progress = playerCoreMetaProgressV1(state);
  // Meta Progress v1 stores monotonic unlocked asset IDs in this compatibility-stable field.
  // Compiler catalogs decide whether an unlocked asset belongs to Gallery or Music.
  const unlockedAssetIds = new Set(progress?.unlockedGalleryAssetIds ?? []);
  const endingIds = new Set(progress?.reachedEndingIds ?? []);
  const category = (total: number, unlocked: number): PlayerAdditionalContentCategorySnapshotV1 => ({
    total,
    unlocked,
    locked: total - unlocked
  });
  const galleryUnlocked = catalogs?.gallery.filter((entry) => unlockedAssetIds.has(entry.assetId)).length ?? 0;
  const endingUnlocked = catalogs?.endings.filter((entry) => endingIds.has(entry.endingId)).length ?? 0;
  const replayUnlocked = catalogs?.replay.filter((entry) => entry.endingIds.some((endingId) => endingIds.has(endingId))).length ?? 0;
  const entries = localeEntries(state);
  return {
    schemaVersion: 1,
    gallery: category(catalogs?.gallery.length ?? 0, galleryUnlocked),
    replay: category(catalogs?.replay.length ?? 0, replayUnlocked),
    music: category(catalogs?.music.length ?? 0, catalogs?.music.filter((entry) => unlockedAssetIds.has(entry.assetId)).length ?? 0),
    endings: category(catalogs?.endings.length ?? 0, endingUnlocked),
    galleryItems: catalogs?.gallery.map((entry) => ({
      assetId: entry.assetId,
      displayName: unlockedAssetIds.has(entry.assetId) || entry.revealBeforeUnlock ? translatedPlayerText(state, entries, entry.assetId, entry.displayName).text : null,
      coverAssetId: unlockedAssetIds.has(entry.assetId) || entry.revealBeforeUnlock ? entry.coverAssetId : null,
      kind: entry.kind,
      unlocked: unlockedAssetIds.has(entry.assetId)
    })) ?? [],
    musicItems: catalogs?.music.map((entry) => ({
      assetId: entry.assetId,
      displayName: unlockedAssetIds.has(entry.assetId) || entry.revealBeforeUnlock ? translatedPlayerText(state, entries, entry.assetId, entry.displayName).text : null,
      coverAssetId: unlockedAssetIds.has(entry.assetId) || entry.revealBeforeUnlock ? entry.coverAssetId : null,
      unlocked: unlockedAssetIds.has(entry.assetId)
    })) ?? [],
    replayItems: catalogs?.replay.map((entry) => {
      const unlocked = entry.endingIds.some((endingId) => endingIds.has(endingId));
      const visible = unlocked || entry.revealBeforeUnlock;
      return { replayId: entry.replayId, title: visible ? translatedPlayerText(state, entries, entry.replayId, entry.title).text : null, sceneId: entry.sceneId, coverAssetId: visible ? entry.coverAssetId : null, unlocked };
    }) ?? [],
    endingItems: catalogs?.endings.map((entry) => ({
      endingId: entry.endingId,
      name: endingIds.has(entry.endingId) || entry.revealBeforeUnlock ? translatedPlayerText(state, entries, entry.endingId, entry.name).text : null,
      sceneId: entry.sceneId,
      coverAssetId: endingIds.has(entry.endingId) || entry.revealBeforeUnlock ? entry.coverAssetId : null,
      unlocked: endingIds.has(entry.endingId)
    })) ?? []
  };
}

export function createPlayerCoreSnapshotV1(state: PlayerCoreState): PlayerCoreSnapshotV1 {
  const host = createRuntimePresentationHostSnapshotV1(state.hostState);
  const history = state.historySession;
  const previous = history === null || history.cursor === 0 ? null : history.entries[history.cursor - 1] ?? null;
  const hasForward = history !== null && history.cursor < history.entries.length;
  // The nearest committed barrier is sufficient for every backward target.
  // Avoid slicing/scanning the suffix separately for each visible history row.
  let backwardBarrier: RuntimeHistorySessionV1["entries"][number] | null = null;
  if (history !== null) {
    for (let index = history.cursor - 1; index >= 0; index--) {
      const entry = history.entries[index]!;
      if (entry.barriers.length > 0) { backwardBarrier = entry; break; }
    }
  }
  const presented = presentation(state);
  const entries = localeEntries(state);
  const missingTranslationCount = state.localization.selectedLocale === state.localization.sourceLocale ? 0 : playerSourceTexts(state).filter(({ key, text }) => translatedPlayerText(state, entries, key, text).fallback).length;
  return {
    schemaVersion: 1,
    playerCoreVersion: PLAYER_CORE_VERSION,
    identities: {
      compilerVersion: PROJECT_COMPILER_VERSION,
      runtimeVersion: RUNTIME_VERSION,
      runtimeHostVersion: RUNTIME_PRESENTATION_HOST_VERSION,
      projectId: state.projectId,
      buildId: state.artifacts?.manifest.buildId ?? null
    },
    title: state.title,
    status: state.status,
    localization: {
      sourceLocale: state.localization.sourceLocale,
      selectedLocale: state.localization.selectedLocale,
      availableLocales: availablePlayerLocales(state),
      missingTranslationCount,
      fallbackUsed: presented.fallbackUsed
    },
    additionalContent: additionalContentSnapshot(state),
    sceneReplay: {
      active: state.replaySession !== null,
      replayId: state.replaySession?.replayId ?? null,
      title: state.replaySession?.title ?? null,
      error: state.replayError
    },
    effects: {
      active: host.snapshot.activeChannels.map(({ effect }) => effectSnapshot(effect)),
      pending: state.runtimeState?.pendingEffect === null || state.runtimeState?.pendingEffect === undefined
        ? null
        : effectSnapshot(state.runtimeState.pendingEffect),
      operations: host.snapshot.operations.map((operation) => ({
        sequence: operation.sequence,
        kind: operation.kind,
        effectId: operation.effectId,
        descriptorId: operation.descriptorId,
        channel: operation.channel
      }))
    },
    history: history === null ? null : {
      cursor: history.cursor,
      length: history.entries.length,
      canBack: history.cursor > 0 && state.runtimeState?.pendingEffect === null && previous?.barriers.length === 0,
      canForward: hasForward && state.historyPolicy.allowForwardAfterBack && state.runtimeState?.pendingEffect === null,
      hasForward,
      forwardPolicy: {
        allowForwardAfterBack: state.historyPolicy.allowForwardAfterBack,
        blocked: hasForward && !state.historyPolicy.allowForwardAfterBack
      },
      backwardBarrier: backwardBarrier === null ? null : {
        descriptorId: backwardBarrier.barriers.at(-1)!.descriptorId,
        reason: backwardBarrier.barriers.at(-1)!.reason,
        distance: history.cursor - backwardBarrier.historyIndex
      },
      activeEntries: history.entries.flatMap((entry): readonly PlayerHistoryEntrySnapshotV1[] => {
        if (!visibleHistoryEvent(entry.event)) return [];
        const targetCursor = entry.historyIndex + 1;
        const barrierBetween = backwardBarrier !== null && targetCursor <= backwardBarrier.historyIndex;
        return [{
          entryId: entry.entryId,
          historyIndex: entry.historyIndex,
          position: targetCursor < history.cursor ? "past" : targetCursor === history.cursor ? "current" : "future",
          canNavigateBack: targetCursor <= history.cursor && !barrierBetween,
          event: localizedHistoryEvent(state, entry.event, entries)
        }];
      }),
      archives: history.archives.map((archive) => ({
        archiveId: archive.archiveId,
        branchPointHistoryIndex: archive.branchPointHistoryIndex,
        entries: archive.entries.flatMap((entry) => visibleHistoryEvent(entry.event) ? [{
          entryId: entry.originalEntryId,
          historyIndex: entry.originalHistoryIndex,
          event: localizedHistoryEvent(state, entry.event, entries)
        }] : [])
      }))
    },
    playback: state.playback,
    presentation: presented.value,
    runtimeStateHash: state.runtimeState === null ? null : runtimeStateHashV1(state.runtimeState),
    runtimeHostSnapshotHash: host.snapshotHash
  };
}

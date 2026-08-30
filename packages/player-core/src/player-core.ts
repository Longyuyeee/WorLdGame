import {
  PROJECT_COMPILER_VERSION,
  compileProject,
  type CompilerArtifactsV1,
  type CompilerDiagnostic
} from "@world-studio/project-compiler";
import type { CanonicalProject, JsonValue } from "@world-studio/project-domain";
import {
  RUNTIME_VERSION,
  advanceRuntimeHistoryV1,
  backRuntimeHistoryV1,
  createRuntimeHistorySessionV1,
  createRuntimeSessionSaveV1,
  createRuntimeState,
  forwardRuntimeHistoryV1,
  loadRuntimeSessionSaveV1,
  runtimeStateHashV1,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeHistoryReconciliationPlanV1,
  type RuntimeHistorySessionV1,
  type RuntimeInputV1,
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

export const PLAYER_CORE_VERSION = "0.4.0" as const;
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
  readonly runtimeState: RuntimeStateV1 | null;
  readonly historySession: RuntimeHistorySessionV1 | null;
  readonly hostState: RuntimePresentationHostStateV1;
  readonly currentEvent: RuntimeEventV1 | null;
  readonly checkpointSaveCandidates: readonly PlayerCheckpointSaveCandidateV1[];
  readonly diagnostics: readonly PlayerCoreDiagnostic[];
}

export interface PlayerCheckpointSaveCandidateV1 {
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
  } | null;
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
  | { readonly kind: "restart" };

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

export function createPlayerCore(project: CanonicalProject): PlayerCoreState {
  const hostState = createRuntimePresentationHostStateV1();
  const compiled = compileProject(project, "release");
  if (!compiled.ok) {
    return {
      status: "error",
      projectId: project.manifest.projectId,
      title: project.manifest.title,
      artifacts: null,
      runtimeState: null,
      historySession: null,
      hostState,
      currentEvent: null,
      checkpointSaveCandidates: [],
      diagnostics: compiled.diagnostics.map(compilerDiagnostic)
    };
  }
  return {
    status: "title",
    projectId: project.manifest.projectId,
    title: project.manifest.title,
    artifacts: compiled.artifacts,
    runtimeState: null,
    historySession: null,
    hostState,
    currentEvent: null,
    checkpointSaveCandidates: [],
    diagnostics: compiled.diagnostics.map(compilerDiagnostic)
  };
}

function drivePlayerCore(base: PlayerCoreState, initialHistory: RuntimeHistorySessionV1, input?: RuntimeInputV1): PlayerCoreState {
  const artifacts = base.artifacts;
  if (artifacts === null) return playerError(base, "PLAYER_BUILD_MISSING", "Player Core has no verified Compiler artifacts");
  let historySession = initialHistory;
  let runtimeState = historySession.checkpoints[historySession.cursor]!.state;
  let hostState = base.hostState;
  const checkpointSaveCandidates: PlayerCheckpointSaveCandidateV1[] = [];
  let nextInput = input;
  for (let step = 0; step < MAX_PLAYER_DRIVE_STEPS; step += 1) {
    const result = advanceRuntimeHistoryV1(artifacts.story, historySession, nextInput === undefined ? {} : { input: nextInput });
    nextInput = undefined;
    historySession = result.session;
    runtimeState = result.state;
    hostState = consumeRuntimePresentationEffectsV1(hostState, result.effects);
    if (result.event?.kind === "checkpoint-reached") {
      const created = createRuntimeSessionSaveV1(artifacts.story, historySession);
      if (!created.ok) return { ...base, runtimeState, historySession, hostState, currentEvent: null, checkpointSaveCandidates, status: "error", diagnostics: [...base.diagnostics, ...created.diagnostics.map(runtimeDiagnostic)] };
      checkpointSaveCandidates.push({ stepId: result.event.stepId, sceneId: runtimeState.cursor.sceneId, serializedSessionSave: created.serialized, artifactHash: created.artifactHash, runtimeStateHash: runtimeStateHashV1(runtimeState) });
    }
    const current = { ...base, runtimeState, historySession, hostState, currentEvent: result.event, checkpointSaveCandidates };
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
  | { readonly ok: true; readonly state: PlayerCoreState; readonly artifactHash: string; readonly savedRuntimeStateHash: string; readonly savedSceneId: string }
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
  const history = createRuntimeHistorySessionV1(state.artifacts.story, created.state);
  if (history.diagnostics.length > 0) return { ...state, status: "error", diagnostics: [...state.diagnostics, ...history.diagnostics.map(runtimeDiagnostic)] };
  return drivePlayerCore(state, history.session);
}

export function advancePlayerCore(state: PlayerCoreState): PlayerCoreState {
  return state.status === "presenting" && state.historySession !== null
    ? drivePlayerCore(state, state.historySession)
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
  return drivePlayerCore(state, state.historySession, input);
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
  return drivePlayerCore({ ...state, hostState }, state.historySession, input);
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
  return drivePlayerCore(state, state.historySession, input);
}

function eventAtHistoryCursor(history: RuntimeHistorySessionV1): RuntimeEventV1 | null {
  return history.cursor === 0 ? null : history.entries[history.cursor - 1]?.event ?? null;
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

export function createPlayerCoreSessionSaveV1(state: PlayerCoreState): CreatePlayerCoreSessionSaveResultV1 {
  if (state.artifacts === null || state.historySession === null || state.runtimeState === null) {
    return { ok: false, diagnostics: [{ origin: "player", code: "PLAYER_SAVE_UNAVAILABLE", message: "Player Core has no active Runtime History Session to save", sceneId: null, statementId: null, instructionId: null }] };
  }
  const created = createRuntimeSessionSaveV1(state.artifacts.story, state.historySession);
  return created.ok
    ? { ok: true, serialized: created.serialized, artifactHash: created.artifactHash }
    : { ok: false, diagnostics: created.diagnostics.map(runtimeDiagnostic) };
}

export function loadPlayerCoreSessionSaveV1(state: PlayerCoreState, serialized: string): LoadPlayerCoreSessionSaveResultV1 {
  if (state.artifacts === null) {
    return { ok: false, diagnostics: [{ origin: "player", code: "PLAYER_BUILD_MISSING", message: "Player Core has no verified Compiler artifacts", sceneId: null, statementId: null, instructionId: null }] };
  }
  const loaded = loadRuntimeSessionSaveV1(state.artifacts.story, serialized, {
    expectedBuildId: state.artifacts.manifest.buildId,
    ...(state.runtimeState === null ? {} : { currentMetaProgress: state.runtimeState.metaProgress })
  });
  if (!loaded.ok) return { ok: false, diagnostics: loaded.diagnostics.map(runtimeDiagnostic) };
  const event = eventAtHistoryCursor(loaded.session);
  const status = navigatedStatus(loaded.session, event);
  if (status === "continue" && event?.kind !== "checkpoint-reached") {
    return { ok: false, diagnostics: [{ origin: "player", code: "PLAYER_SAVE_BOUNDARY_INVALID", message: "Player Session Save does not point at a presentable boundary", sceneId: loaded.state.cursor.sceneId, statementId: null, instructionId: null }] };
  }
  const checkpoint = loaded.session.checkpoints[loaded.session.cursor]!;
  const savedCheckpoint = loaded.save.history.checkpoints[loaded.save.cursor]!;
  const hostState = rehydrateRuntimePresentationHostV1(checkpointEffects(loaded.session), checkpoint.checkpointId);
  const loadedState: PlayerCoreState = { ...state, status: status === "continue" ? "presenting" : status, runtimeState: loaded.state, historySession: loaded.session, hostState, currentEvent: event, checkpointSaveCandidates: [] };
  const restoredState = status === "continue" ? drivePlayerCore(loadedState, loaded.session) : loadedState;
  return {
    ok: true,
    artifactHash: loaded.artifactHash,
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
  let current = state;
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
  return navigatePlayerHistory(state, "forward");
}

export function dispatchPlayerCoreIntentV1(state: PlayerCoreState, project: CanonicalProject, intent: PlayerCoreIntentV1): PlayerCoreState {
  if (intent.kind === "select-choice") return selectPlayerCoreChoice(state, intent.optionId);
  if (intent.kind === "cancel") return settlePlayerCoreEffect(state, "cancel");
  if (intent.kind === "back") return backPlayerCore(state);
  if (intent.kind === "forward") return forwardPlayerCore(state);
  if (intent.kind === "restart") return state.status === "ended" || state.status === "error" ? createPlayerCore(project) : state;
  if (state.status === "title") return state.historySession === null ? startPlayerCore(state, project) : forwardPlayerCore(state);
  if (state.status === "presenting") return advancePlayerCore(state);
  if (state.status === "waiting-effect") return settlePlayerCoreEffect(state, "complete");
  if (state.status === "waiting-barrier") return approvePlayerCoreBarrier(state);
  if (state.status === "ended" || state.status === "error") return createPlayerCore(project);
  return state;
}

function presentation(state: PlayerCoreState): PlayerCoreSnapshotV1["presentation"] {
  if (state.status === "title") return { kind: "title" };
  if (state.status === "error") return { kind: "error", diagnostics: state.diagnostics };
  if (state.status === "waiting-effect" && state.runtimeState?.pendingEffect !== null && state.runtimeState?.pendingEffect !== undefined) {
    return { kind: "effect", descriptorId: state.runtimeState.pendingEffect.descriptorId, canCancel: true };
  }
  if (state.status === "waiting-barrier" && state.runtimeState?.pendingBarrier !== null && state.runtimeState?.pendingBarrier !== undefined) {
    return { kind: "barrier", descriptorId: state.runtimeState.pendingBarrier.descriptorId, reason: state.runtimeState.pendingBarrier.reason };
  }
  const event = state.currentEvent;
  if (event?.kind === "dialogue") return { kind: "dialogue", speakerId: event.speakerId, textId: event.textId, text: event.text };
  if (event?.kind === "narration") return { kind: "narration", textId: event.textId, text: event.text };
  if (event?.kind === "choice") return { kind: "choice", prompt: event.prompt, options: event.options.map(({ optionId, label }) => ({ optionId, label })) };
  if (event?.kind === "wait") return { kind: "wait", durationMilliseconds: event.durationMilliseconds };
  if (event?.kind === "ending") return { kind: "ending", endingId: event.endingId, name: event.name };
  if (state.runtimeState?.terminal.kind === "ended") return { kind: "ending", endingId: state.runtimeState.terminal.endingId, name: state.runtimeState.terminal.name };
  return { kind: "error", diagnostics: [...state.diagnostics, { origin: "player", code: "PLAYER_PRESENTATION_MISSING", message: "Player Core reached a state without a presentable boundary", sceneId: state.runtimeState?.cursor.sceneId ?? null, statementId: null, instructionId: null }] };
}

export function createPlayerCoreSnapshotV1(state: PlayerCoreState): PlayerCoreSnapshotV1 {
  const host = createRuntimePresentationHostSnapshotV1(state.hostState);
  const history = state.historySession;
  const previous = history === null || history.cursor === 0 ? null : history.entries[history.cursor - 1] ?? null;
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
      canForward: history.cursor < history.entries.length && state.runtimeState?.pendingEffect === null
    },
    presentation: presentation(state),
    runtimeStateHash: state.runtimeState === null ? null : runtimeStateHashV1(state.runtimeState),
    runtimeHostSnapshotHash: host.snapshotHash
  };
}

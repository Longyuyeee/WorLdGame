import {
  PROJECT_COMPILER_VERSION,
  compileProject,
  type CompilerArtifactsV1,
  type CompilerDiagnostic
} from "@world-studio/project-compiler";
import type { CanonicalProject, JsonValue } from "@world-studio/project-domain";
import {
  RUNTIME_VERSION,
  createRuntimeState,
  runRuntime,
  runtimeStateHashV1,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeInputV1,
  type RuntimeScalar,
  type RuntimeStateV1
} from "@world-studio/runtime";
import {
  RUNTIME_PRESENTATION_HOST_VERSION,
  consumeRuntimePresentationEffectsV1,
  createRuntimePresentationHostSnapshotV1,
  createRuntimePresentationHostStateV1,
  settleRuntimePresentationEffectV1,
  type RuntimePresentationHostStateV1
} from "@world-studio/runtime-host";

export const PLAYER_CORE_VERSION = "0.3.0" as const;
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
  readonly hostState: RuntimePresentationHostStateV1;
  readonly currentEvent: RuntimeEventV1 | null;
  readonly diagnostics: readonly PlayerCoreDiagnostic[];
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
  readonly kind: "execute" | "complete" | "cancel" | "compensate" | "replay";
  readonly effectId: string;
  readonly descriptorId: string;
  readonly channel: string;
}

export type PlayerCoreIntentV1 =
  | { readonly kind: "primary" }
  | { readonly kind: "select-choice"; readonly optionId: string }
  | { readonly kind: "cancel" }
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
      hostState,
      currentEvent: null,
      diagnostics: compiled.diagnostics.map(compilerDiagnostic)
    };
  }
  return {
    status: "title",
    projectId: project.manifest.projectId,
    title: project.manifest.title,
    artifacts: compiled.artifacts,
    runtimeState: null,
    hostState,
    currentEvent: null,
    diagnostics: compiled.diagnostics.map(compilerDiagnostic)
  };
}

function drivePlayerCore(base: PlayerCoreState, initialState: RuntimeStateV1, input?: RuntimeInputV1): PlayerCoreState {
  const artifacts = base.artifacts;
  if (artifacts === null) return playerError(base, "PLAYER_BUILD_MISSING", "Player Core has no verified Compiler artifacts");
  let runtimeState = initialState;
  let hostState = base.hostState;
  let nextInput = input;
  for (let step = 0; step < MAX_PLAYER_DRIVE_STEPS; step += 1) {
    const result = runRuntime(artifacts.story, runtimeState, nextInput === undefined ? {} : { input: nextInput });
    nextInput = undefined;
    runtimeState = result.state;
    hostState = consumeRuntimePresentationEffectsV1(hostState, result.effects);
    const current = { ...base, runtimeState, hostState, currentEvent: result.event };
    if (result.diagnostics.length > 0) {
      return { ...current, status: "error", currentEvent: null, diagnostics: [...base.diagnostics, ...result.diagnostics.map(runtimeDiagnostic)] };
    }
    if (runtimeState.pendingEffect !== null) return { ...current, status: "waiting-effect" };
    if (runtimeState.pendingBarrier !== null) return { ...current, status: "waiting-barrier" };
    if (result.event?.kind === "choice") return { ...current, status: "waiting-choice" };
    if (result.event?.kind === "ending" || runtimeState.terminal.kind === "ended") return { ...current, status: "ended" };
    if (result.event !== null && result.event.kind !== "direction") return { ...current, status: "presenting" };
  }
  return playerError({ ...base, runtimeState, hostState }, "PLAYER_DRIVE_LIMIT", `Player Core exceeded ${MAX_PLAYER_DRIVE_STEPS} internal steps without a presentation boundary`);
}

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
  return drivePlayerCore(state, created.state);
}

export function advancePlayerCore(state: PlayerCoreState): PlayerCoreState {
  return state.status === "presenting" && state.runtimeState !== null
    ? drivePlayerCore(state, state.runtimeState)
    : state;
}

export function selectPlayerCoreChoice(state: PlayerCoreState, optionId: string): PlayerCoreState {
  const pending = state.runtimeState?.pendingChoice ?? null;
  if (state.status !== "waiting-choice" || state.runtimeState === null || pending === null) return state;
  if (!pending.options.some((option) => option.optionId === optionId)) return playerError(state, "PLAYER_CHOICE_MISSING", `Choice option does not exist: ${optionId}`);
  const input: RuntimeInputV1 = {
    schemaVersion: 1,
    kind: "choiceSelected",
    inputId: `player.input.${state.runtimeState.nextInputSequence}`,
    executionId: state.runtimeState.executionId,
    expectedStateRevision: state.runtimeState.stateRevision,
    logicalSequence: pending.logicalSequence,
    requestId: pending.requestId,
    instructionId: pending.instructionId,
    optionId
  };
  return drivePlayerCore(state, state.runtimeState, input);
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
  return drivePlayerCore({ ...state, hostState }, state.runtimeState, input);
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
  return drivePlayerCore(state, state.runtimeState, input);
}

export function dispatchPlayerCoreIntentV1(state: PlayerCoreState, project: CanonicalProject, intent: PlayerCoreIntentV1): PlayerCoreState {
  if (intent.kind === "select-choice") return selectPlayerCoreChoice(state, intent.optionId);
  if (intent.kind === "cancel") return settlePlayerCoreEffect(state, "cancel");
  if (intent.kind === "restart") return state.status === "ended" || state.status === "error" ? createPlayerCore(project) : state;
  if (state.status === "title") return startPlayerCore(state, project);
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
    presentation: presentation(state),
    runtimeStateHash: state.runtimeState === null ? null : runtimeStateHashV1(state.runtimeState),
    runtimeHostSnapshotHash: host.snapshotHash
  };
}

import { compileProject, type CompilerDiagnostic, type RuntimeSourceMapV1 } from "@world-studio/project-compiler";
import {
  advanceRuntimeHistoryV1,
  backRuntimeHistoryV1,
  createRuntimeHistorySessionV1,
  createRuntimeSchedulerSessionV1,
  forwardRuntimeHistoryV1,
  createRuntimeState,
  mapRuntimeDiagnosticsV1,
  scheduleRuntimeBatchV1,
  validateRuntimeStateV1,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeHistoryReconciliationPlanV1,
  type RuntimeHistorySessionV1,
  type RuntimeInputV1,
  type RuntimeProgramV1,
  type RuntimeSchedulerSessionV1,
  type RuntimeStateV1
} from "@world-studio/runtime";
import type { CanonicalProject, JsonValue } from "@world-studio/project-domain";

export type FormalPreviewStatus = "idle" | "presenting" | "paused" | "waiting-choice" | "ended" | "error";
export type FormalPreviewStartTarget =
  | { readonly kind: "entry" }
  | { readonly kind: "scene"; readonly sceneId: string }
  | { readonly kind: "statement"; readonly sceneId: string; readonly statementId: string };

export interface FormalPreviewDiagnostic {
  readonly origin: "compiler" | "runtime" | "source-map" | "session";
  readonly severity: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly sceneId: string | null;
  readonly statementId: string | null;
  readonly statementIndex: number | null;
  readonly instructionId: string | null;
}

export interface FormalPreviewLocation {
  readonly sceneId: string;
  readonly instructionIndex: number;
  readonly instructionId: string | null;
  readonly opcode: string | null;
  readonly statementId: string | null;
  readonly statementIndex: number | null;
}

export interface FormalPreviewObservation {
  readonly status: FormalPreviewStatus;
  readonly stateRevision: number | null;
  readonly logicalTimeMilliseconds: number | null;
  readonly current: FormalPreviewLocation | null;
  readonly variables: readonly { readonly id: string; readonly type: string; readonly value: null | boolean | number | string }[];
  readonly callStack: readonly (FormalPreviewLocation & { readonly depth: number })[];
  readonly diagnostics: readonly FormalPreviewDiagnostic[];
  readonly history: { readonly cursor: number; readonly length: number; readonly canBack: boolean; readonly canForward: boolean; readonly transient: boolean } | null;
  readonly reconciliation: RuntimeHistoryReconciliationPlanV1 | null;
}

export interface FormalPreviewState {
  readonly status: FormalPreviewStatus;
  readonly program: RuntimeProgramV1 | null;
  readonly sourceMap: RuntimeSourceMapV1 | null;
  readonly runtimeState: RuntimeStateV1 | null;
  readonly historySession: RuntimeHistorySessionV1 | null;
  readonly schedulerSession: RuntimeSchedulerSessionV1 | null;
  readonly reconciliation: RuntimeHistoryReconciliationPlanV1 | null;
  readonly currentEvent: RuntimeEventV1 | null;
  readonly sceneId: string | null;
  readonly statementIndex: number;
  readonly statementId: string | null;
  readonly visitedStatementIds: readonly string[];
  readonly visitedSceneIds: readonly string[];
  readonly compilerWarnings: readonly CompilerDiagnostic[];
  readonly diagnostics: readonly FormalPreviewDiagnostic[];
  readonly startTarget: FormalPreviewStartTarget | null;
  readonly buildId: string | null;
  readonly endingName?: string;
  readonly error?: string;
}

export function createIdleFormalPreviewState(): FormalPreviewState {
  return {
    status: "idle",
    program: null,
    sourceMap: null,
    runtimeState: null,
    historySession: null,
    schedulerSession: null,
    reconciliation: null,
    currentEvent: null,
    sceneId: null,
    statementIndex: 0,
    statementId: null,
    visitedStatementIds: [],
    visitedSceneIds: [],
    compilerWarnings: [],
    diagnostics: [],
    startTarget: null,
    buildId: null
  };
}

function scalar(value: JsonValue | undefined): null | boolean | number | string | undefined {
  return value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string"
    ? value
    : undefined;
}

function initialVariables(project: CanonicalProject): Readonly<Record<string, null | boolean | number | string>> {
  return Object.fromEntries(project.variables.variables.flatMap((variable) => {
    const id = typeof variable.id === "string" ? variable.id : undefined;
    const value = scalar(variable.defaultValue ?? variable.initialValue ?? variable.value);
    return id === undefined || value === undefined ? [] : [[id, value] as const];
  }));
}

function failed(base: FormalPreviewState, error: string, diagnostics: readonly FormalPreviewDiagnostic[] = []): FormalPreviewState {
  return { ...base, status: "error", currentEvent: null, diagnostics, error };
}

function compilerDiagnostic(item: CompilerDiagnostic): FormalPreviewDiagnostic {
  return { origin: "compiler", severity: item.severity, code: item.code, message: item.message, sceneId: item.sceneId ?? null, statementId: item.statementId ?? null, statementIndex: null, instructionId: null };
}

function runtimeDiagnostics(base: FormalPreviewState, items: readonly RuntimeDiagnosticV1[]): readonly FormalPreviewDiagnostic[] {
  if (base.program !== null && base.sourceMap !== null) {
    const mapped = mapRuntimeDiagnosticsV1(base.program, base.sourceMap, items);
    if (mapped.ok) return mapped.diagnostics.map((item) => ({ origin: "runtime", severity: "error", code: item.code, message: item.message, sceneId: item.sceneId, statementId: item.statementId, statementIndex: item.statementIndex, instructionId: item.instructionId }));
    return mapped.diagnostics.map((item) => ({ origin: "source-map", severity: "error", code: item.code, message: item.message, sceneId: item.sceneId, statementId: null, statementIndex: null, instructionId: item.instructionId }));
  }
  return items.map((item) => ({ origin: "runtime", severity: "error", code: item.code, message: item.message, sceneId: item.sceneId, statementId: null, statementIndex: null, instructionId: item.instructionId }));
}

const normalPolicy = {
  schemaVersion: 1 as const,
  mode: "normal" as const,
  skipActivation: null,
  speed: "normal" as const,
  stopInstructionIds: [] as readonly string[],
  unavailableEffectDescriptorIds: [] as readonly string[],
  instantInstructionBudget: 4096,
  autoTiming: { baseDelayMilliseconds: 0, millisecondsPerReadableUnit: 0, readableUnits: 0, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 0 }
};

function sessionFailure(base: FormalPreviewState, code: string, message: string, sceneId: string | null = base.runtimeState?.cursor.sceneId ?? null, statementId: string | null = null): FormalPreviewState {
  return failed(base, `${code} · ${message}`, [{ origin: "session", severity: "error", code, message, sceneId, statementId, statementIndex: null, instructionId: null }]);
}

function sourceAtCursor(base: FormalPreviewState, state: RuntimeStateV1) {
  const instruction = base.program?.scenes.find((scene) => scene.sceneId === state.cursor.sceneId)?.instructions[state.cursor.instructionIndex];
  return instruction === undefined ? undefined : base.sourceMap?.entries.find((entry) => entry.instructionId === instruction.instructionId);
}

function activeVisits(base: FormalPreviewState, history: RuntimeHistorySessionV1): { visitedStatementIds: readonly string[]; visitedSceneIds: readonly string[] } {
  const statementIds: string[] = [];
  const sceneIds: string[] = [];
  for (const entry of history.entries.slice(0, history.cursor)) {
    if (entry.event === null) continue;
    const source = base.sourceMap?.entries.find((candidate) => candidate.instructionId === entry.event!.instructionId);
    if (source === undefined) continue;
    statementIds.push(source.statementId);
    if (!sceneIds.includes(source.sceneId)) sceneIds.push(source.sceneId);
  }
  return { visitedStatementIds: statementIds, visitedSceneIds: sceneIds };
}

function presentHistory(
  base: FormalPreviewState,
  history: RuntimeHistorySessionV1,
  scheduler: RuntimeSchedulerSessionV1 | null,
  state: RuntimeStateV1,
  event: RuntimeEventV1 | null,
  reconciliation: RuntimeHistoryReconciliationPlanV1 | null = null,
  paused = false
): FormalPreviewState {
  const source = event === null ? sourceAtCursor(base, state) : base.sourceMap?.entries.find((entry) => entry.instructionId === event.instructionId);
  if (source === undefined) return sessionFailure({ ...base, runtimeState: state, historySession: history, schedulerSession: scheduler }, "PREVIEW_SOURCE_MISSING", "Source Map 无法定位当前 Runtime 位置");
  const visits = activeVisits(base, history);
  const { endingName: _previousEndingName, error: _previousError, ...cleanBase } = base;
  return {
    ...cleanBase,
    status: event?.kind === "choice" ? "waiting-choice" : event?.kind === "ending" ? "ended" : paused ? "paused" : "presenting",
    runtimeState: state,
    historySession: history,
    schedulerSession: scheduler,
    reconciliation,
    currentEvent: event,
    diagnostics: base.compilerWarnings.map(compilerDiagnostic),
    sceneId: source.sceneId,
    statementIndex: source.statementIndex,
    statementId: source.statementId,
    ...visits,
    ...(event?.kind === "ending" ? { endingName: event.name } : {})
  };
}

function schedulerFromHistory(base: FormalPreviewState, history: RuntimeHistorySessionV1): RuntimeSchedulerSessionV1 | FormalPreviewState {
  if (base.program === null) return sessionFailure(base, "PREVIEW_SESSION_MISSING", "正式 Preview Program 尚未建立");
  const created = createRuntimeSchedulerSessionV1(base.program, history);
  return created.ok ? created.session : failed(base, `${created.diagnostics[0]!.code} · ${created.diagnostics[0]!.message}`, runtimeDiagnostics(base, created.diagnostics));
}

function execute(base: FormalPreviewState): FormalPreviewState {
  if (base.program === null || base.sourceMap === null || base.historySession === null || base.runtimeState === null) return sessionFailure(base, "PREVIEW_SESSION_MISSING", "正式 Preview Session 尚未建立");
  const stateDiagnostics = validateRuntimeStateV1(base.program, base.runtimeState);
  if (stateDiagnostics.length > 0) return failed(base, `${stateDiagnostics[0]!.code} · ${stateDiagnostics[0]!.message}`, runtimeDiagnostics(base, stateDiagnostics));
  let scheduler = base.schedulerSession;
  if (scheduler === null) {
    const created = schedulerFromHistory(base, base.historySession);
    if (!("schemaVersion" in created)) return created;
    scheduler = created;
  }
  if (scheduler.workingState !== base.runtimeState) return sessionFailure(base, "PREVIEW_SESSION_STATE_MISMATCH", "Preview State 与 Scheduler working State 不一致");
  for (let batch = 0; batch < 128; batch += 1) {
    const result = scheduleRuntimeBatchV1(base.program, scheduler, normalPolicy);
    scheduler = result.session;
    if (result.diagnostics.length > 0) {
      const first = result.diagnostics[0]!;
      return failed({ ...base, runtimeState: result.state, historySession: result.session.history, schedulerSession: result.session }, `${first.code} · ${first.message}`, runtimeDiagnostics(base, result.diagnostics));
    }
    const event = result.events.at(-1) ?? null;
    if (event !== null) return presentHistory(base, result.session.history, result.session, result.state, event);
    if (result.stopReason !== "budget") return sessionFailure({ ...base, runtimeState: result.state, historySession: result.session.history, schedulerSession: result.session }, "PREVIEW_EVENT_MISSING", `Runtime 在 ${result.stopReason} 停止但没有产生可呈现事件`);
  }
  return sessionFailure(base, "PREVIEW_EXECUTION_LIMIT", "单次 Continue 超过 128 个调度批次");
}

function startFailure(base: FormalPreviewState, code: string, message: string, target: FormalPreviewStartTarget, sceneId: string | null = null, statementId: string | null = null): FormalPreviewState {
  return failed({ ...base, startTarget: target, sceneId, statementId }, `${code} · ${message}`, [{ origin: "session", severity: "error", code, message, sceneId, statementId, statementIndex: null, instructionId: null }]);
}

function beginAtState(base: FormalPreviewState, state: RuntimeStateV1): FormalPreviewState {
  if (base.program === null) return sessionFailure(base, "PREVIEW_SESSION_MISSING", "正式 Preview Program 尚未建立");
  const history = createRuntimeHistorySessionV1(base.program, state);
  if (history.diagnostics.length > 0) {
    const first = history.diagnostics[0]!;
    return failed({ ...base, runtimeState: state }, `${first.code} · ${first.message}`, runtimeDiagnostics(base, history.diagnostics));
  }
  return execute({ ...base, runtimeState: state, historySession: history.session });
}

export function startFormalPreview(project: CanonicalProject, target: FormalPreviewStartTarget = { kind: "entry" }): FormalPreviewState {
  const compiled = compileProject(project, "debug");
  if (!compiled.ok) {
    const first = compiled.diagnostics.find((item) => item.severity === "error") ?? compiled.diagnostics[0];
    const error = first === undefined ? "Project Compiler 未生成 Runtime IR" : `${first.code} · ${first.message}`;
    const diagnostics = compiled.diagnostics.map(compilerDiagnostic);
    return failed({ ...createIdleFormalPreviewState(), startTarget: target }, error, diagnostics.length > 0 ? diagnostics : [{ origin: "compiler", severity: "error", code: "COMPILER_OUTPUT_MISSING", message: error, sceneId: null, statementId: null, statementIndex: null, instructionId: null }]);
  }
  const buildId = compiled.artifacts.manifest.buildId;
  const base: FormalPreviewState = {
    ...createIdleFormalPreviewState(),
    status: "presenting",
    program: compiled.artifacts.story,
    sourceMap: compiled.artifacts.sourceMap,
    compilerWarnings: compiled.diagnostics.filter((item) => item.severity === "warning"),
    diagnostics: compiled.diagnostics.filter((item) => item.severity === "warning").map(compilerDiagnostic),
    buildId,
    startTarget: target
  };
  const created = createRuntimeState(compiled.artifacts.story, {
    buildId,
    executionId: `preview.${buildId.slice(0, 24)}`,
    progressScopeId: "preview",
    initialVariables: initialVariables(project)
  });
  if (!created.ok) {
    const first = created.diagnostics[0]!;
    return failed(base, `${first.code} · ${first.message}`, runtimeDiagnostics(base, created.diagnostics));
  }
  if (target.kind === "entry") return beginAtState(base, created.state);
  const scene = compiled.artifacts.story.scenes.find((item) => item.sceneId === target.sceneId);
  if (scene === undefined) return startFailure(base, "PREVIEW_START_SCENE_MISSING", `场景不存在：${target.sceneId}`, target);
  const firstInstruction = scene.instructions[0];
  if (target.kind === "scene" && firstInstruction === undefined) return startFailure(base, "PREVIEW_START_SCENE_EMPTY", `场景没有可运行语句：${target.sceneId}`, target, target.sceneId);
  const source = target.kind === "statement"
    ? compiled.artifacts.sourceMap.entries.find((item) => item.sceneId === target.sceneId && item.statementId === target.statementId)
    : compiled.artifacts.sourceMap.entries.find((item) => item.sceneId === target.sceneId && item.instructionId === firstInstruction!.instructionId);
  if (source === undefined) return startFailure(base, target.kind === "statement" ? "PREVIEW_START_STATEMENT_MISSING" : "PREVIEW_START_SOURCE_INVALID", target.kind === "statement" ? `语句不存在：${target.statementId}` : `Source Map 无法定位场景首条指令：${firstInstruction!.instructionId}`, target, target.sceneId, target.kind === "statement" ? target.statementId : null);
  const instructionIndex = scene.instructions.findIndex((item) => item.instructionId === source.instructionId);
  const instruction = scene.instructions[instructionIndex];
  if (instructionIndex < 0 || instruction === undefined) return startFailure(base, "PREVIEW_START_SOURCE_INVALID", `Source Map 无法定位指令：${source.instructionId}`, target, target.sceneId, source.statementId);
  if (instruction.opcode === "return") return startFailure(base, "PREVIEW_START_REQUIRES_CALL_CONTEXT", "不能在空调用栈上直接从 return 启动", target, target.sceneId, source.statementId);
  const runtimeState: RuntimeStateV1 = { ...created.state, cursor: { sceneId: target.sceneId, instructionIndex } };
  const stateDiagnostics = validateRuntimeStateV1(compiled.artifacts.story, runtimeState);
  if (stateDiagnostics.length > 0) return failed({ ...base, runtimeState, sceneId: target.sceneId, statementId: source.statementId, statementIndex: source.statementIndex }, `${stateDiagnostics[0]!.code} · ${stateDiagnostics[0]!.message}`, runtimeDiagnostics(base, stateDiagnostics));
  return beginAtState({ ...base, sceneId: target.sceneId, statementId: source.statementId, statementIndex: source.statementIndex }, runtimeState);
}

export function startFormalPreviewFromScene(project: CanonicalProject, sceneId: string): FormalPreviewState {
  return startFormalPreview(project, { kind: "scene", sceneId });
}

export function startFormalPreviewFromStatement(project: CanonicalProject, sceneId: string, statementId: string): FormalPreviewState {
  return startFormalPreview(project, { kind: "statement", sceneId, statementId });
}

function location(state: FormalPreviewState, sceneId: string, instructionIndex: number, instructionId?: string | null): FormalPreviewLocation {
  const instruction = state.program?.scenes.find((scene) => scene.sceneId === sceneId)?.instructions[instructionIndex];
  const resolvedInstructionId = instructionId ?? instruction?.instructionId ?? null;
  const source = resolvedInstructionId === null ? undefined : state.sourceMap?.entries.find((entry) => entry.instructionId === resolvedInstructionId);
  return { sceneId, instructionIndex, instructionId: resolvedInstructionId, opcode: instruction?.opcode ?? null, statementId: source?.statementId ?? null, statementIndex: source?.statementIndex ?? null };
}

export function observeFormalPreview(state: FormalPreviewState): FormalPreviewObservation {
  const runtime = state.runtimeState;
  const currentSource = state.currentEvent === null ? null : state.sourceMap?.entries.find((entry) => entry.instructionId === state.currentEvent!.instructionId);
  const cursorInstruction = runtime === null ? undefined : state.program?.scenes.find((scene) => scene.sceneId === runtime.cursor.sceneId)?.instructions[runtime.cursor.instructionIndex];
  const current = currentSource !== undefined && currentSource !== null
    ? location(state, currentSource.sceneId, state.program?.scenes.find((scene) => scene.sceneId === currentSource.sceneId)?.instructions.findIndex((item) => item.instructionId === currentSource.instructionId) ?? -1, currentSource.instructionId)
    : runtime === null || cursorInstruction === undefined
      ? null
      : location(state, runtime.cursor.sceneId, runtime.cursor.instructionIndex, cursorInstruction.instructionId);
  const transient = hasTransientPosition(state);
  return {
    status: state.status,
    stateRevision: runtime?.stateRevision ?? null,
    logicalTimeMilliseconds: runtime?.logicalTimeMilliseconds ?? null,
    current,
    variables: Object.entries(runtime?.variables ?? {}).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([id, value]) => ({ id, type: value === null ? "null" : typeof value, value })),
    callStack: (runtime?.callStack ?? []).map((cursor, depth) => ({ ...location(state, cursor.sceneId, cursor.instructionIndex), depth })),
    diagnostics: state.diagnostics,
    history: state.historySession === null ? null : { cursor: state.historySession.cursor, length: state.historySession.entries.length, canBack: transient || state.historySession.cursor > 0, canForward: !transient && state.historySession.cursor < state.historySession.entries.length, transient },
    reconciliation: state.reconciliation
  };
}

function controlDiagnostic(state: FormalPreviewState, code: string, message: string): FormalPreviewState {
  return { ...state, diagnostics: [...state.compilerWarnings.map(compilerDiagnostic), { origin: "session", severity: "error", code, message, sceneId: state.sceneId, statementId: state.statementId, statementIndex: state.statementIndex, instructionId: state.currentEvent?.instructionId ?? null }] };
}

function eventAtCursor(history: RuntimeHistorySessionV1): RuntimeEventV1 | null {
  return history.cursor === 0 ? null : history.entries[history.cursor - 1]?.event ?? null;
}

function hasTransientPosition(state: FormalPreviewState): boolean {
  return (state.schedulerSession?.accumulatedInstructions ?? 0) > 0 || state.status === "paused" && state.currentEvent === null;
}

function presentNavigation(base: FormalPreviewState, history: RuntimeHistorySessionV1, reconciliation: RuntimeHistoryReconciliationPlanV1 | null): FormalPreviewState {
  const state = history.checkpoints[history.cursor]!.state;
  let scheduler: RuntimeSchedulerSessionV1 | null = null;
  if (history.cursor === history.entries.length) {
    const created = schedulerFromHistory(base, history);
    if (!("schemaVersion" in created)) return created;
    scheduler = created;
  }
  return presentHistory(base, history, scheduler, state, eventAtCursor(history), reconciliation, history.cursor === 0);
}

export function forwardFormalPreview(state: FormalPreviewState): FormalPreviewState {
  if (state.program === null || state.historySession === null) return controlDiagnostic(state, "PREVIEW_HISTORY_MISSING", "正式 Preview History 尚未建立");
  if (hasTransientPosition(state)) return controlDiagnostic(state, "PREVIEW_FORWARD_TRANSIENT", "Run to Cursor 的临时位置没有已记录的 Forward");
  const moved = forwardRuntimeHistoryV1(state.program, state.historySession);
  if (moved.diagnostics.length > 0) return controlDiagnostic(state, moved.diagnostics[0]!.code, moved.diagnostics[0]!.message);
  return presentNavigation(state, moved.session, moved.reconciliationPlan);
}

export function backFormalPreview(state: FormalPreviewState): FormalPreviewState {
  if (state.program === null || state.historySession === null) return controlDiagnostic(state, "PREVIEW_HISTORY_MISSING", "正式 Preview History 尚未建立");
  if (hasTransientPosition(state)) return presentNavigation(state, state.historySession, null);
  const moved = backRuntimeHistoryV1(state.program, state.historySession);
  if (moved.diagnostics.length > 0) return controlDiagnostic(state, moved.diagnostics[0]!.code, moved.diagnostics[0]!.message);
  return presentNavigation(state, moved.session, moved.reconciliationPlan);
}

export function advanceFormalPreview(state: FormalPreviewState): FormalPreviewState {
  if (state.status !== "presenting" && state.status !== "paused") return state;
  if (state.historySession !== null && state.historySession.cursor < state.historySession.entries.length) return forwardFormalPreview(state);
  return execute(state);
}

export function stepOverFormalPreview(state: FormalPreviewState): FormalPreviewState {
  if (state.runtimeState === null || (state.status !== "presenting" && state.status !== "paused")) return state;
  const depth = state.runtimeState.callStack.length;
  let current = advanceFormalPreview(state);
  let step = 0;
  for (; step < 10_000 && current.status === "presenting" && (current.runtimeState?.callStack.length ?? 0) > depth; step += 1) current = advanceFormalPreview(current);
  if (step === 10_000 && current.status === "presenting" && (current.runtimeState?.callStack.length ?? 0) > depth) return controlDiagnostic(current, "PREVIEW_STEP_OVER_LIMIT", "Step Over 超过 10,000 个可呈现边界安全上限");
  return current;
}

export function runFormalPreviewToStatement(state: FormalPreviewState, sceneId: string, statementId: string): FormalPreviewState {
  if (state.program === null || state.sourceMap === null || state.historySession === null) return controlDiagnostic(state, "PREVIEW_HISTORY_MISSING", "正式 Preview History 尚未建立");
  const source = state.sourceMap.entries.find((entry) => entry.sceneId === sceneId && entry.statementId === statementId);
  if (source === undefined) return controlDiagnostic(state, "PREVIEW_RUN_TO_CURSOR_MISSING", `运行目标不存在：${sceneId}/${statementId}`);
  if (state.currentEvent?.instructionId === source.instructionId) return { ...state, status: "paused" };

  let current = state;
  while (current.historySession !== null && current.historySession.cursor < current.historySession.entries.length) {
    current = forwardFormalPreview(current);
    if (current.currentEvent?.instructionId === source.instructionId) return { ...current, status: "paused" };
    if (current.diagnostics.some((item) => item.severity === "error")) return current;
  }
  let scheduler = current.schedulerSession;
  if (scheduler === null) {
    const created = schedulerFromHistory(current, current.historySession!);
    if (!("schemaVersion" in created)) return created;
    scheduler = created;
  }
  const policy = { ...normalPolicy, mode: "skipAll" as const, skipActivation: "toggle" as const, speed: "instant" as const, instantInstructionBudget: 1 };
  for (let instruction = 0; instruction < 10_000; instruction += 1) {
    const cursorInstruction = current.program!.scenes.find((scene) => scene.sceneId === scheduler!.workingState.cursor.sceneId)?.instructions[scheduler!.workingState.cursor.instructionIndex];
    if (cursorInstruction?.instructionId === source.instructionId) return presentHistory(current, scheduler.history, scheduler, scheduler.workingState, null, null, true);
    const result = scheduleRuntimeBatchV1(current.program!, scheduler, policy);
    scheduler = result.session;
    if (result.diagnostics.length > 0) {
      const first = result.diagnostics[0]!;
      return failed({ ...current, runtimeState: result.state, historySession: result.session.history, schedulerSession: result.session }, `${first.code} · ${first.message}`, runtimeDiagnostics(current, result.diagnostics));
    }
    const event = result.events.at(-1) ?? null;
    if (event?.instructionId === source.instructionId) return presentHistory(current, result.session.history, result.session, result.state, event, null, true);
    if (["input", "effect", "barrier", "resourceUnavailable", "terminal", "history"].includes(result.stopReason)) {
      const atBoundary = event === null ? { ...current, runtimeState: result.state, historySession: result.session.history, schedulerSession: result.session } : presentHistory(current, result.session.history, result.session, result.state, event);
      return controlDiagnostic(atBoundary, "PREVIEW_RUN_TO_CURSOR_BLOCKED", `运行到光标被 ${result.stopReason} 边界阻断，目标尚未到达`);
    }
    current = { ...current, runtimeState: result.state, historySession: result.session.history, schedulerSession: result.session, currentEvent: event ?? current.currentEvent };
  }
  return controlDiagnostic(current, "PREVIEW_RUN_TO_CURSOR_LIMIT", "运行到光标超过 10,000 条指令安全上限");
}

export function selectFormalPreviewChoice(state: FormalPreviewState, optionId: string): FormalPreviewState {
  const pending = state.runtimeState?.pendingChoice ?? null;
  if (state.status !== "waiting-choice" || state.program === null || state.historySession === null || state.runtimeState === null || pending === null) return state;
  if (!pending.options.some((option) => option.optionId === optionId)) return controlDiagnostic(state, "PREVIEW_CHOICE_MISSING", `选择项不存在：${optionId}`);
  const future = state.historySession.entries[state.historySession.cursor]?.input;
  if (future?.kind === "choiceSelected" && future.optionId === optionId) return forwardFormalPreview(state);
  const input: RuntimeInputV1 = {
    schemaVersion: 1,
    kind: "choiceSelected",
    inputId: future === undefined ? `preview.input.${state.runtimeState.nextInputSequence}` : `preview.input.${state.runtimeState.nextInputSequence}.fork.${state.historySession.cursor}.${optionId}`,
    executionId: state.runtimeState.executionId,
    expectedStateRevision: state.runtimeState.stateRevision,
    logicalSequence: pending.logicalSequence,
    requestId: pending.requestId,
    instructionId: pending.instructionId,
    optionId
  };
  const advanced = advanceRuntimeHistoryV1(state.program, state.historySession, { input });
  if (advanced.diagnostics.length > 0) return controlDiagnostic(state, advanced.diagnostics[0]!.code, advanced.diagnostics[0]!.message);
  const created = schedulerFromHistory(state, advanced.session);
  if (!("schemaVersion" in created)) return created;
  return presentHistory(state, advanced.session, created, advanced.state, advanced.event);
}

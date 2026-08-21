import { compileProject, type CompilerDiagnostic, type RuntimeSourceMapV1 } from "@world-studio/project-compiler";
import {
  createRuntimeState,
  mapRuntimeDiagnosticsV1,
  runRuntime,
  type RuntimeDiagnosticV1,
  type RuntimeEventV1,
  type RuntimeInputV1,
  type RuntimeProgramV1,
  type RuntimeStateV1
} from "@world-studio/runtime";
import type { CanonicalProject, JsonValue } from "@world-studio/project-domain";

export type FormalPreviewStatus = "idle" | "presenting" | "waiting-choice" | "ended" | "error";

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
}

export interface FormalPreviewState {
  readonly status: FormalPreviewStatus;
  readonly program: RuntimeProgramV1 | null;
  readonly sourceMap: RuntimeSourceMapV1 | null;
  readonly runtimeState: RuntimeStateV1 | null;
  readonly currentEvent: RuntimeEventV1 | null;
  readonly sceneId: string | null;
  readonly statementIndex: number;
  readonly statementId: string | null;
  readonly visitedStatementIds: readonly string[];
  readonly visitedSceneIds: readonly string[];
  readonly compilerWarnings: readonly CompilerDiagnostic[];
  readonly diagnostics: readonly FormalPreviewDiagnostic[];
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
    currentEvent: null,
    sceneId: null,
    statementIndex: 0,
    statementId: null,
    visitedStatementIds: [],
    visitedSceneIds: [],
    compilerWarnings: [],
    diagnostics: [],
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

function execute(
  base: FormalPreviewState,
  input?: RuntimeInputV1
): FormalPreviewState {
  if (base.program === null || base.sourceMap === null || base.runtimeState === null) {
    return failed(base, "正式 Preview Session 尚未建立");
  }
  const result = runRuntime(base.program, base.runtimeState, input === undefined ? {} : { input });
  if (result.diagnostics.length > 0) {
    const first = result.diagnostics[0]!;
    return failed({ ...base, runtimeState: result.state }, `${first.code} · ${first.message}`, runtimeDiagnostics(base, result.diagnostics));
  }
  const event = result.event;
  if (event === null) {
    return failed({ ...base, runtimeState: result.state }, "正式 Runtime 没有产生可呈现事件", [{ origin: "session", severity: "error", code: "PREVIEW_EVENT_MISSING", message: "正式 Runtime 没有产生可呈现事件", sceneId: result.state.cursor.sceneId, statementId: null, statementIndex: null, instructionId: null }]);
  }
  const source = base.sourceMap.entries.find((entry) => entry.instructionId === event.instructionId);
  if (source === undefined) {
    return failed({ ...base, runtimeState: result.state }, `Source Map 缺少 Runtime 指令：${event.instructionId}`, [{ origin: "source-map", severity: "error", code: "PREVIEW_SOURCE_MISSING", message: `Source Map 缺少 Runtime 指令：${event.instructionId}`, sceneId: result.state.cursor.sceneId, statementId: null, statementIndex: null, instructionId: event.instructionId }]);
  }
  const visitedSceneIds = base.visitedSceneIds.includes(source.sceneId)
    ? base.visitedSceneIds
    : [...base.visitedSceneIds, source.sceneId];
  const next: FormalPreviewState = {
    ...base,
    status: event.kind === "choice" ? "waiting-choice" : event.kind === "ending" ? "ended" : "presenting",
    runtimeState: result.state,
    currentEvent: event,
    diagnostics: base.compilerWarnings.map(compilerDiagnostic),
    sceneId: source.sceneId,
    statementIndex: source.statementIndex,
    statementId: source.statementId,
    visitedStatementIds: [...base.visitedStatementIds, source.statementId],
    visitedSceneIds,
    ...(event.kind === "ending" ? { endingName: event.name } : {})
  };
  return next;
}

export function startFormalPreview(project: CanonicalProject): FormalPreviewState {
  const compiled = compileProject(project, "debug");
  if (!compiled.ok) {
    const first = compiled.diagnostics.find((item) => item.severity === "error") ?? compiled.diagnostics[0];
    const error = first === undefined ? "Project Compiler 未生成 Runtime IR" : `${first.code} · ${first.message}`;
    const diagnostics = compiled.diagnostics.map(compilerDiagnostic);
    return failed(createIdleFormalPreviewState(), error, diagnostics.length > 0 ? diagnostics : [{ origin: "compiler", severity: "error", code: "COMPILER_OUTPUT_MISSING", message: error, sceneId: null, statementId: null, statementIndex: null, instructionId: null }]);
  }
  const buildId = compiled.artifacts.manifest.buildId;
  const created = createRuntimeState(compiled.artifacts.story, {
    buildId,
    executionId: `preview.${buildId.slice(0, 24)}`,
    progressScopeId: "preview",
    initialVariables: initialVariables(project)
  });
  if (!created.ok) {
    const first = created.diagnostics[0]!;
    return failed(createIdleFormalPreviewState(), `${first.code} · ${first.message}`);
  }
  return execute({
    ...createIdleFormalPreviewState(),
    status: "presenting",
    program: compiled.artifacts.story,
    sourceMap: compiled.artifacts.sourceMap,
    runtimeState: created.state,
    compilerWarnings: compiled.diagnostics.filter((item) => item.severity === "warning"),
    diagnostics: compiled.diagnostics.filter((item) => item.severity === "warning").map(compilerDiagnostic),
    buildId
  });
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
  const current = currentSource === undefined || currentSource === null
    ? null
    : location(state, currentSource.sceneId, state.program?.scenes.find((scene) => scene.sceneId === currentSource.sceneId)?.instructions.findIndex((item) => item.instructionId === currentSource.instructionId) ?? -1, currentSource.instructionId);
  return {
    status: state.status,
    stateRevision: runtime?.stateRevision ?? null,
    logicalTimeMilliseconds: runtime?.logicalTimeMilliseconds ?? null,
    current,
    variables: Object.entries(runtime?.variables ?? {}).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([id, value]) => ({ id, type: value === null ? "null" : typeof value, value })),
    callStack: (runtime?.callStack ?? []).map((cursor, depth) => ({ ...location(state, cursor.sceneId, cursor.instructionIndex), depth })),
    diagnostics: state.diagnostics
  };
}

export function advanceFormalPreview(state: FormalPreviewState): FormalPreviewState {
  return state.status === "presenting" ? execute(state) : state;
}

export function selectFormalPreviewChoice(state: FormalPreviewState, optionId: string): FormalPreviewState {
  const pending = state.runtimeState?.pendingChoice ?? null;
  if (state.status !== "waiting-choice" || state.runtimeState === null || pending === null) return state;
  if (!pending.options.some((option) => option.optionId === optionId)) {
    return failed(state, `选择项不存在：${optionId}`);
  }
  return execute(state, {
    schemaVersion: 1,
    kind: "choiceSelected",
    inputId: `preview.input.${state.runtimeState.nextInputSequence}`,
    executionId: state.runtimeState.executionId,
    expectedStateRevision: state.runtimeState.stateRevision,
    logicalSequence: pending.logicalSequence,
    requestId: pending.requestId,
    instructionId: pending.instructionId,
    optionId
  });
}

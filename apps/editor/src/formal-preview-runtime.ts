import { compileProject, type CompilerDiagnostic, type RuntimeSourceMapV1 } from "@world-studio/project-compiler";
import {
  createRuntimeState,
  runRuntime,
  type RuntimeEventV1,
  type RuntimeInputV1,
  type RuntimeProgramV1,
  type RuntimeStateV1
} from "@world-studio/runtime";
import type { CanonicalProject, JsonValue } from "@world-studio/project-domain";

export type FormalPreviewStatus = "idle" | "presenting" | "waiting-choice" | "ended" | "error";

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

function failed(base: FormalPreviewState, error: string): FormalPreviewState {
  return { ...base, status: "error", currentEvent: null, error };
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
    return failed({ ...base, runtimeState: result.state }, `${first.code} · ${first.message}`);
  }
  const event = result.event;
  if (event === null) {
    return failed({ ...base, runtimeState: result.state }, "正式 Runtime 没有产生可呈现事件");
  }
  const source = base.sourceMap.entries.find((entry) => entry.instructionId === event.instructionId);
  if (source === undefined) {
    return failed({ ...base, runtimeState: result.state }, `Source Map 缺少 Runtime 指令：${event.instructionId}`);
  }
  const visitedSceneIds = base.visitedSceneIds.includes(source.sceneId)
    ? base.visitedSceneIds
    : [...base.visitedSceneIds, source.sceneId];
  const next: FormalPreviewState = {
    ...base,
    status: event.kind === "choice" ? "waiting-choice" : event.kind === "ending" ? "ended" : "presenting",
    runtimeState: result.state,
    currentEvent: event,
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
    return failed(createIdleFormalPreviewState(), first === undefined
      ? "Project Compiler 未生成 Runtime IR"
      : `${first.code} · ${first.message}`);
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
    buildId
  });
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

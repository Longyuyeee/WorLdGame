import type { RuntimeStoryIrV1 } from "@world-studio/project-compiler";

export const RUNTIME_VERSION = "0.1.0" as const;
export const RUNTIME_STATE_SCHEMA_VERSION = 1 as const;
export const MAX_CALL_STACK_DEPTH = 64;
export const DEFAULT_INSTRUCTION_BUDGET = 1024;

export type RuntimeScalar = null | boolean | number | string;

export interface RuntimeCursorV1 {
  readonly sceneId: string;
  readonly instructionIndex: number;
}

export interface RuntimeChoiceOptionV1 {
  readonly optionId: string;
  readonly label: string;
  readonly targetSceneId: string;
}

export interface RuntimePendingChoiceV1 {
  readonly instructionId: string;
  readonly sceneId: string;
  readonly instructionIndex: number;
  readonly prompt: string;
  readonly options: readonly RuntimeChoiceOptionV1[];
}

export interface RuntimeStateV1 {
  readonly schemaVersion: typeof RUNTIME_STATE_SCHEMA_VERSION;
  readonly runtimeVersion: typeof RUNTIME_VERSION;
  readonly irVersion: "1.0.0";
  readonly projectId: string;
  readonly buildId: string;
  readonly executionId: string;
  readonly stateRevision: number;
  readonly cursor: RuntimeCursorV1;
  readonly callStack: readonly RuntimeCursorV1[];
  readonly variables: Readonly<Record<string, RuntimeScalar>>;
  readonly logicalTimeMilliseconds: number;
  readonly pendingChoice: RuntimePendingChoiceV1 | null;
  readonly terminal: { readonly kind: "running" } | { readonly kind: "ended"; readonly endingId: string; readonly name: string };
}

export interface CreateRuntimeOptionsV1 {
  readonly buildId: string;
  readonly executionId: string;
  readonly initialVariables?: Readonly<Record<string, RuntimeScalar>>;
}

export interface RuntimeChoiceInputV1 {
  readonly kind: "choiceSelected";
  readonly expectedStateRevision: number;
  readonly instructionId: string;
  readonly optionId: string;
}

export type RuntimeInputV1 = RuntimeChoiceInputV1;

export type RuntimeEventV1 =
  | { readonly kind: "dialogue"; readonly instructionId: string; readonly speakerId: string; readonly textId: string; readonly text: string }
  | { readonly kind: "narration"; readonly instructionId: string; readonly textId: string; readonly text: string }
  | { readonly kind: "direction"; readonly instructionId: string; readonly command: string; readonly parameters: Readonly<Record<string, unknown>> }
  | { readonly kind: "choice"; readonly instructionId: string; readonly prompt: string; readonly options: readonly RuntimeChoiceOptionV1[] }
  | { readonly kind: "wait"; readonly instructionId: string; readonly durationMilliseconds: number }
  | { readonly kind: "ending"; readonly instructionId: string; readonly endingId: string; readonly name: string };

export type RuntimeDiagnosticCode =
  | "RUNTIME_INVALID_IR"
  | "RUNTIME_INCOMPATIBLE_IR"
  | "RUNTIME_INVALID_STATE"
  | "RUNTIME_MISSING_SCENE"
  | "RUNTIME_FALLTHROUGH"
  | "RUNTIME_MISSING_LABEL"
  | "RUNTIME_CALL_STACK_OVERFLOW"
  | "RUNTIME_CALL_STACK_UNDERFLOW"
  | "RUNTIME_VARIABLE_MISSING"
  | "RUNTIME_EXPRESSION_INVALID"
  | "RUNTIME_TYPE_MISMATCH"
  | "RUNTIME_CHOICE_REQUIRED"
  | "RUNTIME_CHOICE_MISMATCH"
  | "RUNTIME_INPUT_STALE"
  | "RUNTIME_BUDGET_EXCEEDED"
  | "RUNTIME_TERMINAL";

export interface RuntimeDiagnosticV1 {
  readonly code: RuntimeDiagnosticCode;
  readonly message: string;
  readonly sceneId: string | null;
  readonly instructionId: string | null;
}

export type CreateRuntimeResultV1 =
  | { readonly ok: true; readonly state: RuntimeStateV1 }
  | { readonly ok: false; readonly diagnostics: readonly RuntimeDiagnosticV1[] };

export interface RuntimeRunOptionsV1 {
  readonly input?: RuntimeInputV1;
  readonly instructionBudget?: number;
}

export interface RuntimeRunResultV1 {
  readonly state: RuntimeStateV1;
  readonly event: RuntimeEventV1 | null;
  readonly executedInstructions: number;
  readonly diagnostics: readonly RuntimeDiagnosticV1[];
}

export type RuntimeProgramV1 = RuntimeStoryIrV1;

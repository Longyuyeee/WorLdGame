import type { RuntimeStoryIrV1 } from "@world-studio/project-compiler";

export const RUNTIME_VERSION = "0.2.0" as const;
export const RUNTIME_STATE_SCHEMA_VERSION = 1 as const;
export const MAX_CALL_STACK_DEPTH = 64;
export const MAX_META_PROGRESS_IDS_PER_DOMAIN = 100_000;
export const DEFAULT_INSTRUCTION_BUDGET = 1024;
export const DEFAULT_PRNG_SEED = 0x6d2b79f5;

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

export interface RuntimePrngStateV1 {
  readonly algorithm: "xorshift32-v1";
  readonly state: number;
  readonly draws: number;
}

export interface RuntimeCharacterStateV1 {
  readonly assetId: string;
  readonly expression: string | null;
}

export interface RuntimeSceneStateV1 {
  readonly backgroundAssetId: string | null;
  readonly characters: Readonly<Record<string, RuntimeCharacterStateV1>>;
}

export interface RuntimeAudioTrackStateV1 {
  readonly assetId: string;
  readonly status: "playing" | "paused";
  readonly loop: boolean;
  readonly volumePermille: number;
}

export interface RuntimeAudioStateV1 {
  readonly tracks: Readonly<Record<string, RuntimeAudioTrackStateV1>>;
}

export interface RuntimeMetaProgressV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly progressScopeId: string;
  readonly readTextIds: readonly string[];
  readonly unlockedGalleryAssetIds: readonly string[];
  readonly reachedEndingIds: readonly string[];
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
  readonly prng: RuntimePrngStateV1;
  readonly logicalTimeMilliseconds: number;
  readonly sceneState: RuntimeSceneStateV1;
  readonly audioState: RuntimeAudioStateV1;
  readonly metaProgress: RuntimeMetaProgressV1;
  readonly pendingChoice: RuntimePendingChoiceV1 | null;
  readonly terminal: { readonly kind: "running" } | { readonly kind: "ended"; readonly endingId: string; readonly name: string };
}

export interface CreateRuntimeOptionsV1 {
  readonly buildId: string;
  readonly executionId: string;
  readonly initialVariables?: Readonly<Record<string, RuntimeScalar>>;
  readonly prngSeed?: number;
  readonly progressScopeId?: string;
}

export interface RuntimeRandomDrawRequestV1 {
  readonly expectedStateRevision: number;
  readonly minimum: number;
  readonly maximum: number;
}

export type RuntimeRandomDrawResultV1 =
  | { readonly ok: true; readonly state: RuntimeStateV1; readonly value: number }
  | { readonly ok: false; readonly state: RuntimeStateV1; readonly diagnostics: readonly RuntimeDiagnosticV1[] };

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

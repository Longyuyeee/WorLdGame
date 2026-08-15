import type { RuntimeStoryIrV1 } from "@world-studio/project-compiler";

export const RUNTIME_VERSION = "0.5.0" as const;
export const RUNTIME_STATE_SCHEMA_VERSION = 1 as const;
export const RUNTIME_SAVE_SCHEMA_VERSION = 1 as const;
export const MAX_RUNTIME_SAVE_BYTES = 16 * 1024 * 1024;
export const MAX_CALL_STACK_DEPTH = 64;
export const MAX_META_PROGRESS_IDS_PER_DOMAIN = 100_000;
export const DEFAULT_INSTRUCTION_BUDGET = 1024;
export const DEFAULT_PRNG_SEED = 0x6d2b79f5;
export const MAX_INPUT_RECEIPTS = 10_000;
export const MAX_RUNTIME_HISTORY_ENTRIES = 10_000;

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
  readonly requestId: string;
  readonly expectedStateRevision: number;
  readonly logicalSequence: number;
  readonly instructionId: string;
  readonly sceneId: string;
  readonly instructionIndex: number;
  readonly prompt: string;
  readonly options: readonly RuntimeChoiceOptionV1[];
}

export type RuntimeEffectPolicyV1 = "pure" | "reversible" | "barrier";
export type RuntimeEffectAwaitModeV1 = "detached" | "awaited";

export interface RuntimeEffectCompensationV1 {
  readonly kind: string;
  readonly payload: Readonly<Record<string, RuntimeScalar>>;
}

export interface RuntimeEffectIntentV1 {
  readonly effectId: string;
  readonly executionId: string;
  readonly originatingRevision: number;
  readonly logicalSequence: number;
  readonly descriptorId: string;
  readonly channel: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, RuntimeScalar>>;
  readonly policy: RuntimeEffectPolicyV1;
  readonly awaitMode: RuntimeEffectAwaitModeV1;
  readonly cancellationScope: string;
  readonly replayKey: string;
  readonly compensation: RuntimeEffectCompensationV1 | null;
}

export interface RuntimePendingBarrierV1 {
  readonly requestId: string;
  readonly executionId: string;
  readonly expectedStateRevision: number;
  readonly logicalSequence: number;
  readonly instructionId: string;
  readonly descriptorId: string;
  readonly reason: string;
}

export interface RuntimeBarrierRecordV1 {
  readonly effectId: string;
  readonly descriptorId: string;
  readonly reason: string;
  readonly committedAtRevision: number;
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
  readonly pendingEffect: RuntimeEffectIntentV1 | null;
  readonly pendingBarrier: RuntimePendingBarrierV1 | null;
  readonly nextEffectSequence: number;
  readonly nextInputSequence: number;
  readonly inputReceipts: readonly RuntimeInputReceiptV1[];
  readonly barrierLedger: readonly RuntimeBarrierRecordV1[];
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
  readonly schemaVersion: 1;
  readonly kind: "choiceSelected";
  readonly inputId: string;
  readonly executionId: string;
  readonly expectedStateRevision: number;
  readonly logicalSequence: number;
  readonly requestId: string;
  readonly instructionId: string;
  readonly optionId: string;
}

export interface RuntimeEffectCompletedInputV1 {
  readonly schemaVersion: 1;
  readonly kind: "effectCompleted";
  readonly inputId: string;
  readonly executionId: string;
  readonly expectedStateRevision: number;
  readonly logicalSequence: number;
  readonly effectId: string;
  readonly replayKey: string;
}

export interface RuntimeEffectCancelledInputV1 {
  readonly schemaVersion: 1;
  readonly kind: "effectCancelled";
  readonly inputId: string;
  readonly executionId: string;
  readonly expectedStateRevision: number;
  readonly logicalSequence: number;
  readonly effectId: string;
  readonly cancellationScope: string;
}

export interface RuntimeBarrierApprovedInputV1 {
  readonly schemaVersion: 1;
  readonly kind: "barrierApproved";
  readonly inputId: string;
  readonly executionId: string;
  readonly expectedStateRevision: number;
  readonly logicalSequence: number;
  readonly requestId: string;
  readonly descriptorId: string;
}

export type RuntimeInputV1 = RuntimeChoiceInputV1 | RuntimeEffectCompletedInputV1 | RuntimeEffectCancelledInputV1 | RuntimeBarrierApprovedInputV1;

export interface RuntimeInputReceiptV1 {
  readonly input: RuntimeInputV1;
  readonly acceptedAtRevision: number;
}

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
  | "RUNTIME_INPUT_UNEXPECTED"
  | "RUNTIME_INPUT_OUT_OF_ORDER"
  | "RUNTIME_INPUT_MISMATCH"
  | "RUNTIME_INPUT_ID_CONFLICT"
  | "RUNTIME_INPUT_RECEIPT_LIMIT"
  | "RUNTIME_EFFECT_REQUIRED"
  | "RUNTIME_EFFECT_CANCELLED"
  | "RUNTIME_BARRIER_REQUIRED"
  | "RUNTIME_SAVE_INVALID"
  | "RUNTIME_SAVE_INCOMPATIBLE"
  | "RUNTIME_SAVE_BUILD_MISMATCH"
  | "RUNTIME_SAVE_HASH_MISMATCH"
  | "RUNTIME_HISTORY_INVALID"
  | "RUNTIME_HISTORY_AT_START"
  | "RUNTIME_HISTORY_AT_END"
  | "RUNTIME_HISTORY_FORWARD_REQUIRED"
  | "RUNTIME_HISTORY_LIMIT"
  | "RUNTIME_BARRIER_BLOCKED"
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
  readonly effects: readonly RuntimeEffectIntentV1[];
  readonly barrierRequest: RuntimePendingBarrierV1 | null;
}

export type RuntimeProgramV1 = RuntimeStoryIrV1;

export interface RuntimeSaveV1 {
  readonly schemaVersion: typeof RUNTIME_SAVE_SCHEMA_VERSION;
  readonly format: "world.runtime-save";
  readonly runtimeVersion: typeof RUNTIME_VERSION;
  readonly irVersion: "1.0.0";
  readonly projectId: string;
  readonly buildId: string;
  readonly stateRevision: number;
  readonly stateHash: string;
  readonly state: RuntimeStateV1;
}

export type RuntimeRehydrationV1 =
  | { readonly kind: "ready" }
  | { readonly kind: "choice"; readonly request: RuntimePendingChoiceV1 }
  | { readonly kind: "effect"; readonly intent: RuntimeEffectIntentV1 }
  | { readonly kind: "barrier"; readonly request: RuntimePendingBarrierV1 }
  | { readonly kind: "terminal"; readonly terminal: Extract<RuntimeStateV1["terminal"], { readonly kind: "ended" }> };

export type CreateRuntimeSaveResultV1 =
  | { readonly ok: true; readonly save: RuntimeSaveV1; readonly serialized: string; readonly artifactHash: string }
  | { readonly ok: false; readonly diagnostics: readonly RuntimeDiagnosticV1[] };

export interface LoadRuntimeSaveOptionsV1 {
  readonly expectedBuildId: string;
}

export type LoadRuntimeSaveResultV1 =
  | { readonly ok: true; readonly save: RuntimeSaveV1; readonly state: RuntimeStateV1; readonly rehydration: RuntimeRehydrationV1; readonly artifactHash: string }
  | { readonly ok: false; readonly diagnostics: readonly RuntimeDiagnosticV1[] };

export interface RuntimeHistoryCheckpointV1 {
  readonly checkpointId: string;
  readonly stateHash: string;
  readonly state: RuntimeStateV1;
}

export interface RuntimeHistoryEntryV1 {
  readonly entryId: string;
  readonly historyIndex: number;
  readonly beforeCheckpointId: string;
  readonly afterCheckpointId: string;
  readonly input: RuntimeInputV1 | null;
  readonly event: RuntimeEventV1 | null;
  readonly effects: readonly RuntimeEffectIntentV1[];
  readonly executedInstructions: number;
  readonly barriers: readonly RuntimeBarrierRecordV1[];
}

export interface RuntimeHistorySessionV1 {
  readonly schemaVersion: 1;
  readonly runtimeVersion: typeof RUNTIME_VERSION;
  readonly irVersion: "1.0.0";
  readonly projectId: string;
  readonly buildId: string;
  readonly executionId: string;
  readonly cursor: number;
  readonly checkpoints: readonly RuntimeHistoryCheckpointV1[];
  readonly entries: readonly RuntimeHistoryEntryV1[];
  readonly inputTombstones: readonly RuntimeInputV1[];
}

export interface RuntimeHistoryResultV1 {
  readonly session: RuntimeHistorySessionV1;
  readonly state: RuntimeStateV1;
  readonly event: RuntimeEventV1 | null;
  readonly effects: readonly RuntimeEffectIntentV1[];
  readonly diagnostics: readonly RuntimeDiagnosticV1[];
  readonly reconciliationRequired: boolean;
  readonly barrierBlock: RuntimeBarrierRecordV1 | null;
}

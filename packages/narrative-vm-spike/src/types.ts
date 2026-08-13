export type VmScalarV0 = null | boolean | number | string;

export const MAX_CALL_STACK_DEPTH_V0 = 64;
export const MAX_INPUT_RECEIPTS_V0 = 1024;
export const MAX_HISTORY_ENTRIES_V0 = 256;

export type ComparisonOperatorV0 = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";

export interface ComparisonV0 {
  readonly variableId: string;
  readonly operator: ComparisonOperatorV0;
  readonly value: VmScalarV0;
}

interface InstructionBaseV0 {
  readonly ip: number;
  readonly sourceStatementId: string;
  readonly stepBoundary: boolean;
  readonly effectClass: "none" | EffectPolicyV0;
  readonly stopPoint: boolean;
}

export interface SetInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "set";
  readonly operands: {
    readonly variableId: string;
    readonly value: VmScalarV0;
  };
}

export interface AddInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "add";
  readonly operands: {
    readonly variableId: string;
    readonly value: number;
  };
}

export interface JumpInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "jump";
  readonly operands: { readonly targetIp: number };
}

export interface JumpIfInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "jumpIf";
  readonly operands: {
    readonly condition: ComparisonV0;
    readonly trueIp: number;
    readonly falseIp: number;
  };
}

export interface CallInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "call";
  readonly operands: { readonly targetIp: number };
}

export interface ReturnInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "return";
  readonly operands: Readonly<Record<string, never>>;
}

export interface RandomInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "random";
  readonly operands: {
    readonly variableId: string;
    readonly min: number;
    readonly max: number;
  };
}

export interface WaitInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "wait";
  readonly operands: { readonly durationTicks: number };
}

export interface ChoiceInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "choice";
  readonly operands: {
    readonly choiceId: string;
    readonly promptStepId: string;
    readonly commitStepId: string;
    readonly options: readonly {
      readonly optionId: string;
      readonly targetIp: number;
    }[];
  };
}

export type EffectPolicyV0 = "pure" | "reversible" | "barrier";
export type EffectAwaitModeV0 = "detached" | "awaited";

export interface EffectCompensationV0 {
  readonly kind: string;
  readonly payload: Readonly<Record<string, VmScalarV0>>;
}

export interface EmitInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "emit";
  readonly operands: {
    readonly descriptorId: string;
    readonly requestStepId: string | null;
    readonly issueStepId: string;
    readonly completeStepId: string;
    readonly channel: string;
    readonly kind: string;
    readonly payload: Readonly<Record<string, VmScalarV0>>;
    readonly policy: EffectPolicyV0;
    readonly awaitMode: EffectAwaitModeV0;
    readonly cancellationScope: string;
    readonly replayKey: string;
    readonly compensation: EffectCompensationV0 | null;
    readonly barrierReason: string | null;
  };
}

export interface CheckpointInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "checkpoint";
  readonly operands: { readonly stepId: string };
}

export interface EndInstructionV0 extends InstructionBaseV0 {
  readonly opcode: "end";
  readonly operands: { readonly endingId: string };
}

export type InstructionV0 =
  | SetInstructionV0
  | AddInstructionV0
  | JumpInstructionV0
  | JumpIfInstructionV0
  | CallInstructionV0
  | ReturnInstructionV0
  | RandomInstructionV0
  | WaitInstructionV0
  | ChoiceInstructionV0
  | EmitInstructionV0
  | CheckpointInstructionV0
  | EndInstructionV0;

export interface ProgramV0 {
  readonly irVersion: 0;
  readonly projectId: string;
  readonly buildId: string;
  readonly entryIp: number;
  readonly instructions: readonly InstructionV0[];
  readonly sourceMap: Readonly<Record<string, string>>;
  readonly opcodeRegistryDigest: string;
}

export interface PendingChoiceRequestV0 {
  readonly requestId: string;
  readonly executionId: string;
  readonly expectedRevision: number;
  readonly logicalSequence: number;
  readonly kind: "choice";
  readonly choiceId: string;
  readonly commitStepId: string;
  readonly options: readonly {
    readonly optionId: string;
    readonly targetIp: number;
  }[];
}

export interface PendingBarrierRequestV0 {
  readonly requestId: string;
  readonly executionId: string;
  readonly expectedRevision: number;
  readonly logicalSequence: number;
  readonly kind: "barrierApproval";
  readonly descriptorId: string;
  readonly reason: string;
}

export type PendingRequestV0 = PendingChoiceRequestV0 | PendingBarrierRequestV0;

export interface ChoiceSelectedInputV0 {
  readonly schemaVersion: 0;
  readonly kind: "choiceSelected";
  readonly inputId: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly logicalSequence: number;
  readonly choiceId: string;
  readonly optionId: string;
}

export interface BarrierApprovedInputV0 {
  readonly schemaVersion: 0;
  readonly kind: "barrierApproved";
  readonly inputId: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly logicalSequence: number;
  readonly descriptorId: string;
}

export interface EffectCompletedInputV0 {
  readonly schemaVersion: 0;
  readonly kind: "effectCompleted";
  readonly inputId: string;
  readonly executionId: string;
  readonly effectId: string;
  readonly expectedRevision: number;
  readonly logicalSequence: number;
  readonly replayKey: string;
}

export interface EffectCancelledInputV0 {
  readonly schemaVersion: 0;
  readonly kind: "effectCancelled";
  readonly inputId: string;
  readonly executionId: string;
  readonly effectId: string;
  readonly expectedRevision: number;
  readonly logicalSequence: number;
  readonly cancellationScope: string;
}

export type ExternalInputV0 =
  | ChoiceSelectedInputV0
  | BarrierApprovedInputV0
  | EffectCompletedInputV0
  | EffectCancelledInputV0;

export interface EffectIntentV0 {
  readonly effectId: string;
  readonly executionId: string;
  readonly originatingRevision: number;
  readonly logicalSequence: number;
  readonly descriptorId: string;
  readonly channel: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, VmScalarV0>>;
  readonly policy: EffectPolicyV0;
  readonly awaitMode: EffectAwaitModeV0;
  readonly cancellationScope: string;
  readonly replayKey: string;
  readonly compensation: EffectCompensationV0 | null;
}

export interface EffectCancellationV0 {
  readonly effectId: string;
  readonly executionId: string;
  readonly cancellationScope: string;
  readonly reason: "back" | "forward" | "fork";
}

export interface BarrierRecordV0 {
  readonly effectId: string;
  readonly descriptorId: string;
  readonly reason: string;
  readonly committedAtRevision: number;
}

export interface InitialStateOptionsV0 {
  readonly executionId: string;
  readonly prngSeed?: number;
}

export interface InputReceiptV0 {
  readonly input: ExternalInputV0;
  readonly acceptedAtRevision: number;
}

export interface HistoryCheckpointV0 {
  readonly checkpointId: string;
  readonly stateHash: string;
  readonly state: RuntimeStateV0;
}

export interface HistoryEntryV0 {
  readonly historyIndex: number;
  readonly stepId: string;
  readonly sourceStatementId: string;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly beforeCheckpointId: string;
  readonly afterCheckpointId: string;
  readonly input: ExternalInputV0 | null;
  readonly effects: readonly EffectIntentV0[];
  readonly barrier: BarrierRecordV0 | null;
}

export interface RuntimeSessionV0 {
  readonly schemaVersion: 0;
  readonly buildId: string;
  readonly executionId: string;
  readonly state: RuntimeStateV0;
  readonly entries: readonly HistoryEntryV0[];
  readonly checkpoints: readonly HistoryCheckpointV0[];
  readonly inputTombstones: readonly ExternalInputV0[];
}

export interface RuntimeStateV0 {
  readonly schemaVersion: 0;
  readonly buildId: string;
  readonly executionId: string;
  readonly ip: number;
  readonly stateRevision: number;
  readonly stepId: string | null;
  readonly callStack: readonly number[];
  readonly variables: Readonly<Record<string, VmScalarV0>>;
  readonly prng: {
    readonly algorithm: "xorshift32-v0";
    readonly state: number;
    readonly draws: number;
  };
  readonly logicalClock: number;
  readonly sceneState: {
    readonly backgroundId: string | null;
    readonly characters: Readonly<Record<string, string>>;
  };
  readonly audioLogic: {
    readonly tracks: Readonly<Record<string, {
      readonly assetId: string;
      readonly positionTicks: number;
      readonly loop: boolean;
      readonly volumePermille: number;
    }>>;
  };
  readonly pendingRequests: readonly PendingRequestV0[];
  readonly pendingEffects: readonly EffectIntentV0[];
  readonly nextInputSequence: number;
  readonly nextEffectSequence: number;
  readonly inputReceipts: readonly InputReceiptV0[];
  readonly readSession: readonly string[];
  readonly historyCursor: number;
  readonly terminal:
    | { readonly kind: "running" }
    | { readonly kind: "ended"; readonly endingId: string };
}

export type VmDiagnosticCode =
  | "VM_INVALID_PROGRAM"
  | "VM_INVALID_STATE"
  | "VM_TERMINAL"
  | "VM_FALLTHROUGH_PAST_END"
  | "VM_VARIABLE_MISSING"
  | "VM_TYPE_MISMATCH"
  | "VM_INTEGER_OVERFLOW"
  | "VM_CALL_STACK_OVERFLOW"
  | "VM_CALL_STACK_UNDERFLOW"
  | "VM_RANDOM_RANGE_INVALID"
  | "VM_INPUT_REQUIRED"
  | "VM_INPUT_UNEXPECTED"
  | "VM_INPUT_MISMATCH"
  | "VM_INPUT_OUT_OF_ORDER"
  | "VM_INPUT_ID_CONFLICT"
  | "VM_CHOICE_OPTION_INVALID"
  | "VM_INPUT_RECEIPT_LIMIT"
  | "VM_EFFECT_REQUIRED"
  | "VM_EFFECT_MISMATCH"
  | "VM_EFFECT_CANCELLED"
  | "VM_BARRIER_BLOCKED"
  | "VM_HISTORY_INVALID"
  | "VM_HISTORY_AT_START"
  | "VM_HISTORY_AT_END"
  | "VM_HISTORY_FORWARD_REQUIRED"
  | "VM_HISTORY_LIMIT"
  | "VM_HISTORY_NO_BOUNDARY"
  | "VM_HISTORY_WAIT_REQUIRED";

export interface VmDiagnostic {
  readonly code: VmDiagnosticCode;
  readonly ip: number | null;
  readonly sourceStatementId: string | null;
  readonly detail: string;
}

export interface VmCheckpointV0 {
  readonly stepId: string;
  readonly stateRevision: number;
  readonly stateHash: string;
}

export interface TransitionResultV0 {
  readonly nextState: RuntimeStateV0;
  readonly effects: readonly EffectIntentV0[];
  readonly checkpoint: VmCheckpointV0 | null;
  readonly wait: {
    readonly durationTicks: number;
    readonly resumeAtTick: number;
  } | null;
  readonly request: PendingRequestV0 | null;
  readonly diagnostics: readonly VmDiagnostic[];
}

export interface HistoryResultV0 {
  readonly session: RuntimeSessionV0;
  readonly effects: readonly EffectIntentV0[];
  readonly cancellations: readonly EffectCancellationV0[];
  readonly diagnostics: readonly VmDiagnostic[];
}

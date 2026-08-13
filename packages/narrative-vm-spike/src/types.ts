export type VmScalarV0 = null | boolean | number | string;

export const MAX_CALL_STACK_DEPTH_V0 = 64;

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
  readonly effectClass: "none";
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

export interface PendingRequestV0 {
  readonly requestId: string;
  readonly executionId: string;
  readonly originatingRevision: number;
  readonly kind: string;
}

export interface RuntimeStateV0 {
  readonly schemaVersion: 0;
  readonly buildId: string;
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
  | "VM_RANDOM_RANGE_INVALID";

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
  readonly effects: readonly never[];
  readonly checkpoint: VmCheckpointV0 | null;
  readonly wait: {
    readonly durationTicks: number;
    readonly resumeAtTick: number;
  } | null;
  readonly diagnostics: readonly VmDiagnostic[];
}

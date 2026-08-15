import type { JsonObject, JsonValue } from "@world-studio/project-domain";

export const PROJECT_COMPILER_VERSION = "0.1.0" as const;
export const RUNTIME_IR_VERSION = "1.0.0" as const;

export type CompileProfile = "debug" | "release";
export type CompilerDiagnosticSeverity = "error" | "warning";
export type CompilerDiagnosticCode =
  | "MISSING_ENTRY_SCENE"
  | "MISSING_SCRIPT"
  | "INVALID_STATEMENT"
  | "MISSING_SPEAKER"
  | "MISSING_TARGET_SCENE"
  | "DUPLICATE_LABEL"
  | "MISSING_LABEL"
  | "MISSING_VARIABLE"
  | "INVALID_EXPRESSION"
  | "TYPE_MISMATCH"
  | "INVALID_WAIT_DURATION"
  | "MISSING_ASSET"
  | "INVALID_ASSET"
  | "UNREACHABLE_SCENE"
  | "SCENE_NO_EXIT"
  | "NO_REACHABLE_ENDING";

export interface CompilerDiagnostic {
  readonly severity: CompilerDiagnosticSeverity;
  readonly code: CompilerDiagnosticCode;
  readonly message: string;
  readonly sceneId?: string;
  readonly statementId?: string;
  readonly entityId?: string;
}

export type RuntimeOpcodeV1 =
  | "dialogue"
  | "narration"
  | "direction"
  | "choice"
  | "label"
  | "jump"
  | "call"
  | "return"
  | "set"
  | "condition"
  | "wait"
  | "end";

export interface RuntimeInstructionV1 {
  readonly instructionId: string;
  readonly opcode: RuntimeOpcodeV1;
  readonly operands: JsonObject;
}

export interface RuntimeSceneV1 {
  readonly sceneId: string;
  readonly instructions: readonly RuntimeInstructionV1[];
}

export interface RuntimeStoryIrV1 {
  readonly schemaVersion: 1;
  readonly irVersion: typeof RUNTIME_IR_VERSION;
  readonly projectId: string;
  readonly entrySceneId: string;
  readonly scenes: readonly RuntimeSceneV1[];
}

export interface SourceMapEntryV1 {
  readonly instructionId: string;
  readonly sceneId: string;
  readonly statementId: string;
  readonly statementIndex: number;
}

export interface RuntimeSourceMapV1 {
  readonly schemaVersion: 1;
  readonly irVersion: typeof RUNTIME_IR_VERSION;
  readonly entries: readonly SourceMapEntryV1[];
}

export interface RuntimeAssetManifestV1 {
  readonly schemaVersion: 1;
  readonly assets: readonly JsonObject[];
}

export interface RuntimeCatalogsV1 {
  readonly schemaVersion: 1;
  readonly endings: readonly { readonly endingId: string; readonly name: string; readonly sceneId: string }[];
  readonly localization: readonly JsonObject[];
}

export interface RuntimeBuildManifestV1 {
  readonly schemaVersion: 1;
  readonly compilerVersion: typeof PROJECT_COMPILER_VERSION;
  readonly irVersion: typeof RUNTIME_IR_VERSION;
  readonly profile: CompileProfile;
  readonly projectId: string;
  readonly sourceHash: string;
  readonly buildId: string;
  readonly entrySceneId: string;
  readonly artifacts: Readonly<Record<string, string>>;
}

export interface CompilerArtifactsV1 {
  readonly manifest: RuntimeBuildManifestV1;
  readonly story: RuntimeStoryIrV1;
  readonly sourceMap: RuntimeSourceMapV1;
  readonly assetManifest: RuntimeAssetManifestV1;
  readonly catalogs: RuntimeCatalogsV1;
  readonly files: Readonly<Record<string, string>>;
}

export type CompileProjectResult =
  | { readonly ok: true; readonly diagnostics: readonly CompilerDiagnostic[]; readonly artifacts: CompilerArtifactsV1 }
  | { readonly ok: false; readonly diagnostics: readonly CompilerDiagnostic[] };

export type RuntimeOperandValue = JsonValue;

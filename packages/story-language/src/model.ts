import type { EntityId } from "@world-studio/story-core";

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

interface SyntaxNodeBase {
  readonly range: SourceRange;
}

export interface BlankNode extends SyntaxNodeBase {
  readonly kind: "blank";
}

export interface CommentNode extends SyntaxNodeBase {
  readonly kind: "comment";
  readonly raw: string;
}

export interface SceneNode extends SyntaxNodeBase {
  readonly kind: "scene";
  readonly titleRaw: string;
  readonly id?: EntityId;
  readonly trailingMetadata: string;
}

export interface DirectiveNode extends SyntaxNodeBase {
  readonly kind: "directive";
  readonly command: "background" | "show" | "camera" | "audio";
  readonly id?: EntityId;
  readonly argumentsRaw: string;
}

export interface DialogueNode extends SyntaxNodeBase {
  readonly kind: "dialogue";
  readonly speakerId: EntityId;
  readonly statementId?: EntityId;
  readonly textRaw: string;
  readonly textId?: EntityId;
  readonly trailingMetadata: string;
}

export interface NarrationNode extends SyntaxNodeBase {
  readonly kind: "narration";
  readonly statementId?: EntityId;
  readonly textRaw: string;
  readonly textId?: EntityId;
  readonly trailingMetadata: string;
}

export interface ChoiceNode extends SyntaxNodeBase {
  readonly kind: "choice";
  readonly promptRaw: string;
  readonly id?: EntityId;
  readonly trailingMetadata: string;
}

export interface ChoiceOptionNode extends SyntaxNodeBase {
  readonly kind: "choice-option";
  readonly labelRaw: string;
  readonly targetLabel: string;
  readonly id?: EntityId;
  readonly trailingMetadata: string;
}

export interface LabelNode extends SyntaxNodeBase {
  readonly kind: "label";
  readonly name: string;
  readonly id?: EntityId;
  readonly trailingMetadata: string;
}

export interface SetNode extends SyntaxNodeBase {
  readonly kind: "set";
  readonly variable: string;
  readonly expressionRaw: string;
  readonly id?: EntityId;
  readonly trailingMetadata: string;
}

export interface JumpNode extends SyntaxNodeBase { readonly kind:"jump";readonly targetLabel:string;readonly id?:EntityId;readonly trailingMetadata:string; }
export interface CallNode extends SyntaxNodeBase { readonly kind:"call";readonly targetLabel:string;readonly id?:EntityId;readonly trailingMetadata:string; }
export interface ReturnNode extends SyntaxNodeBase { readonly kind:"return";readonly id?:EntityId;readonly trailingMetadata:string; }
export interface ConditionNode extends SyntaxNodeBase { readonly kind:"condition";readonly expressionRaw:string;readonly targetLabel:string;readonly id?:EntityId;readonly trailingMetadata:string; }
export interface WaitNode extends SyntaxNodeBase { readonly kind:"wait";readonly durationRaw:string;readonly id?:EntityId;readonly trailingMetadata:string; }

export interface EndNode extends SyntaxNodeBase {
  readonly kind: "end";
  readonly nameRaw: string;
  readonly id?: EntityId;
  readonly trailingMetadata: string;
}

export interface OpaqueNode extends SyntaxNodeBase {
  readonly kind: "opaque";
  readonly raw: string;
  readonly reason: "unknown-command" | "unrecognized-syntax";
}

export type StorySyntaxNode =
  | BlankNode
  | CommentNode
  | SceneNode
  | DirectiveNode
  | DialogueNode
  | NarrationNode
  | ChoiceNode
  | ChoiceOptionNode
  | LabelNode
  | SetNode
  | JumpNode
  | CallNode
  | ReturnNode
  | ConditionNode
  | WaitNode
  | EndNode
  | OpaqueNode;

export type StoryDiagnosticCode =
  | "MISSING_SCENE_HEADER"
  | "MALFORMED_SCENE"
  | "MALFORMED_CHOICE"
  | "MALFORMED_CHOICE_OPTION"
  | "MALFORMED_END"
  | "MALFORMED_DIRECTIVE"
  | "MALFORMED_LABEL"
  | "MALFORMED_SET"
  | "MALFORMED_NARRATION"
  | "MALFORMED_FLOW"
  | "MALFORMED_CONDITION"
  | "MALFORMED_WAIT"
  | "MALFORMED_ID"
  | "DUPLICATE_ID"
  | "UNRECOGNIZED_SYNTAX";

export interface StoryDiagnostic {
  readonly code: StoryDiagnosticCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly range: SourceRange;
}

export interface StoryDocument {
  readonly languageVersion: 0;
  readonly nodes: readonly StorySyntaxNode[];
  readonly diagnostics: readonly StoryDiagnostic[];
}

export type SemanticStoryNode = Omit<StorySyntaxNode, "range">;

export interface StorySemanticSnapshot {
  readonly languageVersion: 0;
  readonly nodes: readonly SemanticStoryNode[];
}

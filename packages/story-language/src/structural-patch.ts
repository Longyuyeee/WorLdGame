import type { EntityId } from "@world-studio/story-core";
import { semanticSnapshot } from "./formatter";
import type { DialogueNode, StoryDocument, StorySyntaxNode } from "./model";
import { parseStory } from "./parser";

export type StructuralPatchErrorCode =
  | "STRUCTURAL_SOURCE_ERROR"
  | "STRUCTURAL_SOURCE_MISMATCH"
  | "STRUCTURAL_ANCHOR_NOT_FOUND"
  | "STRUCTURAL_TARGET_NOT_FOUND"
  | "STRUCTURAL_TARGET_NOT_DIALOGUE"
  | "STRUCTURAL_DUPLICATE_ID"
  | "STRUCTURAL_INVALID_IDENTIFIER"
  | "STRUCTURAL_TEXT_UNREPRESENTABLE"
  | "STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED"
  | "STRUCTURAL_SELF_MOVE";

export interface StructuralPatchError {
  readonly code: StructuralPatchErrorCode;
  readonly message: string;
}

export interface InsertDialogueRequest {
  readonly afterId: EntityId;
  readonly statementId: EntityId;
  readonly textId: EntityId;
  readonly speakerId: EntityId;
  readonly text: string;
}

export interface DialogueTombstone {
  readonly kind: "dialogue";
  readonly statementId: EntityId;
  readonly textId: EntityId;
  readonly speakerId: EntityId;
  readonly text: string;
  readonly rawLine: string;
  readonly formerLine: number;
}

export type StructuralPatchResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly source: string;
      readonly storyDocument: StoryDocument;
      readonly affectedStatementIds: readonly EntityId[];
      readonly tombstones: readonly DialogueTombstone[];
    }
  | { readonly ok: false; readonly error: StructuralPatchError };

interface SplitSource {
  readonly contents: string[];
  readonly separators: string[];
}

const identifier = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function fail(code: StructuralPatchErrorCode, message: string): StructuralPatchResult {
  return { ok: false, error: { code, message } };
}

function splitSource(source: string): SplitSource {
  const parts = source.split(/(\r\n|\r|\n)/);
  const contents: string[] = [];
  const separators: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const value = parts[index] ?? "";
    if (index % 2 === 0) {
      contents.push(value);
    } else {
      separators.push(value);
    }
  }
  return { contents, separators };
}

function joinSource(lines: SplitSource): string {
  let result = "";
  for (let index = 0; index < lines.contents.length; index += 1) {
    result += lines.contents[index] ?? "";
    result += lines.separators[index] ?? "";
  }
  return result;
}

function stableId(node: StorySyntaxNode): EntityId | undefined {
  switch (node.kind) {
    case "scene":
    case "directive":
    case "choice":
    case "choice-option":
    case "end":
      return node.id;
    case "dialogue":
      return node.statementId;
    case "blank":
    case "comment":
    case "label":
    case "set":
    case "opaque":
      return undefined;
  }
}

function prepare(
  source: string,
  storyDocument: StoryDocument
): { readonly lines: SplitSource; readonly parsedDocument: StoryDocument } | StructuralPatchResult {
  if (storyDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("STRUCTURAL_SOURCE_ERROR", "Cannot patch a document with parser errors");
  }
  const currentDocument = parseStory(source);
  if (currentDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("STRUCTURAL_SOURCE_ERROR", "Current source contains parser errors");
  }
  if (
    JSON.stringify(semanticSnapshot(currentDocument)) !==
    JSON.stringify(semanticSnapshot(storyDocument))
  ) {
    return fail(
      "STRUCTURAL_SOURCE_MISMATCH",
      "Source changed after the supplied document was parsed"
    );
  }
  return { lines: splitSource(source), parsedDocument: currentDocument };
}

function lineIndex(node: StorySyntaxNode, lines: SplitSource): number | undefined {
  const index = node.range.start.line - 1;
  return index >= 0 && index < lines.contents.length ? index : undefined;
}

function isComment(line: string | undefined): boolean {
  const trimmed = line?.trim() ?? "";
  return trimmed.startsWith("#") || trimmed.startsWith("//");
}

function hasAdjacentComment(lines: SplitSource, index: number): boolean {
  return isComment(lines.contents[index - 1]) || isComment(lines.contents[index + 1]);
}

function preferredSeparator(lines: SplitSource, afterIndex: number): string {
  return lines.separators[afterIndex] ?? lines.separators[afterIndex - 1] ?? "\n";
}

function verify(
  source: string,
  affectedStatementIds: readonly EntityId[],
  tombstones: readonly DialogueTombstone[]
): StructuralPatchResult {
  const storyDocument = parseStory(source);
  if (storyDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("STRUCTURAL_SOURCE_ERROR", "Structural patch produced an invalid document");
  }
  return {
    ok: true,
    changed: true,
    source,
    storyDocument,
    affectedStatementIds,
    tombstones
  };
}

function validateText(text: string): boolean {
  return (
    text === text.trim() &&
    !text.includes("\n") &&
    !text.includes("\r") &&
    !/(?:^|\s)@[A-Za-z_][A-Za-z0-9_.-]*\s*\(/.test(text)
  );
}

export function insertDialogueAfter(
  source: string,
  storyDocument: StoryDocument,
  request: InsertDialogueRequest
): StructuralPatchResult {
  const prepared = prepare(source, storyDocument);
  if ("ok" in prepared) {
    return prepared;
  }
  if (
    !identifier.test(request.statementId) ||
    !identifier.test(request.textId) ||
    !identifier.test(request.speakerId)
  ) {
    return fail(
      "STRUCTURAL_INVALID_IDENTIFIER",
      "Inserted dialogue requires valid speaker, statement and text IDs"
    );
  }
  if (!validateText(request.text)) {
    return fail(
      "STRUCTURAL_TEXT_UNREPRESENTABLE",
      "Inserted dialogue text is not losslessly representable by the line grammar"
    );
  }
  const allIds = new Set<EntityId>();
  for (const node of prepared.parsedDocument.nodes) {
    const id = stableId(node);
    if (id !== undefined) {
      allIds.add(id);
    }
    if (node.kind === "dialogue" && node.textId !== undefined) {
      allIds.add(node.textId);
    }
  }
  if (allIds.has(request.statementId) || allIds.has(request.textId)) {
    return fail("STRUCTURAL_DUPLICATE_ID", "Inserted dialogue IDs must be globally unique");
  }
  const anchor = prepared.parsedDocument.nodes.find((node) => stableId(node) === request.afterId);
  if (anchor === undefined) {
    return fail(
      "STRUCTURAL_ANCHOR_NOT_FOUND",
      `Insertion anchor was not found: ${request.afterId}`
    );
  }
  const anchorIndex = lineIndex(anchor, prepared.lines);
  if (anchorIndex === undefined) {
    return fail("STRUCTURAL_SOURCE_MISMATCH", "Insertion anchor has no source line");
  }
  if (isComment(prepared.lines.contents[anchorIndex + 1])) {
    return fail(
      "STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED",
      "Cannot insert across an adjacent comment until ownership rules are frozen"
    );
  }
  const line = `${request.speakerId}: ${request.text} @sid(${request.statementId}) @id(${request.textId})`;
  const contents = [...prepared.lines.contents];
  const separators = [...prepared.lines.separators];
  contents.splice(anchorIndex + 1, 0, line);
  separators.splice(anchorIndex, 0, preferredSeparator(prepared.lines, anchorIndex));
  return verify(joinSource({ contents, separators }), [request.statementId], []);
}

function findDialogue(
  storyDocument: StoryDocument,
  statementId: EntityId
): DialogueNode | undefined {
  return storyDocument.nodes.find(
    (node): node is DialogueNode =>
      node.kind === "dialogue" && node.statementId === statementId
  );
}

export function deleteDialogue(
  source: string,
  storyDocument: StoryDocument,
  statementId: EntityId
): StructuralPatchResult {
  const prepared = prepare(source, storyDocument);
  if ("ok" in prepared) {
    return prepared;
  }
  const target = findDialogue(prepared.parsedDocument, statementId);
  if (target === undefined) {
    const exists = prepared.parsedDocument.nodes.some((node) => stableId(node) === statementId);
    return fail(
      exists ? "STRUCTURAL_TARGET_NOT_DIALOGUE" : "STRUCTURAL_TARGET_NOT_FOUND",
      `Delete target is not an editable dialogue: ${statementId}`
    );
  }
  const targetIndex = lineIndex(target, prepared.lines);
  if (targetIndex === undefined) {
    return fail("STRUCTURAL_SOURCE_MISMATCH", "Delete target has no source line");
  }
  if (hasAdjacentComment(prepared.lines, targetIndex)) {
    return fail(
      "STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED",
      "Cannot delete a dialogue with an adjacent comment"
    );
  }
  if (target.textId === undefined) {
    return fail("STRUCTURAL_SOURCE_ERROR", "Deleted dialogue requires a textId tombstone");
  }
  const tombstone: DialogueTombstone = {
    kind: "dialogue",
    statementId,
    textId: target.textId,
    speakerId: target.speakerId,
    text: target.textRaw,
    rawLine: prepared.lines.contents[targetIndex] ?? "",
    formerLine: target.range.start.line
  };
  const contents = [...prepared.lines.contents];
  const separators = [...prepared.lines.separators];
  contents.splice(targetIndex, 1);
  if (targetIndex < separators.length) {
    separators.splice(targetIndex, 1);
  } else if (targetIndex > 0) {
    separators.splice(targetIndex - 1, 1);
  }
  return verify(joinSource({ contents, separators }), [statementId], [tombstone]);
}

export function moveDialogueAfter(
  source: string,
  storyDocument: StoryDocument,
  statementId: EntityId,
  afterId: EntityId
): StructuralPatchResult {
  const prepared = prepare(source, storyDocument);
  if ("ok" in prepared) {
    return prepared;
  }
  if (statementId === afterId) {
    return fail("STRUCTURAL_SELF_MOVE", "A dialogue cannot move after itself");
  }
  const target = findDialogue(prepared.parsedDocument, statementId);
  if (target === undefined) {
    const exists = prepared.parsedDocument.nodes.some((node) => stableId(node) === statementId);
    return fail(
      exists ? "STRUCTURAL_TARGET_NOT_DIALOGUE" : "STRUCTURAL_TARGET_NOT_FOUND",
      `Move target is not an editable dialogue: ${statementId}`
    );
  }
  const anchor = prepared.parsedDocument.nodes.find((node) => stableId(node) === afterId);
  if (anchor === undefined) {
    return fail("STRUCTURAL_ANCHOR_NOT_FOUND", `Move anchor was not found: ${afterId}`);
  }
  const targetIndex = lineIndex(target, prepared.lines);
  const anchorIndex = lineIndex(anchor, prepared.lines);
  if (targetIndex === undefined || anchorIndex === undefined) {
    return fail("STRUCTURAL_SOURCE_MISMATCH", "Move target or anchor has no source line");
  }
  if (
    hasAdjacentComment(prepared.lines, targetIndex) ||
    isComment(prepared.lines.contents[anchorIndex + 1])
  ) {
    return fail(
      "STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED",
      "Cannot move across unresolved adjacent comment ownership"
    );
  }
  const targetNodeIndex = prepared.parsedDocument.nodes.indexOf(target);
  const anchorNodeIndex = prepared.parsedDocument.nodes.indexOf(anchor);
  const alreadyFollows =
    targetNodeIndex > anchorNodeIndex &&
    prepared.parsedDocument.nodes
      .slice(anchorNodeIndex + 1, targetNodeIndex)
      .every((node) => node.kind === "blank");
  if (alreadyFollows) {
    return {
      ok: true,
      changed: false,
      source,
      storyDocument: prepared.parsedDocument,
      affectedStatementIds: [],
      tombstones: []
    };
  }
  const contents = [...prepared.lines.contents];
  const moved = contents.splice(targetIndex, 1)[0];
  if (moved === undefined) {
    return fail("STRUCTURAL_SOURCE_MISMATCH", "Move target line disappeared");
  }
  const adjustedAnchor = targetIndex < anchorIndex ? anchorIndex - 1 : anchorIndex;
  contents.splice(adjustedAnchor + 1, 0, moved);
  return verify(joinSource({ contents, separators: [...prepared.lines.separators] }), [statementId], []);
}

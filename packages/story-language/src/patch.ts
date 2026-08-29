import type { EntityId } from "@world-studio/story-core";
import { semanticSnapshot } from "./formatter";
import type { DialogueNode, StoryDocument } from "./model";
import { parseStory } from "./parser";

export type DialoguePatchErrorCode =
  | "PATCH_SOURCE_ERROR"
  | "PATCH_TARGET_NOT_FOUND"
  | "PATCH_TARGET_NOT_DIALOGUE"
  | "PATCH_TARGET_AMBIGUOUS"
  | "PATCH_MULTILINE_TEXT_UNSUPPORTED"
  | "PATCH_RESERVED_METADATA_SYNTAX"
  | "PATCH_SURROUNDING_WHITESPACE_UNSUPPORTED"
  | "PATCH_SOURCE_MISMATCH";

export interface DialoguePatchError {
  readonly code: DialoguePatchErrorCode;
  readonly message: string;
}

export type DialogueTextPatchResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly source: string;
      readonly storyDocument: StoryDocument;
      readonly statementId: EntityId;
      readonly textId?: EntityId;
      readonly beforeText: string;
      readonly afterText: string;
    }
  | { readonly ok: false; readonly error: DialoguePatchError };

interface LineSlice {
  readonly start: number;
  readonly end: number;
  readonly content: string;
}

function findLine(source: string, oneBasedLine: number): LineSlice | undefined {
  let line = 1;
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    const character = source[index];
    const isEnd = index === source.length;
    const isNewline = character === "\n" || character === "\r";
    if (!isEnd && !isNewline) {
      continue;
    }
    if (line === oneBasedLine) {
      return { start, end: index, content: source.slice(start, index) };
    }
    if (character === "\r" && source[index + 1] === "\n") {
      index += 1;
    }
    line += 1;
    start = index + 1;
  }
  return undefined;
}

function fail(code: DialoguePatchErrorCode, message: string): DialogueTextPatchResult {
  return { ok: false, error: { code, message } };
}

export function patchDialogueText(
  source: string,
  storyDocument: StoryDocument,
  statementId: EntityId,
  text: string
): DialogueTextPatchResult {
  if (storyDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("PATCH_SOURCE_ERROR", "Cannot patch a document with parser errors");
  }
  const sourceDocument = parseStory(source);
  if (sourceDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("PATCH_SOURCE_ERROR", "Current source contains parser errors");
  }
  if (
    JSON.stringify(semanticSnapshot(sourceDocument)) !==
    JSON.stringify(semanticSnapshot(storyDocument))
  ) {
    return fail(
      "PATCH_SOURCE_MISMATCH",
      "Source changed after the supplied document was parsed"
    );
  }
  if (text.includes("\n") || text.includes("\r")) {
    return fail(
      "PATCH_MULTILINE_TEXT_UNSUPPORTED",
      "Line-based dialogue cannot contain a raw newline in S0.5"
    );
  }
  if (text !== text.trim()) {
    return fail(
      "PATCH_SURROUNDING_WHITESPACE_UNSUPPORTED",
      "Dialogue text cannot start or end with structural whitespace in S0.5"
    );
  }
  if (/(?:^|\s)@[A-Za-z_][A-Za-z0-9_.-]*\s*\(/.test(text)) {
    return fail(
      "PATCH_RESERVED_METADATA_SYNTAX",
      "Dialogue text cannot contain reserved @name(...) metadata syntax"
    );
  }

  const targets = sourceDocument.nodes.filter(
    (node): node is DialogueNode =>
      node.kind === "dialogue" && node.statementId === statementId
  );
  if (targets.length === 0) {
    const nonDialogueTarget = sourceDocument.nodes.some((node) => {
      switch (node.kind) {
        case "scene":
        case "choice":
        case "choice-option":
        case "end":
        case "directive":
        case "checkpoint":
          return node.id === statementId;
        case "dialogue":
        case "blank":
        case "comment":
        case "label":
        case "set":
        case "opaque":
          return false;
      }
    });
    if (nonDialogueTarget) {
      return fail(
        "PATCH_TARGET_NOT_DIALOGUE",
        `Stable ID does not identify a dialogue statement: ${statementId}`
      );
    }
    return fail(
      "PATCH_TARGET_NOT_FOUND",
      `Dialogue statement was not found: ${statementId}`
    );
  }
  if (targets.length > 1) {
    return fail(
      "PATCH_TARGET_AMBIGUOUS",
      `Dialogue statement ID is ambiguous: ${statementId}`
    );
  }
  const target = targets[0];
  if (target === undefined) {
    return fail("PATCH_TARGET_NOT_FOUND", `Dialogue statement was not found: ${statementId}`);
  }
  const line = findLine(source, target.range.start.line);
  if (line === undefined) {
    return fail("PATCH_SOURCE_MISMATCH", "Source no longer contains the parsed dialogue line");
  }
  const prefix = line.content.match(
    /^\s*[A-Za-z_][A-Za-z0-9_.-]*\s*:\s*/
  )?.[0];
  const metadata = line.content.match(
    /(\s+@[A-Za-z_][A-Za-z0-9_.-]*\([^\r\n)]*\))+\s*$/
  );
  if (prefix === undefined || metadata === null || metadata.index === undefined) {
    return fail(
      "PATCH_SOURCE_MISMATCH",
      "Parsed dialogue no longer matches its source line structure"
    );
  }
  const suffix = line.content.slice(metadata.index);
  const nextLine = `${prefix}${text}${suffix}`;
  const nextSource = `${source.slice(0, line.start)}${nextLine}${source.slice(line.end)}`;
  const nextDocument = parseStory(nextSource);
  if (nextDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("PATCH_SOURCE_ERROR", "Dialogue patch produced an invalid document");
  }
  const nextTarget = nextDocument.nodes.find(
    (node): node is DialogueNode =>
      node.kind === "dialogue" && node.statementId === statementId
  );
  if (nextTarget === undefined || nextTarget.textRaw !== text) {
    return fail("PATCH_SOURCE_MISMATCH", "Dialogue patch failed semantic verification");
  }
  return {
    ok: true,
    changed: nextSource !== source,
    source: nextSource,
    storyDocument: nextDocument,
    statementId,
    ...(target.textId === undefined ? {} : { textId: target.textId }),
    beforeText: target.textRaw,
    afterText: text
  };
}

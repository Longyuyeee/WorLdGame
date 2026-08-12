import type { EntityId } from "@world-studio/story-core";
import { semanticSnapshot } from "./formatter";
import { DIRECTIVE_PARAMETERS } from "./directive-schema";
import type { DirectiveNode, StoryDocument } from "./model";
import { parseStory } from "./parser";

export type DirectivePatchErrorCode =
  | "DIRECTIVE_PATCH_SOURCE_ERROR"
  | "DIRECTIVE_PATCH_SOURCE_MISMATCH"
  | "DIRECTIVE_PATCH_TARGET_NOT_FOUND"
  | "DIRECTIVE_PATCH_TARGET_NOT_DIRECTIVE"
  | "DIRECTIVE_PATCH_TARGET_AMBIGUOUS"
  | "DIRECTIVE_PATCH_UNKNOWN_PARAMETER"
  | "DIRECTIVE_PATCH_DUPLICATE_PARAMETER"
  | "DIRECTIVE_PATCH_INVALID_VALUE";

export interface DirectivePatchError {
  readonly code: DirectivePatchErrorCode;
  readonly message: string;
}

export interface DirectiveArgumentInspection {
  readonly parameters: Readonly<Record<string, string>>;
  readonly positional: readonly string[];
  readonly duplicateKeys: readonly string[];
}

export interface DirectiveParameterPatch {
  readonly parameters: Readonly<Record<string, string | null>>;
  /** Removes only legacy plain tokens. Metadata and unknown key=value tokens remain byte-for-byte. */
  readonly removeLegacyPositional?: boolean;
}

export type DirectiveParameterPatchResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly source: string;
      readonly storyDocument: StoryDocument;
      readonly statementId: EntityId;
      readonly command: DirectiveNode["command"];
      readonly before: DirectiveArgumentInspection;
      readonly after: DirectiveArgumentInspection;
    }
  | { readonly ok: false; readonly error: DirectivePatchError };

interface TokenSpan {
  readonly start: number;
  readonly end: number;
  readonly raw: string;
  readonly key?: string;
  readonly value?: string;
  readonly metadata: boolean;
}

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
    if (index !== source.length && character !== "\n" && character !== "\r") continue;
    if (line === oneBasedLine) return { start, end: index, content: source.slice(start, index) };
    if (character === "\r" && source[index + 1] === "\n") index += 1;
    line += 1;
    start = index + 1;
  }
  return undefined;
}

function tokens(raw: string): readonly TokenSpan[] {
  return [...raw.matchAll(/\S+/g)].map((match) => {
    const value = match[0];
    const start = match.index;
    const equals = value.indexOf("=");
    return {
      start,
      end: start + value.length,
      raw: value,
      ...(equals > 0 && equals < value.length - 1
        ? { key: value.slice(0, equals), value: value.slice(equals + 1) }
        : {}),
      metadata: /^@[A-Za-z_][A-Za-z0-9_.-]*\([^)]*\)$/.test(value)
    };
  });
}

export function inspectDirectiveArguments(argumentsRaw: string): DirectiveArgumentInspection {
  const parameters: Record<string, string> = {};
  const duplicateKeys: string[] = [];
  const positional: string[] = [];
  for (const token of tokens(argumentsRaw)) {
    if (token.key !== undefined && token.value !== undefined) {
      if (Object.hasOwn(parameters, token.key)) duplicateKeys.push(token.key);
      else parameters[token.key] = token.value;
    } else if (!token.metadata) {
      positional.push(token.raw);
    }
  }
  return { parameters, positional, duplicateKeys };
}

export function editableDirectiveParameters(command: DirectiveNode["command"]): readonly string[] {
  return DIRECTIVE_PARAMETERS[command];
}

function fail(code: DirectivePatchErrorCode, message: string): DirectiveParameterPatchResult {
  return { ok: false, error: { code, message } };
}

function removeSpanWithLeadingWhitespace(raw: string, start: number, end: number): [number, number] {
  let removalStart = start;
  while (removalStart > 0 && /[ \t]/.test(raw[removalStart - 1] ?? "")) removalStart -= 1;
  return [removalStart, end];
}

export function patchDirectiveParameters(
  source: string,
  storyDocument: StoryDocument,
  statementId: EntityId,
  patch: DirectiveParameterPatch
): DirectiveParameterPatchResult {
  if (storyDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("DIRECTIVE_PATCH_SOURCE_ERROR", "Cannot patch a document with parser errors");
  }
  const sourceDocument = parseStory(source);
  if (sourceDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("DIRECTIVE_PATCH_SOURCE_ERROR", "Current source contains parser errors");
  }
  if (JSON.stringify(semanticSnapshot(sourceDocument)) !== JSON.stringify(semanticSnapshot(storyDocument))) {
    return fail("DIRECTIVE_PATCH_SOURCE_MISMATCH", "Source changed after the supplied document was parsed");
  }
  const targets = sourceDocument.nodes.filter(
    (node): node is DirectiveNode => node.kind === "directive" && node.id === statementId
  );
  if (targets.length === 0) {
    const anotherKind = sourceDocument.nodes.some((node) => {
      if (node.kind === "dialogue") return node.statementId === statementId;
      return "id" in node && node.id === statementId;
    });
    return fail(
      anotherKind ? "DIRECTIVE_PATCH_TARGET_NOT_DIRECTIVE" : "DIRECTIVE_PATCH_TARGET_NOT_FOUND",
      anotherKind ? `Stable ID does not identify a directive: ${statementId}` : `Directive was not found: ${statementId}`
    );
  }
  if (targets.length > 1) {
    return fail("DIRECTIVE_PATCH_TARGET_AMBIGUOUS", `Directive ID is ambiguous: ${statementId}`);
  }
  const target = targets[0];
  if (target === undefined) return fail("DIRECTIVE_PATCH_TARGET_NOT_FOUND", `Directive was not found: ${statementId}`);

  const editable = new Set(DIRECTIVE_PARAMETERS[target.command]);
  for (const [key, value] of Object.entries(patch.parameters)) {
    if (!editable.has(key)) {
      return fail("DIRECTIVE_PATCH_UNKNOWN_PARAMETER", `@${target.command} does not expose parameter ${key}`);
    }
    if (value !== null && (!/^[^\s=@]+$/.test(value) || value.length > 256)) {
      return fail("DIRECTIVE_PATCH_INVALID_VALUE", `Directive parameter ${key} has an unsafe value`);
    }
  }

  const lineSlice = findLine(source, target.range.start.line);
  if (lineSlice === undefined) {
    return fail("DIRECTIVE_PATCH_SOURCE_MISMATCH", "Source no longer contains the parsed directive line");
  }
  const lineStart = lineSlice.start;
  const lineEnd = lineSlice.end;
  const line = lineSlice.content;
  const prefix = line.match(new RegExp(`^\\s*@${target.command}(?=\\s|$)`))?.[0];
  if (prefix === undefined) {
    return fail("DIRECTIVE_PATCH_SOURCE_MISMATCH", "Parsed directive no longer matches its source line");
  }
  const tail = line.slice(prefix.length);
  const tailTokens = tokens(tail);
  const idTokens = tailTokens.filter((token) => token.raw === `@id(${statementId})`);
  if (idTokens.length !== 1) {
    return fail("DIRECTIVE_PATCH_SOURCE_MISMATCH", "Directive stable metadata is missing or ambiguous");
  }
  const operations: Array<{ readonly start: number; readonly end: number; readonly value: string }> = [];
  for (const [key, value] of Object.entries(patch.parameters)) {
    const matches = tailTokens.filter((token) => token.key === key);
    if (matches.length > 1) {
      return fail("DIRECTIVE_PATCH_DUPLICATE_PARAMETER", `Directive parameter is duplicated: ${key}`);
    }
    const existing = matches[0];
    if (existing !== undefined) {
      if (value === null) {
        const [start, end] = removeSpanWithLeadingWhitespace(tail, existing.start, existing.end);
        operations.push({ start, end, value: "" });
      } else if (existing.value !== value) {
        const valueStart = existing.start + key.length + 1;
        operations.push({ start: valueStart, end: existing.end, value });
      }
    } else if (value !== null) {
      const idStart = idTokens[0]?.start ?? tail.length;
      operations.push({ start: idStart, end: idStart, value: `${idStart > 0 && /\s/.test(tail[idStart - 1] ?? "") ? "" : " "}${key}=${value} ` });
    }
  }
  if (patch.removeLegacyPositional === true) {
    for (const token of tailTokens) {
      if (token.key === undefined && !token.metadata) {
        const [start, end] = removeSpanWithLeadingWhitespace(tail, token.start, token.end);
        operations.push({ start, end, value: "" });
      }
    }
  }
  const scheduled = operations.map((operation, ordinal) => ({ ...operation, ordinal }));
  scheduled.sort((left, right) => right.start - left.start || right.ordinal - left.ordinal || right.end - left.end);
  let nextTail = tail;
  for (const operation of scheduled) {
    nextTail = `${nextTail.slice(0, operation.start)}${operation.value}${nextTail.slice(operation.end)}`;
  }
  const nextSource = `${source.slice(0, lineStart)}${prefix}${nextTail}${source.slice(lineEnd)}`;
  const nextDocument = parseStory(nextSource);
  if (nextDocument.diagnostics.some((item) => item.severity === "error")) {
    return fail("DIRECTIVE_PATCH_SOURCE_ERROR", "Directive patch produced an invalid document");
  }
  const nextTarget = nextDocument.nodes.find(
    (node): node is DirectiveNode => node.kind === "directive" && node.id === statementId
  );
  if (nextTarget === undefined || nextTarget.command !== target.command) {
    return fail("DIRECTIVE_PATCH_SOURCE_MISMATCH", "Directive patch failed semantic verification");
  }
  return {
    ok: true,
    changed: nextSource !== source,
    source: nextSource,
    storyDocument: nextDocument,
    statementId,
    command: target.command,
    before: inspectDirectiveArguments(target.argumentsRaw),
    after: inspectDirectiveArguments(nextTarget.argumentsRaw)
  };
}

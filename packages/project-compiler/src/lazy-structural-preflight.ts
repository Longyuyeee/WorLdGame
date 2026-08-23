import type { JsonObject, ScriptDocument } from "@world-studio/project-domain";

export interface LazyNarrationInsertionRequest {
  readonly afterId: string;
  readonly statementId: string;
  readonly textId: string;
}

export type LazyNarrationInsertionPreflight =
  | { readonly ok: true; readonly changedStatementIds: readonly string[] }
  | { readonly ok: false; readonly code: "INVALID_ID" | "SCENE_MISMATCH" | "ANCHOR_NOT_FOUND" | "TERMINAL_ANCHOR" | "UNSUPPORTED_CHANGE"; readonly message: string };

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/u;
const terminalKinds = new Set(["choice", "jump", "return", "end"]);
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/**
 * Formal Compiler boundary for the first lazy structural slice. The proof is
 * intentionally narrow: one narration is inserted, every baseline statement
 * remains byte-for-byte semantically identical, and the anchor still has a
 * reachable fallthrough continuation.
 */
export function preflightLazyNarrationInsertion(
  baseline: ScriptDocument,
  candidate: ScriptDocument,
  request: LazyNarrationInsertionRequest
): LazyNarrationInsertionPreflight {
  if (![request.afterId, request.statementId, request.textId].every((id) => SAFE_ID.test(id)) || request.statementId === request.textId) {
    return { ok: false, code: "INVALID_ID", message: "Lazy structural IDs must be distinct stable IDs" };
  }
  if (baseline.sceneId !== candidate.sceneId || baseline.schemaVersion !== candidate.schemaVersion) {
    return { ok: false, code: "SCENE_MISMATCH", message: "Lazy structural candidate belongs to another scene" };
  }
  const anchorIndex = baseline.statements.findIndex((statement) => statement.id === request.afterId);
  if (anchorIndex < 0) return { ok: false, code: "ANCHOR_NOT_FOUND", message: "Lazy structural anchor was not found" };
  if (terminalKinds.has(String(baseline.statements[anchorIndex]!.kind))) {
    return { ok: false, code: "TERMINAL_ANCHOR", message: "Cannot insert narration after a terminal control-flow statement" };
  }
  if (candidate.statements.length !== baseline.statements.length + 1) {
    return { ok: false, code: "UNSUPPORTED_CHANGE", message: "Compiler preflight permits exactly one narration insertion" };
  }
  const insertionIndex = anchorIndex + 1;
  const inserted = candidate.statements[insertionIndex] as JsonObject | undefined;
  if (inserted?.kind !== "narration" || inserted.id !== request.statementId || inserted.textId !== request.textId || typeof inserted.text !== "string" || inserted.text.trim() === "") {
    return { ok: false, code: "UNSUPPORTED_CHANGE", message: "Inserted statement is not the declared non-empty narration" };
  }
  const withoutInserted = candidate.statements.filter((_, index) => index !== insertionIndex);
  if (!same(withoutInserted, baseline.statements)) {
    return { ok: false, code: "UNSUPPORTED_CHANGE", message: "Compiler preflight found an additional script change" };
  }
  return { ok: true, changedStatementIds: [request.statementId] };
}

import type { JsonObject, ScriptDocument } from "@world-studio/project-domain";

export interface LazyNarrationInsertionRequest {
  readonly afterId: string;
  readonly statementId: string;
  readonly textId: string;
}

export type LazyNarrationStructuralRequest =
  | ({ readonly kind: "insert-after" } & LazyNarrationInsertionRequest)
  | { readonly kind: "insert-before"; readonly beforeId: string; readonly statementId: string; readonly textId: string }
  | { readonly kind: "delete"; readonly statementId: string }
  | { readonly kind: "move-after"; readonly statementId: string; readonly afterId: string }
  | { readonly kind: "move-before"; readonly statementId: string; readonly beforeId: string };

export type LazyDialogueStructuralRequest =
  | { readonly kind: "insert-after"; readonly afterId: string; readonly statementId: string; readonly textId: string; readonly speakerId: string }
  | { readonly kind: "insert-before"; readonly beforeId: string; readonly statementId: string; readonly textId: string; readonly speakerId: string }
  | { readonly kind: "delete"; readonly statementId: string }
  | { readonly kind: "move-after"; readonly statementId: string; readonly afterId: string }
  | { readonly kind: "move-before"; readonly statementId: string; readonly beforeId: string };

export type LazyNarrationInsertionPreflight =
  | { readonly ok: true; readonly changedStatementIds: readonly string[] }
  | { readonly ok: false; readonly code: "INVALID_ID" | "SCENE_MISMATCH" | "ANCHOR_NOT_FOUND" | "TARGET_NOT_FOUND" | "TERMINAL_ANCHOR" | "UNSUPPORTED_CHANGE"; readonly message: string };

const SAFE_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;
const terminalKinds = new Set(["choice", "jump", "return", "end"]);
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const fail = (code: Exclude<LazyNarrationInsertionPreflight, { readonly ok: true }>["code"], message: string): LazyNarrationInsertionPreflight => ({ ok: false, code, message });

export function preflightLazyNarrationStructuralEdit(baseline: ScriptDocument, candidate: ScriptDocument, request: LazyNarrationStructuralRequest): LazyNarrationInsertionPreflight {
  return preflightLazyTextStructuralEdit(baseline, candidate, request, "narration");
}

export function preflightLazyDialogueStructuralEdit(baseline: ScriptDocument, candidate: ScriptDocument, request: LazyDialogueStructuralRequest): LazyNarrationInsertionPreflight {
  return preflightLazyTextStructuralEdit(baseline, candidate, request, "dialogue");
}

function preflightLazyTextStructuralEdit(
  baseline: ScriptDocument,
  candidate: ScriptDocument,
  request: LazyNarrationStructuralRequest | LazyDialogueStructuralRequest,
  statementKind: "narration" | "dialogue"
): LazyNarrationInsertionPreflight {
  const ids = request.kind === "insert-after" ? [request.afterId, request.statementId, request.textId]
    : request.kind === "insert-before" ? [request.beforeId, request.statementId, request.textId]
      : request.kind === "move-after" ? [request.statementId, request.afterId]
        : request.kind === "move-before" ? [request.statementId, request.beforeId]
          : [request.statementId];
  if ((request.kind === "insert-after" || request.kind === "insert-before") && "speakerId" in request) ids.push(request.speakerId);
  if (!ids.every((id) => SAFE_ID.test(id)) || ((request.kind === "insert-after" || request.kind === "insert-before") && request.statementId === request.textId)) return fail("INVALID_ID", "Lazy structural IDs must be distinct stable IDs");
  if (baseline.sceneId !== candidate.sceneId || baseline.schemaVersion !== candidate.schemaVersion) return fail("SCENE_MISMATCH", "Lazy structural candidate belongs to another scene");

  if (request.kind === "insert-after" || request.kind === "insert-before") {
    const anchorId = request.kind === "insert-after" ? request.afterId : request.beforeId;
    const anchorIndex = baseline.statements.findIndex((statement) => statement.id === anchorId);
    if (anchorIndex < 0) return fail("ANCHOR_NOT_FOUND", "Lazy structural anchor was not found");
    if (request.kind === "insert-after" && terminalKinds.has(String(baseline.statements[anchorIndex]!.kind))) return fail("TERMINAL_ANCHOR", "Cannot insert narration after a terminal control-flow statement");
    const insertionIndex = request.kind === "insert-after" ? anchorIndex + 1 : anchorIndex;
    const inserted = candidate.statements[insertionIndex] as JsonObject | undefined;
    const speakerMatches = statementKind !== "dialogue" || ("speakerId" in request && inserted?.speakerId === request.speakerId);
    if (candidate.statements.length !== baseline.statements.length + 1 || inserted?.kind !== statementKind || inserted.id !== request.statementId || inserted.textId !== request.textId || !speakerMatches || typeof inserted.text !== "string" || inserted.text.trim() === "") return fail("UNSUPPORTED_CHANGE", `Candidate is not the declared single non-empty ${statementKind} insertion`);
    if (!same(candidate.statements.filter((_, index) => index !== insertionIndex), baseline.statements)) return fail("UNSUPPORTED_CHANGE", "Compiler preflight found an additional script change");
    return { ok: true, changedStatementIds: [request.statementId] };
  }

  const targetIndex = baseline.statements.findIndex((statement) => statement.id === request.statementId);
  if (targetIndex < 0) return fail("TARGET_NOT_FOUND", "Lazy narration target was not found");
  if (baseline.statements[targetIndex]!.kind !== statementKind) return fail("UNSUPPORTED_CHANGE", `Only ${statementKind} statements may be deleted or moved lazily`);
  if (request.kind === "delete") {
    if (!same(candidate.statements, baseline.statements.filter((_, index) => index !== targetIndex))) return fail("UNSUPPORTED_CHANGE", "Candidate is not the declared single narration deletion");
    return { ok: true, changedStatementIds: [request.statementId] };
  }

  const anchorId = request.kind === "move-after" ? request.afterId : request.beforeId;
  if (anchorId === request.statementId) return fail("UNSUPPORTED_CHANGE", "Narration cannot move relative to itself");
  const anchorIndex = baseline.statements.findIndex((statement) => statement.id === anchorId);
  if (anchorIndex < 0) return fail("ANCHOR_NOT_FOUND", "Lazy structural anchor was not found");
  if (request.kind === "move-after" && terminalKinds.has(String(baseline.statements[anchorIndex]!.kind))) return fail("TERMINAL_ANCHOR", "Cannot move narration after a terminal control-flow statement");
  const expected = [...baseline.statements];
  const [target] = expected.splice(targetIndex, 1);
  const nextAnchor = expected.findIndex((statement) => statement.id === anchorId);
  expected.splice(request.kind === "move-after" ? nextAnchor + 1 : nextAnchor, 0, target!);
  if (!same(candidate.statements, expected)) return fail("UNSUPPORTED_CHANGE", "Candidate is not the declared narration movement or contains another change");
  return { ok: true, changedStatementIds: [request.statementId] };
}

/** Compatibility wrapper for the E8i insert-after contract. */
export function preflightLazyNarrationInsertion(baseline: ScriptDocument, candidate: ScriptDocument, request: LazyNarrationInsertionRequest): LazyNarrationInsertionPreflight {
  return preflightLazyNarrationStructuralEdit(baseline, candidate, { kind: "insert-after", ...request });
}

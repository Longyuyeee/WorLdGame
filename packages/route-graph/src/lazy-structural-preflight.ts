import type { JsonObject, ScriptDocument } from "@world-studio/project-domain";

export type RouteNeutralScenePreflight =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "SCENE_MISMATCH" | "ROUTE_SEMANTICS_CHANGED"; readonly message: string };

const routeKinds = new Set(["choice", "label", "jump", "call", "condition", "end"]);
const routeFacts = (script: ScriptDocument): readonly JsonObject[] => script.statements
  .filter((statement) => routeKinds.has(String(statement.kind)))
  .map((statement) => statement as JsonObject);

/** Verifies that a partial scene edit cannot alter creator Route facts or edges. */
export function preflightRouteNeutralSceneEdit(
  baseline: ScriptDocument,
  candidate: ScriptDocument,
  affectedStatementIds: readonly string[]
): RouteNeutralScenePreflight {
  if (baseline.sceneId !== candidate.sceneId) return { ok: false, code: "SCENE_MISMATCH", message: "Route preflight received another scene" };
  const affected = new Set(affectedStatementIds);
  if (candidate.statements.some((statement) => affected.has(String(statement.id)) && routeKinds.has(String(statement.kind)))) {
    return { ok: false, code: "ROUTE_SEMANTICS_CHANGED", message: "The structural edit introduces a Route fact" };
  }
  if (JSON.stringify(routeFacts(baseline)) !== JSON.stringify(routeFacts(candidate))) {
    return { ok: false, code: "ROUTE_SEMANTICS_CHANGED", message: "The structural edit changes Route facts or cross-scene edges" };
  }
  return { ok: true };
}

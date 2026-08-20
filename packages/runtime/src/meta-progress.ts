import { canonicalRuntimeStringify } from "./canonical";
import { runtimeMetaProgressHashV1 } from "./hash";
import {
  MAX_META_PROGRESS_IDS_PER_DOMAIN,
  type MergeRuntimeMetaProgressResultV1,
  type RuntimeDiagnosticCode,
  type RuntimeDiagnosticV1,
  type RuntimeMetaProgressV1
} from "./types";

const canonicalId = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const progressKeys = ["progressScopeId", "projectId", "reachedEndingIds", "readTextIds", "schemaVersion", "unlockedGalleryAssetIds"] as const;

function diagnostic(code: RuntimeDiagnosticCode, message: string): RuntimeDiagnosticV1 {
  return { code, message, sceneId: null, instructionIndex: null, instructionId: null };
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sortedUniqueIds(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= MAX_META_PROGRESS_IDS_PER_DOMAIN &&
    value.every((item) => typeof item === "string" && canonicalId.test(item)) &&
    value.every((item, index) => index === 0 || String(value[index - 1]) < item);
}

export function validateRuntimeMetaProgressV1(progress: unknown): readonly RuntimeDiagnosticV1[] {
  try {
    if (!record(progress)) return [diagnostic("RUNTIME_META_PROGRESS_INVALID", "Meta Progress must be a plain canonical record")];
    const keys = Object.keys(progress).sort();
    if (keys.length !== progressKeys.length || !keys.every((key, index) => key === progressKeys[index]) || progress.schemaVersion !== 1 || typeof progress.projectId !== "string" || !canonicalId.test(progress.projectId) || typeof progress.progressScopeId !== "string" || !canonicalId.test(progress.progressScopeId) || !sortedUniqueIds(progress.readTextIds) || !sortedUniqueIds(progress.unlockedGalleryAssetIds) || !sortedUniqueIds(progress.reachedEndingIds)) {
      return [diagnostic("RUNTIME_META_PROGRESS_INVALID", "Meta Progress schema, identity, or monotonic sets are invalid")];
    }
    canonicalRuntimeStringify(progress);
    return [];
  } catch {
    return [diagnostic("RUNTIME_META_PROGRESS_INVALID", "Meta Progress is not canonically valid")];
  }
}

function union(left: readonly string[], right: readonly string[]): readonly string[] | null {
  const values = [...new Set([...left, ...right])].sort();
  return values.length <= MAX_META_PROGRESS_IDS_PER_DOMAIN ? values : null;
}

export function mergeRuntimeMetaProgressV1(current: RuntimeMetaProgressV1, incoming: RuntimeMetaProgressV1): MergeRuntimeMetaProgressResultV1 {
  if (validateRuntimeMetaProgressV1(current).length > 0 || validateRuntimeMetaProgressV1(incoming).length > 0) {
    return { ok: false, progress: current, diagnostics: [diagnostic("RUNTIME_META_PROGRESS_INVALID", "Meta Progress merge input is invalid")] };
  }
  if (current.projectId !== incoming.projectId || current.progressScopeId !== incoming.progressScopeId) {
    return { ok: false, progress: current, diagnostics: [diagnostic("RUNTIME_META_PROGRESS_INCOMPATIBLE", "Meta Progress project or scope does not match")] };
  }
  const readTextIds = union(current.readTextIds, incoming.readTextIds);
  const unlockedGalleryAssetIds = union(current.unlockedGalleryAssetIds, incoming.unlockedGalleryAssetIds);
  const reachedEndingIds = union(current.reachedEndingIds, incoming.reachedEndingIds);
  if (readTextIds === null || unlockedGalleryAssetIds === null || reachedEndingIds === null) {
    return { ok: false, progress: current, diagnostics: [diagnostic("RUNTIME_META_PROGRESS_INVALID", "Merged Meta Progress exceeds the supported domain limit")] };
  }
  const progress: RuntimeMetaProgressV1 = { ...current, readTextIds, unlockedGalleryAssetIds, reachedEndingIds };
  const changed = canonicalRuntimeStringify(progress) !== canonicalRuntimeStringify(current);
  const output = changed ? progress : current;
  return { ok: true, progress: output, changed, hash: runtimeMetaProgressHashV1(output) };
}

import { canonicalBytes, canonicalStringify, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";
import type {
  MetaProgressEventV0,
  MetaProgressResultV0,
  MetaProgressV0,
  VmDiagnostic
} from "./types";

export const MAX_META_PROGRESS_IDS_PER_DOMAIN_V0 = 100_000;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const META_REFERENCE = /^meta\.[0-9a-f]{64}$/;
const DOMAIN = utf8Encode("WORLd-VM-META-PROGRESS\0v0\0");

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function sortedUniqueSafeIds(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= MAX_META_PROGRESS_IDS_PER_DOMAIN_V0 &&
    value.every((item) => typeof item === "string" && SAFE_ID.test(item)) &&
    value.every((item, index) => index === 0 || String(value[index - 1]) < item);
}

function diagnostic(code: VmDiagnostic["code"], detail: string): VmDiagnostic {
  return { code, ip: null, sourceStatementId: null, detail };
}

function failed(progress: MetaProgressV0, code: VmDiagnostic["code"], detail: string): MetaProgressResultV0 {
  return { progress, changed: false, diagnostics: [diagnostic(code, detail)] };
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalStringify(value)) as T;
}

function union(left: readonly string[], right: readonly string[]): readonly string[] | null {
  const result = [...new Set([...left, ...right])].sort();
  return result.length <= MAX_META_PROGRESS_IDS_PER_DOMAIN_V0 ? result : null;
}

export function validateMetaProgressV0(progress: unknown): readonly VmDiagnostic[] {
  try {
    if (!plainRecord(progress) || !exactKeys(progress, [
      "schemaVersion", "projectId", "progressScopeId", "readTextIds", "unlockedCgIds", "reachedEndingIds"
    ]) || progress.schemaVersion !== 0 || typeof progress.projectId !== "string" ||
        !SAFE_ID.test(progress.projectId) || typeof progress.progressScopeId !== "string" ||
        !SAFE_ID.test(progress.progressScopeId) || !sortedUniqueSafeIds(progress.readTextIds) ||
        !sortedUniqueSafeIds(progress.unlockedCgIds) || !sortedUniqueSafeIds(progress.reachedEndingIds)) {
      return [diagnostic("VM_META_PROGRESS_INVALID", "Meta Progress schema, scope, or monotonic sets are invalid")];
    }
    canonicalStringify(progress);
    return [];
  } catch {
    return [diagnostic("VM_META_PROGRESS_INVALID", "Meta Progress is not canonically valid")];
  }
}

export function createMetaProgressV0(projectId: string, progressScopeId: string): MetaProgressV0 {
  const progress: MetaProgressV0 = {
    schemaVersion: 0,
    projectId,
    progressScopeId,
    readTextIds: [],
    unlockedCgIds: [],
    reachedEndingIds: []
  };
  if (validateMetaProgressV0(progress).length > 0) {
    throw new TypeError("Meta Progress requires canonical project and local scope IDs");
  }
  return progress;
}

function validEvent(event: unknown): event is MetaProgressEventV0 {
  return plainRecord(event) && exactKeys(event, ["schemaVersion", "kind", "entityId"]) &&
    event.schemaVersion === 0 && typeof event.kind === "string" &&
    ["textRead", "cgUnlocked", "endingReached"].includes(event.kind) &&
    typeof event.entityId === "string" && SAFE_ID.test(event.entityId);
}

export function applyMetaProgressEventV0(
  progress: MetaProgressV0,
  event: MetaProgressEventV0
): MetaProgressResultV0 {
  if (validateMetaProgressV0(progress).length > 0) {
    return failed(progress, "VM_META_PROGRESS_INVALID", "Current Meta Progress is invalid");
  }
  if (!validEvent(event)) {
    return failed(progress, "VM_META_PROGRESS_INVALID", "Meta Progress event is invalid");
  }
  const key = event.kind === "textRead" ? "readTextIds" :
    event.kind === "cgUnlocked" ? "unlockedCgIds" : "reachedEndingIds";
  const existing = progress[key];
  if (existing.includes(event.entityId)) {
    return { progress, changed: false, diagnostics: [] };
  }
  if (existing.length >= MAX_META_PROGRESS_IDS_PER_DOMAIN_V0) {
    return failed(progress, "VM_META_PROGRESS_INVALID", "Meta Progress domain reached its v0 size limit");
  }
  const next = {
    ...progress,
    [key]: [...existing, event.entityId].sort()
  };
  return { progress: clone(next), changed: true, diagnostics: [] };
}

export function mergeMetaProgressV0(
  current: MetaProgressV0,
  incoming: MetaProgressV0
): MetaProgressResultV0 {
  if (validateMetaProgressV0(current).length > 0 || validateMetaProgressV0(incoming).length > 0) {
    return failed(current, "VM_META_PROGRESS_INVALID", "Meta Progress merge input is invalid");
  }
  if (current.projectId !== incoming.projectId || current.progressScopeId !== incoming.progressScopeId) {
    return failed(current, "VM_META_PROGRESS_INCOMPATIBLE", "Meta Progress project or local scope does not match");
  }
  const readTextIds = union(current.readTextIds, incoming.readTextIds);
  const unlockedCgIds = union(current.unlockedCgIds, incoming.unlockedCgIds);
  const reachedEndingIds = union(current.reachedEndingIds, incoming.reachedEndingIds);
  if (readTextIds === null || unlockedCgIds === null || reachedEndingIds === null) {
    return failed(current, "VM_META_PROGRESS_INVALID", "Merged Meta Progress exceeds its v0 size limit");
  }
  const progress = clone({ ...current, readTextIds, unlockedCgIds, reachedEndingIds });
  const changed = canonicalStringify(progress) !== canonicalStringify(current);
  return { progress: changed ? progress : current, changed, diagnostics: [] };
}

export function metaProgressHashV0(progress: MetaProgressV0): string {
  if (validateMetaProgressV0(progress).length > 0) throw new TypeError("Cannot hash invalid Meta Progress");
  const payload = canonicalBytes(progress);
  const input = new Uint8Array(DOMAIN.length + payload.length);
  input.set(DOMAIN);
  input.set(payload, DOMAIN.length);
  return sha256Hex(input);
}

export function metaProgressReferenceIdV0(progress: MetaProgressV0): string {
  return `meta.${metaProgressHashV0(progress)}`;
}

export function mergeReferencedMetaProgressV0(
  current: MetaProgressV0,
  referenced: MetaProgressV0,
  referenceId: string | null
): MetaProgressResultV0 {
  if (referenceId === null || !META_REFERENCE.test(referenceId) ||
      validateMetaProgressV0(referenced).length > 0 || metaProgressReferenceIdV0(referenced) !== referenceId) {
    return failed(current, "VM_META_PROGRESS_INVALID", "Referenced Meta Progress is missing, malformed, or does not match its content hash");
  }
  return mergeMetaProgressV0(current, referenced);
}

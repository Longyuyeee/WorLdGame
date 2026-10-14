import { semanticHash } from "./codec";
import type { CanonicalProject, JsonObject } from "./types";

const key = "webSaveCompatibility";
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const maximumVersions = 32;
function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Compatibility declarations are delivery metadata, never executable source identity. */
export function withoutWebSaveCompatibility(project: CanonicalProject): CanonicalProject {
  if (project.manifest.preservedFields?.[key] === undefined) return project;
  const { [key]: _receipt, ...fields } = project.manifest.preservedFields;
  const { preservedFields: _fields, ...manifest } = project.manifest;
  return { ...project, manifest: Object.keys(fields).length ? { ...manifest, preservedFields: fields } : manifest };
}

function publication(project: CanonicalProject): JsonObject {
  const value = project.manifest.preservedFields?.webPublication;
  if (!object(value) || value.schemaVersion !== 1 ||
      typeof value.name !== "string" || typeof value.iconAssetId !== "string" || typeof value.version !== "string" || !versionPattern.test(value.version)) {
    throw new Error("请先应用发布设置；上一版也需要包含明确的发布版本。");
  }
  return value as JsonObject;
}

/** Reconstructs an earlier version from the same complete source, not a caller supplied Build ID. */
export function webProjectAtPublicationVersion(project: CanonicalProject, version: string): CanonicalProject {
  const clean = withoutWebSaveCompatibility(project);
  return { ...clean, manifest: { ...clean.manifest, preservedFields: { ...clean.manifest.preservedFields,
    webPublication: { ...publication(clean), version } } } };
}

export function webSaveCompatibilityFingerprint(project: CanonicalProject): string {
  const candidate = webProjectAtPublicationVersion(project, "compatibility-version");
  return semanticHash({ ...candidate, manifest: { ...candidate.manifest, title: publication(candidate).name as string } });
}

export type WebSaveCompatibilityStatus =
  | { readonly status: "unchecked" | "stale" | "invalid"; readonly versions: readonly string[] }
  | { readonly status: "verified"; readonly versions: readonly string[] };

export function readWebSaveCompatibility(project: CanonicalProject): WebSaveCompatibilityStatus {
  const value = project.manifest.preservedFields?.[key];
  if (value === undefined) return { status: "unchecked", versions: [] };
  try {
    if (!object(value) ||
        Object.keys(value).sort().join(",") !== "fingerprint,schemaVersion,versions" || value.schemaVersion !== 1 ||
        typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(value.fingerprint) ||
        !Array.isArray(value.versions) || value.versions.length === 0 || value.versions.length > maximumVersions ||
        value.versions.some(version => typeof version !== "string" || !versionPattern.test(version)) ||
        new Set(value.versions).size !== value.versions.length) return { status: "invalid", versions: [] };
    if (value.fingerprint !== webSaveCompatibilityFingerprint(project)) return { status: "stale", versions: [] };
    return { status: "verified", versions: value.versions as readonly string[] };
  } catch { return { status: "invalid", versions: [] }; }
}

export function verifyWebSaveCompatibility(current: CanonicalProject, previous: CanonicalProject): CanonicalProject {
  if (current.manifest.projectId !== previous.manifest.projectId) throw new Error("这不是同一个作品的工程，不能建立存档兼容。");
  const previousVersion = publication(previous).version as string;
  const fingerprint = webSaveCompatibilityFingerprint(current);
  if (fingerprint !== webSaveCompatibilityFingerprint(previous)) {
    throw new Error("作品内容有变化：正文、分支、设置、素材或发布名称等不一致。本轮仅支持版本号更新；旧存档需保留原版入口。");
  }
  const prior = readWebSaveCompatibility(previous), own = readWebSaveCompatibility(current);
  const versions = [...new Set([...(own.status === "verified" ? own.versions : []), previousVersion,
    ...(prior.status === "verified" ? prior.versions : [])])].sort();
  if (versions.length > maximumVersions) throw new Error("核对版本超过 32 个，请保留旧版入口并清理兼容核对后重新开始。");
  return { ...current, manifest: { ...current.manifest, preservedFields: { ...current.manifest.preservedFields,
    [key]: { schemaVersion: 1, fingerprint, versions } } } };
}

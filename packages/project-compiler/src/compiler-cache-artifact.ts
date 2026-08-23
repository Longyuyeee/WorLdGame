import {
  isProjectTrustedSourceCommit,
  loadProject,
  sha256,
  type CanonicalProject,
  type JsonValue,
  type ProjectFiles,
  type ProjectTrustedSourceCommit,
  type ProjectWorkspace
} from "@world-studio/project-domain";
import { canonicalJson } from "./canonical-json";
import { compileProjectIncremental } from "./compiler";
import {
  PROJECT_COMPILER_VERSION,
  RUNTIME_IR_VERSION,
  type CompileProfile,
  type CompileProjectResult,
  type CompilerSceneCacheEntryV1,
  type ProjectCompilerCacheV1
} from "./types";

export const PROJECT_COMPILER_CACHE_PATH = ".world-cache/compiler-v2.json";
export type ProjectCompilerCacheVerification =
  | { readonly status: "valid"; readonly cache: ProjectCompilerCacheV1 }
  | { readonly status: "invalid"; readonly reason: "corrupt" | "incompatible" | "inventory-mismatch" | "source-mismatch" };

interface CachePayload {
  readonly schemaVersion: 2;
  readonly compilerVersion: typeof PROJECT_COMPILER_VERSION;
  readonly irVersion: typeof RUNTIME_IR_VERSION;
  readonly inventoryVersion: string;
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly sourceFiles: ProjectFiles;
  readonly cache: ProjectCompilerCacheV1;
}

type ParsedCachePayload =
  | { readonly status: "valid"; readonly payload: CachePayload }
  | Exclude<ProjectCompilerCacheVerification, { status: "valid" }>;

const record = (value: unknown): value is Record<string, unknown> => value !== null && !Array.isArray(value) && typeof value === "object";
const hashPattern = /^[0-9a-f]{64}$/u;
const encoder = new TextEncoder();
const sourceHashes = (files: ProjectFiles): Readonly<Record<string, string>> => Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([path, value]) => [path, sha256(value)]));
const artifactHash = (payload: CachePayload): string => sha256(canonicalJson(payload as unknown as JsonValue));

function validEntry(value: unknown): value is CompilerSceneCacheEntryV1 {
  if (!record(value) || typeof value.inputHash !== "string" || typeof value.outputHash !== "string" || !record(value.scene) || typeof value.scene.sceneId !== "string" || !Array.isArray(value.scene.instructions)) return false;
  return ["sourceEntries", "diagnostics", "targetSceneIds", "endings", "galleryAssetIds", "musicAssetIds"].every((field) => Array.isArray(value[field]));
}

function validCache(value: unknown): value is ProjectCompilerCacheV1 {
  return record(value) && value.schemaVersion === 1 && value.compilerVersion === PROJECT_COMPILER_VERSION && value.irVersion === RUNTIME_IR_VERSION && typeof value.catalogInputHash === "string" && record(value.scenes) && Object.values(value.scenes).every(validEntry);
}

function validFiles(value: unknown): value is ProjectFiles {
  return record(value) && Object.values(value).every((body) => typeof body === "string");
}

function sameHashes(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  const leftPaths = Object.keys(left).sort();
  const rightPaths = Object.keys(right).sort();
  return leftPaths.length === rightPaths.length && leftPaths.every((path, index) => path === rightPaths[index] && left[path] === right[path]);
}

function parseArtifact(source: string, inventoryVersion: string): ParsedCachePayload {
  let value: unknown;
  try { value = JSON.parse(source); } catch { return { status: "invalid", reason: "corrupt" }; }
  if (!record(value) || value.schemaVersion !== 2 || value.compilerVersion !== PROJECT_COMPILER_VERSION || value.irVersion !== RUNTIME_IR_VERSION) return { status: "invalid", reason: "incompatible" };
  if (value.inventoryVersion !== inventoryVersion) return { status: "invalid", reason: "inventory-mismatch" };
  if (!record(value.sourceHashes) || Object.values(value.sourceHashes).some((hash) => typeof hash !== "string" || !hashPattern.test(hash)) || !validFiles(value.sourceFiles) || !validCache(value.cache) || typeof value.artifactHash !== "string") return { status: "invalid", reason: "corrupt" };
  const payload: CachePayload = {
    schemaVersion: 2,
    compilerVersion: PROJECT_COMPILER_VERSION,
    irVersion: RUNTIME_IR_VERSION,
    inventoryVersion,
    sourceHashes: value.sourceHashes as Record<string, string>,
    sourceFiles: value.sourceFiles,
    cache: value.cache
  };
  if (value.artifactHash !== artifactHash(payload)) return { status: "invalid", reason: "corrupt" };
  return { status: "valid", payload };
}

export function createProjectCompilerCacheArtifact(files: ProjectFiles, inventoryVersion: string, cache: ProjectCompilerCacheV1): string {
  const payload: CachePayload = { schemaVersion: 2, compilerVersion: PROJECT_COMPILER_VERSION, irVersion: RUNTIME_IR_VERSION, inventoryVersion, sourceHashes: sourceHashes(files), sourceFiles: files, cache };
  return `${canonicalJson({ ...payload, artifactHash: artifactHash(payload) } as unknown as JsonValue)}\n`;
}

export function verifyProjectCompilerCacheArtifact(source: string, files: ProjectFiles, inventoryVersion: string): ProjectCompilerCacheVerification {
  const parsed = parseArtifact(source, inventoryVersion);
  if (parsed.status === "invalid") return parsed;
  return sameHashes(sourceHashes(files), parsed.payload.sourceHashes) && sameHashes(sourceHashes(parsed.payload.sourceFiles), parsed.payload.sourceHashes)
    ? { status: "valid", cache: parsed.payload.cache }
    : { status: "invalid", reason: "source-mismatch" };
}

function verifyTrustedCacheArtifact(source: string, commit: ProjectTrustedSourceCommit): ProjectCompilerCacheVerification & { readonly files?: ProjectFiles } {
  const parsed = parseArtifact(source, commit.version);
  if (parsed.status === "invalid") return parsed;
  const commitHashes = Object.fromEntries(commit.files.map((entry) => [entry.path, entry.sha256]));
  if (!sameHashes(commitHashes, parsed.payload.sourceHashes) || !sameHashes(sourceHashes(parsed.payload.sourceFiles), commitHashes)) return { status: "invalid", reason: "source-mismatch" };
  for (const entry of commit.files) if (encoder.encode(parsed.payload.sourceFiles[entry.path]!).byteLength !== entry.size) return { status: "invalid", reason: "source-mismatch" };
  return { status: "valid", cache: parsed.payload.cache, files: parsed.payload.sourceFiles };
}

export type WorkspaceCompilerCacheStatus = "unsupported" | "miss" | "hit" | Exclude<ProjectCompilerCacheVerification, { status: "valid" }>["reason"];
export interface WorkspaceCompileResult { readonly project: CanonicalProject; readonly files: ProjectFiles; readonly hostVersion: string; readonly inventoryVersion?: string; readonly cacheStatus: WorkspaceCompilerCacheStatus; readonly compilation: CompileProjectResult; }

export async function compileProjectWorkspace(workspace: ProjectWorkspace, profile: CompileProfile = "debug"): Promise<WorkspaceCompileResult> {
  const supported = workspace.listProjectFiles !== undefined && workspace.readDerivedFile !== undefined && workspace.writeDerivedFile !== undefined;
  if (supported && workspace.readTrustedSourceCommit !== undefined) {
    const trustedBefore = await workspace.readTrustedSourceCommit();
    if (trustedBefore !== null && isProjectTrustedSourceCommit(trustedBefore)) {
      const artifact = await workspace.readDerivedFile!(PROJECT_COMPILER_CACHE_PATH);
      const verified = artifact === null ? null : verifyTrustedCacheArtifact(artifact, trustedBefore);
      if (verified?.status === "valid" && verified.files !== undefined) {
        const project = loadProject(verified.files);
        const compilation = compileProjectIncremental(project, { profile, previousCache: verified.cache });
        const trustedAfter = await workspace.readTrustedSourceCommit();
        if (trustedAfter === null || !isProjectTrustedSourceCommit(trustedAfter) || trustedAfter.version !== trustedBefore.version) throw new Error("Project files changed while reading trusted Compiler cache input");
        return { project, files: verified.files, hostVersion: trustedBefore.version, inventoryVersion: trustedBefore.version, cacheStatus: "hit", compilation };
      }
    }
  }

  const before = supported ? await workspace.listProjectFiles!() : undefined;
  const source = await workspace.readFiles();
  const project = loadProject(source.files);
  if (!supported) return { project, files: source.files, hostVersion: source.version, cacheStatus: "unsupported", compilation: compileProjectIncremental(project, { profile }) };
  const afterRead = await workspace.listProjectFiles!();
  if (before!.version !== afterRead.version) throw new Error("Project files changed while reading Compiler cache input");
  const artifact = await workspace.readDerivedFile!(PROJECT_COMPILER_CACHE_PATH);
  const verified = artifact === null ? null : verifyProjectCompilerCacheArtifact(artifact, source.files, afterRead.version);
  const cacheStatus: WorkspaceCompilerCacheStatus = artifact === null ? "miss" : verified?.status === "valid" ? "hit" : verified!.reason;
  const compilation = compileProjectIncremental(project, { profile, ...(verified?.status === "valid" ? { previousCache: verified.cache } : {}) });
  const afterCompile = await workspace.listProjectFiles!();
  if (afterCompile.version !== afterRead.version) throw new Error("Project files changed while compiling derived cache");
  await workspace.writeDerivedFile!(PROJECT_COMPILER_CACHE_PATH, createProjectCompilerCacheArtifact(source.files, afterCompile.version, compilation.cache));
  return { project, files: source.files, hostVersion: source.version, inventoryVersion: afterCompile.version, cacheStatus, compilation };
}

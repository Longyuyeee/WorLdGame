import {
  exportProjectBinaryZip,
  importProjectBinaryZip,
  loadProject,
  saveProject,
  type CanonicalProject,
  type ProjectFiles,
  type ProjectLifecycleSession
} from "@world-studio/project-domain";
import {
  AssetBlobError,
  assetBlobPath,
  createBlobDigest,
  parseAssetIndex,
  serializeAssetIndex,
  type AssetBlobStore,
  type AssetIndex,
  type BlobDigest
} from "@world-studio/project-persistence";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const BUNDLE_MANIFEST_PATH = ".world-assets/bundle.json";
const BUNDLE_INDEX_PATH = ".world-assets/index.json";
const BUNDLE_PREFIX = ".world-assets/";
const BUNDLE_LIMITS = { maxEntries: 4096, maxEntryBytes: 64 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024 } as const;

interface PortableBundleManifest {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly assetCount: number;
  readonly blobCount: number;
  readonly referencedBytes: number;
}

export interface PortableProjectBundleSource extends Pick<AssetBlobStore, "read"> {
  loadIndex(): Promise<AssetIndex>;
}

export interface ImportedPortableProjectBundle {
  readonly project: CanonicalProject;
  readonly index: AssetIndex;
  readonly blobs: ReadonlyMap<BlobDigest, Uint8Array>;
  readonly legacyTextOnly: boolean;
}

function blobArchivePath(digest: BlobDigest): string {
  return `${BUNDLE_PREFIX}${assetBlobPath(digest)}`;
}

function decodeText(path: string, bytes: Uint8Array): string {
  try { return decoder.decode(bytes); }
  catch { throw new AssetBlobError("INVALID_ASSET", "index", path, `${path} is not valid UTF-8 text`); }
}

function parseManifest(source: string): PortableBundleManifest {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new AssetBlobError("INVALID_ASSET", "index", BUNDLE_MANIFEST_PATH, "Portable asset manifest is not valid JSON"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AssetBlobError("INVALID_ASSET", "index", BUNDLE_MANIFEST_PATH, "Portable asset manifest header is invalid");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.projectId !== "string" ||
      !Number.isSafeInteger(record.assetCount) || (record.assetCount as number) < 0 ||
      !Number.isSafeInteger(record.blobCount) || (record.blobCount as number) < 0 ||
      !Number.isSafeInteger(record.referencedBytes) || (record.referencedBytes as number) < 0) {
    throw new AssetBlobError("INVALID_ASSET", "index", BUNDLE_MANIFEST_PATH, "Portable asset manifest fields are invalid");
  }
  return record as unknown as PortableBundleManifest;
}

export async function exportPortableProjectBundle(
  session: ProjectLifecycleSession,
  source: PortableProjectBundleSource
): Promise<Uint8Array> {
  if (session.project === null) throw new AssetBlobError("INVALID_ASSET", "index", session.projectId, "Read-only projects cannot be exported as portable bundles");
  const index = parseAssetIndex(serializeAssetIndex(await source.loadIndex()));
  const digests = [...new Set(index.assets.map((entry) => entry.source.digest))].sort();
  const files: Record<string, Uint8Array> = Object.fromEntries(
    Object.entries(saveProject(session.project)).map(([path, text]) => [path, encoder.encode(text)])
  );
  let referencedBytes = 0;
  for (const digest of digests) {
    const bytes = await source.read(digest);
    if (bytes === null || createBlobDigest(bytes) !== digest) throw new AssetBlobError("CORRUPT_BLOB", "read", digest, "Referenced source Blob is missing or corrupt during export");
    files[blobArchivePath(digest)] = bytes;
    referencedBytes += bytes.byteLength;
  }
  const manifest: PortableBundleManifest = {
    schemaVersion: 1,
    projectId: session.project.manifest.projectId,
    assetCount: index.assets.length,
    blobCount: digests.length,
    referencedBytes
  };
  files[BUNDLE_INDEX_PATH] = encoder.encode(serializeAssetIndex(index));
  files[BUNDLE_MANIFEST_PATH] = encoder.encode(JSON.stringify(manifest));
  return exportProjectBinaryZip(files);
}

export function importPortableProjectBundle(archive: Uint8Array): ImportedPortableProjectBundle {
  const binary = importProjectBinaryZip(archive, BUNDLE_LIMITS);
  const hasManifest = BUNDLE_MANIFEST_PATH in binary;
  const hasIndex = BUNDLE_INDEX_PATH in binary;
  if (hasManifest !== hasIndex) throw new AssetBlobError("INVALID_ASSET", "index", BUNDLE_PREFIX, "Portable asset manifest and index must both be present");
  const projectFiles: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(binary)) {
    if (!path.startsWith(BUNDLE_PREFIX)) projectFiles[path] = decodeText(path, bytes);
  }
  const project = loadProject(projectFiles as ProjectFiles);
  if (!hasManifest) return { project, index: { schemaVersion: 1, indexRevision: 0, assets: [] }, blobs: new Map(), legacyTextOnly: true };
  const manifest = parseManifest(decodeText(BUNDLE_MANIFEST_PATH, binary[BUNDLE_MANIFEST_PATH]!));
  if (manifest.projectId !== project.manifest.projectId) throw new AssetBlobError("INVALID_ASSET", "index", BUNDLE_MANIFEST_PATH, "Portable asset manifest belongs to a different project");
  const index = parseAssetIndex(decodeText(BUNDLE_INDEX_PATH, binary[BUNDLE_INDEX_PATH]!));
  const digests = [...new Set(index.assets.map((entry) => entry.source.digest))].sort();
  const blobs = new Map<BlobDigest, Uint8Array>();
  let referencedBytes = 0;
  for (const digest of digests) {
    const path = blobArchivePath(digest);
    const bytes = binary[path];
    const entries = index.assets.filter((entry) => entry.source.digest === digest);
    if (bytes === undefined || createBlobDigest(bytes) !== digest || entries.some((entry) => entry.source.byteLength !== bytes.byteLength)) {
      throw new AssetBlobError("CORRUPT_BLOB", "read", digest, "Portable bundle source Blob is missing, corrupt, or has the wrong size");
    }
    blobs.set(digest, bytes);
    referencedBytes += bytes.byteLength;
  }
  const allowed = new Set([BUNDLE_MANIFEST_PATH, BUNDLE_INDEX_PATH, ...digests.map(blobArchivePath)]);
  const unexpected = Object.keys(binary).find((path) => path.startsWith(BUNDLE_PREFIX) && !allowed.has(path));
  if (unexpected !== undefined) throw new AssetBlobError("INVALID_ASSET", "index", unexpected, "Portable bundle contains an unreferenced asset entry");
  if (manifest.assetCount !== index.assets.length || manifest.blobCount !== digests.length || manifest.referencedBytes !== referencedBytes) {
    throw new AssetBlobError("INVALID_ASSET", "index", BUNDLE_MANIFEST_PATH, "Portable asset manifest totals do not match the verified bundle");
  }
  return { project, index, blobs, legacyTextOnly: false };
}

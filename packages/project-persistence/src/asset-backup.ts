import {
  AssetBlobError,
  createBlobDigest,
  parseAssetIndex,
  serializeAssetIndex,
  type AssetIndex,
  type BlobDigest
} from "./asset-blob";
import {
  computeAssetReachability,
  type AssetLifecycleManifest,
  type AssetProtectionRoot
} from "./asset-lifecycle";

export interface AssetBackupSnapshot {
  readonly schemaVersion: 1;
  readonly slot: number;
  readonly sourceStorageRevision: number;
  readonly createdAtMs: number;
  readonly indexDigest: BlobDigest;
  readonly index: AssetIndex;
}

const MAX_BACKUP_SLOT = 19;

function fail(subject: string, detail: string): never {
  throw new AssetBlobError("INVALID_ASSET", "index", subject, detail);
}

function assertHeader(slot: number, sourceStorageRevision: number, createdAtMs: number): void {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot > MAX_BACKUP_SLOT ||
      !Number.isSafeInteger(sourceStorageRevision) || sourceStorageRevision < 0 ||
      !Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
    fail("asset-backup", "Asset backup slot, revision, or creation time is invalid");
  }
}

function indexDigest(index: AssetIndex): BlobDigest {
  return createBlobDigest(new TextEncoder().encode(serializeAssetIndex(index)));
}

export function assetBackupRecordId(slot: number, sourceStorageRevision: number): string {
  assertHeader(slot, sourceStorageRevision, 0);
  return `slot-${slot}:s${sourceStorageRevision}`;
}

export function assetBackupRootId(slot: number, sourceStorageRevision: number): string {
  return `backup:${assetBackupRecordId(slot, sourceStorageRevision)}`;
}

export function createAssetBackupSnapshot(
  index: AssetIndex,
  slot: number,
  sourceStorageRevision: number,
  createdAtMs: number
): AssetBackupSnapshot {
  assertHeader(slot, sourceStorageRevision, createdAtMs);
  const canonicalIndex = parseAssetIndex(serializeAssetIndex(index));
  return {
    schemaVersion: 1,
    slot,
    sourceStorageRevision,
    createdAtMs,
    indexDigest: indexDigest(canonicalIndex),
    index: canonicalIndex
  };
}

export function assetBackupProtectionRoot(snapshot: AssetBackupSnapshot): AssetProtectionRoot {
  return {
    rootId: assetBackupRootId(snapshot.slot, snapshot.sourceStorageRevision),
    kind: "backup",
    digests: snapshot.index.assets.map((entry) => entry.source.digest),
    createdAtMs: snapshot.createdAtMs
  };
}

export function replaceAssetBackupRoots(
  manifest: AssetLifecycleManifest,
  snapshots: readonly AssetBackupSnapshot[],
  expectedLifecycleRevision: number,
  nowMs: number
): AssetLifecycleManifest {
  if (manifest.lifecycleRevision !== expectedLifecycleRevision) {
    throw new AssetBlobError("STALE_LIFECYCLE_REVISION", "index", "asset-backups", "Lifecycle changed before backup root reconciliation");
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail("asset-backups", "Reconciliation time is invalid");
  const identities = new Set<string>();
  for (const snapshot of snapshots) {
    const identity = assetBackupRecordId(snapshot.slot, snapshot.sourceStorageRevision);
    if (identities.has(identity)) fail(identity, "Duplicate asset backup snapshot");
    identities.add(identity);
  }
  const provisional: AssetLifecycleManifest = {
    ...manifest,
    lifecycleRevision: manifest.lifecycleRevision + 1,
    roots: [
      ...manifest.roots.filter((root) => root.kind !== "backup"),
      ...snapshots.map(assetBackupProtectionRoot)
    ]
  };
  const reachable = computeAssetReachability(provisional, nowMs);
  return {
    ...provisional,
    roots: [...provisional.roots].sort((left, right) => left.rootId.localeCompare(right.rootId)),
    quarantine: provisional.quarantine.filter((entry) => !reachable.has(entry.digest))
  };
}

export function serializeAssetBackupSnapshot(snapshot: AssetBackupSnapshot): string {
  const canonical = createAssetBackupSnapshot(
    snapshot.index,
    snapshot.slot,
    snapshot.sourceStorageRevision,
    snapshot.createdAtMs
  );
  if (snapshot.schemaVersion !== 1 || snapshot.indexDigest !== canonical.indexDigest) {
    fail(assetBackupRecordId(snapshot.slot, snapshot.sourceStorageRevision), "Asset backup checksum is inconsistent");
  }
  return JSON.stringify(canonical);
}

export function parseAssetBackupSnapshot(source: string): AssetBackupSnapshot {
  let value: unknown;
  try { value = JSON.parse(source); } catch { return fail("asset-backup", "Asset backup is not valid JSON"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("asset-backup", "Asset backup envelope is invalid");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.slot !== "number" ||
      typeof record.sourceStorageRevision !== "number" || typeof record.createdAtMs !== "number" ||
      typeof record.indexDigest !== "string" || typeof record.index !== "object" || record.index === null) {
    fail("asset-backup", "Asset backup envelope is incomplete");
  }
  const index = parseAssetIndex(JSON.stringify(record.index));
  const snapshot = createAssetBackupSnapshot(index, record.slot, record.sourceStorageRevision, record.createdAtMs);
  if (snapshot.indexDigest !== record.indexDigest) fail(assetBackupRecordId(snapshot.slot, snapshot.sourceStorageRevision), "Asset backup checksum verification failed");
  return snapshot;
}

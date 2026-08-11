import {
  AssetBlobError,
  assetBackupProtectionRoot,
  assetBackupRecordId,
  auditAssetLifecycle,
  assertBlobDigest,
  auditAssetIndex,
  createAssetBackupSnapshot,
  createAssetLifecycleManifest,
  createAssetIndex,
  createBlobDigest,
  DEFAULT_ASSET_LIFECYCLE_POLICY,
  eligibleAssetGarbage,
  expiredTrashDigests,
  markAssetGarbageTrashed,
  markAssetTrashPurged,
  parseAssetBackupSnapshot,
  parseAssetIndex,
  parseAssetLifecycleManifest,
  planAssetGarbageCollection,
  prepareAssetMetadataSidecar,
  protectAssetRoot,
  registerAssetDerivative,
  replaceAssetBackupRoots,
  prepareAssetImport,
  restoreTrashedAsset,
  serializeAssetLifecycleManifest,
  serializeAssetBackupSnapshot,
  serializeAssetIndex,
  updateAssetLifecycleForIndex,
  type AssetBlobErrorCode,
  type AssetBlobOperation,
  type AssetBlobStore,
  type AssetImportInput,
  type AssetImportOptions,
  type AssetImportResult,
  type AssetBackupSnapshot,
  type AssetIndex,
  type AssetIndexAuditReport,
  type AssetLifecycleAuditReport,
  type AssetLifecycleManifest,
  type AssetLifecyclePolicy,
  type BlobDigest,
  type ProjectBackup,
  type ProjectWriterLease
} from "@world-studio/project-persistence";
import {
  ASSET_BACKUP_STORE_NAME,
  ASSET_BLOB_STORE_NAME,
  ASSET_INDEX_STORE_NAME,
  ASSET_LIFECYCLE_STORE_NAME,
  ASSET_TRASH_STORE_NAME,
  PROJECT_FILE_STORE_NAME,
  indexedDbRequestResult,
  indexedDbTransactionDone,
  matchesLiveWriterLease,
  openWorldStudioDatabase,
  readWriterLeaseState,
  writerLeaseKey
} from "./indexeddb-project-store";

export type IndexedDbAssetImportPhase = "blob-ready" | "index-publishing";

export interface IndexedDbAssetImportOptions extends AssetImportOptions {
  readonly signal?: AbortSignal;
  readonly onPhase?: (phase: IndexedDbAssetImportPhase) => void;
}

export interface IndexedDbAssetRepositoryOptions {
  readonly now?: () => number;
}

export interface AssetGarbageCollectionResult {
  readonly manifest: AssetLifecycleManifest;
  readonly audit: AssetLifecycleAuditReport;
  readonly affectedDigests: readonly BlobDigest[];
}

export interface IndexedDbAssetImportResult extends AssetImportResult {
  readonly lifecycle: AssetLifecycleManifest;
}

export interface AssetBackupReconciliationResult {
  readonly manifest: AssetLifecycleManifest;
  readonly linkedRecordIds: readonly string[];
  readonly unlinkedRecordIds: readonly string[];
}

export interface AssetDerivativeBuildResult {
  readonly manifest: AssetLifecycleManifest;
  readonly digest: BlobDigest;
  readonly blobStatus: "created" | "existing";
}

function cancelled(subject: string): AssetBlobError {
  return new AssetBlobError("CANCELLED", "index", subject, "Asset import was cancelled");
}

function assertNotCancelled(signal: AbortSignal | undefined, subject: string): void {
  if (signal?.aborted === true) throw cancelled(subject);
}

function storedBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export function normalizeIndexedDbAssetError(
  error: unknown,
  operation: AssetBlobOperation,
  subject: string,
  signal?: AbortSignal
): AssetBlobError {
  if (error instanceof AssetBlobError) return error;
  if (signal?.aborted === true) return cancelled(subject);
  const projectCode = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
  if (projectCode === "LEASE_REQUIRED" || projectCode === "LEASE_LOST") {
    return new AssetBlobError(projectCode, operation, subject, "Writer lease is required for asset publication");
  }
  const name = typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : "";
  const code: AssetBlobErrorCode = name === "QuotaExceededError"
    ? "NO_SPACE"
    : name === "NotAllowedError" || name === "SecurityError"
      ? "PERMISSION_DENIED"
      : name === "AbortError" || name === "TransactionInactiveError"
          ? "BUSY"
          : name === "InvalidStateError" || name === "VersionError"
            ? "UNAVAILABLE"
            : "IO_FAILURE";
  return new AssetBlobError(code, operation, subject, `IndexedDB asset ${operation} failed (${name || projectCode || "unknown"})`);
}

/**
 * Project-scoped Web repository. Blob publication and Asset Index publication share
 * one fenced IndexedDB transaction, so cancellation or failure rolls both back.
 */
export class IndexedDbAssetRepository implements AssetBlobStore {
  readonly capabilities = {
    backend: "indexeddb",
    immutableWrites: true,
    verifiedReads: true,
    durability: "browser-managed",
    workspaceScope: "origin-private"
  } as const;
  private readonly database: Promise<IDBDatabase>;
  private readonly now: () => number;
  private activeLease: ProjectWriterLease | null = null;

  constructor(
    indexedDb: IDBFactory,
    private readonly projectId: string,
    options: IndexedDbAssetRepositoryOptions = {}
  ) {
    this.database = openWorldStudioDatabase(indexedDb);
    this.now = options.now ?? Date.now;
  }

  activateWriterLease(lease: ProjectWriterLease | null): void {
    this.activeLease = lease;
  }

  async loadIndex(): Promise<AssetIndex> {
    try {
      const database = await this.database;
      const transaction = database.transaction(ASSET_INDEX_STORE_NAME, "readonly");
      const source = await indexedDbRequestResult(transaction.objectStore(ASSET_INDEX_STORE_NAME).get(this.projectId));
      await indexedDbTransactionDone(transaction);
      if (source === undefined) return createAssetIndex();
      if (typeof source !== "string") {
        throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored asset index is not UTF-8 JSON text");
      }
      return parseAssetIndex(source);
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "index", this.projectId);
    }
  }

  async loadLifecycle(): Promise<AssetLifecycleManifest> {
    try {
      const database = await this.database;
      const transaction = database.transaction([ASSET_INDEX_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME], "readonly");
      const indexSource = await indexedDbRequestResult(transaction.objectStore(ASSET_INDEX_STORE_NAME).get(this.projectId));
      const index = indexSource === undefined ? createAssetIndex() : typeof indexSource === "string"
        ? parseAssetIndex(indexSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored asset index is invalid"); })();
      const source = await indexedDbRequestResult(transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME).get(this.projectId));
      await indexedDbTransactionDone(transaction);
      const manifest = source === undefined ? createAssetLifecycleManifest(index, this.now()) : typeof source === "string"
        ? parseAssetLifecycleManifest(source)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored lifecycle manifest is invalid"); })();
      const audit = auditAssetLifecycle(manifest, index, this.now());
      if (audit.status === "fail") throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, audit.findings[0] ?? "Lifecycle audit failed");
      return manifest;
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "index", this.projectId);
    }
  }

  async importAsset(
    input: AssetImportInput,
    options: IndexedDbAssetImportOptions
  ): Promise<IndexedDbAssetImportResult> {
    assertNotCancelled(options.signal, input.assetId);
    const loadedIndex = await this.loadIndex();
    assertNotCancelled(options.signal, input.assetId);
    const prepared = prepareAssetImport(loadedIndex, input, options);
    const database = await this.database;
    const transaction = database.transaction(
      [PROJECT_FILE_STORE_NAME, ASSET_BLOB_STORE_NAME, ASSET_INDEX_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME],
      "readwrite",
      { durability: "strict" }
    );
    const cancelTransaction = () => {
      try { transaction.abort(); } catch { /* Transaction already completed. */ }
    };
    options.signal?.addEventListener("abort", cancelTransaction, { once: true });
    try {
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "index", input.assetId);
      const indexStore = transaction.objectStore(ASSET_INDEX_STORE_NAME);
      const persistedSource = await indexedDbRequestResult(indexStore.get(this.projectId));
      const persistedIndex = persistedSource === undefined
        ? createAssetIndex()
        : typeof persistedSource === "string"
          ? parseAssetIndex(persistedSource)
          : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored asset index is invalid"); })();
      if (persistedIndex.indexRevision !== options.expectedIndexRevision ||
          serializeAssetIndex(persistedIndex) !== serializeAssetIndex(loadedIndex)) {
        throw new AssetBlobError(
          "STALE_INDEX_REVISION",
          "index",
          input.assetId,
          `Asset index changed before publication; expected r${options.expectedIndexRevision}, current r${persistedIndex.indexRevision}`
        );
      }
      const lifecycleStore = transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME);
      const lifecycleSource = await indexedDbRequestResult(lifecycleStore.get(this.projectId));
      const lifecycle = lifecycleSource === undefined
        ? createAssetLifecycleManifest(persistedIndex, this.now())
        : typeof lifecycleSource === "string"
          ? parseAssetLifecycleManifest(lifecycleSource)
          : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored lifecycle manifest is invalid"); })();
      const lifecycleAudit = auditAssetLifecycle(lifecycle, persistedIndex, this.now());
      if (lifecycleAudit.status === "fail") throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, lifecycleAudit.findings[0] ?? "Lifecycle audit failed");
      assertNotCancelled(options.signal, input.assetId);
      const blobStore = transaction.objectStore(ASSET_BLOB_STORE_NAME);
      const key = this.blobKey(prepared.digest);
      const existingValue = await indexedDbRequestResult(blobStore.get(key));
      let blobStatus: "created" | "existing";
      if (existingValue === undefined) {
        blobStore.put(input.bytes.slice(), key);
        blobStatus = "created";
      } else {
        const existing = storedBytes(existingValue);
        if (existing === null || createBlobDigest(existing) !== prepared.digest) {
          throw new AssetBlobError("CORRUPT_BLOB", "put", prepared.digest, "Existing IndexedDB blob failed SHA-256 verification");
        }
        blobStatus = "existing";
      }
      options.onPhase?.("blob-ready");
      assertNotCancelled(options.signal, input.assetId);
      options.onPhase?.("index-publishing");
      indexStore.put(serializeAssetIndex(prepared.index), this.projectId);
      const nextLifecycle = updateAssetLifecycleForIndex(lifecycle, persistedIndex, prepared.index, this.now());
      lifecycleStore.put(serializeAssetLifecycleManifest(nextLifecycle), this.projectId);
      await indexedDbTransactionDone(transaction);
      return { index: prepared.index, entry: prepared.entry, blobStatus, lifecycle: nextLifecycle };
    } catch (error) {
      cancelTransaction();
      throw normalizeIndexedDbAssetError(error, "index", input.assetId, options.signal);
    } finally {
      options.signal?.removeEventListener("abort", cancelTransaction);
    }
  }

  async put(digest: BlobDigest, bytes: Uint8Array): Promise<"created" | "existing"> {
    assertBlobDigest(digest, "put");
    if (createBlobDigest(bytes) !== digest) {
      throw new AssetBlobError("DIGEST_MISMATCH", "put", digest, "Input bytes do not match the claimed digest");
    }
    try {
      const database = await this.database;
      const transaction = database.transaction(
        [PROJECT_FILE_STORE_NAME, ASSET_BLOB_STORE_NAME],
        "readwrite",
        { durability: "strict" }
      );
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "put", digest);
      const store = transaction.objectStore(ASSET_BLOB_STORE_NAME);
      const key = this.blobKey(digest);
      const existingValue = await indexedDbRequestResult(store.get(key));
      if (existingValue !== undefined) {
        const existing = storedBytes(existingValue);
        if (existing === null || createBlobDigest(existing) !== digest) {
          transaction.abort();
          throw new AssetBlobError("CORRUPT_BLOB", "put", digest, "Existing IndexedDB blob failed SHA-256 verification");
        }
        await indexedDbTransactionDone(transaction);
        return "existing";
      }
      store.put(bytes.slice(), key);
      await indexedDbTransactionDone(transaction);
      return "created";
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "put", digest);
    }
  }

  async read(digest: BlobDigest): Promise<Uint8Array | null> {
    assertBlobDigest(digest, "read");
    try {
      const database = await this.database;
      const transaction = database.transaction(ASSET_BLOB_STORE_NAME, "readonly");
      const value = await indexedDbRequestResult(transaction.objectStore(ASSET_BLOB_STORE_NAME).get(this.blobKey(digest)));
      await indexedDbTransactionDone(transaction);
      if (value === undefined) return null;
      const bytes = storedBytes(value);
      if (bytes === null || createBlobDigest(bytes) !== digest) {
        throw new AssetBlobError("CORRUPT_BLOB", "read", digest, "Stored IndexedDB blob failed SHA-256 verification");
      }
      return bytes.slice();
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "read", digest);
    }
  }

  async list(): Promise<readonly BlobDigest[]> {
    try {
      const database = await this.database;
      const transaction = database.transaction(ASSET_BLOB_STORE_NAME, "readonly");
      const keys = await indexedDbRequestResult(transaction.objectStore(ASSET_BLOB_STORE_NAME).getAllKeys());
      await indexedDbTransactionDone(transaction);
      const prefix = `${this.projectId}/`;
      const digests = keys
        .filter((key): key is string => typeof key === "string" && key.startsWith(prefix))
        .map((key) => key.slice(prefix.length) as BlobDigest);
      for (const digest of digests) assertBlobDigest(digest, "read");
      return digests.sort();
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "read", this.projectId);
    }
  }

  async audit(): Promise<AssetIndexAuditReport> {
    return auditAssetIndex(this, await this.loadIndex());
  }

  async auditLifecycle(): Promise<AssetLifecycleAuditReport> {
    return auditAssetLifecycle(await this.loadLifecycle(), await this.loadIndex(), this.now());
  }

  async stageBackupSnapshot(
    slot: number,
    sourceStorageRevision: number,
    createdAtMs: number
  ): Promise<{ readonly snapshot: AssetBackupSnapshot; readonly manifest: AssetLifecycleManifest }> {
    try {
      const database = await this.database;
      const transaction = database.transaction(
        [PROJECT_FILE_STORE_NAME, ASSET_INDEX_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME, ASSET_BACKUP_STORE_NAME],
        "readwrite", { durability: "strict" }
      );
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "index", "asset-backup-stage");
      const indexSource = await indexedDbRequestResult(transaction.objectStore(ASSET_INDEX_STORE_NAME).get(this.projectId));
      const index = indexSource === undefined ? createAssetIndex() : typeof indexSource === "string" ? parseAssetIndex(indexSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored asset index is invalid"); })();
      const lifecycleStore = transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME);
      const lifecycleSource = await indexedDbRequestResult(lifecycleStore.get(this.projectId));
      const lifecycle = lifecycleSource === undefined ? createAssetLifecycleManifest(index, createdAtMs) : typeof lifecycleSource === "string"
        ? parseAssetLifecycleManifest(lifecycleSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored lifecycle manifest is invalid"); })();
      const audit = auditAssetLifecycle(lifecycle, index, createdAtMs);
      if (audit.status === "fail") throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, audit.findings[0] ?? "Lifecycle audit failed");
      const snapshot = createAssetBackupSnapshot(index, slot, sourceStorageRevision, createdAtMs);
      const manifest = protectAssetRoot(lifecycle, assetBackupProtectionRoot(snapshot), lifecycle.lifecycleRevision);
      transaction.objectStore(ASSET_BACKUP_STORE_NAME).put(
        serializeAssetBackupSnapshot(snapshot),
        this.backupKey(snapshot.slot, snapshot.sourceStorageRevision)
      );
      lifecycleStore.put(serializeAssetLifecycleManifest(manifest), this.projectId);
      await indexedDbTransactionDone(transaction);
      return { snapshot, manifest };
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "index", "asset-backup-stage");
    }
  }

  async reconcileBackupSnapshots(
    backups: readonly Pick<ProjectBackup, "slot" | "sourceStorageRevision">[]
  ): Promise<AssetBackupReconciliationResult> {
    const nowMs = this.now();
    try {
      const database = await this.database;
      const transaction = database.transaction(
        [PROJECT_FILE_STORE_NAME, ASSET_INDEX_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME, ASSET_BACKUP_STORE_NAME],
        "readwrite", { durability: "strict" }
      );
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "index", "asset-backup-reconcile");
      const indexSource = await indexedDbRequestResult(transaction.objectStore(ASSET_INDEX_STORE_NAME).get(this.projectId));
      const index = indexSource === undefined ? createAssetIndex() : typeof indexSource === "string" ? parseAssetIndex(indexSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored asset index is invalid"); })();
      const lifecycleStore = transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME);
      const lifecycleSource = await indexedDbRequestResult(lifecycleStore.get(this.projectId));
      const lifecycle = lifecycleSource === undefined ? createAssetLifecycleManifest(index, nowMs) : typeof lifecycleSource === "string"
        ? parseAssetLifecycleManifest(lifecycleSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored lifecycle manifest is invalid"); })();
      const backupStore = transaction.objectStore(ASSET_BACKUP_STORE_NAME);
      const keysRequest = backupStore.getAllKeys();
      const valuesRequest = backupStore.getAll();
      const [keys, values] = await Promise.all([
        indexedDbRequestResult(keysRequest),
        indexedDbRequestResult(valuesRequest)
      ]);
      const prefix = `${this.projectId}/`;
      const records = new Map<string, AssetBackupSnapshot>();
      keys.forEach((key, item) => {
        if (typeof key !== "string" || !key.startsWith(prefix)) return;
        const source = values[item];
        if (typeof source !== "string") throw new AssetBlobError("INVALID_ASSET", "index", key, "Stored asset backup is invalid");
        const snapshot = parseAssetBackupSnapshot(source);
        const recordId = assetBackupRecordId(snapshot.slot, snapshot.sourceStorageRevision);
        if (key !== `${prefix}${recordId}` || records.has(recordId)) {
          throw new AssetBlobError("INVALID_ASSET", "index", key, "Asset backup key does not match its envelope");
        }
        records.set(recordId, snapshot);
      });
      const linked: AssetBackupSnapshot[] = [];
      const linkedRecordIds: string[] = [];
      const unlinkedRecordIds: string[] = [];
      const activeRecordIds = new Set(backups.map((backup) => assetBackupRecordId(backup.slot, backup.sourceStorageRevision)));
      for (const recordId of activeRecordIds) {
        const snapshot = records.get(recordId);
        if (snapshot === undefined) unlinkedRecordIds.push(recordId);
        else { linked.push(snapshot); linkedRecordIds.push(recordId); }
      }
      for (const [recordId, snapshot] of records) {
        if (!activeRecordIds.has(recordId)) backupStore.delete(this.backupKey(snapshot.slot, snapshot.sourceStorageRevision));
      }
      const manifest = replaceAssetBackupRoots(lifecycle, linked, lifecycle.lifecycleRevision, nowMs);
      lifecycleStore.put(serializeAssetLifecycleManifest(manifest), this.projectId);
      await indexedDbTransactionDone(transaction);
      return {
        manifest,
        linkedRecordIds: linkedRecordIds.sort(),
        unlinkedRecordIds: unlinkedRecordIds.sort()
      };
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "index", "asset-backup-reconcile");
    }
  }

  async buildMetadataSidecar(assetId: string): Promise<AssetDerivativeBuildResult> {
    const nowMs = this.now();
    try {
      const database = await this.database;
      const transaction = database.transaction(
        [PROJECT_FILE_STORE_NAME, ASSET_BLOB_STORE_NAME, ASSET_INDEX_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME],
        "readwrite", { durability: "strict" }
      );
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "index", assetId);
      const indexSource = await indexedDbRequestResult(transaction.objectStore(ASSET_INDEX_STORE_NAME).get(this.projectId));
      const index = indexSource === undefined ? createAssetIndex() : typeof indexSource === "string" ? parseAssetIndex(indexSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored asset index is invalid"); })();
      const entry = index.assets.find((candidate) => candidate.assetId === assetId);
      if (entry === undefined) throw new AssetBlobError("INVALID_ASSET", "index", assetId, "Asset does not exist");
      const lifecycleStore = transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME);
      const lifecycleSource = await indexedDbRequestResult(lifecycleStore.get(this.projectId));
      let lifecycle = lifecycleSource === undefined ? createAssetLifecycleManifest(index, nowMs) : typeof lifecycleSource === "string"
        ? parseAssetLifecycleManifest(lifecycleSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored lifecycle manifest is invalid"); })();
      const audit = auditAssetLifecycle(lifecycle, index, nowMs);
      if (audit.status === "fail") throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, audit.findings[0] ?? "Lifecycle audit failed");
      const prepared = prepareAssetMetadataSidecar(entry);
      const blobStore = transaction.objectStore(ASSET_BLOB_STORE_NAME);
      const sourceValue = await indexedDbRequestResult(blobStore.get(this.blobKey(prepared.parentDigest)));
      const sourceBytes = storedBytes(sourceValue);
      if (sourceBytes === null || createBlobDigest(sourceBytes) !== prepared.parentDigest) {
        throw new AssetBlobError("CORRUPT_BLOB", "read", prepared.parentDigest, "Derivative source is missing or corrupt");
      }
      const outputKey = this.blobKey(prepared.digest);
      const outputValue = await indexedDbRequestResult(blobStore.get(outputKey));
      let blobStatus: "created" | "existing" = "existing";
      if (outputValue === undefined) {
        blobStore.put(prepared.bytes.slice(), outputKey);
        blobStatus = "created";
      } else {
        const outputBytes = storedBytes(outputValue);
        if (outputBytes === null || createBlobDigest(outputBytes) !== prepared.digest) {
          throw new AssetBlobError("CORRUPT_BLOB", "put", prepared.digest, "Existing derivative Blob is corrupt");
        }
      }
      if (!lifecycle.nodes.some((node) => node.digest === prepared.digest)) {
        lifecycle = registerAssetDerivative(lifecycle, {
          digest: prepared.digest,
          byteLength: prepared.byteLength,
          mimeType: prepared.mimeType,
          parents: [prepared.parentDigest],
          recipeDigest: prepared.recipeDigest,
          recipeName: prepared.recipeName,
          createdAtMs: nowMs
        }, lifecycle.lifecycleRevision);
      }
      const rootId = `build:sidecar:${assetId}`;
      const existingRoot = lifecycle.roots.find((root) => root.rootId === rootId);
      if (existingRoot?.kind !== "build" || existingRoot.digests.length !== 1 || existingRoot.digests[0] !== prepared.digest) {
        lifecycle = protectAssetRoot(lifecycle, {
          rootId,
          kind: "build",
          digests: [prepared.digest],
          createdAtMs: nowMs
        }, lifecycle.lifecycleRevision);
      }
      lifecycleStore.put(serializeAssetLifecycleManifest(lifecycle), this.projectId);
      await indexedDbTransactionDone(transaction);
      return { manifest: lifecycle, digest: prepared.digest, blobStatus };
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "index", assetId);
    }
  }

  async planGarbageCollection(
    policy: AssetLifecyclePolicy = DEFAULT_ASSET_LIFECYCLE_POLICY
  ): Promise<AssetGarbageCollectionResult> {
    const nowMs = this.now();
    try {
      const database = await this.database;
      const transaction = database.transaction(
        [PROJECT_FILE_STORE_NAME, ASSET_BLOB_STORE_NAME, ASSET_INDEX_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME],
        "readwrite", { durability: "strict" }
      );
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "index", "asset-gc-plan");
      const indexSource = await indexedDbRequestResult(transaction.objectStore(ASSET_INDEX_STORE_NAME).get(this.projectId));
      const index = indexSource === undefined ? createAssetIndex() : typeof indexSource === "string" ? parseAssetIndex(indexSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored asset index is invalid"); })();
      const lifecycleStore = transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME);
      const lifecycleSource = await indexedDbRequestResult(lifecycleStore.get(this.projectId));
      const lifecycle = lifecycleSource === undefined ? createAssetLifecycleManifest(index, nowMs) : typeof lifecycleSource === "string"
        ? parseAssetLifecycleManifest(lifecycleSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored lifecycle manifest is invalid"); })();
      const audit = auditAssetLifecycle(lifecycle, index, nowMs);
      if (audit.status === "fail") throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, audit.findings[0] ?? "Lifecycle audit failed");
      const prefix = `${this.projectId}/`;
      const keys = await indexedDbRequestResult(transaction.objectStore(ASSET_BLOB_STORE_NAME).getAllKeys());
      const digests = keys.filter((key): key is string => typeof key === "string" && key.startsWith(prefix))
        .map((key) => key.slice(prefix.length) as BlobDigest);
      const existingQuarantine = new Set(lifecycle.quarantine.map((entry) => entry.digest));
      const planned = planAssetGarbageCollection(lifecycle, digests, nowMs, policy);
      lifecycleStore.put(serializeAssetLifecycleManifest(planned), this.projectId);
      await indexedDbTransactionDone(transaction);
      return {
        manifest: planned,
        audit: auditAssetLifecycle(planned, index, nowMs),
        affectedDigests: planned.quarantine.filter((entry) => !existingQuarantine.has(entry.digest)).map((entry) => entry.digest)
      };
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "index", "asset-gc-plan");
    }
  }

  async sweepGarbageCollection(
    policy: AssetLifecyclePolicy = DEFAULT_ASSET_LIFECYCLE_POLICY
  ): Promise<AssetGarbageCollectionResult> {
    const nowMs = this.now();
    try {
      const database = await this.database;
      const transaction = database.transaction(
        [PROJECT_FILE_STORE_NAME, ASSET_BLOB_STORE_NAME, ASSET_INDEX_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME, ASSET_TRASH_STORE_NAME],
        "readwrite", { durability: "strict" }
      );
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "index", "asset-gc-sweep");
      const indexSource = await indexedDbRequestResult(transaction.objectStore(ASSET_INDEX_STORE_NAME).get(this.projectId));
      const index = indexSource === undefined ? createAssetIndex() : typeof indexSource === "string" ? parseAssetIndex(indexSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored asset index is invalid"); })();
      const lifecycleStore = transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME);
      const lifecycleSource = await indexedDbRequestResult(lifecycleStore.get(this.projectId));
      const lifecycle = lifecycleSource === undefined ? createAssetLifecycleManifest(index, nowMs) : typeof lifecycleSource === "string"
        ? parseAssetLifecycleManifest(lifecycleSource)
        : (() => { throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, "Stored lifecycle manifest is invalid"); })();
      const audit = auditAssetLifecycle(lifecycle, index, nowMs);
      if (audit.status === "fail") throw new AssetBlobError("INVALID_ASSET", "index", this.projectId, audit.findings[0] ?? "Lifecycle audit failed");
      const eligible = eligibleAssetGarbage(lifecycle, nowMs);
      const blobStore = transaction.objectStore(ASSET_BLOB_STORE_NAME);
      const trashStore = transaction.objectStore(ASSET_TRASH_STORE_NAME);
      const moved: Array<{ digest: BlobDigest; byteLength: number }> = [];
      for (const digest of eligible) {
        const key = this.blobKey(digest);
        const value = await indexedDbRequestResult(blobStore.get(key));
        const bytes = storedBytes(value);
        if (bytes === null || createBlobDigest(bytes) !== digest) throw new AssetBlobError("CORRUPT_BLOB", "read", digest, "GC candidate is missing or corrupt");
        trashStore.put(bytes.slice(), key);
        blobStore.delete(key);
        moved.push({ digest, byteLength: bytes.byteLength });
      }
      const next = markAssetGarbageTrashed(lifecycle, moved, nowMs, policy);
      lifecycleStore.put(serializeAssetLifecycleManifest(next), this.projectId);
      await indexedDbTransactionDone(transaction);
      return { manifest: next, audit: auditAssetLifecycle(next, index, nowMs), affectedDigests: eligible };
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "index", "asset-gc-sweep");
    }
  }

  async restoreTrash(
    digest: BlobDigest,
    policy: AssetLifecyclePolicy = DEFAULT_ASSET_LIFECYCLE_POLICY
  ): Promise<AssetLifecycleManifest> {
    assertBlobDigest(digest, "read");
    const nowMs = this.now();
    try {
      const database = await this.database;
      const transaction = database.transaction(
        [PROJECT_FILE_STORE_NAME, ASSET_BLOB_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME, ASSET_TRASH_STORE_NAME],
        "readwrite", { durability: "strict" }
      );
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "index", digest);
      const lifecycleStore = transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME);
      const source = await indexedDbRequestResult(lifecycleStore.get(this.projectId));
      if (typeof source !== "string") throw new AssetBlobError("TRASH_NOT_FOUND", "read", digest, "Lifecycle manifest has no trash entry");
      const lifecycle = parseAssetLifecycleManifest(source);
      const trashStore = transaction.objectStore(ASSET_TRASH_STORE_NAME);
      const value = await indexedDbRequestResult(trashStore.get(this.blobKey(digest)));
      const bytes = storedBytes(value);
      if (bytes === null || createBlobDigest(bytes) !== digest) throw new AssetBlobError("CORRUPT_BLOB", "read", digest, "Recoverable trash content is missing or corrupt");
      transaction.objectStore(ASSET_BLOB_STORE_NAME).put(bytes.slice(), this.blobKey(digest));
      trashStore.delete(this.blobKey(digest));
      const next = restoreTrashedAsset(lifecycle, digest, nowMs, policy);
      lifecycleStore.put(serializeAssetLifecycleManifest(next), this.projectId);
      await indexedDbTransactionDone(transaction);
      return next;
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "read", digest);
    }
  }

  async purgeExpiredTrash(): Promise<readonly BlobDigest[]> {
    const nowMs = this.now();
    try {
      const database = await this.database;
      const transaction = database.transaction(
        [PROJECT_FILE_STORE_NAME, ASSET_LIFECYCLE_STORE_NAME, ASSET_TRASH_STORE_NAME],
        "readwrite", { durability: "strict" }
      );
      await this.assertActiveLease(transaction.objectStore(PROJECT_FILE_STORE_NAME), "index", "asset-trash-purge");
      const lifecycleStore = transaction.objectStore(ASSET_LIFECYCLE_STORE_NAME);
      const source = await indexedDbRequestResult(lifecycleStore.get(this.projectId));
      if (typeof source !== "string") { await indexedDbTransactionDone(transaction); return []; }
      const lifecycle = parseAssetLifecycleManifest(source);
      const expired = expiredTrashDigests(lifecycle, nowMs);
      if (expired.length === 0) { await indexedDbTransactionDone(transaction); return []; }
      const trashStore = transaction.objectStore(ASSET_TRASH_STORE_NAME);
      for (const digest of expired) trashStore.delete(this.blobKey(digest));
      lifecycleStore.put(serializeAssetLifecycleManifest(markAssetTrashPurged(lifecycle, expired, nowMs)), this.projectId);
      await indexedDbTransactionDone(transaction);
      return expired;
    } catch (error) {
      throw normalizeIndexedDbAssetError(error, "index", "asset-trash-purge");
    }
  }

  private blobKey(digest: BlobDigest): string {
    return `${this.projectId}/${digest}`;
  }

  private backupKey(slot: number, sourceStorageRevision: number): string {
    return `${this.projectId}/${assetBackupRecordId(slot, sourceStorageRevision)}`;
  }

  private async assertActiveLease(
    store: IDBObjectStore,
    operation: AssetBlobOperation,
    subject: string
  ): Promise<void> {
    const active = this.activeLease;
    if (active === null) {
      throw new AssetBlobError("LEASE_REQUIRED", operation, subject, "A writer lease is required for asset publication");
    }
    const state = readWriterLeaseState(await indexedDbRequestResult(store.get(writerLeaseKey(this.projectId))));
    if (!matchesLiveWriterLease(state.holder, active, this.now())) {
      this.activeLease = null;
      throw new AssetBlobError("LEASE_LOST", operation, subject, "Writer lease was lost before asset publication");
    }
  }
}

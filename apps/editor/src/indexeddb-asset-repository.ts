import {
  AssetBlobError,
  assertBlobDigest,
  auditAssetIndex,
  createAssetIndex,
  createBlobDigest,
  parseAssetIndex,
  prepareAssetImport,
  serializeAssetIndex,
  type AssetBlobErrorCode,
  type AssetBlobOperation,
  type AssetBlobStore,
  type AssetImportInput,
  type AssetImportOptions,
  type AssetImportResult,
  type AssetIndex,
  type AssetIndexAuditReport,
  type BlobDigest,
  type ProjectWriterLease
} from "@world-studio/project-persistence";
import {
  ASSET_BLOB_STORE_NAME,
  ASSET_INDEX_STORE_NAME,
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

  async importAsset(
    input: AssetImportInput,
    options: IndexedDbAssetImportOptions
  ): Promise<AssetImportResult> {
    assertNotCancelled(options.signal, input.assetId);
    const loadedIndex = await this.loadIndex();
    assertNotCancelled(options.signal, input.assetId);
    const prepared = prepareAssetImport(loadedIndex, input, options);
    const database = await this.database;
    const transaction = database.transaction(
      [PROJECT_FILE_STORE_NAME, ASSET_BLOB_STORE_NAME, ASSET_INDEX_STORE_NAME],
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
      await indexedDbTransactionDone(transaction);
      return { index: prepared.index, entry: prepared.entry, blobStatus };
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

  private blobKey(digest: BlobDigest): string {
    return `${this.projectId}/${digest}`;
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

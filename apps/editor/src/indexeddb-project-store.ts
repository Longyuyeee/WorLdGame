import {
  ProjectStoreError,
  assertProjectStorePath,
  type ProjectFileStore,
  type ProjectStoreOperation,
  type ProjectWriterLease,
  type ProjectWriterLeaseCoordinator,
  type WriterLeaseAcquisition,
  type WriterLeaseRenewal
} from "@world-studio/project-persistence";

export const WORLD_STUDIO_DATABASE_NAME = "world-studio-local-projects";
export const WORLD_STUDIO_DATABASE_VERSION = 2;
export const PROJECT_FILE_STORE_NAME = "project-files";
export const ASSET_BLOB_STORE_NAME = "asset-blobs";
export const ASSET_INDEX_STORE_NAME = "asset-indexes";
const STORE_NAME = PROJECT_FILE_STORE_NAME;
const LEASE_ERROR_PATH = "coordination/writer-lease";

export interface WriterLeaseState {
  readonly schemaVersion: 0;
  readonly lastFencingToken: number;
  readonly holder: ProjectWriterLease | null;
}

export interface IndexedDbProjectFileStoreOptions {
  readonly now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readWriterLeaseState(value: unknown): WriterLeaseState {
  if (value === undefined) return { schemaVersion: 0, lastFencingToken: 0, holder: null };
  if (!isRecord(value) || value.schemaVersion !== 0 ||
      !Number.isSafeInteger(value.lastFencingToken) || (value.lastFencingToken as number) < 0) {
    throw new ProjectStoreError("IO_FAILURE", "read", LEASE_ERROR_PATH, "Writer lease state is corrupt");
  }
  if (value.holder === null) {
    return { schemaVersion: 0, lastFencingToken: value.lastFencingToken as number, holder: null };
  }
  if (!isRecord(value.holder) || typeof value.holder.ownerId !== "string" ||
      !Number.isSafeInteger(value.holder.fencingToken) ||
      !Number.isSafeInteger(value.holder.expiresAtMs) ||
      value.holder.fencingToken !== value.lastFencingToken) {
    throw new ProjectStoreError("IO_FAILURE", "read", LEASE_ERROR_PATH, "Writer lease holder is corrupt");
  }
  return {
    schemaVersion: 0,
    lastFencingToken: value.lastFencingToken as number,
    holder: {
      ownerId: value.holder.ownerId,
      fencingToken: value.holder.fencingToken as number,
      expiresAtMs: value.holder.expiresAtMs as number
    }
  };
}

export function writerLeaseKey(projectId: string): string {
  return `__world_studio_writer_lease__/${projectId}`;
}

export function matchesLiveWriterLease(
  holder: ProjectWriterLease | null,
  lease: ProjectWriterLease,
  nowMs: number
): holder is ProjectWriterLease {
  return holder !== null && holder.ownerId === lease.ownerId &&
    holder.fencingToken === lease.fencingToken && holder.expiresAtMs > nowMs;
}

function validateLeaseRequest(ownerId: string, nowMs: number, ttlMs: number): void {
  assertProjectStorePath(ownerId, "write");
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300_000 ||
      !Number.isSafeInteger(nowMs + ttlMs)) {
    throw new ProjectStoreError("IO_FAILURE", "write", LEASE_ERROR_PATH, "Writer lease timing is invalid");
  }
}

function indexedDbError(
  error: unknown,
  operation: ProjectStoreOperation,
  path: string
): ProjectStoreError {
  if (error instanceof ProjectStoreError) return error;
  const name = error instanceof DOMException ? error.name : "";
  const code = name === "QuotaExceededError"
    ? "NO_SPACE"
    : name === "NotAllowedError" || name === "SecurityError"
      ? "PERMISSION_DENIED"
      : name === "AbortError" || name === "TransactionInactiveError"
        ? "BUSY"
        : name === "InvalidStateError"
          ? "UNAVAILABLE"
          : "IO_FAILURE";
  return new ProjectStoreError(code, operation, path, `IndexedDB ${operation} failed (${name || "unknown"})`);
}

export function indexedDbRequestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}

export function indexedDbTransactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}

export function openWorldStudioDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(WORLD_STUDIO_DATABASE_NAME, WORLD_STUDIO_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      for (const storeName of [PROJECT_FILE_STORE_NAME, ASSET_BLOB_STORE_NAME, ASSET_INDEX_STORE_NAME]) {
        if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
      }
    });
    request.addEventListener("success", () => {
      request.result.addEventListener("versionchange", () => request.result.close());
      resolve(request.result);
    }, { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Cannot open IndexedDB")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("IndexedDB upgrade is blocked by another tab")), { once: true });
  });
}

export class IndexedDbProjectFileStore implements ProjectFileStore, ProjectWriterLeaseCoordinator {
  readonly capabilities = {
    backend: "indexeddb",
    atomicWrite: true,
    atomicReplace: true,
    durability: "browser-managed",
    workspaceScope: "origin-private",
    directoryMetadata: "not-applicable",
    writerCoordination: "fenced-lease"
  } as const;
  private readonly database: Promise<IDBDatabase>;
  private readonly now: () => number;
  private activeLease: ProjectWriterLease | null = null;

  constructor(
    indexedDb: IDBFactory,
    private readonly projectId: string,
    options: IndexedDbProjectFileStoreOptions = {}
  ) {
    assertProjectStorePath(projectId, "read");
    this.now = options.now ?? Date.now;
    this.database = openWorldStudioDatabase(indexedDb);
  }

  async acquire(ownerId: string, nowMs: number, ttlMs: number): Promise<WriterLeaseAcquisition> {
    validateLeaseRequest(ownerId, nowMs, ttlMs);
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
      const store = transaction.objectStore(STORE_NAME);
      const state = readWriterLeaseState(await indexedDbRequestResult(store.get(this.leaseKey())));
      const holder = state.holder;
      if (holder !== null && holder.expiresAtMs > nowMs && holder.ownerId !== ownerId) {
        await indexedDbTransactionDone(transaction);
        return { status: "held", holderExpiresAtMs: holder.expiresAtMs };
      }
      const sameLiveOwner = holder !== null && holder.ownerId === ownerId && holder.expiresAtMs > nowMs;
      const fencingToken = sameLiveOwner ? holder.fencingToken : state.lastFencingToken + 1;
      if (!Number.isSafeInteger(fencingToken)) {
        transaction.abort();
        throw new ProjectStoreError("IO_FAILURE", "write", LEASE_ERROR_PATH, "Writer fencing token overflow");
      }
      const lease: ProjectWriterLease = {
        ownerId,
        fencingToken,
        expiresAtMs: sameLiveOwner
          ? Math.max(holder.expiresAtMs, nowMs + ttlMs)
          : nowMs + ttlMs
      };
      const next: WriterLeaseState = {
        schemaVersion: 0,
        lastFencingToken: fencingToken,
        holder: lease
      };
      store.put(next, this.leaseKey());
      await indexedDbTransactionDone(transaction);
      return { status: "acquired", lease };
    } catch (error) {
      throw indexedDbError(error, "write", LEASE_ERROR_PATH);
    }
  }

  async renew(lease: ProjectWriterLease, nowMs: number, ttlMs: number): Promise<WriterLeaseRenewal> {
    validateLeaseRequest(lease.ownerId, nowMs, ttlMs);
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
      const store = transaction.objectStore(STORE_NAME);
      const state = readWriterLeaseState(await indexedDbRequestResult(store.get(this.leaseKey())));
      if (!matchesLiveWriterLease(state.holder, lease, nowMs)) {
        await indexedDbTransactionDone(transaction);
        return { status: "lost" };
      }
      const renewed: ProjectWriterLease = {
        ...lease,
        expiresAtMs: Math.max(state.holder.expiresAtMs, nowMs + ttlMs)
      };
      store.put({ ...state, holder: renewed } satisfies WriterLeaseState, this.leaseKey());
      await indexedDbTransactionDone(transaction);
      return { status: "renewed", lease: renewed };
    } catch (error) {
      throw indexedDbError(error, "write", LEASE_ERROR_PATH);
    }
  }

  async release(lease: ProjectWriterLease): Promise<boolean> {
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
      const store = transaction.objectStore(STORE_NAME);
      const state = readWriterLeaseState(await indexedDbRequestResult(store.get(this.leaseKey())));
      if (state.holder?.ownerId !== lease.ownerId ||
          state.holder.fencingToken !== lease.fencingToken) {
        await indexedDbTransactionDone(transaction);
        return false;
      }
      store.put({ ...state, holder: null } satisfies WriterLeaseState, this.leaseKey());
      await indexedDbTransactionDone(transaction);
      if (this.activeLease?.ownerId === lease.ownerId &&
          this.activeLease.fencingToken === lease.fencingToken) {
        this.activeLease = null;
      }
      return true;
    } catch (error) {
      throw indexedDbError(error, "remove", LEASE_ERROR_PATH);
    }
  }

  activateWriterLease(lease: ProjectWriterLease | null): void {
    this.activeLease = lease;
  }

  async read(path: string): Promise<string | null> {
    assertProjectStorePath(path, "read");
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readonly");
      const value = await indexedDbRequestResult(transaction.objectStore(STORE_NAME).get(this.key(path)));
      await indexedDbTransactionDone(transaction);
      return typeof value === "string" ? value : null;
    } catch (error) {
      throw indexedDbError(error, "read", path);
    }
  }

  async write(path: string, content: string): Promise<void> {
    assertProjectStorePath(path, "write");
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
      const store = transaction.objectStore(STORE_NAME);
      await this.assertActiveLease(store, "write", path);
      store.put(content, this.key(path));
      await indexedDbTransactionDone(transaction);
    } catch (error) {
      throw indexedDbError(error, "write", path);
    }
  }

  async replace(sourcePath: string, targetPath: string): Promise<void> {
    assertProjectStorePath(sourcePath, "replace");
    assertProjectStorePath(targetPath, "replace");
    if (sourcePath === targetPath) {
      throw new ProjectStoreError("INVALID_PATH", "replace", sourcePath, "Replacement paths must be distinct");
    }
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
      const store = transaction.objectStore(STORE_NAME);
      await this.assertActiveLease(store, "replace", sourcePath);
      const source = await indexedDbRequestResult(store.get(this.key(sourcePath)));
      if (typeof source !== "string") {
        transaction.abort();
        throw new ProjectStoreError("NOT_FOUND", "replace", sourcePath, `Missing replacement source: ${sourcePath}`);
      }
      store.put(source, this.key(targetPath));
      store.delete(this.key(sourcePath));
      await indexedDbTransactionDone(transaction);
    } catch (error) {
      throw indexedDbError(error, "replace", sourcePath);
    }
  }

  async remove(path: string): Promise<void> {
    assertProjectStorePath(path, "remove");
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
      const store = transaction.objectStore(STORE_NAME);
      await this.assertActiveLease(store, "remove", path);
      store.delete(this.key(path));
      await indexedDbTransactionDone(transaction);
    } catch (error) {
      throw indexedDbError(error, "remove", path);
    }
  }

  private key(path: string): string {
    return `${this.projectId}/${path}`;
  }

  private leaseKey(): string {
    return writerLeaseKey(this.projectId);
  }

  private async assertActiveLease(
    store: IDBObjectStore,
    operation: "write" | "replace" | "remove",
    path: string
  ): Promise<void> {
    const active = this.activeLease;
    if (active === null) {
      throw new ProjectStoreError("LEASE_REQUIRED", operation, path, "A writer lease is required");
    }
    const state = readWriterLeaseState(await indexedDbRequestResult(store.get(this.leaseKey())));
    if (!matchesLiveWriterLease(state.holder, active, this.now())) {
      this.activeLease = null;
      throw new ProjectStoreError("LEASE_LOST", operation, path, "Writer lease was lost or expired");
    }
  }
}

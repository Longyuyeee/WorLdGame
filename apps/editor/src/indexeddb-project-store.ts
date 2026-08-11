import {
  ProjectStoreError,
  assertProjectStorePath,
  type ProjectFileStore,
  type ProjectStoreOperation
} from "@world-studio/project-persistence";

const DATABASE_NAME = "world-studio-local-projects";
const DATABASE_VERSION = 1;
const STORE_NAME = "project-files";

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

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}

export class IndexedDbProjectFileStore implements ProjectFileStore {
  readonly capabilities = {
    backend: "indexeddb",
    atomicWrite: true,
    atomicReplace: true,
    durability: "browser-managed",
    workspaceScope: "origin-private",
    directoryMetadata: "not-applicable"
  } as const;
  private readonly database: Promise<IDBDatabase>;

  constructor(
    indexedDb: IDBFactory,
    private readonly projectId: string
  ) {
    assertProjectStorePath(projectId, "read");
    this.database = new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("Cannot open IndexedDB")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("IndexedDB upgrade is blocked")), { once: true });
    });
  }

  async read(path: string): Promise<string | null> {
    assertProjectStorePath(path, "read");
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readonly");
      const value = await requestResult(transaction.objectStore(STORE_NAME).get(this.key(path)));
      await transactionDone(transaction);
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
      transaction.objectStore(STORE_NAME).put(content, this.key(path));
      await transactionDone(transaction);
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
      const source = await requestResult(store.get(this.key(sourcePath)));
      if (typeof source !== "string") {
        transaction.abort();
        throw new ProjectStoreError("NOT_FOUND", "replace", sourcePath, `Missing replacement source: ${sourcePath}`);
      }
      store.put(source, this.key(targetPath));
      store.delete(this.key(sourcePath));
      await transactionDone(transaction);
    } catch (error) {
      throw indexedDbError(error, "replace", sourcePath);
    }
  }

  async remove(path: string): Promise<void> {
    assertProjectStorePath(path, "remove");
    try {
      const database = await this.database;
      const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
      transaction.objectStore(STORE_NAME).delete(this.key(path));
      await transactionDone(transaction);
    } catch (error) {
      throw indexedDbError(error, "remove", path);
    }
  }

  private key(path: string): string {
    return `${this.projectId}/${path}`;
  }
}

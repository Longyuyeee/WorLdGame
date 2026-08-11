import type { ProjectFileStore } from "@world-studio/project-persistence";

const DATABASE_NAME = "world-studio-local-projects";
const DATABASE_VERSION = 1;
const STORE_NAME = "project-files";

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
  private readonly database: Promise<IDBDatabase>;

  constructor(
    indexedDb: IDBFactory,
    private readonly projectId: string
  ) {
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
    const database = await this.database;
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await requestResult(transaction.objectStore(STORE_NAME).get(this.key(path)));
    await transactionDone(transaction);
    return typeof value === "string" ? value : null;
  }

  async write(path: string, content: string): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
    transaction.objectStore(STORE_NAME).put(content, this.key(path));
    await transactionDone(transaction);
  }

  async replace(sourcePath: string, targetPath: string): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
    const store = transaction.objectStore(STORE_NAME);
    const source = await requestResult(store.get(this.key(sourcePath)));
    if (typeof source !== "string") {
      transaction.abort();
      throw new Error(`Missing replacement source: ${sourcePath}`);
    }
    store.put(source, this.key(targetPath));
    store.delete(this.key(sourcePath));
    await transactionDone(transaction);
  }

  async remove(path: string): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
    transaction.objectStore(STORE_NAME).delete(this.key(path));
    await transactionDone(transaction);
  }

  private key(path: string): string {
    return `${this.projectId}/${path}`;
  }
}

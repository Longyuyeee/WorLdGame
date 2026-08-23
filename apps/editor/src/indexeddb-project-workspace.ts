import {
  assertDerivedProjectPath,
  assertProjectSourcePath,
  assertSelectedProjectPaths,
  sha256,
  type ProjectFiles,
  type ProjectReference,
  type ProjectTrustedSourceCommit,
  type ProjectWorkspace
} from "@world-studio/project-domain";

export const INDEXEDDB_PROJECT_WORKSPACE_DATABASE = "world-studio-managed-project-workspaces";
export const INDEXEDDB_PROJECT_WORKSPACE_VERSION = 1;
export const INDEXEDDB_PROJECT_SOURCE_STORE = "source-files";
export const INDEXEDDB_PROJECT_COMMIT_STORE = "source-commits";
export const INDEXEDDB_PROJECT_DERIVED_STORE = "derived-files";

const REFERENCE_ID = /^[a-z0-9][a-z0-9_-]*$/u;
const HASH = /^[0-9a-f]{64}$/u;
const encoder = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> => value !== null && !Array.isArray(value) && typeof value === "object";
const sourceKey = (referenceId: string, path: string) => `${referenceId}\0${path}`;
const derivedKey = (referenceId: string, path: string) => `${referenceId}\0${path}`;

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

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(INDEXEDDB_PROJECT_WORKSPACE_DATABASE, INDEXEDDB_PROJECT_WORKSPACE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      for (const store of [INDEXEDDB_PROJECT_SOURCE_STORE, INDEXEDDB_PROJECT_COMMIT_STORE, INDEXEDDB_PROJECT_DERIVED_STORE]) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      }
    });
    request.addEventListener("success", () => {
      request.result.addEventListener("versionchange", () => request.result.close());
      resolve(request.result);
    }, { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Cannot open managed project workspace")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("Managed project workspace upgrade is blocked")), { once: true });
  });
}

function parseCommit(value: unknown): ProjectTrustedSourceCommit | null {
  if (value === undefined) return null;
  if (!record(value) || value.schemaVersion !== 1 || typeof value.version !== "string" || !HASH.test(value.version) || !Number.isSafeInteger(value.generation) || (value.generation as number) < 1 || !Array.isArray(value.files)) {
    throw new Error("Managed project source commit is corrupt");
  }
  const files = value.files.map((item) => {
    if (!record(item) || typeof item.path !== "string" || typeof item.sha256 !== "string" || !HASH.test(item.sha256) || !Number.isSafeInteger(item.size) || (item.size as number) < 0 || !Number.isSafeInteger(item.modifiedAtMs) || (item.modifiedAtMs as number) < 1) {
      throw new Error("Managed project source commit file entry is corrupt");
    }
    assertProjectSourcePath(item.path);
    return { path: item.path, size: item.size as number, modifiedAtMs: item.modifiedAtMs as number, sha256: item.sha256 };
  });
  if (new Set(files.map((item) => item.path)).size !== files.length || files.some((item, index) => index > 0 && files[index - 1]!.path.localeCompare(item.path) >= 0)) {
    throw new Error("Managed project source commit paths are invalid");
  }
  const generation = value.generation as number;
  const payload = JSON.stringify({ schemaVersion: 1, generation, files: files.map(({ path, size, modifiedAtMs, sha256: digest }) => ({ path, size, modifiedAtMs, sha256: digest })) });
  if (sha256(payload) !== value.version) throw new Error("Managed project source commit version is corrupt");
  return { schemaVersion: 1, version: value.version, generation, files };
}

function createCommit(files: ProjectFiles, previous: ProjectTrustedSourceCommit | null): ProjectTrustedSourceCommit {
  const generation = (previous?.generation ?? 0) + 1;
  const prior = new Map(previous?.files.map((item) => [item.path, item]));
  const entries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([path, value]) => {
    assertProjectSourcePath(path);
    const digest = sha256(value);
    const earlier = prior.get(path);
    return { path, size: encoder.encode(value).byteLength, modifiedAtMs: earlier?.sha256 === digest ? earlier.modifiedAtMs : generation, sha256: digest };
  });
  const payload = JSON.stringify({ schemaVersion: 1, generation, files: entries });
  return { schemaVersion: 1, version: sha256(payload), generation, files: entries };
}

function createPartialCommit(files: ProjectFiles, previous: ProjectTrustedSourceCommit): ProjectTrustedSourceCommit {
  const selected = assertSelectedProjectPaths(Object.keys(files));
  const updates = new Map(selected.map((path) => [path, files[path]!]));
  const generation = previous.generation + 1;
  const entries = previous.files.map((entry) => {
    const value = updates.get(entry.path);
    if (value === undefined) return entry;
    const digest = sha256(value);
    return { ...entry, size: encoder.encode(value).byteLength, modifiedAtMs: entry.sha256 === digest ? entry.modifiedAtMs : generation, sha256: digest };
  });
  for (const path of selected) if (!previous.files.some((entry) => entry.path === path)) throw new Error(`Missing project file: ${path}`);
  const payload = JSON.stringify({ schemaVersion: 1, generation, files: entries });
  return { schemaVersion: 1, version: sha256(payload), generation, files: entries };
}

export class IndexedDbProjectWorkspace implements ProjectWorkspace {
  readonly reference: ProjectReference;
  private readonly database: Promise<IDBDatabase>;

  constructor(indexedDb: IDBFactory, readonly workspaceId: string, displayName: string) {
    if (!REFERENCE_ID.test(workspaceId)) throw new Error(`Unsafe managed project workspace ID: ${workspaceId}`);
    this.reference = { referenceId: `idb_${workspaceId}`, hostKind: "web-indexeddb", displayLocation: `浏览器事务工作区/${displayName}`, permissionKey: `indexeddb:${workspaceId}` };
    this.database = openDatabase(indexedDb);
  }

  async readTrustedSourceCommit(): Promise<ProjectTrustedSourceCommit | null> {
    const database = await this.database;
    const transaction = database.transaction(INDEXEDDB_PROJECT_COMMIT_STORE, "readonly");
    const value = await requestResult(transaction.objectStore(INDEXEDDB_PROJECT_COMMIT_STORE).get(this.workspaceId));
    await transactionDone(transaction);
    return parseCommit(value);
  }

  async readFiles(): Promise<{ readonly files: ProjectFiles; readonly version: string }> {
    const database = await this.database;
    const transaction = database.transaction([INDEXEDDB_PROJECT_SOURCE_STORE, INDEXEDDB_PROJECT_COMMIT_STORE], "readonly");
    const commit = parseCommit(await requestResult(transaction.objectStore(INDEXEDDB_PROJECT_COMMIT_STORE).get(this.workspaceId)));
    if (commit === null) { await transactionDone(transaction); return { files: {}, version: sha256("") }; }
    const files: Record<string, string> = {};
    for (const entry of commit.files) {
      const value = await requestResult(transaction.objectStore(INDEXEDDB_PROJECT_SOURCE_STORE).get(sourceKey(this.workspaceId, entry.path)));
      if (typeof value !== "string" || encoder.encode(value).byteLength !== entry.size || sha256(value) !== entry.sha256) {
        transaction.abort();
        throw new Error(`Project source ${entry.path} does not match trusted source commit`);
      }
      files[entry.path] = value;
    }
    await transactionDone(transaction);
    return { files, version: commit.version };
  }

  async readSelectedFiles(paths: readonly string[]) {
    const selected = assertSelectedProjectPaths(paths);
    const database = await this.database;
    const transaction = database.transaction([INDEXEDDB_PROJECT_SOURCE_STORE, INDEXEDDB_PROJECT_COMMIT_STORE], "readonly");
    const commit = parseCommit(await requestResult(transaction.objectStore(INDEXEDDB_PROJECT_COMMIT_STORE).get(this.workspaceId)));
    if (commit === null) { transaction.abort(); throw new Error("Managed project workspace is empty"); }
    const byPath = new Map(commit.files.map((item) => [item.path, item]));
    const files: Record<string, string> = {};
    for (const path of selected) {
      const entry = byPath.get(path);
      if (entry === undefined) { transaction.abort(); throw new Error(`Missing project file: ${path}`); }
      const value = await requestResult(transaction.objectStore(INDEXEDDB_PROJECT_SOURCE_STORE).get(sourceKey(this.workspaceId, path)));
      if (typeof value !== "string" || encoder.encode(value).byteLength !== entry.size || sha256(value) !== entry.sha256) {
        transaction.abort();
        throw new Error(`Project source ${path} does not match trusted source commit`);
      }
      files[path] = value;
    }
    await transactionDone(transaction);
    return { files, version: commit.version };
  }

  async listProjectFiles() {
    const commit = await this.readTrustedSourceCommit();
    return { files: commit?.files.map(({ path, size, modifiedAtMs }) => ({ path, size, modifiedAtMs })) ?? [], version: commit?.version ?? sha256("") };
  }

  async readDerivedFile(path: string): Promise<string | null> {
    assertDerivedProjectPath(path);
    const database = await this.database;
    const transaction = database.transaction(INDEXEDDB_PROJECT_DERIVED_STORE, "readonly");
    const value = await requestResult(transaction.objectStore(INDEXEDDB_PROJECT_DERIVED_STORE).get(derivedKey(this.workspaceId, path)));
    await transactionDone(transaction);
    return typeof value === "string" ? value : null;
  }

  async writeDerivedFile(path: string, value: string): Promise<void> {
    assertDerivedProjectPath(path);
    const database = await this.database;
    const transaction = database.transaction(INDEXEDDB_PROJECT_DERIVED_STORE, "readwrite", { durability: "strict" });
    transaction.objectStore(INDEXEDDB_PROJECT_DERIVED_STORE).put(value, derivedKey(this.workspaceId, path));
    await transactionDone(transaction);
  }

  async clearDerivedFiles(): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(INDEXEDDB_PROJECT_DERIVED_STORE, "readwrite", { durability: "strict" });
    const store = transaction.objectStore(INDEXEDDB_PROJECT_DERIVED_STORE);
    const prefix = `${this.workspaceId}\0`;
    for (const key of await requestResult(store.getAllKeys())) if (String(key).startsWith(prefix)) store.delete(key);
    await transactionDone(transaction);
  }

  async writeSelectedFiles(files: ProjectFiles, expectedVersion: string): Promise<{ readonly version: string }> {
    const database = await this.database;
    const transaction = database.transaction([INDEXEDDB_PROJECT_SOURCE_STORE, INDEXEDDB_PROJECT_COMMIT_STORE, INDEXEDDB_PROJECT_DERIVED_STORE], "readwrite", { durability: "strict" });
    const sourceStore = transaction.objectStore(INDEXEDDB_PROJECT_SOURCE_STORE);
    const commitStore = transaction.objectStore(INDEXEDDB_PROJECT_COMMIT_STORE);
    const derivedStore = transaction.objectStore(INDEXEDDB_PROJECT_DERIVED_STORE);
    try {
      const previous = parseCommit(await requestResult(commitStore.get(this.workspaceId)));
      if (previous === null) throw new Error("Managed project workspace is empty");
      if (previous.version !== expectedVersion) throw new Error(`External project version changed from ${expectedVersion} to ${previous.version}`);
      const commit = createPartialCommit(files, previous);
      for (const [path, value] of Object.entries(files)) sourceStore.put(value, sourceKey(this.workspaceId, path));
      const prefix = `${this.workspaceId}\0`;
      for (const key of await requestResult(derivedStore.getAllKeys())) if (String(key).startsWith(prefix)) derivedStore.delete(key);
      commitStore.put(commit, this.workspaceId);
      await transactionDone(transaction);
      return { version: commit.version };
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      throw error;
    }
  }

  async writeFiles(files: ProjectFiles, expectedVersion: string | null): Promise<{ readonly version: string }> {
    const database = await this.database;
    const transaction = database.transaction([INDEXEDDB_PROJECT_SOURCE_STORE, INDEXEDDB_PROJECT_COMMIT_STORE, INDEXEDDB_PROJECT_DERIVED_STORE], "readwrite", { durability: "strict" });
    const sourceStore = transaction.objectStore(INDEXEDDB_PROJECT_SOURCE_STORE);
    const commitStore = transaction.objectStore(INDEXEDDB_PROJECT_COMMIT_STORE);
    const derivedStore = transaction.objectStore(INDEXEDDB_PROJECT_DERIVED_STORE);
    try {
      const previous = parseCommit(await requestResult(commitStore.get(this.workspaceId)));
      if (expectedVersion !== null && previous?.version !== expectedVersion) throw new Error(`External project version changed from ${expectedVersion} to ${previous?.version ?? "missing"}`);
      const commit = createCommit(files, previous);
      const nextPaths = new Set(commit.files.map((item) => item.path));
      for (const entry of previous?.files ?? []) if (!nextPaths.has(entry.path)) sourceStore.delete(sourceKey(this.workspaceId, entry.path));
      for (const [path, value] of Object.entries(files)) sourceStore.put(value, sourceKey(this.workspaceId, path));
      const prefix = `${this.workspaceId}\0`;
      for (const key of await requestResult(derivedStore.getAllKeys())) if (String(key).startsWith(prefix)) derivedStore.delete(key);
      commitStore.put(commit, this.workspaceId);
      await transactionDone(transaction);
      return { version: commit.version };
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      throw error;
    }
  }
}

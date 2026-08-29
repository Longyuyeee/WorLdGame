import {
  WORLD_PLAYER_RECOVERY_STORE_NAME,
  WORLD_PLAYER_SAVE_DATABASE_NAME,
  WORLD_PLAYER_SAVE_DATABASE_VERSION,
  WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME,
  WORLD_PLAYER_SAVE_STORE_NAME
} from "./player-save-store";

export const WORLD_PLAYER_RECOVERY_STORE_VERSION = "1.0.0" as const;
const MAX_SERIALIZED_SESSION_SAVE_BYTES = 64 * 1024 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const hashPattern = /^[0-9a-f]{64}$/u;
const recoveryKeys = ["buildId", "format", "presentationKind", "projectId", "runtimeStateHash", "savedAtEpochMilliseconds", "sceneId", "schemaVersion", "serializedSessionSave", "sessionArtifactHash", "title"] as const;

export interface WorldPlayerRecoveryRecordSourceV1 {
  readonly projectId: string;
  readonly buildId: string;
  readonly savedAtEpochMilliseconds: number;
  readonly title: string;
  readonly sceneId: string;
  readonly presentationKind: string;
  readonly runtimeStateHash: string;
  readonly sessionArtifactHash: string;
  readonly serializedSessionSave: string;
}

export interface WorldPlayerRecoveryRecordV1 extends WorldPlayerRecoveryRecordSourceV1 {
  readonly schemaVersion: 1;
  readonly format: "world.player-recovery";
}

export interface WorldPlayerRecoveryStoreV1 {
  readonly version: typeof WORLD_PLAYER_RECOVERY_STORE_VERSION;
  readonly backend: string;
  read(projectId: string): Promise<WorldPlayerRecoveryRecordV1 | null>;
  write(record: WorldPlayerRecoveryRecordV1): Promise<void>;
  clear(projectId: string): Promise<void>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).sort().join("\0") === [...recoveryKeys].sort().join("\0");
}

function validId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function validRecovery(value: unknown): value is WorldPlayerRecoveryRecordV1 {
  if (!record(value) || !exactKeys(value)) return false;
  return value.schemaVersion === 1 && value.format === "world.player-recovery" && validId(value.projectId) &&
    typeof value.buildId === "string" && hashPattern.test(value.buildId) &&
    Number.isSafeInteger(value.savedAtEpochMilliseconds) && (value.savedAtEpochMilliseconds as number) >= 0 && (value.savedAtEpochMilliseconds as number) <= 8_640_000_000_000_000 &&
    typeof value.title === "string" && value.title.length > 0 && value.title.length <= 256 &&
    typeof value.sceneId === "string" && value.sceneId.length > 0 && value.sceneId.length <= 256 &&
    typeof value.presentationKind === "string" && value.presentationKind.length > 0 && value.presentationKind.length <= 64 &&
    typeof value.runtimeStateHash === "string" && hashPattern.test(value.runtimeStateHash) &&
    typeof value.sessionArtifactHash === "string" && hashPattern.test(value.sessionArtifactHash) &&
    typeof value.serializedSessionSave === "string" && new TextEncoder().encode(value.serializedSessionSave).length <= MAX_SERIALIZED_SESSION_SAVE_BYTES;
}

export function createWorldPlayerRecoveryRecordV1(source: WorldPlayerRecoveryRecordSourceV1): WorldPlayerRecoveryRecordV1 {
  const value: WorldPlayerRecoveryRecordV1 = { ...source, schemaVersion: 1, format: "world.player-recovery" };
  if (!validRecovery(value)) throw new TypeError("WORLD_PLAYER_RECOVERY_INVALID");
  return value;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("WORLD_PLAYER_RECOVERY_IO_FAILURE")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("WORLD_PLAYER_RECOVERY_IO_FAILURE")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("WORLD_PLAYER_RECOVERY_IO_FAILURE")), { once: true });
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(WORLD_PLAYER_SAVE_DATABASE_NAME, WORLD_PLAYER_SAVE_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(WORLD_PLAYER_SAVE_STORE_NAME)) request.result.createObjectStore(WORLD_PLAYER_SAVE_STORE_NAME);
      if (!request.result.objectStoreNames.contains(WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME)) request.result.createObjectStore(WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME);
      if (!request.result.objectStoreNames.contains(WORLD_PLAYER_RECOVERY_STORE_NAME)) request.result.createObjectStore(WORLD_PLAYER_RECOVERY_STORE_NAME);
    });
    request.addEventListener("success", () => {
      request.result.addEventListener("versionchange", () => request.result.close());
      resolve(request.result);
    }, { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("WORLD_PLAYER_RECOVERY_UNAVAILABLE")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("WORLD_PLAYER_RECOVERY_BLOCKED")), { once: true });
  });
}

export class IndexedDbWorldPlayerRecoveryStoreV1 implements WorldPlayerRecoveryStoreV1 {
  readonly version = WORLD_PLAYER_RECOVERY_STORE_VERSION;
  readonly backend = "indexeddb-recovery";
  private readonly database: Promise<IDBDatabase>;

  constructor(factory: IDBFactory = indexedDB) {
    this.database = openDatabase(factory);
  }

  async read(projectId: string): Promise<WorldPlayerRecoveryRecordV1 | null> {
    if (!validId(projectId)) throw new TypeError("WORLD_PLAYER_RECOVERY_ID_INVALID");
    const database = await this.database;
    const transaction = database.transaction(WORLD_PLAYER_RECOVERY_STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(WORLD_PLAYER_RECOVERY_STORE_NAME).get(projectId));
    await done;
    if (value === undefined) return null;
    if (!validRecovery(value) || value.projectId !== projectId) throw new TypeError("WORLD_PLAYER_RECOVERY_CORRUPT");
    return value;
  }

  async write(value: WorldPlayerRecoveryRecordV1): Promise<void> {
    if (!validRecovery(value)) throw new TypeError("WORLD_PLAYER_RECOVERY_INVALID");
    const database = await this.database;
    const transaction = database.transaction(WORLD_PLAYER_RECOVERY_STORE_NAME, "readwrite", { durability: "strict" });
    const done = transactionDone(transaction);
    transaction.objectStore(WORLD_PLAYER_RECOVERY_STORE_NAME).put(value, value.projectId);
    await done;
  }

  async clear(projectId: string): Promise<void> {
    if (!validId(projectId)) throw new TypeError("WORLD_PLAYER_RECOVERY_ID_INVALID");
    const database = await this.database;
    const transaction = database.transaction(WORLD_PLAYER_RECOVERY_STORE_NAME, "readwrite", { durability: "strict" });
    const done = transactionDone(transaction);
    transaction.objectStore(WORLD_PLAYER_RECOVERY_STORE_NAME).delete(projectId);
    await done;
  }
}

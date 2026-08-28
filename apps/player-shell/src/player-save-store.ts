export const WORLD_PLAYER_SAVE_STORE_VERSION = "1.0.0" as const;
export const WORLD_PLAYER_SAVE_DATABASE_NAME = "world-player-saves";
export const WORLD_PLAYER_SAVE_STORE_NAME = "save-slots";
const MAX_SERIALIZED_SESSION_SAVE_BYTES = 64 * 1024 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const hashPattern = /^[0-9a-f]{64}$/u;
const slotKeys = ["buildId", "format", "kind", "presentationKind", "previewImage", "projectId", "runtimeStateHash", "savedAtEpochMilliseconds", "sceneId", "schemaVersion", "serializedSessionSave", "sessionArtifactHash", "slotId", "title"] as const;

export interface WorldPlayerSaveSlotSourceV1 {
  readonly slotId: string;
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

export interface WorldPlayerSaveSlotV1 extends WorldPlayerSaveSlotSourceV1 {
  readonly schemaVersion: 1;
  readonly format: "world.player-save-slot";
  readonly kind: "manual";
  readonly previewImage: null;
}

export interface WorldPlayerSaveStoreV1 {
  readonly version: typeof WORLD_PLAYER_SAVE_STORE_VERSION;
  readonly backend: string;
  list(projectId: string): Promise<readonly WorldPlayerSaveSlotV1[]>;
  read(projectId: string, slotId: string): Promise<WorldPlayerSaveSlotV1 | null>;
  write(slot: WorldPlayerSaveSlotV1): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function validSlot(value: unknown): value is WorldPlayerSaveSlotV1 {
  if (!isRecord(value) || Object.keys(value).sort().join("\0") !== [...slotKeys].sort().join("\0")) return false;
  return value.schemaVersion === 1 && value.format === "world.player-save-slot" && value.kind === "manual" && value.previewImage === null &&
    validId(value.slotId) && validId(value.projectId) && typeof value.buildId === "string" && hashPattern.test(value.buildId) &&
    Number.isSafeInteger(value.savedAtEpochMilliseconds) && (value.savedAtEpochMilliseconds as number) >= 0 && (value.savedAtEpochMilliseconds as number) <= 8_640_000_000_000_000 &&
    typeof value.title === "string" && value.title.length > 0 && value.title.length <= 256 &&
    typeof value.sceneId === "string" && value.sceneId.length > 0 && value.sceneId.length <= 256 &&
    typeof value.presentationKind === "string" && value.presentationKind.length > 0 && value.presentationKind.length <= 64 &&
    typeof value.runtimeStateHash === "string" && hashPattern.test(value.runtimeStateHash) &&
    typeof value.sessionArtifactHash === "string" && hashPattern.test(value.sessionArtifactHash) &&
    typeof value.serializedSessionSave === "string" && new TextEncoder().encode(value.serializedSessionSave).length <= MAX_SERIALIZED_SESSION_SAVE_BYTES;
}

export function createWorldPlayerSaveSlotV1(source: WorldPlayerSaveSlotSourceV1): WorldPlayerSaveSlotV1 {
  const slot: WorldPlayerSaveSlotV1 = { schemaVersion: 1, format: "world.player-save-slot", kind: "manual", previewImage: null, ...source };
  if (!validSlot(slot)) throw new TypeError("WORLD_PLAYER_SAVE_SLOT_INVALID");
  return slot;
}

function key(projectId: string, slotId: string): string {
  if (!validId(projectId) || !validId(slotId)) throw new TypeError("WORLD_PLAYER_SAVE_ID_INVALID");
  return `${projectId}\0${slotId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("WORLD_PLAYER_SAVE_IO_FAILURE")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("WORLD_PLAYER_SAVE_IO_FAILURE")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("WORLD_PLAYER_SAVE_IO_FAILURE")), { once: true });
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(WORLD_PLAYER_SAVE_DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(WORLD_PLAYER_SAVE_STORE_NAME)) request.result.createObjectStore(WORLD_PLAYER_SAVE_STORE_NAME);
    });
    request.addEventListener("success", () => {
      request.result.addEventListener("versionchange", () => request.result.close());
      resolve(request.result);
    }, { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("WORLD_PLAYER_SAVE_UNAVAILABLE")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("WORLD_PLAYER_SAVE_BLOCKED")), { once: true });
  });
}

function checkedSlot(value: unknown): WorldPlayerSaveSlotV1 {
  if (!validSlot(value)) throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
  return value;
}

export class IndexedDbWorldPlayerSaveStoreV1 implements WorldPlayerSaveStoreV1 {
  readonly version = WORLD_PLAYER_SAVE_STORE_VERSION;
  readonly backend = "indexeddb";
  private readonly database: Promise<IDBDatabase>;

  constructor(factory: IDBFactory = indexedDB) {
    this.database = openDatabase(factory);
  }

  async list(projectId: string): Promise<readonly WorldPlayerSaveSlotV1[]> {
    if (!validId(projectId)) throw new TypeError("WORLD_PLAYER_SAVE_ID_INVALID");
    const database = await this.database;
    const transaction = database.transaction(WORLD_PLAYER_SAVE_STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).getAll());
    await done;
    return records.map(checkedSlot).filter((slot) => slot.projectId === projectId).sort((left, right) => left.slotId < right.slotId ? -1 : left.slotId > right.slotId ? 1 : 0);
  }

  async read(projectId: string, slotId: string): Promise<WorldPlayerSaveSlotV1 | null> {
    const database = await this.database;
    const transaction = database.transaction(WORLD_PLAYER_SAVE_STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).get(key(projectId, slotId)));
    await done;
    if (record === undefined) return null;
    const slot = checkedSlot(record);
    if (slot.projectId !== projectId || slot.slotId !== slotId) throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
    return slot;
  }

  async write(slot: WorldPlayerSaveSlotV1): Promise<void> {
    const checked = checkedSlot(slot);
    const database = await this.database;
    const transaction = database.transaction(WORLD_PLAYER_SAVE_STORE_NAME, "readwrite", { durability: "strict" });
    const done = transactionDone(transaction);
    transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).put(checked, key(checked.projectId, checked.slotId));
    await done;
  }
}

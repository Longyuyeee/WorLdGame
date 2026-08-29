export const WORLD_PLAYER_SAVE_STORE_VERSION = "2.0.0" as const;
export const WORLD_PLAYER_SAVE_DATABASE_NAME = "world-player-saves";
export const WORLD_PLAYER_SAVE_DATABASE_VERSION = 3;
export const WORLD_PLAYER_SAVE_STORE_NAME = "save-slots";
export const WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME = "save-previews";
export const WORLD_PLAYER_RECOVERY_STORE_NAME = "recovery-sessions";
export const WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES = 512 * 1024;
export const WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_WIDTH = 512;
export const WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_HEIGHT = 512;
const MAX_SERIALIZED_SESSION_SAVE_BYTES = 64 * 1024 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const hashPattern = /^[0-9a-f]{64}$/u;
const slotV1Keys = ["buildId", "format", "kind", "presentationKind", "previewImage", "projectId", "runtimeStateHash", "savedAtEpochMilliseconds", "sceneId", "schemaVersion", "serializedSessionSave", "sessionArtifactHash", "slotId", "title"] as const;
const slotV2Keys = ["buildId", "chapterId", "chapterTitle", "customMetadata", "format", "kind", "migratedFromSchemaVersion", "presentationKind", "preview", "projectId", "route", "runtimeStateHash", "savedAtEpochMilliseconds", "sceneId", "sceneTitle", "schemaVersion", "serializedSessionSave", "sessionArtifactHash", "slotId", "title"] as const;

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

export type WorldPlayerSavePreviewV2 =
  | { readonly status: "available"; readonly mimeType: "image/webp" | "image/png"; readonly width: number; readonly height: number; readonly byteLength: number; readonly sha256: string }
  | { readonly status: "unavailable"; readonly reason: "capture-unavailable" | "capture-failed" | "capture-invalid" | "legacy-v1" };

export type WorldPlayerSaveKindV2 = "manual" | "auto" | "quick";

export interface WorldPlayerSaveSlotSourceV2 extends WorldPlayerSaveSlotSourceV1 {
  readonly kind: WorldPlayerSaveKindV2;
  readonly chapterId: string | null;
  readonly chapterTitle: string | null;
  readonly sceneTitle: string;
  readonly route: null;
  readonly customMetadata: Readonly<Record<string, never>>;
  readonly preview: WorldPlayerSavePreviewV2;
  readonly migratedFromSchemaVersion?: 1 | null;
}

export interface WorldPlayerSaveSlotV2 extends WorldPlayerSaveSlotSourceV2 {
  readonly schemaVersion: 2;
  readonly format: "world.player-save-slot";
  readonly migratedFromSchemaVersion: 1 | null;
}

export interface WorldPlayerSaveStoreV2 {
  readonly version: typeof WORLD_PLAYER_SAVE_STORE_VERSION;
  readonly backend: string;
  list(projectId: string): Promise<readonly WorldPlayerSaveSlotV2[]>;
  read(projectId: string, slotId: string): Promise<WorldPlayerSaveSlotV2 | null>;
  readPreview(projectId: string, slotId: string): Promise<Blob | null>;
  write(slot: WorldPlayerSaveSlotV1 | WorldPlayerSaveSlotV2, preview?: Blob): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function validId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function validNullableId(value: unknown): value is string | null {
  return value === null || validId(value);
}

function validCommonSlot(value: Record<string, unknown>): boolean {
  return validId(value.slotId) && validId(value.projectId) && typeof value.buildId === "string" && hashPattern.test(value.buildId) &&
    Number.isSafeInteger(value.savedAtEpochMilliseconds) && (value.savedAtEpochMilliseconds as number) >= 0 && (value.savedAtEpochMilliseconds as number) <= 8_640_000_000_000_000 &&
    typeof value.title === "string" && value.title.length > 0 && value.title.length <= 256 &&
    typeof value.sceneId === "string" && value.sceneId.length > 0 && value.sceneId.length <= 256 &&
    typeof value.presentationKind === "string" && value.presentationKind.length > 0 && value.presentationKind.length <= 64 &&
    typeof value.runtimeStateHash === "string" && hashPattern.test(value.runtimeStateHash) &&
    typeof value.sessionArtifactHash === "string" && hashPattern.test(value.sessionArtifactHash) &&
    typeof value.serializedSessionSave === "string" && new TextEncoder().encode(value.serializedSessionSave).length <= MAX_SERIALIZED_SESSION_SAVE_BYTES;
}

function validSlotV1(value: unknown): value is WorldPlayerSaveSlotV1 {
  if (!isRecord(value) || !hasExactKeys(value, slotV1Keys)) return false;
  return value.schemaVersion === 1 && value.format === "world.player-save-slot" && value.kind === "manual" && value.previewImage === null && validCommonSlot(value);
}

function validPreviewMetadata(value: unknown): value is WorldPlayerSavePreviewV2 {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "unavailable") {
    return hasExactKeys(value, ["reason", "status"]) && ["capture-unavailable", "capture-failed", "capture-invalid", "legacy-v1"].includes(String(value.reason));
  }
  return value.status === "available" && hasExactKeys(value, ["byteLength", "height", "mimeType", "sha256", "status", "width"]) &&
    (value.mimeType === "image/webp" || value.mimeType === "image/png") &&
    Number.isSafeInteger(value.width) && (value.width as number) > 0 && (value.width as number) <= WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_WIDTH &&
    Number.isSafeInteger(value.height) && (value.height as number) > 0 && (value.height as number) <= WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_HEIGHT &&
    Number.isSafeInteger(value.byteLength) && (value.byteLength as number) > 0 && (value.byteLength as number) <= WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES &&
    typeof value.sha256 === "string" && hashPattern.test(value.sha256);
}

function validSlotV2(value: unknown): value is WorldPlayerSaveSlotV2 {
  if (!isRecord(value) || !hasExactKeys(value, slotV2Keys) || !validCommonSlot(value)) return false;
  const validSlotIdentity = value.kind === "manual" && /^manual-(?:[1-9]|1[0-2])$/u.test(String(value.slotId)) ||
    value.kind === "auto" && /^auto-[1-5]$/u.test(String(value.slotId)) || value.kind === "quick" && value.slotId === "quick-1";
  return value.schemaVersion === 2 && value.format === "world.player-save-slot" && validSlotIdentity &&
    validNullableId(value.chapterId) && (value.chapterTitle === null || typeof value.chapterTitle === "string" && value.chapterTitle.length > 0 && value.chapterTitle.length <= 256) &&
    typeof value.sceneTitle === "string" && value.sceneTitle.length > 0 && value.sceneTitle.length <= 256 && value.route === null &&
    isRecord(value.customMetadata) && Object.keys(value.customMetadata).length === 0 && validPreviewMetadata(value.preview) &&
    (value.migratedFromSchemaVersion === null || value.migratedFromSchemaVersion === 1);
}

export function createWorldPlayerSaveSlotV1(source: WorldPlayerSaveSlotSourceV1): WorldPlayerSaveSlotV1 {
  const slot: WorldPlayerSaveSlotV1 = { schemaVersion: 1, format: "world.player-save-slot", kind: "manual", previewImage: null, ...source };
  if (!validSlotV1(slot)) throw new TypeError("WORLD_PLAYER_SAVE_SLOT_INVALID");
  return slot;
}

export function createWorldPlayerSaveSlotV2(source: WorldPlayerSaveSlotSourceV2): WorldPlayerSaveSlotV2 {
  const slot: WorldPlayerSaveSlotV2 = { ...source, schemaVersion: 2, format: "world.player-save-slot", migratedFromSchemaVersion: source.migratedFromSchemaVersion ?? null };
  if (!validSlotV2(slot)) throw new TypeError("WORLD_PLAYER_SAVE_SLOT_INVALID");
  return slot;
}

function normalizeSlot(value: unknown): WorldPlayerSaveSlotV2 {
  if (validSlotV2(value)) return value;
  if (!validSlotV1(value)) throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
  return createWorldPlayerSaveSlotV2({
    kind: "manual", slotId: value.slotId, projectId: value.projectId, buildId: value.buildId, savedAtEpochMilliseconds: value.savedAtEpochMilliseconds,
    title: value.title, sceneId: value.sceneId, presentationKind: value.presentationKind, runtimeStateHash: value.runtimeStateHash,
    sessionArtifactHash: value.sessionArtifactHash, serializedSessionSave: value.serializedSessionSave,
    chapterId: null, chapterTitle: null, sceneTitle: value.sceneId, route: null, customMetadata: {},
    preview: { status: "unavailable", reason: "legacy-v1" }, migratedFromSchemaVersion: 1
  });
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
    request.addEventListener("error", () => reject(request.error ?? new Error("WORLD_PLAYER_SAVE_UNAVAILABLE")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("WORLD_PLAYER_SAVE_BLOCKED")), { once: true });
  });
}

function checkedWrite(slot: WorldPlayerSaveSlotV1 | WorldPlayerSaveSlotV2): WorldPlayerSaveSlotV2 {
  if (!validSlotV1(slot) && !validSlotV2(slot)) throw new TypeError("WORLD_PLAYER_SAVE_SLOT_INVALID");
  return normalizeSlot(slot);
}

function validPreviewBlobShape(slot: WorldPlayerSaveSlotV2, preview: Blob | undefined): boolean {
  if (slot.preview.status === "unavailable") return preview === undefined;
  return preview !== undefined && preview.type === slot.preview.mimeType && preview.size === slot.preview.byteLength && preview.size <= WORLD_PLAYER_SAVE_PREVIEW_MAXIMUM_BYTES;
}

export async function worldPlayerSavePreviewSha256V1(blob: Blob, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class IndexedDbWorldPlayerSaveStoreV2 implements WorldPlayerSaveStoreV2 {
  readonly version = WORLD_PLAYER_SAVE_STORE_VERSION;
  readonly backend = "indexeddb";
  private readonly database: Promise<IDBDatabase>;
  private readonly subtle: SubtleCrypto;

  constructor(factory: IDBFactory = indexedDB, subtle: SubtleCrypto = crypto.subtle) {
    this.database = openDatabase(factory);
    this.subtle = subtle;
  }

  async list(projectId: string): Promise<readonly WorldPlayerSaveSlotV2[]> {
    if (!validId(projectId)) throw new TypeError("WORLD_PLAYER_SAVE_ID_INVALID");
    const database = await this.database;
    const transaction = database.transaction(WORLD_PLAYER_SAVE_STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).getAll());
    await done;
    return records.map(normalizeSlot).filter((slot) => slot.projectId === projectId).sort((left, right) => left.slotId.localeCompare(right.slotId));
  }

  async read(projectId: string, slotId: string): Promise<WorldPlayerSaveSlotV2 | null> {
    const database = await this.database;
    const transaction = database.transaction(WORLD_PLAYER_SAVE_STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).get(key(projectId, slotId)));
    await done;
    if (record === undefined) return null;
    const slot = normalizeSlot(record);
    if (slot.projectId !== projectId || slot.slotId !== slotId) throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
    return slot;
  }

  async readPreview(projectId: string, slotId: string): Promise<Blob | null> {
    const database = await this.database;
    const transaction = database.transaction([WORLD_PLAYER_SAVE_STORE_NAME, WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME], "readonly");
    const done = transactionDone(transaction);
    const recordKey = key(projectId, slotId);
    const [metadataRecord, record] = await Promise.all([
      requestResult(transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).get(recordKey)),
      requestResult(transaction.objectStore(WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME).get(recordKey))
    ]);
    await done;
    if (metadataRecord === undefined && record === undefined) return null;
    if (metadataRecord === undefined) throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
    const slot = normalizeSlot(metadataRecord);
    if (slot.projectId !== projectId || slot.slotId !== slotId) throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
    if (slot.preview.status === "unavailable") {
      if (record !== undefined) throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
      return null;
    }
    if (record === undefined) throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
    if (!(record instanceof Blob) && (!isRecord(record) || typeof record.size !== "number" || typeof record.type !== "string")) {
      throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
    }
    const blob = record as Blob;
    if (blob.type !== slot.preview.mimeType || blob.size !== slot.preview.byteLength || await worldPlayerSavePreviewSha256V1(blob, this.subtle) !== slot.preview.sha256) {
      throw new TypeError("WORLD_PLAYER_SAVE_CORRUPT");
    }
    return blob;
  }

  async write(slot: WorldPlayerSaveSlotV1 | WorldPlayerSaveSlotV2, preview?: Blob): Promise<void> {
    const checked = checkedWrite(slot);
    if (!validPreviewBlobShape(checked, preview)) throw new TypeError("WORLD_PLAYER_SAVE_PREVIEW_INVALID");
    if (checked.preview.status === "available" && preview !== undefined && await worldPlayerSavePreviewSha256V1(preview, this.subtle) !== checked.preview.sha256) {
      throw new TypeError("WORLD_PLAYER_SAVE_PREVIEW_INVALID");
    }
    const database = await this.database;
    const transaction = database.transaction([WORLD_PLAYER_SAVE_STORE_NAME, WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME], "readwrite", { durability: "strict" });
    const done = transactionDone(transaction);
    const recordKey = key(checked.projectId, checked.slotId);
    transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).put(checked, recordKey);
    if (preview === undefined) transaction.objectStore(WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME).delete(recordKey);
    else transaction.objectStore(WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME).put(preview, recordKey);
    await done;
  }
}

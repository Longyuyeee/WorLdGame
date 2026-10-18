import { webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { CompressionStream, DecompressionStream, ReadableStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexedDbWorldPlayerSaveStoreV3, createWorldPlayerSaveSlotV1, createWorldPlayerSaveSlotV2, createWorldPlayerSaveSlotV3, worldPlayerSavePreviewSha256V1, worldPlayerSaveSummaryV3 } from "./player-save-store";

const hash = "a".repeat(64), text = "完整历史不裁剪😀".repeat(18000);
const common = () => ({ slotId: "manual-1", projectId: "catalog", buildId: hash, savedAtEpochMilliseconds: 1,
  title: "Long story", sceneId: "scene", presentationKind: "narration", runtimeStateHash: hash, sessionArtifactHash: hash, serializedSessionSave: text });
const slot = () => createWorldPlayerSaveSlotV3({ ...common(), kind: "manual", chapterId: null, chapterTitle: null, sceneTitle: "场景",
  route: null, customMetadata: {}, preview: { status: "unavailable", reason: "capture-unavailable" }, checkpointStepId: null });
async function raw(factory: IDBFactory, recordKey: string, value?: unknown) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("world-player-saves"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    const transaction = database.transaction("save-slots", value === undefined ? "readonly" : "readwrite");
    const request = value === undefined ? transaction.objectStore("save-slots").get(recordKey) : transaction.objectStore("save-slots").put(value, recordKey);
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); });
    return request.result;
  } finally { database.close(); }
}
beforeEach(() => {
  for (const [name, value] of Object.entries({ CompressionStream, DecompressionStream, ReadableStream, TextEncoder, TextDecoder, crypto: webcrypto })) vi.stubGlobal(name, value);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("save catalog display boundary", () => {
  it("lists long packed saves without a decoder, but actual reads still require one", async () => {
    const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory());
    await store.write(slot());
    vi.stubGlobal("DecompressionStream", undefined);
    expect(await store.listSummaries("catalog")).toEqual([worldPlayerSaveSummaryV3(slot())]);
    expect(await store.readPreview("catalog", "manual-1")).toBeNull();
    await expect(store.read("catalog", "manual-1")).rejects.toThrow("CODEC_UNAVAILABLE");
  });
  it("does not treat a visible summary or verified image as proof the payload is valid", async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory);
    const blob = new NodeBlob(["png"], { type: "image/png" }) as unknown as Blob;
    const saved = createWorldPlayerSaveSlotV3({ ...slot(), preview: { status: "available", width: 1, height: 1, byteLength: blob.size, mimeType: "image/png", sha256: await worldPlayerSavePreviewSha256V1(blob) } });
    await store.write(saved, blob);
    const packed = await raw(factory, "catalog\0manual-1"); packed.sha256 = "0".repeat(64);
    await raw(factory, "catalog\0manual-1", packed);
    expect(await store.listSummaries("catalog")).toEqual([worldPlayerSaveSummaryV3(saved)]);
    expect((await store.readPreview("catalog", "manual-1"))?.size).toBe(3);
    await expect(store.read("catalog", "manual-1")).rejects.toThrow("STORAGE_CORRUPT");
    await expect(store.list("catalog")).rejects.toThrow("STORAGE_CORRUPT");
    packed.metadata.preview.sha256 = "0".repeat(64);
    await raw(factory, "catalog\0manual-1", packed);
    await expect(store.readPreview("catalog", "manual-1")).rejects.toThrow("SAVE_CORRUPT");
  });
  it("does not fetch or decode another project's corrupt record", async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory);
    await store.write(slot()); await raw(factory, "other\0manual-1", { broken: true });
    expect(await store.listSummaries("catalog")).toHaveLength(1);
    expect(await store.list("catalog")).toEqual([slot()]);
    await expect(store.listSummaries("other")).rejects.toThrow();
  });
  it.each(["key", "metadata", "envelope", "embedded-payload"])("rejects malformed %s without hiding the affected project", async kind => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory);
    await store.write(slot()); const packed = await raw(factory, "catalog\0manual-1");
    if (kind === "key") packed.metadata.slotId = "manual-2";
    if (kind === "metadata") packed.metadata.title = 7;
    if (kind === "envelope") packed.encoding = "unknown";
    if (kind === "embedded-payload") packed.metadata.serializedSessionSave = "fake";
    await raw(factory, "catalog\0manual-1", packed);
    await expect(store.listSummaries("catalog")).rejects.toThrow();
    await expect(store.readPreview("catalog", "manual-1")).rejects.toThrow();
  });
  it("normalizes legacy plaintext metadata without re-encoding the full save", async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory);
    await store.write(slot());
    const v1 = createWorldPlayerSaveSlotV1(common());
    const { checkpointStepId: _checkpoint, schemaVersion: _schema, migratedFromSchemaVersion: _migration, ...v2Source } = slot();
    const v2 = createWorldPlayerSaveSlotV2({ ...v2Source, kind: "manual", slotId: "manual-2" });
    await raw(factory, "catalog\0manual-1", v1);
    await raw(factory, "catalog\0manual-2", v2);
    vi.stubGlobal("TextEncoder", class { encode() { throw Error("catalog must not encode payload"); } });
    const summaries = await store.listSummaries("catalog");
    expect(summaries[0]).toMatchObject({ schemaVersion: 3, migratedFromSchemaVersion: 1, sceneTitle: "scene" });
    expect(summaries[0]).not.toHaveProperty("serializedSessionSave");
    expect(summaries[0]).not.toHaveProperty("previewImage");
    expect(summaries[1]).toMatchObject({ schemaVersion: 3, migratedFromSchemaVersion: 2, checkpointStepId: null });
  });
});

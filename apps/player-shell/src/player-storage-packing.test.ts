import { createHash, webcrypto } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { CompressionStream, DecompressionStream, ReadableStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import { Blob as NodeBlob } from "node:buffer";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { packPlayerStorageRecord, unpackPlayerStorageRecord, PlayerStorageWriteQueue } from "./player-storage-packing";
import { IndexedDbWorldPlayerRecoveryStoreV1, createWorldPlayerRecoveryRecordV1 } from "./player-recovery-store";
import { IndexedDbWorldPlayerSaveStoreV3, createWorldPlayerSaveSlotV3 } from "./player-save-store";

const text = '\uFEFF保存历史：完整回退 😀 e\u0301\n'.repeat(5000);
const hash = "a".repeat(64);
function recovery(serializedSessionSave = text) {
  return createWorldPlayerRecoveryRecordV1({ projectId: "packing", buildId: hash, savedAtEpochMilliseconds: 1,
    title: "Long story", sceneId: "story", presentationKind: "narration", runtimeStateHash: hash, sessionArtifactHash: hash, serializedSessionSave });
}
function slot(serializedSessionSave = text) {
  return createWorldPlayerSaveSlotV3({ ...recovery(serializedSessionSave), kind: "quick", slotId: "quick-1", chapterId: null,
    chapterTitle: null, sceneTitle: "Story", route: null, customMetadata: {}, preview: { status: "unavailable", reason: "capture-unavailable" }, checkpointStepId: null });
}
async function db(factory: IDBFactory, version?: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("world-player-saves", version);
    request.onupgradeneeded = () => {
      for (const name of ["save-slots", "save-previews", "recovery-sessions"]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function raw(factory: IDBFactory, name: string, key: string, write?: unknown) {
  const database = await db(factory);
  try {
    const transaction = database.transaction(name, write === undefined ? "readonly" : "readwrite");
    const done = new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); });
    const request = write === undefined ? transaction.objectStore(name).get(key) : transaction.objectStore(name).put(write, key);
    await done; return request.result;
  } finally { database.close(); }
}

beforeEach(() => {
  for (const [name, value] of Object.entries({ CompressionStream, DecompressionStream, ReadableStream, TextEncoder, TextDecoder, crypto: webcrypto })) vi.stubGlobal(name, value);
});
afterEach(() => vi.unstubAllGlobals());

describe("lossless bounded Player storage", () => {
  it("preserves exact Unicode/BOM bytes and hashes, independently verified by Node zlib/crypto", async () => {
    const value = recovery();
    const packed = await packPlayerStorageRecord(value) as { data: Uint8Array; sha256: string; byteLength: number };
    expect(packed.data.length).toBeLessThan(packed.byteLength / 10);
    expect(gunzipSync(packed.data).toString("utf8")).toBe(text);
    expect(packed.sha256).toBe(createHash("sha256").update(text).digest("hex"));
    expect(await unpackPlayerStorageRecord(packed)).toEqual(value);
    expect(value.serializedSessionSave).toBe(text);
  });

  it("keeps small, unsupported and malformed-UTF16 strings in the legacy representation", async () => {
    const small = recovery("{}");
    expect(await packPlayerStorageRecord(small)).toBe(small);
    const malformed = recovery(text + "\ud800");
    expect(await packPlayerStorageRecord(malformed)).toBe(malformed);
    vi.stubGlobal("CompressionStream", undefined);
    const large = recovery();
    expect(await packPlayerStorageRecord(large)).toBe(large);
    expect(await unpackPlayerStorageRecord(large)).toBe(large);
  });

  it("reads an independent gzip stream and rejects corrupt, oversized and ambiguous envelopes", async () => {
    const packed = await packPlayerStorageRecord(recovery()) as Record<string, unknown>;
    const independent = { ...packed, data: new Uint8Array(gzipSync(Buffer.from(text))) };
    expect(await unpackPlayerStorageRecord(independent)).toEqual(recovery());
    const cases = [
      { ...packed, schemaVersion: 2 }, { ...packed, extra: true }, { ...packed, encoding: "br" },
      { ...packed, byteLength: 64 * 1024 * 1024 + 1 }, { ...packed, byteLength: 65536 },
      { ...packed, byteLength: Number(packed.byteLength) + 1 }, { ...packed, sha256: "0".repeat(64) },
      { ...packed, data: new Uint8Array([1, 2, 3]) }, { ...packed, data: Array.from(packed.data as Uint8Array) },
      { ...packed, data: (packed.data as Uint8Array).slice(0, -4) },
      { ...packed, metadata: { ...(packed.metadata as object), serializedSessionSave: "spoof" } },
    ];
    for (const broken of cases) await expect(unpackPlayerStorageRecord(broken)).rejects.toThrow();
    const invalidUtf8 = Buffer.alloc(65536, 0xff);
    await expect(unpackPlayerStorageRecord({ ...packed, byteLength: invalidUtf8.length,
      data: new Uint8Array(gzipSync(invalidUtf8)), sha256: createHash("sha256").update(invalidUtf8).digest("hex") })).rejects.toThrow();
    vi.stubGlobal("DecompressionStream", undefined);
    await expect(unpackPlayerStorageRecord(packed)).rejects.toThrow("CODEC_UNAVAILABLE");
  });

  it("upgrades DB3 without rewriting old records and cold-reads packed formal/recovery records", async () => {
    const factory = new IDBFactory();
    (await db(factory, 3)).close();
    const legacy = slot("{}");
    await raw(factory, "save-slots", "packing\0quick-1", legacy);
    const saves = new IndexedDbWorldPlayerSaveStoreV3(factory);
    expect(await saves.read("packing", "quick-1")).toEqual(legacy);
    expect(await raw(factory, "save-slots", "packing\0quick-1")).toEqual(legacy);
    const store = new IndexedDbWorldPlayerRecoveryStoreV1(factory);
    await saves.write(slot()); await store.write(recovery());
    expect(await raw(factory, "save-slots", "packing\0quick-1")).toMatchObject({ format: "world.player-packed-record" });
    expect(await raw(factory, "recovery-sessions", "packing")).toMatchObject({ format: "world.player-packed-record" });
    expect(await new IndexedDbWorldPlayerSaveStoreV3(factory).read("packing", "quick-1")).toEqual(slot());
    expect(await saves.list("packing")).toEqual([slot()]);
    expect(await saves.readPreview("packing", "quick-1")).toBeNull();
    expect(await new IndexedDbWorldPlayerRecoveryStoreV1(factory).read("packing")).toEqual(recovery());
    await expect(db(factory, 3)).rejects.toMatchObject({ name: "VersionError" });
  });

  it("orders large/small replacements and clear, retaining old data when compression fails", async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerRecoveryStoreV1(factory);
    await Promise.all([store.write(recovery()), store.write(recovery("newest"))]);
    expect((await store.read("packing"))?.serializedSessionSave).toBe("newest");
    await Promise.all([store.write(recovery()), store.clear("packing")]);
    expect(await store.read("packing")).toBeNull();
    await store.write(recovery("protected"));
    vi.stubGlobal("CompressionStream", class { constructor() { throw new Error("codec-failure"); } });
    await expect(store.write(recovery())).rejects.toThrow("codec-failure");
    expect((await store.read("packing"))?.serializedSessionSave).toBe("protected");
    await store.write(recovery("subsequent"));
    expect((await store.read("packing"))?.serializedSessionSave).toBe("subsequent");
  });

  it("keeps packed slot and preview atomic, orders replacements and snapshots caller-owned metadata", async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory);
    const bytes = new Uint8Array([1, 2, 3]);
    const preview = new NodeBlob([bytes], { type: "image/png" }) as unknown as Blob;
    const prior = createWorldPlayerSaveSlotV3({ ...slot(), preview: { status: "available", mimeType: "image/png", width: 1, height: 1,
      byteLength: 3, sha256: createHash("sha256").update(bytes).digest("hex") } });
    await store.write(prior, preview);
    expect(await store.read("packing", "quick-1")).toEqual(prior);
    expect((await store.readPreview("packing", "quick-1"))?.size).toBe(3);
    const invalidPreview = new NodeBlob([new Uint8Array([4, 5, 6])], { type: "image/png" }) as unknown as Blob;
    await expect(store.write(prior, invalidPreview)).rejects.toThrow("PREVIEW_INVALID");
    expect(await store.read("packing", "quick-1")).toEqual(prior);
    expect((await store.readPreview("packing", "quick-1"))?.size).toBe(3);
    const later = { ...slot("latest"), title: "captured" };
    const first = store.write(slot()), second = store.write(later);
    later.title = "mutated";
    await Promise.all([first, second]);
    expect(await store.read("packing", "quick-1")).toMatchObject({ serializedSessionSave: "latest", title: "captured" });
    expect(await store.readPreview("packing", "quick-1")).toBeNull();
  });

  it("rejects a decoded record whose metadata no longer matches its storage key", async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerRecoveryStoreV1(factory);
    await store.write(recovery());
    const packed = await raw(factory, "recovery-sessions", "packing");
    await raw(factory, "recovery-sessions", "packing", { ...packed, metadata: { ...packed.metadata, projectId: "foreign" } });
    await expect(store.read("packing")).rejects.toThrow("WORLD_PLAYER_RECOVERY_CORRUPT");
  });

  it("serializes failed and successful jobs in invocation order", async () => {
    const queue = new PlayerStorageWriteQueue(), events: number[] = [];
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const first = queue.run(async () => { events.push(1); await hold; throw new Error("first"); });
    const failed = expect(first).rejects.toThrow("first");
    const second = queue.run(async () => { events.push(2); });
    await Promise.resolve(); expect(events).toEqual([1]); release();
    await failed; await second; expect(events).toEqual([1, 2]);
  });
});

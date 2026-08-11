import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  auditAssetBlobStore,
  createBlobDigest
} from "@world-studio/project-persistence";
import {
  ASSET_BACKUP_STORE_NAME,
  ASSET_BLOB_STORE_NAME,
  ASSET_INDEX_STORE_NAME,
  ASSET_LIFECYCLE_STORE_NAME,
  ASSET_TRASH_STORE_NAME,
  PROJECT_FILE_STORE_NAME,
  WORLD_STUDIO_DATABASE_NAME,
  indexedDbRequestResult,
  indexedDbTransactionDone
} from "./indexeddb-project-store";
import {
  IndexedDbAssetRepository,
  normalizeIndexedDbAssetError
} from "./indexeddb-asset-repository";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";

async function writableRepository(
  indexedDb = new IDBFactory(),
  projectId = "asset_repository_test",
  now: () => number = () => 1_000
) {
  const files = new IndexedDbProjectFileStore(indexedDb, projectId, { now });
  const acquisition = await files.acquire("asset_test_owner", now(), 100);
  expect(acquisition.status).toBe("acquired");
  if (acquisition.status !== "acquired") throw new Error("Expected writer lease");
  files.activateWriterLease(acquisition.lease);
  const assets = new IndexedDbAssetRepository(indexedDb, projectId, { now });
  assets.activateWriterLease(acquisition.lease);
  return { indexedDb, files, assets, lease: acquisition.lease };
}

describe("IndexedDbAssetRepository", () => {
  it("passes the shared Blob conformance suite under an active writer lease", async () => {
    const { assets } = await writableRepository();
    const report = await auditAssetBlobStore(assets);
    expect(report.capabilities).toMatchObject({
      backend: "indexeddb",
      durability: "browser-managed",
      workspaceScope: "origin-private"
    });
  });

  it("atomically publishes an index and deduplicates identical bytes across stable asset IDs", async () => {
    const { indexedDb, assets, lease } = await writableRepository();
    const bytes = new TextEncoder().encode("same browser CG bytes");
    const first = await assets.importAsset({
      assetId: "cg_browser_a",
      kind: "cg",
      displayName: "Browser CG A",
      mimeType: "image/png",
      bytes
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    const second = await assets.importAsset({
      assetId: "cg_browser_b",
      kind: "cg",
      displayName: "Browser CG B",
      mimeType: "image/png",
      bytes
    }, { expectedIndexRevision: 1, maxBytes: 1024 });

    expect(first.blobStatus).toBe("created");
    expect(second.blobStatus).toBe("existing");
    await expect(assets.audit()).resolves.toMatchObject({
      status: "pass",
      assetCount: 2,
      uniqueBlobCount: 1,
      deduplicatedBytes: bytes.byteLength
    });

    const reopened = new IndexedDbAssetRepository(indexedDb, "asset_repository_test");
    reopened.activateWriterLease(lease);
    await expect(reopened.loadIndex()).resolves.toEqual(second.index);
    expect(Array.from(await reopened.read(createBlobDigest(bytes)) ?? [])).toEqual(Array.from(bytes));
  });

  it("aborts both Blob and Index when cancellation arrives between their publication phases", async () => {
    const { assets } = await writableRepository();
    const controller = new AbortController();
    await expect(assets.importAsset({
      assetId: "cg_cancelled",
      kind: "cg",
      displayName: "Cancelled CG",
      mimeType: "image/png",
      bytes: new TextEncoder().encode("cancel before index")
    }, {
      expectedIndexRevision: 0,
      maxBytes: 1024,
      signal: controller.signal,
      onPhase: (phase) => {
        if (phase === "blob-ready") controller.abort();
      }
    })).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(assets.loadIndex()).resolves.toMatchObject({ indexRevision: 0, assets: [] });
    await expect(assets.list()).resolves.toEqual([]);
  });

  it("rejects stale revisions before publishing additional content", async () => {
    const { assets } = await writableRepository();
    const firstBytes = new TextEncoder().encode("first");
    await assets.importAsset({
      assetId: "cg_first",
      kind: "cg",
      displayName: "First",
      mimeType: "image/png",
      bytes: firstBytes
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    await expect(assets.importAsset({
      assetId: "cg_stale",
      kind: "cg",
      displayName: "Stale",
      mimeType: "image/png",
      bytes: new TextEncoder().encode("must not publish")
    }, { expectedIndexRevision: 0, maxBytes: 1024 })).rejects.toMatchObject({
      code: "STALE_INDEX_REVISION"
    });
    await expect(assets.list()).resolves.toEqual([createBlobDigest(firstBytes)]);
  });

  it("fences a stale repository after another owner acquires a newer token", async () => {
    let now = 2_000;
    const indexedDb = new IDBFactory();
    const first = await writableRepository(indexedDb, "fenced_assets", () => now);
    now = 2_101;
    const secondFiles = new IndexedDbProjectFileStore(indexedDb, "fenced_assets", { now: () => now });
    const secondLease = await secondFiles.acquire("new_asset_owner", now, 100);
    expect(secondLease.status).toBe("acquired");
    await expect(first.assets.put(
      createBlobDigest(new Uint8Array([1, 2, 3])),
      new Uint8Array([1, 2, 3])
    )).rejects.toMatchObject({ code: "LEASE_LOST" });
    await expect(first.assets.list()).resolves.toEqual([]);
  });

  it("upgrades a schema-1 database without losing existing project files", async () => {
    const indexedDb = new IDBFactory();
    const open = indexedDb.open(WORLD_STUDIO_DATABASE_NAME, 1);
    open.addEventListener("upgradeneeded", () => open.result.createObjectStore(PROJECT_FILE_STORE_NAME));
    const legacy = await indexedDbRequestResult(open);
    const seed = legacy.transaction(PROJECT_FILE_STORE_NAME, "readwrite");
    seed.objectStore(PROJECT_FILE_STORE_NAME).put("legacy-project", "upgrade_test/project.json");
    await indexedDbTransactionDone(seed);
    legacy.close();

    const store = new IndexedDbProjectFileStore(indexedDb, "upgrade_test");
    await expect(store.read("project.json")).resolves.toBe("legacy-project");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open(WORLD_STUDIO_DATABASE_NAME, 4);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    expect([...database.objectStoreNames]).toEqual([
      ASSET_BACKUP_STORE_NAME,
      ASSET_BLOB_STORE_NAME,
      ASSET_INDEX_STORE_NAME,
      ASSET_LIFECYCLE_STORE_NAME,
      ASSET_TRASH_STORE_NAME,
      PROJECT_FILE_STORE_NAME
    ]);
    database.close();
  });

  it("publishes lifecycle lineage atomically and protects a replaced source in history", async () => {
    let now = 10_000;
    const { assets } = await writableRepository(new IDBFactory(), "lineage_import", () => now);
    const oldBytes = new TextEncoder().encode("old source");
    const newBytes = new TextEncoder().encode("new source");
    const first = await assets.importAsset({
      assetId: "cg_lineage",
      kind: "cg",
      displayName: "Lineage",
      mimeType: "image/png",
      bytes: oldBytes
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    now = 10_050;
    const second = await assets.importAsset({
      assetId: "cg_lineage",
      kind: "cg",
      displayName: "Lineage v2",
      mimeType: "image/png",
      bytes: newBytes
    }, { expectedIndexRevision: 1, maxBytes: 1024 });
    expect(first.lifecycle.roots).toEqual([expect.objectContaining({ rootId: "current" })]);
    expect(second.lifecycle.nodes).toHaveLength(2);
    expect(second.lifecycle.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "current", digests: [createBlobDigest(newBytes)] }),
      expect.objectContaining({ kind: "history", digests: [createBlobDigest(oldBytes)] })
    ]));
    await expect(assets.auditLifecycle()).resolves.toMatchObject({ status: "pass", sourceCount: 2, reachableCount: 2 });
  });

  it("quarantines, atomically trashes and restores an unreachable Blob", async () => {
    let now = 20_000;
    const { assets } = await writableRepository(new IDBFactory(), "recoverable_gc", () => now);
    const bytes = new TextEncoder().encode("unreferenced but recoverable");
    const orphan = createBlobDigest(bytes);
    await assets.put(orphan, bytes);
    const policy = { historyRetentionMs: 100, quarantineDelayMs: 10, trashRetentionMs: 20, recoveryRootMs: 50, maxHistoryRoots: 8 };
    const planned = await assets.planGarbageCollection(policy);
    expect(planned.affectedDigests).toEqual([orphan]);
    await expect(assets.planGarbageCollection(policy)).resolves.toMatchObject({ affectedDigests: [] });
    await expect(assets.sweepGarbageCollection(policy)).resolves.toMatchObject({ affectedDigests: [] });
    now = 20_010;
    const swept = await assets.sweepGarbageCollection(policy);
    expect(swept.affectedDigests).toEqual([orphan]);
    await expect(assets.read(orphan)).resolves.toBeNull();
    expect(swept.manifest.trash).toEqual([expect.objectContaining({ digest: orphan, byteLength: bytes.byteLength })]);
    const restored = await assets.restoreTrash(orphan, policy);
    expect(restored.trash).toEqual([]);
    expect(Array.from(await assets.read(orphan) ?? [])).toEqual(Array.from(bytes));
    expect(restored.roots).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "recovery", digests: [orphan] })]));
  });

  it("purges Trash only after the recoverable retention window", async () => {
    let now = 30_000;
    const { indexedDb, assets } = await writableRepository(new IDBFactory(), "trash_purge", () => now);
    const bytes = new TextEncoder().encode("eventually purge");
    const orphan = createBlobDigest(bytes);
    const policy = { historyRetentionMs: 100, quarantineDelayMs: 10, trashRetentionMs: 20, recoveryRootMs: 50, maxHistoryRoots: 8 };
    await assets.put(orphan, bytes);
    await assets.planGarbageCollection(policy);
    now = 30_010;
    await assets.sweepGarbageCollection(policy);
    now = 30_029;
    await expect(assets.purgeExpiredTrash()).resolves.toEqual([]);
    now = 30_030;
    await expect(assets.purgeExpiredTrash()).resolves.toEqual([orphan]);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open(WORLD_STUDIO_DATABASE_NAME, 4);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(ASSET_TRASH_STORE_NAME, "readonly");
    await expect(indexedDbRequestResult(transaction.objectStore(ASSET_TRASH_STORE_NAME).get(`trash_purge/${orphan}`))).resolves.toBeUndefined();
    await indexedDbTransactionDone(transaction);
    database.close();
  });

  it("stages a backup asset snapshot before project rotation and reconciles only verified slots", async () => {
    let now = 40_000;
    const { assets } = await writableRepository(new IDBFactory(), "asset_backup_link", () => now);
    const oldBytes = new TextEncoder().encode("backup protected source");
    await assets.importAsset({
      assetId: "cg_backup_link",
      kind: "cg",
      displayName: "Backup Link",
      mimeType: "image/png",
      bytes: oldBytes
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    const staged = await assets.stageBackupSnapshot(1, 1, now);
    expect(staged.snapshot).toMatchObject({ slot: 1, sourceStorageRevision: 1, index: { indexRevision: 1 } });
    expect(staged.manifest.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ rootId: "backup:slot-1:s1", digests: [createBlobDigest(oldBytes)] })
    ]));

    const linked = await assets.reconcileBackupSnapshots([{ slot: 1, sourceStorageRevision: 1 }]);
    expect(linked.linkedRecordIds).toEqual(["slot-1:s1"]);
    expect(linked.unlinkedRecordIds).toEqual([]);
    expect(linked.manifest.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ rootId: "backup:slot-1:s1" })
    ]));

    const legacy = await assets.reconcileBackupSnapshots([{ slot: 0, sourceStorageRevision: 2 }]);
    expect(legacy.linkedRecordIds).toEqual([]);
    expect(legacy.unlinkedRecordIds).toEqual(["slot-0:s2"]);
    expect(legacy.manifest.roots.some((root) => root.kind === "backup")).toBe(false);
  });

  it("recovers a crash between staging and project-backup replacement without dropping the verified old root", async () => {
    const { assets } = await writableRepository(new IDBFactory(), "asset_backup_crash", () => 45_000);
    const bytes = new TextEncoder().encode("crash protected source");
    await assets.importAsset({
      assetId: "cg_crash",
      kind: "cg",
      displayName: "Crash CG",
      mimeType: "image/png",
      bytes
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    await assets.stageBackupSnapshot(1, 1, 45_000);
    await assets.reconcileBackupSnapshots([{ slot: 1, sourceStorageRevision: 1 }]);
    const interrupted = await assets.stageBackupSnapshot(1, 6, 45_001);
    expect(interrupted.manifest.roots.filter((root) => root.kind === "backup")).toHaveLength(2);

    const recovered = await assets.reconcileBackupSnapshots([{ slot: 1, sourceStorageRevision: 1 }]);
    expect(recovered.linkedRecordIds).toEqual(["slot-1:s1"]);
    expect(recovered.manifest.roots.filter((root) => root.kind === "backup")).toEqual([
      expect.objectContaining({ rootId: "backup:slot-1:s1", digests: [createBlobDigest(bytes)] })
    ]);
  });

  it("commits a linked backup Asset Index only after the project revision advances", async () => {
    let now = 47_000;
    const { assets } = await writableRepository(new IDBFactory(), "asset_restore_commit", () => now);
    const oldBytes = new TextEncoder().encode("old restore source");
    const newBytes = new TextEncoder().encode("new restore source");
    const old = await assets.importAsset({
      assetId: "cg_restore",
      kind: "cg",
      displayName: "Old Restore CG",
      mimeType: "image/png",
      bytes: oldBytes
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    await assets.stageBackupSnapshot(1, 1, now);
    now += 1;
    await assets.importAsset({
      assetId: "cg_restore",
      kind: "cg",
      displayName: "New Restore CG",
      mimeType: "image/png",
      bytes: newBytes
    }, { expectedIndexRevision: 1, maxBytes: 1024 });
    const intent = await assets.prepareBackupRestore(1, 1, 2);
    expect(intent).toMatchObject({ headBeforeRevision: 2, restoredProjectRevision: 3, targetIndexDigest: expect.any(String) });
    expect((await assets.loadIndex()).assets[0]?.source.digest).toBe(createBlobDigest(newBytes));

    const committed = await assets.commitBackupRestore(3);
    expect(committed.status).toBe("completed");
    expect(committed.index).toEqual(old.index);
    expect((await assets.loadIndex()).assets[0]?.source.digest).toBe(createBlobDigest(oldBytes));
    await expect(assets.resolveBackupRestoreIntent(3)).resolves.toMatchObject({ status: "none" });
    await expect(assets.auditLifecycle()).resolves.toMatchObject({ status: "pass" });
  });

  it("aborts an uncommitted restore intent on startup without changing the current Asset Index", async () => {
    const { assets } = await writableRepository(new IDBFactory(), "asset_restore_abort", () => 48_000);
    const bytes = new TextEncoder().encode("restore abort source");
    const current = await assets.importAsset({
      assetId: "cg_abort",
      kind: "cg",
      displayName: "Abort CG",
      mimeType: "image/png",
      bytes
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    await assets.stageBackupSnapshot(1, 1, 48_000);
    await assets.prepareBackupRestore(1, 1, 4);
    const resolution = await assets.resolveBackupRestoreIntent(4);
    expect(resolution.status).toBe("aborted");
    expect(resolution.index).toEqual(current.index);
    expect(resolution.manifest.roots.some((root) => root.rootId.startsWith("recovery:restore:"))).toBe(false);
  });

  it("publishes an idempotent metadata sidecar Blob, lineage node and build root atomically", async () => {
    const { assets } = await writableRepository(new IDBFactory(), "sidecar_build", () => 50_000);
    const bytes = new TextEncoder().encode("source for deterministic sidecar");
    await assets.importAsset({
      assetId: "cg_sidecar",
      kind: "cg",
      displayName: "Sidecar CG",
      mimeType: "image/png",
      bytes,
      tags: ["night", "chapter-1"]
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    const first = await assets.buildMetadataSidecar("cg_sidecar");
    const second = await assets.buildMetadataSidecar("cg_sidecar");
    expect(first.blobStatus).toBe("created");
    expect(second.blobStatus).toBe("existing");
    expect(second.digest).toBe(first.digest);
    expect(second.manifest.lifecycleRevision).toBe(first.manifest.lifecycleRevision);
    expect(second.manifest.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        digest: first.digest,
        role: "derivative",
        parents: [createBlobDigest(bytes)],
        recipeName: "metadata-sidecar/v1"
      })
    ]));
    expect(second.manifest.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ rootId: "build:sidecar:cg_sidecar", digests: [first.digest] })
    ]));
    const output = await assets.read(first.digest);
    expect(JSON.parse(new TextDecoder().decode(output ?? new Uint8Array()))).toMatchObject({ assetId: "cg_sidecar" });
  });

  it("atomically publishes an inspected thumbnail with source lineage and idempotent output", async () => {
    const { assets } = await writableRepository(new IDBFactory(), "thumbnail_build", () => 52_000);
    const source = new Uint8Array(33);
    source.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    source[19] = 64;
    source[23] = 32;
    const imported = await assets.importAsset({
      assetId: "cg_thumbnail",
      kind: "cg",
      displayName: "Thumbnail CG",
      mimeType: "image/png",
      bytes: source
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    const output = new Uint8Array(33);
    output.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    output[19] = 32;
    output[23] = 16;
    const recipeDigest = createBlobDigest(new TextEncoder().encode("thumbnail recipe"));
    const publication = {
      bytes: output,
      width: 32,
      height: 16,
      mimeType: "image/png" as const,
      recipeName: "thumbnail/web-canvas-png-v1/320",
      recipeDigest
    };
    const first = await assets.publishThumbnail("cg_thumbnail", imported.entry.source.digest, publication);
    const second = await assets.publishThumbnail("cg_thumbnail", imported.entry.source.digest, publication);
    expect(first.blobStatus).toBe("created");
    expect(second.blobStatus).toBe("existing");
    expect(second.digest).toBe(first.digest);
    expect(second.manifest.lifecycleRevision).toBe(first.manifest.lifecycleRevision);
    expect(second.manifest.nodes).toEqual(expect.arrayContaining([expect.objectContaining({
      digest: first.digest,
      role: "derivative",
      parents: [imported.entry.source.digest],
      recipeDigest,
      recipeName: publication.recipeName
    })]));
    expect(second.manifest.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ rootId: "build:thumbnail:cg_thumbnail", digests: [first.digest] })
    ]));
  });

  it.each([
    ["QuotaExceededError", "NO_SPACE"],
    ["NotAllowedError", "PERMISSION_DENIED"],
    ["TransactionInactiveError", "BUSY"],
    ["InvalidStateError", "UNAVAILABLE"],
    ["AbortError", "BUSY"]
  ] as const)("normalizes %s to %s", (name, code) => {
    expect(normalizeIndexedDbAssetError({ name }, "put", "asset")).toMatchObject({ code });
  });
});

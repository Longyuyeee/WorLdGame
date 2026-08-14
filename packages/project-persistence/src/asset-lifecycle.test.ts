import { describe, expect, it } from "vitest";
import {
  auditAssetLifecycle,
  computeAssetReachability,
  createAssetLifecycleManifest,
  eligibleAssetGarbage,
  expiredTrashDigests,
  markAssetGarbageTrashed,
  markAssetTrashPurged,
  parseAssetLifecycleManifest,
  planAssetGarbageCollection,
  protectAssetRoot,
  registerAssetDerivative,
  restoreTrashedAsset,
  serializeAssetLifecycleManifest,
  updateAssetLifecycleForIndex,
  type AssetIndex,
  type BlobDigest
} from "./index";
import { createBlobDigest } from "./asset-blob";

function digest(label: string): BlobDigest {
  return createBlobDigest(new TextEncoder().encode(label));
}

function index(revision: number, entries: readonly [string, BlobDigest][]): AssetIndex {
  return {
    schemaVersion: 1,
    indexRevision: revision,
    assets: entries.map(([assetId, value]) => ({
      assetId,
      kind: "cg" as const,
      displayName: assetId,
      source: { digest: value, byteLength: 16, mimeType: "image/png" },
      tags: []
    }))
  };
}

describe("asset Source/Derivative lifecycle", () => {
  it("creates a current root and round-trips canonical lifecycle JSON", () => {
    const current = index(2, [["cg_a", digest("a")], ["cg_b", digest("b")]]);
    const manifest = createAssetLifecycleManifest(current, 1_000);
    expect(manifest).toMatchObject({ schemaVersion: 1, lifecycleRevision: 0 });
    expect(manifest.nodes).toHaveLength(2);
    expect(manifest.roots).toEqual([expect.objectContaining({ rootId: "current", kind: "current" })]);
    expect(parseAssetLifecycleManifest(serializeAssetLifecycleManifest(manifest))).toEqual(manifest);
    expect(auditAssetLifecycle(manifest, current, 1_000)).toMatchObject({ status: "pass", reachableCount: 2 });
  });

  it("protects a replaced source through an expiring index-history root", () => {
    const oldDigest = digest("old-source");
    const nextDigest = digest("new-source");
    const previous = index(1, [["cg_a", oldDigest]]);
    const next = index(2, [["cg_a", nextDigest]]);
    const updated = updateAssetLifecycleForIndex(createAssetLifecycleManifest(previous, 1_000), previous, next, 2_000, {
      historyRetentionMs: 100,
      quarantineDelayMs: 10,
      trashRetentionMs: 100,
      recoveryRootMs: 50,
      maxHistoryRoots: 4
    });
    expect(computeAssetReachability(updated, 2_050)).toEqual(new Set([oldDigest, nextDigest]));
    expect(computeAssetReachability(updated, 2_101)).toEqual(new Set([nextDigest]));
  });

  it("keeps derivative parents reachable from a build root", () => {
    const source = digest("source");
    const derivative = digest("derivative");
    const recipe = digest("recipe");
    const base = createAssetLifecycleManifest(index(1, [["cg_source", source]]), 1_000);
    const withDerivative = registerAssetDerivative(base, {
      digest: derivative,
      byteLength: 8,
      mimeType: "image/webp",
      parents: [source],
      recipeDigest: recipe,
      recipeName: "webp/lossless-v1",
      createdAtMs: 1_100
    }, 0);
    const protectedManifest = protectAssetRoot(withDerivative, {
      rootId: "build:web-preview",
      kind: "build",
      digests: [derivative],
      createdAtMs: 1_200
    }, 1);
    expect(computeAssetReachability(protectedManifest, 2_000)).toEqual(new Set([source, derivative]));
    expect(auditAssetLifecycle(protectedManifest, index(1, [["cg_source", source]]), 2_000)).toMatchObject({
      status: "pass",
      derivativeCount: 1,
      reachableCount: 2
    });
  });

  it("rejects stale derivatives, missing parents and immutable metadata conflicts", () => {
    const source = digest("source");
    const output = digest("output");
    const base = createAssetLifecycleManifest(index(1, [["cg_source", source]]), 1_000);
    const input = {
      digest: output,
      byteLength: 8,
      mimeType: "image/webp",
      parents: [source],
      recipeDigest: digest("recipe"),
      recipeName: "webp/lossless-v1",
      createdAtMs: 1_100
    } as const;
    expect(() => registerAssetDerivative(base, input, 1)).toThrowError(expect.objectContaining({ code: "STALE_LIFECYCLE_REVISION" }));
    expect(() => registerAssetDerivative(base, { ...input, parents: [digest("missing")] }, 0)).toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
    const first = registerAssetDerivative(base, input, 0);
    expect(() => registerAssetDerivative(first, { ...input, byteLength: 9 }, 1)).toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
  });

  it("quarantines only unreachable blobs and requires the full delay before sweep", () => {
    const currentDigest = digest("current");
    const orphan = digest("orphan");
    const manifest = createAssetLifecycleManifest(index(1, [["cg_current", currentDigest]]), 1_000);
    const planned = planAssetGarbageCollection(manifest, [currentDigest, orphan], 2_000, {
      historyRetentionMs: 100,
      quarantineDelayMs: 50,
      trashRetentionMs: 100,
      recoveryRootMs: 40,
      maxHistoryRoots: 4
    });
    expect(planned.quarantine).toEqual([{ digest: orphan, markedAtMs: 2_000, sweepAfterMs: 2_050 }]);
    expect(eligibleAssetGarbage(planned, 2_049)).toEqual([]);
    expect(eligibleAssetGarbage(planned, 2_050)).toEqual([orphan]);
  });

  it("never quarantines a non-expiring backup root", () => {
    const currentDigest = digest("current");
    const backupDigest = digest("backup-only");
    const base = createAssetLifecycleManifest(index(1, [["cg_current", currentDigest]]), 1_000);
    const protectedManifest = protectAssetRoot(base, {
      rootId: "backup:slot-2:s18",
      kind: "backup",
      digests: [backupDigest],
      createdAtMs: 1_100
    }, 0);
    const planned = planAssetGarbageCollection(protectedManifest, [currentDigest, backupDigest], 9_000);
    expect(planned.quarantine).toEqual([]);
  });

  it("moves eligible content to recoverable trash and restores it with a temporary root", () => {
    const orphan = digest("orphan");
    const policy = { historyRetentionMs: 100, quarantineDelayMs: 10, trashRetentionMs: 100, recoveryRootMs: 40, maxHistoryRoots: 4 };
    const planned = planAssetGarbageCollection(createAssetLifecycleManifest(index(0, []), 1_000), [orphan], 2_000, policy);
    const trashed = markAssetGarbageTrashed(planned, [{ digest: orphan, byteLength: 44 }], 2_010, policy);
    expect(trashed.quarantine).toEqual([]);
    expect(trashed.trash).toEqual([{ digest: orphan, trashedAtMs: 2_010, purgeAfterMs: 2_110, byteLength: 44 }]);
    expect(expiredTrashDigests(trashed, 2_110)).toEqual([orphan]);
    const restored = restoreTrashedAsset(trashed, orphan, 2_050, policy);
    expect(restored.trash).toEqual([]);
    expect([...computeAssetReachability(restored, 2_060)]).toContain(orphan);
    expect(() => restoreTrashedAsset(restored, orphan, 2_060, policy)).toThrowError(expect.objectContaining({ code: "TRASH_NOT_FOUND" }));
  });

  it("permits permanent purge only after Trash retention and reachability checks", () => {
    const orphan = digest("purge-me");
    const policy = { historyRetentionMs: 100, quarantineDelayMs: 10, trashRetentionMs: 100, recoveryRootMs: 40, maxHistoryRoots: 4 };
    const planned = planAssetGarbageCollection(createAssetLifecycleManifest(index(0, []), 1_000), [orphan], 2_000, policy);
    const trashed = markAssetGarbageTrashed(planned, [{ digest: orphan, byteLength: 7 }], 2_010, policy);
    expect(() => markAssetTrashPurged(trashed, [orphan], 2_109)).toThrowError(expect.objectContaining({ code: "GC_NOT_ELIGIBLE" }));
    expect(markAssetTrashPurged(trashed, [orphan], 2_110).trash).toEqual([]);
  });

  it("fails closed on malformed persisted lifecycle data", () => {
    expect(() => parseAssetLifecycleManifest("not-json")).toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
    const source = digest("source");
    const malformed = createAssetLifecycleManifest(index(1, [["cg_source", source]]), 1_000);
    expect(() => parseAssetLifecycleManifest(JSON.stringify({
      ...malformed,
      nodes: [{ ...malformed.nodes[0], digest: "sha256:not-canonical" }]
    }))).toThrowError(expect.objectContaining({ code: "INVALID_DIGEST" }));
  });

  it("rejects duplicate identities, lineage cycles and invalid retention clocks", () => {
    const source = digest("source");
    const first = digest("first");
    const second = digest("second");
    const manifest = createAssetLifecycleManifest(index(1, [["cg_source", source]]), 1_000);
    expect(() => parseAssetLifecycleManifest(JSON.stringify({
      ...manifest,
      nodes: [...manifest.nodes, manifest.nodes[0]]
    }))).toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
    expect(() => parseAssetLifecycleManifest(JSON.stringify({
      ...manifest,
      nodes: [
        ...manifest.nodes,
        { digest: first, role: "derivative", byteLength: 1, mimeType: "image/webp", createdAtMs: 1_000, parents: [second], recipeDigest: digest("r1"), recipeName: "test" },
        { digest: second, role: "derivative", byteLength: 1, mimeType: "image/webp", createdAtMs: 1_000, parents: [first], recipeDigest: digest("r2"), recipeName: "test" }
      ]
    }))).toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
    expect(() => parseAssetLifecycleManifest(JSON.stringify({
      ...manifest,
      quarantine: [{ digest: first, markedAtMs: 2_000, sweepAfterMs: 1_999 }]
    }))).toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
  });
});

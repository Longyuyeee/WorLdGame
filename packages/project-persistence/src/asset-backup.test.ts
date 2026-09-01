import { describe, expect, it } from "vitest";
import {
  assetBackupProtectionRoot,
  assetBackupRecordId,
  createAssetBackupSnapshot,
  createBlobDigest,
  parseAssetBackupSnapshot,
  replaceAssetBackupRoots,
  serializeAssetBackupSnapshot,
  createAssetLifecycleManifest,
  type AssetIndex
} from "./index";

function index(): AssetIndex {
  const digest = createBlobDigest(new TextEncoder().encode("backup-source"));
  return {
    schemaVersion: 1,
    indexRevision: 4,
    assets: [{
      assetId: "cg_backup",
      kind: "cg",
      displayName: "Backup CG",
      source: { digest, byteLength: 13, mimeType: "image/png" },
      tags: []
    }]
  };
}

describe("asset backup snapshots", () => {
  it("round-trips a checksummed index snapshot and derives an exact backup root", () => {
    const snapshot = createAssetBackupSnapshot(index(), 2, 7, 9_000);
    expect(assetBackupRecordId(2, 7)).toBe("slot-2:s7");
    expect(parseAssetBackupSnapshot(serializeAssetBackupSnapshot(snapshot))).toEqual(snapshot);
    expect(assetBackupProtectionRoot(snapshot)).toEqual({
      rootId: "backup:slot-2:s7",
      kind: "backup",
      digests: [index().assets[0]?.source.digest],
      createdAtMs: 9_000
    });
  });

  it("fails closed on tampering and invalid rotation coordinates", () => {
    const snapshot = createAssetBackupSnapshot(index(), 1, 3, 4_000);
    const tampered = JSON.parse(serializeAssetBackupSnapshot(snapshot)) as Record<string, unknown>;
    tampered.indexDigest = createBlobDigest(new TextEncoder().encode("tampered"));
    expect(() => parseAssetBackupSnapshot(JSON.stringify(tampered))).toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
    expect(() => createAssetBackupSnapshot(index(), 20, 3, 4_000)).toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
  });

  it("replaces only backup roots during authoritative reconciliation", () => {
    const currentIndex = index();
    const manifest = createAssetLifecycleManifest(currentIndex, 1_000);
    const snapshot = createAssetBackupSnapshot(currentIndex, 1, 3, 4_000);
    const reconciled = replaceAssetBackupRoots(manifest, [snapshot], 0, 4_000);
    expect(reconciled.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ rootId: "current", kind: "current" }),
      expect.objectContaining({ rootId: "backup:slot-1:s3", kind: "backup" })
    ]));
    expect(() => replaceAssetBackupRoots(reconciled, [], 0, 5_000)).toThrowError(expect.objectContaining({ code: "STALE_LIFECYCLE_REVISION" }));
  });
});

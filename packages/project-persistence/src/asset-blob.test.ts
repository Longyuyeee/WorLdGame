import { describe, expect, it } from "vitest";
import {
  AssetBlobError,
  InMemoryAssetBlobStore,
  assetBlobPath,
  auditAssetBlobStore,
  auditAssetIndex,
  createAssetIndex,
  createBlobDigest,
  importAssetBlob,
  parseAssetIndex,
  serializeAssetIndex,
  sha256Bytes,
  type AssetIndex,
  type BlobDigest
} from "./index";

const encoder = new TextEncoder();

describe("content-addressed asset blobs", () => {
  it("keeps byte hashing portable and maps digests to canonical sharded paths", () => {
    expect(sha256Bytes(encoder.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    const digest = createBlobDigest(encoder.encode("abc"));
    expect(digest).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(assetBlobPath(digest)).toBe(
      "blobs/sha256/ba/7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("passes the shared immutable blob-store conformance suite", async () => {
    const report = await auditAssetBlobStore(new InMemoryAssetBlobStore());
    expect(report.checks).toEqual([
      "declared-capabilities",
      "missing-read",
      "verified-roundtrip-and-deduplication",
      "defensive-read-copy",
      "enumerable-addresses",
      "digest-mismatch-rejected",
      "canonical-digest"
    ]);
  });

  it("deduplicates identical CG bytes while preserving two stable asset IDs", async () => {
    const store = new InMemoryAssetBlobStore();
    const bytes = encoder.encode("lossless-cg-pixels");
    const first = await importAssetBlob(store, createAssetIndex(), {
      assetId: "cg_broadcast_base",
      kind: "cg",
      displayName: "广播室基图",
      mimeType: "image/png",
      bytes,
      tags: ["chapter-1", "gallery", "gallery"]
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    const second = await importAssetBlob(store, first.index, {
      assetId: "cg_broadcast_duplicate",
      kind: "cg",
      displayName: "广播室复用图",
      mimeType: "image/png",
      bytes
    }, { expectedIndexRevision: 1, maxBytes: 1024 });

    expect(first.blobStatus).toBe("created");
    expect(second.blobStatus).toBe("existing");
    expect(first.entry.tags).toEqual(["chapter-1", "gallery"]);
    expect(second.index.assets.map((entry) => entry.assetId)).toEqual([
      "cg_broadcast_base",
      "cg_broadcast_duplicate"
    ]);
    await expect(auditAssetIndex(store, second.index)).resolves.toMatchObject({
      status: "pass",
      assetCount: 2,
      uniqueBlobCount: 1,
      referencedBytes: bytes.byteLength * 2,
      uniqueBytes: bytes.byteLength,
      deduplicatedBytes: bytes.byteLength,
      findings: []
    });
  });

  it("replaces one asset source without mutating the old immutable blob", async () => {
    const store = new InMemoryAssetBlobStore();
    const original = encoder.encode("original");
    const replacement = encoder.encode("replacement");
    const first = await importAssetBlob(store, createAssetIndex(), {
      assetId: "char_xia_smile",
      kind: "character",
      displayName: "夏 · 微笑",
      mimeType: "image/png",
      bytes: original
    }, { expectedIndexRevision: 0, maxBytes: 1024 });
    const second = await importAssetBlob(store, first.index, {
      assetId: "char_xia_smile",
      kind: "character",
      displayName: "夏 · 微笑修订",
      mimeType: "image/png",
      bytes: replacement
    }, { expectedIndexRevision: 1, maxBytes: 1024 });

    expect(second.index.indexRevision).toBe(2);
    expect(second.index.assets).toHaveLength(1);
    expect(await store.read(createBlobDigest(original))).toEqual(original);
    expect(await store.read(createBlobDigest(replacement))).toEqual(replacement);
  });

  it("rejects stale revisions, unsafe metadata and over-budget input before publication", async () => {
    const store = new InMemoryAssetBlobStore();
    const bytes = encoder.encode("12345");
    const base = createAssetIndex();
    const input = {
      assetId: "cg_safe",
      kind: "cg" as const,
      displayName: "安全 CG",
      mimeType: "image/png",
      bytes
    };
    await expect(importAssetBlob(store, base, input, {
      expectedIndexRevision: 9,
      maxBytes: 10
    })).rejects.toMatchObject({ code: "STALE_INDEX_REVISION" });
    await expect(importAssetBlob(store, base, { ...input, assetId: "../escape" }, {
      expectedIndexRevision: 0,
      maxBytes: 10
    })).rejects.toMatchObject({ code: "INVALID_ASSET" });
    await expect(importAssetBlob(store, base, input, {
      expectedIndexRevision: 0,
      maxBytes: 4
    })).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    await expect(store.read(createBlobDigest(bytes))).resolves.toBeNull();
  });

  it("reports missing, corrupt and size-mismatched index references", async () => {
    const good = encoder.encode("good");
    const digest = createBlobDigest(good);
    const entry = {
      assetId: "cg_audit",
      kind: "cg" as const,
      displayName: "审计 CG",
      source: { digest, byteLength: good.byteLength + 1, mimeType: "image/png" },
      tags: []
    };
    const index: AssetIndex = { schemaVersion: 1, indexRevision: 1, assets: [entry] };
    await expect(auditAssetIndex(new InMemoryAssetBlobStore(), index)).resolves.toMatchObject({
      status: "fail",
      findings: [{ code: "MISSING_BLOB" }]
    });

    const corruptStore = new InMemoryAssetBlobStore(new Map([[digest, encoder.encode("bad")]]));
    await expect(auditAssetIndex(corruptStore, index)).resolves.toMatchObject({
      status: "fail",
      findings: [{ code: "CORRUPT_BLOB" }]
    });

    const validStore = new InMemoryAssetBlobStore();
    await validStore.put(digest, good);
    await expect(auditAssetIndex(validStore, index)).resolves.toMatchObject({
      status: "fail",
      findings: [{ code: "SIZE_MISMATCH" }]
    });
  });

  it("strictly parses indexes, preserves unknown fields and rejects duplicate stable IDs", () => {
    const digest = createBlobDigest(encoder.encode("asset"));
    const parsed = parseAssetIndex(JSON.stringify({
      schemaVersion: 1,
      indexRevision: 4,
      futureTopLevel: { enabled: true },
      assets: [{
        assetId: "cg_future",
        kind: "cg",
        displayName: "Future CG",
        source: { digest, byteLength: 5, mimeType: "image/png" },
        tags: ["gallery"],
        futureEntryField: "kept"
      }]
    }));
    expect(parsed.preservedFields).toEqual({ futureTopLevel: { enabled: true } });
    expect(parsed.assets[0]?.preservedFields).toEqual({ futureEntryField: "kept" });
    expect(parseAssetIndex(serializeAssetIndex(parsed))).toEqual(parsed);

    const duplicate = { ...parsed, assets: [parsed.assets[0], parsed.assets[0]] };
    expect(() => parseAssetIndex(JSON.stringify(duplicate))).toThrowError(AssetBlobError);
    try {
      parseAssetIndex('{"schemaVersion":2,"indexRevision":0,"assets":[]}');
      throw new Error("Expected future asset index rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AssetBlobError);
      expect(error).toMatchObject({ code: "UNSUPPORTED_INDEX_SCHEMA" });
    }
  });

  it("reports one corrupt shared blob consistently for every referencing asset", async () => {
    const good = encoder.encode("shared-good");
    const digest = createBlobDigest(good);
    const source = { digest, byteLength: good.byteLength, mimeType: "image/png" };
    const index: AssetIndex = {
      schemaVersion: 1,
      indexRevision: 2,
      assets: [
        { assetId: "cg_shared_a", kind: "cg", displayName: "A", source, tags: [] },
        { assetId: "cg_shared_b", kind: "cg", displayName: "B", source, tags: [] }
      ]
    };
    const store = new InMemoryAssetBlobStore(new Map([[digest, encoder.encode("tampered")]]));
    const report = await auditAssetIndex(store, index);
    expect(report.findings).toHaveLength(2);
    expect(report.findings.map((finding) => finding.code)).toEqual(["CORRUPT_BLOB", "CORRUPT_BLOB"]);
  });

  it("reports complete unreferenced blobs as orphans without deleting them", async () => {
    const store = new InMemoryAssetBlobStore();
    const bytes = encoder.encode("orphan after failed index publication");
    const digest = createBlobDigest(bytes);
    await store.put(digest, bytes);
    await expect(auditAssetIndex(store, createAssetIndex())).resolves.toMatchObject({
      status: "fail",
      findings: [{ code: "ORPHAN_BLOB", digest }]
    });
    await expect(store.read(digest)).resolves.toEqual(bytes);
  });

  it("rejects corrupt pre-existing immutable content instead of overwriting it", async () => {
    const good = encoder.encode("expected");
    const digest = createBlobDigest(good);
    const store = new InMemoryAssetBlobStore(new Map([[digest, encoder.encode("tampered")]]));
    await expect(store.put(digest, good)).rejects.toBeInstanceOf(AssetBlobError);
    await expect(store.put(digest, good)).rejects.toMatchObject({ code: "CORRUPT_BLOB" });
  });

  it("rejects non-canonical digest aliases", async () => {
    await expect(new InMemoryAssetBlobStore().read("sha256:ABC" as BlobDigest))
      .rejects.toMatchObject({ code: "INVALID_DIGEST" });
  });
});

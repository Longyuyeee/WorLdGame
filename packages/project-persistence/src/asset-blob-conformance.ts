import {
  AssetBlobError,
  createBlobDigest,
  type AssetBlobStore,
  type AssetBlobStoreCapabilities,
  type BlobDigest
} from "./asset-blob";

export interface AssetBlobStoreConformanceReport {
  readonly capabilities: AssetBlobStoreCapabilities;
  readonly checks: readonly string[];
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`AssetBlobStore conformance failed: ${message}`);
}

export async function auditAssetBlobStore(
  store: AssetBlobStore
): Promise<AssetBlobStoreConformanceReport> {
  const checks: string[] = [];
  requireCondition(store.capabilities.immutableWrites, "immutableWrites must be guaranteed");
  requireCondition(store.capabilities.verifiedReads, "verifiedReads must be guaranteed");
  checks.push("declared-capabilities");

  const bytes = new TextEncoder().encode("黄昏广播\r\n🌆");
  const digest = createBlobDigest(bytes);
  requireCondition(await store.read(digest) === null, "missing read must return null");
  checks.push("missing-read");

  requireCondition(await store.put(digest, bytes) === "created", "first put must create the blob");
  requireCondition(await store.put(digest, bytes) === "existing", "duplicate put must deduplicate");
  const loaded = await store.read(digest);
  requireCondition(loaded !== null && createBlobDigest(loaded) === digest, "binary bytes must round-trip");
  checks.push("verified-roundtrip-and-deduplication");

  if (loaded !== null) loaded.fill(0);
  const loadedAgain = await store.read(digest);
  requireCondition(loadedAgain !== null && createBlobDigest(loadedAgain) === digest, "read must return a defensive copy");
  checks.push("defensive-read-copy");

  requireCondition((await store.list()).includes(digest), "published digest must be enumerable for orphan audits");
  checks.push("enumerable-addresses");

  const wrong = createBlobDigest(new Uint8Array([1, 2, 3]));
  let mismatchRejected = false;
  try {
    await store.put(wrong, bytes);
  } catch (error) {
    mismatchRejected = error instanceof AssetBlobError && error.code === "DIGEST_MISMATCH";
  }
  requireCondition(mismatchRejected, "claimed digest mismatch must be rejected before publication");
  checks.push("digest-mismatch-rejected");

  let invalidRejected = false;
  try {
    await store.read("sha256:ABC" as BlobDigest);
  } catch (error) {
    invalidRejected = error instanceof AssetBlobError && error.code === "INVALID_DIGEST";
  }
  requireCondition(invalidRejected, "non-canonical digest must be rejected");
  checks.push("canonical-digest");

  return { capabilities: store.capabilities, checks };
}

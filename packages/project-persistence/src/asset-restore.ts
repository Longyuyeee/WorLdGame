import {
  AssetBlobError,
  assertBlobDigest,
  createBlobDigest,
  parseAssetIndex,
  serializeAssetIndex,
  type AssetIndex,
  type BlobDigest
} from "./asset-blob";
import type { AssetProtectionRoot } from "./asset-lifecycle";

export const ASSET_RESTORE_INTENT_RECORD_ID = "__restore-intent__";

export interface AssetBackupRestoreIntent {
  readonly schemaVersion: 1;
  readonly intentId: string;
  readonly targetSlot: number;
  readonly targetSourceStorageRevision: number;
  readonly headBeforeRevision: number;
  readonly restoredProjectRevision: number;
  readonly previousIndexDigest: BlobDigest;
  readonly targetIndexDigest: BlobDigest;
  readonly targetIndex: AssetIndex;
  readonly protectedSourceDigests: readonly BlobDigest[];
  readonly createdAtMs: number;
}

const INTENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function fail(detail: string): never {
  throw new AssetBlobError("INVALID_ASSET", "index", ASSET_RESTORE_INTENT_RECORD_ID, detail);
}

function assertSafe(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${name} is invalid`);
}

export function createAssetBackupRestoreIntent(input: Omit<AssetBackupRestoreIntent, "schemaVersion">): AssetBackupRestoreIntent {
  if (!INTENT_ID.test(input.intentId)) fail("Restore intent ID is invalid");
  assertSafe(input.targetSlot, "targetSlot");
  if (input.targetSlot > 19) fail("targetSlot is outside the backup policy limit");
  assertSafe(input.targetSourceStorageRevision, "targetSourceStorageRevision");
  assertSafe(input.headBeforeRevision, "headBeforeRevision");
  assertSafe(input.restoredProjectRevision, "restoredProjectRevision");
  assertSafe(input.createdAtMs, "createdAtMs");
  if (input.restoredProjectRevision !== input.headBeforeRevision + 1) {
    fail("Restored project revision must be the next head revision");
  }
  assertBlobDigest(input.previousIndexDigest, "index");
  assertBlobDigest(input.targetIndexDigest, "index");
  const targetIndex = parseAssetIndex(serializeAssetIndex(input.targetIndex));
  const encodedTarget = new TextEncoder().encode(serializeAssetIndex(targetIndex));
  const actualTargetDigest = createBlobDigest(encodedTarget);
  if (actualTargetDigest !== input.targetIndexDigest) fail("Target Asset Index checksum is inconsistent");
  const protectedSourceDigests = [...new Set(input.protectedSourceDigests)];
  for (const digest of protectedSourceDigests) assertBlobDigest(digest, "index");
  return { schemaVersion: 1, ...input, targetIndex, protectedSourceDigests: protectedSourceDigests.sort() };
}

export function serializeAssetBackupRestoreIntent(intent: AssetBackupRestoreIntent): string {
  return JSON.stringify(createAssetBackupRestoreIntent(intent));
}

export function parseAssetBackupRestoreIntent(source: string): AssetBackupRestoreIntent {
  let value: unknown;
  try { value = JSON.parse(source); } catch { return fail("Restore intent is not valid JSON"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("Restore intent envelope is invalid");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.intentId !== "string" ||
      typeof record.targetSlot !== "number" || typeof record.targetSourceStorageRevision !== "number" ||
      typeof record.headBeforeRevision !== "number" || typeof record.restoredProjectRevision !== "number" ||
      typeof record.previousIndexDigest !== "string" || typeof record.targetIndexDigest !== "string" ||
      typeof record.targetIndex !== "object" || record.targetIndex === null ||
      !Array.isArray(record.protectedSourceDigests) || !record.protectedSourceDigests.every((digest) => typeof digest === "string") ||
      typeof record.createdAtMs !== "number") {
    fail("Restore intent envelope is incomplete");
  }
  return createAssetBackupRestoreIntent(record as unknown as Omit<AssetBackupRestoreIntent, "schemaVersion">);
}

export function assetRestoreRecoveryRoot(intent: AssetBackupRestoreIntent, expiresAtMs: number): AssetProtectionRoot {
  assertSafe(expiresAtMs, "expiresAtMs");
  if (expiresAtMs <= intent.createdAtMs) fail("Restore recovery root expiry is invalid");
  return {
    rootId: `recovery:restore:${intent.intentId}`,
    kind: "recovery",
    digests: intent.protectedSourceDigests,
    createdAtMs: intent.createdAtMs,
    expiresAtMs
  };
}

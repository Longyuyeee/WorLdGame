import { sha256Bytes } from "./sha256";
import type { JsonObject } from "./model";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const ASSET_ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

export type AssetKind = "background" | "character" | "cg" | "audio" | "video" |
  "font" | "ui" | "other";
export type BlobDigest = `sha256:${string}`;

export interface AssetBlobReference {
  readonly digest: BlobDigest;
  readonly byteLength: number;
  readonly mimeType: string;
}

export interface AssetIndexEntry {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly displayName: string;
  readonly source: AssetBlobReference;
  readonly tags: readonly string[];
  readonly preservedFields?: JsonObject;
}

export interface AssetIndex {
  readonly schemaVersion: 1;
  readonly indexRevision: number;
  readonly assets: readonly AssetIndexEntry[];
  readonly preservedFields?: JsonObject;
}

export interface AssetBlobStoreCapabilities {
  readonly backend: string;
  readonly immutableWrites: true;
  readonly verifiedReads: true;
  readonly durability: "volatile" | "browser-managed" | "file-sync" | "file-and-directory-sync";
  readonly workspaceScope: "memory" | "origin-private" | "app-private" | "user-selected";
}

export interface AssetBlobStore {
  readonly capabilities: AssetBlobStoreCapabilities;
  /** Stores a complete immutable blob. Implementations must verify digest before publication. */
  put(digest: BlobDigest, bytes: Uint8Array): Promise<"created" | "existing">;
  /** Reads a defensive copy and verifies its digest. Missing content returns null. */
  read(digest: BlobDigest): Promise<Uint8Array | null>;
  /** Lists canonical addresses for integrity/orphan audits. It does not delete content. */
  list(): Promise<readonly BlobDigest[]>;
}

export type AssetBlobOperation = "put" | "read" | "index";
export type AssetBlobErrorCode = "INVALID_DIGEST" | "DIGEST_MISMATCH" |
  "INVALID_ASSET" | "UNSUPPORTED_INDEX_SCHEMA" | "RESOURCE_LIMIT" |
  "UNSAFE_MEDIA" | "UNSUPPORTED_MEDIA_TYPE" | "MIME_MISMATCH" | "INSPECTION_UNAVAILABLE" |
  "STALE_LIFECYCLE_REVISION" | "GC_NOT_ELIGIBLE" | "TRASH_NOT_FOUND" |
  "STALE_INDEX_REVISION" | "CORRUPT_BLOB" | "LEASE_REQUIRED" | "LEASE_LOST" |
  "CANCELLED" |
  "NO_SPACE" | "PERMISSION_DENIED" | "BUSY" | "UNAVAILABLE" | "IO_FAILURE";

export class AssetBlobError extends Error {
  constructor(
    readonly code: AssetBlobErrorCode,
    readonly operation: AssetBlobOperation,
    readonly subject: string,
    message: string
  ) {
    super(message);
    this.name = "AssetBlobError";
  }
}

export interface AssetImportInput {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly displayName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly tags?: readonly string[];
  readonly preservedFields?: JsonObject;
}

export interface AssetImportOptions {
  readonly expectedIndexRevision: number;
  readonly maxBytes: number;
}

export interface AssetImportResult {
  readonly index: AssetIndex;
  readonly entry: AssetIndexEntry;
  readonly blobStatus: "created" | "existing";
}

export interface PreparedAssetImport {
  readonly digest: BlobDigest;
  readonly index: AssetIndex;
  readonly entry: AssetIndexEntry;
}

export interface AssetIndexAuditFinding {
  readonly assetId?: string;
  readonly digest: BlobDigest;
  readonly code: "MISSING_BLOB" | "CORRUPT_BLOB" | "SIZE_MISMATCH" | "ORPHAN_BLOB";
  readonly detail: string;
}

export interface AssetIndexAuditReport {
  readonly status: "pass" | "fail";
  readonly assetCount: number;
  readonly uniqueBlobCount: number;
  readonly referencedBytes: number;
  readonly uniqueBytes: number;
  readonly deduplicatedBytes: number;
  readonly findings: readonly AssetIndexAuditFinding[];
}

export function createAssetIndex(): AssetIndex {
  return { schemaVersion: 1, indexRevision: 0, assets: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preservedUnknownFields(
  record: Record<string, unknown>,
  known: readonly string[]
): JsonObject | undefined {
  const entries = Object.entries(record).filter(([key]) => !known.includes(key));
  return entries.length === 0 ? undefined : Object.fromEntries(entries) as JsonObject;
}

/** Rejects malformed/future indexes before any Blob read or write is attempted. */
export function parseAssetIndex(source: string): AssetIndex {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new AssetBlobError("INVALID_ASSET", "index", "assets/assets.json", "Asset index is not valid JSON");
  }
  if (isRecord(value) && Number.isSafeInteger(value.schemaVersion) && (value.schemaVersion as number) > 1) {
    throw new AssetBlobError(
      "UNSUPPORTED_INDEX_SCHEMA",
      "index",
      "assets/assets.json",
      `Asset index schema ${value.schemaVersion as number} is newer than supported schema 1`
    );
  }
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      !Number.isSafeInteger(value.indexRevision) || (value.indexRevision as number) < 0 ||
      !Array.isArray(value.assets)) {
    throw new AssetBlobError("INVALID_ASSET", "index", "assets/assets.json", "Asset index header is invalid or unsupported");
  }
  const assetKinds: readonly AssetKind[] = ["background", "character", "cg", "audio", "video", "font", "ui", "other"];
  const ids = new Set<string>();
  const assets = value.assets.map((candidate, position): AssetIndexEntry => {
    if (!isRecord(candidate) || typeof candidate.assetId !== "string" || !ASSET_ID.test(candidate.assetId) ||
        ids.has(candidate.assetId) || !assetKinds.includes(candidate.kind as AssetKind) ||
        typeof candidate.displayName !== "string" || candidate.displayName.trim().length === 0 ||
        candidate.displayName.length > 256 || !isRecord(candidate.source) ||
        typeof candidate.source.digest !== "string" ||
        !Number.isSafeInteger(candidate.source.byteLength) || (candidate.source.byteLength as number) < 0 ||
        typeof candidate.source.mimeType !== "string" || !MIME_TYPE.test(candidate.source.mimeType) ||
        !Array.isArray(candidate.tags) || candidate.tags.some((tag) =>
          typeof tag !== "string" || tag.trim().length === 0 || tag.length > 64)) {
      throw new AssetBlobError("INVALID_ASSET", "index", `assets[${position}]`, "Asset index entry is invalid or duplicated");
    }
    assertBlobDigest(candidate.source.digest, "index");
    ids.add(candidate.assetId);
    const unknown = preservedUnknownFields(candidate, ["assetId", "kind", "displayName", "source", "tags", "preservedFields"]);
    const explicitPreserved = isRecord(candidate.preservedFields) ? candidate.preservedFields as JsonObject : undefined;
    const preservedFields = explicitPreserved === undefined
      ? unknown
      : unknown === undefined ? explicitPreserved : { ...explicitPreserved, ...unknown };
    return {
      assetId: candidate.assetId,
      kind: candidate.kind as AssetKind,
      displayName: candidate.displayName,
      source: {
        digest: candidate.source.digest,
        byteLength: candidate.source.byteLength as number,
        mimeType: candidate.source.mimeType
      },
      tags: [...new Set(candidate.tags as string[])].sort(),
      ...(preservedFields === undefined ? {} : { preservedFields })
    };
  }).sort((left, right) => left.assetId.localeCompare(right.assetId, "en"));
  const unknown = preservedUnknownFields(value, ["schemaVersion", "indexRevision", "assets", "preservedFields"]);
  const explicitPreserved = isRecord(value.preservedFields) ? value.preservedFields as JsonObject : undefined;
  const preservedFields = explicitPreserved === undefined
    ? unknown
    : unknown === undefined ? explicitPreserved : { ...explicitPreserved, ...unknown };
  return {
    schemaVersion: 1,
    indexRevision: value.indexRevision as number,
    assets,
    ...(preservedFields === undefined ? {} : { preservedFields })
  };
}

export function serializeAssetIndex(index: AssetIndex): string {
  return JSON.stringify(parseAssetIndex(JSON.stringify(index)));
}

export function createBlobDigest(bytes: Uint8Array): BlobDigest {
  return `sha256:${sha256Bytes(bytes)}`;
}

export function assertBlobDigest(digest: string, operation: AssetBlobOperation): asserts digest is BlobDigest {
  const parts = digest.split(":");
  if (parts.length !== 2 || parts[0] !== "sha256" || !SHA256_HEX.test(parts[1] ?? "")) {
    throw new AssetBlobError(
      "INVALID_DIGEST",
      operation,
      digest,
      "Blob digest must use canonical lowercase sha256:<64 hex> form"
    );
  }
}

export function assetBlobPath(digest: BlobDigest): string {
  assertBlobDigest(digest, "read");
  const hex = digest.slice("sha256:".length);
  return `blobs/sha256/${hex.slice(0, 2)}/${hex.slice(2)}`;
}

function validateAssetInput(input: AssetImportInput, options: AssetImportOptions): void {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new AssetBlobError("RESOURCE_LIMIT", "index", input.assetId, "maxBytes must be a positive safe integer");
  }
  if (input.bytes.byteLength > options.maxBytes) {
    throw new AssetBlobError(
      "RESOURCE_LIMIT",
      "put",
      input.assetId,
      `Asset uses ${input.bytes.byteLength} bytes, exceeding the ${options.maxBytes} byte import limit`
    );
  }
  if (!ASSET_ID.test(input.assetId) || input.displayName.trim().length === 0 ||
      input.displayName.length > 256 || !MIME_TYPE.test(input.mimeType)) {
    throw new AssetBlobError("INVALID_ASSET", "index", input.assetId, "Asset metadata is not canonical or exceeds limits");
  }
  if ((input.tags ?? []).some((tag) => tag.trim().length === 0 || tag.length > 64)) {
    throw new AssetBlobError("INVALID_ASSET", "index", input.assetId, "Asset tags must be non-empty and at most 64 characters");
  }
}

/**
 * Publishes bytes before returning a new immutable index. A later index-write failure can
 * leave an unreferenced blob, but can never publish an index entry pointing at partial bytes.
 */
export function prepareAssetImport(
  index: AssetIndex,
  input: AssetImportInput,
  options: AssetImportOptions
): PreparedAssetImport {
  if (index.schemaVersion !== 1) {
    throw new AssetBlobError("INVALID_ASSET", "index", input.assetId, "Unsupported asset index schema");
  }
  if (options.expectedIndexRevision !== index.indexRevision) {
    throw new AssetBlobError(
      "STALE_INDEX_REVISION",
      "index",
      input.assetId,
      `Expected asset index r${options.expectedIndexRevision}, current r${index.indexRevision}`
    );
  }
  validateAssetInput(input, options);
  const digest = createBlobDigest(input.bytes);
  const entry: AssetIndexEntry = {
    assetId: input.assetId,
    kind: input.kind,
    displayName: input.displayName.trim(),
    source: { digest, byteLength: input.bytes.byteLength, mimeType: input.mimeType },
    tags: [...new Set(input.tags ?? [])].sort(),
    ...(input.preservedFields === undefined ? {} : { preservedFields: input.preservedFields })
  };
  const assets = index.assets.filter((asset) => asset.assetId !== input.assetId);
  assets.push(entry);
  assets.sort((left, right) => left.assetId.localeCompare(right.assetId, "en"));
  return {
    digest,
    entry,
    index: {
      schemaVersion: 1,
      indexRevision: index.indexRevision + 1,
      assets,
      ...(index.preservedFields === undefined ? {} : { preservedFields: index.preservedFields })
    }
  };
}


export async function importAssetBlob(
  store: AssetBlobStore,
  index: AssetIndex,
  input: AssetImportInput,
  options: AssetImportOptions
): Promise<AssetImportResult> {
  const prepared = prepareAssetImport(index, input, options);
  const blobStatus = await store.put(prepared.digest, input.bytes);
  return { index: prepared.index, entry: prepared.entry, blobStatus };
}

export async function auditAssetIndex(
  store: AssetBlobStore,
  index: AssetIndex
): Promise<AssetIndexAuditReport> {
  const findings: AssetIndexAuditFinding[] = [];
  const checked = new Map<BlobDigest, {
    readonly byteLength: number;
    readonly valid: boolean;
    readonly failureCode?: "MISSING_BLOB" | "CORRUPT_BLOB";
    readonly failureDetail?: string;
  }>();
  for (const entry of index.assets) {
    let result = checked.get(entry.source.digest);
    if (result === undefined) {
      try {
        const bytes = await store.read(entry.source.digest);
        result = bytes === null
          ? {
              byteLength: 0,
              valid: false,
              failureCode: "MISSING_BLOB",
              failureDetail: "Asset index references a blob that is not present"
            }
          : { byteLength: bytes.byteLength, valid: true };
      } catch (error) {
        result = {
          byteLength: 0,
          valid: false,
          failureCode: "CORRUPT_BLOB",
          failureDetail: error instanceof Error ? error.message : "Blob integrity verification failed"
        };
      }
      checked.set(entry.source.digest, result);
    }
    if (!result.valid) {
      findings.push({
        assetId: entry.assetId,
        digest: entry.source.digest,
        code: result.failureCode ?? "CORRUPT_BLOB",
        detail: result.failureDetail ?? "Blob integrity verification failed"
      });
    } else if (result.valid && result.byteLength !== entry.source.byteLength) {
      findings.push({
        assetId: entry.assetId,
        digest: entry.source.digest,
        code: "SIZE_MISMATCH",
        detail: `Index expects ${entry.source.byteLength} bytes, blob has ${result.byteLength}`
      });
    }
  }
  const referenced = new Set(index.assets.map((entry) => entry.source.digest));
  for (const digest of await store.list()) {
    assertBlobDigest(digest, "read");
    if (!referenced.has(digest)) {
      findings.push({
        digest,
        code: "ORPHAN_BLOB",
        detail: "Blob is complete but is not referenced by the current asset index"
      });
    }
  }
  const referencedBytes = index.assets.reduce((total, entry) => total + entry.source.byteLength, 0);
  const uniqueBytes = [...new Map(index.assets.map((entry) => [entry.source.digest, entry.source.byteLength])).values()]
    .reduce((total, size) => total + size, 0);
  return {
    status: findings.length === 0 ? "pass" : "fail",
    assetCount: index.assets.length,
    uniqueBlobCount: checked.size,
    referencedBytes,
    uniqueBytes,
    deduplicatedBytes: referencedBytes - uniqueBytes,
    findings
  };
}

export class InMemoryAssetBlobStore implements AssetBlobStore {
  readonly capabilities = {
    backend: "memory",
    immutableWrites: true,
    verifiedReads: true,
    durability: "volatile",
    workspaceScope: "memory"
  } as const;
  private readonly blobs = new Map<BlobDigest, Uint8Array>();

  constructor(initial?: ReadonlyMap<BlobDigest, Uint8Array>) {
    for (const [digest, bytes] of initial ?? []) this.blobs.set(digest, bytes.slice());
  }

  async put(digest: BlobDigest, bytes: Uint8Array): Promise<"created" | "existing"> {
    assertBlobDigest(digest, "put");
    if (createBlobDigest(bytes) !== digest) {
      throw new AssetBlobError("DIGEST_MISMATCH", "put", digest, "Input bytes do not match the claimed digest");
    }
    const existing = this.blobs.get(digest);
    if (existing !== undefined) {
      if (createBlobDigest(existing) !== digest) {
        throw new AssetBlobError("CORRUPT_BLOB", "put", digest, "Existing immutable blob is corrupt");
      }
      return "existing";
    }
    this.blobs.set(digest, bytes.slice());
    return "created";
  }

  async read(digest: BlobDigest): Promise<Uint8Array | null> {
    assertBlobDigest(digest, "read");
    const bytes = this.blobs.get(digest);
    if (bytes === undefined) return null;
    if (createBlobDigest(bytes) !== digest) {
      throw new AssetBlobError("CORRUPT_BLOB", "read", digest, "Stored blob failed SHA-256 verification");
    }
    return bytes.slice();
  }

  async list(): Promise<readonly BlobDigest[]> {
    return [...this.blobs.keys()].sort();
  }
}

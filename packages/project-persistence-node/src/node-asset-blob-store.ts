import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve, sep } from "node:path";
import {
  AssetBlobError,
  assetBlobPath,
  assertBlobDigest,
  createBlobDigest,
  type AssetBlobErrorCode,
  type AssetBlobOperation,
  type AssetBlobStore,
  type BlobDigest
} from "@world-studio/project-persistence";

export interface NodeAssetBlobStoreOptions {
  readonly rootDirectory: string;
  readonly directorySync?: "best-effort" | "required";
}

export function normalizeNodeAssetBlobError(
  error: unknown,
  operation: AssetBlobOperation,
  subject: string
): AssetBlobError {
  if (error instanceof AssetBlobError) return error;
  const systemCode = (error as NodeJS.ErrnoException | null)?.code;
  const code: AssetBlobErrorCode = systemCode === "ENOSPC" || systemCode === "EDQUOT"
    ? "NO_SPACE"
    : systemCode === "EACCES" || systemCode === "EPERM" || systemCode === "EROFS"
      ? "PERMISSION_DENIED"
      : systemCode === "EBUSY" || systemCode === "EAGAIN" || systemCode === "ETXTBSY"
        ? "BUSY"
        : systemCode === "ENODEV" || systemCode === "ENXIO"
          ? "UNAVAILABLE"
          : "IO_FAILURE";
  return new AssetBlobError(
    code,
    operation,
    subject,
    `Node blob ${operation} failed (${systemCode ?? "unknown"})`
  );
}

/** Reference app-private filesystem adapter. Source blobs are immutable and never removed here. */
export class NodeAssetBlobStore implements AssetBlobStore {
  readonly capabilities;
  private readonly rootDirectory: string;
  private readonly directorySync: "best-effort" | "required";
  private mutationTail: Promise<unknown> = Promise.resolve();

  constructor(options: NodeAssetBlobStoreOptions) {
    if (!isAbsolute(options.rootDirectory)) {
      throw new AssetBlobError("INVALID_ASSET", "read", options.rootDirectory, "Blob rootDirectory must be absolute");
    }
    this.rootDirectory = resolve(options.rootDirectory);
    if (parse(this.rootDirectory).root === this.rootDirectory) {
      throw new AssetBlobError("INVALID_ASSET", "read", options.rootDirectory, "Blob rootDirectory cannot be a volume root");
    }
    this.directorySync = options.directorySync ?? "best-effort";
    this.capabilities = {
      backend: "node-filesystem",
      immutableWrites: true,
      verifiedReads: true,
      durability: this.directorySync === "required" ? "file-and-directory-sync" : "file-sync",
      workspaceScope: "app-private"
    } as const;
  }

  async put(digest: BlobDigest, bytes: Uint8Array): Promise<"created" | "existing"> {
    assertBlobDigest(digest, "put");
    if (createBlobDigest(bytes) !== digest) {
      throw new AssetBlobError("DIGEST_MISMATCH", "put", digest, "Input bytes do not match the claimed digest");
    }
    return this.serializeMutation(async () => {
      const existing = await this.read(digest);
      if (existing !== null) return "existing";
      const target = this.resolveBlobPath(digest);
      const parent = dirname(target);
      const temporary = `${target}.world-blob-${randomUUID()}`;
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        await mkdir(parent, { recursive: true });
        handle = await open(temporary, "wx", 0o600);
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporary, target);
        await this.syncDirectory(parent, digest);
        return "created";
      } catch (error) {
        if (handle !== undefined) await handle.close().catch(() => undefined);
        await rm(temporary, { force: true }).catch(() => undefined);
        const systemCode = (error as NodeJS.ErrnoException | null)?.code;
        if (systemCode === "EEXIST" || systemCode === "EPERM") {
          const raced = await this.read(digest).catch(() => null);
          if (raced !== null) return "existing";
        }
        throw normalizeNodeAssetBlobError(error, "put", digest);
      }
    });
  }

  async read(digest: BlobDigest): Promise<Uint8Array | null> {
    assertBlobDigest(digest, "read");
    const target = this.resolveBlobPath(digest);
    try {
      const bytes = new Uint8Array(await readFile(target));
      if (createBlobDigest(bytes) !== digest) {
        throw new AssetBlobError("CORRUPT_BLOB", "read", digest, "Stored blob failed SHA-256 verification");
      }
      return bytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw normalizeNodeAssetBlobError(error, "read", digest);
    }
  }

  async list(): Promise<readonly BlobDigest[]> {
    const base = resolve(this.rootDirectory, "blobs", "sha256");
    try {
      const digests: BlobDigest[] = [];
      const shards = await readdir(base, { withFileTypes: true });
      for (const shard of shards) {
        if (!shard.isDirectory() || !/^[a-f0-9]{2}$/.test(shard.name)) continue;
        const files = await readdir(resolve(base, shard.name), { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile() || !/^[a-f0-9]{62}$/.test(file.name)) continue;
          digests.push(`sha256:${shard.name}${file.name}`);
        }
      }
      return digests.sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw normalizeNodeAssetBlobError(error, "read", "blobs/sha256");
    }
  }

  private resolveBlobPath(digest: BlobDigest): string {
    const logicalPath = assetBlobPath(digest);
    const target = resolve(this.rootDirectory, ...logicalPath.split("/"));
    if (!target.startsWith(`${this.rootDirectory}${sep}`)) {
      throw new AssetBlobError("INVALID_DIGEST", "read", digest, "Blob path escaped the store root");
    }
    return target;
  }

  private async syncDirectory(directory: string, digest: BlobDigest): Promise<void> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(directory, "r");
      await handle.sync();
    } catch (error) {
      if (this.directorySync === "required") throw normalizeNodeAssetBlobError(error, "put", digest);
    } finally {
      if (handle !== undefined) await handle.close().catch(() => undefined);
    }
  }

  private serializeMutation<T>(action: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(action, action);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

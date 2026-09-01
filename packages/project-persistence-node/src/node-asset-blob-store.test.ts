// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assetBlobPath,
  auditAssetBlobStore,
  createBlobDigest
} from "@world-studio/project-persistence";
import { NodeAssetBlobStore, normalizeNodeAssetBlobError } from "./index";

const temporaryRoots: string[] = [];

async function createStore(): Promise<{ root: string; store: NodeAssetBlobStore }> {
  const root = await mkdtemp(join(tmpdir(), "world-studio-blobs-"));
  temporaryRoots.push(root);
  return { root, store: new NodeAssetBlobStore({ rootDirectory: root }) };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("NodeAssetBlobStore", () => {
  it("passes shared conformance on a real filesystem without leaking temp files", async () => {
    const { root, store } = await createStore();
    const report = await auditAssetBlobStore(store);
    expect(report.capabilities).toMatchObject({
      backend: "node-filesystem",
      durability: "file-sync",
      workspaceScope: "app-private"
    });
    expect((await readdir(root, { recursive: true })).some((path) => path.includes(".world-blob-"))).toBe(false);
  });

  it("deduplicates concurrently and remains readable across adapter instances", async () => {
    const { root, store } = await createStore();
    const bytes = new TextEncoder().encode("shared CG bytes");
    const digest = createBlobDigest(bytes);
    const results = await Promise.all([store.put(digest, bytes), store.put(digest, bytes)]);
    expect(results.sort()).toEqual(["created", "existing"]);
    const reopened = new NodeAssetBlobStore({ rootDirectory: root });
    await expect(reopened.read(digest)).resolves.toEqual(bytes);
  });

  it("detects on-disk tampering and never returns corrupt source bytes", async () => {
    const { root, store } = await createStore();
    const good = new TextEncoder().encode("golden pixels");
    const digest = createBlobDigest(good);
    const target = join(root, ...assetBlobPath(digest).split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "tampered");
    await expect(store.read(digest)).rejects.toMatchObject({ code: "CORRUPT_BLOB" });
    await expect(store.put(digest, good)).rejects.toMatchObject({ code: "CORRUPT_BLOB" });
  });

  it("rejects unsafe roots and normalizes storage failures", async () => {
    expect(() => new NodeAssetBlobStore({ rootDirectory: "relative" })).toThrow();
    for (const [systemCode, expected] of [
      ["ENOSPC", "NO_SPACE"],
      ["EDQUOT", "NO_SPACE"],
      ["EACCES", "PERMISSION_DENIED"],
      ["EBUSY", "BUSY"],
      ["ENODEV", "UNAVAILABLE"],
      ["EIO", "IO_FAILURE"]
    ] as const) {
      const error = Object.assign(new Error(systemCode), { code: systemCode });
      expect(normalizeNodeAssetBlobError(error, "put", "sha256:test")).toMatchObject({ code: expected });
    }
  });
});

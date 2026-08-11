// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditProjectFileStore,
  loadProject,
  saveProject,
  type ProjectSnapshot
} from "@world-studio/project-persistence";
import { NodeProjectFileStore, normalizeNodeFileSystemError } from "./index";

const temporaryRoots: string[] = [];

async function createStore(): Promise<{ root: string; store: NodeProjectFileStore }> {
  const root = await mkdtemp(join(tmpdir(), "world-studio-store-"));
  temporaryRoots.push(root);
  return { root, store: new NodeProjectFileStore({ rootDirectory: root }) };
}

function snapshot(revision: number): ProjectSnapshot {
  return {
    schemaVersion: 1,
    projectId: "node_store_test",
    title: "Node Store Test",
    entrySceneId: "scene_a",
    storageRevision: revision,
    scenes: [{
      sceneId: "scene_a",
      sourceRevision: revision,
      semanticRevision: revision,
      committedSource: `committed ${revision}`,
      draftSource: `draft ${revision}`,
      tombstones: []
    }]
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("NodeProjectFileStore", () => {
  it("passes the shared observable conformance suite on a real filesystem", async () => {
    const { store } = await createStore();
    const report = await auditProjectFileStore(store, "node-audit");
    expect(report.capabilities).toMatchObject({
      backend: "node-filesystem",
      durability: "file-sync",
      workspaceScope: "app-private",
      directoryMetadata: "best-effort"
    });
  });

  it("persists a WAL project across adapter instances without leaking write temps", async () => {
    const { root, store } = await createStore();
    await saveProject(store, snapshot(1), { transactionId: "node_tx_1", expectedStorageRevision: 0 });
    const reopened = new NodeProjectFileStore({ rootDirectory: root });
    await expect(loadProject(reopened)).resolves.toEqual(snapshot(1));
    const paths = await readdir(root, { recursive: true });
    expect(paths.some((path) => path.includes(".world-write-"))).toBe(false);
    expect(await readFile(join(root, "project.json"), "utf8")).toContain('"storageRevision":1');
  });

  it("rejects traversal before touching the filesystem", async () => {
    const { store } = await createStore();
    await expect(store.write("../escape.txt", "escape")).rejects.toMatchObject({
      code: "INVALID_PATH",
      operation: "write"
    });
  });

  it("does not overclaim required directory sync on Windows", async () => {
    const root = await mkdtemp(join(tmpdir(), "world-studio-required-sync-"));
    temporaryRoots.push(root);
    const store = new NodeProjectFileStore({ rootDirectory: root, directorySync: "required" });
    if (process.platform === "win32") {
      await expect(store.write("probe.txt", "durable probe")).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
        operation: "sync"
      });
      await expect(store.read("probe.txt")).resolves.toBe("durable probe");
    } else {
      await expect(store.write("probe.txt", "durable probe")).resolves.toBeUndefined();
    }
  });

  it.each([
    ["ENOSPC", "NO_SPACE"],
    ["EDQUOT", "NO_SPACE"],
    ["EACCES", "PERMISSION_DENIED"],
    ["EPERM", "PERMISSION_DENIED"],
    ["EBUSY", "BUSY"],
    ["ENOENT", "NOT_FOUND"],
    ["ENODEV", "UNAVAILABLE"],
    ["EIO", "IO_FAILURE"]
  ] as const)("normalizes %s to %s", (systemCode, expected) => {
    const error = Object.assign(new Error(systemCode), { code: systemCode });
    expect(normalizeNodeFileSystemError(error, "write", "project.json")).toMatchObject({
      code: expected,
      operation: "write",
      path: "project.json"
    });
  });
});

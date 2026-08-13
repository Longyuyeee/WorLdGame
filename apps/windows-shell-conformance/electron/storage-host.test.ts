// @vitest-environment node
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ElectronStorageHost } from "./storage-host";

const roots: string[] = [];

async function temporaryRoot(prefix: string): Promise<string> {
  // GitHub's Windows runner may expose its temporary directory through a
  // junction. Grant roots must be canonical, so canonicalize the ambient temp
  // directory before creating the test root. The reparse-root test below still
  // passes an explicit junction and verifies that production rejects it.
  const canonicalTempDirectory = await realpath(tmpdir());
  const root = await mkdtemp(join(canonicalTempDirectory, prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Electron native project grant", () => {
  it("coordinates two host instances and reserves persistent lock state", async () => {
    const root = await temporaryRoot("world-grant-lock-");
    const firstHost = await ElectronStorageHost.createGranted(root);
    const secondHost = await ElectronStorageHost.createGranted(root);
    const first = await firstHost.acquire("owner-a", 60_000);
    expect(first.status).toBe("acquired");
    if (first.status !== "acquired") throw new Error("expected lease");
    await expect(secondHost.acquire("owner-b", 60_000)).resolves.toMatchObject({ status: "held" });
    await expect(firstHost.read(".world-lock/lease.json")).rejects.toThrow("RESERVED_PATH");
    await expect(firstHost.release(first.lease)).resolves.toBe(true);
    const second = await secondHost.acquire("owner-b", 60_000);
    expect(second.status).toBe("acquired");
    if (second.status !== "acquired") throw new Error("expected second lease");
    expect(second.lease.fencingToken).toBeGreaterThan(first.lease.fencingToken);
    await expect(firstHost.write("stale.txt", "stale", first.lease)).rejects.toThrow("LEASE_LOST");
    await firstHost.cleanup();
    await secondHost.cleanup();
  });

  it("accepts an explicit canonical directory without exposing or owning it", async () => {
    const root = await temporaryRoot("world-grant-electron-");
    await writeFile(join(root, "project.json"), "granted", "utf8");
    const host = await ElectronStorageHost.createGranted(root);
    await expect(host.read("project.json")).resolves.toBe("granted");
    await expect(host.reset()).rejects.toThrow("GRANT_RESET_REJECTED");
    await host.cleanup();
    await expect(writeFile(join(root, "after-cleanup.txt"), "retained", "utf8")).resolves.toBeUndefined();
  });

  it("rejects volume roots, missing roots and non-directory grants", async () => {
    const root = await temporaryRoot("world-grant-invalid-");
    const file = join(root, "file.txt");
    await writeFile(file, "not a directory", "utf8");
    await expect(ElectronStorageHost.createGranted(parse(root).root)).rejects.toThrow("GRANT_VOLUME_ROOT_REJECTED");
    await expect(ElectronStorageHost.createGranted(join(root, "missing"))).rejects.toThrow("GRANT_ROOT_NOT_FOUND");
    await expect(ElectronStorageHost.createGranted(file)).rejects.toThrow("GRANT_ROOT_NOT_DIRECTORY");
  });

  it("rejects a reparse root and a child junction before following it", async () => {
    const root = await temporaryRoot("world-grant-root-");
    const outside = await temporaryRoot("world-grant-outside-");
    await writeFile(join(outside, "secret.txt"), "outside", "utf8");
    const rootAlias = join(await temporaryRoot("world-grant-alias-parent-"), "alias");
    await symlink(root, rootAlias, "junction");
    await expect(ElectronStorageHost.createGranted(rootAlias)).rejects.toThrow("GRANT_ROOT_REPARSE_REJECTED");

    const child = join(root, "linked");
    await symlink(outside, child, "junction");
    const host = await ElectronStorageHost.createGranted(root);
    await expect(host.read("linked/secret.txt")).rejects.toThrow("REPARSE_POINT_REJECTED");
    await host.cleanup();
  });
});

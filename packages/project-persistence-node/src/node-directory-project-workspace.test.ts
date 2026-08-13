import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject, openProject } from "@world-studio/project-domain";
import { NodeDirectoryProjectWorkspace } from "./node-directory-project-workspace";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
describe("NodeDirectoryProjectWorkspace", () => {
  it("creates and reopens a Git-manageable native directory project", async () => {
    const root = await mkdtemp(join(tmpdir(), "world-project-")); roots.push(root); const workspace = new NodeDirectoryProjectWorkspace(root, "windows_test");
    const created = await createProject(workspace, "Windows Story", "018f08d8-71a1-7bc2-a627-2f4a843ee171"); const reopened = await openProject(workspace);
    expect(reopened.projectId).toBe(created.projectId); expect(Object.keys((await workspace.readFiles()).files)).toContain("world.project.json");
  });
  it("rejects stale writes and linked content", async () => {
    const root = await mkdtemp(join(tmpdir(), "world-project-")); roots.push(root); const workspace = new NodeDirectoryProjectWorkspace(root, "windows_test");
    const created = await createProject(workspace, "Windows Story", "018f08d8-71a1-7bc2-a627-2f4a843ee172");
    await expect(workspace.writeFiles(created.baseFiles, "stale")).rejects.toThrow(/External project version changed/);
    const outside = await mkdtemp(join(tmpdir(), "world-outside-")); roots.push(outside); await symlink(outside, join(root, "linked"), "junction");
    await expect(workspace.readFiles()).rejects.toThrow(/Symbolic links are not allowed/);
  });
});

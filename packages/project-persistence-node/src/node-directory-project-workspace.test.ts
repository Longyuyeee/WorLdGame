import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
    const outside = await mkdtemp(join(tmpdir(), "world-outside-")); roots.push(outside); await writeFile(join(outside,"secret.json"),"secret","utf8");await symlink(outside, join(root, "linked"), "junction");
    await expect(workspace.readFiles()).rejects.toThrow(/Symbolic links are not allowed/);
    await expect(workspace.readSelectedFiles(["linked/secret.json"])).rejects.toThrow(/Symbolic links are not allowed/);
    await expect(workspace.listProjectFiles()).rejects.toThrow(/Symbolic links are not allowed/);
    await symlink(outside,join(root,".world-cache"),"junction");
    await expect(workspace.readDerivedFile(".world-cache/compiler-v1.json")).rejects.toThrow(/Symbolic links are not allowed/);
    await expect(workspace.writeDerivedFile(".world-cache/compiler-v1.json","cache")).rejects.toThrow(/Symbolic links are not allowed/);
    await expect(workspace.clearDerivedFiles()).rejects.toThrow(/Symbolic links are not allowed/);
  });
  it("reads an explicit canonical file slice and rejects traversal",async()=>{const root=await mkdtemp(join(tmpdir(),"world-project-"));roots.push(root);const workspace=new NodeDirectoryProjectWorkspace(root,"windows_slice");const created=await createProject(workspace,"Slice","018f08d8-71a1-7bc2-a627-2f4a843ee173");const scriptPath=created.project?.scenes[0]?.scriptPath;if(scriptPath===undefined)throw new Error("missing script path");const selected=await workspace.readSelectedFiles(["world.project.json",scriptPath]);expect(Object.keys(selected.files).sort()).toEqual([scriptPath,"world.project.json"].sort());expect(selected.files[scriptPath]).toContain("statements");await expect(workspace.readSelectedFiles(["../secret.json"])).rejects.toThrow(/Unsafe project path/);});
  it("lists real source file stamps, detects metadata changes, and excludes disposable cache files",async()=>{const root=await mkdtemp(join(tmpdir(),"world-project-"));roots.push(root);const workspace=new NodeDirectoryProjectWorkspace(root,"windows_inventory");const created=await createProject(workspace,"Inventory","018f08d8-71a1-7bc2-a627-2f4a843ee174");await mkdir(join(root,".world-cache"));await writeFile(join(root,".world-cache","route.json"),"stale","utf8");const listed=await workspace.listProjectFiles();expect(listed.files.some((item)=>item.path==="world.project.json"&&item.size>0&&item.modifiedAtMs>0)).toBe(true);expect(listed.files.some((item)=>item.path.startsWith(".world-cache/"))).toBe(false);expect(listed.files.map((item)=>item.path)).toEqual(Object.keys(created.baseFiles).sort());await writeFile(join(root,"world.project.json"),`${created.baseFiles["world.project.json"]}\n`,"utf8");const changed=await workspace.listProjectFiles();expect(changed.version).not.toBe(listed.version);});
  it("persists disposable cache separately and clears it before a canonical save",async()=>{const root=await mkdtemp(join(tmpdir(),"world-project-"));roots.push(root);const workspace=new NodeDirectoryProjectWorkspace(root,"windows_cache");const created=await createProject(workspace,"Cache","018f08d8-71a1-7bc2-a627-2f4a843ee175");await workspace.writeDerivedFile(".world-cache/compiler-v1.json","cached");await expect(workspace.readDerivedFile(".world-cache/compiler-v1.json")).resolves.toBe("cached");expect((await workspace.readFiles()).files[".world-cache/compiler-v1.json"]).toBeUndefined();await workspace.writeFiles(created.baseFiles,created.hostVersion);await expect(workspace.readDerivedFile(".world-cache/compiler-v1.json")).resolves.toBeNull();await expect(workspace.readDerivedFile(".world-cache/../../secret.json")).rejects.toThrow(/Unsafe derived project path/);});
});

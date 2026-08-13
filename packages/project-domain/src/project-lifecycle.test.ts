import { describe, expect, it } from "vitest";
import { createProject, detectExternalChange, exportLifecycleProject, importLifecycleProject, markProjectDirty, openProject, rememberRecent, saveLifecycleProject, saveProject, semanticHash, type ProjectFiles, type ProjectReference, type ProjectWorkspace, type RecentProject, type RecentProjectStore } from "./index";

class MemoryWorkspace implements ProjectWorkspace {
  readonly reference:ProjectReference={referenceId:"workspace_test",hostKind:"memory-test",displayLocation:"Memory/Test",permissionKey:"permission_test"};
  files:ProjectFiles={};version=0;
  async readFiles(){return {files:this.files,version:String(this.version)};}
  async writeFiles(files:ProjectFiles,expectedVersion:string|null){if(expectedVersion!==null&&expectedVersion!==String(this.version))throw new Error("host version conflict");this.files=structuredClone(files);this.version+=1;return {version:String(this.version)};}
  clear(){this.files={};this.version+=1;}
}
class MemoryRecent implements RecentProjectStore { items:readonly RecentProject[]=[];async load(){return this.items;}async save(items:readonly RecentProject[]){this.items=structuredClone(items);} }

describe("Project lifecycle",()=>{
  it("creates, saves, closes, and reopens a project without a fixed project ID",async()=>{
    const workspace=new MemoryWorkspace();const created=await createProject(workspace,"My Story","018f08d8-71a1-7bc2-a627-2f4a843ee120");expect(created.projectId).toMatch(/^project_/);expect(created.projectId).not.toBe("prj_twilight_broadcast");const opened=await openProject(workspace);expect(opened.projectId).toBe(created.projectId);expect(opened.dirty).toBe(false);
    const edited={...opened.project!,manifest:{...opened.project!.manifest,title:"My Renamed Story"}};const saved=await saveLifecycleProject(workspace,markProjectDirty(opened,edited));expect(saved.title).toBe("My Renamed Story");expect((await openProject(workspace)).title).toBe("My Renamed Story");
  });
  it("exports, clears local state, imports offline, and reopens with the same semantic hash",async()=>{
    const first=new MemoryWorkspace();const created=await createProject(first,"Offline Story","018f08d8-71a1-7bc2-a627-2f4a843ee121");const archive=exportLifecycleProject(created);first.clear();const imported=importLifecycleProject(archive);const second=new MemoryWorkspace();await second.writeFiles(saveProject(imported),null);const reopened=await openProject(second);expect(semanticHash(reopened.project!)).toBe(semanticHash(created.project!));
  });
  it("stores only recent references and display metadata, not project files",async()=>{
    const workspace=new MemoryWorkspace(),recent=new MemoryRecent();const session=await createProject(workspace,"Recent Story","018f08d8-71a1-7bc2-a627-2f4a843ee122");await rememberRecent(recent,session,1234);expect(recent.items).toEqual([{reference:workspace.reference,projectId:session.projectId,title:"Recent Story",lastOpenedAtMs:1234}]);expect(JSON.stringify(recent.items)).not.toContain("chapterPaths");
  });
  it("reloads a clean external change and reports a three-way conflict for dirty local state",async()=>{
    const workspace=new MemoryWorkspace();const base=await createProject(workspace,"Base","018f08d8-71a1-7bc2-a627-2f4a843ee123");const external={...base.project!,manifest:{...base.project!.manifest,title:"External"}};await workspace.writeFiles(saveProject(external),base.hostVersion);const reloaded=await detectExternalChange(workspace,base);expect(reloaded).toMatchObject({status:"reloaded",changedPaths:["world.project.json"]});
    const clean=await openProject(workspace);const local=markProjectDirty(clean,{...clean.project!,manifest:{...clean.project!.manifest,title:"Local"}});const other={...clean.project!,manifest:{...clean.project!.manifest,title:"Other"}};await workspace.writeFiles(saveProject(other),clean.hostVersion);const conflict=await detectExternalChange(workspace,local);expect(conflict).toMatchObject({status:"conflict",changedPaths:["world.project.json"],baseHash:clean.baseHash,localHash:semanticHash(local.project!),externalHash:semanticHash(other)});
  });
  it("opens a future project with an explicit read-only reason and never writes it",async()=>{
    const workspace=new MemoryWorkspace();workspace.files={"world.project.json":JSON.stringify({schemaVersion:99,projectId:"project_future",title:"Future"})};workspace.version=7;const session=await openProject(workspace);expect(session).toMatchObject({access:"read-only",schemaVersion:99,project:null});await expect(saveLifecycleProject(workspace,session)).rejects.toMatchObject({code:"FUTURE_READ_ONLY"});expect(workspace.version).toBe(7);
  });
  it("rejects stale host versions instead of overwriting external files",async()=>{
    const workspace=new MemoryWorkspace();const session=await createProject(workspace,"Conflict","018f08d8-71a1-7bc2-a627-2f4a843ee124");workspace.version+=1;await expect(saveLifecycleProject(workspace,session)).rejects.toMatchObject({code:"WRITE_CONFLICT"});
  });
});

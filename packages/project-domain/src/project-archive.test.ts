import { describe,expect,it } from "vitest";
import { exportProjectZip,importProjectZip,loadProject,migrateS0Project,type S0Project } from "./index";
const project:S0Project={schemaVersion:0,id:"project_zip",title:"ZIP",entrySceneId:"scene_zip",characters:[],scenes:[{id:"scene_zip",title:"ZIP",statements:[]}]};
describe("Project ZIP",()=>{
  it("round-trips every canonical source file deterministically",()=>{const files=migrateS0Project(project).files;const first=exportProjectZip(files),second=exportProjectZip(files);expect(first).toEqual(second);const restored=importProjectZip(first);expect(restored).toEqual(files);expect(loadProject(restored).manifest.projectId).toBe("project_zip");});
  it("rejects Zip Slip paths before extracting any content",()=>{const archive=exportProjectZip({"safe.json":"{}"});const bytes=new TextEncoder().encode("/bad.json");const safe=new TextEncoder().encode("safe.json");for(let i=0;i<=archive.length-safe.length;i+=1){if(safe.every((value,index)=>archive[i+index]===value))archive.set(bytes,i);}expect(()=>importProjectZip(archive)).toThrow(/Unsafe archive path/);});
  it("rejects corruption and import budget violations",()=>{const archive=exportProjectZip({"large.json":"123456789"});const corrupted=archive.slice();corrupted[40]=(corrupted[40]??0)^0xff;expect(()=>importProjectZip(corrupted)).toThrow();expect(()=>importProjectZip(archive,{maxEntries:2,maxEntryBytes:4,maxTotalBytes:4})).toThrow(/budget/);});
});

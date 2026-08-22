import { lstat, readdir, stat } from "node:fs/promises";
import { isAbsolute, parse, resolve } from "node:path";
import { assertSelectedProjectPaths, type ProjectFiles, type ProjectFileStamp, type ProjectReference, type ProjectWorkspace } from "@world-studio/project-domain";
import { NodeProjectFileStore } from "./node-project-file-store";

const SAFE_SEGMENT = /^[a-z0-9._-]+$/;
function contentVersion(files: ProjectFiles): string { let hash = 2166136261; for (const [path, value] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) for (const code of `${path}\0${value}\0`) hash = Math.imul(hash ^ code.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }

/** Native directory adapter used by the Windows shell after its directory picker returns an absolute path. */
export class NodeDirectoryProjectWorkspace implements ProjectWorkspace {
  readonly reference: ProjectReference;
  private readonly root: string;
  private readonly files: NodeProjectFileStore;
  constructor(rootDirectory: string, referenceId: string) {
    if (!isAbsolute(rootDirectory) || parse(resolve(rootDirectory)).root === resolve(rootDirectory)) throw new Error("Project workspace must be an absolute non-volume-root directory");
    this.root = resolve(rootDirectory); this.files = new NodeProjectFileStore({ rootDirectory: this.root });
    this.reference = { referenceId, hostKind: "windows-directory", displayLocation: this.root, permissionKey: `windows-directory:${referenceId}` };
  }
  async readFiles(): Promise<{ readonly files: ProjectFiles; readonly version: string }> { const files = await this.scan(); return { files, version: contentVersion(files) }; }
  async readSelectedFiles(paths:readonly string[]){const files:Record<string,string>={};for(const path of assertSelectedProjectPaths(paths)){let current=this.root;for(const segment of path.split("/")){current=resolve(current,segment);const metadata=await lstat(current).catch(()=>null);if(metadata===null)throw new Error(`Missing project file: ${path}`);if(metadata.isSymbolicLink())throw new Error(`Symbolic links are not allowed in project workspaces: ${segment}`);}const content=await this.files.read(path);if(content===null)throw new Error(`Missing project file: ${path}`);files[path]=content;}return {files,version:contentVersion(files)};}
  async listProjectFiles(){const files=await this.inventory();return {files,version:contentVersion(Object.fromEntries(files.map((item)=>[item.path,`${item.size}:${item.modifiedAtMs}`])))};}
  async writeFiles(files: ProjectFiles, expectedVersion: string | null): Promise<{ readonly version: string }> {
    const current = await this.readFiles();
    if (expectedVersion !== null && current.version !== expectedVersion) throw new Error(`External project version changed from ${expectedVersion} to ${current.version}`);
    for (const path of Object.keys(current.files).filter((path) => files[path] === undefined)) await this.files.remove(path);
    for (const [path, value] of Object.entries(files)) await this.files.write(path, value);
    const written = await this.readFiles(); return { version: written.version };
  }
  private async scan(directory = this.root, prefix = ""): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in project workspaces: ${entry.name}`);
      if (!SAFE_SEGMENT.test(entry.name) || entry.name === ".world-cache" || entry.name === ".world-host") continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) Object.assign(files, await this.scan(resolve(directory, entry.name), path));
      else if (entry.isFile() && entry.name.endsWith(".json")) files[path] = await this.files.read(path) ?? "";
    }
    return files;
  }
  private async inventory(directory=this.root,prefix=""):Promise<ProjectFileStamp[]>{const files:ProjectFileStamp[]=[];for(const entry of await readdir(directory,{withFileTypes:true})){if(entry.isSymbolicLink())throw new Error(`Symbolic links are not allowed in project workspaces: ${entry.name}`);if(!SAFE_SEGMENT.test(entry.name)||entry.name===".world-cache"||entry.name===".world-host")continue;const relative=prefix?`${prefix}/${entry.name}`:entry.name,absolute=resolve(directory,entry.name);if(entry.isDirectory())files.push(...await this.inventory(absolute,relative));else if(entry.isFile()&&entry.name.endsWith(".json")){const metadata=await stat(absolute);files.push({path:relative,size:metadata.size,modifiedAtMs:Math.trunc(metadata.mtimeMs)});}}return files.sort((left,right)=>left.path.localeCompare(right.path));}
}

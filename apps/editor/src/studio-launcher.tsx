import { useEffect, useMemo, useRef, useState } from "react";
import { createProject, markProjectDirty, rememberRecent, saveProject, type ProjectLifecycleSession, type ProjectWorkspace, type RecentProject } from "@world-studio/project-domain";
import { campusStoryProject } from "@world-studio/story-core";
import { App } from "./App";
import { BrowserRecentProjectStore, loadDirectoryHandle, saveDirectoryHandle } from "./browser-project-registry";
import { BrowserDirectoryProjectWorkspace, createOpfsProjectWorkspace, pickBrowserDirectoryWorkspace, type BrowserProjectPicker } from "./browser-project-workspace";
import { ProjectHome, type ProjectHomeActions } from "./project-home";
import { ProjectEntityManager } from "./project-entity-manager";
import { projectCanonicalFromStory, projectCanonicalWithStory } from "./canonical-project-adapter";
import { IndexedDbAssetRepository } from "./indexeddb-asset-repository";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";
import { IndexedDbProjectWorkspace } from "./indexeddb-project-workspace";
import { exportPortableProjectBundle, importPortableProjectBundle } from "./portable-project-bundle";
import { loadN23BenchmarkProject } from "./n23-benchmark-project";
import { compileLifecycleProject, openCompiledLifecycleProject, saveCompiledLifecycleProject, type CompiledLifecycleProject, type EditorProjectCompilerState } from "./editor-project-compilation";
import { readTrustedRouteOverview } from "./trusted-route-overview";
import { readTrustedLazyEditIndex } from "./trusted-lazy-edit-index";
import { beginLazyScenePageLoad, createLazyScenePage, loadLazyScenePage, saveLazyScenePage } from "./lazy-scene-session";

function entropy(): string { return crypto.randomUUID(); }
function browserApi(): BrowserProjectPicker {
  const picker = (globalThis as typeof globalThis & { showDirectoryPicker?: BrowserProjectPicker["showDirectoryPicker"] }).showDirectoryPicker;
  return picker === undefined ? { navigator: navigator as unknown as NonNullable<BrowserProjectPicker["navigator"]> } : { showDirectoryPicker: picker, navigator: navigator as unknown as NonNullable<BrowserProjectPicker["navigator"]> };
}

export function StudioLauncher() {
  const recentStore = useMemo(() => new BrowserRecentProjectStore(), []);
  const [recent, setRecent] = useState<readonly RecentProject[]>([]);
  const workspaces=useRef(new Map<string,ProjectWorkspace>());
  const compilers=useRef(new Map<string,EditorProjectCompilerState|null>());
  const [editing, setEditing] = useState<{session:ProjectLifecycleSession;workspace:ProjectWorkspace;compiler:EditorProjectCompilerState|null;view:"structure"|"content"}|null>(null);
  useEffect(() => { void recentStore.load().then(setRecent); }, [recentStore]);
  const finish = async (workspace:ProjectWorkspace,opened:CompiledLifecycleProject) => {const {session,compiler}=opened;workspaces.current.set(session.reference.referenceId,workspace);compilers.current.set(session.reference.referenceId,compiler);await rememberRecent(recentStore, session, Date.now()); setRecent(await recentStore.load()); return session; };
  const managedWorkspace = () => new IndexedDbProjectWorkspace(globalThis.indexedDB, `project-${entropy()}`, "受管工程");
  const recentWorkspace = async (item: RecentProject): Promise<ProjectWorkspace> => {
    if (item.reference.hostKind === "web-indexeddb" && item.reference.referenceId.startsWith("idb_")) return new IndexedDbProjectWorkspace(globalThis.indexedDB, item.reference.referenceId.slice(4), item.title);
    if (item.reference.hostKind === "web-opfs" && item.reference.referenceId.startsWith("opfs_")) return createOpfsProjectWorkspace(browserApi(), item.reference.referenceId.slice(5));
    const handle = await loadDirectoryHandle(item.reference.referenceId);
    if (handle === null) throw new Error("目录授权已失效，请重新选择工程目录");
    return new BrowserDirectoryProjectWorkspace(handle, item.reference.referenceId);
  };
  const actions: ProjectHomeActions = {
    create: async (title) => {const workspace=managedWorkspace();const session=await createProject(workspace,title,entropy());return finish(workspace,await compileLifecycleProject(workspace,session));},
    openDirectory: async () => { const id = `directory-${entropy()}`; const workspace = await pickBrowserDirectoryWorkspace(browserApi(), id); await saveDirectoryHandle(id, workspace.directoryHandle); return finish(workspace,await openCompiledLifecycleProject(workspace)); },
    openRecent: async (item) => {const workspace=await recentWorkspace(item);return finish(workspace,await openCompiledLifecycleProject(workspace));},
    openRouteOverview: async (item,offset) => readTrustedRouteOverview(await recentWorkspace(item), offset===undefined?{}:{offset}),
    openLazyScene: async (item, overview, sceneId) => {
      const scene = overview.scenePages.find((candidate) => candidate.id === sceneId);
      if (scene === undefined) throw new Error("当前 Route 窗口中没有这个场景");
      const workspace = await recentWorkspace(item);
      const editIndex = await readTrustedLazyEditIndex(workspace, overview.sourceVersion);
      return loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, overview.sourceVersion, editIndex)));
    },
    saveLazyScene: async (item, page) => saveLazyScenePage(await recentWorkspace(item), page),
    openExample: async () => {
      const workspace = managedWorkspace(); const project = projectCanonicalFromStory(campusStoryProject, entropy());
      await workspace.writeFiles(saveProject(project), null); return finish(workspace,await openCompiledLifecycleProject(workspace));
    },
    openN23Benchmark: async () => {
      const workspace = managedWorkspace(); const project = projectCanonicalFromStory(loadN23BenchmarkProject(), entropy());
      await workspace.writeFiles(saveProject(project), null); return finish(workspace, await openCompiledLifecycleProject(workspace));
    },
    importArchive: async (file) => {
      const imported = importPortableProjectBundle(new Uint8Array(await file.arrayBuffer())); const workspace = managedWorkspace();
      await workspace.writeFiles(saveProject(imported.project), null);
      if (!imported.legacyTextOnly) {
        const now = Date.now(); const ownerId = `portable-import-${entropy()}`;
        const files = new IndexedDbProjectFileStore(globalThis.indexedDB, imported.project.manifest.projectId);
        const acquisition = await files.acquire(ownerId, now, 30_000);
        if (acquisition.status !== "acquired") throw new Error("同一项目的资源库正在被其他编辑器写入，请关闭该项目后重试导入");
        const assets = new IndexedDbAssetRepository(globalThis.indexedDB, imported.project.manifest.projectId);
        files.activateWriterLease(acquisition.lease); assets.activateWriterLease(acquisition.lease);
        try { await assets.replaceFromPortableBundle(imported.index, imported.blobs); }
        finally { assets.activateWriterLease(null); files.activateWriterLease(null); await files.release(acquisition.lease).catch(() => false); }
      }
      return finish(workspace,await openCompiledLifecycleProject(workspace));
    },
    exportArchive: async (session) => {
      const assets = new IndexedDbAssetRepository(globalThis.indexedDB, session.projectId);
      const archive = await exportPortableProjectBundle(session, assets); const url = URL.createObjectURL(new Blob([archive as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
      return { href: url, filename: `${session.title.replace(/[^a-z0-9_-]+/gi, "-") || "world-project"}.zip`, byteLength: archive.byteLength, dispose: () => URL.revokeObjectURL(url) };
    }
  };
  if(editing?.session.project){if(editing.view==="structure")return <><button className="project-home-return" onClick={()=>setEditing(null)}>返回项目首页</button><ProjectEntityManager session={editing.session} workspace={editing.workspace} onSession={async(session)=>{const compiled=await compileLifecycleProject(editing.workspace,session);compilers.current.set(session.reference.referenceId,compiled.compiler);setEditing((current)=>current===null?current:{...current,session:compiled.session,compiler:compiled.compiler});}} onOpenEditor={(project)=>setEditing({...editing,session:{...editing.session,project},view:"content"})}/></>;return <><button className="project-home-return" onClick={()=>setEditing({...editing,view:"structure"})}>返回项目结构</button><App initialProject={editing.session.project} {...(editing.compiler===null?{}:{routeCompiler:editing.compiler})} onCanonicalProjectChange={(project)=>setEditing((current)=>current===null?current:{...current,session:markProjectDirty(current.session,project)})} onProjectChange={(story)=>setEditing((current)=>{if(current===null||current.session.project===null)return current;return {...current,session:markProjectDirty(current.session,projectCanonicalWithStory(current.session.project,story))};})} onProjectSave={async(story)=>{const current=editing;if(current.session.project===null)return;const dirty=markProjectDirty(current.session,projectCanonicalWithStory(current.session.project,story));const compiled=await saveCompiledLifecycleProject(current.workspace,dirty);compilers.current.set(compiled.session.reference.referenceId,compiled.compiler);setEditing((latest)=>latest===null?latest:{...latest,session:compiled.session,compiler:compiled.compiler});}}/></>;}
  return <ProjectHome recent={recent} actions={actions} onEnter={(session)=>{const workspace=workspaces.current.get(session.reference.referenceId),compiler=compilers.current.get(session.reference.referenceId);if(workspace===undefined||compiler===undefined)throw new Error("Project workspace is unavailable");setEditing({session,workspace,compiler,view:"structure"});}} />;
}

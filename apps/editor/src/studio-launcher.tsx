import { useEffect, useMemo, useState } from "react";
import { createProject, createProjectTemplate, exportLifecycleProject, importLifecycleProject, openProject, rememberRecent, saveProject, type ProjectLifecycleSession, type RecentProject } from "@world-studio/project-domain";
import { App } from "./App";
import { BrowserRecentProjectStore, loadDirectoryHandle, saveDirectoryHandle } from "./browser-project-registry";
import { BrowserDirectoryProjectWorkspace, createOpfsProjectWorkspace, pickBrowserDirectoryWorkspace, type BrowserProjectPicker } from "./browser-project-workspace";
import { ProjectHome, type ProjectHomeActions } from "./project-home";

function entropy(): string { return crypto.randomUUID(); }
function browserApi(): BrowserProjectPicker {
  const picker = (globalThis as typeof globalThis & { showDirectoryPicker?: BrowserProjectPicker["showDirectoryPicker"] }).showDirectoryPicker;
  return picker === undefined ? { navigator: navigator as unknown as NonNullable<BrowserProjectPicker["navigator"]> } : { showDirectoryPicker: picker, navigator: navigator as unknown as NonNullable<BrowserProjectPicker["navigator"]> };
}

export function StudioLauncher() {
  const recentStore = useMemo(() => new BrowserRecentProjectStore(), []);
  const [recent, setRecent] = useState<readonly RecentProject[]>([]);
  const [editing, setEditing] = useState<ProjectLifecycleSession | null>(null);
  useEffect(() => { void recentStore.load().then(setRecent); }, [recentStore]);
  const finish = async (session: ProjectLifecycleSession) => { await rememberRecent(recentStore, session, Date.now()); setRecent(await recentStore.load()); return session; };
  const opfsWorkspace = async () => createOpfsProjectWorkspace(browserApi(), `project-${entropy()}`);
  const actions: ProjectHomeActions = {
    create: async (title) => finish(await createProject(await opfsWorkspace(), title, entropy())),
    openDirectory: async () => { const id = `directory-${entropy()}`; const workspace = await pickBrowserDirectoryWorkspace(browserApi(), id); await saveDirectoryHandle(id, workspace.directoryHandle); return finish(await openProject(workspace)); },
    openRecent: async (item) => {
      let workspace: BrowserDirectoryProjectWorkspace;
      if (item.reference.hostKind === "web-opfs" && item.reference.referenceId.startsWith("opfs_")) workspace = await createOpfsProjectWorkspace(browserApi(), item.reference.referenceId.slice(5));
      else { const handle = await loadDirectoryHandle(item.reference.referenceId); if (handle === null) throw new Error("目录授权已失效，请重新选择工程目录"); workspace = new BrowserDirectoryProjectWorkspace(handle, item.reference.referenceId); }
      return finish(await openProject(workspace));
    },
    openExample: async () => {
      const workspace = await opfsWorkspace(); const project = createProjectTemplate("广播站示例工程", entropy());
      await workspace.writeFiles(saveProject(project), null); return finish(await openProject(workspace));
    },
    importArchive: async (file) => {
      const project = importLifecycleProject(new Uint8Array(await file.arrayBuffer())); const workspace = await opfsWorkspace();
      await workspace.writeFiles(saveProject(project), null); return finish(await openProject(workspace));
    },
    exportArchive: async (session) => {
      const archive = exportLifecycleProject(session); const url = URL.createObjectURL(new Blob([archive as Uint8Array<ArrayBuffer>], { type: "application/zip" })); const link = document.createElement("a"); link.href = url; link.download = `${session.title.replace(/[^a-z0-9_-]+/gi, "-") || "world-project"}.zip`; link.click(); URL.revokeObjectURL(url);
    }
  };
  if (editing?.project) return <><button className="project-home-return" onClick={() => setEditing(null)}>返回项目首页</button><App initialProject={editing.project} /></>;
  return <ProjectHome recent={recent} actions={actions} onEnter={setEditing} />;
}

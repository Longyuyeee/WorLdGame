import { compileProjectWorkspace, type CompileProjectResult, type WorkspaceCompilerCacheStatus } from "@world-studio/project-compiler";
import { openProject, probeProject, PROJECT_MANIFEST_PATH, saveLifecycleProject, semanticHash, type ProjectLifecycleSession, type ProjectWorkspace } from "@world-studio/project-domain";

export interface EditorProjectCompilerState {
  readonly cacheStatus: WorkspaceCompilerCacheStatus;
  readonly projectHash: string;
  readonly compilation: CompileProjectResult;
}

export interface CompiledLifecycleProject {
  readonly session: ProjectLifecycleSession;
  readonly compiler: EditorProjectCompilerState | null;
}

function assertAligned(session: ProjectLifecycleSession, hostVersion: string, projectHash: string): void {
  if (session.project === null || session.hostVersion !== hostVersion || semanticHash(session.project) !== projectHash) {
    throw new Error("Project changed while synchronizing the Editor Compiler lifecycle");
  }
}

export async function compileLifecycleProject(workspace: ProjectWorkspace, session: ProjectLifecycleSession): Promise<CompiledLifecycleProject> {
  if (session.project === null) return { session, compiler: null };
  const result = await compileProjectWorkspace(workspace, "debug");
  const projectHash = semanticHash(result.project);
  assertAligned(session, result.hostVersion, projectHash);
  return { session, compiler: { cacheStatus: result.cacheStatus, projectHash, compilation: result.compilation } };
}

export async function openCompiledLifecycleProject(workspace: ProjectWorkspace): Promise<CompiledLifecycleProject> {
  if (workspace.readSelectedFiles === undefined) {
    const session = await openProject(workspace);
    return compileLifecycleProject(workspace, session);
  }
  const manifest = await workspace.readSelectedFiles([PROJECT_MANIFEST_PATH]);
  const probe = probeProject(manifest.files);
  if (probe.status === "future-read-only") {
    return {
      session: {
        project: null,
        projectId: probe.projectId ?? "unknown_project",
        title: probe.title ?? "Future Project",
        schemaVersion: probe.schemaVersion,
        reference: workspace.reference,
        hostVersion: manifest.version,
        baseHash: "",
        baseFiles: manifest.files,
        dirty: false,
        recovery: "clean",
        access: "read-only",
        readOnlyReason: `Project schema ${probe.schemaVersion} requires a newer editor`
      },
      compiler: null
    };
  }
  const result = await compileProjectWorkspace(workspace, "debug");
  const projectHash = semanticHash(result.project);
  return {
    session: {
      project: result.project,
      projectId: result.project.manifest.projectId,
      title: result.project.manifest.title,
      schemaVersion: 1,
      reference: workspace.reference,
      hostVersion: result.hostVersion,
      baseHash: projectHash,
      baseFiles: result.files,
      dirty: false,
      recovery: "clean",
      access: "editable"
    },
    compiler: { cacheStatus: result.cacheStatus, projectHash, compilation: result.compilation }
  };
}

export async function saveCompiledLifecycleProject(workspace: ProjectWorkspace, session: ProjectLifecycleSession): Promise<CompiledLifecycleProject> {
  return compileLifecycleProject(workspace, await saveLifecycleProject(workspace, session));
}

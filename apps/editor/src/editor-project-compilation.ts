import { compileProjectWorkspace, type CompileProjectResult, type WorkspaceCompilerCacheStatus } from "@world-studio/project-compiler";
import { openProject, saveLifecycleProject, semanticHash, type ProjectLifecycleSession, type ProjectWorkspace } from "@world-studio/project-domain";

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
  const session = await openProject(workspace);
  return compileLifecycleProject(workspace, session);
}

export async function saveCompiledLifecycleProject(workspace: ProjectWorkspace, session: ProjectLifecycleSession): Promise<CompiledLifecycleProject> {
  return compileLifecycleProject(workspace, await saveLifecycleProject(workspace, session));
}

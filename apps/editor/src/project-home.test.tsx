import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createScriptSourceSession } from "@world-studio/story-language";
import { createProjectTemplate, saveProject, type ProjectLifecycleSession, type ProjectReference } from "@world-studio/project-domain";
import { describe, expect, it, vi } from "vitest";
import { ProjectHome, type ProjectArchiveDownload, type ProjectHomeActions } from "./project-home";
import { canonicalSceneSource } from "./canonical-project-adapter";
import type { LazyScenePage } from "./lazy-scene-session";
import type { TrustedRouteOverview } from "./trusted-route-overview";

const reference: ProjectReference = { referenceId: "ref", hostKind: "web-opfs", displayLocation: "OPFS/My Story", permissionKey: "permission" };
const project = createProjectTemplate("My Story", "018f08d8-71a1-7bc2-a627-2f4a843ee130");
const session: ProjectLifecycleSession = { project, projectId: project.manifest.projectId, title: "My Story", schemaVersion: 1, reference, hostVersion: "1", baseHash: "hash", baseFiles: saveProject(project), dirty: false, recovery: "clean", access: "editable" };
const archiveDownload: ProjectArchiveDownload = { href: "blob:project", filename: "my-story.zip", byteLength: 2048, dispose: vi.fn() };
const actions = (): ProjectHomeActions => ({ create: vi.fn(async () => session), openDirectory: vi.fn(async () => session), openRecent: vi.fn(async () => session), openExample: vi.fn(async () => session), openN23Benchmark: vi.fn(async () => session), openN42MediaStage: vi.fn(async () => session), importArchive: vi.fn(async () => session), exportArchive: vi.fn(async () => archiveDownload) });

async function openPartialEditor() {
  const scene = project.scenes[0]!;
  const source = canonicalSceneSource(scene, project.scripts[scene.id]!);
  const page: LazyScenePage = { schemaVersion: 1, scene, sourceVersion: "a".repeat(64), status: "ready", sourceSession: createScriptSourceSession(source), savedSource: source };
  const overview: TrustedRouteOverview = { schemaVersion: 1, projectId: project.manifest.projectId, title: project.manifest.title, sourceVersion: page.sourceVersion, totalScenes: 129, scenePages: [scene], sourceRead: { fileCount: 3, layoutFileCount: 1, utf8Bytes: 1024, fullRead: false }, window: { schemaVersion: 1, query: "", start: 64, end: 65, totalMatches: 129, nodes: [{ id: scene.id, title: scene.title, chapterId: project.chapters[0]!.id, kind: "entry", facts: [], layout: { x: 0, y: 0, source: "automatic" } }], edges: [], totalLocalEdges: 0, edgesTruncated: false, hasPrevious: true, hasNext: true } };
  const api = { ...actions(), openRouteOverview: vi.fn(async () => overview), openLazyScene: vi.fn(async () => page), saveLazyScene: vi.fn(async (_item, changed) => ({ ...changed, status: "ready" as const })) } satisfies ProjectHomeActions;
  const item = { reference: { ...reference, hostKind: "web-indexeddb" as const }, projectId: session.projectId, title: session.title, lastOpenedAtMs: 1 };
  render(<ProjectHome recent={[item]} actions={api} onEnter={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(`${session.title}的更多选项`));
  fireEvent.click(screen.getByRole("button", { name: `快速查看 ${session.title} Route` }));
  const dialog = await screen.findByRole("dialog", { name: "大项目分场景编辑" });
  fireEvent.click(within(dialog).getByRole("button", { name: `编辑场景 ${scene.title}` }));
  await within(dialog).findByRole("textbox", { name: "单场景权威脚本编辑器" });
  return { api, dialog, source, scene };
}

describe("Project Home", () => {
  it("distinguishes same-title workspaces and opens the selected reference without renaming the project", async () => {
    const api = actions();
    const older = { reference, projectId: session.projectId, title: "同名作品", lastOpenedAtMs: 1 };
    const newer = { ...older, reference: { ...reference, referenceId: "imported-copy" }, lastOpenedAtMs: 1000 };
    render(<ProjectHome recent={[older, newer]} actions={api} onEnter={vi.fn()} />);
    expect(screen.getByRole("button", { name: "打开项目：同名作品（最近打开）" })).toHaveTextContent("同名项目 · 最近打开");
    fireEvent.click(screen.getByRole("button", { name: "打开项目：同名作品（同名项目 2）" }));
    await waitFor(() => expect(api.openRecent).toHaveBeenCalledExactlyOnceWith(older));
    expect(older.title).toBe("同名作品");
    expect(newer.title).toBe("同名作品");
  });
  it("opens a recent project immediately without a second entry screen", async () => {
    const api = actions(); const enter = vi.fn();
    render(<ProjectHome recent={[{ reference, projectId: project.manifest.projectId, title: "Recent", lastOpenedAtMs: 1 }]} actions={api} onEnter={enter} />);
    fireEvent.click(screen.getByRole("button", { name: "打开项目：Recent" }));
    await waitFor(() => expect(enter).toHaveBeenCalledExactlyOnceWith(session));
    expect(screen.queryByRole("region", { name: "工程状态" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "进入编辑器" })).not.toBeInTheDocument();
  });
  it("asks only for a name in a dialog and enters the created project", async () => {
    const api = actions(); const enter = vi.fn();
    render(<ProjectHome recent={[]} actions={api} onEnter={enter} />);
    expect(screen.queryByRole("textbox", { name: "项目名称" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    expect(screen.getByRole("dialog", { name: "开启一个新故事" })).toBeVisible();
    expect(screen.getByRole("button", { name: "创建并开始写作" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "  Original Project  " } });
    fireEvent.click(screen.getByRole("button", { name: "创建并开始写作" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("Original Project"));
    await waitFor(() => expect(enter).toHaveBeenCalledExactlyOnceWith(session));
  });
  it("cancels creation without creating a project", () => {
    const api = actions();
    render(<ProjectHome recent={[]} actions={api} onEnter={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "开启一个新故事" })).not.toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });
  it("filters the project library by title", () => {
    const api = actions();
    render(<ProjectHome recent={[{ reference, projectId: "one", title: "海边", lastOpenedAtMs: 1 }, { reference: { ...reference, referenceId: "two" }, projectId: "two", title: "车站", lastOpenedAtMs: 2 }]} actions={api} onEnter={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("搜索项目"), { target: { value: "车" } });
    expect(screen.getByRole("button", { name: "打开项目：车站" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "打开项目：海边" })).not.toBeInTheDocument();
  });
  it("opens examples and both developer fixtures directly", async () => {
    const api = actions(); const enter = vi.fn();
    render(<ProjectHome recent={[]} actions={api} onEnter={enter} />);
    fireEvent.click(screen.getByRole("button", { name: "打开示例工程" }));
    await waitFor(() => expect(enter).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("开发与验收工程"));
    fireEvent.click(screen.getByRole("button", { name: "打开五分钟验收工程" }));
    await waitFor(() => expect(api.openN23Benchmark).toHaveBeenCalledOnce());
    await waitFor(() => expect(enter).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "打开 Stage 媒体验收工程" }));
    await waitFor(() => expect(api.openN42MediaStage).toHaveBeenCalledOnce());
    await waitFor(() => expect(enter).toHaveBeenCalledTimes(3));
  });
  it("keeps inaccessible projects out of the editor and offers an export", async () => {
    const api = actions(); const enter = vi.fn();
    const blocked = { ...session, access: "read-only" as const, readOnlyReason: "版本不兼容" };
    vi.mocked(api.openExample).mockResolvedValueOnce(blocked);
    render(<ProjectHome recent={[]} actions={api} onEnter={enter} />);
    fireEvent.click(screen.getByRole("button", { name: "打开示例工程" }));
    expect(await screen.findByText("只读：版本不兼容")).toBeVisible();
    expect(enter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "准备导出 ZIP" }));
    await waitFor(() => expect(api.exportArchive).toHaveBeenCalledWith(blocked));
    expect(await screen.findByRole("link", { name: "下载工程 ZIP · 2.0 KiB" })).toHaveAttribute("download", "my-story.zip");
  });
  it("surfaces opening errors without entering a missing project", async () => {
    const api = actions(); const enter = vi.fn();
    vi.mocked(api.openDirectory).mockRejectedValueOnce(new Error("目录授权已失效"));
    render(<ProjectHome recent={[]} actions={api} onEnter={enter} />);
    fireEvent.click(screen.getByRole("button", { name: "打开工程目录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("目录授权已失效");
    expect(enter).not.toHaveBeenCalled();
  });
  it("surfaces an export integrity failure for a read-only project", async () => {
    const api = actions();
    vi.mocked(api.openExample).mockResolvedValueOnce({ ...session, access: "read-only", readOnlyReason: "版本不兼容" });
    vi.mocked(api.exportArchive).mockRejectedValueOnce(new Error("Referenced source Blob is missing or corrupt during export"));
    render(<ProjectHome recent={[]} actions={api} onEnter={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开示例工程" }));
    await screen.findByRole("heading", { name: "My Story" });
    fireEvent.click(screen.getByRole("button", { name: "准备导出 ZIP" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Referenced source Blob is missing or corrupt during export");
  });
  it("protects buffered and committed partial edits from window, scene and full-project navigation", async () => {
    const { api, dialog, source, scene } = await openPartialEditor();
    const editor = within(dialog).getByRole("textbox", { name: "单场景权威脚本编辑器" });
    fireEvent.change(editor, { target: { value: source.replace("Ending", "Kept ending") } });
    for (const name of ["上一窗口", "下一窗口", "加载完整工程", "关闭", `编辑场景 ${scene.title}`, "Sequence 视图"]) expect(within(dialog).getByRole("button", { name })).toBeDisabled();
    fireEvent.blur(editor);
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存当前场景" })).toBeEnabled());
    expect(within(dialog).getByRole("button", { name: "下一窗口" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "保存当前场景" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "下一窗口" })).toBeEnabled());
    expect(api.saveLazyScene.mock.calls[0]?.[1].sourceSession?.committedSource).toContain("Kept ending");
  });
  it("shows failed partial saves inside the modal and permits deliberate discard and reopen", async () => {
    const { api, dialog, source } = await openPartialEditor();
    api.saveLazyScene.mockRejectedValueOnce(new Error("保存失败，请重试"));
    const editor = within(dialog).getByRole("textbox", { name: "单场景权威脚本编辑器" });
    fireEvent.change(editor, { target: { value: source.replace("Ending", "Unsaved ending") } });
    fireEvent.blur(editor);
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存当前场景" })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: "保存当前场景" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("保存失败，请重试");
    expect(within(dialog).getByRole("textbox")).toHaveValue(source.replace("Ending", "Unsaved ending"));
    fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改并关闭" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(`${session.title}的更多选项`));
    fireEvent.click(screen.getByRole("button", { name: `快速查看 ${session.title} Route` }));
    await screen.findByRole("dialog", { name: "大项目分场景编辑" });
    expect(api.openRouteOverview).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createCharacterEntity, createProject, createProjectService, createProjectTemplate, executeProjectBatch, openProject, saveProject, type ProjectCommand, type ProjectFiles, type ProjectLifecycleSession, type ProjectReference, type ProjectWorkspace } from "@world-studio/project-domain";
import { describe, expect, it, vi } from "vitest";
import { ProjectEntityManager } from "./project-entity-manager";

class MemoryWorkspace implements ProjectWorkspace {
  readonly reference: ProjectReference = { referenceId: "n13", hostKind: "memory-test", displayLocation: "Memory/N13", permissionKey: "n13" };
  files: ProjectFiles = {}; version = 0;
  async readFiles() { return { files: this.files, version: String(this.version) }; }
  async writeFiles(files: ProjectFiles, expectedVersion: string | null) { if (expectedVersion !== null && expectedVersion !== String(this.version)) throw new Error("stale"); this.files = structuredClone(files); this.version++; return { version: String(this.version) }; }
}
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const tab = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "项目结构分区" })).getByRole("button", { name }));
const create = (kind: string, fields: Record<string, string>, advanced = false) => {
  fireEvent.click(screen.getByRole("button", { name: `新增${kind}` }));
  if (advanced) fireEvent.click(screen.getByText("高级角色设置"));
  for (const [label, value] of Object.entries(fields)) set(label, value);
  fireEvent.click(screen.getByRole("button", { name: `创建${kind}` }));
};
async function setup(props: Partial<Parameters<typeof ProjectEntityManager>[0]> = {}) {
  const workspace = new MemoryWorkspace();
  const session = await createProject(workspace, "N13 Story", "018f08d8-71a1-7bc2-a627-2f4a843ee190");
  let serial = 0;
  const onSession = vi.fn(), onOpenEditor = vi.fn();
  render(<ProjectEntityManager session={session} workspace={workspace} onSession={onSession} onOpenEditor={onOpenEditor} idFactory={() => `id${++serial}`} {...props} />);
  return { workspace, session, onSession, onOpenEditor };
}

describe("ProjectEntityManager", () => {
  it("creates chapters, scenes, characters and typed variables in dialogs, then preserves them on reopen", async () => {
    const { workspace, onSession } = await setup();
    expect(screen.queryByLabelText("角色显示名")).not.toBeInTheDocument();
    create("章节", { "新章节名称": "Second" });
    create("场景", { "新场景名称": "Middle" });
    create("场景", { "新场景名称": "Ending" });
    tab("角色");
    create("角色", { "角色显示名": "Aya", "角色颜色": "#ff44aa", "立绘槽位": "main,closeup", "默认表情": "neutral" }, true);
    create("角色", { "角色显示名": "Ren", "角色颜色": "#4488ff", "默认表情": "smile" }, true);
    tab("变量");
    create("变量", { "变量名称": "Flag", "变量默认值": "false" });
    create("变量", { "变量名称": "Trust", "变量类型": "number", "变量默认值": "3" });
    create("变量", { "变量名称": "Route", "变量类型": "string", "变量默认值": "common" });
    tab("章节与场景");
    fireEvent.click(screen.getAllByRole("button", { name: "设为入口" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));
    await screen.findByText("已保存到工程目录");
    const reopened = await openProject(workspace);
    expect(reopened.project?.scenes).toHaveLength(3);
    expect(reopened.project?.characters.characters).toHaveLength(2);
    expect(reopened.project?.variables.variables).toHaveLength(3);
    expect(reopened.project?.characters.characters[0]).toMatchObject({ displayName: "Aya", portraitSlots: ["main", "closeup"], defaultExpression: "neutral" });
    expect(reopened.project?.variables.variables.map(item => item.type)).toEqual(["boolean", "number", "string"]);
    expect(reopened.project?.scenes.slice(1).map(scene => reopened.project?.scripts[scene.id]?.statements)).toMatchObject([[{ kind: "end", endingName: "未命名结局" }], [{ kind: "end", endingName: "未命名结局" }]]);
    const saved = onSession.mock.calls[0]?.[0] as ProjectLifecycleSession;
    expect(reopened.project?.scenes.map(item => item.id)).toEqual(saved.project?.scenes.map(item => item.id));
    expect(reopened.project?.manifest.entrySceneId).toBe(saved.project?.manifest.entrySceneId);
  });
  it("searches all entities and keeps ordering actions available", async () => {
    await setup();
    set("搜索全部实体", "Main");
    expect(screen.getByRole("list", { name: "搜索结果" })).toHaveTextContent("章节");
    expect(screen.getByRole("button", { name: "Main上移" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start上移" })).toBeDisabled();
  });
  it("requires reference migration before deleting a character", async () => {
    const workspace = new MemoryWorkspace();
    const service = createProjectService(createProjectTemplate("Migration UI", "018f08d8-71a1-7bc2-a627-2f4a843ee192"));
    const sceneId = service.project.manifest.entrySceneId;
    const built = executeProjectBatch(service, [
      { commandId: "command_a", expectedRevision: 0, kind: "character.create", character: createCharacterEntity("character_a", "A", "#112233", ["main"], "neutral") },
      { commandId: "command_b", expectedRevision: 0, kind: "character.create", character: createCharacterEntity("character_b", "B", "#445566", ["main"], "neutral") },
      { commandId: "command_line", expectedRevision: 0, kind: "statement.insert", sceneId, statement: { id: "statement_line", kind: "dialogue", speakerId: "character_a", textId: "text_line", text: "Hello" } }
    ] as ProjectCommand[]);
    expect(built.ok).toBe(true); if (!built.ok) return;
    await workspace.writeFiles(saveProject(built.state.project), null);
    const session = await openProject(workspace);
    let serial = 0;
    render(<ProjectEntityManager session={session} workspace={workspace} onSession={() => undefined} onOpenEditor={() => undefined} idFactory={() => `migrate${++serial}`} />);
    tab("角色");
    fireEvent.click(screen.getByRole("button", { name: "删除角色A" }));
    const dialog = screen.getByRole("alertdialog", { name: "删除前引用分析" });
    expect(dialog).toHaveTextContent("speakerId");
    expect(within(dialog).getByRole("button", { name: "迁移引用并删除" })).toBeDisabled();
    set("替代实体", "character_b");
    fireEvent.click(screen.getByRole("button", { name: "迁移引用并删除" }));
    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));
    await screen.findByText("已保存到工程目录");
    const reopened = await openProject(workspace);
    expect(reopened.project?.characters.characters.map(item => item.id)).toEqual(["character_b"]);
    expect(reopened.project?.scripts[sceneId]?.statements.at(-1)).toMatchObject({ speakerId: "character_b" });
  });
  it("moves a scene to another chapter without requiring a rename", async () => {
    const { workspace } = await setup();
    create("章节", { "新章节名称": "Second" });
    fireEvent.click(screen.getByRole("button", { name: "修改场景：Start" }));
    fireEvent.change(screen.getByLabelText("新场景所属章节"), { target: { value: screen.getByRole("option", { name: "Second" }).getAttribute("value") } });
    fireEvent.click(screen.getByRole("button", { name: "保存场景" }));
    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));
    await screen.findByText("已保存到工程目录");
    const reopened = await openProject(workspace);
    expect(reopened.project?.chapters.find(chapter => chapter.title === "Main")?.scenePaths).toHaveLength(0);
    expect(reopened.project?.chapters.find(chapter => chapter.title === "Second")?.scenePaths).toHaveLength(1);
    expect(reopened.project?.scenes[0]?.title).toBe("Start");
  });
  it("preserves a committed workspace revision when the save callback fails, then retries", async () => {
    const onSession = vi.fn().mockRejectedValueOnce(new Error("编译暂时失败")).mockResolvedValueOnce(undefined);
    const { workspace } = await setup({ onSession });
    create("章节", { "新章节名称": "Retained" });
    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("编译暂时失败");
    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));
    await screen.findByText("已保存到工程目录");
    expect(onSession).toHaveBeenCalledTimes(2);
    expect((await openProject(workspace)).project?.chapters.some(chapter => chapter.title === "Retained")).toBe(true);
  });
  it("returns a newly created character to the current writing scene", async () => {
    const { session, onOpenEditor } = await setup({ initialCreate: "character", returnAfterCreate: true });
    expect(screen.getByRole("dialog", { name: "创建角色" })).toBeVisible();
    set("角色显示名", "小夏");
    fireEvent.click(screen.getByRole("button", { name: "创建角色" }));
    await waitFor(() => expect(onOpenEditor).toHaveBeenCalledOnce());
    expect(onOpenEditor.mock.calls[0]?.[0].characters.characters[0]).toMatchObject({ displayName: "小夏" });
    expect(onOpenEditor.mock.calls[0]?.[1]).toBe(session.project!.manifest.entrySceneId);
  });
});

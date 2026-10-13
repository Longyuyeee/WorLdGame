import { IDBFactory } from "fake-indexeddb";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { App } from "./App";
import { StudioLauncher } from "./studio-launcher";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
}
async function openMenu() {
  await waitFor(() => expect(document.querySelector<HTMLButtonElement>(".local-save-button")?.disabled).toBe(false));
  fireEvent.click(screen.getByLabelText("项目菜单"));
}

describe("Project navigation persistence", () => {
  it("keeps undo and redo after visiting structure and uses fresh command IDs", async () => {
    storage(); render(<StudioLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "Continuous Story" } });
    fireEvent.click(screen.getByRole("button", { name: "创建并开始写作" }));
    await screen.findByTestId("workspace-shell");
    fireEvent.click(screen.getByRole("button", { name: "脚本" }));
    const editor = screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: editor.value.replace('end "Ending"', 'end "连续写作"') } }); fireEvent.blur(editor);
    await openMenu(); fireEvent.click(screen.getByRole("button", { name: /章节与角色/ }));
    await screen.findByRole("main", { name: "项目结构管理" });
    fireEvent.click(screen.getByRole("button", { name: "返回创作" }));
    await screen.findByTestId("workspace-shell");
    await waitFor(() => expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain('end "Ending"');
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain('end "连续写作"');
    const resumed = screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement;
    fireEvent.change(resumed, { target: { value: resumed.value.replace("连续写作", "再次修改") } }); fireEvent.blur(resumed);
    expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain('end "再次修改"');
  });
  it("creates two scenes over an existing snapshot and preserves all three scenes when reopening", async () => {
    storage();
    render(<StudioLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "Scene Handoff" } });
    fireEvent.click(screen.getByRole("button", { name: "创建并开始写作" }));
    await screen.findByTestId("workspace-shell");
    for (const name of ["第一条路线", "第二条路线"]) {
      await waitFor(() => expect(document.querySelector<HTMLButtonElement>(".local-save-button")?.disabled).toBe(false));
      fireEvent.click(screen.getByRole("button", { name: "添加内容" }));
      fireEvent.click(screen.getByRole("button", { name: "添加场景" }));
      await screen.findByRole("dialog", { name: "创建场景" });
      fireEvent.change(screen.getByLabelText("新场景名称"), { target: { value: name } });
      fireEvent.click(screen.getByRole("button", { name: "创建并写作" }));
      await screen.findByTestId("workspace-shell");
      expect(screen.getByRole("heading", { name })).toBeVisible();
    }
    await openMenu();
    fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
    await screen.findByRole("main", { name: "项目首页" });
    fireEvent.click(screen.getByRole("button", { name: "打开项目：Scene Handoff" }));
    await screen.findByTestId("workspace-shell");
    expect(document.querySelectorAll(".scene-item")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "第二条路线" })).toBeVisible();
  });
  it("saves structure changes and edited content before returning and reopening", async () => {
    storage();
    render(<StudioLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "Navigation Story" } });
    fireEvent.click(screen.getByRole("button", { name: "创建并开始写作" }));
    await screen.findByTestId("workspace-shell");
    await openMenu();
    fireEvent.click(screen.getByRole("button", { name: /章节与角色/ }));
    await screen.findByRole("main", { name: "项目结构管理" });
    fireEvent.click(screen.getByRole("button", { name: "新增章节" }));
    fireEvent.change(screen.getByLabelText("新章节名称"), { target: { value: "第二章" } });
    fireEvent.click(screen.getByRole("button", { name: "创建章节" }));
    fireEvent.click(screen.getByRole("button", { name: "返回创作" }));
    await screen.findByTestId("workspace-shell");
    fireEvent.click(screen.getByRole("button", { name: "脚本" }));
    const editor = screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: editor.value.replace('end "Ending"', 'end "保存后的结局"') } });
    fireEvent.blur(editor);
    await openMenu();
    fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
    await screen.findByRole("main", { name: "项目首页" });
    fireEvent.click(screen.getByRole("button", { name: "打开项目：Navigation Story" }));
    await screen.findByTestId("workspace-shell");
    fireEvent.click(screen.getByRole("button", { name: "脚本" }));
    await waitFor(() => expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain('end "保存后的结局"'));
    await openMenu();
    fireEvent.click(screen.getByRole("button", { name: /章节与角色/ }));
    expect(await screen.findByRole("heading", { name: "第二章" })).toBeVisible();
  });
  it("stays in the project on canonical save failure and retries without a stale local revision", async () => {
    storage();
    const home = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error("目录写入暂时失败")).mockResolvedValueOnce(undefined);
    render(<App initialProject={createProjectTemplate("Retry Story", "018f08d8-71a1-7bc2-a627-2f4a843ee150")} onOpenProject={vi.fn()} onReturnHome={home} onCanonicalProjectSave={save} autosaveDebounceMs={60_000} />);
    await openMenu();
    fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("项目尚未保存成功");
    expect(home).not.toHaveBeenCalled();
    expect(screen.getByTestId("workspace-shell")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
    await waitFor(() => expect(home).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledTimes(2);
  });
});

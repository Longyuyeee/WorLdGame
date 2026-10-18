import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { SettingsWorkspace } from "./SettingsWorkspace";
it("edits, undoes, validates, applies and resets both pages without touching the story", async () => {
  const project = createProjectTemplate("Layout", "018f08d8-71a1-7bc2-a627-2f4a843ee163"), change = vi.fn();
  render(<SettingsWorkspace project={project} saveStatus="saved" onProjectChange={change} onSave={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByText("标题自由组件与响应式布局")); fireEvent.click(screen.getByLabelText("启用标题自由布局"));
  fireEvent.click(screen.getByRole("button", { name: "添加功能按钮" })); fireEvent.change(screen.getByLabelText("组件文字"), { target: { value: "继续我的回信" } }); fireEvent.change(screen.getByLabelText("按钮动作"), { target: { value: "load" } });
  fireEvent.change(screen.getByLabelText("布局调整设备"), { target: { value: "mobile" } }); fireEvent.click(screen.getByLabelText("手机独立布局"));
  expect(screen.getByLabelText("外观预览设备")).toHaveValue("phone");
  fireEvent.change(screen.getByLabelText("组件显示设备"), { target: { value: "desktop" } });
  fireEvent.change(screen.getByLabelText("组件宽度"), { target: { value: "101" } }); expect(screen.getByRole("button", { name: "应用玩家外观" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("组件宽度"), { target: { value: "40" } }); fireEvent.click(screen.getByRole("button", { name: "删除所选组件" })); fireEvent.click(screen.getByRole("button", { name: "撤销外观调整" }));
  fireEvent.click(within(screen.getByRole("navigation", { name: "游戏界面分区" })).getByRole("button", { name: /阅读与选项/u })); fireEvent.click(screen.getByText("阅读自由组件与响应式布局")); fireEvent.click(screen.getByLabelText("启用阅读自由布局"));
  fireEvent.click(screen.getByRole("button", { name: "恢复本页默认布局" })); expect(screen.getByLabelText("启用阅读自由布局")).not.toBeChecked(); fireEvent.click(screen.getByRole("button", { name: "撤销外观调整" })); expect(screen.getByLabelText("启用阅读自由布局")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "应用玩家外观" })); await waitFor(() => expect(change).toHaveBeenCalledOnce());
  const saved = change.mock.lastCall![0]; expect(saved.scripts).toEqual(project.scripts); expect(saved.ui.preservedFields.webPlayerAppearance.skin.layout).toMatchObject({ title: { enabled: true, components: [{ text: "继续我的回信", action: "load", mobile: { width: 40 }, visibility: "desktop" }] }, reading: { enabled: true } });
});

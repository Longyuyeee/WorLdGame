import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { SettingsWorkspace } from "./SettingsWorkspace";
it("edits six optional panels with safe actions, device isolation, undo and honest legacy-width controls", async () => {
  const project = createProjectTemplate("Panel editor", "018f08d8-71a1-7bc2-a627-2f4a843ee167"), change = vi.fn();
  render(<SettingsWorkspace project={project} saveStatus="saved" onProjectChange={change} onSave={() => {}} onClose={() => {}} />);
  fireEvent.click(within(screen.getByRole("navigation", { name: "游戏界面分区" })).getByRole("button", { name: /其他页面/u }));
  for (const [surface, label] of [["menu", "阅读菜单"], ["save", "存读档"], ["history", "剧情历史"], ["preferences", "玩家设置"], ["credits", "制作名单"], ["ending", "结局"]] as const) {
    fireEvent.change(screen.getByLabelText("正在编辑的界面"), { target: { value: surface } }); fireEvent.click(screen.getByText(`${label}自由组件与响应式布局`)); fireEvent.click(screen.getByLabelText(`启用${label}自由布局`));
    expect(screen.getByLabelText("本页宽度")).toBeDisabled(); expect(screen.getByLabelText("本页位置")).toBeDisabled(); expect(screen.getByLabelText("本页入场动效")).toBeDisabled(); expect(screen.getByLabelText("本页文字大小")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "添加功能按钮" }));
    expect(screen.getByLabelText("按钮动作")).toHaveValue("resume"); if (surface !== "menu") expect(within(screen.getByLabelText("按钮动作")).getAllByRole("option")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("布局调整设备"), { target: { value: "mobile" } }); fireEvent.change(screen.getByLabelText("组件宽度"), { target: { value: "36" } });
    fireEvent.click(screen.getByRole("button", { name: "恢复本页默认布局" })); expect(screen.getByLabelText(`启用${label}自由布局`)).not.toBeChecked(); fireEvent.click(screen.getByRole("button", { name: "撤销外观调整" })); expect(screen.getByLabelText(`启用${label}自由布局`)).toBeChecked();
  }
  fireEvent.click(screen.getByRole("button", { name: "应用玩家外观" })); await waitFor(() => expect(change).toHaveBeenCalledOnce());
  const saved = change.mock.lastCall![0]; expect(saved.scripts).toEqual(project.scripts);
  for (const surface of ["menu", "save", "history", "preferences", "credits", "ending"]) expect(saved.ui.preservedFields.webPlayerAppearance.skin.layout[surface]).toMatchObject({ enabled: true, components: [{ action: "resume", mobile: { width: 36 }, desktop: { width: 24 } }] });
});

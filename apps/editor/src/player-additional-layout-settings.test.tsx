import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProjectTemplate, WEB_ADDITIONAL_LAYOUT_LABELS } from "@world-studio/project-domain";
import { SettingsWorkspace } from "./SettingsWorkspace";
it("authors five independent extra pages with context-specific returns, phone geometry, undo and preview selection", async () => {
  const project = createProjectTemplate("Extras editor", "018f08d8-71a1-7bc2-a627-2f4a843ee169"), change = vi.fn();
  render(<SettingsWorkspace project={project} saveStatus="saved" onProjectChange={change} onSave={() => {}} onClose={() => {}} />);
  fireEvent.click(within(screen.getByRole("navigation", { name: "游戏界面分区" })).getByRole("button", { name: /其他页面/u })); fireEvent.change(screen.getByLabelText("正在编辑的界面"), { target: { value: "additional" } });
  for (const [surface, label] of Object.entries(WEB_ADDITIONAL_LAYOUT_LABELS)) {
    fireEvent.change(screen.getByLabelText("附加内容布局页面"), { target: { value: surface } }); expect(screen.getByLabelText("外观预览页面")).toHaveValue(surface);
    fireEvent.click(screen.getByText(`${label}自由组件与响应式布局`)); expect(screen.getByLabelText(`启用${label}自由布局`)).not.toBeChecked(); fireEvent.click(screen.getByLabelText(`启用${label}自由布局`));
    fireEvent.click(screen.getByRole("button", { name: "添加功能按钮" })); expect(within(screen.getByLabelText("按钮动作")).getAllByRole("option")).toHaveLength(1); expect(screen.getByLabelText("组件文字")).toHaveValue(surface === "additional" ? "返回游戏" : "返回附加内容总览");
    fireEvent.change(screen.getByLabelText("布局调整设备"), { target: { value: "mobile" } }); fireEvent.change(screen.getByLabelText("组件宽度"), { target: { value: "32" } }); fireEvent.click(screen.getByRole("button", { name: "删除所选组件" })); fireEvent.click(screen.getByRole("button", { name: "撤销外观调整" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "应用玩家外观" })); await waitFor(() => expect(change).toHaveBeenCalledOnce()); const saved = change.mock.lastCall![0]; expect(saved.scripts).toEqual(project.scripts); expect(saved.characters).toEqual(project.characters);
  for (const surface of Object.keys(WEB_ADDITIONAL_LAYOUT_LABELS)) expect(saved.ui.preservedFields.webPlayerAppearance.skin.layout[surface]).toMatchObject({ enabled: true, components: [{ action: "resume", mobile: { width: 32 }, desktop: { width: 24 } }] });
});

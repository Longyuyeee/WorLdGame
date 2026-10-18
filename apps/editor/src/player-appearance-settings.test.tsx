import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { SettingsWorkspace } from "./SettingsWorkspace";
it("protects appearance drafts and keeps the applied appearance when editing text settings", async () => {
  const change = vi.fn(), dirty = vi.fn();
  render(<SettingsWorkspace project={createProjectTemplate("Appearance", "018f08d8-71a1-7bc2-a627-2f4a843ee150")} saveStatus="saved" onProjectChange={change} onDraftChange={dirty} onSave={() => {}} onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("标题简介"), { target: { value: "雨停后再出发" } });
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(true));
  expect(screen.getByRole("button", { name: "返回创作" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "应用玩家外观" }));
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false));
  fireEvent.change(screen.getByLabelText("设置分区"), { target: { value: "text" } });
  fireEvent.change(screen.getByLabelText("字体缩放"), { target: { value: "1.2" } });
  fireEvent.click(screen.getByRole("button", { name: "应用修改 · 1" }));
  expect(change.mock.lastCall?.[0].ui.preservedFields.webPlayerAppearance.titleTagline).toBe("雨停后再出发");
});

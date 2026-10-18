import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerSkin, defaultWebPlayerScreens, type WebPlayerScreenId } from "@world-studio/project-domain";
import { WebPlayerHost } from "./player-host";
import { PlayerShell } from "./PlayerShell";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
function project(ending = false) {
  const base = createProjectTemplate("Pages", "018f08d8-71a1-7bc2-a627-2f4a843ee198"), scene = base.scenes[0]!, screens = defaultWebPlayerScreens();
  return applyWebPlayerAppearance({ ...base, scripts: { [scene.id]: { ...base.scripts[scene.id]!, statements: [...(ending ? [] : [{ id: "line", kind: "narration", textId: "words", text: "一封回信" }]), { id: "end", kind: "end", endingName: "明天" }] } } }, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...defaultWebPlayerSkin(), screens: { ...screens, saveColumns: 3, ending: { caption: "谢谢阅读", note: "写给明天", returnLabel: "合上回信" } } } });
}
it.each([
  ["menu", "阅读菜单", true], ["save", "存读档槽位", true], ["history", "剧情历史", true],
  ["preferences", "玩家设置", false], ["additional", "附加内容", false], ["credits", "制作名单与致谢", false]
] as const)("opens the actual %s page in an isolated, non-persistent preview", async (id, label, autoStart) => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  const { container } = render(<WebPlayerHost project={project()} activityOverride="active" editorPreview={{ autoStart, initialPanel: id as WebPlayerScreenId }} />);
  const panel = await screen.findByRole("dialog", { name: label });
  expect(panel).toHaveAttribute("data-skin-screen", id);
  expect(container.querySelector("main")).toHaveAttribute("data-save-store", "appearance-preview-memory");
  if (id === "save") {
    const save = within(screen.getByRole("region", { name: "手动存档 1" })).getByRole("button", { name: "保存" });
    await waitFor(() => expect(save).toBeEnabled()); fireEvent.click(save);
    await waitFor(() => expect(panel).toHaveTextContent("已保存"));
    expect(within(screen.getByRole("region", { name: "手动存档 1" })).queryByText("空槽位")).not.toBeInTheDocument();
  }
  if (id === "preferences") { fireEvent.click(within(panel).getByLabelText("高对比阅读")); expect(container.querySelector("main")).toHaveAttribute("data-settings-high-contrast", "true"); }
  expect(write).not.toHaveBeenCalled();
});
it("uses the author's ending copy and keeps its return action functional", () => {
  const { container } = render(<PlayerShell project={project(true)} editorPreview={{ autoStart: true }} />);
  expect(screen.getByText("谢谢阅读")).toBeVisible();
  expect(screen.getByText("写给明天")).toBeVisible();
  expect(container.querySelector("[data-skin-screen=ending]")).toHaveStyle({ "--screen-width": "600px" });
  fireEvent.click(screen.getByRole("button", { name: "合上回信" }));
  expect(screen.getByRole("button", { name: /开始故事/ })).toBeVisible();
});

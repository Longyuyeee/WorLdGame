import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerLayout, defaultWebPlayerSkin, type WebLayoutAction, type WebLayoutComponent } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
function fixture() {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000); vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(560);
  const base = createProjectTemplate("Layout", "018f08d8-71a1-7bc2-a627-2f4a843ee164"), sceneId = base.manifest.entrySceneId;
  const project = { ...base, scripts: { ...base.scripts, [sceneId]: { ...base.scripts[sceneId]!, statements: [{ id: "line_1", kind: "narration", textId: "text_1", text: "A saved sentence" }, { id: "line_2", kind: "narration", textId: "text_2", text: "The next sentence" }, { id: "ending", kind: "end", endingName: "Done" }] } } };
  const layout = defaultWebPlayerLayout();
  const button = (id: string, text: string, action: WebLayoutAction): WebLayoutComponent => ({ id, text, action, kind: "button", assetId: "", fit: "contain", desktop: layout.title.desktop.primary, mobile: null });
  return applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...defaultWebPlayerSkin(), layout: { title: { ...layout.title, enabled: true, components: [button("layout_start", "Custom start", "start"), button("layout_load", "Custom load", "load"), button("layout_settings", "Custom settings", "preferences")] }, reading: { ...layout.reading, enabled: true, components: [button("layout_save", "Custom save", "save"), button("layout_history", "Custom history", "history"), button("layout_settings", "Reading settings", "preferences")] } } } });
}
it("binds custom actions to protected Player flows, disables unavailable saves and restores focus", async () => {
  const { container } = render(<PlayerShell project={fixture()} />);
  expect(container.querySelector("main")).toHaveAttribute("data-layout-title", "true");
  expect(screen.getByRole("button", { name: "Custom load" })).toBeDisabled();
  const settings = screen.getByRole("button", { name: "Custom settings" }); fireEvent.click(settings);
  fireEvent.click(screen.getByRole("button", { name: "返回故事" })); await waitFor(() => expect(settings).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "Custom start" }));
  expect(container.querySelector("main")).toHaveAttribute("data-layout-reading", "true"); expect(screen.getByRole("button", { name: "Custom save" })).toBeDisabled();
  const before = container.querySelector("main")!.dataset.runtimeStateHash, history = screen.getByRole("button", { name: "Custom history" }); fireEvent.click(history);
  fireEvent.click(within(screen.getByRole("dialog", { name: "剧情历史" })).getByRole("button", { name: "关闭剧情历史" })); await waitFor(() => expect(history).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "Reading settings" })); fireEvent.click(screen.getByRole("button", { name: "返回故事" }));
  expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(before);
});
it("shows a readable replacement for an unavailable decorative image without blocking progression", async () => {
  const original = fixture(), appearance = original.ui.preservedFields!.webPlayerAppearance as unknown as typeof DEFAULT_WEB_PLAYER_APPEARANCE;
  const layout = appearance.skin!.layout!, project = applyWebPlayerAppearance(original, { ...appearance, skin: { ...appearance.skin!, layout: { ...layout, title: { ...layout.title, components: [...layout.title.components, { ...layout.title.components[0]!, id: "layout_image", kind: "image", text: "Missing decoration", action: "preferences", assetId: "" }] } } } });
  render(<PlayerShell project={project} />); expect(screen.getByText("Missing decoration")).toBeVisible(); fireEvent.click(screen.getByRole("button", { name: "Custom start" })); expect(screen.getByRole("button", { name: "继续下一句" })).toHaveTextContent("A saved sentence");
});

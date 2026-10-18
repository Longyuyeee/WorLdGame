import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerSkin, defaultWebPlayerLayout, defaultWebPageLayout, WEB_ADDITIONAL_LAYOUT_LABELS, type WebAdditionalLayoutSurface } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";
import { createPlayerMediaDemoV1 } from "./media-demo";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
function fixture() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 16, top: 16, width: 1000, height: 700, right: 1016, bottom: 716, x: 16, y: 16, toJSON: () => ({}) });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const demo = createPlayerMediaDemoV1(), pages = Object.keys(WEB_ADDITIONAL_LAYOUT_LABELS) as WebAdditionalLayoutSurface[];
  const layout = { ...defaultWebPlayerLayout(), ...Object.fromEntries(pages.map(surface => [surface, { ...defaultWebPageLayout(surface), enabled: true, components: [{ id: "layout_return", kind: "button", text: `${surface} custom return`, action: "resume", assetId: "", fit: "contain", desktop: defaultWebPageLayout(surface).desktop.primary, mobile: null }] }])) };
  return { ...demo, project: applyWebPlayerAppearance(demo.project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...defaultWebPlayerSkin(), layout } }) };
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const panel = () => screen.getByRole("dialog", { name: "附加内容" });
const start = () => { click("开始故事"); click("完成动效"); };
const finish = () => { start(); click("继续下一句"); click("继续下一句"); };
it("keeps locked items secret, places native group returns in their own region, and never treats return as unlock", async () => {
  const demo = fixture(); const { container } = render(<PlayerShell {...demo} />); click("打开附加内容"); expect(panel()).toHaveAttribute("data-panel-layout", "additional");
  const hash = container.querySelector("main")!.dataset.runtimeStateHash;
  for (const [surface, name] of [["gallery", "CG 画廊"], ["music", "音乐室"], ["replay", "场景回想"], ["endings", "结局"]] as const) {
    click(`查看 ${name}`); expect(panel()).toHaveAttribute("data-panel-layout", surface); const back = within(panel()).getByRole("button", { name: "返回附加内容总览" });
    expect(back.closest('[data-panel-region]')).toHaveAttribute("data-panel-region", "secondary"); expect(back).toHaveFocus(); expect(panel()).not.toHaveTextContent(/Deterministic Sunset|Deterministic Theme|Curtain|Stage/u);
    if (surface === "replay") expect(within(panel()).getByRole("button", { name: "场景 1 尚未解锁" })).toBeDisabled();
    click(`${surface} custom return`); expect(panel()).toHaveAttribute("data-panel-layout", "additional"); expect(screen.getByRole("button", { name: `查看 ${name}` })).toHaveFocus();
  }
  click("additional custom return"); await waitFor(() => expect(screen.getByRole("button", { name: "打开附加内容" })).toHaveFocus()); expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(hash);
});
it("keeps full artwork outside the scrolling body, traps its focus and preserves the same image through viewport measurement", () => {
  const demo = fixture(); render(<PlayerShell {...demo} />); start(); click("打开附加内容"); click("查看 CG 画廊"); const trigger = screen.getByRole("button", { name: "查看画面 Deterministic Sunset" }); fireEvent.click(trigger);
  const image = screen.getByRole("dialog", { name: "Deterministic Sunset 画面预览" }), close = within(image).getByRole("button", { name: "关闭画面预览" });
  expect(image.parentElement).toBe(panel()); expect(close).toHaveFocus(); fireEvent.keyDown(window, { key: "Tab" }); expect(close).toHaveFocus(); fireEvent.keyDown(window, { key: "Tab", shiftKey: true }); expect(close).toHaveFocus();
  const content = image.querySelector("img,canvas"); fireEvent(window, new Event("resize")); expect(screen.getByRole("dialog", { name: "Deterministic Sunset 画面预览" })).toBe(image); expect(image.querySelector("img,canvas")).toBe(content);
  fireEvent.keyDown(window, { key: "Escape" }); expect(trigger).toHaveFocus(); expect(panel()).toHaveAttribute("data-panel-layout", "gallery"); fireEvent.keyDown(window, { key: "Escape" }); expect(panel()).toHaveAttribute("data-panel-layout", "additional");
});
it("keeps a real close path when the current full artwork disappears and falls back to the group return focus", () => {
  const demo = fixture(), view = render(<PlayerShell {...demo} />); start(); click("打开附加内容"); click("查看 CG 画廊"); click("查看画面 Deterministic Sunset");
  const preview = screen.getByRole("dialog", { name: "Deterministic Sunset 画面预览" });
  view.rerender(<PlayerShell {...demo} mediaAssets={[]} />); expect(within(preview).getByRole("status")).toHaveTextContent("收藏记录仍然保留"); click("关闭画面预览"); expect(screen.getByRole("button", { name: "返回附加内容总览" })).toHaveFocus();
});
it("retains the native music element, audition position and mute through resize without changing story progress", () => {
  const demo = fixture(), view = render(<PlayerShell {...demo} />); click("打开玩家设置"); fireEvent.click(screen.getByLabelText("静音全部声音")); click("返回故事"); start(); const hash = view.container.querySelector("main")!.dataset.runtimeStateHash;
  click("打开附加内容"); click("查看 音乐室"); const audio = screen.getByLabelText<HTMLAudioElement>("试听 Deterministic Theme"); audio.currentTime = 12.5; expect(audio).toHaveAttribute("controls");
  fireEvent(window, new Event("resize")); expect(screen.getByLabelText("试听 Deterministic Theme")).toBe(audio); expect(audio.currentTime).toBe(12.5); expect(audio.muted).toBe(true);
  click("music custom return"); expect(audio.isConnected).toBe(false); click("additional custom return"); expect(view.container.querySelector("main")!.dataset.runtimeStateHash).toBe(hash);
});
it("uses the native replay authority and restores the exact parent ending after replay completion", () => {
  const demo = fixture(), view = render(<PlayerShell {...demo} />); finish(); const root = view.container.querySelector("main")!, hash = root.dataset.runtimeStateHash, host = root.dataset.runtimeHostSnapshotHash, cursor = root.dataset.historyCursor;
  click("查看收藏与结局"); expect(panel()).toHaveAttribute("data-panel-layout", "endings"); click("endings custom return"); click("查看 场景回想"); click("开始回想 Stage"); click("完成动效"); click("继续下一句"); click("继续下一句"); click("结束回想，返回原剧情");
  expect(root.dataset.runtimeStateHash).toBe(hash); expect(root.dataset.runtimeHostSnapshotHash).toBe(host); expect(root.dataset.historyCursor).toBe(cursor); expect(root).toHaveAttribute("data-scene-replay", "inactive");
});
it("does not permit custom group returns while the host is suspended", () => {
  const demo = fixture(), view = render(<PlayerShell {...demo} />); click("打开附加内容"); click("查看 音乐室"); view.rerender(<PlayerShell {...demo} hostActivity="suspended" />);
  expect(screen.getByRole("button", { name: "music custom return" })).toBeDisabled(); click("music custom return"); expect(panel()).toHaveAttribute("data-panel-layout", "music");
});

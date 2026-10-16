import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { withProjectSettings } from "@world-studio/gal-settings";
import { applyWebCredits, DEFAULT_WEB_CREDITS, applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPageLayout, defaultWebPlayerLayout, defaultWebPlayerSkin, semanticHash, type WebLayoutAction } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";
import type { WorldPlayerSaveSlotV3, WorldPlayerSaveStoreV3 } from "./player-save-store";
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
function fixture() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 16, top: 16, width: 1000, height: 700, right: 1016, bottom: 716, x: 16, y: 16, toJSON: () => ({}) });
  const base = createProjectTemplate("Panel flows", "018f08d8-71a1-7bc2-a627-2f4a843ee168"), id = base.manifest.entrySceneId;
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: "instant" } }), scripts: { ...base.scripts, [id]: { ...base.scripts[id]!, statements: [{ id: "a", kind: "narration", textId: "a_words", text: "The first paragraph." }, { id: "b", kind: "narration", textId: "b_words", text: "The second paragraph." }, { id: "end", kind: "end", endingName: "Done" }] } } };
  const component = (text: string, action: WebLayoutAction) => ({ id: `layout_${action}`, kind: "button" as const, text, action, fit: "contain" as const, assetId: "", desktop: defaultWebPageLayout("menu").desktop.primary, mobile: null });
  const layout = { ...defaultWebPlayerLayout(), menu: { ...defaultWebPageLayout("menu"), enabled: true, components: [component("Custom history", "history"), component("Custom save", "save"), component("Menu return", "resume"), component("Custom preferences", "preferences"), component("Custom additional", "additional"), component("Custom load", "load")] }, save: { ...defaultWebPageLayout("save"), enabled: true, components: [component("Save return", "resume")] }, history: { ...defaultWebPageLayout("history"), enabled: true, components: [component("History return", "resume")] } };
  const rows = new Map<string, WorldPlayerSaveSlotV3>();
  const store = { version: "3.0.0" as const, backend: "memory-test", async list() { return [...rows.values()]; }, async read(_p: string, slot: string) { return rows.get(slot) ?? null; }, async readPreview() { return null; }, async write(row) { if (row.schemaVersion === 3) rows.set(row.slotId, row); } } satisfies WorldPlayerSaveStoreV3;
  const extended = { ...layout, ...Object.fromEntries((["preferences", "credits", "ending"] as const).map(surface => [surface, { ...defaultWebPageLayout(surface), enabled: true, components: [component(`${surface} return`, "resume")] }])) };
  return { project: applyWebCredits(applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...defaultWebPlayerSkin(), layout: extended } }), { ...DEFAULT_WEB_CREDITS, studio: "Test team", entries: [{ role: "Writer", name: "<plain text>", url: "https://example.com/writer" }], acknowledgements: "Original source\nLicense pending" }), store, rows };
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
it("opens authored menu/history, focuses the real close action and returns to the same paragraph", async () => {
  const { project, store } = fixture(); const { container } = render(<PlayerShell project={project} saveStore={store} />); click("开始故事"); click("打开阅读菜单");
  expect(screen.getByRole("dialog", { name: "阅读菜单" })).toHaveAttribute("data-panel-layout", "menu"); const hash = container.querySelector("main")!.dataset.runtimeStateHash;
  click("Custom history"); const history = screen.getByRole("dialog", { name: "剧情历史" }); expect(history).toHaveAttribute("data-panel-layout", "history"); expect(within(history).getByRole("button", { name: "关闭剧情历史" })).toHaveFocus();
  fireEvent.change(screen.getByLabelText("查找已记录的剧情"), { target: { value: "paragraph" } }); fireEvent(window, new Event("resize")); expect(screen.getByLabelText("查找已记录的剧情")).toHaveValue("paragraph");
  click("History return"); expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(hash); await waitFor(() => expect(screen.getByRole("button", { name: "打开阅读菜单" })).toHaveFocus());
});
it("keeps native overwrite/read confirmations through measurement and never lets custom returns read or write a slot", async () => {
  const { project, store, rows } = fixture(); const { container } = render(<PlayerShell project={project} saveStore={store} />); click("开始故事"); click("打开阅读菜单"); click("Custom save");
  const dialog = () => screen.getByRole("dialog", { name: "存读档槽位" }); expect(dialog()).toHaveAttribute("data-panel-layout", "save");
  const card = () => container.querySelector<HTMLElement>('[data-save-slot="manual-1"]')!;
  fireEvent.click(within(card()).getByRole("button", { name: "保存" })); await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "saved")); const original = rows.get("manual-1"); click("Save return"); click("继续下一句"); await act(async () => {});
  click("打开阅读菜单"); click("Custom save"); const before = container.querySelector("main")!.dataset.runtimeStateHash;
  fireEvent.click(within(card()).getByRole("button", { name: "保存" })); expect(within(card()).getByRole("button", { name: /确认/u })).toBeInTheDocument(); fireEvent(window, new Event("resize")); expect(within(card()).getByRole("button", { name: /确认/u })).toBeInTheDocument();
  click("读取进度"); fireEvent.click(within(card()).getByRole("button", { name: "读取" })); expect(screen.getByRole("region", { name: "确认读取存档" })).toBeInTheDocument(); fireEvent(window, new Event("resize")); expect(screen.getByRole("region", { name: "确认读取存档" })).toBeInTheDocument();
  click("Save return"); expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(before); expect(rows.get("manual-1")).toBe(original); expect([...rows.keys()].filter(id => id.startsWith("manual"))).toHaveLength(1); expect(container.querySelector(".player-dialogue__text")).toHaveTextContent("The second paragraph.");
});
it("disables authored return actions during the existing foreground save transaction", async () => {
  const { project, store } = fixture(); const { container } = render(<PlayerShell project={project} saveStore={store} />); click("开始故事"); click("打开阅读菜单"); click("Custom save");
  let release!: () => void; const blocked = new Promise<void>(resolve => { release = resolve; }); const write = store.write.bind(store);
  vi.spyOn(store, "write").mockImplementation(async slot => { await blocked; await write(slot); });
  fireEvent.click(within(container.querySelector<HTMLElement>('[data-save-slot="manual-1"]')!).getByRole("button", { name: "保存" }));
  await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "busy"));
  expect(screen.getByRole("button", { name: "Save return" })).toBeDisabled(); click("Save return"); expect(screen.getByRole("dialog", { name: "存读档槽位" })).toBeInTheDocument();
  await act(async () => { release(); }); await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "saved")); expect(screen.getByRole("button", { name: "Save return" })).toBeEnabled();
});
it("routes menu settings, extras and load through existing flows without advancing the story", async () => {
  const { project, store } = fixture(); const { container } = render(<PlayerShell project={project} saveStore={store} />); click("开始故事"); const hash = container.querySelector("main")!.dataset.runtimeStateHash;
  click("打开阅读菜单"); click("Custom preferences"); click("返回故事"); await waitFor(() => expect(screen.getByRole("button", { name: "打开阅读菜单" })).toHaveFocus());
  click("打开阅读菜单"); click("Custom additional"); click("返回剧情"); await waitFor(() => expect(screen.getByRole("button", { name: "打开阅读菜单" })).toHaveFocus());
  click("打开阅读菜单"); click("Custom load"); expect(within(screen.getByRole("dialog", { name: "存读档槽位" })).getByRole("button", { name: "读取进度" })).toHaveAttribute("aria-pressed", "true"); click("Save return"); expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(hash);
});
it("disables authored save and load when storage is unavailable while retaining native return", () => {
  const { project } = fixture(); render(<PlayerShell project={project} />); click("开始故事"); click("打开阅读菜单");
  expect(screen.getByRole("button", { name: "Custom save" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Custom load" })).toBeDisabled(); expect(within(screen.getByRole("dialog", { name: "阅读菜单" })).getByRole("button", { name: "返回故事" })).toBeEnabled();
});
it("keeps preferences and focus through viewport changes, restores only personal defaults, and never changes the project or sentence", async () => {
  const { project, store, rows } = fixture(), before = semanticHash(project); const { container } = render(<PlayerShell project={project} saveStore={store} />);
  click("开始故事"); const hash = container.querySelector("main")!.dataset.runtimeStateHash;
  click("打开阅读菜单"); click("Custom preferences"); const panel = screen.getByRole("dialog", { name: "玩家设置" });
  expect(panel).toHaveAttribute("data-panel-layout", "preferences"); expect(within(panel).getByRole("button", { name: "返回故事" })).toHaveFocus();
  const control = screen.getByLabelText("个人字号"); fireEvent.change(control, { target: { value: "135" } }); control.focus();
  fireEvent.change(screen.getByLabelText("总音量"), { target: { value: "40" } }); fireEvent.click(screen.getByLabelText("高对比阅读")); fireEvent(window, new Event("resize"));
  expect(screen.getByLabelText("个人字号")).toBe(control); expect(control).toHaveValue("135"); expect(control).toHaveFocus(); expect(screen.getByLabelText("总音量")).toHaveValue("40");
  click("恢复作品默认"); expect(control).toHaveValue("100"); expect(screen.getByLabelText("总音量")).toHaveValue("100"); expect(screen.getByLabelText("高对比阅读")).not.toBeChecked();
  click("preferences return"); await waitFor(() => expect(screen.getByRole("button", { name: "打开阅读菜单" })).toHaveFocus()); expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(hash); expect(semanticHash(project)).toBe(before); expect([...rows.keys()].filter(id => id.startsWith("manual"))).toHaveLength(0);
});
it("retains credits text/safe links and the actual trigger when closing an authored layout", async () => {
  const { project } = fixture(); const { container } = render(<PlayerShell project={project} />); const trigger = screen.getByRole("button", { name: "制作名单" }); trigger.focus(); click("制作名单");
  const panel = screen.getByRole("dialog", { name: "制作名单与致谢" }); expect(panel).toHaveAttribute("data-panel-layout", "credits"); expect(within(panel).getByRole("button", { name: "返回游戏" })).toHaveFocus();
  const link = within(panel).getByRole("link", { name: "<plain text>" }); expect(link).toHaveAttribute("rel", "noopener noreferrer"); expect(link).toHaveAttribute("href", "https://example.com/writer"); expect(panel.querySelector("plain")).toBeNull();
  link.focus(); fireEvent(window, new Event("resize")); expect(link).toHaveFocus(); click("credits return"); await waitFor(() => expect(trigger).toHaveFocus()); expect(container.querySelector("main")).toHaveAttribute("data-player-status", "title");
});
it("keeps native ending actions, delegates custom return to restart, and retains personal preferences", async () => {
  const { project, store } = fixture(); const { container } = render(<PlayerShell project={project} saveStore={store} />); click("打开玩家设置"); fireEvent.change(screen.getByLabelText("个人字号"), { target: { value: "125" } }); click("preferences return"); click("开始故事"); click("继续下一句"); click("继续下一句");
  const ending = container.querySelector<HTMLElement>('.player-ending')!; expect(ending).toHaveAttribute("data-panel-layout", "ending"); expect(within(ending).getByRole("button", { name: "回到标题" }).closest('[data-panel-region]')).toHaveAttribute("data-panel-region", "secondary");
  fireEvent(window, new Event("resize")); const hash = container.querySelector("main")!.dataset.runtimeStateHash;
  const trigger = within(ending).getByRole("button", { name: "制作名单" }); trigger.focus(); fireEvent.click(trigger); click("credits return"); await waitFor(() => expect(trigger).toHaveFocus()); expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(hash);
  click("查看收藏与结局"); expect(ending).toHaveAttribute("inert"); click("返回剧情"); expect(ending).not.toHaveAttribute("inert"); expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(hash);
  click("读取存档探索其他路线"); expect(ending).toHaveAttribute("inert"); expect(screen.getByRole("button", { name: "ending return" })).toBeDisabled(); click("Save return"); expect(container.querySelector("main")!.dataset.runtimeStateHash).toBe(hash);
  click("ending return"); expect(container.querySelector("main")).toHaveAttribute("data-player-status", "title"); click("打开玩家设置"); expect(screen.getByLabelText("个人字号")).toHaveValue("125");
});
it("exits an authored replay ending to the exact parent checkpoint instead of restarting the original story", async () => {
  const { project, store } = fixture(); const { container } = render(<PlayerShell project={project} saveStore={store} />); click("开始故事"); click("继续下一句"); click("继续下一句"); click("ending return");
  const root = container.querySelector("main")!, hash = root.dataset.runtimeStateHash, host = root.dataset.runtimeHostSnapshotHash, cursor = root.dataset.historyCursor;
  click("打开附加内容"); click("查看 场景回想"); fireEvent.click(screen.getByRole("button", { name: /^开始回想/u })); click("继续下一句"); click("继续下一句");
  const ending = container.querySelector<HTMLElement>('.player-ending')!; expect(ending).toHaveAttribute("data-panel-layout", "ending"); expect(within(ending).queryByRole("button", { name: "读取存档探索其他路线" })).toBeNull(); expect(within(ending).queryByText(/已达成/u)).toBeNull();
  expect(within(ending).queryByRole("button", { name: "ending return" })).toBeNull(); fireEvent.click(within(ending).getByRole("button", { name: "返回原剧情" }));
  expect(root).toHaveAttribute("data-scene-replay", "inactive"); expect(root.dataset.runtimeStateHash).toBe(hash); expect(root.dataset.runtimeHostSnapshotHash).toBe(host); expect(root.dataset.historyCursor).toBe(cursor);
});

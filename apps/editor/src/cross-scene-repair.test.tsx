import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { storyQaCategoryForCode } from "./debug-qa-workspace";

afterEach(() => vi.unstubAllGlobals());
it.each([false, true])("locates a cross-scene loop or false exit (%s), repairs it, and restores risk on undo", async (constant) => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const project = projectCanonicalFromStory({ schemaVersion: 0, id: "cross_repair", title: "出口修复", entrySceneId: "entry", characters: [], scenes: [
    { id: "entry", title: "入口", statements: [{ id: "choose", kind: "choice", prompt: "去哪", options: [{ id: "risk", label: "绕路", targetSceneId: "a" }, { id: "safe", label: "直接结束", targetSceneId: "finish" }] }] },
    { id: "a", title: "场景 A", statements: [{ id: "jump_a", kind: "jump", targetLabel: "b" }] },
    { id: "b", title: "场景 B", statements: [...(constant ? [{ id: "check_b", kind: "condition" as const, expression: "1 > 2", targetLabel: "finish" }] : []), { id: "jump_b", kind: "jump", targetLabel: "a" }] },
    { id: "finish", title: "终点", statements: [{ id: "done", kind: "end", endingName: "完成" }] }
  ] }, "cross-repair-ui");
  render(<App initialProject={project} autosaveDebounceMs={60_000} />);
  await screen.findByRole("button", { name: "保存到本机" });
  fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
  fireEvent.click(screen.getByRole("button", { name: constant ? "进入诊断内容：CONSTANT_CONDITION_FALSE · check_b" : "进入诊断内容：CROSS_SCENE_CLOSED_CYCLE · jump_b" }));
  expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", constant ? "check_b" : "jump_b");
  const inspector = within(screen.getByRole("form", { name: constant ? "条件类型化参数" : "跳转类型化参数" }));
  if (constant) fireEvent.change(inspector.getByRole("textbox", { name: "条件表达式（可手动编辑复杂条件）" }), { target: { value: "true" } });
  else fireEvent.change(inspector.getByRole("combobox"), { target: { value: "finish" } });
  fireEvent.click(inspector.getByRole("button", { name: "应用类型化参数" }));
  fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
  expect(screen.queryByRole("button", { name: /进入诊断内容：CROSS_SCENE/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.getByRole("button", { name: "进入诊断内容：CROSS_SCENE_CLOSED_CYCLE · jump_b" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "重做" }));
  expect(screen.queryByRole("button", { name: /进入诊断内容：CROSS_SCENE/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /已保存/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
  fireEvent.click(screen.getByRole("button", { name: "选择路线：绕路" }));
  expect(screen.getByText("流程完成：完成")).toBeVisible();
  expect(storyQaCategoryForCode("CROSS_SCENE_NO_EXIT")).toBe("exit");
  expect(storyQaCategoryForCode("CROSS_SCENE_CLOSED_CYCLE")).toBe("loop");
  expect(storyQaCategoryForCode("CONSTANT_CONDITION_FALSE")).toBe("reachability");
});

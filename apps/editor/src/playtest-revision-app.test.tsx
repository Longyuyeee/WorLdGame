import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
const project = () => projectCanonicalFromStory({ schemaVersion: 0, id: "review_story", title: "校订流程", entrySceneId: "entry", characters: [], scenes: [
  { id: "entry", title: "开场", statements: [{ kind: "narration", id: "intro", textId: "intro_text", text: "雨声渐渐停下。" }, { kind: "choice", id: "choice", prompt: "接下来去哪里？", options: [{ id: "a", label: "留下", targetSceneId: "scene_a" }] }] },
  { id: "scene_a", title: "留下", statements: [{ kind: "narration", id: "line_a", textId: "text_a", text: "你留在了车站。" }, { kind: "end", id: "end", endingName: "留下的约定" }] }
] }, "playtest_revision_project");
const nav = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name }));
const start = () => fireEvent.click(screen.getByRole("button", { name: "试玩完整流程" }));
const record = () => { fireEvent.click(screen.getByRole("button", { name: "记录问题" })); fireEvent.change(screen.getByLabelText("校订问题描述"), { target: { value: "这句对白需要再自然一点。" } }); fireEvent.click(screen.getByRole("button", { name: "保存校订记录" })); };
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it("captures a stable target, edits it without advancing the run, then resumes the same history", async () => {
  render(<App initialProject={project()} />); start(); record(); nav("检查");
  expect(screen.getByRole("region", { name: "试玩校订清单" })).toHaveTextContent("1 待跟进");
  fireEvent.click(screen.getByRole("button", { name: "定位原文" }));
  expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "intro");
  const resume = screen.getByRole("button", { name: "返回试玩" });
  fireEvent.change(screen.getByLabelText("旁白文本"), { target: { value: "屋檐下的雨声渐渐停了。" } });
  expect(resume).toBeDisabled(); expect(screen.getByRole("button", { name: "继续故事", hidden: true })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "应用修改" })); fireEvent.click(resume);
  await waitFor(() => expect(screen.getByTestId("preview-step")).toHaveTextContent("屋檐下的雨声渐渐停了。"));
  expect(screen.getByRole("group", { name: "Runtime 调试控制" })).toHaveTextContent("试玩记录 1/1");
  fireEvent.click(screen.getByRole("button", { name: "继续故事" })); fireEvent.click(screen.getByRole("button", { name: "选择路线：留下" }));
  nav("检查"); fireEvent.click(screen.getByRole("button", { name: "定位原文" }));
  expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-scene-id", "entry");
  fireEvent.click(screen.getByRole("button", { name: "返回试玩" }));
  await waitFor(() => expect(screen.getByTestId("preview-step")).toHaveTextContent("你留在了车站。"));
});
it("retests the exact record location and keeps verification distinct from fixing", async () => {
  render(<App initialProject={project()} />); start(); record(); nav("检查");
  fireEvent.click(screen.getByRole("button", { name: "标记已修改" })); expect(screen.getByText("待复核", { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "从此处复测" }));
  await waitFor(() => expect(screen.getByTestId("preview-step")).toHaveTextContent("雨声渐渐停下。"));
  nav("检查"); fireEvent.click(screen.getByRole("button", { name: "确认已复核" }));
  expect(screen.getByText("当前记录均已复核。")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "全部 1" }));
  fireEvent.click(screen.getByText("更多", { exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "编辑记录" })); fireEvent.change(screen.getByLabelText("校订问题描述"), { target: { value: "改为另一处问题。" } }); fireEvent.click(screen.getByRole("button", { name: "保存校订记录" }));
  expect(screen.getByText("待修改", { exact: true })).toBeVisible();
});
it("retains an unsaved note on storage failure and persists only on successful retry", () => {
  render(<App initialProject={project()} />); start();
  const original = Storage.prototype.setItem;
  const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) { if (key.startsWith("world-studio:playtest-notes:")) throw Error("存储空间不足"); return original.call(this, key, value); });
  record(); expect(screen.getByRole("dialog", { name: "记录试玩问题" })).toBeVisible(); expect(screen.getByLabelText("校订问题描述")).toHaveValue("这句对白需要再自然一点。"); expect(screen.getByRole("alert")).toHaveTextContent("存储空间不足");
  failure.mockRestore(); fireEvent.click(screen.getByRole("button", { name: "保存校订记录" }));
  expect(screen.queryByRole("dialog")).toBeNull(); nav("检查"); expect(screen.getByRole("region", { name: "试玩校订清单" })).toHaveTextContent("1 待跟进");
});
it("keeps saved records across reopening without treating them as a runtime save", () => {
  const view = render(<App initialProject={project()} />); start(); record(); view.unmount(); render(<App initialProject={project()} />);
  expect(screen.getByRole("button", { name: "试玩完整流程" })).toBeEnabled(); nav("检查"); expect(screen.getByText("这句对白需要再自然一点。")).toBeVisible();
});

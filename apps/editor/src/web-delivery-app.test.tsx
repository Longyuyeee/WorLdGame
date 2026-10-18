import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { App } from "./App";
import { branchAuthoringFixture } from "./branch-authoring-fixture";
import { writePlaytestNotes } from "./playtest-notes";
import { routeReviewSourceHash } from "./route-review";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
it("generates the optional author package after save, and invalidates it when the option changes", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory()); vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:delivery"); const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  render(<App initialProject={branchAuthoringFixture()} />); await waitFor(() => expect(screen.getByRole("button", { name: "保存到本机" })).toBeEnabled());
  fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name: "发布" })); fireEvent.click(screen.getByRole("button", { name: "继续：导出方式 →" }));
  fireEvent.click(screen.getByLabelText("同时生成制作交付包")); fireEvent.click(screen.getByRole("button", { name: "继续：生成游戏 →" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "构建试玩 HTML" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "构建试玩 HTML" }));
  await screen.findByRole("link", { name: "下载制作交付包" }, { timeout: 10000 }); expect(screen.getByRole("link", { name: "下载游戏" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "← 导出方式" })); fireEvent.click(screen.getByLabelText("附带校订记录")); expect(screen.queryByRole("link", { name: "下载制作交付包" })).toBeNull(); expect(revoke).toHaveBeenCalled();
}, 15000);
it("offers an explicit review merge after restoring a delivery instead of overwriting local records", () => {
  const project = branchAuthoringFixture(), callback = vi.fn();
  const notes = writePlaytestNotes(project.manifest.projectId, [{ id: "note", sceneId: "entry", statementId: "intro", sceneTitle: "车站选择", excerpt: "雨声渐渐停下", sourceHash: routeReviewSourceHash(project), text: "校订这句", category: "text", status: "open", createdAt: 1, updatedAt: 1, checkedSourceHash: null }]);
  render(<App initialProject={project} initialDeliveryReview={notes} onDeliveryReviewConsumed={callback} />);
  fireEvent.click(screen.getByRole("button", { name: "合并校订记录" })); expect(callback).toHaveBeenCalledOnce(); expect(screen.getByRole("region", { name: "试玩校订清单" })).toHaveTextContent("校订这句");
  expect(screen.queryByRole("region", { name: "交付包校订记录" })).toBeNull();
});
it("keeps an existing conflicting record until the creator chooses to retain it", () => {
  const project = branchAuthoringFixture(), callback = vi.fn();
  const note = { id: "note", sceneId: "entry", statementId: "intro", sceneTitle: "车站选择", excerpt: "雨声渐渐停下", sourceHash: routeReviewSourceHash(project), text: "包内的校订意见", category: "text" as const, status: "open" as const, createdAt: 1, updatedAt: 1, checkedSourceHash: null };
  localStorage.setItem(`world-studio:playtest-notes:${project.manifest.projectId}`, writePlaytestNotes(project.manifest.projectId, [{ ...note, text: "本机后来修改的意见" }]));
  render(<App initialProject={project} initialDeliveryReview={writePlaytestNotes(project.manifest.projectId, [note])} onDeliveryReviewConsumed={callback} />);
  fireEvent.click(screen.getByRole("button", { name: "合并校订记录" })); expect(screen.getByRole("alert")).toHaveTextContent("不同版本"); expect(callback).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保留本机记录" })); expect(callback).toHaveBeenCalledOnce();
  fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name: "检查" })); expect(screen.getByText("本机后来修改的意见")).toBeVisible(); expect(screen.queryByText("包内的校订意见")).toBeNull();
});
it("waits for an active save and cancellation leaves no download links", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory()); vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:delivery");
  let finish: () => void = () => {}; const saving = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<App initialProject={branchAuthoringFixture()} onCanonicalProjectSave={saving} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "保存到本机" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "保存到本机" })); await waitFor(() => expect(saving).toHaveBeenCalledOnce());
  fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name: "发布" })); fireEvent.click(screen.getByRole("button", { name: "继续：导出方式 →" })); fireEvent.click(screen.getByLabelText("同时生成制作交付包")); fireEvent.click(screen.getByRole("button", { name: "继续：生成游戏 →" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "构建试玩 HTML" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "构建试玩 HTML" })); expect(saving).toHaveBeenCalledOnce(); expect(screen.queryByRole("link", { name: "下载游戏" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "取消本次构建" })); await act(async () => finish());
  expect(screen.queryByRole("link", { name: "下载制作交付包" })).toBeNull(); expect(screen.queryByRole("link", { name: "下载游戏" })).toBeNull();
}, 15000);

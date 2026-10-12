import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import media from "../../../fixtures/projects/media/media-golden.json";

afterEach(() => vi.unstubAllGlobals());

it("edits a resource without hand-copying its ID, preserves metadata on file selection, and supports asset undo/redo", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  render(<App autosaveDebounceMs={60_000} />);
  fireEvent.click(await screen.findByRole("button", { name: "打开资源保险库" }));
  const bytes = Uint8Array.from(atob(media.assets[0]!.base64), (c) => c.charCodeAt(0));
  const picker = screen.getByLabelText("选择资源文件");
  await waitFor(() => expect(picker).toBeEnabled());
  fireEvent.change(picker, { target: { files: [new File([bytes], "sunset.png", { type: "image/png" })] } });
  fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));
  await screen.findByText("资源导入完成");
  const list = screen.getByLabelText("已导入资源");
  fireEvent.click(within(list).getByRole("button", { name: "编辑资源：sunset" }));
  expect(screen.getByLabelText("资源 Asset ID")).toBeDisabled();
  fireEvent.click(screen.getByText("文件信息与维护 · 1 项素材"));
  fireEvent.change(screen.getByLabelText("资源显示名称"), { target: { value: "海边夕照" } });
  fireEvent.click(screen.getByRole("button", { name: "仅保存资源名称" }));
  await waitFor(() => expect(within(list).getByText("海边夕照")).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "撤销最近资源更新" }));
  await waitFor(() => expect(within(list).getByText("sunset")).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "重做最近资源更新" }));
  await waitFor(() => expect(within(list).getByText("海边夕照")).toBeVisible());
  fireEvent.change(picker, { target: { files: [new File([bytes], "replacement.png", { type: "image/png" })] } });
  expect(screen.getByLabelText("资源 Asset ID")).toHaveValue("sunset");
  expect(screen.getByLabelText("资源显示名称")).toHaveValue("海边夕照");
});

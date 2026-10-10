import { fireEvent, render, screen, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

it("keeps author tasks reachable without changing Beginner or the selected story object", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  render(<App autosaveDebounceMs={60_000} />);
  await screen.findByRole("button", { name: "保存到本机" });
  fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
  const shell = screen.getByTestId("workspace-shell");
  const selected = shell.getAttribute("data-context-statement-id");
  const tasks = within(screen.getByRole("navigation", { name: "创作任务" }));
  fireEvent.click(tasks.getByRole("button", { name: "管理素材" }));
  const maintenance = screen.getByText("高级资源维护与优化").closest("details")!;
  expect(maintenance).not.toHaveAttribute("open");
  expect(screen.getByLabelText("选择资源文件")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "关闭资源保险库" }));
  for (const [task, mode] of [["查看分支走向", "flow"], ["检查与修复问题", "debug-qa"], ["继续写作", "writer"]] as const) {
    fireEvent.click(tasks.getByRole("button", { name: task }));
    expect(shell).toHaveAttribute("data-workspace-mode", mode);
    expect(shell).toHaveAttribute("data-context-statement-id", selected);
    expect(shell).toHaveAttribute("data-experience-level", "beginner");
  }
  fireEvent.click(tasks.getByRole("button", { name: "编辑脚本" }));
  expect(shell).toHaveAttribute("data-editor-view", "script");
  const script = screen.getByLabelText("权威脚本编辑器");
  const source = (script as HTMLTextAreaElement).value;
  fireEvent.click(tasks.getByRole("button", { name: "继续写作" }));
  fireEvent.click(tasks.getByRole("button", { name: "编辑脚本" }));
  expect(screen.getByLabelText("权威脚本编辑器")).toHaveValue(source);
});

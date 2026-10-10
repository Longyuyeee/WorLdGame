import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { createProjectTemplate, type CanonicalProject } from "@world-studio/project-domain";
import { DebugQaWorkspace } from "./DebugQaWorkspace";

afterEach(() => vi.unstubAllGlobals());

it.each(["pro", "beginner"])("keeps a cross-scene error visible and repairable in %s", async (level) => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  render(<App autosaveDebounceMs={60_000} />);
  fireEvent.click(await screen.findByRole("tab", { name: "Script" }));
  if (level === "beginner") fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
  const source = (screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value;
  const broken = source.replace('scene "放学后的校门"', 'scene "放学后的校门');
  fireEvent.change(screen.getByLabelText("权威脚本编辑器"), { target: { value: broken } });
  fireEvent.blur(screen.getByLabelText("权威脚本编辑器"));
  await waitFor(() => expect(screen.getByRole("button", { name: "丢弃草稿" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /旧广播室/ }));
  expect(screen.getByRole("button", { name: "试玩完整流程" })).toBeDisabled();
  fireEvent.click(screen.getByText("构建与导出").closest("summary")!);
  expect(screen.getByRole("button", { name: "构建试玩 HTML" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "构建目录 ZIP" })).toBeDisabled();
  const alert = screen.getByRole("region", { name: "待修复脚本草稿" });
  expect(alert).toHaveTextContent("放学后的校门");
  fireEvent.click(level === "beginner" ? screen.getByRole("button", { name: "检查与修复问题" }) : screen.getByRole("radio", { name: "Debug & QA" }));
  expect(screen.getByRole("button", { name: "从入口启动调试" })).toBeDisabled();
  fireEvent.click(within(screen.getByRole("region", { name: "待修复脚本草稿" })).getByRole("button", { name: "修复草稿：放学后的校门" }));
  expect(screen.getByLabelText("权威脚本编辑器")).toHaveValue(broken);
  fireEvent.change(screen.getByLabelText("权威脚本编辑器"), { target: { value: source + "\n// 修复后继续创作\n" } });
  fireEvent.blur(screen.getByLabelText("权威脚本编辑器"));
  await waitFor(() => expect(screen.queryByRole("region", { name: "待修复脚本草稿" })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.getByLabelText("权威脚本编辑器")).toHaveValue(source);
  fireEvent.click(screen.getByRole("button", { name: "重做" }));
  expect(screen.getByLabelText("权威脚本编辑器")).toHaveValue(source + "\n// 修复后继续创作\n");
  fireEvent.click(level === "beginner" ? screen.getByRole("button", { name: "检查与修复问题" }) : screen.getByRole("radio", { name: "Debug & QA" }));
  expect(screen.getByRole("button", { name: "从入口启动调试" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "从入口启动调试" }));
  expect(screen.getByTestId("debugger-current-source")).toHaveTextContent("scn_school_gate");
});

it("maps a runtime failure to its failing statement instead of the rolled-back presentation cursor", () => {
  const base = createProjectTemplate("运行错误修复", "repair-runtime");
  const sceneId = base.manifest.entrySceneId;
  const project: CanonicalProject = { ...base,
    variables: { schemaVersion: 1, variables: [{ id: "trust", type: "number", scope: "story", defaultValue: 0 }] },
    scripts: { ...base.scripts, [sceneId]: { schemaVersion: 1, sceneId, statements: [
      { id: "before_fault", textId: "text_before_fault", kind: "narration", text: "下一步将触发错误" },
      { id: "fault", kind: "set", variable: "trust", expression: "1 / 0" },
      { id: "finish", kind: "end", endingName: "完成" }
    ] } }
  };
  const open = vi.fn();
  render(<DebugQaWorkspace project={project} diagnostics={{}} selectedSceneId={sceneId} selectedStatementId="before_fault" onProjectChange={vi.fn()} onOpenSource={open} />);
  fireEvent.click(screen.getByRole("button", { name: "从入口启动调试" }));
  fireEvent.click(screen.getByRole("button", { name: "单步前进" }));
  expect(screen.getByTestId("debugger-stop-reason")).toHaveAttribute("data-kind", "error");
  fireEvent.click(screen.getByRole("button", { name: "修复运行错误" }));
  expect(open).toHaveBeenCalledWith(sceneId, "fault");
});

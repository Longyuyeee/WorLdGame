import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { loadProject, migrateS0Project, saveProject, exportProjectZip, type S0Project } from "@world-studio/project-domain";
import source from "../../../fixtures/projects/branching/project.s0.json";
import { StudioLauncher } from "./studio-launcher";

afterEach(() => vi.unstubAllGlobals());
async function ready() {
  await waitFor(() => expect(document.querySelector<HTMLButtonElement>(".local-save-button")?.disabled).toBe(false), { timeout: 5000 });
}
function archive(prompt: string) {
  const project = loadProject(migrateS0Project(source as S0Project).files), script = project.scripts.branch_start!;
  const updated = { ...project, scripts: { ...project.scripts, branch_start: { ...script, statements: script.statements.map(item => item.kind === "choice" ? { ...item, prompt } : item) } } };
  const bytes = exportProjectZip(saveProject(updated)), file = new File([bytes as Uint8Array<ArrayBuffer>], "project.zip", { type: "application/zip" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return file;
}
it("explicitly reimporting the same work uses new ZIP text while ordinary recent reopen resumes the saved text", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  render(<StudioLauncher />);
  fireEvent.change(screen.getByLabelText("导入工程 ZIP"), { target: { files: [archive("Original imported prompt")] } });
  await ready();
  fireEvent.click(screen.getByRole("tab", { name: "Script" }));
  expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain("Original imported prompt");
  fireEvent.click(screen.getByLabelText("项目菜单")); fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
  await screen.findByLabelText("导入工程 ZIP");
  fireEvent.change(screen.getByLabelText("导入工程 ZIP"), { target: { files: [archive("Fresh imported prompt")] } });
  await ready();
  fireEvent.click(screen.getByRole("tab", { name: "Script" }));
  expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain("Fresh imported prompt");
  expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).not.toContain("Original imported prompt");
  fireEvent.click(screen.getByLabelText("项目菜单")); fireEvent.click(screen.getByRole("button", { name: /所有项目/ }));
  await screen.findByLabelText("导入工程 ZIP");
  fireEvent.click(screen.getAllByRole("button", { name: /Branching Golden/ })[0]!);
  await ready();
  fireEvent.click(screen.getByRole("tab", { name: "Script" }));
  expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain("Fresh imported prompt");
}, 15000);

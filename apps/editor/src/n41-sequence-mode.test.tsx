import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileProject } from "@world-studio/project-compiler";
import { loadProject } from "@world-studio/project-persistence";
import type { StoryProject } from "@world-studio/story-core";
import { buildRouteGraph } from "@world-studio/route-graph";
import { App } from "./App";
import { projectCanonicalForEditor, projectCanonicalFromStory, projectCanonicalWithStory } from "./canonical-project-adapter";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";
import { restoreStudioSession } from "./studio-session";

afterEach(() => vi.unstubAllGlobals());

const sequenceStory: StoryProject = {
  schemaVersion: 0,
  id: "n41-sequence-mode",
  title: "N41 Sequence Mode",
  entrySceneId: "sequence_scene",
  characters: [],
  scenes: [{
    id: "sequence_scene",
    title: "Sequence Scene",
    statements: [
      { id: "sequence_intro", kind: "narration", textId: "sequence_intro_text", text: "Start" },
      { id: "sequence_end", kind: "end", endingName: "Done" }
    ]
  }]
};

describe("N41 formal Sequence mode", () => {
  it("persists a typed label structure through Sequence, Script, Compiler, Route, and reopen", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const project = projectCanonicalFromStory(sequenceStory, "n41-sequence-mode-project");
    const onProjectSave = vi.fn<(story: StoryProject) => Promise<void>>(async () => undefined);
    const view = render(<App initialProject={project} onProjectSave={onProjectSave} />);

    expect(await screen.findByRole("tab", { name: "Sequence" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Writer" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "保存到本机" })).toBeEnabled());

    const tools = within(screen.getByLabelText("对白结构工具"));
    fireEvent.change(tools.getByLabelText("插入 P0 语句类型"), { target: { value: "label" } });
    fireEvent.click(tools.getByRole("button", { name: "＋ 插入" }));
    const inspector = screen.getByRole("form", { name: "标签类型化参数" });
    fireEvent.change(within(inspector).getByLabelText("标签稳定名"), { target: { value: "chapter_gate" } });
    fireEvent.submit(inspector);

    const labelCard = screen.getByRole("button", { name: "选择标签：chapter_gate" });
    expect(labelCard).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const source = String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value);
    const labelLine = source.split(/\r?\n/u).find((line) => line.startsWith("label chapter_gate "));
    expect(labelLine).toMatch(/^label chapter_gate @id\((stmt_ui_[A-Za-z0-9_-]+)\)$/u);
    const statementId = labelLine!.match(/@id\(([^)]+)\)/u)![1]!;

    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));
    expect(screen.getByRole("button", { name: "选择标签：chapter_gate" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    await waitFor(() => expect(onProjectSave).toHaveBeenCalledTimes(1));

    const snapshot = await loadProject(new IndexedDbProjectFileStore(indexedDb, project.manifest.projectId));
    expect(snapshot).not.toBeNull();
    const reopenedStory = restoreStudioSession(snapshot!, projectCanonicalForEditor(project).project).project;
    expect(reopenedStory.scenes[0]?.statements).toContainEqual({ id: statementId, kind: "label", name: "chapter_gate" });
    const reopenedCanonical = projectCanonicalWithStory(project, reopenedStory);
    expect(compileProject(reopenedCanonical).ok).toBe(true);
    expect(buildRouteGraph(reopenedCanonical).nodes[0]?.facts).toContainEqual(expect.objectContaining({ id: statementId, kind: "label", label: "chapter_gate" }));

    view.unmount();
    render(<App initialProject={reopenedCanonical} />);
    expect(await screen.findByRole("tab", { name: "Sequence" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("button", { name: "选择标签：chapter_gate" })).toBeVisible();
  });
});

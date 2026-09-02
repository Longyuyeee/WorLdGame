import { fireEvent, render, screen, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoryProject } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { App } from "./App";

const watchStory: StoryProject = {
  schemaVersion: 0,
  id: "prj_debugger_watch",
  title: "Debugger Watch",
  entrySceneId: "scn_watch",
  characters: [],
  variables: [{ id: "score", name: "Score", type: "number", defaultValue: 0, scope: "story" }],
  scenes: [{
    id: "scn_watch",
    title: "Watch Scene",
    statements: [
      { id: "stmt_watch_stage", kind: "direction", command: "background", summary: "action=clear" },
      { id: "stmt_score_set", kind: "set", variable: "score", expression: "score + 1" },
      { id: "stmt_score_visible", kind: "narration", textId: "txt_score_visible", text: "Score changed" },
      { id: "stmt_watch_end", kind: "end", endingName: "Done" }
    ]
  }]
};

afterEach(() => vi.unstubAllGlobals());

describe("N60-E3 debugger Watch real creator path", () => {
  it("evaluates a typed expression and shows its stable source and observable change", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const project = projectCanonicalFromStory(watchStory, "n60-e3-watch-app");
    render(<App initialProject={project} autosaveDebounceMs={60_000} />);

    fireEvent.click(await screen.findByRole("radio", { name: "Debug & QA" }));
    fireEvent.click(screen.getByRole("button", { name: "从入口启动调试" }));

    const input = screen.getByRole("textbox", { name: "Watch 表达式" });
    fireEvent.change(input, { target: { value: "score + 1" } });
    fireEvent.click(screen.getByRole("button", { name: "添加 Watch" }));

    const list = screen.getByRole("list", { name: "Watch 列表" });
    expect(within(list).getByText("score + 1")).toBeVisible();
    expect(within(list).getByText("1")).toBeVisible();
    expect(within(list).getByText("number")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "单步前进" }));
    expect(within(list).getByText("2")).toBeVisible();
    expect(within(list).getByText("0 → 1", { exact: false })).toBeVisible();
    expect(within(list).getByText("scn_watch / stmt_score_set", { exact: false })).toBeVisible();

    fireEvent.change(input, { target: { value: "missing + 1" } });
    fireEvent.click(screen.getByRole("button", { name: "添加 Watch" }));
    expect(within(list).getByText("Unknown variable: missing", { exact: false })).toBeVisible();
    expect(screen.getByTestId("debugger-session")).toHaveAttribute("data-status", "presenting");

    fireEvent.click(within(list).getByRole("button", { name: "移除 Watch score + 1" }));
    expect(within(list).queryByText("score + 1")).not.toBeInTheDocument();
  });
});

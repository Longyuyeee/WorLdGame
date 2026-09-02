import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoryProject } from "@world-studio/story-core";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

function storyQaGoldenProject(): StoryProject {
  return {
    schemaVersion: 0,
    id: "n60-story-qa-golden",
    title: "N60 Story QA Golden",
    entrySceneId: "qa_entry",
    characters: [],
    scenes: [
      {
        id: "qa_entry",
        title: "QA Entry",
        statements: [
          { id: "qa_missing_asset", kind: "direction", command: "background", summary: "action=set asset=missing_qa_background" },
          {
            id: "qa_routes",
            kind: "choice",
            prompt: "Choose a broken route",
            options: [
              { id: "to_no_exit", label: "No exit", targetSceneId: "qa_no_exit" },
              { id: "to_dangling", label: "Dangling", targetSceneId: "qa_dangling" },
              { id: "to_loop", label: "Loop", targetSceneId: "qa_loop" }
            ]
          }
        ]
      },
      { id: "qa_no_exit", title: "No Exit", statements: [{ id: "qa_no_exit_line", kind: "narration", textId: "qa_no_exit_text", text: "This route never exits." }] },
      { id: "qa_dangling", title: "Dangling Reference", statements: [{ id: "qa_missing_label", kind: "jump", targetLabel: "missing_label" }] },
      { id: "qa_loop", title: "Closed Loop", statements: [
        { id: "qa_loop_label", kind: "label", name: "loop" },
        { id: "qa_loop_jump", kind: "jump", targetLabel: "loop" }
      ] },
      { id: "qa_orphan", title: "Unreachable Ending", statements: [{ id: "qa_orphan_end", kind: "end", endingName: "Never Reached" }] }
    ]
  };
}

describe("N60-E4 P0 Story QA product closure", () => {
  it("classifies all five P0 story risks, filters them, and returns to the stable source", async () => {
    const project = projectCanonicalFromStory(storyQaGoldenProject(), "n60-e4-story-qa-golden");
    render(<App initialProject={project} autosaveDebounceMs={60_000} />);

    fireEvent.click(screen.getByRole("radio", { name: "Debug & QA" }));
    fireEvent.click(screen.getByRole("button", { name: "运行正式 QA 检查" }));

    const coverage = await screen.findByRole("region", { name: "P0 Story QA 分类" });
    for (const category of ["可达性", "出口", "引用完整性", "资源", "循环"]) {
      expect(within(coverage).getByRole("button", { name: new RegExp(`^${category} · [1-9]`) })).toBeVisible();
    }
    for (const code of ["UNREACHABLE_SCENE", "SCENE_NO_EXIT", "MISSING_LABEL", "MISSING_ASSET", "NON_INTERACTIVE_LOOP"]) {
      expect(screen.getAllByText(code).length).toBeGreaterThan(0);
    }

    fireEvent.click(within(coverage).getByRole("button", { name: /^资源 · [1-9]/ }));
    expect(screen.getByText("MISSING_ASSET")).toBeVisible();
    expect(screen.queryByText("NON_INTERACTIVE_LOOP")).not.toBeInTheDocument();

    const resourceFinding = screen.getByText("MISSING_ASSET").closest("li");
    expect(resourceFinding).not.toBeNull();
    fireEvent.click(within(resourceFinding!).getByRole("button", { name: "定位并修复" }));
    expect(screen.getByRole("radio", { name: "Writer" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "qa_missing_asset");
  }, 30_000);
});

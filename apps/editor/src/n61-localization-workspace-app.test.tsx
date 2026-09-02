import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { StoryProject } from "@world-studio/story-core";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

function localizationGoldenProject(): StoryProject {
  return {
    schemaVersion: 0,
    id: "n61-localization-golden",
    title: "N61 Localization Golden",
    entrySceneId: "scene_entry",
    characters: [{ id: "character_guide", displayName: "Guide", color: "#ffffff" }],
    scenes: [{
      id: "scene_entry",
      title: "Entry",
      statements: [
        { id: "statement_hello", kind: "dialogue", speakerId: "character_guide", textId: "text_hello", text: "欢迎回来。" },
        { id: "statement_hint", kind: "narration", textId: "text_hint", text: "雨还在下。" },
        {
          id: "statement_route",
          kind: "choice",
          prompt: "要去哪里？",
          options: [
            { id: "option_station", label: "车站", targetSceneId: "scene_entry" },
            { id: "option_home", label: "回家", targetSceneId: "scene_entry" }
          ]
        }
      ]
    }]
  };
}

describe("N61-E1 Localization production path", () => {
  it("creates a target locale, persists a reviewed translation, and detects changed source text", () => {
    const project = projectCanonicalFromStory(localizationGoldenProject(), "n61-e1-localization-golden");
    let changedProject: CanonicalProject | undefined;
    const first = render(<App initialProject={project} autosaveDebounceMs={60_000} onCanonicalProjectChange={(changed) => { changedProject = changed; }} />);

    fireEvent.click(screen.getByRole("radio", { name: "Production" }));
    const localization = screen.getByRole("region", { name: "本地化生产" });
    expect(within(localization).getByText("5 个稳定文本键")).toBeVisible();
    fireEvent.change(within(localization).getByRole("textbox", { name: "源语言" }), { target: { value: "zh-Hans" } });
    fireEvent.change(within(localization).getByRole("textbox", { name: "新目标语言" }), { target: { value: "not a locale" } });
    fireEvent.click(within(localization).getByRole("button", { name: "添加目标语言" }));
    expect(within(localization).getByRole("status")).toHaveTextContent("语言代码无效");
    fireEvent.change(within(localization).getByRole("textbox", { name: "新目标语言" }), { target: { value: "en" } });
    fireEvent.click(within(localization).getByRole("button", { name: "添加目标语言" }));

    const helloRow = within(localization).getByText("text_hello").closest("tr");
    expect(helloRow).not.toBeNull();
    expect(within(helloRow!).getByText("缺失")).toBeVisible();
    fireEvent.change(within(helloRow!).getByRole("textbox", { name: "text_hello 的 en 翻译" }), { target: { value: "Welcome back." } });
    fireEvent.change(within(helloRow!).getByRole("combobox", { name: "text_hello 的状态" }), { target: { value: "reviewed" } });
    expect(helloRow!.querySelector('[data-status="reviewed"]')).toHaveTextContent("已审阅");
    expect(changedProject?.manifest.defaultLocale).toBe("zh-Hans");

    first.unmount();
    const changedSource: CanonicalProject = {
      ...changedProject!,
      scripts: {
        ...changedProject!.scripts,
        scene_entry: {
          ...changedProject!.scripts.scene_entry!,
          statements: changedProject!.scripts.scene_entry!.statements.map((statement) => statement.id === "statement_hello"
            ? { ...statement, text: "欢迎再次回来。" }
            : statement)
        }
      }
    };
    render(<App initialProject={changedSource} autosaveDebounceMs={60_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Production" }));
    const reopened = screen.getByRole("region", { name: "本地化生产" });
    expect(within(reopened).getByDisplayValue("Welcome back.")).toBeVisible();
    const reopenedHelloRow = within(reopened).getByText("text_hello").closest("tr");
    expect(reopenedHelloRow).not.toBeNull();
    expect(within(reopenedHelloRow!).getByText("已过期")).toBeVisible();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";

const LOCALE_KEY = "world-player.locale.golden_branching";

function localizedBranching(): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/branching/project.s0.json"), "utf8")) as S0Project;
  const project = loadProject(migrateS0Project(source).files);
  return {
    ...project,
    manifest: { ...project.manifest, defaultLocale: "en" },
    localization: {
      schemaVersion: 1,
      locales: [{
        id: "locale_zh_hans",
        locale: "zh-Hans",
        sourceLocale: "en",
        entries: [
          { key: "branch_prompt", sourceText: "Choose a route", translation: "选择路线", status: "reviewed" },
          { key: "branch_left_option", sourceText: "Left", translation: "左侧", status: "reviewed" },
          { key: "branch_left_text", sourceText: "The quiet route.", translation: "安静的路线。", status: "reviewed" }
        ]
      }]
    }
  };
}

afterEach(() => {
  localStorage.removeItem(LOCALE_KEY);
});

describe("N61-E3 Player localization path", () => {
  it("switches the formal Player projection, explains fallback, and keeps the locale after reopen", () => {
    const project = localizedBranching();
    const first = render(<PlayerShell project={project} />);

    expect(screen.getByRole("combobox", { name: "显示语言" })).toHaveValue("en");
    fireEvent.change(screen.getByRole("combobox", { name: "显示语言" }), { target: { value: "zh-Hans" } });
    expect(screen.getByRole("status", { name: "语言状态" })).toHaveTextContent("缺失译文继续显示 en 原文");
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByRole("group", { name: "选择路线" })).toBeVisible();
    expect(screen.getByRole("button", { name: /左侧/u })).toBeVisible();
    expect(screen.getByRole("button", { name: /Right/u })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /左侧/u }));
    expect(screen.getByText("安静的路线。")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "显示语言" }), { target: { value: "en" } });
    expect(screen.getByText("The quiet route.")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "显示语言" }), { target: { value: "zh-Hans" } });
    expect(screen.getByText("安静的路线。")).toBeVisible();

    first.unmount();
    render(<PlayerShell project={project} />);
    expect(screen.getByRole("combobox", { name: "显示语言" })).toHaveValue("zh-Hans");
  });
});

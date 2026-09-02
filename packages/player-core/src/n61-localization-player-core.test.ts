import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import {
  configurePlayerCoreLocaleV1,
  createPlayerCore,
  createPlayerCoreSnapshotV1,
  selectPlayerCoreChoice,
  startPlayerCore
} from "./player-core";

function localizedBranching(staleDialogue = false): CanonicalProject {
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
          { key: "branch_left_text", sourceText: staleDialogue ? "Old source" : "The quiet route.", translation: "安静的路线。", status: "reviewed" }
        ]
      }]
    }
  };
}

describe("N61-E3 formal Player Core localization projection", () => {
  it("projects Compiler catalogs without changing Runtime state and falls back stale or missing entries", () => {
    const project = localizedBranching();
    const sourceChoice = startPlayerCore(createPlayerCore(project), project);
    const localizedChoice = startPlayerCore(configurePlayerCoreLocaleV1(createPlayerCore(project), "zh-Hans"), project);
    const choiceSnapshot = createPlayerCoreSnapshotV1(localizedChoice);

    expect(choiceSnapshot.localization).toEqual({
      sourceLocale: "en",
      selectedLocale: "zh-Hans",
      availableLocales: ["en", "zh-Hans"],
      missingTranslationCount: 4,
      fallbackUsed: true
    });
    expect(choiceSnapshot.presentation).toEqual({
      kind: "choice",
      prompt: "选择路线",
      options: [{ optionId: "branch_left_option", label: "左侧" }, { optionId: "branch_right_option", label: "Right" }]
    });
    expect(choiceSnapshot.runtimeStateHash).toBe(createPlayerCoreSnapshotV1(sourceChoice).runtimeStateHash);

    const line = selectPlayerCoreChoice(localizedChoice, "branch_left_option");
    const lineSnapshot = createPlayerCoreSnapshotV1(line);
    expect(lineSnapshot.presentation).toMatchObject({ kind: "dialogue", text: "安静的路线。" });
    const historyLabels = lineSnapshot.history?.activeEntries.map((entry) => entry.event.kind === "choice" ? entry.event.prompt : entry.event.kind === "dialogue" ? entry.event.text : "");
    expect(historyLabels?.[0]).toBe("选择路线");
    expect(historyLabels?.[1]).toBe("安静的路线。");

    const staleProject = localizedBranching(true);
    const staleLine = selectPlayerCoreChoice(startPlayerCore(configurePlayerCoreLocaleV1(createPlayerCore(staleProject), "zh-Hans"), staleProject), "branch_left_option");
    expect(createPlayerCoreSnapshotV1(staleLine)).toMatchObject({
      localization: { fallbackUsed: true },
      presentation: { kind: "dialogue", text: "The quiet route." }
    });
  });
});

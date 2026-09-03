import { describe, expect, it } from "vitest";
import type { StoryProject } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { addLocalizationTarget, updateLocalizationTranslation } from "./localization-production";
import {
  encodeLocalizationCsv,
  localizationExchangeMatrix,
  parseLocalizationCsv,
  previewLocalizationImport
} from "./localization-exchange";
import { encodeLocalizationXlsx, parseLocalizationXlsx } from "./localization-xlsx";

function exchangeProject() {
  const story: StoryProject = {
    schemaVersion: 0,
    id: "localization-exchange-round-trip",
    title: "Localization Exchange",
    entrySceneId: "scene_entry",
    characters: [{ id: "guide", displayName: "Guide", color: "#ffffff" }],
    scenes: [{
      id: "scene_entry",
      title: "Entry",
      statements: [{ id: "statement_hello", kind: "dialogue", speakerId: "guide", textId: "text_hello", text: "欢迎，\"旅人\"。" }]
    }]
  };
  const project = addLocalizationTarget(projectCanonicalFromStory(story, "exchange-round-trip"), "zh-Hans", "en");
  return updateLocalizationTranslation(project, "en", "text_hello", "Welcome, traveler.\nCome in.", "reviewed");
}

describe("N61-E2 localization exchange formats", () => {
  it("preserves commas, quotes and line breaks through real CSV and XLSX round trips", () => {
    const project = exchangeProject();
    const matrix = localizationExchangeMatrix(project, "en");
    const csvMatrix = parseLocalizationCsv(encodeLocalizationCsv(matrix));
    const xlsxMatrix = parseLocalizationXlsx(encodeLocalizationXlsx(matrix));

    expect(csvMatrix).toEqual(matrix);
    expect(xlsxMatrix).toEqual(matrix);
    expect(previewLocalizationImport(project, "en", "translations.csv", csvMatrix)).toMatchObject({
      changes: [], unchangedCount: 1, errors: []
    });
  });
});

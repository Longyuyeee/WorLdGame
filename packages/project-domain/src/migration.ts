import { createGalSettingsDocument } from "@world-studio/gal-settings";
import { loadProject, saveProject } from "./codec";
import type { JsonObject, ProjectFiles } from "./types";

export interface S0Project {
  readonly schemaVersion: 0;
  readonly id: string;
  readonly title: string;
  readonly entrySceneId: string;
  readonly characters: readonly JsonObject[];
  readonly scenes: readonly { readonly id: string; readonly title: string; readonly statements: readonly JsonObject[] }[];
}

export interface S0MigrationResult { readonly status: "migrated" | "already-current"; readonly files: ProjectFiles; }
const baseDocuments = {
  "domain/variables.json": { schemaVersion: 1, variables: [] },
  "domain/assets.json": { schemaVersion: 1, assets: [] },
  "localization/catalog.json": { schemaVersion: 1, locales: [] },
  "settings/project.json": createGalSettingsDocument(),
  "ui/screens.json": { schemaVersion: 1, screens: [] },
  "plugins/plugins.json": { schemaVersion: 1, plugins: [] },
  "tests/routes.json": { schemaVersion: 1, routes: [] }
} as const;

export function migrateS0Project(input: S0Project | ProjectFiles): S0MigrationResult {
  if ((input as { schemaVersion?: unknown }).schemaVersion !== 0) {
    const current = loadProject(input as ProjectFiles);
    return { status: "already-current", files: saveProject(current) };
  }
  const source = input as S0Project;
  const chapterId = "chapter_main";
  const chapterPath = `chapters/${chapterId}.json`;
  const files: Record<string, string> = {};
  const write = (path: string, value: unknown) => { files[path] = `${JSON.stringify(value, null, 2)}\n`; };
  write("world.project.json", { schemaVersion: 1, fileVersion: "1.0.0", projectId: source.id, title: source.title, defaultLocale: "und", entrySceneId: source.entrySceneId, chapterPaths: [chapterPath], charactersPath: "domain/characters.json", variablesPath: "domain/variables.json", assetsPath: "domain/assets.json", localizationPath: "localization/catalog.json", settingsPath: "settings/project.json", uiPath: "ui/screens.json", pluginsPath: "plugins/plugins.json", testRoutesPath: "tests/routes.json", migratedFrom: "s0/story-project-v0" });
  write(chapterPath, { schemaVersion: 1, id: chapterId, title: "Main", scenePaths: source.scenes.map((scene) => `scenes/${scene.id}.json`) });
  write("domain/characters.json", { schemaVersion: 1, characters: source.characters });
  for (const [path, value] of Object.entries(baseDocuments)) write(path, value);
  for (const scene of source.scenes) {
    const scriptPath = `scripts/${scene.id}.json`; const layoutPath = `layouts/${scene.id}.json`;
    write(`scenes/${scene.id}.json`, { schemaVersion: 1, id: scene.id, title: scene.title, scriptPath, layoutPath });
    write(scriptPath, { schemaVersion: 1, sceneId: scene.id, statements: scene.statements });
    write(layoutPath, { schemaVersion: 1, sceneId: scene.id, nodes: [] });
  }
  return { status: "migrated", files: saveProject(loadProject(files)) };
}

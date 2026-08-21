export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject { readonly [key: string]: JsonValue; }
export type StableId = string;
export type ProjectFiles = Readonly<Record<string, string>>;

export interface ProjectManifest {
  readonly schemaVersion: 1;
  readonly fileVersion: "1.0.0";
  readonly projectId: StableId;
  readonly title: string;
  readonly defaultLocale: string;
  readonly entrySceneId: StableId;
  readonly chapterPaths: readonly string[];
  readonly charactersPath: string;
  readonly variablesPath: string;
  readonly assetsPath: string;
  readonly localizationPath: string;
  readonly settingsPath: string;
  readonly uiPath: string;
  readonly pluginsPath: string;
  readonly testRoutesPath: string;
  readonly preservedFields?: JsonObject;
}

export interface ChapterDocument { readonly schemaVersion: 1; readonly id: StableId; readonly title: string; readonly scenePaths: readonly string[]; readonly preservedFields?: JsonObject; }
export interface SceneDocument { readonly schemaVersion: 1; readonly id: StableId; readonly title: string; readonly scriptPath: string; readonly layoutPath: string; readonly preservedFields?: JsonObject; }
export interface CharacterDocument { readonly schemaVersion: 1; readonly characters: readonly JsonObject[]; readonly preservedFields?: JsonObject; }
export interface VariableDocument { readonly schemaVersion: 1; readonly variables: readonly JsonObject[]; readonly preservedFields?: JsonObject; }
export interface AssetDocument { readonly schemaVersion: 1; readonly assets: readonly JsonObject[]; readonly preservedFields?: JsonObject; }
export interface LocalizationDocument { readonly schemaVersion: 1; readonly locales: readonly JsonObject[]; readonly preservedFields?: JsonObject; }
export interface SettingsDocument { readonly schemaVersion: 1; readonly values: JsonObject; readonly preservedFields?: JsonObject; }
export interface UiDocument { readonly schemaVersion: 1; readonly screens: readonly JsonObject[]; readonly preservedFields?: JsonObject; }
export interface PluginDocument { readonly schemaVersion: 1; readonly plugins: readonly JsonObject[]; readonly preservedFields?: JsonObject; }
export interface TestRouteDocument { readonly schemaVersion: 1; readonly routes: readonly JsonObject[]; readonly preservedFields?: JsonObject; }
export interface ScriptDocument { readonly schemaVersion: 1; readonly sceneId: StableId; readonly statements: readonly JsonObject[]; readonly preservedFields?: JsonObject; }
export interface LayoutNodePosition { readonly nodeId: StableId; readonly x: number; readonly y: number; }
export interface LayoutDocument { readonly schemaVersion: 1; readonly sceneId: StableId; readonly nodes: readonly LayoutNodePosition[]; readonly preservedFields?: JsonObject; }

export interface CanonicalProject {
  readonly mode: "editable";
  readonly manifest: ProjectManifest;
  readonly chapters: readonly ChapterDocument[];
  readonly scenes: readonly SceneDocument[];
  readonly characters: CharacterDocument;
  readonly variables: VariableDocument;
  readonly assets: AssetDocument;
  readonly localization: LocalizationDocument;
  readonly settings: SettingsDocument;
  readonly ui: UiDocument;
  readonly plugins: PluginDocument;
  readonly testRoutes: TestRouteDocument;
  readonly scripts: Readonly<Record<string, ScriptDocument>>;
  readonly layouts: Readonly<Record<string, LayoutDocument>>;
}

export type ProjectProbe =
  | { readonly status: "current"; readonly schemaVersion: 1; readonly projectId: string; readonly title: string }
  | { readonly status: "future-read-only"; readonly schemaVersion: number; readonly projectId?: string; readonly title?: string };

export class ProjectDomainError extends Error {
  constructor(readonly code: "INVALID_JSON" | "INVALID_SCHEMA" | "INVALID_ID" | "DUPLICATE_ID" | "MISSING_FILE" | "BROKEN_REFERENCE" | "FUTURE_SCHEMA", message: string) {
    super(message);
    this.name = "ProjectDomainError";
  }
}

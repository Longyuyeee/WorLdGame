import { resolveGalSettings, serializeGalSettingsDocument } from "@world-studio/gal-settings";
import { describe, expect, it } from "vitest";
import {
  createProjectService,
  createProjectTemplate,
  executeProjectCommand,
  loadProject,
  redoProject,
  saveProject,
  serializeCommittedRevision,
  undoProject
} from "./index";

const settingsPath = "settings/project.json";

describe("Canonical Project Gal settings", () => {
  it("loads missing and exact empty legacy settings as defaults, then writes the formal typed file", () => {
    const project = createProjectTemplate("Legacy", "018f08d8-71a1-7bc2-a627-2f4a843ee210");
    const current = saveProject(project);
    const { [settingsPath]: _, ...missing } = current;
    const legacy = { ...current, [settingsPath]: '{"schemaVersion":1,"values":{}}' };

    const missingLoaded = loadProject(missing);
    const legacyLoaded = loadProject(legacy);
    expect(resolveGalSettings(missingLoaded.settings, "windows").values).toEqual(resolveGalSettings(project.settings, "windows").values);
    expect(legacyLoaded.settings).toEqual(project.settings);
    expect(saveProject(missingLoaded)[settingsPath]).toBe(serializeGalSettingsDocument(project.settings));
    expect(saveProject(legacyLoaded)[settingsPath]).toBe(serializeGalSettingsDocument(project.settings));
  });

  it("upgrades a real non-empty v1 settings file once and preserves every override", () => {
    const files = { ...saveProject(createProjectTemplate("V1 migration", "018f08d8-71a1-7bc2-a627-2f4a843ee214")) };
    files[settingsPath] = JSON.stringify({
      schemaVersion: 1,
      project: { text: { fontScale: 1.25 }, audio: { voice: 0.6 } },
      platforms: {
        windows: {},
        web: { audio: { master: 0.5 } },
        android: { display: { designWidth: 1080, designHeight: 1920, orientation: "portrait" } }
      }
    });

    const migrated = loadProject(files);
    expect(migrated.settings.schemaVersion).toBe(5);
    expect(resolveGalSettings(migrated.settings, "web")).toMatchObject({
      values: { text: { fontScale: 1.25 }, audio: { master: 0.5, voice: 0.6 } },
      sources: { "text.fontScale": "project", "audio.master": "web", "audio.voice": "project" }
    });
    expect(resolveGalSettings(migrated.settings, "android").values.display.orientation).toBe("portrait");

    const firstSave = saveProject(migrated);
    expect(firstSave[settingsPath]).toContain('"schemaVersion": 5');
    expect(saveProject(loadProject(firstSave))).toEqual(firstSave);
  });

  it("fails closed for non-empty legacy, corrupt, and future settings without changing source bytes", () => {
    const files = saveProject(createProjectTemplate("Invalid", "018f08d8-71a1-7bc2-a627-2f4a843ee211"));
    const cases = [
      ['{"schemaVersion":1,"values":{"vendor":true}}', "INVALID_SCHEMA"],
      ["{oops", "INVALID_JSON"],
      ['{"schemaVersion":9,"project":{},"platforms":{}}', "FUTURE_SCHEMA"]
    ] as const;
    for (const [source, code] of cases) {
      const candidate = { ...files, [settingsPath]: source };
      expect(() => loadProject(candidate)).toThrowError(expect.objectContaining({ code }));
      expect(candidate[settingsPath]).toBe(source);
    }
  });

  it("commits an atomic settings ChangeSet and restores exact bytes through undo and redo", () => {
    const start = createProjectService(createProjectTemplate("Transaction", "018f08d8-71a1-7bc2-a627-2f4a843ee212"));
    const before = saveProject(start.project)[settingsPath];
    const committed = executeProjectCommand(start, {
      commandId: "command_settings_portrait",
      expectedRevision: 0,
      kind: "settings.edit",
      layer: { kind: "platform", platform: "android" },
      edits: [
        { type: "set", path: "display.designWidth", value: 1080 },
        { type: "set", path: "display.designHeight", value: 1920 },
        { type: "set", path: "display.orientation", value: "portrait" }
      ]
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const after = saveProject(committed.state.project)[settingsPath];
    expect(after).not.toBe(before);
    expect(committed.changeSet).toMatchObject({
      commandIds: ["command_settings_portrait"],
      baseRevision: 0,
      revision: 1,
      changedEntityIds: [start.project.manifest.projectId]
    });
    expect(resolveGalSettings(committed.state.project.settings, "android").values.display).toMatchObject({ designWidth: 1080, designHeight: 1920, orientation: "portrait" });

    const undone = undoProject(committed.state);
    expect(serializeCommittedRevision(undone, undone.revision)[settingsPath]).toBe(before);
    const redone = redoProject(undone);
    expect(serializeCommittedRevision(redone, redone.revision)[settingsPath]).toBe(after);
  });

  it("rejects stale, invalid, and no-op settings commands without mutating state", () => {
    const start = createProjectService(createProjectTemplate("Rejected", "018f08d8-71a1-7bc2-a627-2f4a843ee213"));
    const stale = executeProjectCommand(start, {
      commandId: "command_settings_stale",
      expectedRevision: 1,
      kind: "settings.edit",
      layer: { kind: "project" },
      edits: [{ type: "set", path: "audio.master", value: 0.5 }]
    });
    expect(stale).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });

    const invalid = executeProjectCommand(start, {
      commandId: "command_settings_invalid",
      expectedRevision: 0,
      kind: "settings.edit",
      layer: { kind: "project" },
      edits: [{ type: "set", path: "display.orientation", value: "portrait" }]
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_SETTINGS", path: "settings.project.display" } });

    const noChanges = executeProjectCommand(start, {
      commandId: "command_settings_noop",
      expectedRevision: 0,
      kind: "settings.edit",
      layer: { kind: "project" },
      edits: [{ type: "reset", path: "audio.master" }]
    });
    expect(noChanges).toMatchObject({ ok: false, error: { code: "NO_CHANGES" } });
    expect(stale.state).toBe(start);
    expect(invalid.state).toBe(start);
    expect(noChanges.state).toBe(start);
  });
});

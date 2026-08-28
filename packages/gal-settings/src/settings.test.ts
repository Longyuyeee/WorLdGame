import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAL_SETTINGS,
  GAL_SETTINGS_SCHEMA_VERSION,
  GalSettingsError,
  createGalSettingsDocument,
  parseGalSettingsDocument,
  parseSerializedGalSettingsDocument,
  resetPlatformSetting,
  resetProjectSetting,
  resolveGalSettings,
  serializeGalSettingsDocument,
  withPlatformSettings,
  withProjectSettings
} from "./settings";

describe("N51-E1 typed Gal settings", () => {
  it("resolves canonical defaults with source facts", () => {
    const resolved = resolveGalSettings(createGalSettingsDocument(), "windows");
    expect(resolved.values).toEqual(DEFAULT_GAL_SETTINGS);
    expect(new Set(Object.values(resolved.sources))).toEqual(new Set(["default"]));
    expect(resolved.sources["audio.voice"]).toBe("default");
  });

  it("applies default -> project -> platform precedence without platform semantic forks", () => {
    const project = withProjectSettings(createGalSettingsDocument(), {
      text: { charactersPerSecond: 42 },
      audio: { bgm: 0.55, voice: 0.9 }
    });
    const document = withPlatformSettings(project, "android", {
      display: { designWidth: 1080, designHeight: 1920, orientation: "portrait", quality: "balanced" },
      audio: { bgm: 0.4 },
      input: { keyboardAdvance: false }
    });

    const android = resolveGalSettings(document, "android");
    expect(android.values.text.charactersPerSecond).toBe(42);
    expect(android.values.audio).toMatchObject({ bgm: 0.4, voice: 0.9 });
    expect(android.values.display).toMatchObject({ designWidth: 1080, designHeight: 1920, orientation: "portrait" });
    expect(android.sources["audio.bgm"]).toBe("android");
    expect(android.sources["audio.voice"]).toBe("project");
    expect(android.sources["audio.sfx"]).toBe("default");

    const web = resolveGalSettings(document, "web");
    expect(web.values.display.orientation).toBe("landscape");
    expect(web.values.audio.bgm).toBe(0.55);
    expect(web.values.input.keyboardAdvance).toBe(true);
  });

  it("resets only the selected layer and reveals the inherited source", () => {
    const project = withProjectSettings(createGalSettingsDocument(), { audio: { voice: 0.75, ui: 0.65 } });
    const platform = withPlatformSettings(project, "web", { audio: { voice: 0.5 } });
    const resetPlatform = resetPlatformSetting(platform, "web", "audio.voice");
    expect(resolveGalSettings(resetPlatform, "web")).toMatchObject({
      values: { audio: { voice: 0.75 } },
      sources: { "audio.voice": "project" }
    });
    expect(resolveGalSettings(platform, "web").values.audio.voice).toBe(0.5);

    const resetProject = resetProjectSetting(resetPlatform, "audio.voice");
    expect(resolveGalSettings(resetProject, "web")).toMatchObject({
      values: { audio: { voice: 1 } },
      sources: { "audio.voice": "default" }
    });
    expect(resetProject.project.audio).toEqual({ ui: 0.65 });
  });

  it("serializes deterministically and round-trips all three profiles", () => {
    const left = parseGalSettingsDocument({
      platforms: { web: { audio: { ui: 0.7 } }, android: {}, windows: {} },
      project: { text: { fontScale: 1.25 }, audio: { master: 0.9 } },
      schemaVersion: 1
    });
    const right = parseGalSettingsDocument({
      schemaVersion: 2,
      project: { audio: { master: 0.9 }, text: { fontScale: 1.25 } },
      platforms: { windows: {}, android: {}, web: { audio: { ui: 0.7 } } }
    });
    const serialized = serializeGalSettingsDocument(left);
    expect(serialized).toBe(serializeGalSettingsDocument(right));
    expect(parseSerializedGalSettingsDocument(serialized)).toEqual(left);
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("migrates non-empty schema v1 settings through v2/v3/v4 to current v5 without changing resolved facts", () => {
    const migrated = parseGalSettingsDocument({
      schemaVersion: 1,
      project: { text: { fontScale: 1.25 }, audio: { master: 0.75, voice: 0.6 } },
      platforms: {
        windows: {},
        web: { audio: { master: 0.5 } },
        android: { display: { designWidth: 1080, designHeight: 1920, orientation: "portrait" } }
      }
    });

    expect(GAL_SETTINGS_SCHEMA_VERSION).toBe(5);
    expect(migrated.schemaVersion).toBe(5);
    expect(resolveGalSettings(migrated, "web")).toMatchObject({
      values: { text: { fontScale: 1.25 }, audio: { master: 0.5, voice: 0.6 } },
      sources: { "text.fontScale": "project", "audio.master": "web", "audio.voice": "project" }
    });
    expect(resolveGalSettings(migrated, "android").values.display).toMatchObject({
      designWidth: 1080,
      designHeight: 1920,
      orientation: "portrait"
    });

    const firstSave = serializeGalSettingsDocument(migrated);
    expect(firstSave).toContain('"schemaVersion": 5');
    expect(serializeGalSettingsDocument(parseSerializedGalSettingsDocument(firstSave))).toBe(firstSave);
  });

  it("resolves v3 text and accessibility overrides with exact platform sources", () => {
    const project = withProjectSettings(createGalSettingsDocument(), {
      text: { revealMode: "instant", lineHeight: 2, letterSpacingEm: 0.08 },
      accessibility: { highContrast: true, reduceMotion: true }
    });
    const configured = withPlatformSettings(project, "web", {
      accessibility: { reduceFlashing: true, reduceMotion: false }
    });
    const web = resolveGalSettings(configured, "web");

    expect(web.values).toMatchObject({
      text: { revealMode: "instant", lineHeight: 2, letterSpacingEm: 0.08 },
      accessibility: { highContrast: true, reduceMotion: false, reduceFlashing: true }
    });
    expect(web.sources).toMatchObject({
      "text.revealMode": "project",
      "text.lineHeight": "project",
      "accessibility.highContrast": "project",
      "accessibility.reduceMotion": "web",
      "accessibility.reduceFlashing": "web"
    });
  });

  it("resolves v4 stage and audio lifecycle defaults with exact platform sources", () => {
    const project = withProjectSettings(createGalSettingsDocument(), {
      stage: { defaultDurationMilliseconds: 720, defaultEasing: "ease-in-out" },
      audio: { resumeAfterInterruption: false }
    });
    const configured = withPlatformSettings(project, "web", {
      stage: { defaultDurationMilliseconds: 480 }
    });
    expect(resolveGalSettings(configured, "web")).toMatchObject({
      values: {
        stage: { defaultDurationMilliseconds: 480, defaultEasing: "ease-in-out" },
        audio: { resumeAfterInterruption: false }
      },
      sources: {
        "stage.defaultDurationMilliseconds": "web",
        "stage.defaultEasing": "project",
        "audio.resumeAfterInterruption": "project"
      }
    });
  });

  it("resolves v5 Choice and UI presentation policies with exact platform sources", () => {
    const project = withProjectSettings(createGalSettingsDocument(), {
      choice: { showOptionNumbers: false, layout: "responsive-grid" },
      ui: { defaultTextboxTemplate: "bubble" }
    });
    const configured = withPlatformSettings(project, "web", {
      ui: { showInputHints: false }
    });
    expect(resolveGalSettings(configured, "web")).toMatchObject({
      values: {
        choice: { showOptionNumbers: false, layout: "responsive-grid" },
        ui: { defaultTextboxTemplate: "bubble", showInputHints: false }
      },
      sources: {
        "choice.showOptionNumbers": "project",
        "choice.layout": "project",
        "ui.defaultTextboxTemplate": "project",
        "ui.showInputHints": "web"
      }
    });
  });

  it.each([
    { schemaVersion: 4, project: { choice: { showOptionNumbers: false } }, platforms: { windows: {}, web: {}, android: {} } },
    { schemaVersion: 4, project: { ui: { defaultTextboxTemplate: "bubble" } }, platforms: { windows: {}, web: {}, android: {} } }
  ])("rejects v5 fields disguised as schema v4 %#", (input) => {
    expect(() => parseGalSettingsDocument(input)).toThrowError(expect.objectContaining({ code: "UNKNOWN_FIELD" }) as GalSettingsError);
  });

  it.each([
    { schemaVersion: 3, project: { stage: { defaultDurationMilliseconds: 500 } }, platforms: { windows: {}, web: {}, android: {} } },
    { schemaVersion: 3, project: { audio: { resumeAfterInterruption: false } }, platforms: { windows: {}, web: {}, android: {} } }
  ])("rejects v4 fields disguised as schema v3 %#", (input) => {
    expect(() => parseGalSettingsDocument(input)).toThrowError(expect.objectContaining({ code: "UNKNOWN_FIELD" }) as GalSettingsError);
  });

  it.each([
    { schemaVersion: 1, project: { accessibility: { highContrast: true } }, platforms: { windows: {}, web: {}, android: {} } },
    { schemaVersion: 2, project: { text: { lineHeight: 2 } }, platforms: { windows: {}, web: {}, android: {} } }
  ])("rejects v3 fields disguised as legacy schema %#", (input) => {
    expect(() => parseGalSettingsDocument(input)).toThrowError(expect.objectContaining({ code: "UNKNOWN_FIELD" }) as GalSettingsError);
  });

  it.each([
    [{ schemaVersion: 1, project: { audio: { music: 0.5 } }, platforms: { windows: {}, web: {}, android: {} } }, "UNKNOWN_FIELD", "settings.project.audio.music"],
    [{ schemaVersion: 1, project: { audio: { master: 1.1 } }, platforms: { windows: {}, web: {}, android: {} } }, "INVALID_VALUE", "settings.project.audio.master"],
    [{ schemaVersion: 1, project: {}, platforms: { windows: {}, web: {} } }, "INVALID_SCHEMA", "settings.platforms.android"],
    [{ schemaVersion: 6, project: {}, platforms: { windows: {}, web: {}, android: {} } }, "FUTURE_SCHEMA", "settings.schemaVersion"],
    [{ schemaVersion: 1, project: { display: { designWidth: 1080, designHeight: 1920 } }, platforms: { windows: {}, web: {}, android: {} } }, "INVALID_COMBINATION", "settings.project.display"]
  ])("rejects invalid document %# with stable diagnostics", (input, code, path) => {
    expect(() => parseGalSettingsDocument(input)).toThrowError(expect.objectContaining({ code, path }) as GalSettingsError);
  });

  it("rejects malformed JSON without leaking parser-specific messages", () => {
    expect(() => parseSerializedGalSettingsDocument("{oops")).toThrowError(
      expect.objectContaining({ code: "INVALID_JSON", path: "settings" }) as GalSettingsError
    );
  });

  it("requires portrait dimensions to be updated atomically", () => {
    expect(() => withPlatformSettings(createGalSettingsDocument(), "android", {
      display: { orientation: "portrait" }
    })).toThrowError(expect.objectContaining({ code: "INVALID_COMBINATION" }) as GalSettingsError);

    expect(resolveGalSettings(withPlatformSettings(createGalSettingsDocument(), "android", {
      display: { designWidth: 1080, designHeight: 1920, orientation: "portrait" }
    }), "android").values.display.orientation).toBe("portrait");
  });

  it("rejects an unknown runtime platform even when an untyped host calls the API", () => {
    expect(() => resolveGalSettings(createGalSettingsDocument(), "ios" as "web")).toThrowError(
      expect.objectContaining({ code: "INVALID_VALUE", path: "platform" }) as GalSettingsError
    );
  });
});

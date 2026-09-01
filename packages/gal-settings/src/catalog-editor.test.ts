import { describe, expect, it } from "vitest";
import {
  GAL_SETTING_DEFINITIONS,
  GalSettingsError,
  applyGalSettingsEdits,
  createGalSettingsDocument,
  resolveGalSettings,
  searchGalSettingDefinitions,
  serializeGalSettingsDocument,
  withProjectSettings
} from "./index";

describe("N51-E2 Gal settings catalog", () => {
  it("covers all 37 setting paths exactly once with frozen Basic/Advanced visibility", () => {
    expect(GAL_SETTING_DEFINITIONS).toHaveLength(37);
    expect(new Set(GAL_SETTING_DEFINITIONS.map((definition) => definition.path)).size).toBe(37);
    expect(searchGalSettingDefinitions("", { mode: "basic" })).toHaveLength(24);
    expect(searchGalSettingDefinitions("", { mode: "advanced" })).toHaveLength(37);
    expect(GAL_SETTING_DEFINITIONS.every((definition) =>
      definition.label.zhHans.length > 0 &&
      definition.label.en.length > 0 &&
      definition.description.zhHans.length > 0 &&
      definition.description.en.length > 0
    )).toBe(true);
    expect(Object.isFrozen(GAL_SETTING_DEFINITIONS)).toBe(true);
    expect(GAL_SETTING_DEFINITIONS.every((definition) =>
      Object.isFrozen(definition) && Object.isFrozen(definition.label) && Object.isFrozen(definition.control)
    )).toBe(true);
  });

  it("finds Stage defaults and the Player interruption policy without inventing audio fade", () => {
    expect(searchGalSettingDefinitions("默认 舞台 时长", { mode: "advanced" }).map((definition) => definition.path)).toEqual(["stage.defaultDurationMilliseconds"]);
    expect(searchGalSettingDefinitions("interruption resume").map((definition) => definition.path)).toEqual(["audio.resumeAfterInterruption"]);
    expect(GAL_SETTING_DEFINITIONS.some((definition) => definition.path === ("audio.defaultFadeMilliseconds" as never))).toBe(false);
  });

  it("finds Choice and UI presentation policies without claiming Route or scheduler ownership", () => {
    expect(searchGalSettingDefinitions("选项 序号").map((definition) => definition.path)).toEqual(["choice.showOptionNumbers"]);
    expect(searchGalSettingDefinitions("responsive choice layout", { mode: "advanced" }).map((definition) => definition.path)).toEqual(["choice.layout"]);
    expect(searchGalSettingDefinitions("默认 对话框", { mode: "advanced" }).map((definition) => definition.path)).toEqual(["ui.defaultTextboxTemplate"]);
    expect(searchGalSettingDefinitions("输入 提示").map((definition) => definition.path)).toEqual(["ui.showInputHints"]);
    expect(GAL_SETTING_DEFINITIONS.some((definition) => definition.path === ("route.spoilerPolicy" as never))).toBe(false);
    expect(GAL_SETTING_DEFINITIONS.some((definition) => definition.path === ("choice.timeoutMilliseconds" as never))).toBe(false);
  });

  it("finds the portable accessibility policies without returning Editor-only preferences", () => {
    expect(searchGalSettingDefinitions("减少 动效").map((definition) => definition.path)).toEqual(["accessibility.reduceMotion"]);
    expect(searchGalSettingDefinitions("high contrast").map((definition) => definition.path)).toEqual(["accessibility.highContrast"]);
    expect(searchGalSettingDefinitions("字体 行高", { mode: "advanced" }).map((definition) => definition.path)).toEqual(["text.lineHeight"]);
  });

  it("normalizes full-width Latin search and requires every query term", () => {
    expect(searchGalSettingDefinitions("ＢＧＭ 音量").map((definition) => definition.path)).toEqual(["audio.bgm"]);
    expect(searchGalSettingDefinitions("voice volume").map((definition) => definition.path)).toEqual(["audio.voice"]);
    expect(searchGalSettingDefinitions("不存在的设置")).toEqual([]);
  });

  it("keeps deterministic catalog order for empty and tied searches", () => {
    expect(searchGalSettingDefinitions("", { mode: "advanced" })).toEqual(GAL_SETTING_DEFINITIONS);
    expect(searchGalSettingDefinitions("音量", { section: "audio" }).map((definition) => definition.path)).toEqual([
      "audio.master",
      "audio.bgm",
      "audio.voice",
      "audio.sfx",
      "audio.ambient",
      "audio.ui",
      "audio.voiceDucking"
    ]);
  });

  it("filters Basic mode before ranking while Advanced mode exposes both levels", () => {
    expect(searchGalSettingDefinitions("分辨率", { mode: "basic" })).toEqual([]);
    expect(searchGalSettingDefinitions("分辨率", { mode: "advanced" }).map((definition) => definition.path)).toEqual([
      "display.designWidth",
      "display.designHeight"
    ]);
  });

  it("rejects invalid untyped search inputs instead of silently changing visibility", () => {
    expect(() => searchGalSettingDefinitions(7 as unknown as string)).toThrow("query must be a string");
    expect(() => searchGalSettingDefinitions("", { mode: "expert" as "basic" })).toThrow("mode must be basic or advanced");
    expect(() => searchGalSettingDefinitions("", { section: "system" as "audio" })).toThrow("section is invalid");
    expect(() => searchGalSettingDefinitions("", { mode: "basic", typo: true } as never)).toThrow("Unknown Gal settings search option: typo");
  });
});

describe("N51-E2 Gal settings editing service", () => {
  it("commits an interdependent portrait profile atomically", () => {
    const original = createGalSettingsDocument();
    const result = applyGalSettingsEdits(original, { kind: "platform", platform: "android" }, [
      { type: "set", path: "display.designWidth", value: 1080 },
      { type: "set", path: "display.designHeight", value: 1920 },
      { type: "set", path: "display.orientation", value: "portrait" }
    ]);
    expect(result.hasChanges).toBe(true);
    expect(result.changes.map((change) => change.path)).toEqual([
      "display.designWidth",
      "display.designHeight",
      "display.orientation"
    ]);
    expect(resolveGalSettings(result.document, "android").values.display).toMatchObject({
      designWidth: 1080,
      designHeight: 1920,
      orientation: "portrait"
    });
    expect(resolveGalSettings(original, "android").values.display.orientation).toBe("landscape");
  });

  it("fails an invalid batch without mutating the source document", () => {
    const original = createGalSettingsDocument();
    const before = serializeGalSettingsDocument(original);
    expect(() => applyGalSettingsEdits(original, { kind: "platform", platform: "android" }, [
      { type: "set", path: "display.orientation", value: "portrait" }
    ])).toThrowError(expect.objectContaining({ code: "INVALID_COMBINATION" }) as GalSettingsError);
    expect(serializeGalSettingsDocument(original)).toBe(before);
  });

  it("reports project propagation and platform isolation with before/after sources", () => {
    const projectResult = applyGalSettingsEdits(createGalSettingsDocument(), { kind: "project" }, [
      { type: "set", path: "audio.master", value: 0.7 }
    ]);
    const projectChange = projectResult.changes[0];
    expect(projectChange?.resolutions.windows).toEqual({ beforeValue: 1, afterValue: 0.7, beforeSource: "default", afterSource: "project" });
    expect(projectChange?.resolutions.android.afterSource).toBe("project");

    const platformResult = applyGalSettingsEdits(projectResult.document, { kind: "platform", platform: "web" }, [
      { type: "set", path: "audio.master", value: 0.45 }
    ]);
    const platformChange = platformResult.changes[0];
    expect(platformChange?.resolutions.web).toEqual({ beforeValue: 0.7, afterValue: 0.45, beforeSource: "project", afterSource: "web" });
    expect(platformChange?.resolutions.windows).toEqual({ beforeValue: 0.7, afterValue: 0.7, beforeSource: "project", afterSource: "project" });
  });

  it("resets the selected layer and records the inherited result", () => {
    const source = withProjectSettings(createGalSettingsDocument(), { audio: { voice: 0.75 } });
    const platform = applyGalSettingsEdits(source, { kind: "platform", platform: "web" }, [
      { type: "set", path: "audio.voice", value: 0.5 }
    ]).document;
    const reset = applyGalSettingsEdits(platform, { kind: "platform", platform: "web" }, [
      { type: "reset", path: "audio.voice" }
    ]);
    expect(reset.changes[0]).toMatchObject({
      overrideBefore: { present: true, value: 0.5 },
      overrideAfter: { present: false, value: null },
      resolutions: { web: { afterValue: 0.75, afterSource: "project" } }
    });
  });

  it("returns an explicit no-op instead of creating a false transaction", () => {
    const source = withProjectSettings(createGalSettingsDocument(), { audio: { ui: 0.9 } });
    const result = applyGalSettingsEdits(source, { kind: "project" }, [
      { type: "set", path: "audio.ui", value: 0.9 },
      { type: "reset", path: "audio.voice" }
    ]);
    expect(result.hasChanges).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it("rejects duplicate paths, unknown paths, invalid values, and invalid layers", () => {
    const source = createGalSettingsDocument();
    expect(() => applyGalSettingsEdits(source, { kind: "project" }, [
      { type: "set", path: "audio.bgm", value: 0.5 },
      { type: "reset", path: "audio.bgm" }
    ])).toThrowError(expect.objectContaining({ code: "DUPLICATE_EDIT", path: "edits[1].path" }) as GalSettingsError);
    expect(() => applyGalSettingsEdits(source, { kind: "project" }, [
      { type: "set", path: "audio.music" as "audio.bgm", value: 0.5 }
    ])).toThrowError(expect.objectContaining({ code: "UNKNOWN_SETTING_PATH" }) as GalSettingsError);
    expect(() => applyGalSettingsEdits(source, { kind: "project" }, [
      { type: "set", path: "audio.bgm", value: 2 }
    ])).toThrowError(expect.objectContaining({ code: "INVALID_VALUE", path: "settings.project.audio.bgm" }) as GalSettingsError);
    expect(() => applyGalSettingsEdits(source, { kind: "platform", platform: "ios" as "web" }, []))
      .toThrowError(expect.objectContaining({ code: "INVALID_EDIT", path: "layer" }) as GalSettingsError);
  });

  it("rejects unknown transaction fields instead of silently discarding host mistakes", () => {
    const source = createGalSettingsDocument();
    expect(() => applyGalSettingsEdits(source, { kind: "project", platform: "web" } as never, []))
      .toThrowError(expect.objectContaining({ code: "INVALID_EDIT", path: "layer" }) as GalSettingsError);
    expect(() => applyGalSettingsEdits(source, { kind: "project" }, [
      { type: "set", path: "audio.bgm", value: 0.5, typo: true } as never
    ])).toThrowError(expect.objectContaining({ code: "INVALID_EDIT", path: "edits[0].typo" }) as GalSettingsError);
  });
});

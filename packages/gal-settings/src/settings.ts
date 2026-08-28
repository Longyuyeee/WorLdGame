import { getGalSettingDefinition } from "./catalog";

export const GAL_SETTINGS_SCHEMA_VERSION = 4 as const;
const GAL_SETTINGS_MIN_READABLE_SCHEMA_VERSION = 1;

export const GAL_SETTINGS_PLATFORMS = ["windows", "web", "android"] as const;
export type GalSettingsPlatform = (typeof GAL_SETTINGS_PLATFORMS)[number];

export interface GalSettings {
  readonly display: {
    readonly designWidth: number;
    readonly designHeight: number;
    readonly orientation: "landscape" | "portrait" | "adaptive";
    readonly safeArea: "none" | "system";
    readonly quality: "low" | "balanced" | "high";
  };
  readonly text: {
    readonly charactersPerSecond: number;
    readonly minimumDisplayMilliseconds: number;
    readonly punctuationDelayMilliseconds: number;
    readonly fontScale: number;
    readonly messageWindowOpacity: number;
    readonly revealMode: "typewriter" | "instant";
    readonly lineHeight: number;
    readonly letterSpacingEm: number;
  };
  readonly advance: {
    readonly allowHold: boolean;
    readonly waitForVoice: boolean;
  };
  readonly audio: {
    readonly master: number;
    readonly bgm: number;
    readonly voice: number;
    readonly sfx: number;
    readonly ambient: number;
    readonly ui: number;
    readonly voiceDucking: number;
    readonly resumeAfterInterruption: boolean;
  };
  readonly stage: {
    readonly defaultDurationMilliseconds: number;
    readonly defaultEasing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  };
  readonly input: {
    readonly pointerAdvance: boolean;
    readonly keyboardAdvance: boolean;
    readonly touchAdvance: boolean;
    readonly gamepadAdvance: boolean;
  };
  readonly accessibility: {
    readonly highContrast: boolean;
    readonly reduceMotion: boolean;
    readonly reduceFlashing: boolean;
  };
}

export type GalSettingsOverride = {
  readonly [Section in keyof GalSettings]?: Partial<GalSettings[Section]>;
};

export interface GalSettingsDocument {
  readonly schemaVersion: typeof GAL_SETTINGS_SCHEMA_VERSION;
  readonly project: GalSettingsOverride;
  readonly platforms: Readonly<Record<GalSettingsPlatform, GalSettingsOverride>>;
}

export type GalSettingPath = {
  [Section in keyof GalSettings]: {
    [Field in keyof GalSettings[Section] & string]: `${Section & string}.${Field}`
  }[keyof GalSettings[Section] & string]
}[keyof GalSettings];

export type GalSettingSource = "default" | "project" | GalSettingsPlatform;

export interface ResolvedGalSettings {
  readonly platform: GalSettingsPlatform;
  readonly values: GalSettings;
  readonly sources: Readonly<Record<GalSettingPath, GalSettingSource>>;
}

export type GalSettingsErrorCode =
  | "INVALID_JSON"
  | "INVALID_SCHEMA"
  | "FUTURE_SCHEMA"
  | "UNKNOWN_FIELD"
  | "INVALID_VALUE"
  | "INVALID_COMBINATION"
  | "INVALID_EDIT"
  | "DUPLICATE_EDIT"
  | "UNKNOWN_SETTING_PATH";

export class GalSettingsError extends Error {
  readonly code: GalSettingsErrorCode;
  readonly path: string;

  constructor(code: GalSettingsErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "GalSettingsError";
    this.code = code;
    this.path = path;
  }
}

export const DEFAULT_GAL_SETTINGS: GalSettings = Object.freeze({
  display: Object.freeze({
    designWidth: 1920,
    designHeight: 1080,
    orientation: "landscape" as const,
    safeArea: "system" as const,
    quality: "high" as const
  }),
  text: Object.freeze({
    charactersPerSecond: 30,
    minimumDisplayMilliseconds: 350,
    punctuationDelayMilliseconds: 120,
    fontScale: 1,
    messageWindowOpacity: 0.88,
    revealMode: "typewriter" as const,
    lineHeight: 1.75,
    letterSpacingEm: 0
  }),
  advance: Object.freeze({ allowHold: true, waitForVoice: true }),
  audio: Object.freeze({
    master: 1,
    bgm: 0.8,
    voice: 1,
    sfx: 0.9,
    ambient: 0.8,
    ui: 0.9,
    voiceDucking: 0.35,
    resumeAfterInterruption: true
  }),
  stage: Object.freeze({ defaultDurationMilliseconds: 360, defaultEasing: "linear" as const }),
  input: Object.freeze({
    pointerAdvance: true,
    keyboardAdvance: true,
    touchAdvance: true,
    gamepadAdvance: true
  }),
  accessibility: Object.freeze({ highContrast: false, reduceMotion: false, reduceFlashing: false })
});

type UnknownRecord = Record<string, unknown>;
type Section = keyof GalSettings;

const LEGACY_SECTION_FIELDS = {
  display: ["designWidth", "designHeight", "orientation", "safeArea", "quality"],
  text: ["charactersPerSecond", "minimumDisplayMilliseconds", "punctuationDelayMilliseconds", "fontScale", "messageWindowOpacity"],
  advance: ["allowHold", "waitForVoice"],
  audio: ["master", "bgm", "voice", "sfx", "ambient", "ui", "voiceDucking"],
  input: ["pointerAdvance", "keyboardAdvance", "touchAdvance", "gamepadAdvance"]
} as const;

const V3_SECTION_FIELDS = {
  ...LEGACY_SECTION_FIELDS,
  text: [...LEGACY_SECTION_FIELDS.text, "revealMode", "lineHeight", "letterSpacingEm"],
  accessibility: ["highContrast", "reduceMotion", "reduceFlashing"]
} as const;

const SECTION_FIELDS = {
  ...V3_SECTION_FIELDS,
  audio: [...V3_SECTION_FIELDS.audio, "resumeAfterInterruption"],
  stage: ["defaultDurationMilliseconds", "defaultEasing"]
} as const satisfies { readonly [Key in Section]: readonly (keyof GalSettings[Key] & string)[] };

const SETTING_PATHS = (Object.entries(SECTION_FIELDS) as Array<[Section, readonly string[]]>)
  .flatMap(([section, fields]) => fields.map((field) => `${section}.${field}` as GalSettingPath));

function fail(code: GalSettingsErrorCode, path: string, message: string): never {
  throw new GalSettingsError(code, path, message);
}

function parsePlatform(value: unknown): GalSettingsPlatform {
  return enumeration(value, "platform", GAL_SETTINGS_PLATFORMS);
}

function record(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("INVALID_SCHEMA", path, "must be an object");
  }
  return value as UnknownRecord;
}

function assertKnownFields(value: UnknownRecord, fields: readonly string[], path: string): void {
  const unknown = Object.keys(value).find((key) => !fields.includes(key));
  if (unknown !== undefined) fail("UNKNOWN_FIELD", `${path}.${unknown}`, "is not supported by this schema version");
}

function finiteNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    return fail("INVALID_VALUE", path, `must be a finite number from ${minimum} to ${maximum}`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function settingNumber(value: unknown, errorPath: string, settingPath: GalSettingPath): number {
  const control = getGalSettingDefinition(settingPath).control;
  if (control.kind !== "number") return fail("INVALID_SCHEMA", settingPath, "catalog control must be number");
  return finiteNumber(value, errorPath, control.minimum, control.maximum);
}

function boolean(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail("INVALID_VALUE", path, "must be boolean");
}

function settingBoolean(value: unknown, errorPath: string, settingPath: GalSettingPath): boolean {
  if (getGalSettingDefinition(settingPath).control.kind !== "boolean") {
    return fail("INVALID_SCHEMA", settingPath, "catalog control must be boolean");
  }
  return boolean(value, errorPath);
}

function enumeration<const Value extends string>(value: unknown, path: string, values: readonly Value[]): Value {
  return typeof value === "string" && values.includes(value as Value)
    ? value as Value
    : fail("INVALID_VALUE", path, `must be one of ${values.join(", ")}`);
}

function settingEnumeration<const Value extends string>(value: unknown, errorPath: string, settingPath: GalSettingPath): Value {
  const control = getGalSettingDefinition(settingPath).control;
  if (control.kind !== "select") return fail("INVALID_SCHEMA", settingPath, "catalog control must be select");
  return enumeration(value, errorPath, control.options as readonly Value[]);
}

function parseDisplay(value: unknown, path: string): NonNullable<GalSettingsOverride["display"]> {
  const input = record(value, path);
  assertKnownFields(input, SECTION_FIELDS.display, path);
  return {
    ...(input.designWidth === undefined ? {} : { designWidth: settingNumber(input.designWidth, `${path}.designWidth`, "display.designWidth") }),
    ...(input.designHeight === undefined ? {} : { designHeight: settingNumber(input.designHeight, `${path}.designHeight`, "display.designHeight") }),
    ...(input.orientation === undefined ? {} : { orientation: settingEnumeration(input.orientation, `${path}.orientation`, "display.orientation") }),
    ...(input.safeArea === undefined ? {} : { safeArea: settingEnumeration(input.safeArea, `${path}.safeArea`, "display.safeArea") }),
    ...(input.quality === undefined ? {} : { quality: settingEnumeration(input.quality, `${path}.quality`, "display.quality") })
  };
}

function parseText(value: unknown, path: string, fields: readonly string[]): NonNullable<GalSettingsOverride["text"]> {
  const input = record(value, path);
  assertKnownFields(input, fields, path);
  return {
    ...(input.charactersPerSecond === undefined ? {} : { charactersPerSecond: settingNumber(input.charactersPerSecond, `${path}.charactersPerSecond`, "text.charactersPerSecond") }),
    ...(input.minimumDisplayMilliseconds === undefined ? {} : { minimumDisplayMilliseconds: settingNumber(input.minimumDisplayMilliseconds, `${path}.minimumDisplayMilliseconds`, "text.minimumDisplayMilliseconds") }),
    ...(input.punctuationDelayMilliseconds === undefined ? {} : { punctuationDelayMilliseconds: settingNumber(input.punctuationDelayMilliseconds, `${path}.punctuationDelayMilliseconds`, "text.punctuationDelayMilliseconds") }),
    ...(input.fontScale === undefined ? {} : { fontScale: settingNumber(input.fontScale, `${path}.fontScale`, "text.fontScale") }),
    ...(input.messageWindowOpacity === undefined ? {} : { messageWindowOpacity: settingNumber(input.messageWindowOpacity, `${path}.messageWindowOpacity`, "text.messageWindowOpacity") }),
    ...(input.revealMode === undefined ? {} : { revealMode: settingEnumeration(input.revealMode, `${path}.revealMode`, "text.revealMode") }),
    ...(input.lineHeight === undefined ? {} : { lineHeight: settingNumber(input.lineHeight, `${path}.lineHeight`, "text.lineHeight") }),
    ...(input.letterSpacingEm === undefined ? {} : { letterSpacingEm: settingNumber(input.letterSpacingEm, `${path}.letterSpacingEm`, "text.letterSpacingEm") })
  };
}

function parseAdvance(value: unknown, path: string): NonNullable<GalSettingsOverride["advance"]> {
  const input = record(value, path);
  assertKnownFields(input, SECTION_FIELDS.advance, path);
  return {
    ...(input.allowHold === undefined ? {} : { allowHold: settingBoolean(input.allowHold, `${path}.allowHold`, "advance.allowHold") }),
    ...(input.waitForVoice === undefined ? {} : { waitForVoice: settingBoolean(input.waitForVoice, `${path}.waitForVoice`, "advance.waitForVoice") })
  };
}

function parseAudio(value: unknown, path: string, fields: readonly string[]): NonNullable<GalSettingsOverride["audio"]> {
  const input = record(value, path);
  assertKnownFields(input, fields, path);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [
    key,
    key === "resumeAfterInterruption"
      ? settingBoolean(item, `${path}.${key}`, "audio.resumeAfterInterruption")
      : settingNumber(item, `${path}.${key}`, `audio.${key}` as GalSettingPath)
  ])) as NonNullable<GalSettingsOverride["audio"]>;
}

function parseStage(value: unknown, path: string): NonNullable<GalSettingsOverride["stage"]> {
  const input = record(value, path);
  assertKnownFields(input, SECTION_FIELDS.stage, path);
  return {
    ...(input.defaultDurationMilliseconds === undefined ? {} : { defaultDurationMilliseconds: settingNumber(input.defaultDurationMilliseconds, `${path}.defaultDurationMilliseconds`, "stage.defaultDurationMilliseconds") }),
    ...(input.defaultEasing === undefined ? {} : { defaultEasing: settingEnumeration(input.defaultEasing, `${path}.defaultEasing`, "stage.defaultEasing") })
  };
}

function parseInput(value: unknown, path: string): NonNullable<GalSettingsOverride["input"]> {
  const input = record(value, path);
  assertKnownFields(input, SECTION_FIELDS.input, path);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, settingBoolean(item, `${path}.${key}`, `input.${key}` as GalSettingPath)])) as NonNullable<GalSettingsOverride["input"]>;
}

function parseAccessibility(value: unknown, path: string): NonNullable<GalSettingsOverride["accessibility"]> {
  const input = record(value, path);
  assertKnownFields(input, SECTION_FIELDS.accessibility, path);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [
    key,
    settingBoolean(item, `${path}.${key}`, `accessibility.${key}` as GalSettingPath)
  ])) as NonNullable<GalSettingsOverride["accessibility"]>;
}

function parseOverride(value: unknown, path: string, schemaVersion: number = GAL_SETTINGS_SCHEMA_VERSION): GalSettingsOverride {
  const input = record(value, path);
  const sectionFields = schemaVersion >= 4 ? SECTION_FIELDS : schemaVersion >= 3 ? V3_SECTION_FIELDS : LEGACY_SECTION_FIELDS;
  assertKnownFields(input, Object.keys(sectionFields), path);
  return {
    ...(input.display === undefined ? {} : { display: parseDisplay(input.display, `${path}.display`) }),
    ...(input.text === undefined ? {} : { text: parseText(input.text, `${path}.text`, sectionFields.text) }),
    ...(input.advance === undefined ? {} : { advance: parseAdvance(input.advance, `${path}.advance`) }),
    ...(input.audio === undefined ? {} : { audio: parseAudio(input.audio, `${path}.audio`, sectionFields.audio) }),
    ...(schemaVersion < 4 || input.stage === undefined ? {} : { stage: parseStage(input.stage, `${path}.stage`) }),
    ...(input.input === undefined ? {} : { input: parseInput(input.input, `${path}.input`) }),
    ...(schemaVersion < 3 || input.accessibility === undefined ? {} : { accessibility: parseAccessibility(input.accessibility, `${path}.accessibility`) })
  };
}

function mergeSettings(...overrides: readonly GalSettingsOverride[]): GalSettings {
  return overrides.reduce<GalSettings>((current, override) => ({
    display: { ...current.display, ...override.display },
    text: { ...current.text, ...override.text },
    advance: { ...current.advance, ...override.advance },
    audio: { ...current.audio, ...override.audio },
    stage: { ...current.stage, ...override.stage },
    input: { ...current.input, ...override.input },
    accessibility: { ...current.accessibility, ...override.accessibility }
  }), DEFAULT_GAL_SETTINGS);
}

function validateCombination(values: GalSettings, path: string): void {
  if (values.display.orientation === "landscape" && values.display.designWidth < values.display.designHeight) {
    fail("INVALID_COMBINATION", `${path}.display`, "landscape requires designWidth >= designHeight");
  }
  if (values.display.orientation === "portrait" && values.display.designHeight < values.display.designWidth) {
    fail("INVALID_COMBINATION", `${path}.display`, "portrait requires designHeight >= designWidth");
  }
}

function normalizedOverride(value: GalSettingsOverride): GalSettingsOverride {
  return Object.fromEntries(Object.entries(value).filter(([, section]) => Object.keys(section).length > 0)) as GalSettingsOverride;
}

export function createGalSettingsDocument(): GalSettingsDocument {
  return {
    schemaVersion: GAL_SETTINGS_SCHEMA_VERSION,
    project: {},
    platforms: { windows: {}, web: {}, android: {} }
  };
}

export function parseGalSettingsDocument(value: unknown): GalSettingsDocument {
  const input = record(value, "settings");
  assertKnownFields(input, ["schemaVersion", "project", "platforms"], "settings");
  if (typeof input.schemaVersion !== "number" || !Number.isSafeInteger(input.schemaVersion)) {
    fail("INVALID_SCHEMA", "settings.schemaVersion", "must be a safe integer");
  }
  if (input.schemaVersion > GAL_SETTINGS_SCHEMA_VERSION) {
    fail("FUTURE_SCHEMA", "settings.schemaVersion", `schema ${input.schemaVersion} is read-only until migrated`);
  }
  if (input.schemaVersion < GAL_SETTINGS_MIN_READABLE_SCHEMA_VERSION) {
    fail(
      "INVALID_SCHEMA",
      "settings.schemaVersion",
      `must be between ${GAL_SETTINGS_MIN_READABLE_SCHEMA_VERSION} and ${GAL_SETTINGS_SCHEMA_VERSION}`
    );
  }
  const schemaVersion = input.schemaVersion;
  const platforms = record(input.platforms, "settings.platforms");
  assertKnownFields(platforms, GAL_SETTINGS_PLATFORMS, "settings.platforms");
  for (const platform of GAL_SETTINGS_PLATFORMS) {
    if (platforms[platform] === undefined) fail("INVALID_SCHEMA", `settings.platforms.${platform}`, "is required");
  }
  const project = normalizedOverride(parseOverride(input.project, "settings.project", schemaVersion));
  const settingsDocument: GalSettingsDocument = {
    schemaVersion: GAL_SETTINGS_SCHEMA_VERSION,
    project,
    platforms: Object.fromEntries(GAL_SETTINGS_PLATFORMS.map((platform) => [
      platform,
      normalizedOverride(parseOverride(platforms[platform], `settings.platforms.${platform}`, schemaVersion))
    ])) as Record<GalSettingsPlatform, GalSettingsOverride>
  };
  validateCombination(mergeSettings(settingsDocument.project), "settings.project");
  for (const platform of GAL_SETTINGS_PLATFORMS) {
    validateCombination(mergeSettings(settingsDocument.project, settingsDocument.platforms[platform]), `settings.platforms.${platform}`);
  }
  return settingsDocument;
}

export function parseSerializedGalSettingsDocument(source: string): GalSettingsDocument {
  try {
    return parseGalSettingsDocument(JSON.parse(source) as unknown);
  } catch (error) {
    if (error instanceof GalSettingsError) throw error;
    fail("INVALID_JSON", "settings", "must contain valid JSON");
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.keys(value as UnknownRecord).sort().map((key) => [key, canonical((value as UnknownRecord)[key])]));
  }
  return value;
}

export function serializeGalSettingsDocument(settingsDocument: GalSettingsDocument): string {
  const parsed = parseGalSettingsDocument(settingsDocument);
  return `${JSON.stringify(canonical(parsed), null, 2)}\n`;
}

function hasSetting(override: GalSettingsOverride, path: GalSettingPath): boolean {
  const [section, field] = path.split(".") as [Section, string];
  return Object.prototype.hasOwnProperty.call(override[section] ?? {}, field);
}

export function resolveGalSettings(settingsDocument: GalSettingsDocument, platform: GalSettingsPlatform): ResolvedGalSettings {
  platform = parsePlatform(platform);
  const parsed = parseGalSettingsDocument(settingsDocument);
  const platformOverride = parsed.platforms[platform];
  const values = mergeSettings(parsed.project, platformOverride);
  validateCombination(values, `settings.platforms.${platform}`);
  const sources = Object.fromEntries(SETTING_PATHS.map((path) => [
    path,
    hasSetting(platformOverride, path) ? platform : hasSetting(parsed.project, path) ? "project" : "default"
  ])) as Record<GalSettingPath, GalSettingSource>;
  return { platform, values, sources };
}

function mergeOverride(current: GalSettingsOverride, patch: GalSettingsOverride): GalSettingsOverride {
  return normalizedOverride({
    ...current,
    ...Object.fromEntries(Object.keys(patch).map((section) => [section, {
      ...(current[section as Section] ?? {}),
      ...(patch[section as Section] ?? {})
    }]))
  });
}

export function withProjectSettings(settingsDocument: GalSettingsDocument, patch: GalSettingsOverride): GalSettingsDocument {
  return parseGalSettingsDocument({ ...settingsDocument, project: mergeOverride(settingsDocument.project, parseOverride(patch, "patch")) });
}

export function withPlatformSettings(settingsDocument: GalSettingsDocument, platform: GalSettingsPlatform, patch: GalSettingsOverride): GalSettingsDocument {
  platform = parsePlatform(platform);
  return parseGalSettingsDocument({
    ...settingsDocument,
    platforms: { ...settingsDocument.platforms, [platform]: mergeOverride(settingsDocument.platforms[platform], parseOverride(patch, "patch")) }
  });
}

function withoutSetting(override: GalSettingsOverride, path: GalSettingPath): GalSettingsOverride {
  const [section, field] = path.split(".") as [Section, string];
  const sectionValue = { ...(override[section] ?? {}) } as UnknownRecord;
  delete sectionValue[field];
  return normalizedOverride({ ...override, [section]: sectionValue });
}

export function resetProjectSetting(settingsDocument: GalSettingsDocument, path: GalSettingPath): GalSettingsDocument {
  return parseGalSettingsDocument({ ...settingsDocument, project: withoutSetting(settingsDocument.project, path) });
}

export function resetPlatformSetting(settingsDocument: GalSettingsDocument, platform: GalSettingsPlatform, path: GalSettingPath): GalSettingsDocument {
  platform = parsePlatform(platform);
  return parseGalSettingsDocument({
    ...settingsDocument,
    platforms: { ...settingsDocument.platforms, [platform]: withoutSetting(settingsDocument.platforms[platform], path) }
  });
}

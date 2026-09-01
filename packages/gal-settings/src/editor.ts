import { GAL_SETTING_DEFINITIONS } from "./catalog";
import {
  GAL_SETTINGS_PLATFORMS,
  GalSettingsError,
  parseGalSettingsDocument,
  resolveGalSettings,
  type GalSettingPath,
  type GalSettingSource,
  type GalSettings,
  type GalSettingsDocument,
  type GalSettingsOverride,
  type GalSettingsPlatform
} from "./settings";

export type GalSettingValue<Path extends GalSettingPath> =
  Path extends `${infer Section}.${infer Field}`
    ? Section extends keyof GalSettings
      ? Field extends keyof GalSettings[Section]
        ? GalSettings[Section][Field]
        : never
      : never
    : never;

export type GalSettingScalar = GalSettingValue<GalSettingPath>;

export type GalSettingsEdit = {
  [Path in GalSettingPath]:
    | { readonly type: "set"; readonly path: Path; readonly value: GalSettingValue<Path> }
    | { readonly type: "reset"; readonly path: Path }
}[GalSettingPath];

export type GalSettingsEditLayer =
  | { readonly kind: "project" }
  | { readonly kind: "platform"; readonly platform: GalSettingsPlatform };

export interface GalSettingOverrideFact {
  readonly present: boolean;
  readonly value: GalSettingScalar | null;
}

export interface GalSettingResolutionChange {
  readonly beforeValue: GalSettingScalar;
  readonly afterValue: GalSettingScalar;
  readonly beforeSource: GalSettingSource;
  readonly afterSource: GalSettingSource;
}

export interface GalSettingEditChange {
  readonly path: GalSettingPath;
  readonly overrideBefore: GalSettingOverrideFact;
  readonly overrideAfter: GalSettingOverrideFact;
  readonly resolutions: Readonly<Record<GalSettingsPlatform, GalSettingResolutionChange>>;
}

export interface GalSettingsEditResult {
  readonly document: GalSettingsDocument;
  readonly layer: GalSettingsEditLayer;
  readonly hasChanges: boolean;
  readonly changes: readonly GalSettingEditChange[];
}

type MutableOverride = Record<string, Record<string, unknown>>;
const knownPaths = new Set<string>(GAL_SETTING_DEFINITIONS.map((definition) => definition.path));

function invalid(path: string, message: string): never {
  throw new GalSettingsError("INVALID_EDIT", path, message);
}

function parseLayer(layer: GalSettingsEditLayer): GalSettingsEditLayer {
  if (typeof layer !== "object" || layer === null) return invalid("layer", "must be project or platform");
  if (layer.kind === "project") {
    if (Object.keys(layer).some((key) => key !== "kind")) return invalid("layer", "project layer contains unsupported fields");
    return { kind: "project" };
  }
  if (layer.kind === "platform" && GAL_SETTINGS_PLATFORMS.includes(layer.platform)) {
    if (Object.keys(layer).some((key) => key !== "kind" && key !== "platform")) return invalid("layer", "platform layer contains unsupported fields");
    return { kind: "platform", platform: layer.platform };
  }
  return invalid("layer", "must be project or a Windows/Web/Android platform");
}

function parsePath(value: unknown, index: number): GalSettingPath {
  if (typeof value !== "string" || !knownPaths.has(value)) {
    throw new GalSettingsError("UNKNOWN_SETTING_PATH", `edits[${index}].path`, "must reference a catalog setting");
  }
  return value as GalSettingPath;
}

function cloneOverride(override: GalSettingsOverride): MutableOverride {
  return Object.fromEntries(Object.entries(override).map(([section, values]) => [section, { ...values }]));
}

function splitPath(path: GalSettingPath): readonly [string, string] {
  return path.split(".") as [string, string];
}

function overrideFact(override: GalSettingsOverride, path: GalSettingPath): GalSettingOverrideFact {
  const [section, field] = splitPath(path);
  const sectionValue = override[section as keyof GalSettings];
  const present = Object.prototype.hasOwnProperty.call(sectionValue ?? {}, field);
  return { present, value: present ? (sectionValue as Record<string, GalSettingScalar>)[field] ?? null : null };
}

function resolvedValue(settings: GalSettings, path: GalSettingPath): GalSettingScalar {
  const [section, field] = splitPath(path);
  return (settings[section as keyof GalSettings] as Record<string, GalSettingScalar>)[field] as GalSettingScalar;
}

function sameFact(left: GalSettingOverrideFact, right: GalSettingOverrideFact): boolean {
  return left.present === right.present && Object.is(left.value, right.value);
}

export function applyGalSettingsEdits(
  settingsDocument: GalSettingsDocument,
  layer: GalSettingsEditLayer,
  edits: readonly GalSettingsEdit[]
): GalSettingsEditResult {
  const parsedLayer = parseLayer(layer);
  const beforeDocument = parseGalSettingsDocument(settingsDocument);
  if (!Array.isArray(edits)) return invalid("edits", "must be an array");

  const beforeOverride = parsedLayer.kind === "project"
    ? beforeDocument.project
    : beforeDocument.platforms[parsedLayer.platform];
  const mutableOverride = cloneOverride(beforeOverride);
  const paths: GalSettingPath[] = [];
  const seen = new Set<GalSettingPath>();

  edits.forEach((untrustedEdit, index) => {
    if (typeof untrustedEdit !== "object" || untrustedEdit === null) return invalid(`edits[${index}]`, "must be an edit object");
    const edit = untrustedEdit as GalSettingsEdit;
    const allowedFields = edit.type === "set" ? ["type", "path", "value"] : edit.type === "reset" ? ["type", "path"] : ["type", "path"];
    const unknownField = Object.keys(edit).find((key) => !allowedFields.includes(key));
    if (unknownField !== undefined) return invalid(`edits[${index}].${unknownField}`, "is not supported");
    const path = parsePath(edit.path, index);
    if (seen.has(path)) throw new GalSettingsError("DUPLICATE_EDIT", `edits[${index}].path`, `${path} appears more than once`);
    seen.add(path);
    paths.push(path);
    const [section, field] = splitPath(path);
    const sectionValue = { ...(mutableOverride[section] ?? {}) };
    if (edit.type === "reset") {
      delete sectionValue[field];
    } else if (edit.type === "set") {
      if (edit.value === undefined) return invalid(`edits[${index}].value`, "set requires an explicit value");
      sectionValue[field] = edit.value;
    } else {
      return invalid(`edits[${index}].type`, "must be set or reset");
    }
    if (Object.keys(sectionValue).length === 0) delete mutableOverride[section];
    else mutableOverride[section] = sectionValue;
  });

  const candidate = parsedLayer.kind === "project"
    ? { ...beforeDocument, project: mutableOverride }
    : {
        ...beforeDocument,
        platforms: { ...beforeDocument.platforms, [parsedLayer.platform]: mutableOverride }
      };
  const afterDocument = parseGalSettingsDocument(candidate);
  const afterOverride = parsedLayer.kind === "project"
    ? afterDocument.project
    : afterDocument.platforms[parsedLayer.platform];
  const beforeResolved = Object.fromEntries(GAL_SETTINGS_PLATFORMS.map((platform) => [platform, resolveGalSettings(beforeDocument, platform)])) as Record<GalSettingsPlatform, ReturnType<typeof resolveGalSettings>>;
  const afterResolved = Object.fromEntries(GAL_SETTINGS_PLATFORMS.map((platform) => [platform, resolveGalSettings(afterDocument, platform)])) as Record<GalSettingsPlatform, ReturnType<typeof resolveGalSettings>>;

  const changes = paths.flatMap((path): readonly GalSettingEditChange[] => {
    const overrideBefore = overrideFact(beforeOverride, path);
    const overrideAfter = overrideFact(afterOverride, path);
    if (sameFact(overrideBefore, overrideAfter)) return [];
    return [{
      path,
      overrideBefore,
      overrideAfter,
      resolutions: Object.fromEntries(GAL_SETTINGS_PLATFORMS.map((platform) => [platform, {
        beforeValue: resolvedValue(beforeResolved[platform].values, path),
        afterValue: resolvedValue(afterResolved[platform].values, path),
        beforeSource: beforeResolved[platform].sources[path],
        afterSource: afterResolved[platform].sources[path]
      }])) as Record<GalSettingsPlatform, GalSettingResolutionChange>
    }];
  });

  return {
    document: afterDocument,
    layer: parsedLayer,
    hasChanges: changes.length > 0,
    changes
  };
}

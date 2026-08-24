import type { StoryStatement } from "@world-studio/story-core";
import type { AssetIndex, AssetIndexEntry, BlobDigest } from "@world-studio/project-persistence";
import {
  DIRECTIVE_PARAMETERS,
  MAX_STAGE_Z,
  MAX_STAGE_ANCHOR,
  MAX_STAGE_PERCENT,
  MAX_STAGE_ROTATION,
  MAX_STAGE_SCALE,
  MIN_STAGE_Z,
  MIN_STAGE_ANCHOR,
  MIN_STAGE_PERCENT,
  MIN_STAGE_ROTATION,
  MIN_STAGE_SCALE,
  SAFE_STAGE_SLOT,
  STAGE_MOVE_GEOMETRY_PARAMETERS,
  isStageEasing,
  type StageEasing,
  directiveActionParameters,
  directiveActionRequiresAsset,
  inspectDirectiveArguments,
  resolveDirectiveAction
} from "@world-studio/story-language";

export interface PreviewVisualLayerPlan {
  readonly statementId: string;
  readonly assetId: string;
  readonly transition?: string;
  readonly duration?: string;
  readonly easing?: StageEasing;
  readonly expression?: string;
  readonly position?: string;
  readonly slot?: string;
  readonly z?: number;
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly rotation?: number;
  readonly anchorX?: number;
  readonly anchorY?: number;
  readonly movementFrom?: PreviewCharacterGeometry;
  readonly entering?: boolean;
  readonly exiting?: boolean;
}

export interface PreviewAudioLayerPlan {
  readonly statementId: string;
  readonly assetId: string;
  readonly bus: "voice" | "bgm" | "sfx" | "ambient";
  readonly loop: boolean;
  readonly volume: number;
  readonly fade?: string;
  readonly playback: "playing" | "paused";
}

export interface PreviewStagePlan {
  readonly key: string;
  readonly resourceKey: string;
  readonly background?: PreviewVisualLayerPlan;
  readonly characters: readonly PreviewVisualLayerPlan[];
  readonly audio: readonly PreviewAudioLayerPlan[];
  readonly diagnostics: readonly string[];
}

export interface PreviewCharacterGeometry {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export interface LoadedPreviewMedia {
  readonly planKey: string;
  readonly background?: PreviewVisualLayerPlan & { readonly url: string };
  readonly characters: readonly (PreviewVisualLayerPlan & { readonly url: string })[];
  readonly audio: readonly (PreviewAudioLayerPlan & { readonly url: string })[];
  readonly errors: readonly string[];
  readonly objectUrls: readonly string[];
}

export interface PreviewAssetReader {
  read(digest: BlobDigest): Promise<Uint8Array | null>;
}

export interface PreviewUrlFactory {
  create(bytes: Uint8Array, mimeType: string): string;
  revoke(url: string): void;
}

const AUDIO_BUSES = new Set(["voice", "bgm", "sfx", "ambient"]);

function optional(parameters: Readonly<Record<string, string>>, key: string): string | undefined {
  const value = parameters[key];
  return value === undefined || value.length === 0 ? undefined : value;
}

interface MutableStageState {
  background?: PreviewVisualLayerPlan;
  readonly characters: Map<string, PreviewVisualLayerPlan>;
  readonly exitingCharacters: Map<string, PreviewVisualLayerPlan>;
  readonly audio: Map<PreviewAudioLayerPlan["bus"], PreviewAudioLayerPlan>;
  readonly diagnostics: string[];
}

function addDiagnostic(state: MutableStageState, message: string): void {
  if (state.diagnostics.length < 100) state.diagnostics.push(message);
  else if (state.diagnostics.length === 100) state.diagnostics.push("Additional Preview diagnostics were capped at 100");
}

function optionalBoundedNumber(
  parameters: Readonly<Record<string, string>>,
  key: string,
  minimum: number,
  maximum: number
): number | undefined | "invalid" {
  const source = optional(parameters, key);
  if (source === undefined) return undefined;
  if (!/^-?\d+(?:\.\d+)?$/.test(source)) return "invalid";
  const value = Number(source);
  return value >= minimum && value <= maximum ? value : "invalid";
}

function applyDirection(statement: StoryStatement, state: MutableStageState): boolean {
    if (statement.kind !== "direction") return false;
    const inspected = inspectDirectiveArguments(statement.summary);
    if (inspected.positional.length > 0) {
      addDiagnostic(state, `${statement.id}: legacy positional direction is not executed`);
      return true;
    }
    if (inspected.duplicateKeys.length > 0) {
      addDiagnostic(state, `${statement.id}: duplicate parameters are not executed`);
      return true;
    }
    const action = resolveDirectiveAction(statement.command, inspected.parameters.action);
    if (action === undefined) {
      addDiagnostic(state, `${statement.id}: action is invalid for @${statement.command}`);
      return true;
    }
    const standardParameters = new Set(DIRECTIVE_PARAMETERS[statement.command]);
    const actionParameters = new Set(directiveActionParameters(statement.command, action));
    const invalidActionParameters = Object.keys(inspected.parameters)
      .filter((key) => standardParameters.has(key) && !actionParameters.has(key));
    if (invalidActionParameters.length > 0) {
      addDiagnostic(state, `${statement.id}: action=${action} does not accept ${invalidActionParameters.join(", ")}`);
      return true;
    }
    const assetId = inspected.parameters.asset;
    if (directiveActionRequiresAsset(statement.command, action) && assetId === undefined) {
      addDiagnostic(state, `${statement.id}: asset is required for action=${action}`);
      return true;
    }
    if (statement.command === "background") {
      if (action === "clear") {
        delete state.background;
        return true;
      }
      state.background = {
        statementId: statement.id,
        assetId: assetId!,
        ...(optional(inspected.parameters, "transition") === undefined ? {} : { transition: inspected.parameters.transition }),
        ...(optional(inspected.parameters, "duration") === undefined ? {} : { duration: inspected.parameters.duration })
      };
    } else if (statement.command === "show") {
      const slot = inspected.parameters.slot ?? "primary";
      if (!SAFE_STAGE_SLOT.test(slot)) {
        addDiagnostic(state, `${statement.id}: slot must be a stable identifier`);
        return true;
      }
      if (action === "hide") {
        const current = state.characters.get(slot);
        if (current === undefined) {
          addDiagnostic(state, `${statement.id}: hide requires an active ${slot} slot`);
          return true;
        }
        state.characters.delete(slot);
        state.exitingCharacters.set(slot, {
          ...current,
          statementId: statement.id,
          exiting: true,
          transition: optional(inspected.parameters, "transition") ?? "fade",
          ...(optional(inspected.parameters, "duration") === undefined ? {} : { duration: inspected.parameters.duration })
        });
        return true;
      }
      const current = state.characters.get(slot);
      if (action === "move" && current === undefined) {
        addDiagnostic(state, `${statement.id}: move requires an active ${slot} slot`);
        return true;
      }
      if (action === "move" && !STAGE_MOVE_GEOMETRY_PARAMETERS.some((key) => inspected.parameters[key] !== undefined)) {
        addDiagnostic(state, `${statement.id}: move requires at least one Stage geometry parameter`);
        return true;
      }
      const easing = optional(inspected.parameters, "easing");
      if (action === "move" && easing !== undefined && !isStageEasing(easing)) {
        addDiagnostic(state, `${statement.id}: easing must be linear, ease-in, ease-out, or ease-in-out`);
        return true;
      }
      const zSource = inspected.parameters.z;
      const z = zSource === undefined ? (action === "move" ? current?.z ?? 0 : 0) : Number(zSource);
      if (!Number.isInteger(z) || z < MIN_STAGE_Z || z > MAX_STAGE_Z) {
        addDiagnostic(state, `${statement.id}: z must be an integer from ${MIN_STAGE_Z} to ${MAX_STAGE_Z}`);
        return true;
      }
      const geometry = {
        x: optionalBoundedNumber(inspected.parameters, "x", MIN_STAGE_PERCENT, MAX_STAGE_PERCENT),
        y: optionalBoundedNumber(inspected.parameters, "y", MIN_STAGE_PERCENT, MAX_STAGE_PERCENT),
        scale: optionalBoundedNumber(inspected.parameters, "scale", MIN_STAGE_SCALE, MAX_STAGE_SCALE),
        rotation: optionalBoundedNumber(inspected.parameters, "rotation", MIN_STAGE_ROTATION, MAX_STAGE_ROTATION),
        anchorX: optionalBoundedNumber(inspected.parameters, "anchorX", MIN_STAGE_ANCHOR, MAX_STAGE_ANCHOR),
        anchorY: optionalBoundedNumber(inspected.parameters, "anchorY", MIN_STAGE_ANCHOR, MAX_STAGE_ANCHOR)
      } as const;
      const invalidGeometry = Object.entries(geometry).find(([, value]) => value === "invalid");
      if (invalidGeometry !== undefined) {
        addDiagnostic(state, `${statement.id}: ${invalidGeometry[0]} is outside the frozen Stage geometry range`);
        return true;
      }
      if (action === "move") {
        state.characters.set(slot, {
          ...current!,
          statementId: statement.id,
          z,
          movementFrom: resolvePreviewCharacterGeometry(current!),
          transition: optional(inspected.parameters, "transition") ?? "slide",
          ...(easing === undefined ? {} : { easing: easing as StageEasing }),
          ...(optional(inspected.parameters, "duration") === undefined ? {} : { duration: inspected.parameters.duration }),
          ...(optional(inspected.parameters, "position") === undefined ? {} : { position: inspected.parameters.position }),
          ...(typeof geometry.x === "number" ? { x: geometry.x } : {}),
          ...(typeof geometry.y === "number" ? { y: geometry.y } : {}),
          ...(typeof geometry.scale === "number" ? { scale: geometry.scale } : {}),
          ...(typeof geometry.rotation === "number" ? { rotation: geometry.rotation } : {}),
          ...(typeof geometry.anchorX === "number" ? { anchorX: geometry.anchorX } : {}),
          ...(typeof geometry.anchorY === "number" ? { anchorY: geometry.anchorY } : {})
        });
        return true;
      }
      state.characters.set(slot, {
        statementId: statement.id,
        assetId: assetId!,
        slot,
        z,
        ...(optional(inspected.parameters, "transition") === undefined ? {} : { entering: true }),
        ...(typeof geometry.x === "number" ? { x: geometry.x } : {}),
        ...(typeof geometry.y === "number" ? { y: geometry.y } : {}),
        ...(typeof geometry.scale === "number" ? { scale: geometry.scale } : {}),
        ...(typeof geometry.rotation === "number" ? { rotation: geometry.rotation } : {}),
        ...(typeof geometry.anchorX === "number" ? { anchorX: geometry.anchorX } : {}),
        ...(typeof geometry.anchorY === "number" ? { anchorY: geometry.anchorY } : {}),
        ...(optional(inspected.parameters, "transition") === undefined ? {} : { transition: inspected.parameters.transition }),
        ...(optional(inspected.parameters, "duration") === undefined ? {} : { duration: inspected.parameters.duration }),
        ...(optional(inspected.parameters, "expression") === undefined ? {} : { expression: inspected.parameters.expression }),
        ...(optional(inspected.parameters, "position") === undefined ? {} : { position: inspected.parameters.position })
      });
    } else {
      const bus = inspected.parameters.bus;
      if (bus === undefined || !AUDIO_BUSES.has(bus)) {
        addDiagnostic(state, `${statement.id}: a valid audio bus is required`);
        return true;
      }
      if (action === "stop") {
        state.audio.delete(bus as PreviewAudioLayerPlan["bus"]);
        return true;
      }
      if (action === "pause" || action === "resume") {
        const current = state.audio.get(bus as PreviewAudioLayerPlan["bus"]);
        if (current === undefined) {
          addDiagnostic(state, `${statement.id}: ${action} requires an active ${bus} layer`);
          return true;
        }
        state.audio.set(bus as PreviewAudioLayerPlan["bus"], {
          ...current,
          playback: action === "pause" ? "paused" : "playing"
        });
        return true;
      }
      const volumeSource = inspected.parameters.volume;
      const volume = volumeSource === undefined ? 1 : Number(volumeSource);
      if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
        addDiagnostic(state, `${statement.id}: volume must be between 0 and 1`);
        return true;
      }
      state.audio.set(bus as PreviewAudioLayerPlan["bus"], {
        statementId: statement.id,
        assetId: assetId!,
        bus: bus as PreviewAudioLayerPlan["bus"],
        loop: inspected.parameters.loop === "true",
        volume,
        playback: "playing",
        ...(optional(inspected.parameters, "fade") === undefined ? {} : { fade: inspected.parameters.fade })
      });
    }
    return true;
}

function settleCharacterTransitions(state: MutableStageState): boolean {
  let changed = false;
  for (const [slot, layer] of state.characters) {
    if (layer.entering !== true && layer.movementFrom === undefined) continue;
    const { entering: _entering, movementFrom: _movementFrom, ...settled } = layer;
    state.characters.set(slot, settled);
    changed = true;
  }
  return changed;
}

function snapshotStageState(state: MutableStageState): PreviewStagePlan {
  const characters = [...state.characters.values(), ...state.exitingCharacters.values()].sort((left, right) =>
    (left.z ?? 0) - (right.z ?? 0) || (left.slot ?? "").localeCompare(right.slot ?? "")
  );
  const audioLayers = [...state.audio.values()].sort((left, right) => left.bus.localeCompare(right.bus));
  const identity = {
    background: state.background ?? null,
    characters,
    audio: audioLayers,
    diagnostics: state.diagnostics
  };
  const resourceIdentity = {
    background: state.background ?? null,
    characters,
    audio: audioLayers.map(({ playback: _playback, ...layer }) => layer),
    diagnostics: state.diagnostics
  };
  return {
    key: JSON.stringify(identity),
    resourceKey: JSON.stringify(resourceIdentity),
    ...(state.background === undefined ? {} : { background: state.background }),
    characters,
    audio: audioLayers,
    diagnostics: [...state.diagnostics]
  };
}

export function resolvePreviewCharacterGeometry(layer: PreviewVisualLayerPlan): PreviewCharacterGeometry {
  const defaultX = layer.position === "left" ? 20 : layer.position === "right" ? 80 : 50;
  return {
    x: layer.x ?? defaultX,
    y: layer.y ?? 100,
    scale: layer.scale ?? 1,
    rotation: layer.rotation ?? 0,
    anchorX: layer.anchorX ?? 0.5,
    anchorY: layer.anchorY ?? 1
  };
}

export function compilePreviewStageTimeline(statements: readonly StoryStatement[]): readonly PreviewStagePlan[] {
  const state: MutableStageState = { characters: new Map(), exitingCharacters: new Map(), audio: new Map(), diagnostics: [] };
  const timeline: PreviewStagePlan[] = [];
  let previous: PreviewStagePlan | undefined;
  for (const statement of statements) {
    const settledCharacterTransition = settleCharacterTransitions(state);
    const clearedExit = state.exitingCharacters.size > 0;
    state.exitingCharacters.clear();
    const changed = applyDirection(statement, state);
    if (!changed && !settledCharacterTransition && !clearedExit && previous !== undefined) {
      timeline.push(previous);
      continue;
    }
    const candidate = snapshotStageState(state);
    const plan = previous?.key === candidate.key ? previous : candidate;
    timeline.push(plan);
    previous = plan;
  }
  return timeline;
}

export function derivePreviewStagePlan(
  statements: readonly StoryStatement[],
  inclusiveIndex: number
): PreviewStagePlan {
  if (statements.length === 0) return snapshotStageState({ characters: new Map(), exitingCharacters: new Map(), audio: new Map(), diagnostics: [] });
  const index = Math.min(Math.max(inclusiveIndex, 0), statements.length - 1);
  return compilePreviewStageTimeline(statements)[index] ?? snapshotStageState({ characters: new Map(), exitingCharacters: new Map(), audio: new Map(), diagnostics: [] });
}

function compatible(entry: AssetIndexEntry, role: "background" | "character" | "audio"): boolean {
  if (role === "background") return entry.kind === "background" || entry.kind === "cg";
  return entry.kind === role;
}

function abortError(): DOMException {
  return new DOMException("Preview media transition was cancelled", "AbortError");
}

export async function loadPreviewMedia(
  plan: PreviewStagePlan,
  index: AssetIndex,
  reader: PreviewAssetReader,
  urls: PreviewUrlFactory,
  signal: AbortSignal
): Promise<LoadedPreviewMedia> {
  const createdUrls: string[] = [];
  const loadedUrls = new Map<string, string>();
  const errors = [...plan.diagnostics];
  const load = async (
    layer: PreviewVisualLayerPlan | PreviewAudioLayerPlan,
    role: "background" | "character" | "audio"
  ): Promise<string | undefined> => {
    if (signal.aborted) throw abortError();
    const entry = index.assets.find((candidate) => candidate.assetId === layer.assetId);
    if (entry === undefined) {
      errors.push(`${layer.statementId}: Asset Index is missing ${layer.assetId}`);
      return undefined;
    }
    if (!compatible(entry, role)) {
      errors.push(`${layer.statementId}: ${entry.kind} is incompatible with ${role}`);
      return undefined;
    }
    const existingUrl = loadedUrls.get(entry.assetId);
    if (existingUrl !== undefined) return existingUrl;
    const bytes = await reader.read(entry.source.digest);
    if (signal.aborted) throw abortError();
    if (bytes === null) {
      errors.push(`${layer.statementId}: verified Blob is missing for ${layer.assetId}`);
      return undefined;
    }
    const url = urls.create(bytes, entry.source.mimeType);
    createdUrls.push(url);
    loadedUrls.set(entry.assetId, url);
    return url;
  };

  try {
    const backgroundUrl = plan.background === undefined ? undefined : await load(plan.background, "background");
    const characters: Array<PreviewVisualLayerPlan & { readonly url: string }> = [];
    for (const layer of plan.characters) {
      const url = await load(layer, "character");
      if (url !== undefined) characters.push({ ...layer, url });
    }
    const audio: Array<PreviewAudioLayerPlan & { readonly url: string }> = [];
    for (const layer of plan.audio) {
      const url = await load(layer, "audio");
      if (url !== undefined) audio.push({ ...layer, url });
    }
    if (signal.aborted) throw abortError();
    return {
      planKey: plan.resourceKey,
      ...(plan.background === undefined || backgroundUrl === undefined ? {} : { background: { ...plan.background, url: backgroundUrl } }),
      characters,
      audio,
      errors,
      objectUrls: createdUrls
    };
  } catch (error) {
    for (const url of createdUrls) urls.revoke(url);
    throw error;
  }
}

export function releasePreviewMedia(media: LoadedPreviewMedia, urls: PreviewUrlFactory): void {
  for (const url of new Set(media.objectUrls)) urls.revoke(url);
}

export function browserPreviewUrlFactory(): PreviewUrlFactory {
  return {
    create: (bytes, mimeType) => URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mimeType })),
    revoke: (url) => URL.revokeObjectURL(url)
  };
}

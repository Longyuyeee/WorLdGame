import type { StoryStatement } from "@world-studio/story-core";
import type { AssetIndex, AssetIndexEntry, BlobDigest } from "@world-studio/project-persistence";
import { inspectDirectiveArguments } from "@world-studio/story-language";

export interface PreviewVisualLayerPlan {
  readonly statementId: string;
  readonly assetId: string;
  readonly transition?: string;
  readonly duration?: string;
  readonly expression?: string;
  readonly position?: string;
}

export interface PreviewAudioLayerPlan {
  readonly statementId: string;
  readonly assetId: string;
  readonly bus: "voice" | "bgm" | "sfx" | "ambient";
  readonly loop: boolean;
  readonly volume: number;
  readonly fade?: string;
}

export interface PreviewStagePlan {
  readonly key: string;
  readonly background?: PreviewVisualLayerPlan;
  readonly character?: PreviewVisualLayerPlan;
  readonly audio: readonly PreviewAudioLayerPlan[];
  readonly diagnostics: readonly string[];
}

export interface LoadedPreviewMedia {
  readonly planKey: string;
  readonly background?: PreviewVisualLayerPlan & { readonly url: string };
  readonly character?: PreviewVisualLayerPlan & { readonly url: string };
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
  character?: PreviewVisualLayerPlan;
  readonly audio: Map<PreviewAudioLayerPlan["bus"], PreviewAudioLayerPlan>;
  readonly diagnostics: string[];
}

function addDiagnostic(state: MutableStageState, message: string): void {
  if (state.diagnostics.length < 100) state.diagnostics.push(message);
  else if (state.diagnostics.length === 100) state.diagnostics.push("Additional Preview diagnostics were capped at 100");
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
    const assetId = inspected.parameters.asset;
    if (assetId === undefined) {
      addDiagnostic(state, `${statement.id}: asset is required`);
      return true;
    }
    if (statement.command === "background") {
      state.background = {
        statementId: statement.id,
        assetId,
        ...(optional(inspected.parameters, "transition") === undefined ? {} : { transition: inspected.parameters.transition }),
        ...(optional(inspected.parameters, "duration") === undefined ? {} : { duration: inspected.parameters.duration })
      };
    } else if (statement.command === "show") {
      state.character = {
        statementId: statement.id,
        assetId,
        ...(optional(inspected.parameters, "transition") === undefined ? {} : { transition: inspected.parameters.transition }),
        ...(optional(inspected.parameters, "duration") === undefined ? {} : { duration: inspected.parameters.duration }),
        ...(optional(inspected.parameters, "expression") === undefined ? {} : { expression: inspected.parameters.expression }),
        ...(optional(inspected.parameters, "position") === undefined ? {} : { position: inspected.parameters.position })
      };
    } else {
      const bus = inspected.parameters.bus;
      if (bus === undefined || !AUDIO_BUSES.has(bus)) {
        addDiagnostic(state, `${statement.id}: a valid audio bus is required`);
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
        assetId,
        bus: bus as PreviewAudioLayerPlan["bus"],
        loop: inspected.parameters.loop === "true",
        volume,
        ...(optional(inspected.parameters, "fade") === undefined ? {} : { fade: inspected.parameters.fade })
      });
    }
    return true;
}

function snapshotStageState(state: MutableStageState): PreviewStagePlan {
  const audioLayers = [...state.audio.values()].sort((left, right) => left.bus.localeCompare(right.bus));
  const identity = {
    background: state.background ?? null,
    character: state.character ?? null,
    audio: audioLayers,
    diagnostics: state.diagnostics
  };
  return {
    key: JSON.stringify(identity),
    ...(state.background === undefined ? {} : { background: state.background }),
    ...(state.character === undefined ? {} : { character: state.character }),
    audio: audioLayers,
    diagnostics: [...state.diagnostics]
  };
}

export function compilePreviewStageTimeline(statements: readonly StoryStatement[]): readonly PreviewStagePlan[] {
  const state: MutableStageState = { audio: new Map(), diagnostics: [] };
  const timeline: PreviewStagePlan[] = [];
  let previous: PreviewStagePlan | undefined;
  for (const statement of statements) {
    const changed = applyDirection(statement, state);
    if (!changed && previous !== undefined) {
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
  if (statements.length === 0) return snapshotStageState({ audio: new Map(), diagnostics: [] });
  const index = Math.min(Math.max(inclusiveIndex, 0), statements.length - 1);
  return compilePreviewStageTimeline(statements)[index] ?? snapshotStageState({ audio: new Map(), diagnostics: [] });
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
    const characterUrl = plan.character === undefined ? undefined : await load(plan.character, "character");
    const audio: Array<PreviewAudioLayerPlan & { readonly url: string }> = [];
    for (const layer of plan.audio) {
      const url = await load(layer, "audio");
      if (url !== undefined) audio.push({ ...layer, url });
    }
    if (signal.aborted) throw abortError();
    return {
      planKey: plan.key,
      ...(plan.background === undefined || backgroundUrl === undefined ? {} : { background: { ...plan.background, url: backgroundUrl } }),
      ...(plan.character === undefined || characterUrl === undefined ? {} : { character: { ...plan.character, url: characterUrl } }),
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

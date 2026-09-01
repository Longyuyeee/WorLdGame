import type { PlayerCoreEffectSnapshotV1, PlayerCoreSnapshotV1 } from "@world-studio/player-core";

export interface PlayerMediaAssetSourceV1 {
  readonly assetId: string;
  readonly displayName: string;
  readonly mimeType: string;
  readonly url: string;
}

export interface PlayerStageImageV1 {
  readonly assetId: string;
  readonly displayName: string;
  readonly url: string;
  readonly transition: string;
  readonly durationMilliseconds: number;
  readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface PlayerStageDefaultPolicyV1 {
  readonly defaultDurationMilliseconds: number;
  readonly defaultEasing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface PlayerUiDefaultPolicyV1 {
  readonly defaultTextboxTemplate: "adv" | "nvl" | "bubble";
}

export interface PlayerStageCharacterV1 extends PlayerStageImageV1 {
  readonly slot: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly z: number;
}

export interface PlayerStageAudioV1 {
  readonly assetId: string;
  readonly displayName: string;
  readonly url: string;
  readonly bus: string;
  readonly loop: boolean;
  readonly volume: number;
  readonly status: "playing" | "paused";
}

export interface PlayerStageVideoV1 {
  readonly assetId: string;
  readonly displayName: string;
  readonly url: string;
  readonly effectId: string;
  readonly awaited: boolean;
  readonly status: "playing" | "ended";
}

export interface PlayerStagePresentationV1 {
  readonly background: PlayerStageImageV1 | null;
  readonly characters: readonly PlayerStageCharacterV1[];
  readonly audio: readonly PlayerStageAudioV1[];
  readonly video: PlayerStageVideoV1 | null;
  readonly cameraTransform: string;
  readonly textboxTemplate: "adv" | "nvl" | "bubble";
  readonly sceneDescription: string | null;
  readonly missingAssetIds: readonly string[];
  readonly pendingDurationMilliseconds: number;
}

function text(effect: PlayerCoreEffectSnapshotV1, key: string): string | undefined {
  const value = effect.payload[key];
  return typeof value === "string" ? value : undefined;
}

function number(effect: PlayerCoreEffectSnapshotV1, key: string, fallback: number): number {
  const value = effect.payload[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(effect: PlayerCoreEffectSnapshotV1, key: string): boolean {
  return effect.payload[key] === true;
}

function action(effect: PlayerCoreEffectSnapshotV1): string {
  return text(effect, "action") ?? effect.kind.split(".").at(-1) ?? "set";
}

function duration(effect: PlayerCoreEffectSnapshotV1, fallback: number): number {
  const source = text(effect, "duration") ?? text(effect, "fade");
  if (source === undefined) return fallback;
  const matched = /^(\d+(?:\.\d+)?)(ms|s)$/u.exec(source);
  if (matched === null) return fallback;
  const value = Number(matched[1]) * (matched[2] === "s" ? 1000 : 1);
  return Math.max(1, Math.min(10_000, value));
}

function easing(effect: PlayerCoreEffectSnapshotV1, fallback: PlayerStageImageV1["easing"]): PlayerStageImageV1["easing"] {
  const value = text(effect, "easing");
  return value === "linear" || value === "ease-in" || value === "ease-out" || value === "ease-in-out" ? value : fallback;
}

export function derivePlayerStagePresentationV1(
  snapshot: PlayerCoreSnapshotV1,
  sources: readonly PlayerMediaAssetSourceV1[] = [],
  policy: PlayerStageDefaultPolicyV1 = { defaultDurationMilliseconds: 360, defaultEasing: "linear" },
  uiPolicy: PlayerUiDefaultPolicyV1 = { defaultTextboxTemplate: "adv" }
): PlayerStagePresentationV1 {
  const assets = new Map(sources.map((source) => [source.assetId, source]));
  const missing = new Set<string>();
  let background: PlayerStageImageV1 | null = null;
  const characters: PlayerStageCharacterV1[] = [];
  const audio: PlayerStageAudioV1[] = [];
  let video: PlayerStageVideoV1 | null = null;
  let cameraTransform = "translate(0%, 0%) scale(1) rotate(0deg)";
  let textboxTemplate: PlayerStagePresentationV1["textboxTemplate"] = uiPolicy.defaultTextboxTemplate;
  let sceneDescription: string | null = null;

  for (const effect of snapshot.effects.active) {
    const currentAction = action(effect);
    const description = text(effect, "description");
    if (effect.kind.startsWith("background.")) {
      sceneDescription = description ?? sceneDescription;
      const assetId = text(effect, "asset");
      if (currentAction === "clear" || assetId === undefined) {
        background = null;
      } else {
        const asset = assets.get(assetId);
        if (asset === undefined || (!asset.mimeType.startsWith("image/") && !asset.mimeType.startsWith("video/"))) missing.add(assetId);
        else if (asset.mimeType.startsWith("video/")) video = { assetId, displayName: asset.displayName, url: asset.url, effectId: effect.effectId, awaited: false, status: "ended" };
        else background = { assetId, displayName: asset.displayName, url: asset.url, transition: text(effect, "transition") ?? "none", durationMilliseconds: duration(effect, policy.defaultDurationMilliseconds), easing: easing(effect, policy.defaultEasing) };
      }
    } else if (effect.kind.startsWith("show.") && currentAction !== "hide") {
      const assetId = text(effect, "asset");
      if (assetId === undefined) continue;
      const asset = assets.get(assetId);
      if (asset === undefined || !asset.mimeType.startsWith("image/")) missing.add(assetId);
      else characters.push({
        assetId,
        displayName: asset.displayName,
        url: asset.url,
        slot: text(effect, "slot") ?? effect.channel,
        x: number(effect, "x", 50),
        y: number(effect, "y", 100),
        scale: number(effect, "scale", 1),
        rotation: number(effect, "rotation", 0),
        anchorX: number(effect, "anchorX", 0.5),
        anchorY: number(effect, "anchorY", 1),
        z: number(effect, "z", 0),
        transition: text(effect, "transition") ?? "none",
        durationMilliseconds: duration(effect, policy.defaultDurationMilliseconds),
        easing: easing(effect, policy.defaultEasing)
      });
    } else if (effect.kind.startsWith("audio.") && currentAction !== "stop") {
      const assetId = text(effect, "asset");
      if (assetId === undefined) continue;
      const asset = assets.get(assetId);
      if (asset === undefined || !asset.mimeType.startsWith("audio/")) missing.add(assetId);
      else audio.push({
        assetId,
        displayName: asset.displayName,
        url: asset.url,
        bus: text(effect, "bus") ?? effect.channel,
        loop: boolean(effect, "loop"),
        volume: Math.max(0, Math.min(1, number(effect, "volume", number(effect, "volumePermille", 1000) / 1000))),
        status: currentAction === "pause" ? "paused" : "playing"
      });
    } else if (effect.kind.startsWith("camera.")) {
      cameraTransform = `translate(${number(effect, "x", 0)}%, ${number(effect, "y", 0)}%) scale(${number(effect, "zoom", 1)}) rotate(${number(effect, "rotation", 0)}deg)`;
    } else if (effect.kind.startsWith("textbox.")) {
      if (currentAction === "reset") textboxTemplate = uiPolicy.defaultTextboxTemplate;
      else if (currentAction === "set") {
        const template = text(effect, "template");
        if (template === "adv" || template === "nvl" || template === "bubble") textboxTemplate = template;
      }
    }
  }

  const pending = snapshot.effects.pending;
  if (pending !== null && pending.kind.startsWith("background.")) {
    const assetId = text(pending, "asset");
    if (assetId !== undefined) {
      const asset = assets.get(assetId);
      if (asset === undefined || !asset.mimeType.startsWith("video/")) missing.add(assetId);
      else video = { assetId, displayName: asset.displayName, url: asset.url, effectId: pending.effectId, awaited: true, status: "playing" };
    }
  }

  return {
    background,
    characters: characters.sort((left, right) => left.z - right.z || left.slot.localeCompare(right.slot)),
    audio,
    video,
    cameraTransform,
    textboxTemplate,
    sceneDescription,
    missingAssetIds: [...missing].sort(),
    pendingDurationMilliseconds: snapshot.effects.pending === null ? 0 : duration(snapshot.effects.pending, policy.defaultDurationMilliseconds)
  };
}

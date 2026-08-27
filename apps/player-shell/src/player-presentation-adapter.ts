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
}

export interface PlayerStageCharacterV1 extends PlayerStageImageV1 {
  readonly slot: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
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

export interface PlayerStagePresentationV1 {
  readonly background: PlayerStageImageV1 | null;
  readonly characters: readonly PlayerStageCharacterV1[];
  readonly audio: readonly PlayerStageAudioV1[];
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

function duration(effect: PlayerCoreEffectSnapshotV1): number {
  const source = text(effect, "duration") ?? text(effect, "fade");
  if (source === undefined) return 320;
  const matched = /^(\d+(?:\.\d+)?)(ms|s)$/u.exec(source);
  if (matched === null) return 320;
  const value = Number(matched[1]) * (matched[2] === "s" ? 1000 : 1);
  return Math.max(1, Math.min(10_000, value));
}

export function derivePlayerStagePresentationV1(
  snapshot: PlayerCoreSnapshotV1,
  sources: readonly PlayerMediaAssetSourceV1[] = []
): PlayerStagePresentationV1 {
  const assets = new Map(sources.map((source) => [source.assetId, source]));
  const missing = new Set<string>();
  let background: PlayerStageImageV1 | null = null;
  const characters: PlayerStageCharacterV1[] = [];
  const audio: PlayerStageAudioV1[] = [];
  let cameraTransform = "translate(0%, 0%) scale(1) rotate(0deg)";
  let textboxTemplate: PlayerStagePresentationV1["textboxTemplate"] = "adv";
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
        if (asset === undefined || !asset.mimeType.startsWith("image/")) missing.add(assetId);
        else background = { assetId, displayName: asset.displayName, url: asset.url, transition: text(effect, "transition") ?? "none", durationMilliseconds: duration(effect) };
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
        z: number(effect, "z", 0),
        transition: text(effect, "transition") ?? "none",
        durationMilliseconds: duration(effect)
      });
    } else if (effect.kind.startsWith("audio.") && !["stop", "pause"].includes(currentAction)) {
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
    } else if (effect.kind.startsWith("textbox.") && currentAction === "set") {
      const template = text(effect, "template");
      if (template === "nvl" || template === "bubble") textboxTemplate = template;
    }
  }

  return {
    background,
    characters: characters.sort((left, right) => left.z - right.z || left.slot.localeCompare(right.slot)),
    audio,
    cameraTransform,
    textboxTemplate,
    sceneDescription,
    missingAssetIds: [...missing].sort(),
    pendingDurationMilliseconds: snapshot.effects.pending === null ? 0 : duration(snapshot.effects.pending)
  };
}

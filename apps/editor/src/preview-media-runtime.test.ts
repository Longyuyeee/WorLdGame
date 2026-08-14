import { describe, expect, it } from "vitest";
import { createAssetIndex, createBlobDigest, type AssetIndex, type AssetIndexEntry } from "@world-studio/project-persistence";
import type { StoryStatement } from "@world-studio/story-core";
import {
  derivePreviewStagePlan,
  compilePreviewStageTimeline,
  loadPreviewMedia,
  releasePreviewMedia,
  resolvePreviewCharacterGeometry,
  type PreviewUrlFactory
} from "./preview-media-runtime";

function entry(assetId: string, kind: AssetIndexEntry["kind"], bytes: Uint8Array): AssetIndexEntry {
  return { assetId, kind, displayName: assetId, source: { digest: createBlobDigest(bytes), byteLength: bytes.byteLength, mimeType: kind === "audio" ? "audio/wav" : "image/png" }, tags: [] };
}

const statements: readonly StoryStatement[] = [
  { kind: "direction", id: "bg", command: "background", summary: "asset=bg_gate transition=fade duration=400ms" },
  { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "hello" },
  { kind: "direction", id: "show", command: "show", summary: "asset=hero_smile expression=smile position=left" },
  { kind: "direction", id: "bgm", command: "audio", summary: "asset=theme bus=bgm loop=true volume=0.6 fade=1s" },
  { kind: "direction", id: "voice", command: "audio", summary: "asset=voice_1 bus=voice loop=false" }
];

describe("preview media runtime", () => {
  it("derives cumulative stage state and rewinds deterministically", () => {
    const dialoguePlan = derivePreviewStagePlan(statements, 1);
    expect(dialoguePlan).toMatchObject({ background: { assetId: "bg_gate" }, audio: [] });
    expect(dialoguePlan.characters).toEqual([]);
    expect(derivePreviewStagePlan(statements, 4)).toMatchObject({
      background: { assetId: "bg_gate", transition: "fade" },
      characters: [{ assetId: "hero_smile", slot: "primary", z: 0, expression: "smile", position: "left" }],
      audio: [{ assetId: "theme", bus: "bgm", loop: true, volume: 0.6, playback: "playing" }, { assetId: "voice_1", bus: "voice", loop: false, volume: 1, playback: "playing" }]
    });
    expect(derivePreviewStagePlan(statements, 1).key).toBe(derivePreviewStagePlan(statements, 0).key);
    const timeline = compilePreviewStageTimeline(statements);
    expect(timeline[1]).toBe(timeline[0]);
  });

  it("refuses to execute legacy, duplicate and malformed audio directions", () => {
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "legacy", command: "background", summary: "human description" },
      { kind: "direction", id: "duplicate", command: "show", summary: "asset=a asset=b" },
      { kind: "direction", id: "audio", command: "audio", summary: "asset=sound bus=music" }
    ], 2);
    expect(plan.audio).toEqual([]);
    expect(plan.background).toBeUndefined();
    expect(plan.characters).toEqual([]);
    expect(plan.diagnostics).toHaveLength(3);
  });

  it("replays multi-slot characters, background clear and audio transport actions reversibly", () => {
    const controlled: readonly StoryStatement[] = [
      { kind: "direction", id: "bg", command: "background", summary: "action=set asset=bg_gate" },
      { kind: "direction", id: "left", command: "show", summary: "action=show asset=hero_smile slot=left z=2 position=left" },
      { kind: "direction", id: "right", command: "show", summary: "action=show asset=friend slot=right z=1 position=right" },
      { kind: "direction", id: "play", command: "audio", summary: "action=play asset=theme bus=bgm loop=true" },
      { kind: "direction", id: "pause", command: "audio", summary: "action=pause bus=bgm" },
      { kind: "direction", id: "resume", command: "audio", summary: "action=resume bus=bgm" },
      { kind: "direction", id: "hide", command: "show", summary: "action=hide slot=left" },
      { kind: "direction", id: "stop", command: "audio", summary: "action=stop bus=bgm" },
      { kind: "direction", id: "clear", command: "background", summary: "action=clear" }
    ];
    expect(derivePreviewStagePlan(controlled, 3)).toMatchObject({
      background: { assetId: "bg_gate" },
      characters: [{ slot: "right", z: 1 }, { slot: "left", z: 2 }],
      audio: [{ bus: "bgm", playback: "playing" }]
    });
    expect(derivePreviewStagePlan(controlled, 4).audio[0]?.playback).toBe("paused");
    expect(derivePreviewStagePlan(controlled, 5).audio[0]?.playback).toBe("playing");
    expect(derivePreviewStagePlan(controlled, 4).resourceKey).toBe(derivePreviewStagePlan(controlled, 3).resourceKey);
    expect(derivePreviewStagePlan(controlled, 5).resourceKey).toBe(derivePreviewStagePlan(controlled, 3).resourceKey);
    expect(derivePreviewStagePlan(controlled, 4).key).not.toBe(derivePreviewStagePlan(controlled, 3).key);
    expect(derivePreviewStagePlan(controlled, 6).characters.map((layer) => layer.slot)).toEqual(["right"]);
    expect(derivePreviewStagePlan(controlled, 7).audio).toEqual([]);
    expect(derivePreviewStagePlan(controlled, 8).background).toBeUndefined();
    expect(derivePreviewStagePlan(controlled, 3).characters).toHaveLength(2);
  });

  it("freezes production Stage geometry and keeps position presets backward compatible", () => {
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "left", command: "show", summary: "asset=hero slot=hero position=left x=27.5 y=91 scale=1.25 rotation=-8 anchorX=0.4 anchorY=0.95" }
    ], 0);
    expect(plan.characters[0]).toMatchObject({
      x: 27.5, y: 91, scale: 1.25, rotation: -8, anchorX: 0.4, anchorY: 0.95
    });
    expect(resolvePreviewCharacterGeometry(plan.characters[0]!)).toEqual({
      x: 27.5, y: 91, scale: 1.25, rotation: -8, anchorX: 0.4, anchorY: 0.95
    });
    expect(resolvePreviewCharacterGeometry({ statementId: "legacy", assetId: "hero", position: "right" }))
      .toEqual({ x: 80, y: 100, scale: 1, rotation: 0, anchorX: 0.5, anchorY: 1 });
  });

  it("fails closed when any Stage geometry parameter is outside its frozen range", () => {
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "bad-scale", command: "show", summary: "asset=hero scale=4.1" },
      { kind: "direction", id: "bad-anchor", command: "show", summary: "asset=hero anchorX=-0.1" }
    ], 1);
    expect(plan.characters).toEqual([]);
    expect(plan.diagnostics).toEqual([
      "bad-scale: scale is outside the frozen Stage geometry range",
      "bad-anchor: anchorX is outside the frozen Stage geometry range"
    ]);
  });

  it("fails closed for invalid actions, slots, z-order and inactive audio controls", () => {
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "action", command: "background", summary: "action=hide" },
      { kind: "direction", id: "slot", command: "show", summary: "asset=hero slot=bad/slot" },
      { kind: "direction", id: "z", command: "show", summary: "asset=hero slot=hero z=101" },
      { kind: "direction", id: "pause", command: "audio", summary: "action=pause bus=bgm" }
    ], 3);
    expect(plan.background).toBeUndefined();
    expect(plan.characters).toEqual([]);
    expect(plan.audio).toEqual([]);
    expect(plan.diagnostics).toHaveLength(4);
  });

  it("loads verified indexed media, reports partial failures and releases every URL", async () => {
    const bg = new Uint8Array([1, 2]);
    const hero = new Uint8Array([3, 4]);
    const theme = new Uint8Array([5, 6]);
    const index: AssetIndex = { ...createAssetIndex(), indexRevision: 1, assets: [entry("bg_gate", "cg", bg), entry("hero_smile", "character", hero), entry("theme", "audio", theme)] };
    const byDigest = new Map(index.assets.map((item, position) => [item.source.digest, [bg, hero, theme][position]]));
    const revoked: string[] = [];
    let serial = 0;
    const urls: PreviewUrlFactory = { create: (_bytes, mime) => `blob:${mime}:${++serial}`, revoke: (url) => revoked.push(url) };
    const media = await loadPreviewMedia(derivePreviewStagePlan(statements, 4), index, { read: async (digest) => byDigest.get(digest) ?? null }, urls, new AbortController().signal);
    expect(media).toMatchObject({ background: { url: "blob:image/png:1" }, characters: [{ url: "blob:image/png:2" }], audio: [{ url: "blob:audio/wav:3" }] });
    expect(media.errors).toEqual(["voice: Asset Index is missing voice_1"]);
    releasePreviewMedia(media, urls);
    expect(revoked).toEqual(["blob:image/png:1", "blob:image/png:2", "blob:audio/wav:3"]);
  });

  it("deduplicates one verified Blob and Object URL reused by multiple audio buses", async () => {
    const bytes = new Uint8Array([9, 10]);
    const index: AssetIndex = { ...createAssetIndex(), assets: [entry("shared_audio", "audio", bytes)] };
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "bgm_shared", command: "audio", summary: "asset=shared_audio bus=bgm loop=true" },
      { kind: "direction", id: "ambient_shared", command: "audio", summary: "asset=shared_audio bus=ambient loop=true" }
    ], 1);
    let reads = 0;
    let creates = 0;
    const media = await loadPreviewMedia(plan, index, { read: async () => { reads += 1; return bytes; } }, {
      create: () => `blob:shared:${++creates}`,
      revoke: () => undefined
    }, new AbortController().signal);
    expect(media.audio.map((layer) => layer.url)).toEqual(["blob:shared:1", "blob:shared:1"]);
    expect(reads).toBe(1);
    expect(creates).toBe(1);
    expect(media.objectUrls).toEqual(["blob:shared:1"]);
  });

  it("fails closed on kind mismatch and missing verified Blob", async () => {
    const bytes = new Uint8Array([7]);
    const index: AssetIndex = { ...createAssetIndex(), assets: [entry("bg_gate", "audio", bytes), entry("hero_smile", "character", bytes)] };
    const urls: PreviewUrlFactory = { create: () => "blob:unexpected", revoke: () => undefined };
    const media = await loadPreviewMedia(derivePreviewStagePlan(statements, 2), index, { read: async () => null }, urls, new AbortController().signal);
    expect(media.background).toBeUndefined();
    expect(media.characters).toEqual([]);
    expect(media.errors).toEqual(["bg: audio is incompatible with background", "show: verified Blob is missing for hero_smile"]);
  });

  it("cancels stale loads without publishing or leaking an Object URL", async () => {
    const bytes = new Uint8Array([8]);
    const index: AssetIndex = { ...createAssetIndex(), assets: [entry("bg_gate", "cg", bytes)] };
    const controller = new AbortController();
    let finish!: (value: Uint8Array) => void;
    const read = new Promise<Uint8Array>((resolve) => { finish = resolve; });
    let created = 0;
    const urls: PreviewUrlFactory = { create: () => `blob:${++created}`, revoke: () => undefined };
    const loading = loadPreviewMedia(derivePreviewStagePlan(statements, 0), index, { read: async () => read }, urls, controller.signal);
    controller.abort();
    finish(bytes);
    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(created).toBe(0);
  });
});

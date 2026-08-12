import { describe, expect, it } from "vitest";
import { createAssetIndex, createBlobDigest, type AssetIndex, type AssetIndexEntry } from "@world-studio/project-persistence";
import type { StoryStatement } from "@world-studio/story-core";
import {
  derivePreviewStagePlan,
  compilePreviewStageTimeline,
  loadPreviewMedia,
  releasePreviewMedia,
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
    expect(dialoguePlan.character).toBeUndefined();
    expect(derivePreviewStagePlan(statements, 4)).toMatchObject({
      background: { assetId: "bg_gate", transition: "fade" },
      character: { assetId: "hero_smile", expression: "smile", position: "left" },
      audio: [{ assetId: "theme", bus: "bgm", loop: true, volume: 0.6 }, { assetId: "voice_1", bus: "voice", loop: false, volume: 1 }]
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
    expect(plan.character).toBeUndefined();
    expect(plan.diagnostics).toHaveLength(3);
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
    expect(media).toMatchObject({ background: { url: "blob:image/png:1" }, character: { url: "blob:image/png:2" }, audio: [{ url: "blob:audio/wav:3" }] });
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
    expect(media.character).toBeUndefined();
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

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
  it("derives, resets, and fails closed on canonical textbox templates", () => {
    const controlled: readonly StoryStatement[] = [
      { kind: "direction", id: "nvl", command: "textbox", summary: "action=set template=nvl" },
      { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "hello" },
      { kind: "direction", id: "reset", command: "textbox", summary: "action=reset" },
      { kind: "direction", id: "bad", command: "textbox", summary: "action=set template=cinema" }
    ];
    expect(derivePreviewStagePlan(controlled, 0).dialogueTemplate).toBe("nvl");
    expect(derivePreviewStagePlan(controlled, 1).dialogueTemplate).toBe("nvl");
    expect(derivePreviewStagePlan(controlled, 2).dialogueTemplate).toBe("adv");
    const rejected = derivePreviewStagePlan(controlled, 3);
    expect(rejected.dialogueTemplate).toBe("adv");
    expect(rejected.diagnostics.at(-1)).toContain("requires adv, nvl, or bubble");
  });

  it("uses the configured textbox default only when no explicit template owns the stage", () => {
    const controlled: readonly StoryStatement[] = [
      { kind: "direction", id: "nvl", command: "textbox", summary: "action=set template=nvl" },
      { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "hello" },
      { kind: "direction", id: "reset", command: "textbox", summary: "action=reset" }
    ];
    expect(derivePreviewStagePlan([], 0, "bubble").dialogueTemplate).toBe("bubble");
    expect(derivePreviewStagePlan(controlled, 1, "bubble").dialogueTemplate).toBe("nvl");
    expect(derivePreviewStagePlan(controlled, 2, "bubble").dialogueTemplate).toBe("bubble");
    expect(compilePreviewStageTimeline(controlled, "bubble")[2]?.dialogueTemplate).toBe("bubble");
  });

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
      { kind: "direction", id: "hide", command: "show", summary: "action=hide slot=left transition=fade duration=450ms" },
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
    expect(derivePreviewStagePlan(controlled, 6).characters).toEqual([
      expect.objectContaining({ slot: "right" }),
      expect.objectContaining({ statementId: "hide", slot: "left", assetId: "hero_smile", exiting: true, transition: "fade", duration: "450ms" })
    ]);
    expect(derivePreviewStagePlan(controlled, 7).audio).toEqual([]);
    expect(derivePreviewStagePlan(controlled, 7).characters.map((layer) => layer.slot)).toEqual(["right"]);
    expect(derivePreviewStagePlan(controlled, 8).background).toBeUndefined();
    expect(derivePreviewStagePlan(controlled, 3).characters).toHaveLength(2);
  });

  it("keeps a hidden slot for one exit frame, then removes it and rewinds deterministically", () => {
    const hiding: readonly StoryStatement[] = [
      { kind: "direction", id: "show", command: "show", summary: "action=show asset=hero slot=hero x=20 expression=smile" },
      { kind: "direction", id: "hide", command: "show", summary: "action=hide slot=hero duration=600ms" },
      { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "gone" }
    ];
    expect(derivePreviewStagePlan(hiding, 1).characters).toEqual([
      expect.objectContaining({ statementId: "hide", assetId: "hero", slot: "hero", x: 20, expression: "smile", exiting: true, transition: "fade", duration: "600ms" })
    ]);
    expect(derivePreviewStagePlan(hiding, 2).characters).toEqual([]);
    expect(derivePreviewStagePlan(hiding, 0).characters).toEqual([
      expect.objectContaining({ statementId: "show", assetId: "hero" })
    ]);
    expect(derivePreviewStagePlan(hiding, 0).characters[0]?.exiting).toBeUndefined();
    const missing = derivePreviewStagePlan([
      { kind: "direction", id: "missing", command: "show", summary: "action=hide slot=hero" }
    ], 0);
    expect(missing.characters).toEqual([]);
    expect(missing.diagnostics).toEqual(["missing: hide requires an active hero slot"]);
    const resourceBearing = derivePreviewStagePlan([
      { kind: "direction", id: "show", command: "show", summary: "action=show asset=hero slot=hero" },
      { kind: "direction", id: "hide", command: "show", summary: "action=hide slot=hero asset=stale" }
    ], 1);
    expect(resourceBearing.characters).toEqual([expect.objectContaining({ statementId: "show", assetId: "hero" })]);
    expect(resourceBearing.diagnostics).toEqual(["hide: action=hide does not accept asset"]);
  });

  it("moves an active slot without replacing its resource and rewinds to the authored geometry", () => {
    const movement: readonly StoryStatement[] = [
      { kind: "direction", id: "show", command: "show", summary: "action=show asset=hero slot=hero x=20 y=100 expression=smile" },
      { kind: "direction", id: "move", command: "show", summary: "action=move slot=hero x=80 scale=1.5 rotation=12 duration=600ms easing=ease-in-out" },
      { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "arrived" }
    ];
    const before = derivePreviewStagePlan(movement, 0).characters[0]!;
    const moved = derivePreviewStagePlan(movement, 1).characters[0]!;
    expect(before).toMatchObject({ statementId: "show", assetId: "hero", x: 20, expression: "smile" });
    expect(before.movementFrom).toBeUndefined();
    expect(moved).toMatchObject({
      statementId: "move",
      assetId: "hero",
      x: 80,
      y: 100,
      scale: 1.5,
      rotation: 12,
      expression: "smile",
      transition: "slide",
      duration: "600ms",
      easing: "ease-in-out",
      movementFrom: { x: 20, y: 100, scale: 1, rotation: 0, anchorX: 0.5, anchorY: 1 }
    });
    const timeline = compilePreviewStageTimeline(movement);
    expect(timeline[2]).not.toBe(timeline[1]);
    expect(timeline[2]?.characters[0]).toMatchObject({ statementId: "move", assetId: "hero", x: 80, scale: 1.5 });
    expect(timeline[2]?.characters[0]?.movementFrom).toBeUndefined();
    expect(derivePreviewStagePlan(movement, 0).characters[0]).toEqual(before);
  });

  it("keeps one validated cubic Bezier Move and fails closed before mutating the slot", () => {
    const base: readonly StoryStatement[] = [
      { kind: "direction", id: "show", command: "show", summary: "action=show asset=hero slot=hero x=20 y=80" }
    ];
    const valid = derivePreviewStagePlan([...base, {
      kind: "direction", id: "curve", command: "show",
      summary: "action=move slot=hero x=80 y=80 curve=bezier control1X=30 control1Y=20 control2X=70 control2Y=20 duration=650ms easing=ease-in-out"
    }], 1);
    expect(valid.characters[0]).toMatchObject({
      statementId: "curve", assetId: "hero", x: 80, y: 80, curve: "bezier",
      control1X: 30, control1Y: 20, control2X: 70, control2Y: 20,
      movementFrom: { x: 20, y: 80 }
    });
    const invalid = derivePreviewStagePlan([...base, {
      kind: "direction", id: "bad_curve", command: "show",
      summary: "action=move slot=hero x=80 y=80 curve=bezier control1X=30 control1Y=20 control2X=70"
    }], 1);
    expect(invalid.characters[0]).toMatchObject({ statementId: "show", x: 20, y: 80 });
    expect(invalid.diagnostics).toEqual(["bad_curve: curve=bezier requires bounded x, y, and four control point coordinates"]);
  });

  it("derives, settles, resets, and rewinds the canonical camera track", () => {
    const camera: readonly StoryStatement[] = [
      { kind: "direction", id: "camera_move", command: "camera", summary: "action=move x=18 y=-10 zoom=1.25 rotation=2 duration=600ms easing=ease-out" },
      { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "framed" },
      { kind: "direction", id: "camera_reset", command: "camera", summary: "action=reset duration=300ms easing=ease-in-out" }
    ];
    expect(derivePreviewStagePlan(camera, 0).camera).toEqual({
      statementId: "camera_move", x: 18, y: -10, zoom: 1.25, rotation: 2,
      duration: "600ms", easing: "ease-out", movementFrom: { x: 0, y: 0, zoom: 1, rotation: 0 }
    });
    expect(derivePreviewStagePlan(camera, 1).camera).toMatchObject({ statementId: "camera_move", x: 18, y: -10, zoom: 1.25, rotation: 2 });
    expect(derivePreviewStagePlan(camera, 1).camera?.movementFrom).toBeUndefined();
    expect(derivePreviewStagePlan(camera, 2).camera).toMatchObject({
      statementId: "camera_reset", x: 0, y: 0, zoom: 1, rotation: 0,
      movementFrom: { x: 18, y: -10, zoom: 1.25, rotation: 2 }
    });
    expect(derivePreviewStagePlan(camera, 0).camera?.statementId).toBe("camera_move");
  });

  it("fails closed for empty or out-of-range camera moves", () => {
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "empty_camera", command: "camera", summary: "action=move duration=300ms" },
      { kind: "direction", id: "bad_camera", command: "camera", summary: "action=move zoom=4" }
    ], 1);
    expect(plan.camera).toBeUndefined();
    expect(plan.diagnostics).toEqual([
      "empty_camera: camera move requires at least one geometry parameter",
      "bad_camera: camera geometry is outside the frozen range"
    ]);
  });

  it("fails closed when a move uses an easing outside the frozen vocabulary", () => {
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "show", command: "show", summary: "action=show asset=hero slot=hero" },
      { kind: "direction", id: "move", command: "show", summary: "action=move slot=hero x=80 easing=spring" }
    ], 1);
    expect(plan.characters).toEqual([expect.objectContaining({ statementId: "show", assetId: "hero" })]);
    expect(plan.diagnostics).toEqual(["move: easing must be linear, ease-in, ease-out, or ease-in-out"]);
  });

  it("scopes Show entry transitions to their authored statement and restores them on rewind", () => {
    const entering: readonly StoryStatement[] = [
      { kind: "direction", id: "show", command: "show", summary: "action=show asset=hero slot=hero transition=fade duration=400ms" },
      { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "ready" }
    ];
    expect(derivePreviewStagePlan(entering, 0).characters[0]).toMatchObject({
      statementId: "show", assetId: "hero", entering: true, transition: "fade", duration: "400ms"
    });
    const settled = derivePreviewStagePlan(entering, 1).characters[0]!;
    expect(settled).toMatchObject({ statementId: "show", assetId: "hero", transition: "fade", duration: "400ms" });
    expect(settled.entering).toBeUndefined();
    expect(derivePreviewStagePlan(entering, 0).characters[0]?.entering).toBe(true);
  });

  it("retains only the previous background for one scoped replacement transition frame", () => {
    const replacing: readonly StoryStatement[] = [
      { kind: "direction", id: "old_bg", command: "background", summary: "action=set asset=bg_old" },
      { kind: "direction", id: "new_bg", command: "background", summary: "action=set asset=bg_new transition=dissolve duration=700ms" },
      { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "settled" }
    ];
    const transition = derivePreviewStagePlan(replacing, 1);
    expect(transition.background).toMatchObject({ statementId: "new_bg", assetId: "bg_new", transition: "dissolve", duration: "700ms" });
    expect(transition.previousBackground).toMatchObject({ statementId: "old_bg", assetId: "bg_old" });
    expect(derivePreviewStagePlan(replacing, 2).previousBackground).toBeUndefined();
    expect(derivePreviewStagePlan(replacing, 0).previousBackground).toBeUndefined();
  });

  it("retains an outgoing background for one authored clear transition frame", () => {
    const clearing: readonly StoryStatement[] = [
      { kind: "direction", id: "old_bg", command: "background", summary: "action=set asset=bg_old" },
      { kind: "direction", id: "clear_bg", command: "background", summary: "action=clear transition=fade duration=300ms" },
      { kind: "dialogue", id: "line", speakerId: "hero", textId: "text", text: "cleared" }
    ];
    const transition = derivePreviewStagePlan(clearing, 1);
    expect(transition.background).toBeUndefined();
    expect(transition.previousBackground).toMatchObject({ statementId: "clear_bg", assetId: "bg_old", transition: "fade", duration: "300ms" });
    expect(derivePreviewStagePlan(clearing, 2).previousBackground).toBeUndefined();
  });

  it("fails closed instead of previewing an unknown transition", () => {
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "old_bg", command: "background", summary: "action=set asset=bg_old" },
      { kind: "direction", id: "bad_transition", command: "background", summary: "action=set asset=bg_new transition=spin duration=450ms" }
    ], 1);
    expect(plan.background).toMatchObject({ statementId: "old_bg", assetId: "bg_old" });
    expect(plan.diagnostics).toContain("bad_transition: transition must be fade, dissolve, or slide");
  });

  it("does not execute empty moves or moves targeting inactive slots", () => {
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "missing", command: "show", summary: "action=move slot=hero x=80" },
      { kind: "direction", id: "show", command: "show", summary: "action=show asset=hero slot=hero" },
      { kind: "direction", id: "resource", command: "show", summary: "action=move slot=hero asset=stale x=80" },
      { kind: "direction", id: "empty", command: "show", summary: "action=move slot=hero duration=300ms" }
    ], 3);
    expect(plan.characters).toEqual([expect.objectContaining({ statementId: "show", assetId: "hero" })]);
    expect(plan.diagnostics).toEqual([
      "missing: move requires an active hero slot",
      "resource: action=move does not accept asset",
      "empty: move requires at least one Stage geometry parameter"
    ]);
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

  it("loads and releases both verified backgrounds for one replacement transition", async () => {
    const oldBytes = new Uint8Array([21]);
    const newBytes = new Uint8Array([22]);
    const index: AssetIndex = { ...createAssetIndex(), assets: [entry("bg_old", "background", oldBytes), entry("bg_new", "background", newBytes)] };
    const plan = derivePreviewStagePlan([
      { kind: "direction", id: "old_bg", command: "background", summary: "action=set asset=bg_old" },
      { kind: "direction", id: "new_bg", command: "background", summary: "action=set asset=bg_new transition=dissolve duration=700ms" }
    ], 1);
    const byDigest = new Map(index.assets.map((item, position) => [item.source.digest, [oldBytes, newBytes][position]!]));
    const revoked: string[] = [];
    let serial = 0;
    const urls: PreviewUrlFactory = { create: () => `blob:bg:${++serial}`, revoke: (url) => revoked.push(url) };
    const media = await loadPreviewMedia(plan, index, { read: async (digest) => byDigest.get(digest) ?? null }, urls, new AbortController().signal);
    expect(media.background).toMatchObject({ assetId: "bg_new", url: "blob:bg:1" });
    expect(media.previousBackground).toMatchObject({ assetId: "bg_old", url: "blob:bg:2" });
    releasePreviewMedia(media, urls);
    expect(revoked).toEqual(["blob:bg:1", "blob:bg:2"]);
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

  it("revokes URLs already created when a later layer is cancelled", async () => {
    const bytes = new Uint8Array([11]);
    const index: AssetIndex = {
      ...createAssetIndex(),
      assets: [entry("bg_gate", "cg", bytes), entry("hero_smile", "character", bytes)]
    };
    const controller = new AbortController();
    let finishSecond!: (value: Uint8Array) => void;
    let signalSecondStarted!: () => void;
    const secondStarted = new Promise<void>((resolve) => { signalSecondStarted = resolve; });
    let reads = 0;
    const revoked: string[] = [];
    const loading = loadPreviewMedia(
      derivePreviewStagePlan(statements, 2),
      index,
      {
        read: async () => {
          reads += 1;
          if (reads === 1) return bytes;
          signalSecondStarted();
          return new Promise<Uint8Array>((resolve) => { finishSecond = resolve; });
        }
      },
      { create: () => "blob:partial", revoke: (url) => revoked.push(url) },
      controller.signal
    );
    await secondStarted;
    controller.abort();
    finishSecond(bytes);

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(revoked).toEqual(["blob:partial"]);
  });

  it("revokes earlier URLs when a later verified Blob read fails", async () => {
    const bytes = new Uint8Array([12]);
    const index: AssetIndex = {
      ...createAssetIndex(),
      assets: [entry("bg_gate", "cg", bytes), entry("hero_smile", "character", bytes)]
    };
    let reads = 0;
    const revoked: string[] = [];
    const loading = loadPreviewMedia(
      derivePreviewStagePlan(statements, 2),
      index,
      { read: async () => {
        reads += 1;
        if (reads === 1) return bytes;
        throw new Error("verified storage read failed");
      } },
      { create: () => "blob:before-failure", revoke: (url) => revoked.push(url) },
      new AbortController().signal
    );

    await expect(loading).rejects.toThrow("verified storage read failed");
    expect(revoked).toEqual(["blob:before-failure"]);
  });
});

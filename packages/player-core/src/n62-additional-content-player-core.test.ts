import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type JsonObject, type S0Project } from "@world-studio/project-domain";
import { createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1, startPlayerCore } from "./player-core";

function mediaProject(): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/media/project.s0.json"), "utf8")) as S0Project;
  const assets = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/media/media-golden.json"), "utf8")) as { readonly assets: readonly JsonObject[] };
  const project = loadProject(migrateS0Project(source).files);
  return { ...project, assets: { ...project.assets, assets: assets.assets } };
}

describe("N62-E1-E4 Player Core additional-content projection", () => {
  it("projects the four Compiler catalogs against formal Runtime meta progress", () => {
    const project = mediaProject();
    const title = createPlayerCoreSnapshotV1(createPlayerCore(project));
    expect(title.additionalContent).toMatchObject({
      gallery: { total: 2, unlocked: 0, locked: 2 },
      replay: { total: 1, unlocked: 0, locked: 1 },
      music: { total: 1, unlocked: 0, locked: 1 },
      endings: { total: 1, unlocked: 0, locked: 1 }
    });
    expect(title.additionalContent.galleryItems).toEqual([
      { assetId: "media_actor_sprite", displayName: null, kind: "character", unlocked: false },
      { assetId: "media_sunset", displayName: null, kind: "cg", unlocked: false }
    ]);
    expect(title.additionalContent.endingItems).toEqual([
      { endingId: "media_end", name: null, sceneId: "media_stage", unlocked: false }
    ]);
    expect(title.additionalContent.musicItems).toEqual([
      { assetId: "media_theme", displayName: null, unlocked: false }
    ]);
    expect(title.additionalContent.replayItems).toEqual([
      { replayId: "media_stage", title: null, sceneId: "media_stage", unlocked: false }
    ]);

    const waitingEffect = startPlayerCore(createPlayerCore(project), project);
    const started = createPlayerCoreSnapshotV1(waitingEffect);
    expect(started.additionalContent).toMatchObject({
      gallery: { total: 2, unlocked: 2, locked: 0 },
      replay: { total: 1, unlocked: 0, locked: 1 },
      music: { total: 1, unlocked: 1, locked: 0 },
      endings: { total: 1, unlocked: 0, locked: 1 }
    });
    expect(started.additionalContent.galleryItems).toEqual([
      { assetId: "media_actor_sprite", displayName: "Deterministic Actor", kind: "character", unlocked: true },
      { assetId: "media_sunset", displayName: "Deterministic Sunset", kind: "cg", unlocked: true }
    ]);
    const presenting = createPlayerCoreSnapshotV1(dispatchPlayerCoreIntentV1(waitingEffect, project, { kind: "primary" }));
    expect(presenting.additionalContent.music).toEqual({ total: 1, unlocked: 1, locked: 0 });
    expect(presenting.additionalContent.musicItems).toEqual([
      { assetId: "media_theme", displayName: "Deterministic Theme", unlocked: true }
    ]);
  });

  it("runs an unlocked replay from its historical scene checkpoint and restores the exact parent session", () => {
    const project = mediaProject();
    const dialogue = startPlayerCore(createPlayerCore(project), project);
    const ended = dispatchPlayerCoreIntentV1(dialogue, project, { kind: "primary" });
    const parent = dispatchPlayerCoreIntentV1(ended, project, { kind: "back" });
    const parentSnapshot = createPlayerCoreSnapshotV1(parent);
    expect(parentSnapshot.additionalContent.replayItems).toEqual([
      { replayId: "media_stage", title: "Stage", sceneId: "media_stage", unlocked: true }
    ]);

    const replayDialogue = dispatchPlayerCoreIntentV1(parent, project, { kind: "enter-scene-replay", replayId: "media_stage" });
    expect(createPlayerCoreSnapshotV1(replayDialogue).sceneReplay).toEqual({ active: true, replayId: "media_stage", title: "Stage", error: null });
    expect(replayDialogue.status).toBe("presenting");
    expect(createPlayerCoreSessionSaveV1(replayDialogue)).toMatchObject({ ok: false, diagnostics: [{ code: "PLAYER_SAVE_REPLAY_ISOLATED" }] });

    const replayEnding = dispatchPlayerCoreIntentV1(replayDialogue, project, { kind: "primary" });
    expect(replayEnding.status).toBe("ended");
    expect(createPlayerCoreSnapshotV1(replayEnding).sceneReplay.active).toBe(true);

    const restored = dispatchPlayerCoreIntentV1(replayEnding, project, { kind: "exit-scene-replay" });
    expect(restored).toEqual(parent);
    expect(createPlayerCoreSnapshotV1(restored)).toEqual(parentSnapshot);
  });

  it("can abandon an in-progress replay without mutating the original session", () => {
    const project = mediaProject();
    const dialogue = startPlayerCore(createPlayerCore(project), project);
    const ended = dispatchPlayerCoreIntentV1(dialogue, project, { kind: "primary" });
    const parent = dispatchPlayerCoreIntentV1(ended, project, { kind: "back" });
    const replay = dispatchPlayerCoreIntentV1(parent, project, { kind: "enter-scene-replay", replayId: "media_stage" });
    expect(replay.status).toBe("presenting");
    expect(dispatchPlayerCoreIntentV1(replay, project, { kind: "exit-scene-replay" })).toEqual(parent);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type JsonObject, type S0Project } from "@world-studio/project-domain";
import { createPlayerCore, createPlayerCoreSnapshotV1, startPlayerCore } from "./player-core";

function mediaProject(): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/media/project.s0.json"), "utf8")) as S0Project;
  const assets = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/media/media-golden.json"), "utf8")) as { readonly assets: readonly JsonObject[] };
  const project = loadProject(migrateS0Project(source).files);
  return { ...project, assets: { ...project.assets, assets: assets.assets } };
}

describe("N62-E1 Player Core additional-content projection", () => {
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

    const started = createPlayerCoreSnapshotV1(startPlayerCore(createPlayerCore(project), project));
    expect(started.additionalContent).toMatchObject({
      gallery: { total: 2, unlocked: 2, locked: 0 },
      replay: { total: 1, unlocked: 0, locked: 1 },
      music: { total: 1, unlocked: 0, locked: 1 },
      endings: { total: 1, unlocked: 0, locked: 1 }
    });
    expect(started.additionalContent.galleryItems).toEqual([
      { assetId: "media_actor_sprite", displayName: "Deterministic Actor", kind: "character", unlocked: true },
      { assetId: "media_sunset", displayName: "Deterministic Sunset", kind: "cg", unlocked: true }
    ]);
  });
});

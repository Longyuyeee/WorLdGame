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

    const started = createPlayerCoreSnapshotV1(startPlayerCore(createPlayerCore(project), project));
    expect(started.additionalContent).toMatchObject({
      gallery: { total: 2, unlocked: 2, locked: 0 },
      replay: { total: 1, unlocked: 0, locked: 1 },
      music: { total: 1, unlocked: 0, locked: 1 },
      endings: { total: 1, unlocked: 0, locked: 1 }
    });
  });
});

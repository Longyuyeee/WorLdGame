import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createStudioSessionFromCanonical } from "./studio-session";
import { derivePreviewStagePlan, loadPreviewMedia, releasePreviewMedia } from "./preview-media-runtime";
import { IndexedDbAssetRepository } from "./indexeddb-asset-repository";
import { prepareN42MediaStageFixture } from "./n42-media-stage-fixture";
import { startFormalPreviewFromStatement } from "./formal-preview-runtime";

describe("N42-E1b production media Stage fixture", () => {
  it("prepares inspected real media through the product repository and reopens it for Stage rendering", async () => {
    const indexedDb = new IDBFactory();
    const prepared = await prepareN42MediaStageFixture(indexedDb, "n42_media_stage_test", 10_000);

    expect(prepared.project.manifest.projectId).toBe("n42_media_stage_test");
    expect(prepared.index).toMatchObject({ indexRevision: 3 });
    expect(prepared.index.assets.map((asset) => [asset.assetId, asset.kind, asset.source.mimeType])).toEqual([
      ["media_actor_sprite", "character", "image/png"],
      ["media_sunset", "cg", "image/png"],
      ["media_theme", "audio", "audio/wav"]
    ]);
    expect(prepared.project.assets.assets.map((asset) => asset.assetId)).toEqual([
      "media_actor_sprite",
      "media_sunset",
      "media_theme"
    ]);

    const reopened = new IndexedDbAssetRepository(indexedDb, "n42_media_stage_test");
    await expect(reopened.audit()).resolves.toMatchObject({ status: "pass", assetCount: 3, uniqueBlobCount: 3 });
    const session = createStudioSessionFromCanonical(prepared.project);
    const scene = session.project.scenes.find((candidate) => candidate.id === session.activeSceneId)!;
    const moveIndex = scene.statements.findIndex((statement) => statement.id === "media_move");
    expect(moveIndex).toBeGreaterThan(0);
    expect(derivePreviewStagePlan(scene.statements, moveIndex).characters[0]).toMatchObject({
      statementId: "media_move",
      assetId: "media_actor_sprite",
      x: 25,
      y: 80,
      scale: 0.9,
      duration: "800ms",
      easing: "ease-in-out",
      movementFrom: { x: 50, y: 100, scale: 1, anchorX: 0.5, anchorY: 1 }
    });
    const plan = derivePreviewStagePlan(scene.statements, scene.statements.length - 1);
    const revoked: string[] = [];
    const urls = {
      create: (bytes: Uint8Array, mimeType: string) => `n42:${mimeType}:${bytes.byteLength}`,
      revoke: (url: string) => revoked.push(url)
    };
    const media = await loadPreviewMedia(plan, prepared.index, reopened, urls, new AbortController().signal);

    expect(media.errors).toEqual([]);
    expect(media.characters).toEqual([expect.objectContaining({ assetId: "media_actor_sprite", url: "n42:image/png:109" })]);
    expect(media.background).toMatchObject({ assetId: "media_sunset", url: "n42:image/png:422" });
    expect(media.audio).toEqual([expect.objectContaining({ assetId: "media_theme", url: "n42:audio/wav:1644" })]);
    releasePreviewMedia(media, urls);
    expect(revoked).toHaveLength(3);

    const formal = startFormalPreviewFromStatement(prepared.project, scene.id, "media_show");
    expect(formal).toMatchObject({ status: "presenting", statementId: "media_show" });
    expect(formal.effectHost.activeByChannel.show?.payload).toMatchObject({
      asset: "media_actor_sprite",
      slot: "actor",
      x: 50,
      y: 100,
      scale: 1,
      anchorX: "0.5",
      anchorY: 1
    });

    const formalMove = startFormalPreviewFromStatement(prepared.project, scene.id, "media_move");
    expect(formalMove).toMatchObject({ status: "presenting", statementId: "media_move" });
    expect(formalMove.effectHost.activeByChannel.show?.payload).toMatchObject({
      action: "move",
      slot: "actor",
      x: 25,
      y: 80,
      scale: "0.9",
      duration: "800ms",
      easing: "ease-in-out"
    });
  });
});

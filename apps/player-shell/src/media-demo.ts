import { loadProject, migrateS0Project, type CanonicalProject, type JsonObject, type S0Project } from "@world-studio/project-domain";
import mediaGoldenSource from "../../../fixtures/projects/media/media-golden.json";
import mediaProjectSource from "../../../fixtures/projects/media/project.s0.json";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";

interface MediaGoldenAsset {
  readonly assetId: string;
  readonly displayName: string;
  readonly mimeType: string;
  readonly base64: string;
}

export interface PlayerMediaDemoV1 {
  readonly project: CanonicalProject;
  readonly mediaAssets: readonly PlayerMediaAssetSourceV1[];
}

export function createPlayerMediaDemoV1(): PlayerMediaDemoV1 {
  const migrated = loadProject(migrateS0Project(mediaProjectSource as S0Project).files);
  const scene = migrated.scripts.media_stage;
  if (scene === undefined) throw new Error("Player media demo is missing media_stage");
  const assets = mediaGoldenSource.assets as readonly MediaGoldenAsset[];
  const project: CanonicalProject = {
    ...migrated,
    manifest: { ...migrated.manifest, projectId: "player_media_demo", title: "WorLd Player · 正式媒体舞台" },
    assets: { ...migrated.assets, assets: assets as unknown as readonly JsonObject[] },
    scripts: {
      ...migrated.scripts,
      media_stage: {
        ...scene,
        statements: scene.statements.map((statement) => statement.id === "media_show" ? {
          ...statement,
          summary: `${String(statement.summary).replace("duration=300ms", "duration=1200ms")} effectPolicy=pure awaitMode=awaited descriptorId=player.media.actor.enter`
        } : statement)
      }
    }
  };
  return {
    project,
    mediaAssets: assets.map((asset) => ({
      assetId: asset.assetId,
      displayName: asset.displayName,
      mimeType: asset.mimeType,
      url: `data:${asset.mimeType};base64,${asset.base64}`
    }))
  };
}

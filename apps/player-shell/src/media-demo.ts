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

export function createPlayerMediaMultichannelDemoV1(): PlayerMediaDemoV1 {
  const base = createPlayerMediaDemoV1();
  const scene = base.project.scripts.media_stage;
  if (scene === undefined) throw new Error("Player multichannel demo is missing media_stage");
  const background = scene.statements.find((statement) => statement.id === "media_background")!;
  const show = scene.statements.find((statement) => statement.id === "media_show")!;
  const audio = scene.statements.find((statement) => statement.id === "media_bgm")!;
  const line = scene.statements.find((statement) => statement.id === "media_line")!;
  const end = scene.statements.find((statement) => statement.id === "media_end")!;
  return {
    ...base,
    project: {
      ...base.project,
      manifest: { ...base.project.manifest, projectId: "player_media_multichannel", title: "WorLd Player · 多通道舞台" },
      scripts: {
        ...base.project.scripts,
        media_stage: {
          ...scene,
          statements: [
            background,
            { ...show, id: "media_show_left", summary: "asset=media_actor_sprite action=show slot=left x=32 y=100 scale=0.92 anchorX=0.5 anchorY=1 z=10 transition=dissolve duration=300ms" },
            { ...show, id: "media_show_right", summary: "asset=media_actor_sprite action=show slot=right x=68 y=100 scale=1 anchorX=0.5 anchorY=1 z=20 transition=slide duration=360ms" },
            { ...audio, id: "media_bgm", summary: "asset=media_theme action=play bus=bgm loop=true volume=0.6 fade=500ms" },
            { ...audio, id: "media_voice", summary: "asset=media_theme action=play bus=voice loop=false volume=0.8" },
            line,
            end
          ]
        }
      }
    }
  };
}

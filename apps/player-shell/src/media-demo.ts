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

export function createPlayerLocalizedMediaDemoV1(): PlayerMediaDemoV1 {
  const base = createPlayerMediaDemoV1();
  const scene = base.project.scripts.media_stage;
  if (scene === undefined) throw new Error("Player localized media demo is missing media_stage");
  const background = scene.statements.find((statement) => statement.id === "media_background")!;
  const theme = base.mediaAssets.find((asset) => asset.assetId === "media_theme")!;
  const localizedBackground = {
    assetId: "media_sunset_zh",
    kind: "cg",
    displayName: "日落 · 简体中文",
    mimeType: "image/svg+xml",
    localeVariantOf: "media_sunset",
    locale: "zh-Hans"
  } as const;
  const voices = [
    { assetId: "media_voice_en", kind: "audio", displayName: "Actor · English", mimeType: "audio/wav", voiceTextId: "media_text", locale: "en" },
    { assetId: "media_voice_zh", kind: "audio", displayName: "Actor · 简体中文", mimeType: "audio/wav", voiceTextId: "media_text", locale: "zh-Hans" }
  ] as const;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#0f766e"/><stop offset="1" stop-color="#172554"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/><circle cx="1000" cy="180" r="92" fill="#fbbf24" opacity=".9"/><path d="M0 520 Q320 410 640 530 T1280 500 V720 H0Z" fill="#071b2d"/><text x="80" y="120" fill="#ecfeff" font-size="44" font-family="system-ui">简体中文场景资源</text></svg>`;
  return {
    project: {
      ...base.project,
      manifest: { ...base.project.manifest, projectId: "player_localized_media", title: "WorLd Player · Localized Media", defaultLocale: "en" },
      assets: { ...base.project.assets, assets: [...base.project.assets.assets, localizedBackground, ...voices] },
      localization: {
        schemaVersion: 1,
        locales: [
          { id: "locale_zh_hans", locale: "zh-Hans", sourceLocale: "en", entries: [{ key: "media_text", sourceText: "Every cue must remain ordered.", translation: "每条演出指令都必须保持顺序。", status: "reviewed" }] },
          { id: "locale_ja", locale: "ja", sourceLocale: "en", entries: [{ key: "media_text", sourceText: "Every cue must remain ordered.", translation: "すべての演出指示は順番どおりでなければなりません。", status: "reviewed" }] }
        ]
      },
      scripts: { ...base.project.scripts, media_stage: { ...scene, statements: [
        background,
        { id: "media_line", kind: "dialogue", speakerId: "media_actor", textId: "media_text", text: "Every cue must remain ordered." },
        { id: "media_end", kind: "end", endingName: "Curtain" }
      ] } }
    },
    mediaAssets: [
      ...base.mediaAssets,
      { assetId: localizedBackground.assetId, displayName: localizedBackground.displayName, mimeType: localizedBackground.mimeType, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` },
      { assetId: voices[0].assetId, displayName: voices[0].displayName, mimeType: voices[0].mimeType, url: theme.url },
      { assetId: voices[1].assetId, displayName: voices[1].displayName, mimeType: voices[1].mimeType, url: theme.url }
    ]
  };
}

export function createPlayerVideoDemoV1(videoUrl: string): PlayerMediaDemoV1 {
  const base = createPlayerMediaDemoV1();
  const scene = base.project.scripts.media_stage;
  if (scene === undefined) throw new Error("Player video demo is missing media_stage");
  const background = scene.statements.find((statement) => statement.id === "media_background")!;
  const videoAsset = { assetId: "media_intro_video", kind: "video", displayName: "Deterministic Intro", mimeType: "video/webm" } as const;
  return {
    project: {
      ...base.project,
      manifest: { ...base.project.manifest, projectId: "player_video_demo", title: "WorLd Player · Video" },
      assets: { ...base.project.assets, assets: [...base.project.assets.assets, videoAsset] },
      scripts: { ...base.project.scripts, media_stage: { ...scene, statements: [
        { id: "video_before", kind: "narration", textId: "video_before_text", text: "Before video" },
        { ...background, id: "video_effect", summary: "asset=media_intro_video action=set effectPolicy=pure awaitMode=awaited descriptorId=player.media.video.intro" },
        { id: "video_after", kind: "narration", textId: "video_after_text", text: "After video" },
        { id: "video_end", kind: "end", endingName: "Video done" }
      ] } }
    },
    mediaAssets: [...base.mediaAssets, { assetId: videoAsset.assetId, displayName: videoAsset.displayName, mimeType: videoAsset.mimeType, url: videoUrl }]
  };
}

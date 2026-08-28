import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type JsonObject, type S0Project } from "@world-studio/project-domain";
import { createGalSettingsApplicationV1, withProjectSettings } from "@world-studio/gal-settings";
import { createPlayerCore, createPlayerCoreSnapshotV1, startPlayerCore } from "@world-studio/player-core";
import { derivePreviewStagePlan, resolvePreviewCharacterGeometry } from "../../editor/src/preview-media-runtime";
import { createPlayerMediaDemoV1 } from "../src/media-demo";
import { derivePlayerStagePresentationV1 } from "../src/player-presentation-adapter";
import mediaGoldenSource from "../../../fixtures/projects/media/media-golden.json";
import mediaProjectSource from "../../../fixtures/projects/media/project.s0.json";

function durationMilliseconds(source: string | undefined): number {
  if (source === undefined) return 320;
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/u.exec(source);
  return match === null ? 320 : Number(match[1]) * (match[2] === "s" ? 1000 : 1);
}

describe("N50-E3 Editor and Player Media Golden parity", () => {
  it("projects the same frozen visual/audio state from the Editor and formal Player", () => {
    const project = loadProject(migrateS0Project(mediaProjectSource as S0Project).files);
    const assets = mediaGoldenSource.assets as readonly { readonly assetId: string; readonly displayName: string; readonly mimeType: string; readonly base64: string }[];
    const canonical = { ...project, assets: { ...project.assets, assets: assets as unknown as readonly JsonObject[] } };
    const scene = canonical.scripts.media_stage!;
    const dialogueIndex = scene.statements.findIndex((statement) => statement.id === "media_line");
    const editor = derivePreviewStagePlan(scene.statements, dialogueIndex);
    const playerSnapshot = createPlayerCoreSnapshotV1(startPlayerCore(createPlayerCore(canonical), canonical));
    const player = derivePlayerStagePresentationV1(playerSnapshot, assets.map((asset) => ({
      assetId: asset.assetId,
      displayName: asset.displayName,
      mimeType: asset.mimeType,
      url: `data:${asset.mimeType};base64,${asset.base64}`
    })));

    const editorProjection = {
      background: editor.background === undefined ? null : {
        assetId: editor.background.assetId,
        transition: editor.background.transition ?? "none",
        durationMilliseconds: durationMilliseconds(editor.background.duration)
      },
      characters: editor.characters.map((character) => {
        const geometry = resolvePreviewCharacterGeometry(character);
        return { assetId: character.assetId, slot: character.slot ?? "primary", ...geometry, z: character.z ?? 0 };
      }),
      audio: editor.audio.map((track) => ({ assetId: track.assetId, bus: track.bus, loop: track.loop, volume: track.volume, status: track.playback })),
      cameraTransform: editor.camera === undefined ? "translate(0%, 0%) scale(1) rotate(0deg)" : `translate(${editor.camera.x}%, ${editor.camera.y}%) scale(${editor.camera.zoom}) rotate(${editor.camera.rotation}deg)`,
      textboxTemplate: editor.dialogueTemplate
    };
    const playerProjection = {
      background: player.background === null ? null : {
        assetId: player.background.assetId,
        transition: player.background.transition,
        durationMilliseconds: player.background.durationMilliseconds
      },
      characters: player.characters.map(({ assetId, slot, x, y, scale, rotation, anchorX, anchorY, z }) => ({ assetId, slot, x, y, scale, rotation, anchorX, anchorY, z })),
      audio: player.audio.map(({ assetId, bus, loop, volume, status }) => ({ assetId, bus, loop, volume, status })),
      cameraTransform: player.cameraTransform,
      textboxTemplate: player.textboxTemplate
    };

    expect(playerSnapshot).toMatchObject({ status: "presenting", presentation: { kind: "dialogue", textId: "media_text" } });
    expect(editor.diagnostics).toEqual([]);
    expect(player.missingAssetIds).toEqual([]);
    expect(playerProjection).toEqual(editorProjection);
    expect(playerProjection).toEqual({
      background: { assetId: "media_sunset", transition: "fade", durationMilliseconds: 400 },
      characters: [{ assetId: "media_actor_sprite", slot: "actor", x: 50, y: 100, scale: 1, rotation: 0, anchorX: 0.5, anchorY: 1, z: 10 }],
      audio: [{ assetId: "media_theme", bus: "bgm", loop: true, volume: 0.6, status: "playing" }],
      cameraTransform: "translate(0%, 0%) scale(1) rotate(0deg)",
      textboxTemplate: "adv"
    });
  });

  it("freezes distinct formal channels for two character slots and two audio buses", () => {
    const demo = createPlayerMediaDemoV1();
    const multi = createPlayerMediaDemoV1().project.scripts.media_stage!;
    const project = createPlayerMediaDemoV1().project;
    const synthetic = {
      ...project,
      scripts: {
        ...project.scripts,
        media_stage: {
          ...multi,
          statements: [
            { ...multi.statements[0]!, id: "bg", summary: "asset=media_sunset action=set" },
            { ...multi.statements[1]!, id: "left", summary: "asset=media_actor_sprite action=show slot=left" },
            { ...multi.statements[1]!, id: "right", summary: "asset=media_actor_sprite action=show slot=right" },
            { ...multi.statements[2]!, id: "bgm", summary: "asset=media_theme action=play bus=bgm" },
            { ...multi.statements[2]!, id: "voice", summary: "asset=media_theme action=play bus=voice" },
            multi.statements.find((statement) => statement.id === "media_line")!,
            multi.statements.find((statement) => statement.id === "media_end")!
          ]
        }
      }
    };
    const snapshot = createPlayerCoreSnapshotV1(startPlayerCore(createPlayerCore(synthetic), synthetic));
    expect(snapshot.effects.active.map((effect) => effect.channel)).toEqual(["audio.bgm", "audio.voice", "background", "show.left", "show.right"]);
    const application = createGalSettingsApplicationV1(withProjectSettings(project.settings, {
      stage: { defaultDurationMilliseconds: 720, defaultEasing: "ease-out" }
    }), "web");
    expect(derivePlayerStagePresentationV1(snapshot, demo.mediaAssets, application.stage)).toMatchObject({
      background: { durationMilliseconds: 720, easing: "ease-out" },
      characters: [
        { slot: "left", durationMilliseconds: 720, easing: "ease-out" },
        { slot: "right", durationMilliseconds: 720, easing: "ease-out" }
      ],
      audio: [{ bus: "bgm" }, { bus: "voice" }]
    });
  });

  it("keeps explicit Effect timing above configured Stage defaults", () => {
    const demo = createPlayerMediaDemoV1();
    const snapshot = createPlayerCoreSnapshotV1(startPlayerCore(createPlayerCore(demo.project), demo.project));
    const application = createGalSettingsApplicationV1(withProjectSettings(demo.project.settings, {
      stage: { defaultDurationMilliseconds: 720, defaultEasing: "ease-out" }
    }), "web");
    expect(derivePlayerStagePresentationV1(snapshot, demo.mediaAssets, application.stage)).toMatchObject({
      background: { durationMilliseconds: 400, easing: "ease-out" },
      characters: [{ durationMilliseconds: 1200, easing: "ease-out" }]
    });
  });

  it("uses the configured Player textbox default while preserving explicit Effect priority", () => {
    const demo = createPlayerMediaDemoV1();
    const snapshot = createPlayerCoreSnapshotV1(startPlayerCore(createPlayerCore(demo.project), demo.project));
    const application = createGalSettingsApplicationV1(withProjectSettings(demo.project.settings, {
      ui: { defaultTextboxTemplate: "bubble" }
    }), "web");
    expect(derivePlayerStagePresentationV1(snapshot, demo.mediaAssets, application.stage, application.ui).textboxTemplate).toBe("bubble");

    const explicit = {
      ...snapshot,
      effects: {
        ...snapshot.effects,
        active: [...snapshot.effects.active, {
          effectId: "explicit_textbox",
          descriptorId: "textbox.set",
          channel: "textbox",
          kind: "textbox.set",
          replayKey: "textbox",
          payload: { action: "set", template: "nvl" },
          policy: "pure",
          awaitMode: "detached",
          compensation: null
        }]
      }
    } as typeof snapshot;
    expect(derivePlayerStagePresentationV1(explicit, demo.mediaAssets, application.stage, application.ui).textboxTemplate).toBe("nvl");
  });
});

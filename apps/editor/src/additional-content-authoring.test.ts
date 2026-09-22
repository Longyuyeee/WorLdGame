import { describe, expect, it } from "vitest";
import { createProjectTemplate, loadProject, saveProject } from "@world-studio/project-domain";
import { updateAdditionalContentCatalogOverride } from "@world-studio/project-compiler";
import { createAdditionalContentAuthoringModel } from "./additional-content-authoring";

function project() {
  const base = createProjectTemplate("Media", "additional-content-authoring");
  const sceneId = base.manifest.entrySceneId;
  return {
    ...base,
    scenes: base.scenes.map((scene) => ({ ...scene, title: "Stage" })),
    assets: { ...base.assets, assets: [
      { assetId: "media_sunset", kind: "cg", displayName: "Sunset", mimeType: "image/png" },
      { assetId: "media_theme", kind: "audio", displayName: "Theme", mimeType: "audio/wav" }
    ] },
    scripts: { ...base.scripts, [sceneId]: { ...base.scripts[sceneId]!, statements: [
      { id: "show_sunset", kind: "direction", command: "background", summary: "asset=media_sunset action=set" },
      { id: "play_theme", kind: "direction", command: "audio", summary: "asset=media_theme action=play bus=bgm" },
      { id: "media_end", kind: "end", endingName: "Ending" }
    ] } }
  };
}

describe("additional-content authoring model", () => {
  it("keeps generated entries authoritative and projects sparse author overrides", () => {
    const base = project();
    const changed = updateAdditionalContentCatalogOverride(base, "replay", base.manifest.entrySceneId, { title: "黄昏回想", order: -2, coverAssetId: "media_sunset", revealBeforeUnlock: true });
    const model = createAdditionalContentAuthoringModel(changed);
    expect(model.error).toBeNull();
    expect(model.rows.find((row) => row.catalog === "replay")).toMatchObject({
      entryId: base.manifest.entrySceneId, sourceTitle: "黄昏回想", coverAssetId: "media_sunset",
      override: { order: -2, revealBeforeUnlock: true }
    });
    expect(loadProject(saveProject(changed)).ui).toEqual(changed.ui);
  });
});

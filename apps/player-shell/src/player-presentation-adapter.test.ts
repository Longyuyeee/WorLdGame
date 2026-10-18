import { expect, it } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { createPlayerCore, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1 } from "@world-studio/player-core";
import { derivePlayerStagePresentationV1 } from "./player-presentation-adapter";

it("renders named character positions like author preview, while explicit geometry takes priority", () => {
  for (const [parameters, expected] of [["position=left", 20], ["position=right", 80], ["position=center", 50], ["position=left x=35", 35]] as const) {
    const base = createProjectTemplate("Position", "018f08d8-71a1-7bc2-a627-2f4a843ee152");
    const sceneId = base.manifest.entrySceneId;
    const project = { ...base, assets: { ...base.assets, assets: [{ assetId: "xia", kind: "character" }] }, scripts: { ...base.scripts,
      [sceneId]: { ...base.scripts[sceneId]!, statements: [
        { kind: "direction" as const, id: "show_xia", command: "show", summary: `action=show asset=xia slot=main ${parameters}` },
        { kind: "narration" as const, id: "text", textId: "txt", text: "阅读停点" }, ...base.scripts[sceneId]!.statements
      ] }
    } };
    const state = dispatchPlayerCoreIntentV1(createPlayerCore(project), project, { kind: "primary" });
    const stage = derivePlayerStagePresentationV1(createPlayerCoreSnapshotV1(state), [{ assetId: "xia", displayName: "小夏", mimeType: "image/png", url: "blob:xia" }]);
    expect(stage.characters).toHaveLength(1); expect(stage.characters[0]?.x).toBe(expected);
  }
});

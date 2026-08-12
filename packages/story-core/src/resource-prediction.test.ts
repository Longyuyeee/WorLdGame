import { describe, expect, it } from "vitest";
import { campusStoryProject } from "./sample-project";
import { predictStoryResources, type SceneResourceManifest } from "./resource-prediction";

const manifest: SceneResourceManifest = { schemaVersion: 1, scenes: [
  { sceneId: "scn_school_gate", assetIds: ["gate", "shared_ui"] },
  { sceneId: "scn_broadcast_room", assetIds: ["radio", "shared_branch", "shared_ui"] },
  { sceneId: "scn_rooftop", assetIds: ["roof", "shared_branch", "shared_ui"] }
] };

describe("S0.29 Story Graph resource prediction", () => {
  it("keeps the current scene critical and only prefetches branch-common resources by default", () => {
    expect(predictStoryResources(campusStoryProject, manifest, "scn_school_gate")).toEqual({
      currentSceneId: "scn_school_gate",
      outgoingSceneIds: ["scn_broadcast_room", "scn_rooftop"],
      resources: [
        { assetId: "gate", role: "current", reason: "current-scene", sceneIds: ["scn_school_gate"] },
        { assetId: "shared_ui", role: "current", reason: "current-scene", sceneIds: ["scn_school_gate"] },
        { assetId: "shared_branch", role: "prefetch", reason: "branch-common", sceneIds: ["scn_broadcast_room", "scn_rooftop"] }
      ]
    });
  });

  it("adds explicit rollback, gallery and opted-in branch speculation with role precedence", () => {
    const plan = predictStoryResources(campusStoryProject, manifest, "scn_broadcast_room", {
      rollbackSceneIds: ["scn_school_gate", "scn_school_gate"],
      galleryAssetIds: ["gallery_cg", "gate"]
    });
    expect(plan.resources).toEqual([
      { assetId: "radio", role: "current", reason: "current-scene", sceneIds: ["scn_broadcast_room"] },
      { assetId: "shared_branch", role: "current", reason: "current-scene", sceneIds: ["scn_broadcast_room"] },
      { assetId: "shared_ui", role: "current", reason: "current-scene", sceneIds: ["scn_broadcast_room"] },
      { assetId: "gate", role: "rollback", reason: "rollback-window", sceneIds: ["scn_school_gate"] },
      { assetId: "gallery_cg", role: "gallery", reason: "gallery-open", sceneIds: [] }
    ]);
    const speculative = predictStoryResources(campusStoryProject, manifest, "scn_school_gate", { speculativeTargetSceneIds: ["scn_rooftop"] });
    expect(speculative.resources).toContainEqual({ assetId: "roof", role: "prefetch", reason: "branch-speculation", sceneIds: ["scn_rooftop"] });
    expect(speculative.resources).not.toContainEqual(expect.objectContaining({ assetId: "radio" }));
  });

  it("rejects ambiguous manifests and non-outgoing speculation instead of guessing", () => {
    expect(() => predictStoryResources(campusStoryProject, { schemaVersion: 1, scenes: [
      { sceneId: "scn_school_gate", assetIds: ["gate", "gate"] }
    ] }, "scn_school_gate")).toThrow(/duplicates gate/);
    expect(() => predictStoryResources(campusStoryProject, manifest, "scn_school_gate", {
      speculativeTargetSceneIds: ["scn_school_gate"]
    })).toThrow(/not an outgoing scene/);
  });
});

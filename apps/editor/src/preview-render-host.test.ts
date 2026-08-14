import { describe, expect, it } from "vitest";
import { createPreviewMediaHostState, reducePreviewMediaHost } from "./preview-media-host";
import {
  PREVIEW_RENDER_HOST_CAPABILITIES,
  PREVIEW_RENDER_HOST_CONTRACT_VERSION,
  createPreviewRenderFrame
} from "./preview-render-host";
import type { LoadedPreviewMedia } from "./preview-media-runtime";

const media: LoadedPreviewMedia = {
  planKey: "scene-a",
  background: { statementId: "bg", assetId: "school", url: "blob:bg" },
  characters: [
    { statementId: "left", assetId: "hero", slot: "left", z: -100, url: "blob:hero" },
    { statementId: "right", assetId: "friend", slot: "right", z: 100, url: "blob:friend" }
  ],
  audio: [],
  errors: ["voice asset is missing"],
  objectUrls: ["blob:bg", "blob:hero", "blob:friend"]
};

function readyHost() {
  let host = reducePreviewMediaHost(createPreviewMediaHostState("scene-a"), {
    type: "begin", generation: 1, planKey: "scene-a"
  });
  host = reducePreviewMediaHost(host, {
    type: "ready", generation: 1, planKey: "scene-a", media
  });
  return host;
}

describe("Preview render host contract", () => {
  it("freezes the backend boundary and keeps overlays outside visual planes", () => {
    expect(PREVIEW_RENDER_HOST_CONTRACT_VERSION).toBe(1);
    expect(PREVIEW_RENDER_HOST_CAPABILITIES).toEqual({
      backend: "dom-media-v1",
      coordinateSpace: "design-pixels",
      visualPlanes: ["background", "character"],
      overlayOwner: "react-dom",
      hitTesting: "accessible-dom-proxy"
    });
  });

  it("publishes only the active generation as a render frame", () => {
    expect(createPreviewRenderFrame(readyHost(), "scene-b")).toMatchObject({
      status: "loading", planKey: "scene-b", characters: [], errorCount: 0
    });
    expect(createPreviewRenderFrame(readyHost(), "scene-a")).toMatchObject({
      contractVersion: 1,
      backend: "dom-media-v1",
      status: "ready",
      generation: 1,
      background: { assetId: "school" },
      characters: [{ z: -100 }, { z: 100 }],
      errorCount: 1
    });
  });

  it("removes only failed visual layers without changing surviving order", () => {
    let host = readyHost();
    host = reducePreviewMediaHost(host, {
      type: "runtime-error",
      generation: 1,
      planKey: "scene-a",
      error: { role: "background", statementId: "bg", assetId: "school", code: "decode-failed" }
    });
    host = reducePreviewMediaHost(host, {
      type: "runtime-error",
      generation: 1,
      planKey: "scene-a",
      error: { role: "character", statementId: "left", assetId: "hero", code: "decode-failed" }
    });
    const frame = createPreviewRenderFrame(host, "scene-a");
    expect(frame.background).toBeUndefined();
    expect(frame.characters.map((character) => character.assetId)).toEqual(["friend"]);
    expect(frame.errorCount).toBe(3);
  });
});

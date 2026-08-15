import { describe, expect, it } from "vitest";
import {
  createPreviewMediaHostState,
  previewMediaErrorCount,
  previewMediaLayerFailed,
  reducePreviewMediaHost
} from "./preview-media-host";
import type { LoadedPreviewMedia } from "./preview-media-runtime";

function media(planKey: string): LoadedPreviewMedia {
  return {
    planKey,
    characters: [],
    audio: [],
    errors: [],
    objectUrls: []
  };
}

describe("Preview media host state", () => {
  it("ignores stale and mismatched completions during rapid scene transitions", () => {
    let state = createPreviewMediaHostState("scene-a");
    state = reducePreviewMediaHost(state, { type: "begin", generation: 1, planKey: "scene-a" });
    state = reducePreviewMediaHost(state, { type: "begin", generation: 2, planKey: "scene-b" });
    const loadingB = state;

    state = reducePreviewMediaHost(state, { type: "ready", generation: 1, planKey: "scene-a", media: media("scene-a") });
    expect(state).toBe(loadingB);
    state = reducePreviewMediaHost(state, { type: "ready", generation: 2, planKey: "scene-b", media: media("wrong-key") });
    expect(state).toBe(loadingB);
    state = reducePreviewMediaHost(state, { type: "ready", generation: 2, planKey: "scene-b", media: media("scene-b") });
    expect(state).toMatchObject({ status: "ready", generation: 2, planKey: "scene-b" });
  });

  it("publishes active loader failures as a safe empty media result", () => {
    let state = reducePreviewMediaHost(createPreviewMediaHostState("a"), {
      type: "begin", generation: 1, planKey: "a"
    });
    state = reducePreviewMediaHost(state, {
      type: "failed", generation: 1, planKey: "a", errors: ["decoder unavailable"]
    });
    expect(state).toMatchObject({
      status: "ready",
      media: { characters: [], audio: [], errors: ["decoder unavailable"], objectUrls: [] }
    });
  });

  it("deduplicates element decode errors and isolates the failed layer", () => {
    let state = reducePreviewMediaHost(createPreviewMediaHostState("a"), {
      type: "begin", generation: 1, planKey: "a"
    });
    state = reducePreviewMediaHost(state, {
      type: "ready", generation: 1, planKey: "a", media: media("a")
    });
    const error = { role: "character" as const, statementId: "show-hero", assetId: "hero", code: "decode-failed" as const };
    state = reducePreviewMediaHost(state, { type: "runtime-error", generation: 1, planKey: "a", error });
    state = reducePreviewMediaHost(state, { type: "runtime-error", generation: 1, planKey: "a", error });

    expect(previewMediaLayerFailed(state, "character", "show-hero", "hero")).toBe(true);
    expect(previewMediaLayerFailed(state, "background", "show-hero", "hero")).toBe(false);
    expect(previewMediaErrorCount(state)).toBe(1);
  });

  it("clears runtime decode errors for the next generation", () => {
    let state = reducePreviewMediaHost(createPreviewMediaHostState("a"), {
      type: "begin", generation: 1, planKey: "a"
    });
    state = reducePreviewMediaHost(state, { type: "ready", generation: 1, planKey: "a", media: media("a") });
    state = reducePreviewMediaHost(state, {
      type: "runtime-error",
      generation: 1,
      planKey: "a",
      error: { role: "audio", statementId: "bgm", assetId: "theme", code: "decode-failed" }
    });
    state = reducePreviewMediaHost(state, { type: "begin", generation: 2, planKey: "b" });
    expect(state.runtimeErrors).toEqual([]);
    expect(previewMediaErrorCount(state)).toBe(0);
  });
});

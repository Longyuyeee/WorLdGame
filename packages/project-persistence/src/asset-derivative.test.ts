import { describe, expect, it } from "vitest";
import {
  ASSET_METADATA_SIDECAR_RECIPE_DIGEST,
  ASSET_METADATA_SIDECAR_RECIPE_NAME,
  createBlobDigest,
  prepareAssetMetadataSidecar,
  type AssetIndexEntry
} from "./index";

function entry(tags: readonly string[] = ["night", "chapter-1"]): AssetIndexEntry {
  return {
    assetId: "cg_broadcast",
    kind: "cg",
    displayName: "Broadcast CG",
    source: {
      digest: createBlobDigest(new TextEncoder().encode("source")),
      byteLength: 6,
      mimeType: "image/png"
    },
    tags
  };
}

describe("deterministic asset derivative recipes", () => {
  it("builds byte-identical metadata sidecars independent of tag order", () => {
    const first = prepareAssetMetadataSidecar(entry());
    const second = prepareAssetMetadataSidecar(entry(["chapter-1", "night"]));
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      recipeName: ASSET_METADATA_SIDECAR_RECIPE_NAME,
      recipeDigest: ASSET_METADATA_SIDECAR_RECIPE_DIGEST,
      parentDigest: entry().source.digest
    });
    expect(JSON.parse(new TextDecoder().decode(first.bytes))).toMatchObject({
      schemaVersion: 1,
      recipe: "metadata-sidecar/v1",
      assetId: "cg_broadcast"
    });
  });

  it("changes the derivative digest when source identity changes", () => {
    const first = prepareAssetMetadataSidecar(entry());
    const changed = prepareAssetMetadataSidecar({
      ...entry(),
      source: { ...entry().source, digest: createBlobDigest(new TextEncoder().encode("other")) }
    });
    expect(changed.digest).not.toBe(first.digest);
  });
});

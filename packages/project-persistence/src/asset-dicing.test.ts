import { describe, expect, it } from "vitest";
import {
  analyzeLosslessDicing,
  buildLosslessDicingPlan,
  discoverLosslessDicingGroups,
  reconstructLosslessDicingImage,
  type LosslessDicingSource
} from "./asset-dicing";

function solid(assetId: string, width: number, height: number, rgba: readonly number[]): LosslessDicingSource {
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(rgba, offset);
  return { assetId, width, height, rgba: pixels };
}

function tiled(assetId: string, colors: readonly (readonly number[])[]): LosslessDicingSource {
  const width = colors.length * 64;
  const source = solid(assetId, width, 64, [0, 0, 0, 0]);
  colors.forEach((color, tile) => {
    for (let y = 0; y < 64; y += 1) for (let x = tile * 64; x < (tile + 1) * 64; x += 1) {
      source.rgba.set(color, (y * width + x) * 4);
    }
  });
  return source;
}

describe("lossless RGBA Dicing", () => {
  it("deduplicates exact tiles across images and reconstructs every source byte", () => {
    const first = solid("cg_base", 128, 64, [30, 40, 50, 255]);
    const second = solid("cg_smile", 128, 64, [30, 40, 50, 255]);
    const report = analyzeLosslessDicing([first, second], { cellSize: 64 });
    expect(report).toMatchObject({
      decision: "adopt",
      reconstructionVerified: true,
      duplicateDecodedImageCount: 1,
      placementCount: 4,
      uniqueTileCount: 1,
      repeatedPlacementCount: 3,
      reason: "net-savings"
    });
    expect(report.netSavingsBytes).toBeGreaterThan(0);
    const plan = buildLosslessDicingPlan([first, second], { cellSize: 64 });
    expect(reconstructLosslessDicingImage(plan, first.assetId)).toEqual(first.rgba);
    expect(reconstructLosslessDicingImage(plan, second.assetId)).toEqual(second.rgba);
  });

  it("omits only byte-zero transparent tiles so reconstruction remains exact", () => {
    const source = solid("cg_transparent", 64, 64, [0, 0, 0, 0]);
    const report = analyzeLosslessDicing([source], { cellSize: 64, minNetSavingsRatio: 0 });
    expect(report).toMatchObject({ zeroTileCount: 1, uniqueTileCount: 0, reconstructionVerified: true, decision: "original" });
    const nonCanonicalTransparent = solid("cg_hidden_rgb", 64, 64, [20, 10, 5, 0]);
    expect(analyzeLosslessDicing([nonCanonicalTransparent], { cellSize: 64 })).toMatchObject({ zeroTileCount: 0 });
  });

  it("falls back to Original when exact repeats do not offset manifest cost", () => {
    const source = solid("cg_unique", 64, 64, [1, 2, 3, 255]);
    expect(analyzeLosslessDicing([source], { cellSize: 64 })).toMatchObject({
      decision: "original",
      reason: "no-repeat",
      reconstructionVerified: true
    });
  });

  it("produces the same plan digest regardless of candidate input order", () => {
    const first = solid("cg_a", 64, 64, [4, 5, 6, 255]);
    const second = solid("cg_b", 64, 64, [4, 5, 6, 255]);
    expect(analyzeLosslessDicing([first, second]).planDigest).toBe(analyzeLosslessDicing([second, first]).planDigest);
  });

  it("discovers deterministic strict similarity groups without transitive bridge merging", () => {
    const red = [240, 20, 20, 255];
    const green = [20, 240, 20, 255];
    const blue = [20, 20, 240, 255];
    const yellow = [240, 240, 20, 255];
    const purple = [180, 20, 180, 255];
    const a = tiled("cg_a", [red, green, blue]);
    const b = tiled("cg_b", [red, green, yellow]);
    const c = tiled("cg_c", [red, yellow, purple]);
    const first = discoverLosslessDicingGroups([c, a, b], { cellSize: 64, minSharedTileRatio: 0.4 });
    const second = discoverLosslessDicingGroups([b, c, a], { cellSize: 64, minSharedTileRatio: 0.4 });
    expect(first.discoveryDigest).toBe(second.discoveryDigest);
    expect(first.candidateGroups).toHaveLength(1);
    expect(first.candidateGroups[0]).toMatchObject({ assetIds: ["cg_a", "cg_b"], minimumPairSimilarity: 0.5 });
    expect(first.unassignedAssetIds).toEqual(["cg_c"]);
  });

  it("keeps different dimensions and transparent-only images out of automatic groups", () => {
    const transparent = solid("cg_empty", 64, 64, [0, 0, 0, 0]);
    const small = solid("cg_small", 64, 64, [1, 2, 3, 255]);
    const wide = solid("cg_wide", 128, 64, [1, 2, 3, 255]);
    expect(discoverLosslessDicingGroups([transparent, small, wide])).toMatchObject({
      candidateGroups: [],
      unassignedAssetIds: ["cg_empty", "cg_small", "cg_wide"]
    });
  });

  it("rejects malformed RGBA buffers and decoded pixel budget overflow", () => {
    expect(() => analyzeLosslessDicing([{ assetId: "bad", width: 2, height: 2, rgba: new Uint8Array(3) }]))
      .toThrowError(expect.objectContaining({ code: "INVALID_ASSET" }));
    expect(() => analyzeLosslessDicing([solid("large", 16, 16, [0, 0, 0, 0])], { maxTotalPixels: 100 }))
      .toThrowError(expect.objectContaining({ code: "RESOURCE_LIMIT" }));
  });
});

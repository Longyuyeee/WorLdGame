import { describe, expect, it } from "vitest";
import { AssetBlobError } from "./asset-blob";
import {
  buildLosslessDicingAtlas,
  parseLosslessDicingAtlasManifest,
  reconstructLosslessDicingAtlasImage,
  resolveLosslessDicingRuntimeImage,
  serializeLosslessDicingAtlasManifest,
  type LosslessDicingAtlasArtifact
} from "./asset-dicing-atlas";
import type { LosslessDicingSource } from "./asset-dicing";

function image(assetId: string, width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number, number]): LosslessDicingSource {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    rgba.set(pixel(x, y), (y * width + x) * 4);
  }
  return { assetId, width, height, rgba };
}

function changedByte(bytes: Uint8Array): Uint8Array {
  const changed = bytes.slice();
  changed[0] = (changed[0]! + 1) % 256;
  return changed;
}

describe("S0.24 deterministic lossless Dicing Atlas contract", () => {
  it("packs multiple pages deterministically and reconstructs every source byte", () => {
    const shared = (x: number, y: number): readonly [number, number, number, number] => x < 16
      ? [x, y, 40, 255]
      : [x, y, 80, 255];
    const sources = [
      image("cg_a", 32, 16, shared),
      image("cg_b", 32, 16, (x, y) => x < 16 ? [x, y, 40, 255] : [x, y, 120, 255])
    ];
    const first = buildLosslessDicingAtlas(sources, { cellSize: 16, padding: 2, maxAtlasSize: 32 });
    const reordered = buildLosslessDicingAtlas([...sources].reverse(), { cellSize: 16, padding: 2, maxAtlasSize: 32 });

    expect(first.pages).toHaveLength(3);
    expect(reordered.manifest.manifestDigest).toBe(first.manifest.manifestDigest);
    expect(reordered.pages.map((page) => page.rgbaDigest)).toEqual(first.pages.map((page) => page.rgbaDigest));
    for (const source of sources) expect(reconstructLosslessDicingAtlasImage(first.manifest, first.pages, source.assetId)).toEqual(source.rgba);
  });

  it("extrudes edge pixels through the full padding border", () => {
    const source = image("sprite_face", 8, 8, (x, y) => [x * 10, y * 10, x + y, 255]);
    const artifact = buildLosslessDicingAtlas([source], { cellSize: 8, padding: 2, maxAtlasSize: 32 });
    const page = artifact.pages[0]!;
    const tile = artifact.manifest.tiles[0]!;
    const pixelAt = (x: number, y: number) => [...page.rgba.subarray((y * page.width + x) * 4, (y * page.width + x) * 4 + 4)];

    expect(pixelAt(tile.x - 2, tile.y - 2)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(tile.x + tile.width + 1, tile.y + tile.height + 1)).toEqual([70, 70, 14, 255]);
    expect(pixelAt(tile.x - 1, tile.y + 3)).toEqual([0, 30, 3, 255]);
  });

  it("round-trips a canonical Manifest and rejects tampering", () => {
    const source = image("cg_manifest", 10, 10, (x, y) => x < 8 && y < 8 ? [x, y, 9, 255] : [0, 0, 0, 0]);
    const artifact = buildLosslessDicingAtlas([source], { cellSize: 8, padding: 1, maxAtlasSize: 32 });
    const serialized = serializeLosslessDicingAtlasManifest(artifact.manifest);
    expect(parseLosslessDicingAtlasManifest(serialized)).toEqual(artifact.manifest);

    const tampered = JSON.parse(serialized) as { pages: Array<{ width: number }> };
    tampered.pages[0]!.width += 1;
    expect(() => parseLosslessDicingAtlasManifest(JSON.stringify(tampered))).toThrow(AssetBlobError);
  });

  it("falls back to the exact Original on missing or corrupt pages", () => {
    const source = image("cg_fallback", 8, 8, (x, y) => [x, y, 1, 255]);
    const artifact = buildLosslessDicingAtlas([source], { cellSize: 8, padding: 2, maxAtlasSize: 32 });
    const missing = { ...artifact, pages: [] };
    const corrupt = { ...artifact, pages: [{ ...artifact.pages[0]!, rgba: changedByte(artifact.pages[0]!.rgba) }] };

    expect(resolveLosslessDicingRuntimeImage(missing, source)).toEqual({ strategy: "original", rgba: source.rgba, reason: "atlas-unavailable" });
    expect(resolveLosslessDicingRuntimeImage(corrupt, source)).toEqual({ strategy: "original", rgba: source.rgba, reason: "atlas-unavailable" });
  });

  it("falls back instead of throwing when the runtime artifact shape is corrupt", () => {
    const source = image("cg_corrupt_manifest", 8, 8, (x, y) => [x, y, 4, 255]);
    const corrupt = { manifest: { images: null }, pages: [], reconstructionVerified: true } as unknown as LosslessDicingAtlasArtifact;
    expect(() => resolveLosslessDicingRuntimeImage(corrupt, source)).not.toThrow();
    expect(resolveLosslessDicingRuntimeImage(corrupt, source)).toEqual({
      strategy: "original", rgba: source.rgba, reason: "atlas-unavailable"
    });
  });

  it("rejects an Atlas built for an older source and keeps the current Original", () => {
    const oldSource = image("cg_revision", 8, 8, (x, y) => [x, y, 2, 255]);
    const currentSource = { ...oldSource, rgba: changedByte(oldSource.rgba) };
    const artifact = buildLosslessDicingAtlas([oldSource], { cellSize: 8, padding: 2, maxAtlasSize: 32 });
    expect(resolveLosslessDicingRuntimeImage(artifact, currentSource)).toEqual({
      strategy: "original", rgba: currentSource.rgba, reason: "source-mismatch"
    });
  });

  it("fails closed when the deterministic pack exceeds its page budget", () => {
    const source = image("cg_budget", 32, 16, (x, y) => [x, y, x < 16 ? 10 : 20, 255]);
    expect(() => buildLosslessDicingAtlas([source], {
      cellSize: 16, padding: 2, maxAtlasSize: 32, maxAtlasPages: 1
    })).toThrowError(AssetBlobError);
  });

  it("uses a verified Atlas only when its bytes and source identity both match", () => {
    const source = image("cg_runtime", 8, 8, (x, y) => [x, y, 3, 255]);
    const artifact: LosslessDicingAtlasArtifact = buildLosslessDicingAtlas([source], { cellSize: 8, padding: 2, maxAtlasSize: 32 });
    const resolution = resolveLosslessDicingRuntimeImage(artifact, source);
    expect(resolution.strategy).toBe("atlas");
    expect(resolution.rgba).toEqual(source.rgba);
  });
});

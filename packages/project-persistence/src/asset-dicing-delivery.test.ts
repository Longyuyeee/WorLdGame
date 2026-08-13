import { describe, expect, it } from "vitest";
import { createBlobDigest } from "./asset-blob";
import { buildLosslessDicingAtlas } from "./asset-dicing-atlas";
import {
  createLosslessDicingPngDeliveryManifest,
  createLosslessDicingPngDeliveryRecipeDigest,
  evaluateLosslessDicingEncodedDecision,
  parseLosslessDicingPngDeliveryManifest,
  serializeLosslessDicingPngDeliveryManifest
} from "./asset-dicing-delivery";

function fixture(encodedByteLength = 80) {
  const rgba = new Uint8Array(8 * 8 * 4).fill(42);
  const atlas = buildLosslessDicingAtlas([{ assetId: "school_cg", width: 8, height: 8, rgba }], {
    cellSize: 8, padding: 2, maxAtlasSize: 32
  });
  const encoded = new Uint8Array(encodedByteLength).fill(7);
  const manifest = createLosslessDicingPngDeliveryManifest(atlas.manifest, atlas.pages.map((page) => ({
    pageId: page.pageId,
    width: page.width,
    height: page.height,
    rgbaDigest: page.rgbaDigest,
    encodedDigest: createBlobDigest(encoded),
    encodedByteLength: encoded.byteLength,
    mimeType: "image/png" as const
  })));
  return { atlas, encoded, manifest };
}

describe("S0.26 encoded lossless Dicing delivery contract", () => {
  it("round-trips a canonical delivery Manifest and binds the encoder recipe", () => {
    const { manifest } = fixture();
    const serialized = serializeLosslessDicingPngDeliveryManifest(manifest);
    expect(parseLosslessDicingPngDeliveryManifest(serialized)).toEqual(manifest);
    expect(serializeLosslessDicingPngDeliveryManifest(parseLosslessDicingPngDeliveryManifest(serialized))).toBe(serialized);
    expect(createLosslessDicingPngDeliveryRecipeDigest(manifest)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("uses actual encoded Page and canonical Manifest bytes for the second decision", () => {
    const { manifest } = fixture(80);
    const manifestBytes = new TextEncoder().encode(serializeLosslessDicingPngDeliveryManifest(manifest)).byteLength;
    expect(evaluateLosslessDicingEncodedDecision(manifest, manifestBytes + 81)).toMatchObject({
      encodedPageBytes: 80,
      manifestBytes,
      netSavingsBytes: 1,
      decision: "adopt",
      reason: "encoded-net-savings"
    });
    expect(evaluateLosslessDicingEncodedDecision(manifest, manifestBytes + 80)).toMatchObject({
      netSavingsBytes: 0,
      decision: "original",
      reason: "no-encoded-net-savings"
    });
  });

  it("rejects substituted encoded metadata and layout fields", () => {
    const { manifest } = fixture();
    expect(() => parseLosslessDicingPngDeliveryManifest(JSON.stringify({
      ...manifest,
      pages: [{ ...manifest.pages[0], encodedByteLength: manifest.pages[0]!.encodedByteLength + 1 }]
    }))).toThrow();
    expect(() => parseLosslessDicingPngDeliveryManifest(JSON.stringify({
      ...manifest,
      layoutManifest: { ...manifest.layoutManifest, sourcePlanDigest: `sha256:${"f".repeat(64)}` }
    }))).toThrow();
  });
});

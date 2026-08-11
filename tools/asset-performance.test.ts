import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  buildLosslessDicingAtlas,
  createBlobDigest,
  discoverLosslessDicingGroups,
  computeAssetReachability,
  createAssetLifecycleManifest,
  inspectUntrustedMedia,
  parseAssetIndex,
  parseAssetLifecycleManifest,
  planAssetGarbageCollection,
  prepareAssetMetadataSidecar,
  serializeAssetLifecycleManifest,
  serializeAssetIndex,
  type AssetIndex
} from "../packages/project-persistence/src/index";

const HASH_BYTES = 16 * 1024 * 1024;
const INDEX_ENTRIES = 2_000;
const MP3_FRAME_BYTES = 417;
const MP3_FRAMES = Math.floor(HASH_BYTES / MP3_FRAME_BYTES);

describe("S0.24 asset lifecycle, Dicing grouping and Atlas performance gate", () => {
  it("inspects and hashes a production-sized source chunk and round-trips a large index within budget", () => {
    const bytes = new Uint8Array(HASH_BYTES);
    for (let index = 0; index < bytes.length; index += 4096) bytes[index] = index % 251;

    const hashStart = performance.now();
    const digest = createBlobDigest(bytes);
    const hashMs = performance.now() - hashStart;

    const mp3 = new Uint8Array(MP3_FRAMES * MP3_FRAME_BYTES);
    for (let frame = 0; frame < MP3_FRAMES; frame++) mp3.set([0xff, 0xfb, 0x90, 0], frame * MP3_FRAME_BYTES);
    const inspectionStart = performance.now();
    const inspection = inspectUntrustedMedia(mp3, "audio/mpeg", "audio");
    const inspectionMs = performance.now() - inspectionStart;

    const assetIndex: AssetIndex = {
      schemaVersion: 1,
      indexRevision: INDEX_ENTRIES,
      assets: Array.from({ length: INDEX_ENTRIES }, (_, index) => ({
        assetId: `cg_benchmark_${String(index).padStart(5, "0")}`,
        kind: "cg" as const,
        displayName: `Benchmark CG ${index}`,
        source: { digest, byteLength: bytes.byteLength, mimeType: "image/png" },
        tags: [`chapter-${index % 20}`, "benchmark"]
      }))
    };
    const indexStart = performance.now();
    const serialized = serializeAssetIndex(assetIndex);
    const parsed = parseAssetIndex(serialized);
    const indexRoundtripMs = performance.now() - indexStart;
    const totalMs = inspectionMs + hashMs + indexRoundtripMs;

    console.log(JSON.stringify({
      status: "PASS",
      baseline: { inspectionBytes: mp3.byteLength, hashBytes: HASH_BYTES, indexEntries: INDEX_ENTRIES, serializedBytes: serialized.length },
      measurementsMs: {
        mediaInspection: Number(inspectionMs.toFixed(2)),
        sha256: Number(hashMs.toFixed(2)),
        indexRoundtrip: Number(indexRoundtripMs.toFixed(2)),
        total: Number(totalMs.toFixed(2))
      },
      budgetsMs: { mediaInspectionMs: 3_000, sha256Ms: 5_000, indexRoundtripMs: 2_000, totalMs: 10_000 }
    }, null, 2));

    expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(inspection).toMatchObject({ format: "MP3", sampleRate: 44_100, channels: 2 });
    expect(parsed.assets).toHaveLength(INDEX_ENTRIES);
    expect(inspectionMs).toBeLessThan(3_000);
    expect(hashMs).toBeLessThan(5_000);
    expect(indexRoundtripMs).toBeLessThan(2_000);
    expect(totalMs).toBeLessThan(10_000);
  });

  it("audits reachability and plans quarantine for a 5k-resource project within budget", () => {
    const lifecycleIndex: AssetIndex = {
      schemaVersion: 1,
      indexRevision: 5_000,
      assets: Array.from({ length: 5_000 }, (_, item) => ({
        assetId: `asset_${item}`,
        kind: "cg" as const,
        displayName: `Asset ${item}`,
        source: {
          digest: createBlobDigest(new TextEncoder().encode(`asset-${item}`)),
          byteLength: 1_048_576,
          mimeType: "image/png"
        },
        tags: []
      }))
    };
    const orphans = Array.from({ length: 500 }, (_, item) =>
      createBlobDigest(new TextEncoder().encode(`orphan-${item}`))
    );
    const start = performance.now();
    const manifest = createAssetLifecycleManifest(lifecycleIndex, 1_000);
    const parsed = parseAssetLifecycleManifest(serializeAssetLifecycleManifest(manifest));
    const reachable = computeAssetReachability(parsed, 2_000);
    const planned = planAssetGarbageCollection(parsed, [
      ...lifecycleIndex.assets.map((entry) => entry.source.digest),
      ...orphans
    ], 2_000);
    const lifecycleMs = performance.now() - start;
    const derivativeStart = performance.now();
    const sidecars = lifecycleIndex.assets.map(prepareAssetMetadataSidecar);
    const derivativeMs = performance.now() - derivativeStart;

    console.log(JSON.stringify({
      status: "PASS",
      baseline: { lifecycleNodes: parsed.nodes.length, blobInventory: 5_500, unreachable: orphans.length },
      measurementsMs: {
        lifecycleRoundtripReachabilityAndPlan: Number(lifecycleMs.toFixed(2)),
        deterministicSidecars: Number(derivativeMs.toFixed(2))
      },
      budgetsMs: { lifecycleRoundtripReachabilityAndPlan: 2_000, deterministicSidecars: 2_000 }
    }, null, 2));

    expect(reachable.size).toBe(5_000);
    expect(planned.quarantine).toHaveLength(500);
    expect(new Set(sidecars.map((sidecar) => sidecar.digest)).size).toBe(5_000);
    expect(lifecycleMs).toBeLessThan(2_000);
    expect(derivativeMs).toBeLessThan(2_000);
  });

  it("analyzes an eight-image 512px exact-repeat Dicing group within budget", () => {
    const width = 512;
    const height = 512;
    const rgba = new Uint8Array(width * height * 4);
    for (let offset = 0; offset < rgba.length; offset += 4) {
      rgba[offset] = (offset / 4) % 251;
      rgba[offset + 1] = 80;
      rgba[offset + 2] = 160;
      rgba[offset + 3] = 255;
    }
    const sources = Array.from({ length: 8 }, (_, index) => {
      const variant = rgba.slice();
      for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) variant[(y * width + x) * 4] = 240 + index;
      return { assetId: `cg_dicing_benchmark_${index}`, width, height, rgba: variant };
    });
    const start = performance.now();
    const discovery = discoverLosslessDicingGroups(sources, { cellSize: 64 });
    const dicingMs = performance.now() - start;
    const report = discovery.candidateGroups[0]?.report;
    const atlasStart = performance.now();
    const atlas = buildLosslessDicingAtlas(sources, { cellSize: 64, padding: 2, maxAtlasSize: 2048 });
    const atlasMs = performance.now() - atlasStart;
    const totalMs = dicingMs + atlasMs;

    console.log(JSON.stringify({
      status: "PASS",
      baseline: { images: sources.length, width, height, rgbaBytes: rgba.byteLength * sources.length, cellSize: 64 },
      measurementsMs: {
        groupingAnalysisAndReconstruction: Number(dicingMs.toFixed(2)),
        atlasPackingExtrusionAndReconstruction: Number(atlasMs.toFixed(2)),
        total: Number(totalMs.toFixed(2))
      },
      budgetsMs: { groupingAnalysisAndReconstruction: 3_000, atlasPackingExtrusionAndReconstruction: 3_000, total: 5_000 },
      result: { groups: discovery.candidateGroups.length, pages: atlas.pages.length, decision: report?.decision,
        repeatedPlacements: report?.repeatedPlacementCount, netSavingsRatio: report?.netSavingsRatio }
    }, null, 2));

    expect(discovery.candidateGroups).toHaveLength(1);
    expect(report).toMatchObject({ decision: "adopt", reconstructionVerified: true, imageCount: 8, duplicateDecodedImageCount: 0 });
    expect(atlas).toMatchObject({ reconstructionVerified: true, manifest: { padding: 2 } });
    expect(atlas.pages.length).toBeGreaterThan(0);
    expect(report?.repeatedPlacementCount).toBeGreaterThan(400);
    expect(dicingMs).toBeLessThan(3_000);
    expect(atlasMs).toBeLessThan(3_000);
    expect(totalMs).toBeLessThan(5_000);
  });
});

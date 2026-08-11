import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  createBlobDigest,
  parseAssetIndex,
  serializeAssetIndex,
  type AssetIndex
} from "../packages/project-persistence/src/index";

const HASH_BYTES = 16 * 1024 * 1024;
const INDEX_ENTRIES = 2_000;

describe("S0.17 asset import performance gate", () => {
  it("hashes a production-sized source chunk and round-trips a large index within budget", () => {
    const bytes = new Uint8Array(HASH_BYTES);
    for (let index = 0; index < bytes.length; index += 4096) bytes[index] = index % 251;

    const hashStart = performance.now();
    const digest = createBlobDigest(bytes);
    const hashMs = performance.now() - hashStart;

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
    const totalMs = hashMs + indexRoundtripMs;

    console.log(JSON.stringify({
      status: "PASS",
      baseline: { hashBytes: HASH_BYTES, indexEntries: INDEX_ENTRIES, serializedBytes: serialized.length },
      measurementsMs: {
        sha256: Number(hashMs.toFixed(2)),
        indexRoundtrip: Number(indexRoundtripMs.toFixed(2)),
        total: Number(totalMs.toFixed(2))
      },
      budgetsMs: { sha256Ms: 5_000, indexRoundtripMs: 2_000, totalMs: 7_000 }
    }, null, 2));

    expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(parsed.assets).toHaveLength(INDEX_ENTRIES);
    expect(hashMs).toBeLessThan(5_000);
    expect(indexRoundtripMs).toBeLessThan(2_000);
    expect(totalMs).toBeLessThan(7_000);
  });
});

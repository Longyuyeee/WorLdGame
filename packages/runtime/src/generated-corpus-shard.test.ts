import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1,
  RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1,
  RUNTIME_GENERATED_SCENARIO_IDS_V1,
  executeRuntimeGeneratedCorpusChunkV1,
  summarizeRuntimeGeneratedCorpusV1
} from "./generated-corpus";

const SHARD_COUNT = 4;
const shardIndex = Number(process.env.WORLD_RUNTIME_CORPUS_SHARD_INDEX);
const outputPath = process.env.WORLD_RUNTIME_CORPUS_OUTPUT;
const seedsPerShard = RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1 / SHARD_COUNT;

describe("N31-E7 formal Runtime generated corpus shard", () => {
  it("executes one frozen 2,500-seed shard twice with no failures", () => {
    expect(Number.isSafeInteger(shardIndex) && shardIndex >= 0 && shardIndex < SHARD_COUNT).toBe(true);
    expect(typeof outputPath === "string" && outputPath.length > 0).toBe(true);
    const seedStart = shardIndex * seedsPerShard;
    const seedEndExclusive = seedStart + seedsPerShard;
    const outcomes: string[] = [];
    const scenarioCounts = Object.fromEntries(RUNTIME_GENERATED_SCENARIO_IDS_V1.map((id) => [id, 0]));
    const started = performance.now();
    let chunkCount = 0;
    for (let start = seedStart; start < seedEndExclusive; start += RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1) {
      const chunk = executeRuntimeGeneratedCorpusChunkV1(start, Math.min(start + RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1, seedEndExclusive));
      expect(chunk.failedSeeds).toEqual([]);
      expect(chunk.outcomes.every((item) => /^[0-9a-f]{64}$/u.test(item))).toBe(true);
      outcomes.push(...chunk.outcomes);
      for (const id of RUNTIME_GENERATED_SCENARIO_IDS_V1) scenarioCounts[id] = (scenarioCounts[id] ?? 0) + chunk.scenarioCounts[id];
      chunkCount += 1;
    }
    expect(outcomes).toHaveLength(seedsPerShard);
    expect(chunkCount).toBe(10);
    writeFileSync(outputPath!, JSON.stringify({ shardIndex, seedStart, seedEndExclusive, chunkCount, scenarioCounts, outcomes, elapsedMilliseconds: Math.round(performance.now() - started) }), "utf8");
  }, 90_000);

  it("rejects oversized, noncontiguous, and incomplete corpus input", () => {
    expect(() => executeRuntimeGeneratedCorpusChunkV1(0, RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1 + 1)).toThrow("frozen bound");
    const first = executeRuntimeGeneratedCorpusChunkV1(0, 1);
    expect(() => summarizeRuntimeGeneratedCorpusV1([first])).toThrow("frozen seed range");
    expect(() => summarizeRuntimeGeneratedCorpusV1([{ ...first, seedStart: 1 }])).toThrow("non-contiguous");
    expect(() => summarizeRuntimeGeneratedCorpusV1([{ ...first, scenarioCounts: { ...first.scenarioCounts, random: 1 } }])).toThrow("invalid");
    expect(() => summarizeRuntimeGeneratedCorpusV1([{ ...first, outcomes: ["FAILED"] }])).toThrow("invalid");
  });
});

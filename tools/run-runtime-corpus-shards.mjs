import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const SHARD_COUNT = 4;
const EXPECTED_DIGEST = "01556a8c979e080cc653817713ad26f7d2882445e9ebdc727049f415da4863a9";
const EXPECTED_COUNTS = { "control-flow": 1429, random: 1429, "effect-cancellation": 1429, "save-load": 1429, "choice-history": 1428, "scheduler-equivalence": 1428, "diagnostic-rollback": 1428 };
const vitest = resolve("node_modules/vitest/vitest.mjs");
const temporaryRoot = await mkdtemp(join(tmpdir(), "world-runtime-corpus-"));

function runShard(shardIndex, outputPath) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [vitest, "run", "packages/runtime/src/generated-corpus-shard.test.ts", "--maxWorkers=1"], {
      cwd: process.cwd(),
      env: { ...process.env, WORLD_RUNTIME_CORPUS_SHARD_INDEX: String(shardIndex), WORLD_RUNTIME_CORPUS_OUTPUT: outputPath },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => code === 0 ? resolveRun() : rejectRun(new Error(`Runtime corpus shard ${shardIndex} failed\n${output}`)));
  });
}

try {
  const outputPaths = Array.from({ length: SHARD_COUNT }, (_, index) => join(temporaryRoot, `shard-${index}.json`));
  const started = performance.now();
  await Promise.all(outputPaths.map((path, index) => runShard(index, path)));
  const shards = await Promise.all(outputPaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  shards.sort((left, right) => left.shardIndex - right.shardIndex);
  const outcomes = [], scenarioCounts = Object.fromEntries(Object.keys(EXPECTED_COUNTS).map((id) => [id, 0]));
  let expectedStart = 0, chunkCount = 0;
  for (const shard of shards) {
    if (shard.seedStart !== expectedStart || shard.seedEndExclusive - shard.seedStart !== 2500 || shard.outcomes.length !== 2500) throw new Error("Runtime corpus shard coverage is non-contiguous or incomplete");
    outcomes.push(...shard.outcomes);
    for (const id of Object.keys(EXPECTED_COUNTS)) scenarioCounts[id] += shard.scenarioCounts[id];
    expectedStart = shard.seedEndExclusive;
    chunkCount += shard.chunkCount;
  }
  const outcomeDigest = createHash("sha256").update(JSON.stringify(outcomes), "utf8").digest("hex");
  const summary = { seedCount: outcomes.length, replayExecutions: outcomes.length * 2, chunkCount, scenarioCounts, failedSeeds: [], outcomeDigest };
  if (expectedStart !== 10_000 || JSON.stringify(summary) !== JSON.stringify({ seedCount: 10_000, replayExecutions: 20_000, chunkCount: 40, scenarioCounts: EXPECTED_COUNTS, failedSeeds: [], outcomeDigest: EXPECTED_DIGEST })) throw new Error(`Runtime corpus summary differs: ${JSON.stringify(summary)}`);
  console.log(JSON.stringify({ status: "PASS", corpusId: "corpus.generated.runtime.v1", ...summary, elapsedMilliseconds: Math.round(performance.now() - started), shardMilliseconds: shards.map((item) => item.elapsedMilliseconds) }, null, 2));
} finally {
  if (!temporaryRoot.startsWith(join(tmpdir(), "world-runtime-corpus-"))) throw new Error("Refusing to clean an unexpected Runtime corpus path");
  await rm(temporaryRoot, { recursive: true, force: true });
}

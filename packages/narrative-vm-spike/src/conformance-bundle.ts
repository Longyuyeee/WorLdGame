import { canonicalBytes } from "./canonical";
import { createSpike10ConformanceCorpusV0, executeConformanceCorpusV0, executeSpike11ConformanceSuiteV0 } from "./conformance";
import { executeSpike13ConformanceSuiteV0 } from "./conformance-spike13";
import { GENERATED_CORPUS_CHUNK_SIZE_V0, GENERATED_CORPUS_SEED_COUNT_V0, executeGeneratedCorpusChunkV0, summarizeGeneratedCorpusV0 } from "./generated-corpus";
import { sha256Hex } from "./sha256";

export const CONFORMANCE_BUNDLE_ID_V0 = "bundle.cl04.spike14.v0" as const;
export const CONFORMANCE_EXIT_MATCH = 0;
export const CONFORMANCE_EXIT_DIFFERENCE = 2;
export const CONFORMANCE_EXIT_INVALID = 64;
export const CONFORMANCE_EXIT_INTERNAL = 70;

export interface ConformanceGoldenV0 {
  readonly spike10: { readonly recordCount: 12; readonly corpusDigest: string; readonly traceDigest: string };
  readonly spike11: { readonly recordCount: 16; readonly suiteDigest: string };
  readonly spike12: { readonly seedCount: 10_000; readonly replayExecutions: 20_000; readonly chunkCount: 40; readonly failedSeedCount: 0; readonly outcomeDigest: string };
  readonly spike13: { readonly recordCount: 22; readonly suiteDigest: string };
}

export interface ConformanceBundleV0 {
  readonly schemaVersion: 0;
  readonly bundleId: typeof CONFORMANCE_BUNDLE_ID_V0;
  readonly runtimeVersion: "cl04-spike.9";
  readonly golden: ConformanceGoldenV0;
  readonly bundleDigest: string;
}

export interface ConformanceObservationV0 {
  readonly schemaVersion: 0;
  readonly bundleId: typeof CONFORMANCE_BUNDLE_ID_V0;
  readonly hostId: string;
  readonly result: ConformanceGoldenV0;
}

export interface ConformanceDifferenceV0 {
  readonly path: string;
  readonly kind: "value" | "missing" | "unexpected" | "type";
  readonly expected: unknown;
  readonly actual: unknown;
}

export interface ConformanceDifferenceReportV0 {
  readonly schemaVersion: 0;
  readonly bundleId: typeof CONFORMANCE_BUNDLE_ID_V0;
  readonly hostId: string | null;
  readonly status: "match" | "difference" | "invalid";
  readonly exitCode: 0 | 2 | 64;
  readonly differences: readonly ConformanceDifferenceV0[];
}

const GOLDEN: ConformanceGoldenV0 = {
  spike10: {
    recordCount: 12,
    corpusDigest: "6b0b6a12c890a7c2cda7966e3825df12b484ad4a1a5b651e5cdada7c74d6491f",
    traceDigest: "9a2e76dc518be215453fb43854ccc6e97bb47e70feaff1b2a87c86223b052738"
  },
  spike11: { recordCount: 16, suiteDigest: "39937239e2a6635ea7448f36f16297f71564323c6a97747b878a58a8e77894cc" },
  spike12: {
    seedCount: 10_000, replayExecutions: 20_000, chunkCount: 40, failedSeedCount: 0,
    outcomeDigest: "770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048"
  },
  spike13: { recordCount: 22, suiteDigest: "fdf3b8dcc83f57f29b45a27f275c48254dbe4e3c208d788d196eb4fb7c74fb26" }
};

function bundleBody(): Omit<ConformanceBundleV0, "bundleDigest"> {
  return { schemaVersion: 0, bundleId: CONFORMANCE_BUNDLE_ID_V0, runtimeVersion: "cl04-spike.9", golden: GOLDEN };
}

export function createConformanceBundleV0(): ConformanceBundleV0 {
  const body = bundleBody();
  return { ...body, bundleDigest: sha256Hex(canonicalBytes(body)) };
}

export function executeConformanceBundleV0(hostId: string): ConformanceObservationV0 {
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(hostId)) throw new TypeError("Conformance host ID is invalid");
  const spike10 = executeConformanceCorpusV0(createSpike10ConformanceCorpusV0());
  const spike11 = executeSpike11ConformanceSuiteV0();
  const chunks = [];
  for (let start = 0; start < GENERATED_CORPUS_SEED_COUNT_V0; start += GENERATED_CORPUS_CHUNK_SIZE_V0) {
    chunks.push(executeGeneratedCorpusChunkV0(start, Math.min(start + GENERATED_CORPUS_CHUNK_SIZE_V0, GENERATED_CORPUS_SEED_COUNT_V0)));
  }
  const spike12 = summarizeGeneratedCorpusV0(chunks);
  const spike13 = executeSpike13ConformanceSuiteV0();
  return {
    schemaVersion: 0,
    bundleId: CONFORMANCE_BUNDLE_ID_V0,
    hostId,
    result: {
      spike10: { recordCount: spike10.records.length as 12, corpusDigest: spike10.corpusDigest, traceDigest: spike10.traceDigest },
      spike11: { recordCount: spike11.records.length as 16, suiteDigest: spike11.suiteDigest },
      spike12: { seedCount: spike12.seedCount as 10_000, replayExecutions: spike12.replayExecutions as 20_000,
        chunkCount: spike12.chunkCount as 40, failedSeedCount: spike12.failedSeeds.length as 0, outcomeDigest: spike12.outcomeDigest },
      spike13: { recordCount: spike13.records.length as 22, suiteDigest: spike13.suiteDigest }
    }
  };
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function differences(expected: unknown, actual: unknown, path: string): ConformanceDifferenceV0[] {
  if (objectRecord(expected)) {
    if (!objectRecord(actual)) return [{ path, kind: "type", expected, actual }];
    const result: ConformanceDifferenceV0[] = [];
    for (const key of Object.keys(expected).sort()) {
      const nextPath = `${path}.${key}`;
      if (!(key in actual)) result.push({ path: nextPath, kind: "missing", expected: expected[key], actual: null });
      else result.push(...differences(expected[key], actual[key], nextPath));
    }
    for (const key of Object.keys(actual).filter((item) => !(item in expected)).sort()) {
      result.push({ path: `${path}.${key}`, kind: "unexpected", expected: null, actual: actual[key] });
    }
    return result;
  }
  if (typeof expected !== typeof actual) return [{ path, kind: "type", expected, actual }];
  return expected === actual ? [] : [{ path, kind: "value", expected, actual }];
}

export function compareConformanceObservationV0(bundle: ConformanceBundleV0, observed: unknown): ConformanceDifferenceReportV0 {
  const expectedBundle = createConformanceBundleV0();
  const { bundleDigest, ...actualBody } = bundle;
  if (bundleDigest !== expectedBundle.bundleDigest || sha256Hex(canonicalBytes(actualBody)) !== bundleDigest ||
      !objectRecord(observed) || observed.schemaVersion !== 0 || observed.bundleId !== CONFORMANCE_BUNDLE_ID_V0 ||
      typeof observed.hostId !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(observed.hostId) || !objectRecord(observed.result)) {
    return { schemaVersion: 0, bundleId: CONFORMANCE_BUNDLE_ID_V0, hostId: objectRecord(observed) && typeof observed.hostId === "string" ? observed.hostId : null,
      status: "invalid", exitCode: CONFORMANCE_EXIT_INVALID, differences: [] };
  }
  const found = differences(bundle.golden, observed.result, "result");
  return { schemaVersion: 0, bundleId: CONFORMANCE_BUNDLE_ID_V0, hostId: observed.hostId,
    status: found.length === 0 ? "match" : "difference", exitCode: found.length === 0 ? CONFORMANCE_EXIT_MATCH : CONFORMANCE_EXIT_DIFFERENCE,
    differences: found };
}

/// <reference lib="webworker" />

import {
  GENERATED_CORPUS_CHUNK_SIZE_V0,
  GENERATED_CORPUS_SEED_COUNT_V0,
  createSpike10ConformanceCorpusV0,
  executeGeneratedCorpusChunkV0,
  executeConformanceCorpusV0,
  executeSpike11ConformanceSuiteV0,
  executeSpike13ConformanceSuiteV0,
  summarizeGeneratedCorpusV0
} from "@world-studio/narrative-vm-spike";
import type { RuntimeWorkerRequestV1, RuntimeWorkerResponseV1, WorkerRequestV0, WorkerResponseV0 } from "./protocol";
import {
  RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1,
  RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1,
  executeRuntimeConformanceV1,
  executeRuntimeGeneratedCorpusChunkV1,
  summarizeRuntimeGeneratedCorpusV1
} from "@world-studio/runtime";

const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener("message", async (event: MessageEvent<WorkerRequestV0 | RuntimeWorkerRequestV1>) => {
  const request = event.data;
  if (request.protocolVersion === 1 && request.kind === "runRuntimeConformance" && request.requestId === "request.runtime-v1.web-worker") {
    const response: RuntimeWorkerResponseV1 = { protocolVersion: 1, kind: "runtimeConformanceResult", requestId: request.requestId, host: "web-worker", result: executeRuntimeConformanceV1() };
    scope.postMessage(response);
    return;
  }
  if (request.protocolVersion !== 0 || request.kind !== "runHostConformance" ||
      request.requestId !== "request.spike13.web-worker") {
    throw new TypeError("Web Worker conformance request is invalid");
  }
  const started = performance.now();
  const chunks = [];
  for (let start = 0; start < GENERATED_CORPUS_SEED_COUNT_V0; start += GENERATED_CORPUS_CHUNK_SIZE_V0) {
    chunks.push(executeGeneratedCorpusChunkV0(
      start,
      Math.min(start + GENERATED_CORPUS_CHUNK_SIZE_V0, GENERATED_CORPUS_SEED_COUNT_V0)
    ));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const spike12 = summarizeGeneratedCorpusV0(chunks);
  const runtimeCorpusStarted = performance.now();
  const runtimeChunks = [];
  for (let start = 0; start < RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1; start += RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1) {
    runtimeChunks.push(executeRuntimeGeneratedCorpusChunkV1(
      start,
      Math.min(start + RUNTIME_GENERATED_CORPUS_CHUNK_SIZE_V1, RUNTIME_GENERATED_CORPUS_SEED_COUNT_V1)
    ));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const runtimeCorpus = summarizeRuntimeGeneratedCorpusV1(runtimeChunks);
  const response: WorkerResponseV0 = {
    protocolVersion: 0,
    kind: "hostConformanceResult",
    requestId: request.requestId,
    host: "web-worker",
    result: executeConformanceCorpusV0(createSpike10ConformanceCorpusV0()),
    spike11: executeSpike11ConformanceSuiteV0(),
    spike12,
    spike12ElapsedMilliseconds: performance.now() - started,
    spike13: executeSpike13ConformanceSuiteV0(),
    runtime: executeRuntimeConformanceV1(),
    runtimeCorpus,
    runtimeCorpusElapsedMilliseconds: performance.now() - runtimeCorpusStarted
  };
  scope.postMessage(response);
});

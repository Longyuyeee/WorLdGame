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
import type { RuntimeE2WorkerRequestV1, RuntimeE2WorkerResponseV1, WorkerRequestV0, WorkerResponseV0 } from "./protocol";
import { executeRuntimeE2ConformanceV1 } from "@world-studio/runtime";

const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener("message", async (event: MessageEvent<WorkerRequestV0 | RuntimeE2WorkerRequestV1>) => {
  const request = event.data;
  if (request.protocolVersion === 1 && request.kind === "runRuntimeE2Conformance" && request.requestId === "request.runtime-e2.web-worker") {
    const response: RuntimeE2WorkerResponseV1 = { protocolVersion: 1, kind: "runtimeE2ConformanceResult", requestId: request.requestId, host: "web-worker", result: executeRuntimeE2ConformanceV1() };
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
    runtimeE2: executeRuntimeE2ConformanceV1()
  };
  scope.postMessage(response);
});

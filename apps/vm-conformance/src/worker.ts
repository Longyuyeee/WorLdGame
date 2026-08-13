/// <reference lib="webworker" />

import {
  GENERATED_CORPUS_CHUNK_SIZE_V0,
  GENERATED_CORPUS_SEED_COUNT_V0,
  createSpike10ConformanceCorpusV0,
  executeGeneratedCorpusChunkV0,
  executeConformanceCorpusV0,
  executeSpike11ConformanceSuiteV0,
  summarizeGeneratedCorpusV0
} from "@world-studio/narrative-vm-spike";
import type { WorkerRequestV0, WorkerResponseV0 } from "./protocol";

const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener("message", async (event: MessageEvent<WorkerRequestV0>) => {
  const request = event.data;
  if (request.protocolVersion !== 0 || request.kind !== "runHostConformance" ||
      request.requestId !== "request.spike12.web-worker") {
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
    spike12ElapsedMilliseconds: performance.now() - started
  };
  scope.postMessage(response);
});

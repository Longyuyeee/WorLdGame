/// <reference lib="webworker" />

import {
  createSpike10ConformanceCorpusV0,
  executeConformanceCorpusV0,
  executeSpike11ConformanceSuiteV0
} from "@world-studio/narrative-vm-spike";
import type { WorkerRequestV0, WorkerResponseV0 } from "./protocol";

const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<WorkerRequestV0>) => {
  const request = event.data;
  if (request.protocolVersion !== 0 || request.kind !== "runHostConformance" ||
      request.requestId !== "request.spike11.web-worker") {
    throw new TypeError("Web Worker conformance request is invalid");
  }
  const response: WorkerResponseV0 = {
    protocolVersion: 0,
    kind: "hostConformanceResult",
    requestId: request.requestId,
    host: "web-worker",
    result: executeConformanceCorpusV0(createSpike10ConformanceCorpusV0()),
    spike11: executeSpike11ConformanceSuiteV0()
  };
  scope.postMessage(response);
});

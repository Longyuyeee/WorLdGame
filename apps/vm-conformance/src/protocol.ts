import type { ConformanceResultV0, GeneratedCorpusSummaryV0, Spike11ConformanceResultV0, Spike13ConformanceResultV0 } from "@world-studio/narrative-vm-spike";
import type { RuntimeConformanceResultV1, RuntimeGeneratedCorpusSummaryV1 } from "@world-studio/runtime";
import type { RuntimePresentationHostConformanceResultV1 } from "@world-studio/runtime-host";

export interface WorkerRequestV0 {
  readonly protocolVersion: 0;
  readonly kind: "runHostConformance";
  readonly requestId: "request.spike13.web-worker";
}

export interface WorkerResponseV0 {
  readonly protocolVersion: 0;
  readonly kind: "hostConformanceResult";
  readonly requestId: WorkerRequestV0["requestId"];
  readonly host: "web-worker";
  readonly result: ConformanceResultV0;
  readonly spike11: Spike11ConformanceResultV0;
  readonly spike12: GeneratedCorpusSummaryV0;
  readonly spike12ElapsedMilliseconds: number;
  readonly spike13: Spike13ConformanceResultV0;
  readonly runtime: RuntimeConformanceResultV1;
  readonly runtimeCorpus: RuntimeGeneratedCorpusSummaryV1;
  readonly runtimeCorpusElapsedMilliseconds: number;
}

export interface RuntimeWorkerRequestV1 {
  readonly protocolVersion: 1;
  readonly kind: "runRuntimeConformance";
  readonly requestId: "request.runtime-v1.web-worker";
}

export interface RuntimeWorkerResponseV1 {
  readonly protocolVersion: 1;
  readonly kind: "runtimeConformanceResult";
  readonly requestId: RuntimeWorkerRequestV1["requestId"];
  readonly host: "web-worker";
  readonly result: RuntimeConformanceResultV1;
  readonly presentationHost: RuntimePresentationHostConformanceResultV1;
}

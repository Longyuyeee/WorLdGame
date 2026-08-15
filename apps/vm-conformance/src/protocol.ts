import type { ConformanceResultV0, GeneratedCorpusSummaryV0, Spike11ConformanceResultV0, Spike13ConformanceResultV0 } from "@world-studio/narrative-vm-spike";
import type { RuntimeE2ConformanceResultV1 } from "@world-studio/runtime";

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
  readonly runtimeE2: RuntimeE2ConformanceResultV1;
}

export interface RuntimeE2WorkerRequestV1 {
  readonly protocolVersion: 1;
  readonly kind: "runRuntimeE2Conformance";
  readonly requestId: "request.runtime-e2.web-worker";
}

export interface RuntimeE2WorkerResponseV1 {
  readonly protocolVersion: 1;
  readonly kind: "runtimeE2ConformanceResult";
  readonly requestId: RuntimeE2WorkerRequestV1["requestId"];
  readonly host: "web-worker";
  readonly result: RuntimeE2ConformanceResultV1;
}

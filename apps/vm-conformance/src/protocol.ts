import type { ConformanceResultV0, GeneratedCorpusSummaryV0, Spike11ConformanceResultV0 } from "@world-studio/narrative-vm-spike";

export interface WorkerRequestV0 {
  readonly protocolVersion: 0;
  readonly kind: "runHostConformance";
  readonly requestId: "request.spike12.web-worker";
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
}

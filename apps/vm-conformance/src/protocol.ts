import type { ConformanceResultV0 } from "@world-studio/narrative-vm-spike";

export interface WorkerRequestV0 {
  readonly protocolVersion: 0;
  readonly kind: "runSpike10Corpus";
  readonly requestId: "request.spike10.web-worker";
}

export interface WorkerResponseV0 {
  readonly protocolVersion: 0;
  readonly kind: "spike10CorpusResult";
  readonly requestId: WorkerRequestV0["requestId"];
  readonly host: "web-worker";
  readonly result: ConformanceResultV0;
}

import {
  AssetBlobError,
  inspectUntrustedMedia,
  type AssetKind
} from "@world-studio/project-persistence";

interface InspectionRequest {
  readonly id: number;
  readonly bytes: ArrayBuffer;
  readonly declaredMimeType: string;
  readonly kind: AssetKind;
}

const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<InspectionRequest>) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  try {
    const bytes = new Uint8Array(request.bytes);
    const report = inspectUntrustedMedia(bytes, request.declaredMimeType, request.kind);
    workerScope.postMessage({ id: request.id, ok: true, report, bytes: request.bytes }, [request.bytes]);
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof AssetBlobError
        ? { code: error.code, operation: error.operation, subject: error.subject, message: error.message }
        : { code: "INSPECTION_UNAVAILABLE", operation: "index", subject: "inspection-worker", message: error instanceof Error ? error.message : "Media inspection failed" }
    });
  }
});

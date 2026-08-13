import type { WorkerRequestV0, WorkerResponseV0 } from "./protocol";
import { SPIKE10_NODE_GOLDEN_V0, SPIKE11_NODE_GOLDEN_V0 } from "./golden";

const status = document.querySelector<HTMLParagraphElement>("#status");
const output = document.querySelector<HTMLPreElement>("#result");
if (status === null || output === null) throw new TypeError("Conformance Harness DOM is incomplete");
status.dataset.userAgent = navigator.userAgent;

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
  name: "world-vm-conformance-spike11"
});
const request: WorkerRequestV0 = {
  protocolVersion: 0,
  kind: "runHostConformance",
  requestId: "request.spike11.web-worker"
};

const deadline = window.setTimeout(() => {
  worker.terminate();
  status.dataset.status = "failed";
  status.textContent = "FAIL：Web Worker 超过 10 秒期限";
}, 10_000);

worker.addEventListener("message", (event: MessageEvent<WorkerResponseV0>) => {
  window.clearTimeout(deadline);
  worker.terminate();
  const response = event.data;
  if (response.protocolVersion !== 0 || response.kind !== "hostConformanceResult" ||
      response.requestId !== request.requestId || response.host !== "web-worker") {
    status.dataset.status = "failed";
    status.textContent = "FAIL：Worker 返回协议不匹配";
    return;
  }
  const matchesSpike10 = response.result.corpusDigest === SPIKE10_NODE_GOLDEN_V0.corpusDigest &&
    response.result.traceDigest === SPIKE10_NODE_GOLDEN_V0.traceDigest &&
    response.result.recordDigests.length === SPIKE10_NODE_GOLDEN_V0.recordDigests.length &&
    response.result.recordDigests.every((digest, index) => digest === SPIKE10_NODE_GOLDEN_V0.recordDigests[index]);
  const matchesSpike11 = response.spike11.suiteDigest === SPIKE11_NODE_GOLDEN_V0.suiteDigest &&
    response.spike11.recordDigests.length === SPIKE11_NODE_GOLDEN_V0.recordDigests.length &&
    response.spike11.recordDigests.every((digest, index) => digest === SPIKE11_NODE_GOLDEN_V0.recordDigests[index]);
  if (!matchesSpike10 || !matchesSpike11) {
    status.dataset.status = "failed";
    status.textContent = "FAIL：Web Worker 逐步 Hash 流与 Node Golden 不一致";
    output.textContent = JSON.stringify(response, null, 2);
    return;
  }
  status.dataset.status = "passed";
  status.textContent = "PASS：真实 Web Worker 的 12 条基础记录与 16 条 History/Scheduler/Save 记录均和 Node Golden 零差异";
  output.textContent = JSON.stringify(response, null, 2);
}, { once: true });

worker.addEventListener("error", (event) => {
  window.clearTimeout(deadline);
  worker.terminate();
  status.dataset.status = "failed";
  status.textContent = `FAIL：${event.message || "Web Worker 执行失败"}`;
}, { once: true });

worker.postMessage(request);

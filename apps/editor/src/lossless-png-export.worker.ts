import { optimizeLosslessPng } from "./lossless-png-export";
self.addEventListener("message", (event: MessageEvent<ArrayBuffer>) => {
  const result = optimizeLosslessPng(new Uint8Array(event.data));
  self.postMessage(result, { transfer: [result.bytes.buffer] });
});

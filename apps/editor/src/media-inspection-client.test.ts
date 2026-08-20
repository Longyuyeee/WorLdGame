import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectAssetBytes, mediaInspectionToJson } from "./media-inspection-client";

afterEach(() => vi.unstubAllGlobals());

function png(): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  bytes[19] = 32;
  bytes[23] = 16;
  return bytes;
}

describe("media inspection client boundary", () => {
  it("uses the deterministic fallback when Worker is unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    const source = png();
    const inspected = await inspectAssetBytes(source, "image/png", "cg");
    expect(inspected.bytes).toBe(source);
    expect(mediaInspectionToJson(inspected.report)).toMatchObject({
      status: "pass",
      format: "PNG",
      width: 32,
      height: 16
    });
  });

  it("honors cancellation before fallback inspection", async () => {
    vi.stubGlobal("Worker", undefined);
    const controller = new AbortController();
    controller.abort();
    await expect(inspectAssetBytes(png(), "image/png", "cg", controller.signal)).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("terminates an active inspection Worker when cancelled", async () => {
    let terminated = false;
    class WaitingWorker {
      addEventListener(): void { /* Intentionally never responds. */ }
      postMessage(): void { /* Keeps the request pending until cancellation. */ }
      terminate(): void { terminated = true; }
    }
    vi.stubGlobal("Worker", WaitingWorker);
    const controller = new AbortController();
    const pending = inspectAssetBytes(png(), "image/png", "cg", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(terminated).toBe(true);
  });

  it("normalizes a Worker startup failure without falling through to import", async () => {
    class BlockedWorker {
      constructor() { throw new Error("blocked by policy"); }
    }
    vi.stubGlobal("Worker", BlockedWorker);
    await expect(inspectAssetBytes(png(), "image/png", "cg")).rejects.toMatchObject({ code: "INSPECTION_UNAVAILABLE" });
  });
});

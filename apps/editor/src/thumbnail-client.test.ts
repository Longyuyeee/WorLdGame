import { afterEach, describe, expect, it, vi } from "vitest";
import { generateThumbnailInWorker } from "./thumbnail-client";

afterEach(() => vi.unstubAllGlobals());

describe("isolated thumbnail client", () => {
  it("fails closed when Worker is unavailable instead of decoding on the main thread", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(generateThumbnailInWorker(new Uint8Array([1]), "image/png")).rejects.toMatchObject({
      code: "DERIVATIVE_UNAVAILABLE"
    });
  });

  it("terminates the isolated Worker on cancellation", async () => {
    let terminated = false;
    class WaitingWorker {
      addEventListener(): void { /* waits for cancellation */ }
      postMessage(): void { /* no response */ }
      terminate(): void { terminated = true; }
    }
    vi.stubGlobal("Worker", WaitingWorker);
    const controller = new AbortController();
    const pending = generateThumbnailInWorker(new Uint8Array([1]), "image/png", 320, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(terminated).toBe(true);
  });

  it("accepts only a correlated Worker result and returns recipe-addressed PNG bytes", async () => {
    class SuccessfulWorker {
      private readonly listeners = new Map<string, (event: MessageEvent) => void>();
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      postMessage(request: { readonly id: number }): void {
        this.listeners.get("message")?.({ data: {
          id: request.id,
          ok: true,
          bytes: new Uint8Array([7, 8, 9]).buffer,
          width: 160,
          height: 90
        } } as MessageEvent);
      }
      terminate(): void { /* completed */ }
    }
    vi.stubGlobal("Worker", SuccessfulWorker);
    const result = await generateThumbnailInWorker(new Uint8Array([1]), "image/png", 320);
    expect(Array.from(result.bytes)).toEqual([7, 8, 9]);
    expect(result).toMatchObject({ width: 160, height: 90, mimeType: "image/png", recipeName: "thumbnail/web-canvas-png-v1/320" });
    expect(result.recipeDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

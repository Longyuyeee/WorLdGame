import { expect, it } from "vitest";
import { unzlibSync } from "fflate";
import { compressAtlasFallback } from "./native-atlas-export";

it("terminates a pending compression and allows a fresh lossless retry", async () => {
  const controller = new AbortController();
  const pending = compressAtlasFallback(new Uint8Array(1024 * 1024), controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const bytes = new Uint8Array([0, 1, 2, 255]);
  expect(unzlibSync(await compressAtlasFallback(bytes))).toEqual(bytes);
  expect(() => compressAtlasFallback(bytes, controller.signal)).toThrow();
});

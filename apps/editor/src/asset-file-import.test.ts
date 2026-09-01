import { describe, expect, it, vi } from "vitest";
import {
  WEB_ASSET_IMPORT_MAX_BYTES,
  canonicalAssetId,
  inferAssetKind,
  readAssetFile
} from "./asset-file-import";

describe("browser asset file ingestion", () => {
  it("derives canonical stable-ID suggestions and conservative kinds", () => {
    expect(canonicalAssetId("Broadcast Room Final.PNG", 1)).toBe("broadcast_room_final");
    expect(canonicalAssetId("01-CG.png", 2)).toBe("asset_01_cg");
    expect(canonicalAssetId("黄昏广播.png", 3)).toBe("asset_import_3");
    expect(inferAssetKind("image/png")).toBe("cg");
    expect(inferAssetKind("audio/ogg")).toBe("audio");
    expect(inferAssetKind("application/octet-stream")).toBe("other");
  });

  it("reads exact binary bytes and reports completion", async () => {
    const progress = vi.fn();
    const file = new File([new Uint8Array([0, 255, 1, 254])], "cg.png", { type: "image/png" });
    const bytes = await readAssetFile(file, {
      maxBytes: WEB_ASSET_IMPORT_MAX_BYTES,
      onProgress: progress
    });
    expect(Array.from(bytes)).toEqual([0, 255, 1, 254]);
    expect(progress).toHaveBeenLastCalledWith({ loadedBytes: 4, totalBytes: 4, ratio: 1 });
  });

  it("rejects over-budget content before starting FileReader", async () => {
    const file = new File([new Uint8Array(5)], "large.png", { type: "image/png" });
    await expect(readAssetFile(file, { maxBytes: 4 })).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
  });

  it("honors cancellation before reading", async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(["cancel"], "cancel.png", { type: "image/png" });
    await expect(readAssetFile(file, {
      maxBytes: 1024,
      signal: controller.signal
    })).rejects.toMatchObject({ code: "CANCELLED" });
  });
});

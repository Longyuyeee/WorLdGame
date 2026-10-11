import { expect,it } from "vitest";
import { supportsCanvasSampling } from "./export-optimization";
import media from "../../../fixtures/projects/media/media-golden.json";
it("marks only bounded static PNGs, preserving animation and other formats",()=>{
  const png=Uint8Array.from(atob(media.assets.find(a=>a.assetId==="media_sunset")!.base64),c=>c.charCodeAt(0));
  expect(supportsCanvasSampling(png,"image/png")).toBe(true);
  expect(supportsCanvasSampling(png,"image/webp")).toBe(false);
  const animated=png.slice();animated.set(new TextEncoder().encode("acTL"),37);
  expect(supportsCanvasSampling(animated,"image/png")).toBe(false);
  const huge=png.slice();new DataView(huge.buffer).setUint32(16,10_000_000);
  expect(supportsCanvasSampling(huge,"image/png")).toBe(false);
  expect(supportsCanvasSampling(png.subarray(0,20),"image/png")).toBe(false);
});

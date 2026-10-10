import { describe, it, expect, vi } from "vitest";
import { buildLosslessDicingAtlas, createLosslessDicingPngDeliveryManifest, serializeLosslessDicingPngDeliveryManifest, createBlobDigest } from "@world-studio/project-persistence";
import { loadProject, saveProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { unpackAtlasFallback } from "@world-studio/player-shell/native-atlas";
import branching from "../../../fixtures/projects/branching/project.s0.json";
import { setAtlasExportGroups } from "./atlas-export";
import { buildNativeAtlasDelivery, nativeAtlasEnabled, setNativeAtlas } from "./native-atlas-export";

function fixture() {
  const project = setNativeAtlas(setAtlasExportGroups(loadProject(migrateS0Project(branching as S0Project).files), ["group1"]), true);
  const atlas = buildLosslessDicingAtlas(["a", "b"].map(assetId => ({ assetId, width: 8, height: 8, rgba: new Uint8Array(256).fill(255) })), { cellSize: 8, padding: 2, maxAtlasSize: 32 });
  const encoded = new Uint8Array(80);
  const manifest = createLosslessDicingPngDeliveryManifest(atlas.manifest, atlas.pages.map(page => ({ ...page, encodedDigest: createBlobDigest(encoded), encodedByteLength: encoded.length, mimeType: "image/png" as const })));
  const deliveryManifestJson = serializeLosslessDicingPngDeliveryManifest(manifest);
  const publication = { deliveryManifestJson, manifestDigest: createBlobDigest(new TextEncoder().encode(deliveryManifestJson)), encodedPages: atlas.pages.map(page => ({ pageId: page.pageId, digest: createBlobDigest(encoded), bytes: encoded })) };
  const media = ["a", "b"].map((assetId, index) => { const bytes = new Uint8Array(100_000).fill(index); return { assetId, displayName: assetId, mimeType: "image/png", bytes, digest: createBlobDigest(bytes) }; });
  return { project, media, publication, reader: { loadDicingRuntimePublication: async () => publication }, verify: vi.fn(async () => new Uint8Array()) };
}
describe("native Atlas delivery admission", () => {
  it("persists opt-in and includes all shared delivery bytes while retaining originals", async () => {
    const f = fixture(); expect(nativeAtlasEnabled(loadProject(saveProject(f.project)))).toBe(true);
    const result = await buildNativeAtlasDelivery(f.project, f.media, f.reader, f.verify);
    expect(result.adopted).toEqual(new Set(["a", "b"])); expect(f.verify).toHaveBeenCalledTimes(2);
    expect(result.rows[0]?.payloadBytes).toBe(new TextEncoder().encode(JSON.stringify(result.groups[0])).length);
    const fallback = unpackAtlasFallback(result.groups[0]!);
    f.media.forEach(asset => expect(fallback.get(asset.assetId)).toEqual(asset.bytes));
    expect(f.media[0]?.bytes.length).toBe(100_000);
    expect((await buildNativeAtlasDelivery(setNativeAtlas(f.project, false), f.media, f.reader, f.verify)).groups).toEqual([]);
  });
  it("rejects groups atomically on stale sources, missing members or missing derivatives", async () => {
    const f = fixture();
    for (const result of [
      await buildNativeAtlasDelivery(f.project, f.media, {}, f.verify),
      await buildNativeAtlasDelivery(f.project, f.media.slice(1), f.reader, f.verify),
      await buildNativeAtlasDelivery(f.project, f.media, f.reader, async asset => { if (asset.assetId === "b") throw Error("source-mismatch"); return new Uint8Array(); })
    ]) { expect(result.groups).toEqual([]); expect(result.adopted.size).toBe(0); expect(result.rows[0]?.payloadBytes).toBe(0); }
  });
  it("does not claim savings if ordinary bytes remain referenced outside the group", async () => {
    const f = fixture(); const media = [...f.media, ...f.media.map(asset => ({ ...asset, assetId: asset.assetId + "outside" }))];
    expect((await buildNativeAtlasDelivery(f.project, media, f.reader, f.verify)).rows[0]?.detail).toContain("无净收益");
  });
  it("declines oversized fallback before expensive verification and compression", async () => {
    const f = fixture(); const bytes = new Uint8Array(32 * 1024 * 1024);
    const result = await buildNativeAtlasDelivery(f.project, [{ ...f.media[0]!, bytes }, f.media[1]!], f.reader, f.verify);
    expect(result.rows[0]?.detail).toContain("内存预算"); expect(f.verify).not.toHaveBeenCalled();
  });
});

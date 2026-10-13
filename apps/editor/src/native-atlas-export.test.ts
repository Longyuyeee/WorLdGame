import { describe, it, expect, vi } from "vitest";
import { buildLosslessDicingAtlas, createLosslessDicingPngDeliveryManifest, serializeLosslessDicingPngDeliveryManifest, createBlobDigest } from "@world-studio/project-persistence";
import { loadProject, saveProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { unpackAtlasFallback } from "@world-studio/player-shell/native-atlas";
import branching from "../../../fixtures/projects/branching/project.s0.json";
import { setAtlasExportGroups } from "./atlas-export";
import { buildNativeAtlasDelivery, nativeAtlasEnabled, setNativeAtlas } from "./native-atlas-export";
import { AtlasVerificationSession } from "./atlas-verification-session";

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
  it("reuses compressed groups while rechecking deletion, corruption, icons and outside references", async () => {
    const f = fixture(), session = new AtlasVerificationSession(f.verify);
    const run = (project=f.project, media=f.media, reader=f.reader) => buildNativeAtlasDelivery(project,media,reader,session.verify);
    const cold = await run(), warm = await run();
    expect(warm.groups).toEqual(cold.groups); expect(warm.rows[0]?.detail).toContain("复用本会话");
    expect(session.deliverySnapshot().built).toBe(1);
    expect((await run(f.project,f.media,{loadDicingRuntimePublication:async()=>null} as unknown as typeof f.reader)).groups).toEqual([]);
    expect((await run(f.project,f.media.slice(1))).groups).toEqual([]);
    const corrupt = {...f.publication, encodedPages:f.publication.encodedPages.map(p=>({...p,bytes:new Uint8Array(80).fill(9)}))};
    expect((await run(f.project,f.media,{loadDicingRuntimePublication:async()=>corrupt})).rows[0]?.detail).toContain("摘要错误");
    const icon = {...f.project,manifest:{...f.project.manifest,preservedFields:{...f.project.manifest.preservedFields,webPublication:{iconAssetId:"a"}}}};
    expect((await run(icon)).groups).toEqual([]);
    expect((await run(f.project,[...f.media,...f.media.map(a=>({...a,assetId:a.assetId+"outside"}))])).groups).toEqual([]);
    expect(session.deliverySnapshot().built).toBe(1);
    const bytes=new Uint8Array(100_000).fill(3), changed=[{...f.media[0]!,bytes,digest:createBlobDigest(bytes)},f.media[1]!];
    expect(unpackAtlasFallback((await run(f.project,changed)).groups[0]!).get("a")).toEqual(bytes);
    expect(session.deliverySnapshot().built).toBe(2);
    session.clear(); expect(session.deliverySnapshot().residentBytes).toBe(0);
    await run(); expect(session.deliverySnapshot().built).toBe(3);
  });
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
  it("keeps a title cover outside native atlas groups so ordinary title decoding remains available", async () => {
    const f = fixture();
    const project = { ...f.project, ui: { ...f.project.ui, preservedFields: { webPlayerAppearance: { coverAssetId: "a" } } } };
    const result = await buildNativeAtlasDelivery(project, f.media, f.reader, f.verify);
    expect(result.adopted.size).toBe(0);
    expect(result.rows[0]?.detail).toContain("标题封面");
    expect(f.verify).not.toHaveBeenCalled();
  });
});

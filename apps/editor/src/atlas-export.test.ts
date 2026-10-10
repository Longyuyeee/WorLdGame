import { describe, it, expect, vi } from "vitest";
import { buildLosslessDicingAtlas, createLosslessDicingPngDeliveryManifest, serializeLosslessDicingPngDeliveryManifest, createBlobDigest } from "@world-studio/project-persistence";
import { loadProject, saveProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import branching from "../../../fixtures/projects/branching/project.s0.json";
import { applyAtlasCompatibilityExport, atlasExportGroups, setAtlasExportGroups } from "./atlas-export";

function fixture(ids = ["picture"]) {
  const source = loadProject(migrateS0Project(branching as S0Project).files);
  const project = setAtlasExportGroups(source, ["group1"]);
  const atlas = buildLosslessDicingAtlas(ids.map(assetId => ({ assetId, width: 8, height: 8, rgba: new Uint8Array(256).fill(255) })), { cellSize: 8, padding: 2, maxAtlasSize: 32 });
  const encoded = new Uint8Array(80);
  const manifest = createLosslessDicingPngDeliveryManifest(atlas.manifest, atlas.pages.map(page => ({ ...page, encodedDigest: createBlobDigest(encoded), encodedByteLength: encoded.length, mimeType: "image/png" as const })));
  const deliveryManifestJson = serializeLosslessDicingPngDeliveryManifest(manifest);
  const publication = { deliveryManifestJson, manifestDigest: createBlobDigest(new TextEncoder().encode(deliveryManifestJson)), encodedPages: atlas.pages.map(page => ({ pageId: page.pageId, digest: createBlobDigest(encoded), bytes: encoded })) };
  const bytes = new Uint8Array(200);
  const media = ids.map(assetId => ({ assetId, displayName: assetId, mimeType: "image/png", bytes, digest: createBlobDigest(bytes) }));
  const reader = { loadDicingRuntimePublication: vi.fn(async () => publication) };
  return { source, project, media, reader, publication };
}
describe("Atlas ordinary-texture compatibility delivery", () => {
  it("persists explicit bounded selection without touching the original project", () => {
    const { source, project } = fixture(); expect(atlasExportGroups(source)).toEqual([]);
    expect(atlasExportGroups(loadProject(saveProject(project)))).toEqual(["group1"]);
    expect(atlasExportGroups(setAtlasExportGroups(project, Array.from({length: 12}, (_, i) => `g${i}`)))).toHaveLength(8);
  });
  it("adopts only a smaller verified candidate, preserving asset identity and original bytes", async () => {
    const { project, media, reader } = fixture();
    const result = await applyAtlasCompatibilityExport(project, media, reader, async () => new Uint8Array(30));
    expect(result.rows[0]?.status).toBe("adopted"); expect(result.assets[0]?.bytes.length).toBe(30);
    expect(result.assets[0]?.assetId).toBe(media[0]?.assetId); expect(media[0]?.bytes.length).toBe(200);
    const original = await applyAtlasCompatibilityExport(setAtlasExportGroups(project, []), media, reader);
    expect(original.assets).toEqual(media); expect(original.rows).toEqual([]);
  });
  it("retains source for absent migrated derivatives, corrupt manifests and no gain", async () => {
    const { project, media, reader, publication } = fixture();
    for (const repository of [{}, { loadDicingRuntimePublication: async () => null }, { loadDicingRuntimePublication: async () => ({ ...publication, deliveryManifestJson: "bad" }) }]) {
      const result = await applyAtlasCompatibilityExport(project, media, repository);
      expect(result.assets).toEqual(media); expect(result.rows[0]?.status).toBe("original");
    }
    const result = await applyAtlasCompatibilityExport(project, media, reader, async () => new Uint8Array(201));
    expect(result.assets).toEqual(media); expect(result.rows[0]?.reason).toContain("无实际");
  });
  it("rolls back the whole group if a later source is stale or failed", async () => {
    const { project, media, reader } = fixture(["a", "b"]);
    const result = await applyAtlasCompatibilityExport(project, media, reader, async asset => { if (asset.assetId === "b") throw Error("source-mismatch"); return new Uint8Array(20); });
    expect(result.assets).toEqual(media); expect(result.rows[0]?.reason).toBe("source-mismatch");
  });
  it("uses actual deduplicated bytes rather than a sum of per-asset gains", async () => {
    const { project, media, reader } = fixture(["a", "b"]);
    const result = await applyAtlasCompatibilityExport(project, media, reader, async asset => new Uint8Array(150).fill(asset.assetId === "a" ? 1 : 2));
    expect(result.assets).toEqual(media); expect(result.rows[0]?.status).toBe("original");
  });
  it("rejects deleted group members and leaves an unselected project untouched", async () => {
    const { source, project, reader } = fixture(); const encode = vi.fn(async () => new Uint8Array());
    expect((await applyAtlasCompatibilityExport(project, [], reader, encode)).rows[0]?.reason).toContain("成员");
    expect(encode).not.toHaveBeenCalled();
    expect((await applyAtlasCompatibilityExport(source, [], reader, encode)).rows).toEqual([]);
  });
});

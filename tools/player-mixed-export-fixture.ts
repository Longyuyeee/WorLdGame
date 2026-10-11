import { saveProject, type ProjectLifecycleSession } from "../packages/project-domain/src/index";
import { createBlobDigest, type AssetIndex, type BlobDigest } from "../packages/project-persistence/src/index";
import { exportPortableProjectBundle, importPortableProjectBundle } from "../apps/editor/src/portable-project-bundle";
import { createMixedFixture } from "./player-mixed-browser";

export async function createArchive() {
  const { project, mediaAssets, videoUrl } = await createMixedFixture("mixed_publication");
  try {
    const blobs = new Map<BlobDigest, Uint8Array>();
    const assets: AssetIndex["assets"][number][] = [];
    for (const asset of mediaAssets) {
      const bytes = new Uint8Array(await (await fetch(asset.url)).arrayBuffer()), digest = createBlobDigest(bytes);
      blobs.set(digest, bytes);
      assets.push({ assetId: asset.assetId, displayName: asset.displayName, kind: asset.mimeType.startsWith("audio") ? "audio" : asset.mimeType.startsWith("video") ? "video" : "background",
        source: { digest, byteLength: bytes.length, mimeType: asset.mimeType }, tags: [] });
    }
    const index: AssetIndex = { schemaVersion: 1, indexRevision: assets.length, assets };
    const session: ProjectLifecycleSession = { project, projectId: project.manifest.projectId, title: project.manifest.title, schemaVersion: 1,
      reference: { referenceId: "mixed-publication", hostKind: "memory-test", displayLocation: "Synthetic mixed publication", permissionKey: "fixture" },
      hostVersion: "1", baseHash: "fixture", baseFiles: saveProject(project), dirty: false, recovery: "clean", access: "editable" };
    const archive = await exportPortableProjectBundle(session, { loadIndex: async () => index, read: async digest => blobs.get(digest) ?? null });
    const verified = importPortableProjectBundle(archive);
    if (verified.index.assets.length !== mediaAssets.length || verified.blobs.size !== blobs.size) throw Error("Mixed portable fixture lost assets");
    let binary = ""; for (const byte of archive) binary += String.fromCharCode(byte);
    return { base64: btoa(binary), projectId: project.manifest.projectId, assetCount: assets.length, blobCount: blobs.size,
      sources: assets.map(asset => ({ assetId: asset.assetId, ...asset.source })) };
  } finally { URL.revokeObjectURL(videoUrl); }
}

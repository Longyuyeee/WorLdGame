import {
  createProjectTemplate,
  exportProjectBinaryZip,
  exportProjectZip,
  importProjectBinaryZip,
  saveProject,
  type ProjectLifecycleSession,
  type ProjectReference
} from "@world-studio/project-domain";
import {
  assetBlobPath,
  createBlobDigest,
  type AssetIndex,
  type BlobDigest
} from "@world-studio/project-persistence";
import { describe, expect, it } from "vitest";
import { exportPortableProjectBundle, importPortableProjectBundle } from "./portable-project-bundle";

const reference: ProjectReference = { referenceId: "bundle-test", hostKind: "memory-test", displayLocation: "Memory/Bundle", permissionKey: "bundle" };
const project = createProjectTemplate("Portable Story", "portable-story");
const session: ProjectLifecycleSession = { project, projectId: project.manifest.projectId, title: project.manifest.title, schemaVersion: 1, reference, hostVersion: "1", baseHash: "hash", baseFiles: saveProject(project), dirty: false, recovery: "clean", access: "editable" };
const background = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]);
const audio = new Uint8Array([82,73,70,70,4,0,0,0,87,65,86,69]);
const backgroundDigest = createBlobDigest(background);
const audioDigest = createBlobDigest(audio);
const index: AssetIndex = { schemaVersion: 1, indexRevision: 2, assets: [
  { assetId: "portable_background", kind: "background", displayName: "Portable Background", source: { digest: backgroundDigest, byteLength: background.byteLength, mimeType: "image/png" }, tags: [] },
  { assetId: "portable_theme", kind: "audio", displayName: "Portable Theme", source: { digest: audioDigest, byteLength: audio.byteLength, mimeType: "audio/wav" }, tags: [] }
] };
const blobs = new Map<BlobDigest, Uint8Array>([[backgroundDigest, background], [audioDigest, audio]]);
const source = { loadIndex: async () => index, read: async (digest: BlobDigest) => blobs.get(digest)?.slice() ?? null };

describe("portable project bundle", () => {
  it("deterministically exports project documents, Asset Index and verified source Blobs", async () => {
    const importedWorkspaceSession = { ...session, projectId: "new-workspace-reference" };
    const first = await exportPortableProjectBundle(importedWorkspaceSession, source);
    const second = await exportPortableProjectBundle(session, source);
    expect(first).toEqual(second);
    const imported = importPortableProjectBundle(first);
    expect(imported.legacyTextOnly).toBe(false);
    expect(imported.project.manifest.projectId).toBe(project.manifest.projectId);
    expect(imported.index).toEqual(index);
    expect(imported.blobs.get(backgroundDigest)).toEqual(background);
    expect(imported.blobs.get(audioDigest)).toEqual(audio);
  });

  it("keeps legacy text-only project ZIP imports compatible", () => {
    const imported = importPortableProjectBundle(exportProjectZip(saveProject(project)));
    expect(imported.legacyTextOnly).toBe(true);
    expect(imported.index.assets).toEqual([]);
    expect(imported.project.manifest.projectId).toBe(project.manifest.projectId);
  });

  it("rejects missing, corrupt and unreferenced asset payloads before publication", async () => {
    const files = importProjectBinaryZip(await exportPortableProjectBundle(session, source));
    const backgroundPath = `.world-assets/${assetBlobPath(backgroundDigest)}`;
    const missing = { ...files }; delete missing[backgroundPath];
    expect(() => importPortableProjectBundle(exportProjectBinaryZip(missing))).toThrow(/missing, corrupt, or has the wrong size/);
    expect(() => importPortableProjectBundle(exportProjectBinaryZip({ ...files, [backgroundPath]: new Uint8Array(background.byteLength) }))).toThrow(/missing, corrupt, or has the wrong size/);
    expect(() => importPortableProjectBundle(exportProjectBinaryZip({ ...files, ".world-assets/blobs/sha256/aa/unreferenced": new Uint8Array([1]) }))).toThrow(/unreferenced asset entry/);
  });
});

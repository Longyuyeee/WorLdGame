import { expect, it } from "vitest";
import { assetSourceUsages, checkAssetSource } from "./asset-repair";
import { createBlobDigest, type AssetIndexEntry } from "@world-studio/project-persistence";
import { createStudioSession } from "./studio-session";

it("locates typed missing and existing asset references by stable source IDs, ignoring dialogue and ambiguous duplicates", () => {
  const base = createStudioSession().project;
  const scene = base.scenes[0]!;
  const project = { ...base, scenes: [{ ...scene, statements: [
    { id: "visual", kind: "direction" as const, command: "background" as const, summary: "action=set asset=missing transitionAsset=mask" },
    { id: "ambiguous", kind: "direction" as const, command: "background" as const, summary: "asset=one asset=two" },
    { id: "text", kind: "narration" as const, textId: "text_id", text: "asset=not_a_reference" }
  ] }] };
  expect(assetSourceUsages(project)).toEqual([
    { assetId: "missing", sceneId: scene.id, sceneTitle: scene.title, statementId: "visual", parameter: "asset" },
    { assetId: "mask", sceneId: scene.id, sceneTitle: scene.title, statementId: "visual", parameter: "transitionAsset" }
  ]);
});

it("distinguishes missing files, read failures and index-size mismatch without mutating references", async () => {
  const bytes = new Uint8Array([1, 2]);
  const entry: AssetIndexEntry = { assetId: "image", kind: "character", displayName: "立绘", tags: [], source: { digest: createBlobDigest(bytes), byteLength: 2, mimeType: "image/png" } };
  expect(await checkAssetSource({ read: async () => bytes }, entry)).toContain("校验通过");
  expect(await checkAssetSource({ read: async () => null }, entry)).toContain("源文件缺失");
  expect(await checkAssetSource({ read: async () => new Uint8Array(1) }, entry)).toContain("大小与索引不符");
  expect(await checkAssetSource({ read: async () => { throw new Error("CORRUPT_BLOB"); } }, entry)).toContain("CORRUPT_BLOB");
  expect(entry.assetId).toBe("image");
});

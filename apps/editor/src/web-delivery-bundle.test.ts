import { expect, it } from "vitest";
import { exportProjectBinaryZip, importProjectBinaryZip, semanticHash } from "@world-studio/project-domain";
import { createBlobDigest, type AssetIndex } from "@world-studio/project-persistence";
import { projectCanonicalFromStory, projectCanonicalWithAssetIndex } from "./canonical-project-adapter";
import { applyWebPublication } from "./web-publication";
import { createWebDeliveryBundle, importStudioProjectArchive } from "./web-delivery-bundle";
import { exportPortableCanonicalProject } from "./portable-project-bundle";
import { createFormalWebArtifact, createFormalWebDirectoryArtifact } from "./formal-web-export";
import type { PlaytestNote } from "./playtest-notes";
import { completionFromTrace, readPlaytestProgress, writePlaytestProgress } from './playtest-progress';
import { progressTrace } from './playtest-progress-fixture';
import { advanceFormalPreview, startFormalPreview } from './formal-preview-runtime';

const bytes = new Uint8Array([1, 2, 3]); const digest = createBlobDigest(bytes);
const index: AssetIndex = { schemaVersion: 1, indexRevision: 1, assets: [{ assetId: "source_image", displayName: "原图", kind: "background", tags: [], source: { digest, byteLength: 3, mimeType: "image/png" }, preservedFields: { inspection: { status: "pass" } } }] };
const base = projectCanonicalWithAssetIndex(projectCanonicalFromStory({ schemaVersion: 0, id: "story", title: "编辑器内部名称", entrySceneId: "entry", characters: [], scenes: [{ id: "entry", title: "开场", statements: [{ id: "line", textId: "text", kind: "narration", text: "雨停了。" }, { id: "end", kind: "end", endingName: "雨停" }] }] }, "delivery_project"), index);
const project = applyWebPublication(base, { name: "正式作品名称", version: "2.1.0", iconAssetId: "" });
const reader = { read: async () => bytes.slice() }, runtime = { javascript: "window.playerLoaded=true;", css: "body{color:white}" };
const note: PlaytestNote = { id: "review", sceneId: "entry", statementId: "line", sceneTitle: "开场", excerpt: "雨停了。", sourceHash: "a".repeat(64), category: "text", status: "open", text: "校订隐私内容", createdAt: 1, updatedAt: 1, checkedSourceHash: null };

it("captures original editable content and media alongside the published name, with optional notes", async () => {
  const game = await createFormalWebArtifact(project, reader, runtime);
  const delivery = await createWebDeliveryBundle(project, index, reader, game, [note]);
  const restored = importStudioProjectArchive(delivery.archive);
  expect(semanticHash(restored.project)).toBe(semanticHash(project)); expect(restored.project.manifest.title).toBe("编辑器内部名称"); expect(restored.blobs.get(digest)).toEqual(bytes);
  expect(JSON.parse(restored.reviewNotes!).notes).toEqual([note]);
  const files = importProjectBinaryZip(delivery.archive);
  expect(new TextDecoder().decode(files["game/index.html"])).toContain("正式作品名称"); expect(new TextDecoder().decode(files["game/index.html"])).not.toContain(note.text);
  expect(delivery.manifest.publication.version).toBe("2.1.0"); expect(delivery.manifest.gameProjectDigest).not.toBe(delivery.manifest.sourceProjectDigest);
});
it("places real directory files under game with their relative media paths intact", async () => {
  const game = await createFormalWebDirectoryArtifact(project, reader, runtime);
  const delivery = await createWebDeliveryBundle(project, index, reader, game, null);
  const files = importProjectBinaryZip(delivery.archive);
  expect(files["game/player.js"]).toBeDefined(); expect(files[`game/media/${digest.slice(7)}.png`]).toEqual(bytes);
  expect(new TextDecoder().decode(files["game/index.html"])).toContain(`media/${digest.slice(7)}.png`);
  expect(importStudioProjectArchive(delivery.archive).reviewNotes).toBeNull();
});
it("refuses mixing a stale game with a newer author source", async () => {
  const game = await createFormalWebArtifact(project, reader, runtime);
  await expect(createWebDeliveryBundle({ ...project, manifest: { ...project.manifest, title: "内部名变化" }, scripts: { ...project.scripts, entry: { ...project.scripts.entry!, statements: [{ ...project.scripts.entry!.statements[0]!, text: "新正文" }, project.scripts.entry!.statements[1]!] } } }, index, reader, game, null)).rejects.toThrow(/同一次内容/);
});
it("refuses missing media and wrong source sizes, with no partial package", async () => {
  const game = await createFormalWebArtifact(project, reader, runtime);
  await expect(createWebDeliveryBundle(project, index, { read: async () => null }, game, null)).rejects.toThrow(/missing/);
  await expect(createWebDeliveryBundle(project, { ...index, assets: [{ ...index.assets[0]!, source: { ...index.assets[0]!.source, byteLength: 4 } }] }, reader, game, null)).rejects.toThrow(/wrong size/);
});
it("cancels after collecting a blob and does not return an archive", async () => {
  const game = await createFormalWebArtifact(project, reader, runtime), controller = new AbortController();
  await expect(createWebDeliveryBundle(project, index, { read: async () => { controller.abort(); return bytes; } }, game, null, controller.signal)).rejects.toThrow();
});
it("rejects changed files, missing entries, and unexpected entries before restoring", async () => {
  const game = await createFormalWebArtifact(project, reader, runtime), delivery = await createWebDeliveryBundle(project, index, reader, game, null), files = importProjectBinaryZip(delivery.archive);
  expect(() => importStudioProjectArchive(exportProjectBinaryZip({ ...files, "game/index.html": new Uint8Array([9]) }))).toThrow(/文件损坏/);
  const missing = { ...files }; delete missing["source/project.zip"]; expect(() => importStudioProjectArchive(exportProjectBinaryZip(missing))).toThrow();
  expect(() => importStudioProjectArchive(exportProjectBinaryZip({ ...files, "extra.txt": new Uint8Array([1]) }))).toThrow(/清单外/);
});
it("continues to accept normal portable project ZIPs without adding review data", async () => {
  const normal = await exportPortableCanonicalProject(project, index, reader);
  expect(importStudioProjectArchive(normal).reviewNotes).toBeNull(); expect(importStudioProjectArchive(normal).playtestProgress).toBeNull(); expect(importStudioProjectArchive(normal).index).toEqual(index);
});
it('roundtrips opted-in current and older progress separately from source and game, for HTML and directory', async () => {
  const record = completionFromTrace(project, progressTrace(advanceFormalPreview(startFormalPreview(project))), 1)!;
  const records = [{ ...record, sourceHash: record.sourceHash }, { ...record, sourceHash: 'a'.repeat(64) }];
  for (const game of [await createFormalWebArtifact(project, reader, runtime), await createFormalWebDirectoryArtifact(project, reader, runtime)]) {
    const result = await createWebDeliveryBundle(project, index, reader, game, [note], undefined, undefined, records), files = importProjectBinaryZip(result.archive);
    expect(readPlaytestProgress(importStudioProjectArchive(result.archive).playtestProgress, project.manifest.projectId)).toEqual(records);
    expect(result.manifest.progressEntry).toBe('review/playtest-progress.worldplaytest');
    expect(importStudioProjectArchive(files['source/project.zip']!).playtestProgress).toBeNull();
    expect(Object.keys(files).filter(name => name.startsWith('game/')).some(name => name.includes('worldplaytest'))).toBe(false);
    expect(new TextDecoder().decode(files['game/index.html'])).not.toContain('world-playtest-progress');
    expect(new TextDecoder().decode(files['开始使用.txt'])).toContain('旧稿记录不会计入当前稿');
  }
});
it('accepts previous manifests without a progress field and keeps progress excluded by default', async () => {
  const game = await createFormalWebArtifact(project, reader, runtime), result = await createWebDeliveryBundle(project, index, reader, game, null), files = importProjectBinaryZip(result.archive);
  expect(importStudioProjectArchive(result.archive).playtestProgress).toBeNull();
  const manifest = JSON.parse(new TextDecoder().decode(files['delivery.json'])); delete manifest.progressEntry;
  files['delivery.json'] = new TextEncoder().encode(JSON.stringify(manifest));
  expect(importStudioProjectArchive(exportProjectBinaryZip(files)).playtestProgress).toBeNull();
});
it('validates progress contents and project identity even when all file digests are correct', async () => {
  const game = await createFormalWebArtifact(project, reader, runtime), record = completionFromTrace(project, progressTrace(advanceFormalPreview(startFormalPreview(project))), 1)!;
  const result = await createWebDeliveryBundle(project, index, reader, game, null, undefined, undefined, [record]);
  for (const raw of [writePlaytestProgress('another-project', [record]), JSON.stringify({ schemaVersion: 1, kind: 'world-playtest-progress', projectId: project.manifest.projectId, completions: [{ ...record, completedAt: -1 }] })]) {
    const files = importProjectBinaryZip(result.archive), manifest = JSON.parse(new TextDecoder().decode(files['delivery.json'])), entry = manifest.progressEntry;
    files[entry] = new TextEncoder().encode(raw); manifest.files = manifest.files.map((row: { path: string }) => row.path === entry ? { path: entry, byteLength: files[entry]!.length, digest: createBlobDigest(files[entry]!) } : row);
    files['delivery.json'] = new TextEncoder().encode(JSON.stringify(manifest));
    expect(() => importStudioProjectArchive(exportProjectBinaryZip(files))).toThrow(/试玩进度/);
  }
});

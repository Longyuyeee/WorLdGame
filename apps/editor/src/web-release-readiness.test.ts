import { describe, expect, it, vi } from "vitest";
import { createBlobDigest } from "@world-studio/project-persistence";
import { semanticHash } from "@world-studio/project-domain";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { inspectWebReleaseSources, assertWebReleaseReady, WebReleaseValidationError } from "./web-release-readiness";
import { createFormalWebArtifact, createFormalWebDirectoryArtifact } from "./formal-web-export";

const source = () => projectCanonicalFromStory({ schemaVersion: 0, id: "release-inspection-story", title: "定稿检查", entrySceneId: "entry", characters: [], scenes: [
  { id: "entry", title: "开场", statements: [{ id: "line", kind: "narration", textId: "text", text: "雨停了。" }, { id: "end", kind: "end", endingName: "同行" }] }
] }, "release-inspection-project");
const bytes = new Uint8Array([1, 2, 3, 4]), digest = createBlobDigest(bytes);
const asset = (assetId: string) => ({ assetId, displayName: assetId, kind: "cg", source: { digest, mimeType: "image/png", byteLength: bytes.length } });

describe("Web release source inspection", () => {
  it("collects all compiler and actual source problems without mutating the project", async () => {
    const initial = source();
    const project = { ...initial, scripts: { ...initial.scripts, entry: { ...initial.scripts.entry!, statements: [{ id: "pick", kind: "choice", prompt: "走吗", options: [{ id: "opt", label: "走", targetSceneId: "missing" }] }] } },
      assets: { ...initial.assets, assets: [asset("missing-a"), { ...asset("invalid-b"), source: {} }] } };
    const hash = semanticHash(project), report = await inspectWebReleaseSources(project, { read: async () => null });
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_TARGET_SCENE", target: "story", sceneId: "entry", statementId: "pick", title: "选项指向了不存在的场景" }),
      expect.objectContaining({ assetId: "missing-a", target: "assets", code: "WEB_ASSET_SOURCE_UNAVAILABLE" }),
      expect.objectContaining({ assetId: "invalid-b", code: "WEB_ASSET_SOURCE_INVALID" })
    ]));
    expect(report.checkedAssetCount).toBe(2); expect(report.assets).toHaveLength(0);
    expect(() => assertWebReleaseReady(report.findings)).toThrow(WebReleaseValidationError);
    expect(semanticHash(project)).toBe(hash);
  });
  it("reads shared bytes once and validates every asset length independently; next call reads fresh storage", async () => {
    const initial = source(), project = { ...initial, assets: { ...initial.assets, assets: [asset("a"), { ...asset("b"), source: { ...asset("b").source, byteLength: 5 } }] } };
    const read = vi.fn(async (): Promise<Uint8Array | null> => bytes), progress = vi.fn();
    const first = await inspectWebReleaseSources(project, { read }, undefined, progress);
    expect(read).toHaveBeenCalledTimes(1); expect(first.assets.map(item => item.assetId)).toEqual(["a"]);
    expect(first.findings).toEqual([expect.objectContaining({ assetId: "b", code: "WEB_ASSET_SOURCE_UNAVAILABLE" })]);
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]]);
    read.mockResolvedValue(null);
    expect((await inspectWebReleaseSources(project, { read })).findings.filter(item => item.target === "assets")).toHaveLength(2);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("rejects corrupt bytes and reports read errors for each affected asset", async () => {
    const initial = source(), project = { ...initial, assets: { ...initial.assets, assets: [asset("a"), asset("b")] } };
    const corrupt = await inspectWebReleaseSources(project, { read: async () => new Uint8Array(bytes.length) });
    expect(corrupt.assets).toHaveLength(0); expect(corrupt.findings).toHaveLength(2);
    const read = vi.fn(async () => { throw new Error("storage unavailable"); });
    const failed = await inspectWebReleaseSources(project, { read });
    expect(read).toHaveBeenCalledTimes(1); expect(failed.findings).toHaveLength(2);
    expect(failed.findings.every(item => item.message.includes("storage unavailable"))).toBe(true);
  });
  it("validates source descriptors rather than claiming an invalid zero-size file is complete", async () => {
    const initial = source(), project = { ...initial, assets: { ...initial.assets, assets: [0, -1, 1.5].map((length, i) => ({ ...asset(`asset_${i}`), source: { ...asset(`asset_${i}`).source, byteLength: length } })) } };
    const read = vi.fn(async () => bytes), report = await inspectWebReleaseSources(project, { read });
    expect(read).not.toHaveBeenCalled(); expect(report.findings).toHaveLength(3);
    expect(report.findings.every(item => item.code === "WEB_ASSET_SOURCE_INVALID")).toBe(true);
  });
  it("checks publication metadata and the real icon dimensions with an actionable settings target", async () => {
    const initial = source(), png = new Uint8Array(24); png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer); view.setUint32(16, 512); view.setUint32(20, 256);
    const project = { ...initial, manifest: { ...initial.manifest, preservedFields: { webPublication: { name: "作品", version: "<bad>", iconAssetId: "icon" } } },
      assets: { ...initial.assets, assets: [{ ...asset("icon"), source: { digest: createBlobDigest(png), mimeType: "image/png", byteLength: png.length } }] } };
    const report = await inspectWebReleaseSources(project, { read: async () => png });
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "WEB_PUBLICATION_INVALID", target: "publication" }), expect.objectContaining({ code: "WEB_PUBLICATION_ICON_INVALID", target: "publication", assetId: "icon" })]));
  });
  it("keeps warnings visible and exportable, without allowing QA suppression to hide export blockers", async () => {
    const initial = source();
    const project = projectCanonicalFromStory({ schemaVersion: 0, id: "warnings", title: "定稿检查", entrySceneId: "entry", characters: [], scenes: [
      { id: "entry", title: "开场", statements: [{ id: "end", kind: "end", endingName: "同行" }] },
      { id: "orphan", title: "未连接场景", statements: [{ id: "orphan_end", kind: "end", endingName: "未连接" }] }
    ] }, "warnings-project");
    const report = await inspectWebReleaseSources(project, { read: async () => null });
    expect(report.findings).toContainEqual(expect.objectContaining({ code: "UNREACHABLE_SCENE", severity: "warning", sceneId: "orphan" }));
    expect(() => assertWebReleaseReady(report.findings)).not.toThrow();
    const broken = { ...initial, manifest: { ...initial.manifest, preservedFields: { worldStudioDebugQaSuppressions: [{ findingId: "any", reason: "skip" }] } },
      scripts: { ...initial.scripts, entry: { ...initial.scripts.entry!, statements: [{ id: "jump", kind: "jump", targetLabel: "missing" }] } } };
    expect((await inspectWebReleaseSources(broken, { read: async () => null })).findings).toContainEqual(expect.objectContaining({ code: "MISSING_LABEL", severity: "error" }));
  });
  it.each([false, true])("both export formats retain structured source findings (directory=%s)", async directory => {
    const initial = source(), project = { ...initial, assets: { ...initial.assets, assets: [asset("a"), asset("b")] } };
    const create = directory ? createFormalWebDirectoryArtifact : createFormalWebArtifact;
    await expect(create(project, { read: async () => null }, { javascript: "", css: "" })).rejects.toMatchObject({ name: "WebReleaseValidationError", findings: [expect.objectContaining({ assetId: "a" }), expect.objectContaining({ assetId: "b" })] });
  });
  it("stops an old inspection after a pending read and never reports completion", async () => {
    const initial = source(), project = { ...initial, assets: { ...initial.assets, assets: [asset("a"), asset("b")] } };
    let resolve: (value: Uint8Array) => void = () => {};
    const read = vi.fn(() => new Promise<Uint8Array>(done => { resolve = done; })), progress = vi.fn(), controller = new AbortController();
    const pending = inspectWebReleaseSources(project, { read }, controller.signal, progress);
    controller.abort(); resolve(bytes);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(read).toHaveBeenCalledTimes(1); expect(progress).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from "vitest";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { createBlobDigest } from "@world-studio/project-persistence";
import branching from "../../../fixtures/projects/branching/project.s0.json";
import { NativeAtlasPreviewSession } from "./native-atlas-preview";
import { setNativeAtlas } from "./native-atlas-export";
import { setAtlasExportGroups } from "./atlas-export";
const media = { planKey: "test", characters: [], audio: [], errors: [], objectUrls: [] };
function fixture() {
  const bytes = new Uint8Array([1, 2, 3]), source = { digest: createBlobDigest(bytes), mimeType: "image/png", byteLength: 3 };
  const base = loadProject(migrateS0Project(branching as S0Project).files);
  const project = setNativeAtlas(setAtlasExportGroups({ ...base, assets: { ...base.assets, assets: Array.from({ length: 30 }, (_, i) => ({ assetId: `cg_${i}`, kind: "cg", source })) } }, ["g"]), true);
  let version = "v1";
  const reader = { read: vi.fn(async () => bytes), loadLifecycle: async () => ({ roots: [{ rootId: "build:dicing:g", digests: [version] }] }), loadDicingRuntimePublication: vi.fn(async () => null) };
  return { project, reader, version: () => { version = "v2"; } };
}
describe("Preview Atlas versioned scheduling", () => {
  it("reads a 30-image set once across scene plans and invalidates on publication or source changes", async () => {
    const f = fixture(), session = new NativeAtlasPreviewSession();
    await session.attach(media, f.project, f.reader);
    for (let i = 0; i < 30; i++) await session.attach({ ...media, planKey: String(i) }, { ...f.project }, f.reader);
    expect(f.reader.read).toHaveBeenCalledTimes(30); expect(session.snapshot().cacheHits).toBe(30);
    f.version(); await session.attach(media, f.project, f.reader); expect(f.reader.read).toHaveBeenCalledTimes(60);
    await session.attach(media, { ...f.project, assets: { ...f.project.assets, assets: f.project.assets.assets.slice(1) } }, f.reader);
    expect(f.reader.read).toHaveBeenCalledTimes(89);
    session.clear(); expect(session.snapshot().residentBytes).toBe(0);
  });
  it("cancels stale reads, admits a replacement and does not publish old results", async () => {
    const f = fixture(), session = new NativeAtlasPreviewSession(), controller = new AbortController();
    let resume!: () => void;
    f.reader.read.mockImplementationOnce(() => new Promise(resolve => { resume = () => resolve(new Uint8Array([1,2,3])); }));
    const old = session.attach(media, f.project, f.reader, controller.signal);
    await vi.waitFor(() => expect(f.reader.read).toHaveBeenCalledTimes(1));
    controller.abort(); const next = session.attach(media, f.project, f.reader); resume();
    expect(await old).toBe(media); await next;
    expect(session.snapshot().activeLoads).toBe(0); expect(session.snapshot().queuedLoads).toBe(0);
    expect(f.reader.read).toHaveBeenCalledTimes(31); expect(session.snapshot().cancellations).toBe(1);
    session.clear();
  });
  it("does not cache a publication that changed during verification", async () => {
    const f = fixture(), session = new NativeAtlasPreviewSession();
    f.reader.read.mockImplementationOnce(async () => { f.version(); return new Uint8Array([1,2,3]); });
    expect(await session.attach(media, f.project, f.reader)).toBe(media);
    expect(session.snapshot().residentResources).toBe(0);
    await session.attach(media, f.project, f.reader); expect(session.snapshot().residentResources).toBe(1);
    await session.attach(media, setNativeAtlas(f.project, false), f.reader); expect(session.snapshot().residentBytes).toBe(0);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { unzlibSync, zlibSync, unzipSync } from "fflate";
import { loadProject, saveProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { createBlobDigest } from "@world-studio/project-persistence";
import branching from "../../../fixtures/projects/branching/project.s0.json";
import { optimizeLosslessPng } from "./lossless-png-export";
import { optimizeExportMedia, losslessExportEnabled, setLosslessExport } from "./export-optimization";
import { optimizeExportPngInWorker } from "./lossless-png-export-client";
import { createFormalWebArtifact, createFormalWebDirectoryArtifact } from "./formal-web-export";

const join = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
function chunk(type: string, bytes: Uint8Array) {
  const result = new Uint8Array(bytes.length + 12), view = new DataView(result.buffer);
  view.setUint32(0, bytes.length); result.set(new TextEncoder().encode(type), 4); result.set(bytes, 8);
  let crc = 0xffffffff;
  for (const b of result.subarray(4, result.length - 4)) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0); return result;
}
function fixture(options: { depth?: number; interlace?: number; animated?: boolean; extra?: number; filter?: number; corruptAdler?: boolean } = {}) {
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, 64); view.setUint32(4, 64); header[8] = options.depth ?? 8; header[9] = 6; header[12] = options.interlace ?? 0;
  const raw = new Uint8Array((64 * 4 + 1) * 64 + (options.extra ?? 0));
  for (let row = 0; row < 64; row++) { raw[row * 257] = options.filter ?? 0; for (let x = 0; x < 64; x++) raw[row * 257 + 1 + x * 4 + 3] = 255; }
  const encoded = zlibSync(raw, { level: 0 }); if (options.corruptAdler) encoded[encoded.length - 1]! ^= 1;
  const bytes = join([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("tEXt", new TextEncoder().encode("Author\0creator")), ...(options.animated ? [chunk("acTL", new Uint8Array(8))] : []), chunk("IDAT", encoded.slice(0, 20)), chunk("IDAT", encoded.slice(20)), chunk("IEND", new Uint8Array())]);
  return { bytes, raw };
}
function chunks(bytes: Uint8Array) { const result = []; const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); for (let at = 8; at < bytes.length;) { const length = view.getUint32(at); result.push({ type: new TextDecoder().decode(bytes.subarray(at + 4, at + 8)), bytes: bytes.slice(at, at + length + 12), data: bytes.slice(at + 8, at + length + 8) }); at += length + 12; } return result; }
const project = () => loadProject(migrateS0Project(branching as S0Project).files);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("safe PNG export", () => {
  it("reduces real PNG bytes without changing filtered pixels, metadata or source", () => {
    const { bytes, raw } = fixture(), copy = bytes.slice(), result = optimizeLosslessPng(bytes);
    expect(result.verified).toBe(true); expect(result.bytes.length).toBeLessThan(bytes.length);
    expect(bytes).toEqual(copy);
    expect(unzlibSync(join(chunks(result.bytes).filter(c => c.type === "IDAT").map(c => c.data)))).toEqual(raw);
    expect(chunks(result.bytes).filter(c => c.type !== "IDAT")).toEqual(chunks(bytes).filter(c => c.type !== "IDAT"));
    expect(optimizeLosslessPng(result.bytes).bytes).toEqual(result.bytes);
  });
  it.each([{ depth: 16 }, { interlace: 1 }, { animated: true }, { extra: 1 }, { extra: -1 }, { filter: 5 }, { corruptAdler: true }])("falls back exactly for unsupported or unsafe data %j", options => {
    const { bytes } = fixture(options), result = optimizeLosslessPng(bytes);
    expect(result.bytes).toBe(bytes); expect(result.verified).toBe(false);
  });
  it("rejects invalid CRC, truncated chunks and non-PNG without throwing", () => {
    const { bytes } = fixture(); const broken = bytes.slice(); broken[50]! ^= 1;
    for (const source of [broken, bytes.slice(0, -1), new Uint8Array([1, 2, 3])]) expect(optimizeLosslessPng(source)).toMatchObject({ bytes: source, verified: false });
  });
  it("persists opt-in, deduplicates work and restores original bytes and digests", async () => {
    const original = project(), enabled = loadProject(saveProject(setLosslessExport(original, true)));
    expect(losslessExportEnabled(original)).toBe(false); expect(losslessExportEnabled(enabled)).toBe(true);
    const { bytes } = fixture(), digest = createBlobDigest(bytes);
    const media = ["a", "b"].map(assetId => ({ assetId, displayName: assetId, digest, bytes, mimeType: "image/png" }));
    const optimize = vi.fn(async (source: Uint8Array) => optimizeLosslessPng(source));
    const delivery = await optimizeExportMedia(enabled, media, optimize);
    expect(optimize).toHaveBeenCalledTimes(1); expect(delivery.report.uniqueOriginalBytes).toBe(bytes.length);
    expect(delivery.report.uniqueExportBytes).toBeLessThan(bytes.length);
    expect(delivery.assets.map(a => a.assetId)).toEqual(["a", "b"]);
    expect(delivery.assets[0]!.digest).toBe(createBlobDigest(delivery.assets[0]!.bytes));
    const restored = await optimizeExportMedia(setLosslessExport(enabled, false), media, optimize);
    expect(restored.assets).toEqual(media.map(asset=>({...asset,canvasSampling:true}))); expect(restored.report.uniqueExportBytes).toBe(bytes.length);
    restored.assets.forEach((asset,index)=>expect(asset.bytes).toBe(media[index]!.bytes)); // presentation metadata never rewrites originals
    expect(optimize).toHaveBeenCalledTimes(1);
  });
  it("keeps original bytes if Worker is unavailable, times out or fails to post", async () => {
    const { bytes } = fixture(); vi.stubGlobal("Worker", undefined);
    expect((await optimizeExportPngInWorker(bytes)).bytes).toBe(bytes);
    const terminate = vi.fn();
    vi.useFakeTimers(); vi.stubGlobal("Worker", class { terminate = terminate; postMessage() {} });
    const pending = optimizeExportPngInWorker(bytes); await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).bytes).toBe(bytes); expect(terminate).toHaveBeenCalledTimes(1);
    vi.stubGlobal("Worker", class { terminate = terminate; postMessage() { throw Error("closed"); } });
    expect((await optimizeExportPngInWorker(bytes)).bytes).toBe(bytes); expect(terminate).toHaveBeenCalledTimes(2);
  });
  it("delivers optimized HTML and ZIP with original canonical references and auditable inventory; restores original export", async () => {
    // Execute the real codec through a Worker transport double; actual browser Worker is checked separately.
    vi.stubGlobal("Worker", class { onmessage?: (e: { data: unknown }) => void; terminate() {} postMessage(buffer: ArrayBuffer) { queueMicrotask(() => this.onmessage?.({ data: optimizeLosslessPng(new Uint8Array(buffer)) })); } });
    const { bytes } = fixture(), digest = createBlobDigest(bytes), source = project();
    const enabled = setLosslessExport({ ...source, assets: { ...source.assets, assets: [{ assetId: "picture", kind: "cg", source: { digest, byteLength: bytes.length, mimeType: "image/png" } }] } }, true);
    const runtime = { javascript: "", css: "" }, reader = { read: async () => bytes };
    const html = await createFormalWebArtifact(enabled, reader, runtime);
    const payload = JSON.parse(new DOMParser().parseFromString(html.html, "text/html").getElementById("world-project")!.textContent!);
    const optimized = Uint8Array.from(atob(payload.mediaAssets[0].url.split(",")[1]), c => c.charCodeAt(0));
    expect(optimized.length).toBeLessThan(bytes.length); expect(payload.project.assets).toEqual(enabled.assets);
    expect(payload.optimizationReport.rows[0].originalDigest).toBe(digest);
    const zip = await createFormalWebDirectoryArtifact(enabled, reader, runtime), files = unzipSync(zip.archive);
    const text = (key: string) => new TextDecoder().decode(files[key]);
    const report = JSON.parse(text("optimization-report.json")); expect(report).toEqual(html.optimizationReport);
    const info = JSON.parse(text("build-info.json")); for (const file of info.files) expect(createBlobDigest(files[file.path]!)).toBe(file.digest);
    expect(files[`media/${createBlobDigest(optimized).slice(7)}.png`]).toEqual(optimized);
    const restored = unzipSync((await createFormalWebDirectoryArtifact(setLosslessExport(enabled, false), reader, runtime)).archive);
    expect(restored[`media/${digest.slice(7)}.png`]).toEqual(bytes);
    expect(bytes).toEqual(fixture().bytes);
  });
});

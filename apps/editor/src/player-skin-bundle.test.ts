/// <reference types="node" />
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { applyWebAssetSources, applyWebCredits, applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, exportProjectBinaryZip, importProjectBinaryZip, readWebAssetSources, readWebCredits, readWebPlayerAppearance, webPlayerSkinPreset } from "@world-studio/project-domain";
import { createBlobDigest, inspectUntrustedMedia, type BlobDigest } from "@world-studio/project-persistence";
import { mediaInspectionToJson } from "./media-inspection-client";
import { applySkinImportPlan, defaultSkinChoices, exportSkinBundle, prepareSkinImport, readSkinBundle, type SkinAssetChoice } from "./player-skin-bundle";
import { defaultWebPlayerLayout, defaultWebPlayerSkinImages, defaultWebPlayerSkinTemplate, webPlayerSkinReferences } from "@world-studio/project-domain";
import { exportPlayerSkinPreset, importPlayerSkinPreset } from "./player-skin-preset";
const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64"));
function fixture() {
  const font = new Uint8Array(readFileSync("assets/skin-demo/letter-demo.woff2"));
  const data = [{ assetId: "cover", kind: "cg" as const, displayName: "夜色窗体", mimeType: "image/png", bytes: png }, { assetId: "font", kind: "font" as const, displayName: "回信字体", mimeType: "font/woff2", bytes: font }];
  const blobs = new Map(data.map(row => [createBlobDigest(row.bytes), row.bytes]));
  const base = createProjectTemplate("原故事", "018f08d8-71a1-7bc2-a627-2f4a843ee150");
  const assets = data.map(row => ({ assetId: row.assetId, kind: row.kind, displayName: row.displayName, source: { mimeType: row.mimeType, digest: createBlobDigest(row.bytes), byteLength: row.bytes.length }, assetIndexMetadata: { inspection: mediaInspectionToJson(inspectUntrustedMedia(row.bytes, row.mimeType, row.kind)) } }));
  let project = { ...base, assets: { ...base.assets, assets } };
  const skin = webPlayerSkinPreset("letter"), appearance = { ...DEFAULT_WEB_PLAYER_APPEARANCE, titleTagline: "不要带到另一部作品", coverAssetId: "cover", skin: { ...skin, reading: { ...skin.reading, windowAssetId: "cover" }, fonts: { ...skin.fonts, body: "asset:font" as const } } };
  project = applyWebPlayerAppearance(project, appearance) as typeof project;
  project = applyWebCredits(project, { schemaVersion: 1, studio: "原团队不会复制", website: "", copyright: "", entries: [], acknowledgements: "公开字体许可说明" }) as typeof project;
  project = applyWebAssetSources(project, { schemaVersion: 1, records: [{ assetId: "font", digest: createBlobDigest(font), sourceKind: "third-party", source: "字体来源", permission: "documented", evidence: "PRIVATE_EVIDENCE_FIXTURE", reviewedBy: "TEST_REVIEWER", reviewedOn: "2026-10-17", credit: "公开字体许可说明" }] }) as typeof project;
  return { project, appearance, reader: { read: async (id: BlobDigest) => blobs.get(id) ?? null } };
}
const target = () => createProjectTemplate("新的故事", "018f08d8-71a1-7bc2-a627-2f4a843ee151");
it("carries image-only component references and bounded action layouts through a portable bundle and explicit fallback", async () => {
  const f = fixture(), layout = defaultWebPlayerLayout(), appearance = { ...f.appearance, coverAssetId: "", skin: { ...f.appearance.skin, reading: { ...f.appearance.skin.reading, windowAssetId: "" }, layout: { ...layout, title: { ...layout.title, enabled: true, components: [{ id: "layout_image", kind: "image" as const, text: "Layout image", action: "preferences" as const, assetId: "cover", fit: "contain" as const, desktop: layout.title.desktop.primary, mobile: null }] } } } };
  const bundle = await readSkinBundle(await exportSkinBundle(f.project, appearance, "布局", f.reader, "", false));
  const plan = await prepareSkinImport(bundle, target(), defaultSkinChoices(bundle, target()), null);
  expect(plan.appearance.skin?.layout?.title.components[0]?.assetId).toBeTruthy(); expect(plan.inputs).toHaveLength(2);
  const fallback = await prepareSkinImport(bundle, target(), { ...defaultSkinChoices(bundle, target()), cover: { mode: "fallback" } }, null);
  expect(fallback.appearance.skin?.layout?.title.components[0]?.assetId).toBe(""); expect(fallback.inputs).toHaveLength(1); expect(fallback.previewProject.scripts).toEqual(target().scripts);
});
it("requires explicit portrait-role mapping, prunes unused portrait-only files and never copies characters", async () => {
  const f = fixture(), template = defaultWebPlayerSkinTemplate(), project = { ...f.project, characters: { ...f.project.characters, characters: [{ id: "source_hero", displayName: "同名" }] } };
  const appearance = { ...f.appearance, coverAssetId: "", skin: { ...f.appearance.skin, reading: { ...f.appearance.skin.reading, windowAssetId: "" }, template: { ...template, portrait: { ...template.portrait, enabled: true, bindings: [{ characterId: "source_hero", characterName: "同名", assetId: "cover" }] } } } };
  const b = await readSkinBundle(await exportSkinBundle(project, appearance, "角色模板", f.reader, "", false));
  const p = { ...target(), characters: { schemaVersion: 1 as const, characters: [{ id: "target_hero", displayName: "同名" }] } }, choices = defaultSkinChoices(b, p);
  await expect(prepareSkinImport(b, p, choices, null)).rejects.toThrow("明确选择");
  const plan = await prepareSkinImport(b, p, choices, null, undefined, { source_hero: "target_hero" });
  expect(plan.previewProject.characters).toEqual(p.characters); expect(plan.previewProject.scripts).toEqual(p.scripts);
  expect(plan.appearance.skin?.template?.portrait.bindings[0]).toMatchObject({ characterId: "target_hero" }); expect(plan.inputs).toHaveLength(2);
  const skipped = await prepareSkinImport(b, p, choices, null, undefined, { source_hero: "" }); expect(skipped.inputs).toHaveLength(1); expect(skipped.appearance.skin?.template?.portrait.bindings).toEqual([]);
  const fallback = await prepareSkinImport(b, p, { ...choices, cover: { mode: "fallback" } }, null); expect(fallback.inputs).toHaveLength(1); expect(fallback.appearance.skin?.template?.portrait.bindings).toEqual([]);
  await expect(prepareSkinImport(b, p, choices, null, undefined, { source_hero: "unknown" })).rejects.toThrow("角色已变化");
  const templateWithTwo = { ...b.appearance.skin.template!, portrait: { ...b.appearance.skin.template!.portrait, bindings: [...b.appearance.skin.template!.portrait.bindings, { characterId: "source_two", characterName: "第二人", assetId: "cover" }] } };
  await expect(prepareSkinImport({ ...b, appearance: { ...b.appearance, skin: { ...b.appearance.skin, template: templateWithTwo } } }, p, choices, null, undefined, { source_hero: "target_hero", source_two: "target_hero" })).rejects.toThrow("同一角色");
});
it("retains hidden-device assets and visibility during portable bundle reuse", async () => {
  const f = fixture(), layout = defaultWebPlayerLayout();
  const appearance = { ...f.appearance, skin: { ...f.appearance.skin, layout: { ...layout, title: { ...layout.title, enabled: true, components: [{ id: "layout_device", kind: "image" as const, text: "Desktop image", action: "preferences" as const, assetId: "cover", fit: "contain" as const, visibility: "desktop" as const, desktop: layout.title.desktop.primary, mobile: null }] } } } };
  const bundle = await readSkinBundle(await exportSkinBundle(f.project, appearance, "Visibility", f.reader, "", false));
  const plan = await prepareSkinImport(bundle, target(), defaultSkinChoices(bundle, target()), null);
  expect(plan.appearance.skin?.layout?.title.components[0]).toMatchObject({ visibility: "desktop", assetId: expect.any(String) }); expect(plan.inputs).toHaveLength(2); expect(plan.previewProject.scripts).toEqual(target().scripts);
});
it("carries more than eight independent image references through JSON, ZIP, remapping and missing-image fallback", async () => {
  const f = fixture(), empty = defaultWebPlayerSkinImages(), extra = Array.from({ length: 13 }, (_, i) => ({ ...f.project.assets.assets[0]!, assetId: `image_${i}` }));
  const images = { backgrounds: Object.fromEntries(Object.entries(empty.backgrounds).map(([surface, row], i) => [surface, { ...row, assetId: `image_${i}` }])) as typeof empty.backgrounds, buttons: { normal: "image_9", hover: "image_10", pressed: "image_11", disabled: "image_12" } };
  const project = { ...f.project, assets: { ...f.project.assets, assets: [...f.project.assets.assets, ...extra] } }, appearance = { ...f.appearance, skin: { ...f.appearance.skin, images } };
  const text = exportPlayerSkinPreset(project, appearance, "全页模板"), missing = importPlayerSkinPreset(text, target(), DEFAULT_WEB_PLAYER_APPEARANCE);
  expect(missing.missing).toHaveLength(15); expect(missing.appearance.skin?.images?.buttons.pressed).toMatch(/^missing_skin_/u);
  const bytes = await exportSkinBundle(project, appearance, "全页模板", f.reader, "", false), b = await readSkinBundle(bytes);
  expect(b.assets).toHaveLength(15); expect(b.blobs.size).toBe(2);
  const p = target(), plan = await prepareSkinImport(b, p, defaultSkinChoices(b, p), null);
  expect(plan.inputs).toHaveLength(2); expect(webPlayerSkinReferences(plan.appearance.skin!)).toHaveLength(2);
  expect(plan.appearance.skin?.images?.backgrounds.save.assetId).toBe(plan.appearance.skin?.images?.buttons.normal);
  const remapped = importPlayerSkinPreset(text, plan.previewProject, DEFAULT_WEB_PLAYER_APPEARANCE); expect(remapped.missing).toEqual([]);
  expect(remapped.appearance.skin?.images).toEqual(plan.appearance.skin?.images);
  const choices = { ...defaultSkinChoices(b, p), image_11: { mode: "fallback" } as const };
  const fallback = await prepareSkinImport(b, p, choices, null); expect(fallback.appearance.skin?.images?.buttons.pressed).toBe(""); expect(fallback.appearance.skin?.images?.buttons.normal).not.toBe("");
});
async function bundle(privateSources = false) { const f = fixture(); return readSkinBundle(await exportSkinBundle(f.project, f.appearance, "来信皮肤", f.reader, "公开字体许可说明", privateSources)); }
it("round-trips only referenced bytes, preserves the target plot/title, and keeps provenance private and pending", async () => {
  const b = await bundle(true), p = target(), plan = await prepareSkinImport(b, p, defaultSkinChoices(b, p), null);
  expect(plan.inputs).toHaveLength(2); expect(plan.previewProject.scripts).toEqual(p.scripts); expect(plan.previewProject.manifest.title).toBe("新的故事");
  expect(readWebPlayerAppearance(plan.previewProject)?.titleTagline).toBe("");
  expect(readWebCredits(plan.previewProject).studio).toBe(""); expect(readWebCredits(plan.previewProject).acknowledgements).toBe("公开字体许可说明");
  expect(readWebAssetSources(plan.previewProject).records.find(row => row.evidence)).toMatchObject({ permission: "pending", evidence: "PRIVATE_EVIDENCE_FIXTURE" });
  expect(plan.mappings.get("cover")).not.toBe("cover");
  expect(await plan.reader.read(plan.inputs[0]!.bytes ? createBlobDigest(plan.inputs[0]!.bytes) : "invalid" as BlobDigest)).toBeTruthy();
  expect(p.assets.assets).toHaveLength(0);
});
it("excludes internal evidence/reviewer data by default and verifies every exported source", async () => {
  const b = await bundle(); expect(JSON.stringify(b.records)).not.toContain("PRIVATE_EVIDENCE"); expect(JSON.stringify(b.records)).not.toContain("TEST_REVIEWER");
  const f = fixture(); await expect(exportSkinBundle(f.project, f.appearance, "bad", { read: async () => null }, "", false)).rejects.toThrow("缺失或损坏");
});
it("never treats a colliding ID as the same file and reuses exact content across IDs", async () => {
  const b = await bundle(), p = target();
  const f = fixture(), existing = { ...f.project.assets.assets[1]!, assetId: "renamed_font" };
  const collision = { ...f.project.assets.assets[0]!, assetId: "font" };
  const project = { ...p, assets: { ...p.assets, assets: [existing, collision] } };
  const choices = defaultSkinChoices(b, project); expect(choices.font).toEqual({ mode: "existing", assetId: "renamed_font" });
  const plan = await prepareSkinImport(b, project, choices, f.reader); expect(plan.mappings.get("font")).toBe("renamed_font");
  expect(plan.inputs).toHaveLength(0); expect(plan.previewProject.assets.assets).toEqual(project.assets.assets);
});
it("repairs missing members with a chosen file or explicit readable fallback without mutating the project", async () => {
  const f = fixture(), bytes = await exportSkinBundle(f.project, f.appearance, "missing", f.reader, "", false), files = importProjectBinaryZip(bytes);
  for (const key of Object.keys(files)) if (key.startsWith("blobs/")) delete files[key];
  const b = await readSkinBundle(exportProjectBinaryZip(files)), p = target();
  await expect(prepareSkinImport(b, p, defaultSkinChoices(b, p), null)).rejects.toThrow("请为");
  const fallback = Object.fromEntries(b.assets.map(a => [a.assetId, { mode: "fallback" } as const]));
  const plan = await prepareSkinImport(b, p, fallback, null); expect(plan.inputs).toHaveLength(0); expect(readWebPlayerAppearance(plan.previewProject)?.skin?.fonts.body).toBe("sans");
  const repaired: Record<string, SkinAssetChoice> = { ...fallback, cover: { mode: "file", bytes: png, mimeType: "image/png", name: "repair.png" } };
  expect((await prepareSkinImport(b, p, repaired, null)).inputs).toHaveLength(1); expect(p.assets.assets).toHaveLength(0);
});
it("rejects undeclared, corrupt, oversized or executable bundle data before any publication", async () => {
  const f = fixture(), bytes = await exportSkinBundle(f.project, f.appearance, "test", f.reader, "", false);
  let files = importProjectBinaryZip(bytes); files["payload.js"] = new Uint8Array([1]); await expect(readSkinBundle(exportProjectBinaryZip(files))).rejects.toThrow("未声明");
  files = importProjectBinaryZip(bytes); const blob = Object.keys(files).find(key => key.startsWith("blobs/"))!; files[blob]![0] = files[blob]![0]! ^ 1; await expect(readSkinBundle(exportProjectBinaryZip(files))).rejects.toThrow("摘要");
  files = importProjectBinaryZip(bytes); const descriptor = JSON.parse(new TextDecoder().decode(files["skin.json"])); descriptor.script = "alert(1)"; files["skin.json"] = new TextEncoder().encode(JSON.stringify(descriptor)); await expect(readSkinBundle(exportProjectBinaryZip(files))).rejects.toThrow("格式");
});
it("validates credits and cancellation before committing and does not overwrite existing source records", async () => {
  const b = await bundle(true), p = target(), controller = new AbortController(); controller.abort();
  await expect(prepareSkinImport(b, p, defaultSkinChoices(b, p), null, controller.signal)).rejects.toThrow();
  const plan = await prepareSkinImport(b, p, defaultSkinChoices(b, p), null), current = plan.previewProject;
  expect(readWebCredits(applySkinImportPlan(current, plan)).acknowledgements).toBe("公开字体许可说明");
  const full = applyWebCredits(current, { ...readWebCredits(current), acknowledgements: "x".repeat(12000) });
  expect(() => applySkinImportPlan(full, plan)).toThrow("12000");
});

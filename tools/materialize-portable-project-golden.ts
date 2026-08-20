import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createProjectTemplate, saveProject, type CanonicalProject, type ProjectLifecycleSession } from "../packages/project-domain/src/index";
import { createBlobDigest, type AssetIndex, type BlobDigest } from "../packages/project-persistence/src/index";
import { exportPortableProjectBundle } from "../apps/editor/src/portable-project-bundle";

interface GoldenAsset {
  readonly assetId: string;
  readonly mimeType: string;
  readonly base64: string;
}

const output = resolve(process.argv[2] ?? "n23-e3-portable.zip");
const goldenPath = resolve("fixtures/projects/media/media-golden.json");
const golden = JSON.parse(await readFile(goldenPath, "utf8")) as { readonly assets: readonly GoldenAsset[] };
const loadGolden = (assetId: string) => {
  const asset = golden.assets.find((candidate) => candidate.assetId === assetId);
  if (!asset) throw new Error(`Missing golden asset ${assetId}`);
  return new Uint8Array(Buffer.from(asset.base64, "base64"));
};
const png = loadGolden("media_sunset");
const wav = loadGolden("media_theme");
const backgroundDigest = createBlobDigest(png);
const audioDigest = createBlobDigest(wav);
const base = createProjectTemplate("N23 E3 Portable Audit", "n23-e3-portable-audit");
const entrySceneId = base.manifest.entrySceneId;
const project: CanonicalProject = {
  ...base,
  chapters: [{ ...base.chapters[0]!, scenePaths: [`scenes/${entrySceneId}.json`, "scenes/scene_morning.json", "scenes/scene_stars.json"] }],
  scenes: [
    { ...base.scenes[0]!, title: "入口" },
    { schemaVersion: 1, id: "scene_morning", title: "晨光路线", scriptPath: "scripts/scene_morning.json", layoutPath: "layouts/scene_morning.json" },
    { schemaVersion: 1, id: "scene_stars", title: "星空路线", scriptPath: "scripts/scene_stars.json", layoutPath: "layouts/scene_stars.json" }
  ],
  characters: { schemaVersion: 1, characters: [
    { id: "character_a", displayName: "阿澄", color: "#8b7cff", portraitSlots: ["main"], defaultExpression: "neutral" },
    { id: "character_b", displayName: "小夜", color: "#ff62a5", portraitSlots: ["main"], defaultExpression: "neutral" }
  ] },
  scripts: {
    [entrySceneId]: { schemaVersion: 1, sceneId: entrySceneId, statements: [
      { id: "stmt_bg", kind: "direction", command: "background", summary: "action=set asset=n23_background" },
      { id: "stmt_audio", kind: "direction", command: "audio", summary: "action=play asset=n23_theme bus=bgm loop=false volume=1" },
      { id: "stmt_intro", kind: "dialogue", speakerId: "character_a", textId: "text_intro", text: "自包含工程从这里出发。" },
      { id: "stmt_choice", kind: "choice", prompt: "选择路线", options: [
        { id: "option_morning", label: "迎接晨光", targetSceneId: "scene_morning" },
        { id: "option_stars", label: "仰望星空", targetSceneId: "scene_stars" }
      ] }
    ] },
    scene_morning: { schemaVersion: 1, sceneId: "scene_morning", statements: [
      { id: "stmt_morning", kind: "dialogue", speakerId: "character_b", textId: "text_morning", text: "资源已经随工程抵达新工作区。" },
      { id: "stmt_morning_end", kind: "end", endingName: "晨光抵达" }
    ] },
    scene_stars: { schemaVersion: 1, sceneId: "scene_stars", statements: [
      { id: "stmt_stars", kind: "dialogue", speakerId: "character_b", textId: "text_stars", text: "离线重开仍能看见星空。" },
      { id: "stmt_stars_end", kind: "end", endingName: "星空抵达" }
    ] }
  },
  layouts: {
    ...base.layouts,
    scene_morning: { schemaVersion: 1, sceneId: "scene_morning", nodes: [] },
    scene_stars: { schemaVersion: 1, sceneId: "scene_stars", nodes: [] }
  }
};
const index: AssetIndex = { schemaVersion: 1, indexRevision: 2, assets: [
  { assetId: "n23_background", kind: "background", displayName: "N23 E3 Background", source: { digest: backgroundDigest, byteLength: png.byteLength, mimeType: "image/png" }, tags: [] },
  { assetId: "n23_theme", kind: "audio", displayName: "N23 E3 Theme", source: { digest: audioDigest, byteLength: wav.byteLength, mimeType: "audio/wav" }, tags: [] }
] };
const reference = { referenceId: "n23-e3-materialized", hostKind: "memory-test" as const, displayLocation: "Memory/N23-E3", permissionKey: "n23-e3" };
const session: ProjectLifecycleSession = { project, projectId: project.manifest.projectId, title: project.manifest.title, schemaVersion: 1, reference, hostVersion: "1", baseHash: "materialized", baseFiles: saveProject(project), dirty: false, recovery: "clean", access: "editable" };
const blobs = new Map<BlobDigest, Uint8Array>([[backgroundDigest, png], [audioDigest, wav]]);
const archive = await exportPortableProjectBundle(session, { loadIndex: async () => index, read: async (digest) => blobs.get(digest)?.slice() ?? null });
await writeFile(output, archive);
console.log(JSON.stringify({ output, byteLength: archive.byteLength, projectId: project.manifest.projectId, backgroundDigest, audioDigest }));

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const registry = JSON.parse(await readFile(join(root, "config", "golden-projects.json"), "utf8"));
const expectedCategories = ["Benchmark", "Branching", "CJK", "Media", "Recovery", "Size", "Tiny"];
const violations = [];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function validateMediaFixture(fixture, project, evidence, label) {
  if (fixture.schemaVersion !== 1 || fixture.projectId !== project.id || !Array.isArray(fixture.assets)) {
    violations.push(`${label} media fixture must use schemaVersion 1 and match the project ID`);
    return;
  }
  const referencedAssets = new Set(project.scenes.flatMap((scene) => scene.statements)
    .filter((statement) => statement.kind === "direction")
    .map((statement) => /(?:^|\s)asset=([^\s]+)/u.exec(statement.summary ?? "")?.[1])
    .filter((assetId) => assetId !== undefined));
  const assetIds = new Set();
  for (const asset of fixture.assets) {
    if (typeof asset.assetId !== "string" || assetIds.has(asset.assetId)) violations.push(`${label} media fixture contains an invalid or duplicate asset ID`);
    assetIds.add(asset.assetId);
    if (!/^(?:cg|character|audio)$/u.test(asset.kind ?? "") || typeof asset.mimeType !== "string" || typeof asset.base64 !== "string") {
      violations.push(`${label} media fixture asset ${asset.assetId ?? "<missing>"} has invalid metadata`);
      continue;
    }
    const bytes = Buffer.from(asset.base64, "base64");
    const byteHash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.toString("base64") !== asset.base64 || bytes.byteLength !== asset.byteLength || byteHash !== asset.sha256) {
      violations.push(`${label} media fixture asset ${asset.assetId} has stale bytes, length, or SHA-256`);
    }
  }
  if ([...referencedAssets].some((assetId) => !assetIds.has(assetId))) violations.push(`${label} media fixture does not cover every typed asset directive`);
  if (fixture.expectedStage?.backgroundAssetId !== "media_sunset" ||
      JSON.stringify(fixture.expectedStage?.characterAssetIds) !== JSON.stringify(["media_actor_sprite"]) ||
      JSON.stringify(fixture.expectedStage?.audioAssetIds) !== JSON.stringify(["media_theme"]) ||
      fixture.expectedStage?.diagnosticCount !== 0) violations.push(`${label} media fixture expected Stage contract is stale`);
  const fixtureHash = digest(fixture);
  if (evidence.mediaFixtureHash !== fixtureHash) violations.push(`${label} media fixture hash is stale; expected ${fixtureHash}`);
  if (evidence.n22MediaRuntimeEvidence?.status !== "verified" ||
      evidence.n22MediaRuntimeEvidence?.test !== "apps/editor/src/media-golden.test.ts" ||
      evidence.n22MediaRuntimeEvidence?.scope !== "inspect-import-save-reopen-preview-release") {
    violations.push(`${label} must register the bounded N22 Media Runtime evidence`);
  }
}

function validateProject(project, label) {
  if (project.schemaVersion !== 0 || typeof project.id !== "string" || typeof project.title !== "string") violations.push(`${label} is not an S0 story project`);
  if (!Array.isArray(project.characters) || !Array.isArray(project.scenes) || project.scenes.length === 0) violations.push(`${label} must contain characters and at least one scene`);
  const ids = [];
  for (const character of project.characters ?? []) ids.push(character.id);
  for (const scene of project.scenes ?? []) {
    ids.push(scene.id);
    for (const statement of scene.statements ?? []) {
      ids.push(statement.id);
      if (statement.kind === "dialogue") ids.push(statement.textId);
      if (statement.kind === "choice") for (const option of statement.options ?? []) ids.push(option.id);
    }
  }
  if (ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) violations.push(`${label} contains empty or duplicate stable IDs`);
  const sceneIds = new Set((project.scenes ?? []).map((scene) => scene.id));
  const characterIds = new Set((project.characters ?? []).map((character) => character.id));
  if (!sceneIds.has(project.entrySceneId)) violations.push(`${label} has a missing entry scene`);
  for (const scene of project.scenes ?? []) for (const statement of scene.statements ?? []) {
    if (statement.kind === "dialogue" && !characterIds.has(statement.speakerId)) violations.push(`${label} has a missing speaker`);
    if (statement.kind === "choice") for (const option of statement.options ?? []) if (!sceneIds.has(option.targetSceneId)) violations.push(`${label} has a missing choice target`);
  }
}

function validateCategory(project, category) {
  const statements = project.scenes.flatMap((scene) => scene.statements);
  if (category === "Tiny" && (project.scenes.length !== 1 || statements.length > 3)) violations.push("Tiny Golden must stay minimal");
  if (category === "Branching" && !statements.some((statement) => statement.kind === "choice" && statement.options.length >= 2)) violations.push("Branching Golden must contain a real fork");
  if (category === "Media") {
    const commands = new Set(statements.filter((statement) => statement.kind === "direction").map((statement) => statement.command));
    if (!["background", "show", "audio"].every((command) => commands.has(command))) violations.push("Media Golden must cover background, show, and audio directions");
  }
  if (category === "CJK") {
    const text = JSON.stringify(project);
    if (!/[\u3400-\u9fff]/u.test(text) || !/[\u3040-\u30ff]/u.test(text) || !/[\uac00-\ud7af]/u.test(text)) violations.push("CJK Golden must contain Chinese, Japanese, and Korean text");
  }
  if (category === "Recovery" && (project.scenes.length < 2 || !statements.some((statement) => statement.kind === "choice"))) violations.push("Recovery Golden must contain a multi-scene durable boundary");
  if (category === "Size" && project.scenes.length < 5) violations.push("Size Golden seed must expose multiple deterministic segments");
  if (category === "Benchmark" && (project.scenes.length < 3 || !statements.some((statement) => statement.kind === "choice") || !statements.some((statement) => statement.kind === "direction"))) violations.push("Benchmark Golden seed must combine branching and media cues");
}

if (registry.schemaVersion !== 1 || !Array.isArray(registry.projects)) violations.push("golden registry must use schemaVersion 1 and projects[]");
const categories = (registry.projects ?? []).map((entry) => entry.category).sort();
if (JSON.stringify(categories) !== JSON.stringify(expectedCategories)) violations.push("golden registry must contain exactly Tiny, Branching, Media, CJK, Recovery, Size, and Benchmark");

for (const entry of registry.projects ?? []) {
  if (!/^[a-z][a-z0-9-]*$/.test(entry.id ?? "") || entry.path !== `fixtures/projects/${entry.id}` || typeof entry.owner !== "string") {
    violations.push(`invalid golden registry entry ${entry.id ?? "<missing>"}`);
    continue;
  }
  const projectPath = join(root, entry.path, "project.s0.json");
  const evidencePath = join(root, entry.path, "evidence.json");
  const manifestPath = join(root, entry.path, "build-manifest.json");
  try {
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    validateProject(project, entry.id);
    validateCategory(project, entry.category);
    const projectHash = digest(project);
    const manifestHash = digest(manifest);
    if (evidence.schemaVersion !== 1 || evidence.projectId !== project.id || evidence.sourceSemanticHash !== projectHash) violations.push(`${entry.id} source semantic hash is stale; expected ${projectHash}`);
    for (const [field, targetNode] of [["expectedIrHash", "N30"], ["expectedStateHash", "N31"], ["formalBuildArtifactHash", "N80"]]) {
      const slot = evidence[field];
      if (slot?.status !== "pending" || slot?.targetNode !== targetNode || slot?.value !== null) violations.push(`${entry.id} ${field} must remain an explicit ${targetNode} pending slot`);
    }
    if (evidence.buildManifestHash !== manifestHash) violations.push(`${entry.id} build manifest hash is stale; expected ${manifestHash}`);
    if (manifest.schemaVersion !== 1 || manifest.projectId !== project.id || manifest.status !== "editor-shell-baseline" || manifest.formalBuildNode !== "N80") violations.push(`${entry.id} build manifest overclaims the N01 baseline`);
    if (entry.category === "Media") {
      const fixture = JSON.parse(await readFile(join(root, entry.path, "media-golden.json"), "utf8"));
      validateMediaFixture(fixture, project, evidence, entry.id);
    }
  } catch (error) {
    violations.push(`${entry.id} fixture cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "PASS", goldenProjects: registry.projects.length, categories, root: relative(root, join(root, "fixtures", "projects")).replaceAll("\\", "/") }, null, 2));
}

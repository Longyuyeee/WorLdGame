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

async function validateMediaBrowserEvidence(fixture, registryEvidence, label) {
  const evidencePath = join(root, "evidence", "n22", "media-golden-browser.json");
  const browserEvidence = JSON.parse(await readFile(evidencePath, "utf8"));
  if (browserEvidence.schemaVersion !== 1 || browserEvidence.status !== "pass" ||
      browserEvidence.scope !== "materialize-import-edit-save-full-reload-immediate-remount-preview-visual" ||
      browserEvidence.fixtureHash !== digest(fixture) || !/^[a-f0-9]{40}$/u.test(browserEvidence.sourceBaseRevision ?? "") ||
      browserEvidence.environment?.viewportWidth !== 1280 || browserEvidence.environment?.viewportHeight !== 720 ||
      browserEvidence.environment?.devicePixelRatio !== 2) violations.push(`${label} browser evidence identity, environment, or scope is stale`);
  const flow = browserEvidence.productFlow;
  if (flow?.materializedPayloads !== 3 || flow?.assetIndexRevision !== 3 || flow?.savedStorageRevision < 1 ||
      flow?.savedStatementCount !== 4 || flow?.fullReloadRecentProjectReopen !== "pass" ||
      flow?.structureToContentImmediateReopen !== "pass" || flow?.writerLeaseConflictAfterFix !== false ||
      JSON.stringify(flow?.importedAssetIds) !== JSON.stringify(["media_sunset", "media_actor_sprite", "media_theme"])) {
    violations.push(`${label} browser product flow is incomplete`);
  }
  if (browserEvidence.media?.background?.blobUrl !== true || browserEvidence.media?.background?.complete !== true ||
      browserEvidence.media?.character?.blobUrl !== true || browserEvidence.media?.character?.complete !== true ||
      browserEvidence.media?.audio?.blobUrl !== true || browserEvidence.media?.audio?.readyState < 1 ||
      browserEvidence.media?.audio?.errorCode !== null || browserEvidence.media?.runtimeErrorCount !== 0 ||
      browserEvidence.media?.pageWarningOrErrorCount !== 0) violations.push(`${label} browser media decode evidence failed`);
  const landscape = browserEvidence.viewports?.landscape16x9;
  const portrait = browserEvidence.viewports?.portrait9x16;
  if (landscape?.profile !== "landscape-16-9" || Math.abs(landscape?.measuredRatio - 16 / 9) > 0.0001 ||
      landscape?.overflowX !== 0 || landscape?.overflowY !== 0 || landscape?.pixelWidth !== 3840 || landscape?.pixelHeight !== 2160 ||
      portrait?.profile !== "portrait-9-16" || Math.abs(portrait?.measuredRatio - 9 / 16) > 0.0001 ||
      portrait?.overflowX !== 0 || portrait?.overflowY !== 0 || portrait?.pixelWidth !== 2160 || portrait?.pixelHeight !== 3840 ||
      browserEvidence.viewports?.motionSettleMs < 300) violations.push(`${label} browser viewport evidence failed`);
  if (!Array.isArray(browserEvidence.screenshots) || browserEvidence.screenshots.length !== 2) {
    violations.push(`${label} browser visual evidence must contain two viewport screenshots`);
  } else {
    const expectedScreenshots = new Map([
      ["evidence/n22/media-golden-browser-workspace.png", "landscape-16-9"],
      ["evidence/n22/media-golden-browser-workspace-9x16.png", "portrait-9-16"]
    ]);
    for (const screenshot of browserEvidence.screenshots) {
      if (expectedScreenshots.get(screenshot.path) !== screenshot.profile) {
        violations.push(`${label} browser screenshot path or profile is invalid: ${screenshot.path}`);
        continue;
      }
      expectedScreenshots.delete(screenshot.path);
      const bytes = await readFile(join(root, screenshot.path));
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (screenshot.width !== 1280 || screenshot.height !== 720 || bytes.byteLength !== screenshot.byteLength || hash !== screenshot.sha256) {
        violations.push(`${label} browser screenshot is stale: ${screenshot.path}`);
      }
    }
    if (expectedScreenshots.size !== 0) violations.push(`${label} browser visual evidence is missing a required viewport`);
  }
  const browserEvidenceHash = digest(browserEvidence);
  if (registryEvidence.n22BrowserEvidence?.status !== "verified" ||
      registryEvidence.n22BrowserEvidence?.path !== "evidence/n22/media-golden-browser.json" ||
      registryEvidence.n22BrowserEvidence?.hash !== browserEvidenceHash) {
    violations.push(`${label} browser evidence registration is stale; expected ${browserEvidenceHash}`);
  }
}

async function validateCanvasBrowserEvidence(fixture, registryEvidence, label) {
  const evidencePath = join(root, "evidence", "n22", "canvas-2d-browser.json");
  const browserEvidence = JSON.parse(await readFile(evidencePath, "utf8"));
  if (browserEvidence.schemaVersion !== 1 || browserEvidence.status !== "pass" ||
      browserEvidence.scope !== "canvas-2d-dom-overlay-fallback-dpr-visual" ||
      browserEvidence.fixtureHash !== digest(fixture) || !/^[a-f0-9]{40}$/u.test(browserEvidence.sourceBaseRevision ?? "") ||
      browserEvidence.environment?.viewportWidth !== 1280 || browserEvidence.environment?.viewportHeight !== 720 ||
      browserEvidence.environment?.devicePixelRatio !== 2) {
    violations.push(`${label} Canvas browser evidence identity, environment, or scope is stale`);
  }
  const contract = browserEvidence.renderContract;
  if (contract?.version !== 2 || contract?.primaryBackend !== "canvas-2d-v1" || contract?.fallbackBackend !== "dom-media-v1" ||
      contract?.coordinateSpace !== "design-pixels" || contract?.overlayOwner !== "react-dom" ||
      contract?.visualCanvasCount !== 1 || contract?.domMediaImageCount !== 0 || contract?.accessibleHitProxyCount !== 1 ||
      contract?.selectedProxyPressed !== true || contract?.status !== "ready") {
    violations.push(`${label} Canvas render contract or DOM separation evidence failed`);
  }
  const flow = browserEvidence.productFlow;
  if (flow?.assetIndexRevision !== 3 || flow?.savedStorageRevision < 1 || flow?.selectedStep !== 2 ||
      flow?.backgroundAssetId !== "media_sunset" || flow?.characterAssetId !== "media_actor_sprite" ||
      flow?.runtimeErrorCount !== 0) violations.push(`${label} Canvas product flow is incomplete`);
  const landscape = browserEvidence.viewports?.landscape16x9;
  const portrait = browserEvidence.viewports?.portrait9x16;
  if (landscape?.profile !== "landscape-16-9" || Math.abs(landscape?.measuredRatio - 16 / 9) > 0.0001 ||
      landscape?.overflowX !== 0 || landscape?.overflowY !== 0 ||
      landscape?.canvasPixelWidth !== 3840 || landscape?.canvasPixelHeight !== 2160 ||
      portrait?.profile !== "portrait-9-16" || Math.abs(portrait?.measuredRatio - 9 / 16) > 0.0001 ||
      portrait?.overflowX !== 0 || portrait?.overflowY !== 0 ||
      portrait?.canvasPixelWidth !== 2160 || portrait?.canvasPixelHeight !== 3840 ||
      browserEvidence.viewports?.motionSettleMs < 300) violations.push(`${label} Canvas viewport evidence failed`);
  const expectedScreenshots = new Map([
    ["evidence/n22/canvas-2d-browser-workspace.png", "landscape-16-9"],
    ["evidence/n22/canvas-2d-browser-workspace-9x16.png", "portrait-9-16"]
  ]);
  if (!Array.isArray(browserEvidence.screenshots) || browserEvidence.screenshots.length !== expectedScreenshots.size) {
    violations.push(`${label} Canvas visual evidence must contain two viewport screenshots`);
  } else {
    for (const screenshot of browserEvidence.screenshots) {
      if (expectedScreenshots.get(screenshot.path) !== screenshot.profile) {
        violations.push(`${label} Canvas screenshot path or profile is invalid: ${screenshot.path}`);
        continue;
      }
      expectedScreenshots.delete(screenshot.path);
      const bytes = await readFile(join(root, screenshot.path));
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (screenshot.width !== 1280 || screenshot.height !== 720 || bytes.byteLength !== screenshot.byteLength || hash !== screenshot.sha256) {
        violations.push(`${label} Canvas screenshot is stale: ${screenshot.path}`);
      }
    }
    if (expectedScreenshots.size !== 0) violations.push(`${label} Canvas visual evidence is missing a required viewport`);
  }
  const evidenceHash = digest(browserEvidence);
  if (registryEvidence.n22CanvasEvidence?.status !== "verified" ||
      registryEvidence.n22CanvasEvidence?.path !== "evidence/n22/canvas-2d-browser.json" ||
      registryEvidence.n22CanvasEvidence?.hash !== evidenceHash) {
    violations.push(`${label} Canvas evidence registration is stale; expected ${evidenceHash}`);
  }
}

async function validateMoveBrowserEvidence(fixture, registryEvidence, label) {
  const evidencePath = join(root, "evidence", "n22", "move-browser.json");
  const browserEvidence = JSON.parse(await readFile(evidencePath, "utf8"));
  if (browserEvidence.schemaVersion !== 1 || browserEvidence.status !== "pass" ||
      browserEvidence.scope !== "graphical-insert-move-forward-interpolation-rewind" ||
      browserEvidence.fixtureHash !== digest(fixture) || !/^[a-f0-9]{40}$/u.test(browserEvidence.sourceBaseRevision ?? "") ||
      browserEvidence.environment?.viewportWidth !== 1280 || browserEvidence.environment?.viewportHeight !== 720 ||
      browserEvidence.environment?.devicePixelRatio !== 2 || browserEvidence.environment?.prefersReducedMotion !== false) {
    violations.push(`${label} Move browser evidence identity, environment, or scope is stale`);
  }
  const flow = browserEvidence.productFlow;
  if (flow?.assetIndexRevision !== 3 || flow?.savedStorageRevision < 1 || flow?.insertedStatementCount !== 5 ||
      flow?.insertedDirection !== "action=move slot=actor x=80 y=90 transition=slide duration=300ms" ||
      flow?.renderBackend !== "canvas-2d-v1" || flow?.runtimeErrorCount !== 0) {
    violations.push(`${label} Move browser product flow is incomplete`);
  }
  const movement = browserEvidence.movement;
  const horizontalIntermediate = movement?.intermediate?.computedLeftPx > movement?.before?.computedLeftPx &&
    movement?.intermediate?.computedLeftPx < movement?.final?.computedLeftPx;
  const verticalIntermediate = movement?.intermediate?.computedTopPx < movement?.before?.computedTopPx &&
    movement?.intermediate?.computedTopPx > movement?.final?.computedTopPx;
  if (movement?.slot !== "actor" || movement?.before?.xPercent !== 50 || movement?.before?.yPercent !== 100 ||
      movement?.final?.xPercent !== 80 || movement?.final?.yPercent !== 90 || !horizontalIntermediate || !verticalIntermediate ||
      movement?.intermediate?.animationName !== "stage-canvas-hit-move" ||
      movement?.intermediate?.animationDurationMs !== 300 || movement?.intermediate?.animationPlayState !== "running" ||
      movement?.backRestoresPriorGeometry !== true || movement?.forwardInterpolatesGeometry !== true) {
    violations.push(`${label} Move interpolation or rewind evidence failed`);
  }
  if (!Array.isArray(browserEvidence.screenshots) || browserEvidence.screenshots.length !== 1) {
    violations.push(`${label} Move visual evidence must contain one screenshot`);
  } else {
    const screenshot = browserEvidence.screenshots[0];
    const bytes = await readFile(join(root, screenshot.path));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (screenshot.path !== "evidence/n22/move-browser-workspace.png" || screenshot.width !== 1280 ||
        screenshot.height !== 720 || bytes.byteLength !== screenshot.byteLength || hash !== screenshot.sha256) {
      violations.push(`${label} Move browser screenshot is stale`);
    }
  }
  const evidenceHash = digest(browserEvidence);
  if (registryEvidence.n22MoveEvidence?.status !== "verified" ||
      registryEvidence.n22MoveEvidence?.path !== "evidence/n22/move-browser.json" ||
      registryEvidence.n22MoveEvidence?.hash !== evidenceHash) {
    violations.push(`${label} Move evidence registration is stale; expected ${evidenceHash}`);
  }
}

async function validateHideBrowserEvidence(fixture, registryEvidence, label) {
  const evidencePath = join(root, "evidence", "n22", "hide-browser.json");
  const browserEvidence = JSON.parse(await readFile(evidencePath, "utf8"));
  if (browserEvidence.schemaVersion !== 1 || browserEvidence.status !== "pass" ||
      browserEvidence.scope !== "graphical-insert-hide-exit-fade-rewind" ||
      browserEvidence.fixtureHash !== digest(fixture) || !/^[a-f0-9]{40}$/u.test(browserEvidence.sourceBaseRevision ?? "") ||
      browserEvidence.environment?.viewportWidth !== 1280 || browserEvidence.environment?.viewportHeight !== 720 ||
      browserEvidence.environment?.devicePixelRatio !== 2) {
    violations.push(`${label} Hide browser evidence identity, environment, or scope is stale`);
  }
  const flow = browserEvidence.productFlow;
  if (flow?.assetIndexRevision !== 3 || flow?.savedStorageRevision < 1 || flow?.insertedStatementCount !== 6 ||
      flow?.insertedDirection !== "action=hide slot=actor transition=fade duration=300ms" ||
      flow?.renderBackend !== "canvas-2d-v1" || flow?.runtimeErrorCount !== 0) {
    violations.push(`${label} Hide browser product flow is incomplete`);
  }
  const exit = browserEvidence.exitTransition;
  if (exit?.slot !== "actor" || !(exit?.intermediateOpacity > 0 && exit?.intermediateOpacity < 1) ||
      exit?.finalOpacity !== 0 || exit?.animationName !== "stage-media-exit" ||
      exit?.animationDurationMs !== 300 || exit?.animationPlayStateAtSample !== "running" ||
      exit?.exitProxyDisabled !== true || exit?.exitProxyAriaHidden !== true ||
      exit?.backRestoresCharacter?.opacity !== 1 || exit?.backRestoresCharacter?.disabled !== false ||
      exit?.backRestoresCharacter?.xPercent !== 80 || exit?.backRestoresCharacter?.yPercent !== 90 ||
      exit?.forwardRestoresExitState !== true) {
    violations.push(`${label} Hide fade, accessibility, or rewind evidence failed`);
  }
  if (!Array.isArray(browserEvidence.screenshots) || browserEvidence.screenshots.length !== 1) {
    violations.push(`${label} Hide visual evidence must contain one screenshot`);
  } else {
    const screenshot = browserEvidence.screenshots[0];
    const bytes = await readFile(join(root, screenshot.path));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (screenshot.path !== "evidence/n22/hide-browser-workspace.png" || screenshot.width !== 1280 ||
        screenshot.height !== 720 || bytes.byteLength !== screenshot.byteLength || hash !== screenshot.sha256) {
      violations.push(`${label} Hide browser screenshot is stale`);
    }
  }
  const evidenceHash = digest(browserEvidence);
  if (registryEvidence.n22HideEvidence?.status !== "verified" ||
      registryEvidence.n22HideEvidence?.path !== "evidence/n22/hide-browser.json" ||
      registryEvidence.n22HideEvidence?.hash !== evidenceHash) {
    violations.push(`${label} Hide evidence registration is stale; expected ${evidenceHash}`);
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
      await validateMediaBrowserEvidence(fixture, evidence, entry.id);
      await validateCanvasBrowserEvidence(fixture, evidence, entry.id);
      await validateMoveBrowserEvidence(fixture, evidence, entry.id);
      await validateHideBrowserEvidence(fixture, evidence, entry.id);
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

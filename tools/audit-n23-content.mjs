import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const gatePath = join(root, "config", "n23-content-gate.json");
const gate = JSON.parse(await readFile(gatePath, "utf8"));
const projectPath = join(root, gate.projectPath);
const project = JSON.parse(await readFile(projectPath, "utf8"));
const violations = [];

const frozenGate = {
  minimumRouteSeconds: 300,
  minimumScenes: 3,
  minimumCharacters: 2,
  minimumEndings: 2,
  expectedRouteCount: 2,
  minimumReadableStatementsPerRoute: 20,
  maximumWaitContributionSeconds: 10,
  readingModel: { cjkCharactersPerMinute: 240, latinWordsPerMinute: 180, minimumVisibleStatementSeconds: 1.5, choiceSeconds: 5, directionSeconds: 1, endingSeconds: 3 }
};

const finitePositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
if (gate.schemaVersion !== 1 || gate.deliveryNode !== "N23-E5") violations.push("N23 content gate must use schemaVersion 1 and deliveryNode N23-E5");
for (const [key, value] of Object.entries(frozenGate)) {
  if (JSON.stringify(gate[key]) !== JSON.stringify(value)) violations.push(`${key} differs from the frozen N23-E5 policy`);
}
for (const key of ["minimumRouteSeconds", "minimumScenes", "minimumCharacters", "minimumEndings", "expectedRouteCount", "minimumReadableStatementsPerRoute", "maximumWaitContributionSeconds"]) {
  if (!finitePositive(gate[key])) violations.push(`${key} must be positive`);
}
for (const [key, value] of Object.entries(gate.readingModel ?? {})) if (!finitePositive(value)) violations.push(`readingModel.${key} must be positive`);

const scenes = new Map(project.scenes.map((scene) => [scene.id, scene]));
const allStatements = project.scenes.flatMap((scene) => scene.statements);
const endings = allStatements.filter((statement) => statement.kind === "end");
if (project.id !== "golden_benchmark") violations.push("N23 content gate must audit the registered Benchmark Golden");
if (project.scenes.length < gate.minimumScenes) violations.push(`project requires at least ${gate.minimumScenes} scenes`);
if (project.characters.length < gate.minimumCharacters) violations.push(`project requires at least ${gate.minimumCharacters} characters`);
if (endings.length < gate.minimumEndings) violations.push(`project requires at least ${gate.minimumEndings} endings`);
for (const kind of gate.requiredStatementKinds) if (!allStatements.some((statement) => statement.kind === kind)) violations.push(`project is missing required statement kind ${kind}`);
for (const command of gate.requiredDirectionCommands) if (!allStatements.some((statement) => statement.kind === "direction" && statement.command === command)) violations.push(`project is missing required direction ${command}`);
for (const scene of project.scenes) {
  const labels = new Set(scene.statements.filter((statement) => statement.kind === "label").map((statement) => statement.name));
  for (const statement of scene.statements) if (["jump", "call", "condition"].includes(statement.kind) && !labels.has(statement.targetLabel)) violations.push(`${statement.id} references missing local label ${statement.targetLabel}`);
}

function readableUnits(text) {
  const cjk = [...text].filter((character) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character)).length;
  const latin = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, " ").match(/[\p{Letter}\p{Number}]+(?:['’-][\p{Letter}\p{Number}]+)*/gu)?.length ?? 0;
  return { cjk, latin };
}

function readingSeconds(text) {
  const units = readableUnits(text);
  return Math.max(
    gate.readingModel.minimumVisibleStatementSeconds,
    units.cjk / gate.readingModel.cjkCharactersPerMinute * 60 + units.latin / gate.readingModel.latinWordsPerMinute * 60
  );
}

function waitSeconds(duration) {
  if (typeof duration !== "string" || !/^\d+(?:\.\d+)?(?:ms|s)$/u.test(duration)) return 0;
  return duration.endsWith("ms") ? Number.parseFloat(duration) / 1000 : Number.parseFloat(duration);
}

const routes = [];
function walk(sceneId, elapsedSeconds, waitContributionSeconds, readableStatements, path, activeScenes) {
  const scene = scenes.get(sceneId);
  if (scene === undefined) { violations.push(`route references missing scene ${sceneId}`); return; }
  if (activeScenes.has(sceneId)) { violations.push(`content duration audit does not accept cyclic scene route at ${sceneId}`); return; }
  const nextActive = new Set(activeScenes).add(sceneId);
  let elapsed = elapsedSeconds;
  let waitContribution = waitContributionSeconds;
  let readable = readableStatements;
  for (const statement of scene.statements) {
    if (statement.kind === "dialogue" || statement.kind === "narration") {
      elapsed += readingSeconds(statement.text);
      readable += 1;
      continue;
    }
    if (statement.kind === "direction") { elapsed += gate.readingModel.directionSeconds; continue; }
    if (statement.kind === "wait") { const seconds = waitSeconds(statement.duration); elapsed += seconds; waitContribution += seconds; continue; }
    if (statement.kind === "choice") {
      const choiceText = [statement.prompt, ...statement.options.map((option) => option.label)].join(" ");
      const choiceDuration = Math.max(gate.readingModel.choiceSeconds, readingSeconds(choiceText));
      for (const option of statement.options) walk(option.targetSceneId, elapsed + choiceDuration, waitContribution, readable, [...path, option.id], nextActive);
      return;
    }
    if (statement.kind === "end") {
      routes.push({ optionPath: path, ending: statement.endingName, seconds: elapsed + gate.readingModel.endingSeconds, waitContributionSeconds: waitContribution, readableStatements: readable });
      return;
    }
  }
  violations.push(`scene ${sceneId} does not reach a choice or ending`);
}

walk(project.entrySceneId, 0, 0, 0, [], new Set());
if (routes.length !== gate.expectedRouteCount) violations.push(`expected ${gate.expectedRouteCount} routes, received ${routes.length}`);
if (new Set(routes.map((route) => route.ending)).size !== routes.length) violations.push("each N23 route must reach a distinct ending");
for (const route of routes) {
  if (route.seconds < gate.minimumRouteSeconds) violations.push(`route ${route.optionPath.join(" -> ")} is only ${route.seconds.toFixed(2)} seconds`);
  if (route.waitContributionSeconds > gate.maximumWaitContributionSeconds) violations.push(`route ${route.optionPath.join(" -> ")} uses ${route.waitContributionSeconds.toFixed(2)} seconds of wait padding`);
  if (route.readableStatements < gate.minimumReadableStatementsPerRoute) violations.push(`route ${route.optionPath.join(" -> ")} has only ${route.readableStatements} readable statements`);
}

const result = {
  status: violations.length === 0 ? "PASS" : "FAIL",
  gate: relative(root, gatePath).replaceAll("\\", "/"),
  project: gate.projectPath,
  model: "CJK 240 chars/min + Latin 180 words/min; visible floors and bounded waits",
  routes: routes.map((route) => ({ ...route, seconds: Number(route.seconds.toFixed(2)) })),
  violations
};
console.log(JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;

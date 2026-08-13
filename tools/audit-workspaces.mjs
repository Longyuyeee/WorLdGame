import { access, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const registryPath = join(root, "config", "workspace-boundaries.json");
const allowedKinds = new Set(["product", "portable-candidate", "adapter", "spike", "conformance"]);
const allowedStabilities = new Set(["prototype", "candidate", "experimental"]);
const violations = [];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function discoverWorkspacePaths() {
  const paths = [];
  for (const parent of ["apps", "packages"]) {
    const entries = await readdir(join(root, parent), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workspacePath = `${parent}/${entry.name}`;
      if (await exists(join(root, workspacePath, "package.json"))) paths.push(workspacePath);
    }
  }
  return paths.sort();
}

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const workflowSource = await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8");
if (registry.schemaVersion !== 1) violations.push("workspace boundary registry must use schemaVersion 1");
if (!Array.isArray(registry.workspaces)) violations.push("workspace boundary registry must contain workspaces[]");
if (!Array.isArray(registry.plannedProductBoundaries)) violations.push("workspace boundary registry must contain plannedProductBoundaries[]");

const entries = Array.isArray(registry.workspaces) ? registry.workspaces : [];
const discoveredPaths = await discoverWorkspacePaths();
const registeredPaths = entries.map((entry) => entry.path).sort();
const workspaceNames = new Set(entries.map((entry) => entry.packageName));

if (JSON.stringify(discoveredPaths) !== JSON.stringify(registeredPaths)) {
  violations.push(`registered workspace paths differ from disk: registered=${registeredPaths.join(",")} discovered=${discoveredPaths.join(",")}`);
}
if (new Set(registeredPaths).size !== registeredPaths.length) violations.push("workspace paths must be unique");
if (workspaceNames.size !== entries.length) violations.push("workspace package names must be unique");

const registryByName = new Map(entries.map((entry) => [entry.packageName, entry]));
if (JSON.stringify(rootManifest.workspaces) !== JSON.stringify(["apps/*", "packages/*"])) {
  violations.push("root manifest workspaces must remain exactly apps/* and packages/*");
}
if (rootManifest.scripts?.["audit:workspaces"] !== "node tools/audit-workspaces.mjs") {
  violations.push("root manifest must expose the frozen workspace audit command");
}
if (!rootManifest.scripts?.check?.startsWith("npm run audit:workspaces &&")) {
  violations.push("root check must fail fast through audit:workspaces");
}
for (const requiredWorkflowToken of ["runs-on: windows-latest", "node-version: 22.12.0", "run: npm ci", "run: npm run check"]) {
  if (!workflowSource.includes(requiredWorkflowToken)) violations.push(`product baseline workflow is missing ${requiredWorkflowToken}`);
}

for (const entry of entries) {
  const label = entry.path ?? "<missing-path>";
  if (typeof entry.path !== "string" || !/^(apps|packages)\/[a-z0-9-]+$/.test(entry.path)) {
    violations.push(`${label} has an invalid workspace path`);
    continue;
  }
  if (!allowedKinds.has(entry.kind)) violations.push(`${label} has unknown kind ${entry.kind}`);
  if (!allowedStabilities.has(entry.stability)) violations.push(`${label} has unknown stability ${entry.stability}`);
  if (typeof entry.owner !== "string" || entry.owner.trim().length === 0) violations.push(`${label} must declare an owner`);
  if (!Array.isArray(entry.allowedWorkspaceDependencies)) violations.push(`${label} must declare allowedWorkspaceDependencies[]`);

  const manifestPath = join(root, entry.path, "package.json");
  if (!(await exists(manifestPath))) continue;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.name !== entry.packageName) violations.push(`${label} manifest name does not match registry`);
  if (manifest.private !== true) violations.push(`${label} must remain private before the M1 publishing decision`);
  if (manifest.type !== "module") violations.push(`${label} must use ESM`);
  if (typeof manifest.scripts?.build !== "string") violations.push(`${label} must expose a build script`);

  const actualInternalDependencies = Object.keys({
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.peerDependencies ?? {})
  }).filter((name) => workspaceNames.has(name)).sort();
  const allowedInternalDependencies = [...(entry.allowedWorkspaceDependencies ?? [])].sort();
  if (JSON.stringify(actualInternalDependencies) !== JSON.stringify(allowedInternalDependencies)) {
    violations.push(`${label} internal dependencies differ: allowed=${allowedInternalDependencies.join(",")} actual=${actualInternalDependencies.join(",")}`);
  }

  for (const dependencyName of actualInternalDependencies) {
    const dependency = registryByName.get(dependencyName);
    if (dependency === undefined) continue;
    if (["product", "portable-candidate", "adapter"].includes(entry.kind) && ["spike", "conformance"].includes(dependency.kind)) {
      violations.push(`${label} ${entry.kind} workspace must not depend on ${dependency.kind} ${dependencyName}`);
    }
    if (entry.kind === "portable-candidate" && !["portable-candidate"].includes(dependency.kind)) {
      violations.push(`${label} portable candidate may depend only on portable candidates`);
    }
  }
}

for (const planned of registry.plannedProductBoundaries ?? []) {
  if (typeof planned.path !== "string" || typeof planned.packageName !== "string" || !/^N\d+$/.test(planned.firstNode ?? "")) {
    violations.push("each planned product boundary must declare path, packageName, and firstNode");
    continue;
  }
  if (registeredPaths.includes(planned.path) || workspaceNames.has(planned.packageName)) {
    violations.push(`${planned.path} is planned and registered at the same time; move it into workspaces[] when implementation starts`);
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "PASS",
    registry: relative(root, registryPath).replaceAll("\\", "/"),
    auditedWorkspaces: entries.length,
    plannedProductBoundaries: registry.plannedProductBoundaries.length,
    classifications: Object.fromEntries([...allowedKinds].map((kind) => [kind, entries.filter((entry) => entry.kind === kind).length]))
  }, null, 2));
}

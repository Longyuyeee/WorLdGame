import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const auditedRoots = [
  join(repoRoot, "packages", "narrative-vm-spike", "src"),
  join(repoRoot, "packages", "story-core", "src"),
  join(repoRoot, "packages", "story-language", "src"),
  join(repoRoot, "packages", "project-persistence", "src")
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    })
  );
  return nested.flat();
}
const forbiddenImports = [
  "react",
  "react-dom",
  "electron",
  "@capacitor",
  "@tauri-apps",
  "node:crypto",
  "node:fs",
  "node:path",
  "node:process"
];
const forbiddenGlobalPatterns = new Map([
  ["document", /\bdocument\s*(?:\.|\[)/],
  ["window", /\bwindow\s*(?:\.|\[)/],
  ["HTMLElement", /\bHTMLElement\b/],
  ["localStorage", /\blocalStorage\b/],
  ["indexedDB", /\bindexedDB\b/]
]);
const violations = [];

const vmForbiddenGlobals = new Map([
  ["Math.random", /\bMath\.random\s*\(/],
  ["Date", /\b(?:new\s+Date|Date\.now)\s*\(/],
  ["performance.now", /\bperformance\.now\s*\(/],
  ["crypto randomness", /\bcrypto\.getRandomValues\s*\(/]
]);

const coreFiles = (
  await Promise.all(auditedRoots.map((root) => collectFiles(root)))
)
  .flat()
  .filter((path) => extname(path) === ".ts" && !path.endsWith(".test.ts"));

const nodeAdapterFiles = (await collectFiles(
  join(repoRoot, "packages", "project-persistence-node", "src")
)).filter((path) => extname(path) === ".ts" && !path.endsWith(".test.ts"));

for (const path of coreFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of forbiddenImports) {
    const importPattern = new RegExp(`from\\s+["']${dependency.replaceAll("-", "\\-")}`);
    if (importPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} imports forbidden dependency ${dependency}`);
    }
  }
  for (const [globalName, globalPattern] of forbiddenGlobalPatterns) {
    if (globalPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} references platform global ${globalName}`);
    }
  }
}

const vmFiles = coreFiles.filter((path) => path.includes(`${join("packages", "narrative-vm-spike", "src")}`));
for (const path of vmFiles) {
  const source = await readFile(path, "utf8");
  for (const [globalName, globalPattern] of vmForbiddenGlobals) {
    if (globalPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} references nondeterministic global ${globalName}`);
    }
  }
}

for (const path of nodeAdapterFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of ["react", "react-dom", "electron", "@capacitor", "@tauri-apps"]) {
    const importPattern = new RegExp(`from\\s+["']${dependency.replaceAll("-", "\\-")}`);
    if (importPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} imports forbidden UI or shell dependency ${dependency}`);
    }
  }
  for (const [globalName, globalPattern] of forbiddenGlobalPatterns) {
    if (globalPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} references forbidden platform global ${globalName}`);
    }
  }
}

const corePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "story-core", "package.json"), "utf8")
);

const vmPackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "narrative-vm-spike", "package.json"), "utf8")
);
if (vmPackage.dependencies !== undefined) {
  violations.push("narrative-vm-spike must not declare runtime dependencies in CL-04");
}
if (corePackage.dependencies !== undefined) {
  violations.push("story-core must not declare runtime dependencies in S0.1");
}

const languagePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "story-language", "package.json"), "utf8")
);
const languageDependencies = Object.keys(languagePackage.dependencies ?? {});
if (
  languageDependencies.length !== 1 ||
  languageDependencies[0] !== "@world-studio/story-core"
) {
  violations.push("story-language may depend only on story-core in S0.3");
}

const persistencePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "project-persistence", "package.json"), "utf8")
);
if (persistencePackage.dependencies !== undefined) {
  violations.push("project-persistence must not declare runtime dependencies in S0.9");
}

const nodePersistencePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "project-persistence-node", "package.json"), "utf8")
);
const nodePersistenceDependencies = Object.keys(nodePersistencePackage.dependencies ?? {});
if (
  nodePersistenceDependencies.length !== 1 ||
  nodePersistenceDependencies[0] !== "@world-studio/project-persistence"
) {
  violations.push("project-persistence-node may depend only on project-persistence in S0.10");
}

const editorPackage = JSON.parse(
  await readFile(join(repoRoot, "apps", "editor", "package.json"), "utf8")
);
const editorProductionFiles = (await collectFiles(join(repoRoot, "apps", "editor", "src")))
  .filter((path) => [".ts", ".tsx"].includes(extname(path)) && !path.includes(".test."));
for (const path of editorProductionFiles) {
  const source = await readFile(path, "utf8");
  if (source.includes("@world-studio/project-persistence-node")) {
    violations.push(`${relative(repoRoot, path)} imports the Node adapter into the web editor`);
  }
}
if (editorPackage.dependencies?.["@world-studio/story-core"] === undefined) {
  violations.push("editor must declare its story-core boundary explicitly");
}
if (editorPackage.dependencies?.["@world-studio/story-language"] === undefined) {
  violations.push("editor must declare its story-language boundary explicitly");
}
if (editorPackage.dependencies?.["@world-studio/project-persistence"] === undefined) {
  violations.push("editor must declare its project-persistence boundary explicitly");
}
if (editorPackage.dependencies?.["@world-studio/project-persistence-node"] !== undefined) {
  violations.push("web editor must not bundle the Node filesystem adapter");
}

const vmHarnessRoot = join(repoRoot, "apps", "vm-conformance");
const vmHarnessPackage = JSON.parse(
  await readFile(join(vmHarnessRoot, "package.json"), "utf8")
);
const vmHarnessDependencies = Object.keys(vmHarnessPackage.dependencies ?? {});
if (vmHarnessDependencies.length !== 1 ||
    vmHarnessDependencies[0] !== "@world-studio/narrative-vm-spike") {
  violations.push("VM conformance Harness may depend only on narrative-vm-spike");
}
const vmHarnessFiles = (await collectFiles(join(vmHarnessRoot, "src")))
  .filter((path) => extname(path) === ".ts");
for (const path of vmHarnessFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of ["electron", "@capacitor", "@tauri-apps", "node:fs", "node:path", "node:process", "node:worker_threads"]) {
    const importPattern = new RegExp(`from\\s+["']${dependency.replaceAll("-", "\\-")}`);
    if (importPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} imports forbidden shell or Node dependency ${dependency}`);
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        auditedPortableFiles: coreFiles.length,
        auditedNodeAdapterFiles: nodeAdapterFiles.length,
        guarantees: [
          "narrative-vm-spike has no UI, DOM, platform-shell, filesystem, process, crypto-provider, wall-clock, or ambient-random dependency",
          "story-core has no UI, DOM, platform-shell, filesystem, or process dependency",
          "story-language has no UI, DOM, platform-shell, filesystem, or process dependency",
          "story-language depends only on story-core",
          "project-persistence has no UI, DOM, platform-shell, filesystem, process, or runtime third-party dependency",
          "project-persistence-node is isolated from the portable core and depends only on project-persistence",
          "editor declares the story-core dependency explicitly",
          "editor declares the story-language dependency explicitly",
          "editor declares the project-persistence dependency explicitly",
          "web editor does not bundle the Node filesystem adapter",
          "VM Web Worker conformance Harness depends only on the portable narrative VM and imports no shell or Node adapter",
          "story-core has no runtime third-party dependency"
        ]
      },
      null,
      2
    )
  );
}

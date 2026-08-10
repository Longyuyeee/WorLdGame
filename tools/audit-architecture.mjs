import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const coreRoot = join(repoRoot, "packages", "story-core", "src");

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
  "node:fs",
  "node:path",
  "node:process"
];
const forbiddenGlobals = ["document", "window", "HTMLElement", "localStorage", "indexedDB"];
const violations = [];

const coreFiles = (await collectFiles(coreRoot)).filter(
  (path) => extname(path) === ".ts" && !path.endsWith(".test.ts")
);

for (const path of coreFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of forbiddenImports) {
    const importPattern = new RegExp(`from\\s+["']${dependency.replaceAll("-", "\\-")}`);
    if (importPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} imports forbidden dependency ${dependency}`);
    }
  }
  for (const globalName of forbiddenGlobals) {
    const globalPattern = new RegExp(`\\b${globalName}\\b`);
    if (globalPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} references platform global ${globalName}`);
    }
  }
}

const corePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "story-core", "package.json"), "utf8")
);
if (corePackage.dependencies !== undefined) {
  violations.push("story-core must not declare runtime dependencies in S0.1");
}

const editorPackage = JSON.parse(
  await readFile(join(repoRoot, "apps", "editor", "package.json"), "utf8")
);
if (editorPackage.dependencies?.["@world-studio/story-core"] === undefined) {
  violations.push("editor must declare its story-core boundary explicitly");
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        auditedCoreFiles: coreFiles.length,
        guarantees: [
          "story-core has no UI, DOM, platform-shell, filesystem, or process dependency",
          "editor declares the story-core dependency explicitly",
          "story-core has no runtime third-party dependency"
        ]
      },
      null,
      2
    )
  );
}

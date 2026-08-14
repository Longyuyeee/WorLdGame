import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const scratch = await mkdtemp(join(tmpdir(), "world-n01-empty-to-web-"));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function artifactInventory(directory) {
  const inventory = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else {
        const content = await readFile(path);
        inventory.push({ path: relative(directory, path).replaceAll("\\", "/"), bytes: content.byteLength, sha256: createHash("sha256").update(content).digest("hex") });
      }
    }
  }
  await visit(directory);
  return inventory.sort((left, right) => left.path.localeCompare(right.path));
}

try {
  const sourceDirectory = join(scratch, "source");
  const outputDirectory = join(scratch, "web-build");
  await mkdir(sourceDirectory, { recursive: true });
  await cp(join(root, "fixtures", "projects", "tiny", "project.s0.json"), join(sourceDirectory, "project.s0.json"));
  const npmCli = process.env.npm_execpath;
  if (npmCli === undefined) throw new Error("The demo must be invoked through npm so the locked npm CLI is known");
  await run(process.execPath, [npmCli, "run", "build", "--workspace", "@world-studio/editor"]);
  await cp(join(root, "apps", "editor", "dist"), outputDirectory, { recursive: true });
  const artifacts = await artifactInventory(outputDirectory);
  if (!artifacts.some((entry) => entry.path === "index.html") || !artifacts.some((entry) => entry.path.endsWith(".js"))) {
    throw new Error("Web editor shell build is missing index.html or JavaScript output");
  }
  const manifest = {
    schemaVersion: 1,
    status: "editor-shell-baseline",
    sourceProject: "fixtures/projects/tiny/project.s0.json",
    projectIntegration: { status: "pending", targetNode: "N80" },
    artifacts
  };
  await writeFile(join(scratch, "demo-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "PASS", start: "empty-temporary-directory", sourceProject: manifest.sourceProject, output: "web-build", artifacts: artifacts.length, formalProjectBuild: "pending N80" }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

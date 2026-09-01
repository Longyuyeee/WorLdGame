import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "vite";

const root = process.cwd();
const scratch = await mkdtemp(join(tmpdir(), "world-n23-empty-to-web-"));

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

function playRoute(html, optionId) {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://offline.world.invalid/" });
  const document = dom.window.document;
  const status = document.querySelector("#status");
  let visibleSteps = 0;
  while (status?.dataset.state === "presenting" && visibleSteps < 1000) {
    const next = document.querySelector("#next");
    if (!(next instanceof dom.window.HTMLButtonElement)) throw new Error("Playable continue control is missing before choice");
    next.click();
    visibleSteps += 1;
  }
  if (status?.dataset.state !== "waiting-choice") throw new Error(`Expected waiting-choice, received ${status?.dataset.state ?? "missing"}`);
  const option = document.querySelector(`[data-option-id="${optionId}"]`);
  if (!(option instanceof dom.window.HTMLButtonElement)) throw new Error(`Playable option is missing: ${optionId}`);
  option.click();
  while (status.dataset.state === "presenting" && visibleSteps < 1000) {
    const next = document.querySelector("#next");
    if (!(next instanceof dom.window.HTMLButtonElement)) throw new Error("Playable continue control is missing");
    next.click();
    visibleSteps += 1;
  }
  if (status.dataset.state !== "ended") throw new Error(`Route ${optionId} did not reach an ending: ${status.textContent ?? "unknown"}`);
  const ending = status.textContent?.replace(/^流程完成：/, "") ?? "";
  dom.window.close();
  return { optionId, ending, visibleSteps };
}

try {
  const sourceDirectory = join(scratch, "source");
  const compilerDirectory = join(scratch, "compiler");
  const outputDirectory = join(scratch, "web-build");
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  const sourceProjectPath = join(sourceDirectory, "project.s0.json");
  await cp(join(root, "fixtures", "projects", "benchmark", "project.s0.json"), sourceProjectPath);

  await build({
    root,
    logLevel: "error",
    build: {
      emptyOutDir: true,
      lib: { entry: join(root, "apps", "editor", "src", "playable-web-export.ts"), formats: ["es"] },
      outDir: compilerDirectory,
      rollupOptions: { output: { entryFileNames: "playable-web-builder.mjs" } }
    }
  });
  const { buildPlayableWebArtifact } = await import(`${pathToFileURL(join(compilerDirectory, "playable-web-builder.mjs")).href}?v=${Date.now()}`);
  const project = JSON.parse(await readFile(sourceProjectPath, "utf8"));
  const first = buildPlayableWebArtifact(project);
  const second = buildPlayableWebArtifact(JSON.parse(JSON.stringify(project)));
  if (first.html !== second.html || first.projectDigest !== second.projectDigest) throw new Error("Playable Web output is not deterministic");
  await writeFile(join(outputDirectory, "index.html"), first.html, "utf8");

  const firstChoice = project.scenes.flatMap((scene) => scene.statements).find((statement) => statement.kind === "choice");
  if (firstChoice === undefined) throw new Error("N23 Benchmark does not expose a choice for route verification");
  const routes = firstChoice.options.map((option) => playRoute(first.html, option.id));
  const artifacts = await artifactInventory(outputDirectory);
  const manifest = {
    schemaVersion: 2,
    status: "n23-independent-playable-candidate",
    sourceProject: "fixtures/projects/benchmark/project.s0.json",
    projectDigest: first.projectDigest,
    execution: { status: "PASS", routes },
    formalCompilerRuntimePlayer: { status: "pending", targetNodes: ["N30", "N31", "N50", "N80"] },
    artifacts
  };
  await writeFile(join(scratch, "demo-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "PASS", start: "empty-temporary-directory", output: "independent-single-file-web-playable", projectDigest: first.projectDigest, routes, artifacts, formalCompilerRuntimePlayer: "pending N30/N31/N50/N80" }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

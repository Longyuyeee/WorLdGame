import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build, preview } from "vite";

const root = process.cwd();
const editorRoot = join(root, "apps", "editor");
const host = "127.0.0.1";
const port = 43123;
const url = `http://${host}:${port}/`;
const smoke = process.argv.slice(2).includes("--smoke");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--smoke");
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);

if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  console.error(`Node.js 22.12 or newer is required; current version is ${process.versions.node}`);
  process.exitCode = 2;
} else if (unknownArguments.length > 0) {
  console.error(`Unknown N23 acceptance launcher arguments: ${unknownArguments.join(", ")}`);
  process.exitCode = 2;
} else {
  await build({ root: editorRoot, logLevel: smoke ? "warn" : "info" });
  const server = await preview({
    root: editorRoot,
    logLevel: smoke ? "warn" : "info",
    preview: { host, port, strictPort: true, open: !smoke }
  });

  if (smoke) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`entry returned HTTP ${response.status}`);
      const html = await response.text();
      if (!html.includes("<title>WorLd Studio</title>") || !html.includes('<div id="root"></div>')) {
        throw new Error("entry HTML is not the WorLd Studio production shell");
      }
      const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu)].map((match) => match[1]);
      if (assetPaths.length === 0) throw new Error("entry HTML does not reference production assets");
      const assets = await Promise.all(assetPaths.map(async (assetPath) => {
        const assetResponse = await fetch(new URL(assetPath, url));
        if (!assetResponse.ok) throw new Error(`${assetPath} returned HTTP ${assetResponse.status}`);
        return { path: assetPath, bytes: (await assetResponse.arrayBuffer()).byteLength };
      }));
      const javascript = await Promise.all(assets.filter((asset) => asset.path.endsWith(".js")).map((asset) =>
        readFile(join(editorRoot, "dist", asset.path.replace(/^\/+/u, "")), "utf8")
      ));
      if (!javascript.some((source) => source.includes("打开五分钟验收工程"))) {
        throw new Error("production assets do not expose the frozen N23 product entry");
      }
      console.log(JSON.stringify({
        status: "PASS",
        mode: "production-preview-smoke",
        url,
        entryBytes: Buffer.byteLength(html),
        assets
      }, null, 2));
    } finally {
      await new Promise((resolve, reject) => server.httpServer.close((error) => error === undefined ? resolve() : reject(error)));
    }
  } else {
    console.log(`N23 acceptance editor is ready at ${url}`);
    console.log("Keep this window open during acceptance. Press Ctrl+C to stop.");
    const close = async () => {
      await new Promise((resolve) => server.httpServer.close(() => resolve()));
      process.exit(0);
    };
    process.once("SIGINT", () => void close());
    process.once("SIGTERM", () => void close());
  }
}

import { build } from "vite";
import { resolve } from "node:path";

export async function buildPlayerExportRuntime() {
  const result = await build({
    configFile: false,
    root: resolve(import.meta.dirname, "../apps/player-shell"),
    logLevel: "error",
    mode: "production",
    oxc: { jsx: { development: false } },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: true,
      lib: { entry: resolve(import.meta.dirname, "../apps/player-shell/src/export-main.ts"), name: "WorldExport", formats: ["iife"] },
      cssCodeSplit: false
    }
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  return {
    javascript: outputs.filter((item) => item.type === "chunk").map((item) => item.code).join("\n"),
    css: outputs.filter((item) => item.type === "asset" && item.fileName.endsWith(".css")).map((item) => String(item.source)).join("\n")
  };
}

export function playerExportPlugin() {
  const id = "virtual:world-player-export";
  let runtime;
  return {
    name: "world-player-export",
    resolveId(source) { return source === id ? `\0${id}` : undefined; },
    async load(source) {
      if (source !== `\0${id}`) return;
      runtime ??= buildPlayerExportRuntime();
      return `export default ${JSON.stringify(await runtime)};`;
    }
  };
}

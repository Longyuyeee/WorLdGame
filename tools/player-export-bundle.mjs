import { build } from "vite";
import { resolve } from "node:path";
import { recoveryWorkerPlugin } from "./recovery-worker-bundle.mjs";

export async function buildPlayerExportRuntime({ sourceMap = false } = {}) {
  const result = await build({
    configFile: false,
    plugins: [recoveryWorkerPlugin()],
    root: resolve(import.meta.dirname, "../apps/player-shell"),
    logLevel: "error",
    mode: "production",
    oxc: { jsx: { development: false } },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: true,
      sourcemap: sourceMap ? 'hidden' : false,
      lib: { entry: resolve(import.meta.dirname, "../apps/player-shell/src/export-main.ts"), name: "WorldExport", formats: ["iife"] },
      cssCodeSplit: false
    }
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  const map = sourceMap ? outputs.find(item => item.type === "asset" && item.fileName.endsWith(".js.map")) : undefined;
  if (sourceMap && !map) throw new Error("Player diagnostic build did not produce a JavaScript source map");
  return {
    javascript: outputs.filter((item) => item.type === "chunk").map((item) => item.code).join("\n"),
    css: outputs.filter((item) => item.type === "asset" && item.fileName.endsWith(".css")).map((item) => String(item.source)).join("\n"),
    ...(map ? { sourceMap: JSON.parse(String(map.source)) } : {})
  };
}

export function playerExportPlugin() {
  const id = "virtual:world-player-export";
  const runtimeSource = path => {
    const relative = path.replaceAll("\\", "/");
    return relative.includes("/apps/player-shell/src/") || /\/packages\/[^/]+\/src\//.test(relative);
  };
  let runtime;
  return {
    name: "world-player-export",
    configureServer(server) {
      server.watcher.add([resolve(import.meta.dirname, "../apps/player-shell/src"), resolve(import.meta.dirname, "../packages")]);
    },
    handleHotUpdate(context) {
      if (!runtimeSource(context.file)) return;
      runtime = undefined;
      const module = context.server.moduleGraph.getModuleById(`\0${id}`);
      if (module) {
        context.server.moduleGraph.invalidateModule(module);
        return [...context.modules, module];
      }
    },
    resolveId(source) { return source === id ? `\0${id}` : undefined; },
    async load(source) {
      if (source !== `\0${id}`) return;
      runtime ??= buildPlayerExportRuntime();
      return `export default ${JSON.stringify(await runtime)};`;
    }
  };
}

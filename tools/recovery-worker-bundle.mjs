import { build } from "vite";
import { resolve } from "node:path";

/** Bundle a self-contained worker source string; the shell owns its Blob URL. */
export function recoveryWorkerPlugin(overrides = []) {
  const id = "virtual:world-recovery-worker";
  let pending;
  return {
    name: "world-recovery-worker",
    resolveId(source) { return source === id ? `\0${id}` : undefined; },
    async load(source) {
      if (source !== `\0${id}`) return;
      pending ??= build({
        configFile: false, root: resolve(import.meta.dirname, "../apps/player-shell"), logLevel: "error",
        ...(overrides.length ? { plugins: overrides } : {}),
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        build: { write: false, minify: true, sourcemap: false, lib: { entry: resolve(import.meta.dirname, "../apps/player-shell/src/recovery-session.worker.ts"), name: "WorldRecovery", formats: ["iife"] } }
      }).then(result => {
        const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
        return outputs.filter(item => item.type === "chunk").map(item => item.code).join("\n");
      });
      return `export default ${JSON.stringify(await pending)};`;
    },
    configureServer(server) { server.watcher.add([resolve(import.meta.dirname, "../apps/player-shell/src/recovery-session.worker.ts"), resolve(import.meta.dirname, "../apps/player-shell/src/recovery-session-task.ts"), resolve(import.meta.dirname, "../apps/player-shell/src/foreground-session-task.ts"), resolve(import.meta.dirname, "../apps/player-shell/src/history-protection-task.ts"), resolve(import.meta.dirname, "../packages")]); },
    handleHotUpdate(context) {
      const path = context.file.replaceAll("\\", "/");
      if (!/\/packages\/[^/]+\/src\//.test(path) && !/\/(?:recovery-session(?:\.worker|-task)|foreground-session-task|history-protection-task)\.ts$/.test(path)) return;
      pending = undefined;
      const module = context.server.moduleGraph.getModuleById(`\0${id}`);
      if (module) { context.server.moduleGraph.invalidateModule(module); return [...context.modules, module]; }
    }
  };
}

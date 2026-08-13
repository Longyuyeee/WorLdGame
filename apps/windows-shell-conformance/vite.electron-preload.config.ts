import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({ build: { target: "node22", ssr: resolve(import.meta.dirname, "electron/preload.ts"), outDir: resolve(import.meta.dirname, "dist/electron"), emptyOutDir: false, rollupOptions: { external: ["electron"], output: { format: "cjs", entryFileNames: "preload.cjs" } }, minify: false } });

import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({ build: { target: "node22", ssr: resolve(import.meta.dirname, "electron/main.ts"), outDir: resolve(import.meta.dirname, "dist/electron"), emptyOutDir: true, rollupOptions: { external: ["electron", /^node:/], output: { entryFileNames: "main.mjs" } }, minify: false } });

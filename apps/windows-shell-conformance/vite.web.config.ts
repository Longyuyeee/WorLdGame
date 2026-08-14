import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({ root: import.meta.dirname, base: "./", build: { outDir: resolve(import.meta.dirname, "dist/web"), emptyOutDir: true } });

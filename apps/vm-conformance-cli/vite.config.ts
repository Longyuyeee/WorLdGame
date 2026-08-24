import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "node22",
    ssr: resolve(import.meta.dirname, "src/cli.ts"),
    rollupOptions: { external: [/^node:/], output: { entryFileNames: "cli.mjs" } },
    minify: false,
    emptyOutDir: true
  }
});

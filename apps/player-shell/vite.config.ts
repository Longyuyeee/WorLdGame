import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { recoveryWorkerPlugin } from "../../tools/recovery-worker-bundle.mjs";

export default defineConfig({
  plugins: [react(), recoveryWorkerPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        embed: resolve(import.meta.dirname, "embed.html")
      }
    }
  }
});

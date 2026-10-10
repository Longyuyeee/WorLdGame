import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { playerExportPlugin } from "./tools/player-export-bundle.mjs";

export default defineConfig({
  plugins: [react(), playerExportPlugin()],
  test: {
    environment: "jsdom",
    include: ["apps/**/*.test.ts?(x)", "packages/**/*.test.ts?(x)"],
    setupFiles: ["./apps/editor/src/test-setup.ts"],
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});

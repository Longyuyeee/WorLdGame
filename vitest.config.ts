import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["apps/**/*.test.ts?(x)", "packages/**/*.test.ts?(x)"],
    setupFiles: ["./apps/editor/src/test-setup.ts"],
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});

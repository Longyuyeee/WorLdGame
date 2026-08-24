import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    environment: "node",
    include: ["tools/asset-performance.test.ts"],
    testTimeout: 15_000
  }
});

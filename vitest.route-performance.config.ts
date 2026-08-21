import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    environment: "node",
    include: ["tools/route-performance.test.ts"],
    testTimeout: 60_000
  }
});

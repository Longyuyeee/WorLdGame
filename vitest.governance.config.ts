import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tools/risk-acceptance-policy.test.ts"]
  }
});

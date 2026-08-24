import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tools/delivery-baseline-policy.test.ts"]
  }
});

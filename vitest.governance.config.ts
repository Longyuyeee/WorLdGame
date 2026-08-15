import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tools/risk-acceptance-policy.test.ts",
      "tools/n21-human-validation-policy.test.ts",
      "tools/n23-product-acceptance-policy.test.ts"
    ]
  }
});

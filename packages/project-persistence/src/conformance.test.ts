import { describe, expect, it } from "vitest";
import { auditProjectFileStore, InMemoryProjectFileStore } from "./index";

describe("ProjectFileStore conformance", () => {
  it("holds for the volatile in-memory reference adapter", async () => {
    const report = await auditProjectFileStore(new InMemoryProjectFileStore(), "memory-audit");
    expect(report.capabilities.durability).toBe("volatile");
    expect(report.checks).toEqual([
      "declared-capabilities",
      "missing-read",
      "complete-write-and-unicode",
      "atomic-replace-semantics",
      "normalized-replace-errors",
      "concurrent-complete-value",
      "idempotent-remove",
      "path-containment"
    ]);
  });
});

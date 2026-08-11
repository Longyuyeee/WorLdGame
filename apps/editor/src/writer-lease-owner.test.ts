import { describe, expect, it } from "vitest";
import { resolveWriterLeaseOwnerId, type WriterOwnerStorage } from "./writer-lease-owner";

function memoryStorage(): WriterOwnerStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }
  };
}

describe("writer lease owner reload handoff", () => {
  it("reuses the same safe owner only for a true reload", () => {
    const storage = memoryStorage();
    const first = resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_first_owner");
    const reload = resolveWriterLeaseOwnerId(storage, "reload", () => "writer_should_not_run");
    expect(first).toBe("writer_first_owner");
    expect(reload).toBe(first);
  });

  it("rotates a copied session owner for navigation or a duplicated tab", () => {
    const storage = memoryStorage();
    resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_original_owner");
    expect(resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_new_tab_owner"))
      .toBe("writer_new_tab_owner");
  });

  it("rejects an unsafe owner generator instead of weakening path validation", () => {
    expect(() => resolveWriterLeaseOwnerId(null, "navigate", () => "../unsafe"))
      .toThrow("unsafe ID");
  });
});

import { describe, expect, it } from "vitest";
import {
  markWriterLeaseOwnerHandoff,
  resolveWriterLeaseOwnerId,
  type WriterOwnerStorage
} from "./writer-lease-owner";

function memoryStorage(): WriterOwnerStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }
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

  it("consumes a fresh pagehide handoff when reload navigation metadata is unavailable", () => {
    const storage = memoryStorage();
    const first = resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_handoff_owner", 1_000);
    markWriterLeaseOwnerHandoff(storage, first, 2_000);
    expect(resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_should_not_run", 2_001)).toBe(first);
    expect(resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_after_consumption", 2_002)).toBe("writer_after_consumption");
  });

  it("rejects expired or mismatched handoff tickets", () => {
    const storage = memoryStorage();
    resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_original_owner", 1_000);
    markWriterLeaseOwnerHandoff(storage, "writer_other_owner", 2_000);
    expect(resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_mismatch_owner", 2_001)).toBe("writer_mismatch_owner");
    markWriterLeaseOwnerHandoff(storage, "writer_mismatch_owner", 2_002);
    expect(resolveWriterLeaseOwnerId(storage, "navigate", () => "writer_expired_owner", 40_000)).toBe("writer_expired_owner");
  });

  it("rejects an unsafe owner generator instead of weakening path validation", () => {
    expect(() => resolveWriterLeaseOwnerId(null, "navigate", () => "../unsafe"))
      .toThrow("unsafe ID");
  });
});

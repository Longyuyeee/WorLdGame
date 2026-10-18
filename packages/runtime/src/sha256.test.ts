import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";
import { hashCanonicalSessionSaveBytes } from "./session-save-bytes";

describe("session byte hashing compatibility", () => {
  it("matches independent SHA-256 for padding boundaries and nonzero views", () => {
    for (const size of [0, 1, 2, 31, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1025, 65537]) {
      const storage = Uint8Array.from({ length: size + 7 }, (_, i) => (i * 73 + 19) % 256);
      const input = storage.subarray(3, 3 + size), unchanged = input.slice();
      const expected = createHash("sha256").update(input).digest("hex");
      expect(sha256Hex(input)).toBe(expected);
      for (const schema of [1, 2] as const) expect(hashCanonicalSessionSaveBytes(input, schema)).toBe(createHash("sha256").update(`WORLd-RUNTIME-SESSION-SAVE\0v${schema}\0`).update(input).digest("hex"));
      expect(input).toEqual(unchanged);
    }
  });

  it("matches a multi-megabyte Unicode/domain payload without modifying the source", () => {
    const prefix = new TextEncoder().encode("WORLd-RUNTIME-SESSION-SAVE\0v2\0");
    const payload = new TextEncoder().encode("中文😀".repeat(250_000));
    const unchanged = payload.slice();
    expect(hashCanonicalSessionSaveBytes(payload, 2)).toBe(createHash("sha256").update(prefix).update(payload).digest("hex"));
    expect(hashCanonicalSessionSaveBytes(payload, 2)).not.toBe(sha256Hex(payload));
    expect(Buffer.compare(payload, unchanged)).toBe(0);
  });
});

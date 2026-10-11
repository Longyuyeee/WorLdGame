import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalRuntimeBytes, canonicalRuntimeStringify, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";

// Independent scalar-order oracle: JS default sort uses UTF-16, not code points.
function reference(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(reference).join(",")}]`;
  const record = value as Record<string, unknown>;
  const compare = (left: string, right: string) => {
    const a = Array.from(left, x => x.codePointAt(0)!);
    const b = Array.from(right, x => x.codePointAt(0)!);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return a.length - b.length;
  };
  return `{${Object.keys(record).sort(compare).map(key => `${JSON.stringify(key)}:${reference(record[key])}`).join(",")}}`;
}

describe("canonical allocation optimization compatibility", () => {
  it("retains scalar key order, nested serialization and SHA-256 bytes", () => {
    const keys = ["", "a", "aa", "a😀", "é", "中文", "\ue000", "\uffff", "𐀀", "😀", "😀a", "🧪", "\"\\\n"];
    for (let offset = 0; offset < keys.length; offset++) {
      const value = Object.fromEntries(keys.map((_, i) => [keys[(i + offset) % keys.length]!, { sequence: i, text: "中文😀\u0000é", list: [null, true, false, -0, Number.MAX_SAFE_INTEGER] }]));
      const expected = reference(value);
      expect(canonicalRuntimeStringify(value)).toBe(expected);
      expect(Buffer.from(canonicalRuntimeBytes(value))).toEqual(Buffer.from(expected, "utf8"));
      expect(sha256Hex(canonicalRuntimeBytes(value))).toBe(createHash("sha256").update(expected).digest("hex"));
    }
  });

  it("matches UTF-8 boundaries, every valid scalar and multi-megabyte inputs", () => {
    for (let start = 0; start <= 0x10ffff; start += 4096) {
      const points = Array.from({ length: Math.min(4096, 0x110000 - start) }, (_, i) => start + i).filter(p => p < 0xd800 || p > 0xdfff);
      const value = String.fromCodePoint(...points).normalize("NFC");
      expect(Buffer.from(utf8Encode(value)).equals(Buffer.from(value, "utf8"))).toBe(true);
    }
    for (const value of ["", "ascii".repeat(400_000), "中😀é".repeat(200_000)]) {
      expect(Buffer.from(utf8Encode(value)).equals(Buffer.from(value, "utf8"))).toBe(true);
    }
  });

  it("still rejects noncanonical values rather than silently repairing them", () => {
    for (const value of ["e\u0301", "\ud800", "\udfff", "a\ud800b"]) {
      expect(() => utf8Encode(value)).toThrow(TypeError);
      expect(() => canonicalRuntimeStringify(value)).toThrow(TypeError);
      expect(() => canonicalRuntimeStringify({ [value]: 1 })).toThrow(TypeError);
    }
    for (const value of [undefined, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, 1n, new Date(), { x: undefined }]) {
      expect(() => canonicalRuntimeStringify(value)).toThrow(TypeError);
    }
  });
});

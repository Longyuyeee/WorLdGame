import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { canonicalRuntimeBytes, canonicalRuntimeEncoding, canonicalRuntimeStringify, utf8Encode, withCanonicalRuntimeStringCache } from "./canonical";
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
  it.each(['missing', 'restricted'] as const)('keeps strict portable UTF-8 encoding when the native encoder is %s', async mode => {
    vi.stubGlobal('TextEncoder', mode === 'missing' ? undefined : function() { throw Error('restricted'); });
    try {
      vi.resetModules();
      const { utf8Encode: portable } = await import('./canonical');
      for (const text of ['', 'ASCII\0"\\', '中文😀é', '\u007f\u0080\u07ff\u0800\uffff𐀀']) {
        expect(Buffer.from(portable(text))).toEqual(Buffer.from(text, 'utf8'));
      }
      for (const text of ['e\u0301', '\ud800', '\udfff']) expect(() => portable(text)).toThrow(TypeError);
    } finally { vi.unstubAllGlobals(); }
  });
  it("reuses only primitive quotes within a validation and reencodes changed records", () => {
    const quote = vi.spyOn(JSON, "stringify");
    try {
      withCanonicalRuntimeStringCache(() => {
        const value = { key: "中文😀", entries: ["text.1", "text.2"] };
        const first = canonicalRuntimeEncoding(value), calls = quote.mock.calls.length;
        expect(canonicalRuntimeEncoding(value)).toEqual(first);
        expect(quote.mock.calls.length).toBe(calls);
        value.entries[0] = "changed";
        expect(canonicalRuntimeStringify(value)).toBe(reference(value));
        expect(() => canonicalRuntimeStringify({ ...value, invalid: undefined })).toThrow(TypeError);
        expect(() => canonicalRuntimeEncoding({ value: "\n\u0301" })).toThrow(TypeError);
      });
    } finally { quote.mockRestore(); }
  });

  it("restores nested scopes and discards quotes after successful or failed validation", () => {
    const quote = vi.spyOn(JSON, "stringify");
    try {
      withCanonicalRuntimeStringCache(() => {
        canonicalRuntimeStringify("outer"); const first = quote.mock.calls.length;
        expect(() => withCanonicalRuntimeStringCache(() => { canonicalRuntimeStringify("outer"); throw Error("stop"); })).toThrow("stop");
        expect(quote.mock.calls.length).toBe(first + 1);
        canonicalRuntimeStringify("outer"); expect(quote.mock.calls.length).toBe(first + 1);
      });
      const first = quote.mock.calls.length;
      canonicalRuntimeStringify("outer"); expect(quote.mock.calls.length).toBe(first + 1);
    } finally { quote.mockRestore(); }
  });

  it("bounds scoped primitive retention and still encodes strings beyond either bound", () => {
    withCanonicalRuntimeStringCache(() => {
      const values = Array.from({ length: 600 }, (_, index) => `value.${index}.${"x".repeat(400)}`);
      expect(canonicalRuntimeStringify(values)).toBe(reference(values));
      expect(canonicalRuntimeStringify(values)).toBe(reference(values));
      expect(() => canonicalRuntimeStringify({ ["e\u0301"]: 1 })).toThrow(TypeError);
      expect(() => canonicalRuntimeStringify(["\ud800"])).toThrow(TypeError);
    });
  });

  it.each(["count", "characters", "single-length"])("caps the %s quote cache without skipping later validation", limit => {
    const values = limit === "count" ? Array.from({ length: 600 }, (_, i) => `id.${i}`)
      : limit === "characters" ? Array.from({ length: 100 }, (_, i) => `id.${i}.${"x".repeat(400)}`)
      : ["x".repeat(513)];
    const quote = vi.spyOn(JSON, "stringify");
    try {
      withCanonicalRuntimeStringCache(() => {
        const first = canonicalRuntimeStringify(values), calls = quote.mock.calls.length;
        expect(canonicalRuntimeStringify(values)).toBe(first);
        const misses = quote.mock.calls.length - calls;
        expect(misses).toBeGreaterThan(0);
        if (limit !== "single-length") expect(misses).toBeLessThan(values.length);
        expect(() => canonicalRuntimeStringify([...values, "e\u0301"])).toThrow(TypeError);
        expect(() => canonicalRuntimeStringify([...values, "\ud800"])).toThrow(TypeError);
      });
    } finally { quote.mockRestore(); }
  });

  it("retains scalar key order, nested serialization and SHA-256 bytes", () => {
    const bmpOnly = { "\uffff": true, "\ue000": false, "中文": 1, "é": 2, z: 3, a: 4 };
    expect(canonicalRuntimeStringify(bmpOnly)).toBe(reference(bmpOnly));
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
      expect(Buffer.from(canonicalRuntimeBytes(value)).equals(Buffer.from(JSON.stringify(value), "utf8"))).toBe(true);
    }
    for (const value of ["", "ascii".repeat(400_000), "中😀é".repeat(200_000)]) {
      expect(Buffer.from(utf8Encode(value)).equals(Buffer.from(value, "utf8"))).toBe(true);
    }
  });

  it("still rejects noncanonical values rather than silently repairing them", () => {
    for (const value of [0, true, null, {}, ["ascii"]]) expect(() => utf8Encode(value as unknown as string)).toThrow(TypeError);
    for (const value of ["e\u0301", "\ud800", "\udfff", "a\ud800b"]) {
      expect(() => utf8Encode(value)).toThrow(TypeError);
      expect(() => canonicalRuntimeStringify(value)).toThrow(TypeError);
      expect(() => canonicalRuntimeStringify({ [value]: 1 })).toThrow(TypeError);
    }
    for (const value of [undefined, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, 1n, new Date(), { x: undefined }]) {
      expect(() => canonicalRuntimeStringify(value)).toThrow(TypeError);
    }
  });

  it("encodes exact canonical bytes and keeps the final text boundary validated", () => {
    const value = { text: "中文😀é\u0000\"\\", nested: [{ "é": "\u0301" }, { "😀": "é" }] };
    const expected = reference(value);
    const normalize = vi.spyOn(String.prototype, "normalize");
    try {
      const encoded = canonicalRuntimeEncoding(value);
      expect(encoded.serialized).toBe(expected);
      expect(Buffer.from(encoded.bytes)).toEqual(Buffer.from(expected, "utf8"));
      expect(normalize.mock.contexts.map(String).filter(value => value === expected)).toHaveLength(1);
    } finally { normalize.mockRestore(); }
    for (const text of ["e\u0301", "\ud800", "\udfff"]) {
      expect(() => canonicalRuntimeEncoding({ text })).toThrow(TypeError);
      // The public text encoder must continue validating untrusted input.
      expect(() => utf8Encode(text)).toThrow(TypeError);
    }
  });

  it("rejects JSON escape/combining sequences that the original text encoder rejects", () => {
    for (const value of ["\n\u0301", "\t\u0307", "\b\u0307", "\r\u0301"]) {
      expect(value.normalize("NFC")).toBe(value);
      const serialized = canonicalRuntimeStringify({ value });
      expect(serialized.normalize("NFC")).not.toBe(serialized);
      expect(() => utf8Encode(serialized)).toThrow("Unicode NFC");
      expect(() => canonicalRuntimeEncoding({ value })).toThrow("Unicode NFC");
      expect(() => canonicalRuntimeBytes({ value })).toThrow("Unicode NFC");
    }
  });

  it("reuses only immutable string encodings within one operation", () => {
    const value = Array.from({ length: 100 }, () => ({ text: "中文😀é", status: "ready" }));
    const normalize = vi.spyOn(String.prototype, "normalize");
    try {
      expect(canonicalRuntimeStringify(value)).toBe(reference(value));
      for (const text of ["中文😀é"]) {
        expect(normalize.mock.contexts.map(String).filter(context => context === text)).toHaveLength(1);
      }
      for (const text of ["text", "status", "ready"]) expect(normalize.mock.contexts.map(String)).not.toContain(text);
    } finally { normalize.mockRestore(); }
    // No mutable object is memoized, even when a getter changes during a call.
    let reads = 0;
    const shared = { get value() { reads++; return reads <= 2 ? "first" : "second"; } };
    expect(canonicalRuntimeStringify([shared, shared])).toBe('[{"value":"first"},{"value":"second"}]');
    const mutable = { value: "first" };
    expect(canonicalRuntimeStringify(mutable)).toBe('{"value":"first"}');
    mutable.value = "e\u0301";
    expect(() => canonicalRuntimeStringify(mutable)).toThrow(TypeError);
  });

  it("keeps scalar ordering and validation after the bounded string table fills", () => {
    const value = Array.from({ length: 700 }, (_, i) => ({ [`key-${i}😀`]: `中文-${i}`, same: "é" }));
    const expected = reference(value);
    expect(canonicalRuntimeEncoding(value)).toEqual({ serialized: expected, bytes: new Uint8Array(Buffer.from(expected, "utf8")) });
    expect(() => canonicalRuntimeBytes([...value, { invalid: "e\u0301" }])).toThrow(TypeError);
    expect(() => canonicalRuntimeBytes([...value, { "\ud800": true }])).toThrow(TypeError);
  });

  it("does not let input array methods bypass canonical string validation", () => {
    const value = ["e\u0301"];
    value.map = () => [];
    expect(() => canonicalRuntimeEncoding(value)).toThrow(TypeError);
    class OwnSpecies extends Array<string> {
      static override get [Symbol.species](): ArrayConstructor { throw new Error("must not execute input species"); }
    }
    expect(canonicalRuntimeEncoding(new OwnSpecies("中文😀"))).toEqual({ serialized: '["中文😀"]', bytes: new Uint8Array(Buffer.from('["中文😀"]', "utf8")) });
  });
});

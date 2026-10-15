import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSha256PrefixDigest, sha256 } from './sha256';

const reference = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
describe('portable domain SHA-256 exact UTF-8 identity', () => {
  it.each(['', 'abc', 'a'.repeat(1_000_000), '雨停之前\r\n🎮e\u0301é', '\ud800', '\udc00', '\ud800x\udc00', '\udbff\udfff'])('matches independent crypto for vector %#', value => {
    expect(sha256(value)).toBe(reference(value));
  });
  it('matches every padding boundary over repeated multi-block input', () => {
    for (let length = 0; length <= 1024; length++) {
      const value = Array.from({ length }, (_, index) => String.fromCharCode(32 + index % 95)).join('');
      expect(sha256(value)).toBe(reference(value));
    }
  });
  it('preserves every Unicode scalar and UTF-8 multi-byte padding boundary', () => {
    for (let start = 0; start <= 0x10ffff; start += 1024) {
      const points = Array.from({ length: Math.min(1024, 0x110000 - start) }, (_, index) => start + index).filter(point => point < 0xd800 || point > 0xdfff);
      const value = String.fromCodePoint(...points);
      expect(sha256(value)).toBe(reference(value));
    }
    for (let length = 0; length < 160; length++) expect(sha256('😀雨'.repeat(length))).toBe(reference('😀雨'.repeat(length)));
  });
  it('has no shared mutable digest state across interleaved calls', () => {
    for (let index = 0; index < 30; index++) {
      expect(sha256(`${index}雨`.repeat(100))).toBe(reference(`${index}雨`.repeat(100)));
      expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    }
  });
});

describe('ordinary SHA-256 with a shared byte prefix', () => {
  it('matches independent crypto at every prefix/suffix block and padding boundary', () => {
    for (let prefixLength = 0; prefixLength <= 192; prefixLength++) {
      const prefix = Uint8Array.from({ length: prefixLength }, (_, i) => i % 256), digest = createSha256PrefixDigest(prefix);
      for (let suffixLength = 0; suffixLength <= 128; suffixLength++) {
        const suffix = Uint8Array.from({ length: suffixLength }, (_, i) => 255 - i % 256);
        expect(digest(suffix)).toBe(createHash('sha256').update(prefix).update(suffix).digest('hex'));
      }
    }
  });
  it('handles nonzero byte offsets, large prefixes and repeated/empty suffixes without retaining mutable caller input', () => {
    const storage = new TextEncoder().encode('xx' + '雨😀'.repeat(25_000) + 'yy'), prefix = storage.subarray(2, storage.length - 2), before = prefix.slice(), digest = createSha256PrefixDigest(prefix);
    storage.fill(0);
    for (const value of ['', '旧版本', 'next'.repeat(100), '']) {
      const suffix = new TextEncoder().encode(value), expected = createHash('sha256').update(before).update(suffix).digest('hex');
      expect(digest(suffix)).toBe(expected); suffix.fill(1);
      expect(digest(new TextEncoder().encode(value))).toBe(expected);
    }
  });
  it('hashes exact bytes even when the prefix splits a UTF-8 scalar', () => {
    const bytes = new TextEncoder().encode('雨😀e\u0301');
    for (let split = 0; split <= bytes.length; split++) expect(createSha256PrefixDigest(bytes.subarray(0, split))(bytes.subarray(split))).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});

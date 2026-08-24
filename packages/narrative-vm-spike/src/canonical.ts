function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (item) => item.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (item) => item.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function assertCanonicalString(value: string): void {
  if (value !== value.normalize("NFC")) {
    throw new TypeError("Canonical VM strings must already use Unicode NFC");
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("Canonical VM strings cannot contain an unpaired high surrogate");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("Canonical VM strings cannot contain an unpaired low surrogate");
    }
  }
}

function canonicalNumber(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("Canonical VM numbers must be safe integers");
  }
  return Object.is(value, -0) ? "0" : value.toString(10);
}

export function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return canonicalNumber(value);
  if (typeof value === "string") {
    assertCanonicalString(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical VM objects must be plain records");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareCodePoints);
    return `{${keys.map((key) => {
      assertCanonicalString(key);
      const member = record[key];
      if (member === undefined) {
        throw new TypeError("Canonical VM objects cannot contain undefined members");
      }
      return `${JSON.stringify(key)}:${canonicalStringify(member)}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Canonical VM values cannot contain ${typeof value}`);
}

export function utf8Encode(value: string): Uint8Array {
  assertCanonicalString(value);
  const bytes: number[] = [];
  for (const symbol of value) {
    const point = symbol.codePointAt(0) ?? 0;
    if (point <= 0x7f) {
      bytes.push(point);
    } else if (point <= 0x7ff) {
      bytes.push(0xc0 | (point >>> 6), 0x80 | (point & 0x3f));
    } else if (point <= 0xffff) {
      bytes.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >>> 18),
        0x80 | ((point >>> 12) & 0x3f),
        0x80 | ((point >>> 6) & 0x3f),
        0x80 | (point & 0x3f)
      );
    }
  }
  return Uint8Array.from(bytes);
}

export function canonicalBytes(value: unknown): Uint8Array {
  return utf8Encode(canonicalStringify(value));
}

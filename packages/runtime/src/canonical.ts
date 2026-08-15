function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (item) => item.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (item) => item.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export function assertCanonicalRuntimeString(value: string): void {
  if (value !== value.normalize("NFC")) throw new TypeError("Runtime strings must use Unicode NFC");
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("Runtime strings cannot contain an unpaired high surrogate");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("Runtime strings cannot contain an unpaired low surrogate");
    }
  }
}

export function canonicalRuntimeStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Runtime numbers must be safe integers");
    return Object.is(value, -0) ? "0" : value.toString(10);
  }
  if (typeof value === "string") { assertCanonicalRuntimeString(value); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalRuntimeStringify).join(",")}]`;
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Runtime objects must be plain records");
    const record = value as Record<string, unknown>;
    const members = Object.keys(record).sort(compareCodePoints).map((key) => {
      assertCanonicalRuntimeString(key);
      if (record[key] === undefined) throw new TypeError("Runtime objects cannot contain undefined members");
      return `${JSON.stringify(key)}:${canonicalRuntimeStringify(record[key])}`;
    });
    return `{${members.join(",")}}`;
  }
  throw new TypeError(`Runtime values cannot contain ${typeof value}`);
}

export function utf8Encode(value: string): Uint8Array {
  assertCanonicalRuntimeString(value);
  const bytes: number[] = [];
  for (const symbol of value) {
    const point = symbol.codePointAt(0) ?? 0;
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) bytes.push(0xc0 | (point >>> 6), 0x80 | (point & 0x3f));
    else if (point <= 0xffff) bytes.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 0x3f), 0x80 | (point & 0x3f));
    else bytes.push(0xf0 | (point >>> 18), 0x80 | ((point >>> 12) & 0x3f), 0x80 | ((point >>> 6) & 0x3f), 0x80 | (point & 0x3f));
  }
  return Uint8Array.from(bytes);
}

export function canonicalRuntimeBytes(value: unknown): Uint8Array {
  return utf8Encode(canonicalRuntimeStringify(value));
}

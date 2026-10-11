function compareCodePoints(left: string, right: string): number {
  // Compare scalars directly: sorting every record must not allocate two arrays
  // per comparison. UTF-16 lexical sort is not equivalent for supplementary keys.
  let leftIndex = 0, rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftPoint = left.codePointAt(leftIndex)!;
    const rightPoint = right.codePointAt(rightIndex)!;
    const difference = leftPoint - rightPoint;
    if (difference !== 0) return difference;
    leftIndex += leftPoint > 0xffff ? 2 : 1;
    rightIndex += rightPoint > 0xffff ? 2 : 1;
  }
  return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0;
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
  // Exact allocation avoids a large growable boxed-number array plus a copy.
  // Keep this portable implementation independent of host TextEncoder APIs.
  let length = 0;
  for (let index = 0; index < value.length; index++) {
    const point = value.codePointAt(index)!;
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (point > 0xffff) index++;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < value.length; index++) {
    const point = value.codePointAt(index)!;
    if (point <= 0x7f) bytes[offset++] = point;
    else if (point <= 0x7ff) { bytes[offset++] = 0xc0 | (point >>> 6); bytes[offset++] = 0x80 | (point & 0x3f); }
    else if (point <= 0xffff) { bytes[offset++] = 0xe0 | (point >>> 12); bytes[offset++] = 0x80 | ((point >>> 6) & 0x3f); bytes[offset++] = 0x80 | (point & 0x3f); }
    else { bytes[offset++] = 0xf0 | (point >>> 18); bytes[offset++] = 0x80 | ((point >>> 12) & 0x3f); bytes[offset++] = 0x80 | ((point >>> 6) & 0x3f); bytes[offset++] = 0x80 | (point & 0x3f); index++; }
  }
  return bytes;
}

export function canonicalRuntimeBytes(value: unknown): Uint8Array {
  return utf8Encode(canonicalRuntimeStringify(value));
}

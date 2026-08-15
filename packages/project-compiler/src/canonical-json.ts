import type { JsonObject, JsonValue } from "@world-studio/project-domain";

export function compareCanonicalStrings(left: string, right: string): number {
  const leftPoints = Array.from(left, (item) => item.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (item) => item.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function validateString(value: string): void {
  if (value !== value.normalize("NFC")) throw new TypeError("Compiler strings must use Unicode NFC");
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("Compiler strings cannot contain unpaired surrogates");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("Compiler strings cannot contain unpaired surrogates");
    }
  }
}

export function canonicalJson(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Compiler numbers must be finite");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value === "string") {
    validateString(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as JsonObject;
  const keys = Object.keys(record).sort(compareCanonicalStrings);
  return `{${keys.map((key) => {
    validateString(key);
    const member = record[key];
    if (member === undefined) throw new TypeError("Compiler objects cannot contain undefined members");
    return `${JSON.stringify(key)}:${canonicalJson(member)}`;
  }).join(",")}}`;
}

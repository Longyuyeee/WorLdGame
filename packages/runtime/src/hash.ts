import { canonicalRuntimeBytes, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";
import type { RuntimeStateV1 } from "./types";

const DOMAIN = utf8Encode("WORLd-RUNTIME-STATE\0v1\0");

export function runtimeStateHashV1(state: RuntimeStateV1): string {
  const payload = canonicalRuntimeBytes(state);
  const input = new Uint8Array(DOMAIN.length + payload.length);
  input.set(DOMAIN); input.set(payload, DOMAIN.length);
  return sha256Hex(input);
}

import { canonicalRuntimeBytes, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";
import type { RuntimeSaveV1, RuntimeStateV1 } from "./types";

const DOMAIN = utf8Encode("WORLd-RUNTIME-STATE\0v1\0");
const SAVE_DOMAIN = utf8Encode("WORLd-RUNTIME-SAVE\0v1\0");

export function runtimeStateHashV1(state: RuntimeStateV1): string {
  const payload = canonicalRuntimeBytes(state);
  const input = new Uint8Array(DOMAIN.length + payload.length);
  input.set(DOMAIN); input.set(payload, DOMAIN.length);
  return sha256Hex(input);
}

export function runtimeSaveArtifactHashV1(save: RuntimeSaveV1): string {
  const payload = canonicalRuntimeBytes(save);
  const input = new Uint8Array(SAVE_DOMAIN.length + payload.length);
  input.set(SAVE_DOMAIN); input.set(payload, SAVE_DOMAIN.length);
  return sha256Hex(input);
}

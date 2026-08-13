import { canonicalBytes, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";
import type { RuntimeStateV0 } from "./types";

const DOMAIN = utf8Encode("WORLd-VM-STATE\0v0\0");

export function stateHashV0(state: RuntimeStateV0): string {
  const stateBytes = canonicalBytes(state);
  const input = new Uint8Array(DOMAIN.length + stateBytes.length);
  input.set(DOMAIN);
  input.set(stateBytes, DOMAIN.length);
  return sha256Hex(input);
}

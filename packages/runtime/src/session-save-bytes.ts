import { utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";

const V1_DOMAIN = utf8Encode("WORLd-RUNTIME-SESSION-SAVE\0v1\0");
const V2_DOMAIN = utf8Encode("WORLd-RUNTIME-SESSION-SAVE\0v2\0");

/** Internal only: callers must establish canonical bytes before invoking this.
 * No object/byte cache survives a save operation; untrusted loads still validate
 * the canonical envelope, history, identity and hashes before being accepted.
 */
export function hashCanonicalSessionSaveBytes(bytes: Uint8Array, schema: 1 | 2): string {
  const domain = schema === 1 ? V1_DOMAIN : V2_DOMAIN;
  const input = new Uint8Array(domain.length + bytes.length);
  input.set(domain); input.set(bytes, domain.length);
  return sha256Hex(input);
}

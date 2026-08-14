import { canonicalBytes, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";
import type { EffectIntentV0 } from "./types";

function domainHash(domain: string, value: unknown): string {
  const prefix = utf8Encode(`WORLd-VM-${domain}\0v0\0`);
  const payload = canonicalBytes(value);
  const input = new Uint8Array(prefix.length + payload.length);
  input.set(prefix);
  input.set(payload, prefix.length);
  return sha256Hex(input);
}

export function effectIdV0(
  executionId: string,
  descriptorId: string,
  logicalSequence: number,
  originatingRevision: number
): string {
  return `effect.${domainHash("EFFECT", {
    descriptorId,
    executionId,
    logicalSequence,
    originatingRevision
  })}`;
}

export function barrierRequestIdV0(
  executionId: string,
  descriptorId: string,
  logicalSequence: number,
  expectedRevision: number
): string {
  return `barrier.${domainHash("BARRIER-REQUEST", {
    descriptorId,
    executionId,
    expectedRevision,
    logicalSequence
  })}`;
}

export function effectIntentHashV0(effect: EffectIntentV0): string {
  return domainHash("EFFECT-INTENT", effect);
}

import { canonicalRuntimeBytes, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";
import type { RuntimeEffectIntentV1 } from "./types";

function domainHash(domain: string, value: unknown): string {
  const prefix = utf8Encode(`WORLd-RUNTIME-${domain}\0v1\0`);
  const payload = canonicalRuntimeBytes(value);
  const input = new Uint8Array(prefix.length + payload.length);
  input.set(prefix); input.set(payload, prefix.length);
  return sha256Hex(input);
}

export function runtimeEffectIdV1(executionId: string, descriptorId: string, logicalSequence: number, originatingRevision: number): string {
  return `effect.${domainHash("EFFECT", { descriptorId, executionId, logicalSequence, originatingRevision })}`;
}

export function runtimeBarrierRequestIdV1(executionId: string, descriptorId: string, logicalSequence: number, expectedStateRevision: number): string {
  return `barrier.${domainHash("BARRIER-REQUEST", { descriptorId, executionId, expectedStateRevision, logicalSequence })}`;
}

export function runtimeChoiceRequestIdV1(executionId: string, instructionId: string, logicalSequence: number, expectedStateRevision: number): string {
  return `choice.${domainHash("CHOICE-REQUEST", { executionId, expectedStateRevision, instructionId, logicalSequence })}`;
}

export function runtimeEffectIntentHashV1(effect: RuntimeEffectIntentV1): string {
  return domainHash("EFFECT-INTENT", effect);
}

import { canonicalRuntimeBytes, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";
import type { RuntimeHistoryReconciliationPlanV1, RuntimeHistorySessionV1, RuntimeMetaProgressV1, RuntimeSaveV1, RuntimeSessionSaveV1, RuntimeStateV1, RuntimeStoryOutcomeV1 } from "./types";

const DOMAIN = utf8Encode("WORLd-RUNTIME-STATE\0v1\0");
const SAVE_DOMAIN = utf8Encode("WORLd-RUNTIME-SAVE\0v1\0");
const SESSION_SAVE_DOMAIN = utf8Encode("WORLd-RUNTIME-SESSION-SAVE\0v1\0");
const HISTORY_DOMAIN = utf8Encode("WORLd-RUNTIME-HISTORY\0v1\0");
const RECONCILIATION_DOMAIN = utf8Encode("WORLd-RUNTIME-HISTORY-RECONCILIATION\0v1\0");
const STORY_OUTCOME_DOMAIN = utf8Encode("WORLd-RUNTIME-STORY-OUTCOME\0v1\0");
const META_PROGRESS_DOMAIN = utf8Encode("WORLd-RUNTIME-META-PROGRESS\0v1\0");

function domainHash(domain: Uint8Array, value: unknown): string {
  const payload = canonicalRuntimeBytes(value);
  const input = new Uint8Array(domain.length + payload.length);
  input.set(domain); input.set(payload, domain.length);
  return sha256Hex(input);
}

export function runtimeStateHashV1(state: RuntimeStateV1): string {
  return domainHash(DOMAIN, state);
}

export function runtimeSaveArtifactHashV1(save: RuntimeSaveV1): string {
  return domainHash(SAVE_DOMAIN, save);
}

export function runtimeSessionSaveArtifactHashV1(save: RuntimeSessionSaveV1): string {
  return domainHash(SESSION_SAVE_DOMAIN, save);
}

export function runtimeHistorySessionHashV1(session: RuntimeHistorySessionV1): string {
  return domainHash(HISTORY_DOMAIN, session);
}

export function runtimeHistoryReconciliationPlanHashV1(plan: RuntimeHistoryReconciliationPlanV1): string {
  return domainHash(RECONCILIATION_DOMAIN, plan);
}

export function runtimeStoryOutcomeHashV1(outcome: RuntimeStoryOutcomeV1): string {
  return domainHash(STORY_OUTCOME_DOMAIN, outcome);
}

export function runtimeMetaProgressHashV1(progress: RuntimeMetaProgressV1): string {
  return domainHash(META_PROGRESS_DOMAIN, progress);
}

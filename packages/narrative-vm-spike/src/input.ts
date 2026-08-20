import { canonicalBytes } from "./canonical";
import { sha256Hex } from "./sha256";

export function choiceRequestIdV0(
  executionId: string,
  choiceId: string,
  logicalSequence: number,
  expectedRevision: number
): string {
  return `request.${sha256Hex(canonicalBytes({
    executionId,
    choiceId,
    logicalSequence,
    expectedRevision
  }))}`;
}

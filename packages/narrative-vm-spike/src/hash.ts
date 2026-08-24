import { canonicalBytes, utf8Encode } from "./canonical";
import { sha256Hex } from "./sha256";
import type { RuntimeStateV0 } from "./types";

const DOMAIN = utf8Encode("WORLd-VM-STATE\0v0\0");
const STORY_OUTCOME_DOMAIN = utf8Encode("WORLd-VM-STORY-OUTCOME\0v0\0");

export function stateHashV0(state: RuntimeStateV0): string {
  const stateBytes = canonicalBytes(state);
  const input = new Uint8Array(DOMAIN.length + stateBytes.length);
  input.set(DOMAIN);
  input.set(stateBytes, DOMAIN.length);
  return sha256Hex(input);
}

export function storyOutcomeHashV0(state: RuntimeStateV0): string {
  if (state.pendingRequests.length > 0 || state.pendingEffects.length > 0) {
    throw new TypeError("Story Outcome Hash requires a quiescent Runtime State");
  }
  const outcome = {
    schemaVersion: 0,
    stepId: state.stepId,
    callStackDepth: state.callStack.length,
    variables: state.variables,
    prng: state.prng,
    logicalClock: state.logicalClock,
    sceneState: state.sceneState,
    audioLogic: state.audioLogic,
    readSession: state.readSession,
    terminal: state.terminal
  };
  const payload = canonicalBytes(outcome);
  const input = new Uint8Array(STORY_OUTCOME_DOMAIN.length + payload.length);
  input.set(STORY_OUTCOME_DOMAIN);
  input.set(payload, STORY_OUTCOME_DOMAIN.length);
  return sha256Hex(input);
}

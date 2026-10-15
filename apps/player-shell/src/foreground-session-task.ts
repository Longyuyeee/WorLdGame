import { loadPlayerCoreSessionSaveV1,type PlayerCoreState } from "@world-studio/player-core";
import { createRecoverySession,type RecoverySessionSource } from "./recovery-session-task";

export type ForegroundSessionTask = { readonly kind:"save";readonly source:RecoverySessionSource } | {readonly kind:"load";readonly state:PlayerCoreState;readonly serialized:string};
export type ForegroundSessionResult = {readonly kind:"save";readonly result:ReturnType<typeof createRecoverySession>} | {readonly kind:"load";readonly result:ReturnType<typeof loadPlayerCoreSessionSaveV1>};
/** The same public validators, including history chains, identities and monotonic Meta Progress. */
export function executeForegroundSessionTask(task:ForegroundSessionTask):ForegroundSessionResult {
  return task.kind==="save"?{kind:"save",result:createRecoverySession(task.source)}:{kind:"load",result:loadPlayerCoreSessionSaveV1(task.state,task.serialized)};
}

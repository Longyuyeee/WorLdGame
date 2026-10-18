import { oneShotSessionWorker, SessionWorkerPool, type SessionWorkerConnection } from "./session-worker-pool";
import { executeForegroundSessionTask, foregroundSessionWorkerTask, applyForegroundSessionWorkerResult, type ForegroundSessionTask, type ForegroundSessionResult, type ForegroundSessionWorkerResult } from "./foreground-session-task";
import { validStoryAdvanceReply } from './story-advance-task';
import { validPlaybackAdvanceReply } from './playback-advance-task';
import { decodeHistoryResult } from './history-result-transport';
import { encodeForegroundSessionInput } from './session-input-transport';

export class ForegroundSessionError extends Error { override readonly name="ForegroundSessionError"; }
let serial=0;
const diagnostics={active:0,peakActive:0,started:0,completed:0,cancelled:0,fallback:0,failed:0};
const publish=()=>{if(typeof document!=="undefined")document.documentElement.dataset.foregroundSerializer=JSON.stringify(diagnostics);};
function validReply(task:ForegroundSessionTask,value:unknown):value is ForegroundSessionWorkerResult {
  try {
  if(!value||typeof value!=="object")return false;
  const reply=value as ForegroundSessionWorkerResult;if(reply.kind!==task.kind||!reply.result||typeof reply.result.ok!=="boolean")return false;
  if(reply.kind==="save")return reply.result.ok===true&&typeof reply.result.serialized==="string"&&reply.result.serialized.length>0&&reply.result.serialized.length<=64*1024*1024&&typeof reply.result.artifactHash==="string"&&/^[a-f0-9]{64}$/.test(reply.result.artifactHash);
  if (reply.kind === 'protect') {
    if (task.kind !== 'protect' || reply.result.ok !== true) return false;
    const history = reply.result.historySession, source = task.state.historySession;
    return source !== null && history?.projectId === source.projectId && history.buildId === source.buildId && history.executionId === source.executionId &&
      history.cursor === Math.min(source.cursor, task.retainedBackSteps) && Array.isArray(history.entries) && Array.isArray(history.checkpoints) && history.checkpoints.length === history.entries.length + 1 &&
      history.checkpoints[history.cursor]?.stateHash === source.checkpoints[source.cursor]?.stateHash && reply.result.playback?.mode === 'normal' &&
      typeof reply.result.serialized === 'string' && reply.result.serialized.length > 0 && reply.result.serialized.length <= 64 * 1024 * 1024 && typeof reply.result.artifactHash === 'string' && /^[a-f0-9]{64}$/.test(reply.result.artifactHash);
  }
  if(!reply.result.ok)return Array.isArray(reply.result.diagnostics)&&reply.result.diagnostics.length>0&&reply.result.diagnostics.every(item=>typeof item.code==="string");
  if (task.kind === 'advance' && reply.kind === 'advance') return validStoryAdvanceReply(task.state, reply.result);
  if (task.kind === 'playback' && reply.kind === 'playback') return validPlaybackAdvanceReply(task.state, task.policy, reply.result);
  if (task.kind !== 'load' || reply.kind !== 'load') return false;
  const patch = reply.result.patch, history = patch?.historySession, runtime = patch?.runtimeState;
  return task.state.artifacts !== null && !task.state.replaySession && runtime?.projectId === task.state.projectId &&
    history?.projectId === task.state.projectId && history.buildId === reply.result.savedBuildId && runtime.buildId === history.buildId &&
    (reply.result.savedBuildId === task.state.artifacts.manifest.buildId ? reply.result.compatibility === 'current' :
      task.state.compatibleSaveBuildIds.includes(reply.result.savedBuildId) && reply.result.compatibility === 'verified-previous') &&
    Array.isArray(history.entries) && Array.isArray(history.checkpoints) && history.checkpoints.length === history.entries.length + 1 &&
    Number.isSafeInteger(history.cursor) && history.cursor >= 0 && history.cursor < history.checkpoints.length &&
    ['title', 'presenting', 'waiting-choice', 'waiting-effect', 'waiting-barrier', 'ended', 'error'].includes(patch.status) &&
    patch.schedulerSession === null && patch.playback?.mode === 'normal' && patch.hostState != null &&
    Array.isArray(patch.diagnostics) && Array.isArray(patch.replayEntries) &&
    Array.isArray(patch.checkpointSaveCandidates) && patch.checkpointSaveCandidates.length === 0 &&
    Array.isArray(patch.deferredCheckpointSaveCandidates) && patch.deferredCheckpointSaveCandidates.length === 0 &&
    typeof reply.result.savedSceneId === 'string' && typeof reply.result.savedRuntimeStateHash === 'string' && /^[a-f0-9]{64}$/.test(reply.result.savedRuntimeStateHash) &&
    typeof reply.result.artifactHash === 'string' && /^[a-f0-9]{64}$/.test(reply.result.artifactHash);
  } catch { return false; }
}

export async function runForegroundSessionTask(task:ForegroundSessionTask,signal:AbortSignal,timeoutMs=5000):Promise<ForegroundSessionResult> {
  return executeSessionTask(task, signal, timeoutMs);
}

async function executeSessionTask(task:ForegroundSessionTask,signal:AbortSignal,timeoutMs=5000,pool?:SessionWorkerPool):Promise<ForegroundSessionResult> {
  signal.throwIfAborted();
  const fallback=()=>{diagnostics.fallback++;publish();signal.throwIfAborted();try{return executeForegroundSessionTask(task);}catch{throw new ForegroundSessionError("Session validation failed");}};
  if(typeof Worker==="undefined")return fallback();
  let connection:SessionWorkerConnection|null;
  try{connection=pool ? pool.acquire() : oneShotSessionWorker("world-player-session");}
  catch{return fallback();}
  if(connection===null)return fallback();
  const worker=connection.worker;
  diagnostics.started++;diagnostics.active++;diagnostics.peakActive=Math.max(diagnostics.peakActive,diagnostics.active);publish();
  const id=++serial;
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(action:()=>void,reuse=false)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener("abort",abort);worker.onmessage=worker.onerror=worker.onmessageerror=null;if(reuse)connection.release();else connection.discard();diagnostics.active--;publish();action();};
    const fail=()=>finish(()=>{diagnostics.failed++;publish();reject(new ForegroundSessionError("Session background validation failed"));});
    const abort=()=>finish(()=>{diagnostics.cancelled++;publish();reject(signal.reason);});
    const timer=setTimeout(fail,timeoutMs);
    worker.onerror=event=>{event.preventDefault();fail();};worker.onmessageerror=fail;
    worker.onmessage=({data}:MessageEvent)=>{
      if(settled || data?.id!==id)return;
      try {
        const decoded=decodeHistoryResult(data.result);
        if(!validReply(task,decoded)){fail();return;}
        const result=applyForegroundSessionWorkerResult(task,decoded);finish(()=>{diagnostics.completed++;publish();resolve(result);},true);
      } catch { fail(); }
    };
    signal.addEventListener("abort",abort,{once:true});if(signal.aborted){abort();return;}
    try{worker.postMessage({id,task:encodeForegroundSessionInput(foregroundSessionWorkerTask(task))});}catch{fail();}
  });
}

/** One foreground computation at a time, independent from the single recovery
 * computation. Cancel the old generation, including queued work, without
 * pretending that an already-started store transaction can be cancelled.
 */
export class ForegroundSessionRunner {
  private tail:Promise<unknown>=Promise.resolve();
  private controller=new AbortController();
  private pool=new SessionWorkerPool("world-player-session");
  active=true;
  resume(){this.active=true;}
  releaseIdle(){this.pool.releaseIdle();}
  cancelPending(){this.active=false;this.controller.abort();this.controller=new AbortController();this.pool.releaseIdle();}
  async run<T extends ForegroundSessionTask>(task:T, externalSignal?: AbortSignal):Promise<Extract<ForegroundSessionResult,{kind:T["kind"]}>>{
    if(!this.active)throw new DOMException("Session scope closed","AbortError");
    const owner=this.controller.signal, linked=externalSignal === undefined ? undefined : new AbortController();
    const cancelOwner=()=>linked?.abort(owner.reason), cancelExternal=()=>linked?.abort(externalSignal?.reason);
    if(linked){owner.addEventListener('abort',cancelOwner,{once:true});externalSignal!.addEventListener('abort',cancelExternal,{once:true});if(owner.aborted)cancelOwner();if(externalSignal!.aborted)cancelExternal();}
    const signal=linked?.signal??owner;
    try {
      const pending=this.tail.then(()=>executeSessionTask(task,signal,5000,this.pool));this.tail=pending.then(()=>undefined,()=>undefined);
      const result=await pending;signal.throwIfAborted();return result as Extract<ForegroundSessionResult,{kind:T["kind"]}>;
    } finally {if(linked){owner.removeEventListener('abort',cancelOwner);externalSignal!.removeEventListener('abort',cancelExternal);}}
  }
}

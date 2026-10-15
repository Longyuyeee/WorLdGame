import workerSource from "virtual:world-recovery-worker";
import { executeForegroundSessionTask,type ForegroundSessionTask,type ForegroundSessionResult } from "./foreground-session-task";

export class ForegroundSessionError extends Error { override readonly name="ForegroundSessionError"; }
let serial=0;
const diagnostics={active:0,peakActive:0,started:0,completed:0,cancelled:0,fallback:0,failed:0};
const publish=()=>{if(typeof document!=="undefined")document.documentElement.dataset.foregroundSerializer=JSON.stringify(diagnostics);};
function validReply(task:ForegroundSessionTask,value:unknown):value is ForegroundSessionResult {
  try {
  if(!value||typeof value!=="object")return false;
  const reply=value as ForegroundSessionResult;if(reply.kind!==task.kind||!reply.result||typeof reply.result.ok!=="boolean")return false;
  if(reply.kind==="save")return reply.result.ok===true&&typeof reply.result.serialized==="string"&&reply.result.serialized.length>0&&reply.result.serialized.length<=64*1024*1024&&typeof reply.result.artifactHash==="string"&&/^[a-f0-9]{64}$/.test(reply.result.artifactHash);
  if(!reply.result.ok)return Array.isArray(reply.result.diagnostics)&&reply.result.diagnostics.length>0&&reply.result.diagnostics.every(item=>typeof item.code==="string");
  return task.kind==="load"&&reply.result.state?.projectId===task.state.projectId&&reply.result.state?.artifacts?.manifest.buildId===task.state.artifacts?.manifest.buildId&&reply.result.state.runtimeState!=null&&reply.result.state.historySession!=null&&typeof reply.result.artifactHash==="string"&&/^[a-f0-9]{64}$/.test(reply.result.artifactHash);
  } catch { return false; }
}

export async function runForegroundSessionTask(task:ForegroundSessionTask,signal:AbortSignal,timeoutMs=5000):Promise<ForegroundSessionResult> {
  signal.throwIfAborted();
  const fallback=()=>{diagnostics.fallback++;publish();signal.throwIfAborted();try{return executeForegroundSessionTask(task);}catch{throw new ForegroundSessionError("Session validation failed");}};
  if(typeof Worker==="undefined")return fallback();
  let worker:Worker,url:string|undefined;
  try{url=URL.createObjectURL(new Blob([workerSource],{type:"text/javascript"}));worker=new Worker(url,{name:"world-player-session"});}
  catch{if(url!==undefined)URL.revokeObjectURL(url);return fallback();}
  diagnostics.started++;diagnostics.active++;diagnostics.peakActive=Math.max(diagnostics.peakActive,diagnostics.active);publish();
  const id=++serial;
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(action:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener("abort",abort);worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();URL.revokeObjectURL(url!);diagnostics.active--;publish();action();};
    const fail=()=>finish(()=>{diagnostics.failed++;publish();reject(new ForegroundSessionError("Session background validation failed"));});
    const abort=()=>finish(()=>{diagnostics.cancelled++;publish();reject(signal.reason);});
    const timer=setTimeout(fail,timeoutMs);
    worker.onerror=event=>{event.preventDefault();fail();};worker.onmessageerror=fail;
    worker.onmessage=({data}:MessageEvent)=>{if(data?.id!==id)return;if(!validReply(task,data.result)){fail();return;}finish(()=>{diagnostics.completed++;publish();resolve(data.result as ForegroundSessionResult);});};
    signal.addEventListener("abort",abort,{once:true});if(signal.aborted){abort();return;}
    try{worker.postMessage({id,task});}catch{fail();}
  });
}

/** One foreground computation at a time, independent from the single recovery
 * computation. Cancel the old generation, including queued work, without
 * pretending that an already-started store transaction can be cancelled.
 */
export class ForegroundSessionRunner {
  private tail:Promise<unknown>=Promise.resolve();
  private controller=new AbortController();
  active=true;
  resume(){this.active=true;}
  cancelPending(){this.active=false;this.controller.abort();this.controller=new AbortController();}
  async run<T extends ForegroundSessionTask>(task:T):Promise<Extract<ForegroundSessionResult,{kind:T["kind"]}>>{
    if(!this.active)throw new DOMException("Session scope closed","AbortError");
    const signal=this.controller.signal;
    const pending=this.tail.then(()=>runForegroundSessionTask(task,signal));this.tail=pending.then(()=>undefined,()=>undefined);
    const result=await pending;signal.throwIfAborted();return result as Extract<ForegroundSessionResult,{kind:T["kind"]}>;
  }
}

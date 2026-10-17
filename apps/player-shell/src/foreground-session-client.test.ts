import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createPlayerCore,startPlayerCore,createPlayerCoreSessionSaveV1,advancePlayerCore} from "@world-studio/player-core";
import {loadProject,migrateS0Project} from "@world-studio/project-domain";
import {ForegroundSessionError,ForegroundSessionRunner,runForegroundSessionTask} from "./foreground-session-client";
import {executeForegroundSessionTask, executeForegroundSessionWorkerTask, foregroundSessionWorkerTask, type ForegroundSessionTask} from "./foreground-session-task";
vi.mock("virtual:world-recovery-worker",()=>({default:"self.onmessage=()=>{}"}));
const factory=vi.hoisted(()=>vi.fn());
beforeEach(()=>{factory.mockReset();vi.stubGlobal("Worker",function(){return factory();});vi.stubGlobal("URL",{createObjectURL:vi.fn(()=>"blob:session"),revokeObjectURL:vi.fn()});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(){const project=loadProject(migrateS0Project({schemaVersion:0,id:"foreground",title:"Foreground",entrySceneId:"story",characters:[],scenes:[{id:"story",title:"Story",statements:[{id:"line",kind:"narration",textId:"text",text:"中文😀"},{id:"end",kind:"end",endingName:"Done"}]}]}).files),state=startPlayerCore(createPlayerCore(project),project),saved=createPlayerCoreSessionSaveV1(state);if(!saved.ok)throw Error("fixture");return {state,saved};}
function task(kind:"save"|"load"|"protect"):ForegroundSessionTask{if(kind==='protect'){const project=loadProject(migrateS0Project({schemaVersion:0,id:'protect_client',title:'Protection',entrySceneId:'main',characters:[],scenes:[{id:'main',title:'Main',statements:[...Array.from({length:5},(_,index)=>({id:`line_${index}`,kind:'narration' as const,textId:`text_${index}`,text:`Line ${index}`})),{id:'end',kind:'end',endingName:'Done'}]}]}).files);let state=startPlayerCore(createPlayerCore(project),project);for(let i=0;i<3;i++)state=advancePlayerCore(state);return{kind,state,retainedBackSteps:1};}const{state,saved}=fixture();return kind==="save"?{kind,source:state}:{kind,state,serialized:saved.serialized};}
function setup(){const worker={onmessage:null as ((value:MessageEvent)=>void)|null,onerror:null as ((value:ErrorEvent)=>void)|null,onmessageerror:null as (()=>void)|null,postMessage:vi.fn(),terminate:vi.fn()};factory.mockReturnValue(worker);return{worker,reply:(result:unknown,id=worker.postMessage.mock.calls.at(-1)![0].id)=>worker.onmessage?.({data:{id,result}} as MessageEvent)};}
it.each(["save","load","protect"] as const)("uses exactly the public %s validator and releases Worker/URL",async kind=>{const t=task(kind),test=setup(),pending=runForegroundSessionTask(t,new AbortController().signal),expected=executeForegroundSessionTask(t);test.reply(executeForegroundSessionWorkerTask(foregroundSessionWorkerTask(t)));expect(await pending).toEqual(expected);expect(test.worker.terminate).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:session");});
it('omits the current history and unrelated catalogs in load messages, preserving owner references on return', async () => {
  const t = task('load'); if (t.kind !== 'load') throw Error('fixture');
  const test = setup(); test.worker.postMessage.mockImplementation(message => { structuredClone(message); });
  const pending = runForegroundSessionTask(t, new AbortController().signal), sent = structuredClone(test.worker.postMessage.mock.calls[0]![0]);
  expect(sent.task.state).toBeUndefined();
  expect(sent.task.source.historySession).toBeUndefined(); expect(sent.task.source.runtimeState).toBeUndefined(); expect(sent.task.source.hostState).toBeUndefined();
  expect(Object.keys(sent.task.source.artifacts).sort()).toEqual(['catalogs', 'manifest', 'story']);
  expect(Object.keys(sent.task.source.artifacts.catalogs)).toEqual(['replay']);
  const wireReply = executeForegroundSessionWorkerTask(sent.task);
  expect(wireReply.kind === 'load' && wireReply.result.ok && Object.keys(wireReply.result.patch)).not.toContain('artifacts');
  test.reply(structuredClone(wireReply)); const actual = await pending, expected = executeForegroundSessionTask(t);
  expect(actual).toEqual(expected); if (actual.kind !== 'load' || !actual.result.ok) throw Error('load');
  expect(actual.result.state.artifacts).toBe(t.state.artifacts);
  expect(actual.result.state.localization).toBe(t.state.localization);
  expect(actual.result.state.historyPolicy).toBe(t.state.historyPolicy);
  expect(actual.result.state.compatibleSaveBuildIds).toBe(t.state.compatibleSaveBuildIds);
});
it.each(['project', 'build', 'cursor', 'truncated', 'playback', 'checkpoint'] as const)('rejects malformed load patches: %s', async kind => {
  const t = task('load'), reply = executeForegroundSessionWorkerTask(foregroundSessionWorkerTask(t));
  if (reply.kind !== 'load' || !reply.result.ok) throw Error('fixture');
  const result = structuredClone(reply.result), patch = result.patch;
  if (kind === 'project') Object.assign(patch.runtimeState!, { projectId: 'foreign' });
  if (kind === 'build') Object.assign(result, { savedBuildId: 'unverified' });
  if (kind === 'cursor') Object.assign(patch.historySession!, { cursor: 999 });
  if (kind === 'truncated') Object.assign(patch.historySession!, { checkpoints: [] });
  if (kind === 'playback') Object.assign(patch.playback, { mode: 'skipAll' });
  if (kind === 'checkpoint') Object.assign(patch, { deferredCheckpointSaveCandidates: [{}] });
  const test = setup(), pending = runForegroundSessionTask(t, new AbortController().signal), caught = expect(pending).rejects.toBeInstanceOf(ForegroundSessionError);
  test.reply({ kind: 'load', result }); await caught; expect(test.worker.terminate).toHaveBeenCalledOnce();
});
it("sends only required save inputs without changing complete save bytes", async () => {
  const t = task("save"); if (t.kind !== "save") throw Error("fixture");
  const test = setup(); test.worker.postMessage.mockImplementation(message => { structuredClone(message); });
  const input = { ...t, source: { ...t.source, artifacts: { ...t.source.artifacts!, unusedCatalog: () => {} } } };
  const pending = runForegroundSessionTask(input, new AbortController().signal);
  const sent = test.worker.postMessage.mock.calls[0]![0];
  expect(Object.keys(sent.task.source).sort()).toEqual(["artifacts", "historySession", "replaySession", "runtimeState"]);
  expect(Object.keys(sent.task.source.artifacts)).toEqual(["story"]);
  const expected = executeForegroundSessionTask(t);
  test.reply(executeForegroundSessionTask(structuredClone(sent.task)));
  expect(await pending).toEqual(expected);
});
it("retains proper rejection diagnostics for a corrupt saved session",async()=>{const t=task("load");if(t.kind!=="load")throw Error();const changed={...t,serialized:t.serialized.replace('"schemaVersion":1','"schemaVersion":999')+'x'},test=setup(),pending=runForegroundSessionTask(changed,new AbortController().signal),expected=executeForegroundSessionTask(changed);expect(expected.result.ok).toBe(false);test.reply(expected);expect(await pending).toEqual(expected);});
it("does not skip a mutated old checkpoint after a previous successful save",()=>{const t=task("save");if(t.kind!=="save")throw Error();executeForegroundSessionTask(t);const copy=structuredClone(t);(copy.source.historySession!.checkpoints[0]!.state as {buildId:string}).buildId="wrong";expect(()=>executeForegroundSessionTask(copy)).toThrow();});
it.each([null,{kind:"wrong",result:{ok:true}},{kind:"load",result:{ok:false,diagnostics:[]}},{kind:"load",result:{ok:false,diagnostics:[null]}},{kind:"load",result:{ok:true,state:{projectId:"foreground",artifacts:{}},artifactHash:"a".repeat(64)}},{kind:"load",result:{ok:true,state:{},artifactHash:"a".repeat(64)}}])("fails closed for malformed load output %j",async value=>{const test=setup(),pending=runForegroundSessionTask(task("load"),new AbortController().signal),caught=expect(pending).rejects.toBeInstanceOf(ForegroundSessionError);test.reply(value);await caught;expect(test.worker.terminate).toHaveBeenCalledOnce();});
it("ignores a foreign response ID",async()=>{const t=task("save"),test=setup(),pending=runForegroundSessionTask(t,new AbortController().signal);test.reply(executeForegroundSessionTask(t),-1);expect(test.worker.terminate).not.toHaveBeenCalled();test.reply(executeForegroundSessionTask(t));await pending;});
it("does not start an already cancelled computation",async()=>{const controller=new AbortController();controller.abort();await expect(runForegroundSessionTask(task("save"),controller.signal)).rejects.toMatchObject({name:"AbortError"});expect(factory).not.toHaveBeenCalled();});
it("cancels, terminates and ignores a captured late reply",async()=>{const t=task("load"),test=setup(),controller=new AbortController(),pending=runForegroundSessionTask(t,controller.signal),late=test.worker.onmessage!;const caught=expect(pending).rejects.toMatchObject({name:"AbortError"});controller.abort();await caught;late({data:{id:test.worker.postMessage.mock.calls[0]![0].id,result:executeForegroundSessionTask(t)}} as MessageEvent);expect(test.worker.terminate).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalledOnce();});
it.each(["error","messageerror","postMessage","timeout"])("releases all owned resources on %s",async kind=>{vi.useFakeTimers();const test=setup();if(kind==="postMessage")test.worker.postMessage.mockImplementation(()=>{throw Error("clone");});const pending=runForegroundSessionTask(task("save"),new AbortController().signal,10),caught=expect(pending).rejects.toBeInstanceOf(ForegroundSessionError);if(kind==="error")test.worker.onerror!({preventDefault(){}} as ErrorEvent);if(kind==="messageerror")test.worker.onmessageerror!();if(kind==="timeout")await vi.advanceTimersByTimeAsync(11);await caught;expect(test.worker.terminate).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);});
it.each(["unavailable","construction"])("preserves fully validating save/load/protection compatibility when Worker is %s",async mode=>{if(mode==="unavailable")vi.stubGlobal("Worker",undefined);else factory.mockImplementation(()=>{throw Error("CSP");});for(const kind of ["save","load","protect"] as const){const t=task(kind);expect(await runForegroundSessionTask(t,new AbortController().signal)).toEqual(executeForegroundSessionTask(t));}});

it.each(['cursor','state-hash','artifact-type','playback'] as const)('rejects a malformed protection proposal: %s', async kind => {
  const t=task('protect'), expected=executeForegroundSessionTask(t);if(expected.kind!=='protect')throw Error('fixture');
  const result=kind==='cursor'?{...expected.result,historySession:{...expected.result.historySession,cursor:99}}:kind==='state-hash'?{...expected.result,historySession:{...expected.result.historySession,checkpoints:expected.result.historySession.checkpoints.map(value=>({...value,stateHash:'0'.repeat(64)}))}}:kind==='artifact-type'?{...expected.result,artifactHash:[expected.result.artifactHash]}:{...expected.result,playback:{...expected.result.playback,mode:'invalid'}};
  const test=setup(),pending=runForegroundSessionTask(t,new AbortController().signal),rejected=expect(pending).rejects.toBeInstanceOf(ForegroundSessionError);test.reply({kind:'protect',result});await rejected;expect(test.worker.terminate).toHaveBeenCalledOnce();
});
it("serializes foreground work, cancels queued generations and can resume after effect replay",async()=>{const t=task("save"),test=setup(),runner=new ForegroundSessionRunner(),first=runner.run(t),second=runner.run(t);const rejected1=expect(first).rejects.toMatchObject({name:"AbortError"}),rejected2=expect(second).rejects.toMatchObject({name:"AbortError"});await Promise.resolve();expect(factory).toHaveBeenCalledOnce();runner.cancelPending();await Promise.all([rejected1,rejected2]);expect(factory).toHaveBeenCalledOnce();await expect(runner.run(t)).rejects.toMatchObject({name:"AbortError"});runner.resume();const third=runner.run(t);await Promise.resolve();test.reply(executeForegroundSessionTask(t));await third;expect(factory).toHaveBeenCalledTimes(2);runner.cancelPending();});
it("does not retain the last large successful session in the idle queue tail",async()=>{const t=task("save"),test=setup(),runner=new ForegroundSessionRunner(),pending=runner.run(t);await Promise.resolve();test.reply(executeForegroundSessionTask(t));await pending;expect(await(runner as unknown as {tail:Promise<unknown>}).tail).toBeUndefined();runner.cancelPending();});
it('cancels only a queued load without posting it or aborting a preceding save', async () => {
  const saved = task('save'), test = setup(), runner = new ForegroundSessionRunner(), controller = new AbortController();
  const first = runner.run(saved); await Promise.resolve();
  const read = runner.run(task('load'), controller.signal), rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); expect(test.worker.terminate).not.toHaveBeenCalled();
  test.reply(executeForegroundSessionTask(saved)); await first; await rejected;
  expect(test.worker.postMessage).toHaveBeenCalledOnce();
  const next = runner.run(saved); await Promise.resolve(); test.reply(executeForegroundSessionTask(saved)); await next;
  expect(test.worker.postMessage).toHaveBeenCalledTimes(2); runner.cancelPending();
});

it('executes a complete ordinary advance on the owned worker and transports only execution fields back', async () => {
  const { state } = fixture(), t = { kind: 'advance' as const, state }, test = setup();
  const pending = runForegroundSessionTask(t, new AbortController().signal);
  const sent = structuredClone(test.worker.postMessage.mock.calls[0]![0]), reply = executeForegroundSessionWorkerTask(sent.task);
  expect(reply.kind).toBe('advance'); if (reply.kind !== 'advance' || !reply.result.ok) throw Error('fixture');
  expect(reply.result.patch).not.toHaveProperty('artifacts'); expect(reply.result.patch).not.toHaveProperty('localization');
  test.reply(structuredClone(reply)); const actual = await pending;
  if (actual.kind !== 'advance' || !actual.result.ok) throw Error('advance');
  expect({ ...state, ...actual.result.patch }).toEqual(advancePlayerCore(state));
  expect(test.worker.terminate).toHaveBeenCalledOnce();
});
it.each(['source', 'project', 'build', 'cursor', 'truncated', 'revision', 'nonfinite', 'playback', 'owner', 'missing'] as const)('rejects malformed advance patches: %s', async kind => {
  const { state } = fixture(), t = { kind: 'advance' as const, state }, reply = executeForegroundSessionWorkerTask(foregroundSessionWorkerTask(t));
  if (reply.kind !== 'advance' || !reply.result.ok) throw Error('fixture');
  const result = structuredClone(reply.result), patch = result.patch;
  if (kind === 'source') Object.assign(result, { sourceHash: '0'.repeat(64) });
  if (kind === 'project') Object.assign(patch.runtimeState!, { projectId: 'foreign' });
  if (kind === 'build') Object.assign(patch.historySession!, { buildId: 'foreign' });
  if (kind === 'cursor') Object.assign(patch.historySession!, { cursor: 999 });
  if (kind === 'truncated') Object.assign(patch.historySession!, { checkpoints: [] });
  if (kind === 'revision') Object.assign(patch.runtimeState!, { stateRevision: state.runtimeState!.stateRevision });
  if (kind === 'nonfinite') Object.assign(patch.runtimeState!, { stateRevision: Infinity });
  if (kind === 'playback') Object.assign(patch.playback, { mode: 'skipAll' });
  if (kind === 'owner') Object.assign(patch, { artifacts: state.artifacts });
  if (kind === 'missing') delete (patch as unknown as Record<string, unknown>).hostState;
  const test = setup(), pending = runForegroundSessionTask(t, new AbortController().signal), rejected = expect(pending).rejects.toBeInstanceOf(ForegroundSessionError);
  test.reply({ kind: 'advance', result }); await rejected; expect(test.worker.terminate).toHaveBeenCalledOnce();
});
it('cancels a single advance without cancelling the following explicit save or retaining signal listeners', async () => {
  const { state } = fixture(), test = setup(), runner = new ForegroundSessionRunner(), controller = new AbortController();
  const add = vi.spyOn(controller.signal, 'addEventListener'), remove = vi.spyOn(controller.signal, 'removeEventListener');
  const first = runner.run({ kind: 'advance', state }, controller.signal), rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const next = runner.run({ kind: 'save', source: state }); await Promise.resolve();
  const late = test.worker.onmessage!, id = test.worker.postMessage.mock.calls[0]![0].id;
  controller.abort(); await rejected; await Promise.resolve(); await Promise.resolve();
  const latest = test.worker.onmessage; late({ data: { id, result: executeForegroundSessionTask({ kind: 'advance', state }) } } as MessageEvent);
  expect(test.worker.onmessage).toBe(latest);
  test.reply(executeForegroundSessionTask({ kind: 'save', source: state })); expect((await next).result.ok).toBe(true);
  expect(add).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce(); runner.cancelPending();
});

it('does not terminate an active save when a queued advance alone is cancelled', async () => {
  const { state } = fixture(), test = setup(), runner = new ForegroundSessionRunner(), controller = new AbortController();
  const saving = runner.run({ kind: 'save', source: state });
  const advancing = runner.run({ kind: 'advance', state }, controller.signal), rejected = expect(advancing).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve(); controller.abort(); expect(test.worker.terminate).not.toHaveBeenCalled();
  expect(test.worker.postMessage).toHaveBeenCalledOnce(); test.reply(executeForegroundSessionTask({ kind: 'save', source: state }));
  expect((await saving).result.ok).toBe(true); await rejected;
  expect(test.worker.terminate).not.toHaveBeenCalled(); expect(test.worker.postMessage).toHaveBeenCalledOnce(); runner.cancelPending();
});

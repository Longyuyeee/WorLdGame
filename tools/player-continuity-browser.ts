import { loadProject, migrateS0Project, type S0Project } from "../packages/project-domain/src/index";
import { withProjectSettings } from "../packages/gal-settings/src/index";
import { mountWorldPlayerV1 } from "../apps/player-shell/src/mount-player";
import { nativeAtlasDiagnostics } from "../apps/player-shell/src/native-atlas";
import css from "../apps/player-shell/src/player-shell.css?inline";

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function check(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
async function until(test:()=>boolean,label="operation"){for(let i=0;i<300;i++){if(test())return;await pause(25);}throw Error(`Continuity ${label} timed out: ${JSON.stringify({...main().dataset,text:text()})}`);}
const main=()=>document.querySelector<HTMLElement>("main")!;
const hash=()=>main().dataset.runtimeStateHash;
const text=()=>document.querySelector(".player-dialogue__text")?.textContent??"";
function click(name:string){const button=[...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.getAttribute("aria-label")===name||b.textContent?.includes(name));check(button&&!button.disabled,`Unavailable action: ${name}`);button.click();}

/** Real production Player/clock; controlled visibility boundary, not OS suspension or real artwork. */
export function start(options:{pressure?:boolean;sourceKind?:"data"|"blob"}={}){
  const style=document.createElement("style");style.textContent=css;document.head.append(style);
  const ownedUrls:string[]=[];
  const mediaAssets=Array.from({length:4},(_,i)=>{
    const size=options.pressure?2048:256;
    const canvas=document.createElement("canvas");canvas.width=canvas.height=size;
    const context=canvas.getContext("2d")!;context.fillStyle=["#254663","#634425","#426325","#63254d"][i]!;context.fillRect(0,0,size,size);
    context.fillStyle="white";context.font="36px sans-serif";context.fillText(`Scene ${i}`,24,128);
    let url=canvas.toDataURL();canvas.width=canvas.height=0;
    if(options.sourceKind==="blob"){
      const bytes=Uint8Array.from(atob(url.slice(url.indexOf(",")+1)),char=>char.charCodeAt(0));
      url=URL.createObjectURL(new Blob([bytes],{type:"image/png"}));ownedUrls.push(url);
    }
    return {assetId:`picture_${i}`,displayName:`Scene ${i}`,mimeType:"image/png",canvasSampling:true,url};
  });
  const source:S0Project={schemaVersion:0,id:"continuity_soak",title:"连续播放验收",entrySceneId:"scene_0",characters:[],scenes:Array.from({length:12},(_,scene):S0Project["scenes"][number]=>({
    id:`scene_${scene}`,title:`Scene ${scene}`,statements:[
      {id:`background_${scene}`,kind:"direction",command:"background",summary:`asset=picture_${scene%4} action=set duration=0ms effectPolicy=pure`},
      ...Array.from({length:6},(_,line)=>({id:`line_${scene}_${line}`,kind:"narration" as const,textId:`text_${scene}_${line}`,text:`S${scene} L${line}`})),
      ...(scene===11?[{id:"the_end",kind:"end" as const,endingName:"Continuity complete"}]:[{id:`choice_${scene}`,kind:"choice" as const,prompt:`Boundary ${scene}`,options:[{id:`next_${scene}`,label:`进入场景 ${scene+1}`,targetSceneId:`scene_${scene+1}`}]}])
  ]}))};
  const migrated=loadProject(migrateS0Project(source).files);
  const project={...migrated,assets:{...migrated.assets,assets:mediaAssets.map(({assetId,displayName,mimeType})=>({assetId,displayName,mimeType}))},settings:withProjectSettings(migrated.settings,{text:{revealMode:"instant"}})};
  const handle=mountWorldPlayerV1(document.getElementById("player-root")!,{project,mediaAssets});
  let visibility:DocumentVisibilityState="visible";
  Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>visibility});
  const setVisibility=(next:DocumentVisibilityState)=>{visibility=next;document.dispatchEvent(new Event("visibilitychange"));};
  const rows:unknown[]=[];
  let freezes=0,resumes=0;
  const frozenEvent=()=>{freezes++;},resumedEvent=()=>{resumes++;};
  document.addEventListener("freeze",frozenEvent);document.addEventListener("resume",resumedEvent);
  const prepareFreeze=async()=>{
    setVisibility("visible");
    await until(()=>main().dataset.hostActivity==="active");
    click("自动播放");await until(()=>main().dataset.autoPlayback==="waiting");
    delete (document as unknown as Record<string,unknown>).visibilityState;
    return {hash:hash(),text:text(),freezes,resumes};
  };
  const finishFreeze=async(before:{hash:string;text:string;freezes:number;resumes:number})=>{
    await until(()=>freezes>before.freezes&&resumes>before.resumes,"real lifecycle events");
    check(hash()===before.hash&&text()===before.text,"Freeze resumed past the current dialogue");
    const resumedVisibility=document.visibilityState;
    if(resumedVisibility==="hidden")check(main().dataset.hostActivity==="suspended","Hidden resume unexpectedly activated Player");
    Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>visibility});
    setVisibility("visible");
    await until(()=>main().dataset.hostActivity==="active","active after freeze");
    await pause(200);check(hash()===before.hash,"Expired Auto delay fired immediately after resume");
    click("自动播放");
    return {freezeEvents:freezes-before.freezes,resumeEvents:resumes-before.resumes,resumedVisibility,foreground:"controlled-visibility",held:true,freshDelay:true};
  };
  const begin=async()=>{await until(()=>![...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent?.includes("开始故事"))?.disabled,"startup recovery scan");click("开始故事");await until(()=>text()==="S0 L0"&&main().dataset.stageImagesPending==="false");};
  const scene=async(round:number,index:number)=>{
    await until(()=>text()===`S${index} L0`&&main().dataset.stageImagesPending==="false");
    const automatic=round%2===0;
    if(index===0){
      click("自动播放");click("打开剧情历史");await until(()=>main().dataset.autoPlayback==="suspended");
      const historyHash=hash();window.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true}));await pause(900);check(hash()===historyHash,"History panel advanced story");
      click("关闭剧情历史");await until(()=>main().dataset.autoPlayback==="waiting");
      setVisibility("hidden");await until(()=>main().dataset.hostActivity==="suspended");
      const hiddenHash=hash();handle.setHostActivity("active");await pause(900);check(hash()===hiddenHash,"Hidden page advanced story");check(handle.getObservation().hostActivity==="suspended","Host overrode visibility");
      setVisibility("visible");await until(()=>main().dataset.hostActivity==="active");await pause(200);check(hash()===hiddenHash,"Resume skipped full delay");
      await until(()=>hash()!==hiddenHash);click("自动播放");
      const forwardHash=hash();click("后退一步");await until(()=>hash()!==forwardHash);click("前进一步");await until(()=>hash()===forwardHash);
      click("自动播放");click("存读档");await until(()=>main().dataset.autoPlayback==="suspended");
      const saveHash=hash(),saveText=text(),saveCursor=main().dataset.historyCursor;await pause(900);check(hash()===saveHash,"Save panel advanced story");
      click("快速保存");await until(()=>main().dataset.saveOperation==="saved","quick save");
      click("存读档");click("自动播放");await pause(25);click("继续下一句");await until(()=>hash()!==saveHash,"advance after save");
      click("快速读取");await until(()=>main().dataset.saveOperation==="loaded","quick load");
      // Load intentionally merges current MetaProgress; exact whole-state hash need not match.
      check(text()===saveText&&main().dataset.historyCursor===saveCursor,"Quick load changed saved story position");
      rows.push({round,historyHeld:true,backgroundHeld:true,fullDelay:true,historyRoundTrip:true,quickSaveRestored:true});
    }
    click(automatic?"自动播放":"快进全部");
    await until(()=>main().dataset.playerStatus===(index===11?"ended":"waiting-choice"),`round ${round} scene ${index} boundary`);
    await until(()=>main().dataset.skipActive==="false","Skip stop at boundary");
    const boundaryHash=hash();await pause(100);check(hash()===boundaryHash,"Boundary advanced without user choice");
    const memory=nativeAtlasDiagnostics();check(memory.accountedBytes<=memory.budgetBytes,"Canvas budget exceeded");
    rows.push({round,scene:index,mode:automatic?"auto":"skipAll",boundaryHeld:true,historyLength:Number(main().dataset.historyLength),native:memory,imageDecodeModes:[...document.querySelectorAll<HTMLCanvasElement>('canvas[data-image-decode]')].map(canvas=>canvas.dataset.imageDecode)});
    if(index!==11){click(`进入场景 ${index+1}`);}else {click("回到标题");await until(()=>nativeAtlasDiagnostics().accountedBytes===0);}
  };
  const close=()=>{handle.unmount();ownedUrls.splice(0).forEach(url=>URL.revokeObjectURL(url));document.removeEventListener("freeze",frozenEvent);document.removeEventListener("resume",resumedEvent);delete (document as unknown as Record<string,unknown>).visibilityState;style.remove();return {rows,native:nativeAtlasDiagnostics(),scope:options.pressure?"12-scene-2048px-CDP-freeze-pressure-not-physical-low-memory-device":"12-scene-production-player-controlled-visibility-synthetic-PNG-not-device-soak"};};
  const protect = async () => {
    const beforeHash=hash(),before=Number(main().dataset.historyLength);
    handle.notifyMemoryPressure("critical");
    await until(()=>handle.getObservation().memoryPressure==="protected"&&Number(main().dataset.historyLength)<before&&Number(main().dataset.historyArchives)>0,"durable memory protection");
    check(hash()===beforeHash,"Memory protection changed current story");
    const after=Number(main().dataset.historyLength);
    check(after<before&&Number(main().dataset.historyArchives)>0,"Memory protection did not archive old checkpoints");
    click("知道了");
    return {before,after,stateHeld:true,archived:true};
  };
  return {begin,scene,close,prepareFreeze,finishFreeze,protect};
}

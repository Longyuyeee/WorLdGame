import { webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { IDBFactory } from "fake-indexeddb";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { createPlayerCore, startPlayerCore, selectPlayerCoreChoice, createPlayerCoreSnapshotV1, createPlayerCoreSessionSaveV1, type PlayerCoreState } from "@world-studio/player-core";
import source from "../../../fixtures/projects/branching/project.s0.json";
import { PlayerShell } from "./PlayerShell";
import { createWorldPlayerSaveSlotV3, IndexedDbWorldPlayerSaveStoreV3 } from "./player-save-store";
import { createPlayerSaveBackup, PLAYER_SAVE_BACKUP_MAX_BYTES } from "./player-save-backup";

beforeEach(() => { vi.stubGlobal("crypto",webcrypto); vi.stubGlobal("Blob",NodeBlob); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture(version="1.0.0") {
  const base=loadProject(migrateS0Project(source as S0Project).files), project={...base,manifest:{...base.manifest,preservedFields:{...base.manifest.preservedFields,
    webPublication:{schemaVersion:1,name:base.manifest.title,version,iconAssetId:""}}}};
  return {project,state:startPlayerCore(createPlayerCore(project),project)};
}
function slot(state:PlayerCoreState,id="quick-1",savedAt=1000) {
  const created=createPlayerCoreSessionSaveV1(state);if(!created.ok)throw Error("fixture");const snapshot=createPlayerCoreSnapshotV1(state);
  return createWorldPlayerSaveSlotV3({kind:id.startsWith("manual")?"manual":"quick",slotId:id,projectId:state.projectId,buildId:state.runtimeState!.buildId,savedAtEpochMilliseconds:savedAt,
    title:state.title,chapterId:null,chapterTitle:null,sceneId:state.runtimeState!.cursor.sceneId,sceneTitle:state.runtimeState!.cursor.sceneId,route:null,customMetadata:{},preview:{status:"unavailable",reason:"capture-unavailable"},
    presentationKind:snapshot.presentation.kind,runtimeStateHash:snapshot.runtimeStateHash!,sessionArtifactHash:created.artifactHash,serializedSessionSave:created.serialized,checkpointStepId:null});
}
function file(bytes:Uint8Array<ArrayBuffer>) {
  const value=new File([bytes],"progress.worldsave",{type:"application/json"});Object.defineProperty(value,"arrayBuffer",{value:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});return value;
}
async function backupPage() { fireEvent.click(screen.getByRole("button",{name:"读取存档"}));fireEvent.click(screen.getByRole("button",{name:"备份"})); }
function chooseFile(value:File) {fireEvent.change(screen.getByLabelText("选择存档备份文件"),{target:{files:[value]}});}

it("previews before writing, cancels without changes, confirms occupied import and reads only on explicit request",async()=>{
  const data=fixture(),store=new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory(),webcrypto.subtle as SubtleCrypto),incoming=slot(data.state);
  const original=slot(selectPlayerCoreChoice(data.state,"branch_left_option"),"manual-2",2000);await store.write(original);await store.write(incoming);
  const archive=file(await createPlayerSaveBackup(incoming));const view=render(<PlayerShell project={data.project} saveStore={store}/>);await backupPage();chooseFile(archive);
  await screen.findByText("备份校验通过，请选择手动槽位后导入。");expect(screen.getByLabelText("导入到手动槽位")).toHaveValue("manual-1");
  expect(await store.read(data.state.projectId,"manual-1")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"取消导入"}));
  expect(await store.read(data.state.projectId,"manual-2")).toEqual(original);
  chooseFile(archive);await screen.findByText("备份校验通过，请选择手动槽位后导入。");fireEvent.change(screen.getByLabelText("导入到手动槽位"),{target:{value:"manual-2"}});
  fireEvent.click(screen.getByRole("button",{name:"导入到所选槽位"}));expect(screen.getByRole("region",{name:"确认覆盖目标存档"})).toBeVisible();
  expect(await store.read(data.state.projectId,"manual-2")).toEqual(original);fireEvent.click(screen.getByRole("button",{name:"确认覆盖并导入"}));
  await screen.findByRole("button",{name:"读取导入的存档"});expect(view.container.querySelector("main")).toHaveAttribute("data-player-status","title");
  expect((await store.read(data.state.projectId,"manual-2"))!.serializedSessionSave).toBe(incoming.serializedSessionSave);expect(await store.read(data.state.projectId,"quick-1")).toEqual(incoming);
  fireEvent.click(screen.getByRole("button",{name:"读取导入的存档"}));await waitFor(()=>expect(view.container.querySelector("main")).toHaveAttribute("data-runtime-state-hash",incoming.runtimeStateHash));
});
it("rejects unverified versions, corrupted files and oversized files without touching target slots or story",async()=>{
  const previous=fixture(),current=fixture("1.0.1"),store=new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory(),webcrypto.subtle as SubtleCrypto),original=slot(previous.state);await store.write(original);
  const view=render(<PlayerShell project={current.project} saveStore={store}/>);await backupPage();chooseFile(file(await createPlayerSaveBackup(original)));
  expect(await screen.findByRole("alert")).toHaveTextContent("未核对的游戏版本");chooseFile(file(new TextEncoder().encode("invalid")));
  expect(await screen.findByRole("alert")).toHaveTextContent("无法读取备份文件");const oversized=file(new Uint8Array());Object.defineProperty(oversized,"size",{value:PLAYER_SAVE_BACKUP_MAX_BYTES+1});chooseFile(oversized);
  expect(await screen.findByRole("alert")).toHaveTextContent("96 MiB");expect(screen.queryByLabelText("导入到手动槽位")).not.toBeInTheDocument();
  expect(view.container.querySelector("main")).toHaveAttribute("data-player-status","title");expect(await store.read(previous.state.projectId,"quick-1")).toEqual(original);
});
it("exports the current progress without writing a fake manual slot and releases the download URL",async()=>{
  const create=vi.fn<(value: Blob | MediaSource)=>string>(()=>"blob:backup-file"),revoke=vi.fn();vi.stubGlobal("URL",class extends URL {static override createObjectURL=create;static override revokeObjectURL=revoke;});
  vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>undefined);
  const data=fixture(),store=new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory(),webcrypto.subtle as SubtleCrypto),view=render(<PlayerShell project={data.project} saveStore={store}/>);
  fireEvent.click(screen.getByRole("button",{name:/开始故事/}));await waitFor(async()=>expect((await store.list(data.state.projectId)).length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole("button",{name:"存读档"}));fireEvent.click(screen.getByRole("button",{name:"备份"}));
  const before=await store.list(data.state.projectId);fireEvent.click(screen.getByRole("button",{name:"导出备份文件"}));await screen.findByRole("link",{name:"重新下载备份"});
  expect(await store.list(data.state.projectId)).toEqual(before);const blob=create.mock.calls[0]![0] as unknown as Blob;
  const backup=JSON.parse(new TextDecoder().decode(await blob.arrayBuffer()));expect(backup.payload.slot.runtimeStateHash).toBe(view.container.querySelector("main")!.getAttribute("data-runtime-state-hash"));
  view.unmount();expect(revoke).toHaveBeenCalledWith("blob:backup-file");
});

it("does not read a different session if another window replaces the slot after the import succeeded",async()=>{
  const data=fixture(),store=new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory(),webcrypto.subtle as SubtleCrypto),incoming=slot(data.state);
  const view=render(<PlayerShell project={data.project} saveStore={store}/>);await backupPage();chooseFile(file(await createPlayerSaveBackup(incoming)));
  await screen.findByText("备份校验通过，请选择手动槽位后导入。");await waitFor(()=>expect(screen.getByRole('button',{name:'导入到所选槽位'})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"导入到所选槽位"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"读取导入的存档"})).toBeEnabled());
  const replacement=slot(selectPlayerCoreChoice(data.state,"branch_left_option"),"manual-1",3000);await store.write(replacement);
  fireEvent.click(screen.getByRole("button",{name:"读取导入的存档"}));expect(await screen.findByRole("alert")).toHaveTextContent("槽位已经更新");
  expect(view.container.querySelector("main")).toHaveAttribute("data-player-status","title");expect(await store.read(data.state.projectId,"manual-1")).toEqual(replacement);
});

import { webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadProject, migrateS0Project, verifyWebSaveCompatibility, type S0Project } from "@world-studio/project-domain";
import { canonicalRuntimeStringify } from "@world-studio/runtime";
import { createPlayerCore, startPlayerCore, selectPlayerCoreChoice, backPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, loadPlayerCoreSessionSaveV1 } from "@world-studio/player-core";
import source from "../../../fixtures/projects/branching/project.s0.json";
import { createWorldPlayerSaveSlotV3, IndexedDbWorldPlayerSaveStoreV3, worldPlayerSaveSummaryV3 } from "./player-save-store";
import { createPlayerSaveBackup, readPlayerSaveBackup, playerBackupToManualSlot } from "./player-save-backup";

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("Blob", NodeBlob); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const subtle = webcrypto.subtle as SubtleCrypto;
export function backupFixture(version = "1.0.0") {
  const base = loadProject(migrateS0Project(source as S0Project).files);
  const project = { ...base, manifest: { ...base.manifest, preservedFields: { ...base.manifest.preservedFields,
    webPublication: { schemaVersion: 1, name: base.manifest.title, version, iconAssetId: "" } } } };
  let state = startPlayerCore(createPlayerCore(project), project);
  state = selectPlayerCoreChoice(state, "branch_left_option"); state = selectPlayerCoreChoice(backPlayerCore(state), "branch_right_option");
  const save = createPlayerCoreSessionSaveV1(state); if (!save.ok) throw Error("fixture"); const snapshot = createPlayerCoreSnapshotV1(state);
  const slot = createWorldPlayerSaveSlotV3({ kind: "quick", slotId: "quick-1", projectId: project.manifest.projectId, buildId: state.runtimeState!.buildId,
    savedAtEpochMilliseconds: 1000, title: snapshot.title, chapterId: null, chapterTitle: null, sceneId: state.runtimeState!.cursor.sceneId, sceneTitle: "Right Ending",
    route: null, customMetadata: {}, preview: { status: "unavailable", reason: "capture-unavailable" }, presentationKind: snapshot.presentation.kind,
    runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: save.artifactHash, serializedSessionSave: save.serialized, checkpointStepId: null });
  return { project, state, slot };
}
async function reseal(value: { payload: unknown; sha256: string }) {
  value.sha256 = Array.from(new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(canonicalRuntimeStringify(value.payload)))), byte => byte.toString(16).padStart(2, "0")).join("");
  return new TextEncoder().encode(JSON.stringify(value));
}

it("moves exact session bytes, full branch archives and screenshot into a separate manual slot", async () => {
  const fixture = backupFixture();
  const imageBytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII="), byte => byte.charCodeAt(0));
  const imageHash = Array.from(new Uint8Array(await subtle.digest("SHA-256", imageBytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  const slot = createWorldPlayerSaveSlotV3({ ...fixture.slot, preview: { status: "available", mimeType: "image/png", width: 1, height: 1, byteLength: imageBytes.length, sha256: imageHash } });
  const bytes = await createPlayerSaveBackup(slot, new Blob([imageBytes], { type: "image/png" }));
  const read = await readPlayerSaveBackup(bytes, createPlayerCore(fixture.project));
  expect(read.slot).toEqual(slot); expect(new Uint8Array(await read.preview!.arrayBuffer())).toEqual(imageBytes);
  const manual = playerBackupToManualSlot(read, "manual-12");
  expect(manual.kind).toBe("manual"); expect(manual.serializedSessionSave).toBe(slot.serializedSessionSave);
  const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(fixture.project), manual.serializedSessionSave);
  expect(loaded.ok).toBe(true); if (loaded.ok) expect(loaded.state.historySession).toEqual(fixture.state.historySession);
  expect(fixture.state.historySession!.archives.length).toBeGreaterThan(0);
});
it("exports earlier version bytes but imports them only into a verified compatible work", async () => {
  const previous = backupFixture(), current = backupFixture("1.0.1"), bytes = await createPlayerSaveBackup(previous.slot);
  await expect(readPlayerSaveBackup(bytes, createPlayerCore(current.project))).rejects.toThrow("未核对");
  const verified = verifyWebSaveCompatibility(current.project, previous.project);
  expect((await readPlayerSaveBackup(bytes, createPlayerCore(verified))).compatibility).toBe("verified-previous");
  const other = { ...current.project, manifest: { ...current.project.manifest, projectId: "other" } };
  await expect(readPlayerSaveBackup(bytes, createPlayerCore(other))).rejects.toThrow("其他作品");
});
it("rejects corrupted bytes, future envelopes, forged metadata and runtime tampering even after outer resealing", async () => {
  const fixture = backupFixture(), target = createPlayerCore(fixture.project), original = await createPlayerSaveBackup(fixture.slot);
  const value = JSON.parse(new TextDecoder().decode(original)); value.payload.slot.sceneTitle += "changed";
  await expect(readPlayerSaveBackup(new TextEncoder().encode(JSON.stringify(value)), target)).rejects.toThrow("文件校验失败");
  const future = JSON.parse(new TextDecoder().decode(original)); future.schemaVersion = 2;
  await expect(readPlayerSaveBackup(new TextEncoder().encode(JSON.stringify(future)), target)).rejects.toThrow("格式或版本");
  const metadata = JSON.parse(new TextDecoder().decode(original)); metadata.payload.slot.runtimeStateHash = "0".repeat(64);
  await expect(readPlayerSaveBackup(await reseal(metadata), target)).rejects.toThrow("信息与完整进度不一致");
  const runtime = JSON.parse(new TextDecoder().decode(original)), session = JSON.parse(runtime.payload.slot.serializedSessionSave); session.historyHash = "0".repeat(64);
  runtime.payload.slot.serializedSessionSave = canonicalRuntimeStringify(session);
  await expect(readPlayerSaveBackup(await reseal(runtime), target)).rejects.toThrow("完整进度校验失败");
  const unknown = JSON.parse(new TextDecoder().decode(original)); unknown.payload.slot.unknown = true;
  await expect(readPlayerSaveBackup(await reseal(unknown), target)).rejects.toThrow("字段损坏");
  expect(target.runtimeState).toBeNull();
});
it("rejects missing, mismatched or oversized screenshot headers before storing or decoding images", async () => {
  const fixture = backupFixture(), slot = createWorldPlayerSaveSlotV3({ ...fixture.slot, preview: { status: "available", mimeType: "image/png", width: 1, height: 1, byteLength: 33, sha256: "0".repeat(64) } });
  await expect(createPlayerSaveBackup(slot)).rejects.toThrow("截图缺失");
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]); new DataView(bytes.buffer).setUint32(8,13); bytes.set(new TextEncoder().encode("IHDR"),12);
  new DataView(bytes.buffer).setUint32(16,16384); new DataView(bytes.buffer).setUint32(20,16384);
  await expect(createPlayerSaveBackup(slot,new Blob([bytes],{type:"image/png"}))).rejects.toThrow();
});
it("atomically protects empty and confirmed targets across two independent IndexedDB adapters", async () => {
  const fixture = backupFixture(), factory = new IDBFactory(), first = new IndexedDbWorldPlayerSaveStoreV3(factory, subtle), second = new IndexedDbWorldPlayerSaveStoreV3(factory, subtle);
  const a = createWorldPlayerSaveSlotV3({ ...fixture.slot, kind: "manual", slotId: "manual-1" }), b = createWorldPlayerSaveSlotV3({ ...a, savedAtEpochMilliseconds: 2000 });
  const results = await Promise.all([first.writeIfUnchanged(a,null),second.writeIfUnchanged(b,null)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  const existing = (await first.read(a.projectId,a.slotId))!, expectation = worldPlayerSaveSummaryV3(existing);
  await second.write(b);
  const changed = createWorldPlayerSaveSlotV3({ ...a, savedAtEpochMilliseconds: 3000 });
  // Ensure this is a stale expectation regardless of which first empty write won.
  const stale = { ...expectation, savedAtEpochMilliseconds: 999 };
  expect(await first.writeIfUnchanged(changed,stale)).toBe(false);
  expect(await first.read(a.projectId,a.slotId)).toEqual(b);
  expect(await first.writeIfUnchanged(changed,worldPlayerSaveSummaryV3(b))).toBe(true);
  expect(await second.read(a.projectId,a.slotId)).toEqual(changed);
});
it("aborts the whole transaction if preview writing throws after the slot put was queued", async () => {
  const fixture = backupFixture(), factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory,subtle);
  const original = createWorldPlayerSaveSlotV3({ ...fixture.slot, kind:"manual", slotId:"manual-1" }); await store.write(original);
  const db = await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open("world-player-saves");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const prototype = Object.getPrototypeOf(db.transaction("save-previews").objectStore("save-previews")) as IDBObjectStore, remove = prototype.delete;
  vi.spyOn(prototype,"delete").mockImplementation(function(this:IDBObjectStore,key){ if(this.name==="save-previews")throw new DOMException("quota","QuotaExceededError");return remove.call(this,key); });
  const replacement = createWorldPlayerSaveSlotV3({ ...original,savedAtEpochMilliseconds:2000 });
  await expect(store.writeIfUnchanged(replacement,worldPlayerSaveSummaryV3(original))).rejects.toMatchObject({name:"QuotaExceededError"});
  expect(await store.read(original.projectId,original.slotId)).toEqual(original); db.close();
});

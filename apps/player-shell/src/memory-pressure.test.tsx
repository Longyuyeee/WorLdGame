import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1 } from "@world-studio/player-core";
import { mountWorldPlayerV1, type WorldPlayerHandleV1 } from "./mount-player";
import { createWorldPlayerRecoveryRecordV1, type WorldPlayerRecoveryRecordV1, type WorldPlayerRecoveryStoreV1 } from "./player-recovery-store";
import { executeForegroundSessionTask, type ForegroundSessionTask } from './foreground-session-task';

const handles: WorldPlayerHandleV1[] = [];
const containers: HTMLElement[] = [];
afterEach(() => { vi.useRealTimers(); for (const handle of handles.splice(0)) handle.unmount(); for (const container of containers.splice(0)) container.remove(); vi.unstubAllGlobals(); });
async function setup() {
  const source: S0Project = { schemaVersion: 0, id: "memory_shell", title: "Memory", entrySceneId: "long", characters: [], scenes: [
    { id: "long", title: "Long", statements: [...Array.from({ length: 100 }, (_, n) => ({ id: `line_${n}`, kind: "narration" as const, textId: `text_${n}`, text: `Line ${n}` })), { id: "end", kind: "end", endingName: "Done" }] }
  ] };
  const project = loadProject(migrateS0Project(source).files);
  let state = dispatchPlayerCoreIntentV1(createPlayerCore(project), project, { kind: "primary" });
  for (let i = 0; i < 80; i++) state = dispatchPlayerCoreIntentV1(state, project, { kind: "primary" });
  const snapshot = createPlayerCoreSnapshotV1(state), save = createPlayerCoreSessionSaveV1(state);
  if (!save.ok) throw Error("Cannot seed recovery");
  let record: WorldPlayerRecoveryRecordV1 | null = createWorldPlayerRecoveryRecordV1({ projectId: project.manifest.projectId, buildId: snapshot.identities.buildId!, title: snapshot.title,
    savedAtEpochMilliseconds: 1000, sceneId: "long", presentationKind: "narration", runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: save.artifactHash, serializedSessionSave: save.serialized });
  let write: () => Promise<void> = async () => {};
  const store: WorldPlayerRecoveryStoreV1 = { version: "1.0.0", backend: "memory-test", read: async () => record, clear: async () => { record = null; }, write: vi.fn(async value => { await write(); record = value; }) };
  const release = vi.fn();
  const container = document.createElement("div"); document.body.append(container); containers.push(container);
  let handle!: WorldPlayerHandleV1;
  act(() => { handle = mountWorldPlayerV1(container, { project, recoveryStore: store, onReleaseIdleResources: release }); }); handles.push(handle);
  await waitFor(() => expect(within(container).getByRole("button", { name: "恢复上次进度" })).toBeDefined());
  fireEvent.click(within(container).getByRole("button", { name: "恢复上次进度" }));
  await waitFor(() => expect(container.querySelector("main")!.dataset.playerStatus).toBe("presenting"));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return { handle, container, project, store, release, setWrite: (callback: () => Promise<void>) => { write = callback; } };
}

it("protects before shrinking, preserves the current line, coalesces pressure and exposes readonly history", async () => {
  const test = await setup(); let finish!: () => void;
  test.setWrite(() => new Promise(resolve => { finish = resolve; }));
  const before = test.container.querySelector("main")!.dataset.runtimeStateHash;
  act(() => { test.handle.notifyMemoryPressure("critical"); test.handle.notifyMemoryPressure("critical"); });
  await waitFor(() => expect(test.handle.getObservation().memoryPressure).toBe("protecting"));
  expect(test.container.querySelector("main")!.dataset.historyArchives).toBe("0");
  await act(async () => { finish(); });
  await waitFor(() => expect(test.handle.getObservation().memoryPressure).toBe("protected"));
  expect(test.container.querySelector("main")!.dataset.runtimeStateHash).toBe(before);
  expect(test.container.querySelector("main")!.dataset.historyArchives).toBe("1");
  expect(test.release).toHaveBeenCalledTimes(1);
  fireEvent.click(within(test.container).getByRole("button", { name: "打开剧情历史" }));
  expect(within(test.container).getByRole("heading", { name: "归档记录 1" })).toBeDefined();
  expect(test.container.querySelector('.player-memory-pressure')).toBeNull();
  fireEvent.click(within(within(test.container).getByRole('dialog', { name: '剧情历史' })).getByRole('button', { name: '关闭剧情历史' }));
  expect(test.container.querySelector('.player-memory-pressure')).not.toBeNull();
});

it("keeps rollback on write failure and allows the player to retry", async () => {
  const test = await setup(); test.setWrite(async () => { throw Error("disk full"); });
  act(() => test.handle.notifyMemoryPressure("critical"));
  await waitFor(() => expect(test.handle.getObservation().memoryPressure).toBe("error"));
  expect(test.container.querySelector("main")!.dataset.historyArchives).toBe("0");
  test.setWrite(async () => {});
  fireEvent.click(within(test.container).getByRole("button", { name: "重试内存保护" }));
  await waitFor(() => expect(test.handle.getObservation().memoryPressure).toBe("protected"));
});

it("does not shrink a changed story state after a delayed save", async () => {
  const test = await setup(); let finish!: () => void;
  test.setWrite(() => new Promise(resolve => { finish = resolve; }));
  act(() => test.handle.notifyMemoryPressure("critical"));
  await waitFor(() => expect(test.handle.getObservation().memoryPressure).toBe("protecting"));
  const before = test.container.querySelector("main")!.dataset.runtimeStateHash;
  fireEvent.click(within(test.container).getByRole("button", { name: "继续下一句" }));
  if (test.container.querySelector("main")!.dataset.runtimeStateHash === before) fireEvent.click(within(test.container).getByRole("button", { name: "继续下一句" }));
  expect(test.container.querySelector("main")!.dataset.runtimeStateHash).not.toBe(before);
  const latestHash = test.container.querySelector("main")!.dataset.runtimeStateHash;
  test.setWrite(async () => {});
  await act(async () => { finish(); });
  await waitFor(() => expect(test.handle.getObservation().memoryPressure).toBe("deferred"));
  expect(test.container.querySelector("main")!.dataset.historyArchives).toBe("0");
  await waitFor(async () => expect((await test.store.read(test.project.manifest.projectId))?.runtimeStateHash).toBe(latestHash));
});

it("times out safely, ignores late completion, and rejects pressure after unmount", async () => {
  const test = await setup(); let finish!: () => void;
  test.setWrite(() => new Promise(resolve => { finish = resolve; }));
  vi.useFakeTimers();
  await act(async () => { test.handle.notifyMemoryPressure("critical"); });
  await act(async () => { await vi.advanceTimersByTimeAsync(8001); });
  expect(test.handle.getObservation().memoryPressure).toBe("error");
  const writes = vi.mocked(test.store.write).mock.calls.length;
  await act(async () => { fireEvent.click(within(test.container).getByRole("button", { name: "重试内存保护" })); });
  expect(vi.mocked(test.store.write).mock.calls.length).toBe(writes);
  await act(async () => { finish(); });
  expect(test.container.querySelector("main")!.dataset.historyArchives).toBe("0");
  act(() => test.handle.unmount());
  expect(() => test.handle.notifyMemoryPressure("critical")).toThrow("DISPOSED");
});

it("invalidates an old request when changing projects", async () => {
  const test = await setup(); let finish!: () => void;
  test.setWrite(() => new Promise(resolve => { finish = resolve; }));
  act(() => test.handle.notifyMemoryPressure("critical"));
  await waitFor(() => expect(test.handle.getObservation().memoryPressure).toBe("protecting"));
  act(() => test.handle.setProject({ ...test.project }));
  await act(async () => { finish(); });
  expect(test.handle.getObservation().memoryPressure).toBe("idle");
});

it("supports a suspended host without resuming it, and does not notify another mounted player", async () => {
  const first = await setup(), second = await setup();
  act(() => { first.handle.setHostActivity("suspended"); first.handle.notifyMemoryPressure("critical"); });
  await waitFor(() => expect(first.handle.getObservation().memoryPressure).toBe("protected"));
  expect(first.handle.getObservation().hostActivity).toBe("suspended");
  expect(second.handle.getObservation().memoryPressure).toBe("idle");
  expect(second.release).not.toHaveBeenCalled();
});

it("does not compact below the moderate window and validates notification values", async () => {
  const test = await setup();
  act(() => test.handle.notifyMemoryPressure("moderate"));
  expect(test.handle.getObservation().memoryPressure).toBe("released");
  expect(test.container.querySelector("main")!.dataset.historyArchives).toBe("0");
  expect(() => test.handle.notifyMemoryPressure("invalid" as "critical")).toThrow("INVALID");
});

it("does not remove history when the resource owner fails to release", async () => {
  const test = await setup(); test.release.mockImplementation(() => { throw Error("owner failed"); });
  act(() => test.handle.notifyMemoryPressure("critical"));
  expect(test.handle.getObservation().memoryPressure).toBe("error");
  expect(test.container.querySelector("main")!.dataset.historyArchives).toBe("0");
});

it("ignores a saved protection result after unmount", async () => {
  const test = await setup(); let finish!: () => void;
  test.setWrite(() => new Promise(resolve => { finish = resolve; }));
  act(() => test.handle.notifyMemoryPressure("critical"));
  await waitFor(() => expect(test.handle.getObservation().memoryPressure).toBe("protecting"));
  act(() => test.handle.unmount());
  await act(async () => { finish(); });
  expect(test.container.querySelector("main")).toBeNull();
});

function delayedProtectionWorker() {
  const worker = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null, onmessageerror: null,
    postMessage: vi.fn<(message: { id: number; task: ForegroundSessionTask }) => void>(), terminate: vi.fn() };
  const revoke = vi.fn(), ParentURL = URL;
  vi.stubGlobal('URL', class extends ParentURL { static override createObjectURL = vi.fn(() => 'blob:protection'); static override revokeObjectURL = revoke; });
  vi.stubGlobal('Worker', function() { return worker; });
  return { worker, revoke, request() { const message = worker.postMessage.mock.calls[0]![0]; if (message.task.kind !== 'protect') throw Error('Expected protection worker'); return message; } };
}

it('does not write an old proposal when reading advances during background preparation', async () => {
  const test = await setup(), delayed = delayedProtectionWorker(), writes = vi.mocked(test.store.write).mock.calls.length;
  act(() => test.handle.notifyMemoryPressure('critical'));
  await waitFor(() => expect(delayed.worker.postMessage).toHaveBeenCalledOnce());
  const request = delayed.request(), reply = delayed.worker.onmessage!;
  const before = test.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(within(test.container).getByRole('button', { name: '继续下一句' }));
  if (test.container.querySelector('main')!.dataset.runtimeStateHash === before) fireEvent.click(within(test.container).getByRole('button', { name: '继续下一句' }));
  expect(test.container.querySelector('main')!.dataset.runtimeStateHash).not.toBe(before);
  await act(async () => { reply({ data: { id: request.id, result: executeForegroundSessionTask(request.task) } } as MessageEvent); });
  expect(test.handle.getObservation().memoryPressure).toBe('deferred');
  expect(vi.mocked(test.store.write).mock.calls.length).toBe(writes);
  expect(test.container.querySelector('main')!.dataset.historyArchives).toBe('0');
});

it.each(['timeout', 'unmount'] as const)('terminates background preparation on %s and ignores late success', async reason => {
  const test = await setup(), delayed = delayedProtectionWorker(), writes = vi.mocked(test.store.write).mock.calls.length;
  if (reason === 'timeout') vi.useFakeTimers();
  act(() => test.handle.notifyMemoryPressure('critical'));
  const request = delayed.request(), late = delayed.worker.onmessage!;
  if (reason === 'unmount') act(() => test.handle.unmount());
  else await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(delayed.worker.terminate).toHaveBeenCalledOnce(); expect(delayed.revoke).toHaveBeenCalledOnce();
  await act(async () => { late({ data: { id: request.id, result: executeForegroundSessionTask(request.task) } } as MessageEvent); });
  expect(vi.mocked(test.store.write).mock.calls.length).toBe(writes);
  if (reason === 'timeout') expect(test.handle.getObservation().memoryPressure).toBe('error');
  else expect(test.container.querySelector('main')).toBeNull();
});

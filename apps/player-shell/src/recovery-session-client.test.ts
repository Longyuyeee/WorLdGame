import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPlayerCore, createPlayerCoreSessionSaveV1, dispatchPlayerCoreIntentV1 } from "@world-studio/player-core";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { RecoverySessionError, serializeRecoverySession } from "./recovery-session-client";
import { createRecoverySession } from "./recovery-session-task";

const factory = vi.hoisted(() => vi.fn());
vi.mock("virtual:world-recovery-worker", () => ({ default: "self.onmessage = () => {};" }));
function source() {
  const raw: S0Project = { schemaVersion: 0, id: "worker_save", title: "Worker save", entrySceneId: "start", characters: [], scenes: [{ id: "start", title: "Start", statements: [{ id: "line", kind: "narration", textId: "text", text: "中文😀é" }, { id: "end", kind: "end", endingName: "Done" }] }] };
  const project = loadProject(migrateS0Project(raw).files);
  return dispatchPlayerCoreIntentV1(createPlayerCore(project), project, { kind: "primary" });
}
function setup() {
  const worker = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null as ((event: ErrorEvent) => void) | null, onmessageerror: null as (() => void) | null, postMessage: vi.fn(), terminate: vi.fn() };
  factory.mockReturnValue(worker);
  return { worker, reply: (data: unknown) => worker.onmessage?.({ data } as MessageEvent), message: () => worker.postMessage.mock.calls[0]![0] as { id: number } };
}
beforeEach(() => {
  factory.mockReset(); vi.stubGlobal("Worker", function () { return factory(); });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:owned-worker"), revokeObjectURL: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("uses the fully validating core serializer and preserves exact bytes/hash", async () => {
  const state = source(), expected = createPlayerCoreSessionSaveV1(state), test = setup();
  const pending = serializeRecoverySession(state, new AbortController().signal);
  expect(test.worker.postMessage).toHaveBeenCalledOnce();
  const task = test.worker.postMessage.mock.calls[0]![0] as { id: number; source: typeof state };
  test.reply({ id: task.id, result: createRecoverySession(structuredClone(task.source)) });
  expect(await pending).toEqual(expected); expect(test.worker.terminate).toHaveBeenCalledOnce();
  expect(test.worker.onmessage).toBeNull(); expect(test.worker.onerror).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:owned-worker");
});

it("rejects a previously saved source with a subsequently mutated old checkpoint", () => {
  const state = source(); createRecoverySession(state);
  const changed = structuredClone(state), checkpoint = changed.historySession!.checkpoints[0]!;
  (checkpoint.state as { buildId: string }).buildId = "tampered";
  expect(() => createRecoverySession(changed)).toThrow("INVALID");
});

it("does not start a worker for an already cancelled task", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(serializeRecoverySession(source(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(factory).not.toHaveBeenCalled();
});

it("terminates cancellation and ignores a captured late response", async () => {
  const test = setup(), state = source(), controller = new AbortController();
  const pending = serializeRecoverySession(state, controller.signal), late = test.worker.onmessage!;
  const checked = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); await checked;
  late({ data: { id: test.message().id, result: createRecoverySession(state) } } as MessageEvent);
  expect(test.worker.terminate).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:owned-worker");
});

it("ignores a foreign request ID, then accepts only the matching result", async () => {
  const test = setup(), state = source(), pending = serializeRecoverySession(state, new AbortController().signal);
  test.reply({ id: test.message().id + 1, result: createRecoverySession(state) });
  expect(test.worker.terminate).not.toHaveBeenCalled();
  test.reply({ id: test.message().id, result: createRecoverySession(state) }); await pending;
});

it.each([{ ok: true, serialized: "", artifactHash: "bad" }, { ok: false }, null])("rejects malformed/failed worker output: %j", async result => {
  const test = setup(), pending = serializeRecoverySession(source(), new AbortController().signal);
  const checked = expect(pending).rejects.toBeInstanceOf(RecoverySessionError);
  test.reply({ id: test.message().id, result }); await checked; expect(test.worker.terminate).toHaveBeenCalledOnce();
});

it.each(["error", "messageerror", "postMessage"])("fails closed and releases resources on %s", async kind => {
  const test = setup();
  if (kind === "postMessage") test.worker.postMessage.mockImplementation(() => { throw new DOMException("clone", "DataCloneError"); });
  const pending = serializeRecoverySession(source(), new AbortController().signal), checked = expect(pending).rejects.toBeInstanceOf(RecoverySessionError);
  if (kind === "error") test.worker.onerror!({ preventDefault() {} } as ErrorEvent);
  if (kind === "messageerror") test.worker.onmessageerror!();
  await checked; expect(test.worker.terminate).toHaveBeenCalledOnce();
});

it("terminates a timed-out computation instead of keeping a hidden queue", async () => {
  vi.useFakeTimers(); const test = setup(), pending = serializeRecoverySession(source(), new AbortController().signal, 100);
  const checked = expect(pending).rejects.toBeInstanceOf(RecoverySessionError);
  await vi.advanceTimersByTimeAsync(101); await checked; expect(test.worker.terminate).toHaveBeenCalledOnce();
});

it.each(["unavailable", "construction"])("preserves strict main-thread compatibility when worker is %s", async kind => {
  if (kind === "unavailable") vi.stubGlobal("Worker", undefined);
  else factory.mockImplementation(() => { throw new Error("CSP"); });
  const state = source(); expect(await serializeRecoverySession(state, new AbortController().signal)).toEqual(createPlayerCoreSessionSaveV1(state));
  if (kind === "construction") expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:owned-worker");
});

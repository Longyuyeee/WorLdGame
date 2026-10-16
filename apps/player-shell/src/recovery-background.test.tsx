import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { withProjectSettings } from "@world-studio/gal-settings";
import { PlayerShell } from "./PlayerShell";
import { RecoverySessionError, serializeRecoverySession } from "./recovery-session-client";
import { createRecoverySession, type RecoverySessionSource, type RecoverySessionResult } from "./recovery-session-task";
import type { WorldPlayerRecoveryRecordV1, WorldPlayerRecoveryStoreV1 } from "./player-recovery-store";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbWorldPlayerSaveStoreV3 } from "./player-save-store";
vi.mock("./recovery-session-client", async original => {
  const actual = await original<typeof import("./recovery-session-client")>(), serialize = vi.fn<typeof actual.serializeRecoverySession>();
  return { ...actual, serializeRecoverySession: serialize, RecoverySessionRunner: class {
    releaseIdle() {}
    run(source: RecoverySessionSource, signal: AbortSignal) { return serialize(source, signal); }
  } };
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function project(id = "background_recovery") {
  const source: S0Project = { schemaVersion: 0, id, title: "Background recovery", entrySceneId: "long", characters: [], scenes: [{ id: "long", title: "Long", statements: [...Array.from({ length: 200 }, (_, i) => ({ id: `line_${i}`, kind: "narration" as const, textId: `text_${i}`, text: `Line ${i}` })), { id: "end", kind: "end", endingName: "Done" }] }] };
  const value = loadProject(migrateS0Project(source).files);
  return { ...value, settings: withProjectSettings(value.settings, { text: { revealMode: "instant" } }) };
}
async function setup(withSaveStore = false) {
  const jobs: { source: RecoverySessionSource; signal: AbortSignal; finish: () => void; fail: () => void }[] = [];
  vi.mocked(serializeRecoverySession).mockImplementation((source, signal) => new Promise<RecoverySessionResult>((resolve, reject) => {
    // Deliberately allow a late response after abort to exercise the shell's
    // independent generation guard, not just the client's terminate behavior.
    jobs.push({ source, signal, finish: () => resolve(createRecoverySession(source)), fail: () => reject(new RecoverySessionError("failed")) });
  }));
  let saved: WorldPlayerRecoveryRecordV1 | null = null;
  const write = vi.fn(async (record: WorldPlayerRecoveryRecordV1) => { saved = record; });
  const store: WorldPlayerRecoveryStoreV1 = { version: "1.0.0", backend: "test", read: async () => saved, write, clear: async () => { saved = null; } };
  const value = project(), saveProps = withSaveStore ? { saveStore: new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()) } : {};
  const view = render(<PlayerShell project={value} recoveryStore={store} {...saveProps} />);
  await waitFor(() => expect(view.container.querySelector("main")!.dataset.recoveryOperation).toBe("idle"));
  fireEvent.click(view.getByRole("button", { name: "开始故事" }));
  await waitFor(() => expect(jobs).toHaveLength(1));
  return { ...view, jobs, store, write, saved: () => saved, project: value };
}

it("keeps one background validation during 100 steps, then captures only the newest state", async () => {
  const test = await setup();
  for (let i = 0; i < 100; i++) fireEvent.click(test.getByRole("button", { name: "继续下一句" }));
  const hash = test.container.querySelector("main")!.dataset.runtimeStateHash;
  expect(test.jobs).toHaveLength(1); expect(test.write).not.toHaveBeenCalled();
  await act(async () => test.jobs[0]!.finish());
  await waitFor(() => expect(test.jobs).toHaveLength(2));
  const latest = test.jobs[1]!.source.historySession!;
  expect(latest.checkpoints[latest.cursor]!.stateHash).toBe(hash);
  await act(async () => test.jobs[1]!.finish());
  await waitFor(() => expect(test.write).toHaveBeenCalledTimes(2));
  expect(test.saved()!.runtimeStateHash).toBe(hash); expect(test.jobs).toHaveLength(2);
});

it("cancels an unmounted shell and does not persist a late response", async () => {
  const test = await setup(); test.unmount();
  expect(test.jobs[0]!.signal.aborted).toBe(true);
  await act(async () => test.jobs[0]!.finish());
  expect(test.write).not.toHaveBeenCalled();
});

it("cancels the old project, ignores its late result and schedules the new project", async () => {
  const test = await setup(), next = project("next_recovery");
  test.rerender(<PlayerShell project={next} recoveryStore={test.store} />);
  await waitFor(() => expect(test.container.querySelector("main")!.dataset.recoveryOperation).toBe("idle"));
  expect(test.jobs[0]!.signal.aborted).toBe(true);
  fireEvent.click(test.getByRole("button", { name: "开始故事" }));
  await act(async () => test.jobs[0]!.finish());
  await waitFor(() => expect(test.jobs).toHaveLength(2));
  expect(test.write).not.toHaveBeenCalled();
  expect(test.jobs[1]!.source.runtimeState!.projectId).toBe("next_recovery");
  await act(async () => test.jobs[1]!.finish());
  await waitFor(() => expect(test.saved()!.projectId).toBe("next_recovery"));
});

it("retains the old durable recovery after validation fails and retries only on request", async () => {
  const test = await setup(); await act(async () => test.jobs[0]!.finish());
  const prior = test.saved(); expect(prior).not.toBeNull();
  fireEvent.click(test.getByRole("button", { name: "继续下一句" }));
  await waitFor(() => expect(test.jobs).toHaveLength(2));
  await act(async () => test.jobs[1]!.fail());
  expect(test.getByText(/恢复保护后台校验失败/)).toBeDefined(); expect(test.saved()).toBe(prior);
  expect(test.jobs).toHaveLength(2);
  fireEvent.click(test.getByRole("button", { name: "重试恢复保护" }));
  await waitFor(() => expect(test.jobs).toHaveLength(3));
  await act(async () => test.jobs[2]!.finish());
  await waitFor(() => expect(test.saved()).not.toBe(prior));
});

it("an explicit quick load supersedes a background result without replacing the loaded progress", async () => {
  const test = await setup(true);
  await act(async () => test.jobs[0]!.finish());
  fireEvent.click(test.getByRole("button", { name: "打开阅读菜单" }));
  fireEvent.click(test.getByRole("button", { name: "快速保存" }));
  await waitFor(() => expect(test.container.querySelector("main")!.dataset.saveOperation).toBe("saved"));
  fireEvent.click(test.getByRole("button", { name: "返回故事" }));
  fireEvent.click(test.getByRole("button", { name: "继续下一句" }));
  await waitFor(() => expect(test.jobs).toHaveLength(2));
  fireEvent.click(test.getByRole("button", { name: "打开阅读菜单" }));
  fireEvent.click(test.getByRole("button", { name: "快速读取" }));
  await waitFor(() => expect(test.getByRole("button", { name: "确认读取" })).toBeDefined());
  fireEvent.click(test.getByRole("button", { name: "确认读取" }));
  await waitFor(() => expect(test.container.querySelector("main")!.dataset.saveOperation).toBe("loaded"));
  // Read markers are monotonic across loading an earlier point. Protect the
  // actual loaded state, not the pre-read save's older Meta Progress hash.
  const loadedHash = test.container.querySelector("main")!.dataset.runtimeStateHash;
  expect(test.jobs[1]!.signal.aborted).toBe(true);
  await act(async () => test.jobs[1]!.finish());
  expect(test.container.querySelector("main")!.dataset.runtimeStateHash).toBe(loadedHash);
  await waitFor(() => expect(test.jobs).toHaveLength(3));
  expect(test.write).toHaveBeenCalledOnce();
  await act(async () => test.jobs[2]!.finish());
  await waitFor(() => expect(test.saved()!.runtimeStateHash).toBe(loadedHash));
});

it("reprotects an identical loaded state when its first background save was cancelled", async () => {
  const test = await setup(true), original = test.jobs[0]!.source.historySession!;
  fireEvent.click(test.getByRole("button", { name: "打开阅读菜单" }));
  fireEvent.click(test.getByRole("button", { name: "快速保存" }));
  await waitFor(() => expect(test.container.querySelector("main")!.dataset.saveOperation).toBe("saved"));
  fireEvent.click(test.getByRole("button", { name: "快速读取" }));
  await waitFor(() => expect(test.container.querySelector("main")!.dataset.saveOperation === "loaded" || test.queryByRole("button", { name: "确认读取" }) !== null).toBe(true));
  const confirm = test.queryByRole("button", { name: "确认读取" }); if (confirm) fireEvent.click(confirm);
  await waitFor(() => expect(test.container.querySelector("main")!.dataset.saveOperation).toBe("loaded"));
  const hash = test.container.querySelector("main")!.dataset.runtimeStateHash;
  expect(hash).toBe(original.checkpoints[original.cursor]!.stateHash);
  expect(test.jobs[0]!.signal.aborted).toBe(true);
  await act(async () => test.jobs[0]!.finish());
  expect(test.write).not.toHaveBeenCalled();
  await waitFor(() => expect(test.jobs).toHaveLength(2), { timeout: 1000 });
  await act(async () => test.jobs[1]!.finish());
  await waitFor(() => expect(test.saved()!.runtimeStateHash).toBe(hash));
});

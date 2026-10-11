import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { withProjectSettings } from "@world-studio/gal-settings";
import { PlayerShell } from "./PlayerShell";
import type { WorldPlayerRecoveryRecordV1, WorldPlayerRecoveryStoreV1 } from "./player-recovery-store";

afterEach(() => { cleanup(); vi.useRealTimers(); });
async function setup(fakeClock = false) {
  const source: S0Project = { schemaVersion: 0, id: "backpressure", title: "Long story", entrySceneId: "long", characters: [], scenes: [{
    id: "long", title: "Long", statements: [...Array.from({ length: 300 }, (_, n) => ({ id: `line_${n}`, kind: "narration" as const, textId: `text_${n}`, text: `Line ${n}` })), { id: "end", kind: "end", endingName: "Done" }]
  }] };
  const base = loadProject(migrateS0Project(source).files);
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: "instant" } }) };
  let saved: WorldPlayerRecoveryRecordV1 | null = null;
  let finish!: () => void, reject!: (reason: unknown) => void;
  const write = vi.fn((value: WorldPlayerRecoveryRecordV1) => new Promise<void>((resolve, fail) => {
    finish = () => { saved = value; resolve(); }; reject = fail;
  }));
  const store: WorldPlayerRecoveryStoreV1 = { version: "1.0.0", backend: "delayed", read: async () => saved, clear: async () => { saved = null; }, write };
  const view = render(<PlayerShell project={project} recoveryStore={store} />);
  await waitFor(() => expect(view.container.querySelector("main")!.dataset.recoveryOperation).toBe("idle"));
  if (fakeClock) vi.useFakeTimers();
  await act(async () => fireEvent.click(view.getByRole("button", { name: "开始故事" })));
  expect(write).toHaveBeenCalledTimes(1);
  return { ...view, project, store, write, finish: () => finish(), reject: (error: unknown) => reject(error), saved: () => saved };
}

it("keeps one physical recovery write during 150 story steps and persists only the latest boundary next", async () => {
  const test = await setup();
  const firstHash = test.container.querySelector("main")!.dataset.runtimeStateHash;
  for (let n = 0; n < 150; n++) fireEvent.click(test.getByRole("button", { name: "继续下一句" }));
  const finalHash = test.container.querySelector("main")!.dataset.runtimeStateHash;
  expect(finalHash).not.toBe(firstHash);
  expect(test.write).toHaveBeenCalledTimes(1);
  await act(async () => test.finish());
  await waitFor(() => expect(test.write).toHaveBeenCalledTimes(2));
  expect(test.write.mock.calls[1]![0].runtimeStateHash).toBe(finalHash);
  await act(async () => test.finish());
  expect(test.saved()!.runtimeStateHash).toBe(finalHash);
  expect(test.write).toHaveBeenCalledTimes(2);
  test.unmount();
  const reopened = render(<PlayerShell project={test.project} recoveryStore={test.store} />);
  await waitFor(() => expect(reopened.getByRole("button", { name: "恢复上次进度" })).toBeDefined());
  fireEvent.click(reopened.getByRole("button", { name: "恢复上次进度" }));
  expect(reopened.container.querySelector("main")!.dataset.runtimeStateHash).toBe(finalHash);
});

it("keeps timeout visible until physical settlement and explicit retry saves the current line", async () => {
  const test = await setup(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(8001); });
  expect(test.getByRole("button", { name: "重试恢复保护" })).toBeDisabled();
  fireEvent.click(test.getByRole("button", { name: "继续下一句" }));
  expect(test.write).toHaveBeenCalledTimes(1);
  await act(async () => test.finish());
  expect(test.container.querySelector("main")!.dataset.recoveryOperation).toBe("error");
  expect(test.getByRole("button", { name: "重试恢复保护" })).not.toBeDisabled();
  await act(async () => fireEvent.click(test.getByRole("button", { name: "重试恢复保护" })));
  expect(test.write).toHaveBeenCalledTimes(2);
  await act(async () => test.finish());
  expect(test.saved()!.runtimeStateHash).toBe(test.container.querySelector("main")!.dataset.runtimeStateHash);
});

it("explains quota failure without deleting prior data, and retries after space is available", async () => {
  const test = await setup();
  await act(async () => test.finish());
  const prior = test.saved();
  fireEvent.click(test.getByRole("button", { name: "继续下一句" }));
  await waitFor(() => expect(test.write).toHaveBeenCalledTimes(2));
  await act(async () => test.reject(new DOMException("full", "QuotaExceededError")));
  expect(test.getByText(/设备存储空间不足/)).toBeDefined();
  expect(test.saved()).toBe(prior);
  fireEvent.click(test.getByRole("button", { name: "重试恢复保护" }));
  await waitFor(() => expect(test.write).toHaveBeenCalledTimes(3));
  await act(async () => test.finish());
  expect(test.saved()).not.toBe(prior);
});

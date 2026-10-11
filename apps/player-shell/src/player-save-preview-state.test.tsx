import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlayerSavePreview } from "./PlayerShell";
import type { WorldPlayerSaveStoreV3, WorldPlayerSaveSummaryV3 } from "./player-save-store";
const summary: WorldPlayerSaveSummaryV3 = {
  schemaVersion: 3, format: "world.player-save-slot", slotId: "manual-1", kind: "manual", projectId: "catalog", buildId: "a".repeat(64),
  savedAtEpochMilliseconds: 1, title: "Story", sceneId: "scene", sceneTitle: "First", chapterId: null, chapterTitle: null,
  presentationKind: "narration", runtimeStateHash: "a".repeat(64), sessionArtifactHash: "a".repeat(64), checkpointStepId: null,
  route: null, customMetadata: {}, migratedFromSchemaVersion: null,
  preview: { status: "available", width: 1, height: 1, byteLength: 1, mimeType: "image/png", sha256: "a".repeat(64) }
};
function store(readPreview: WorldPlayerSaveStoreV3["readPreview"]): WorldPlayerSaveStoreV3 {
  return { version: "3.0.0", backend: "preview-test", list: async () => [], read: async () => null, write: async () => {}, readPreview };
}
afterEach(() => vi.unstubAllGlobals());
it.each(["reject", "null"])("shows a failed preview instead of permanent loading (%s)", async mode => {
  render(<PlayerSavePreview projectId="catalog" slot={summary} store={store(async () => { if (mode === "reject") throw Error("broken"); return null; })} />);
  await waitFor(() => expect(screen.getByLabelText("截图读取失败")).toBeTruthy());
  expect(screen.queryByLabelText("截图正在读取")).toBeNull();
});
it("hides and revokes the prior image while a replacement is pending, and ignores late completion after unmount", async () => {
  const revoke = vi.fn(), create = vi.fn(() => "blob:preview");
  vi.stubGlobal("URL", class extends URL { static override createObjectURL = create; static override revokeObjectURL = revoke; });
  let finish!: (value: Blob) => void;
  let calls = 0;
  const adapter = store(async () => ++calls === 1 ? new Blob(["a"]) : new Promise<Blob>(resolve => { finish = resolve; }));
  const view = render(<PlayerSavePreview projectId="catalog" slot={summary} store={adapter} />);
  await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
  view.rerender(<PlayerSavePreview projectId="catalog" slot={{ ...summary, sceneTitle: "Second", savedAtEpochMilliseconds: 2 }} store={adapter} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(revoke).toHaveBeenCalledWith("blob:preview");
  expect(screen.getByLabelText("截图正在读取")).toBeTruthy();
  view.unmount();
  await act(async () => finish(new Blob(["b"])));
  expect(create).toHaveBeenCalledTimes(1);
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { loadProject, migrateS0Project, verifyWebSaveCompatibility, type S0Project } from "@world-studio/project-domain";
import source from "../../../fixtures/projects/branching/project.s0.json";
import { PlayerShell } from "./PlayerShell";
import { createWorldPlayerSaveSlotV3, type WorldPlayerSaveSlotV3, type WorldPlayerSaveStoreV3 } from "./player-save-store";
import { createWorldPlayerRecoveryRecordV1, type WorldPlayerRecoveryRecordV1, type WorldPlayerRecoveryStoreV1 } from "./player-recovery-store";
import { createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1 } from "@world-studio/player-core";

function fixture(version: string) {
  const project = loadProject(migrateS0Project(source as S0Project).files);
  return { ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields,
    webPublication: { schemaVersion: 1, name: project.manifest.title, version, iconAssetId: "" } } },
    scripts: { ...project.scripts, branch_left: { ...project.scripts.branch_left!, statements: [
      { id: "left_checkpoint", kind: "checkpoint" }, ...project.scripts.branch_left!.statements ] } } };
}
function stores() {
  const previous = fixture("1.0.0"), state = startPlayerCore(createPlayerCore(previous), previous), snapshot = createPlayerCoreSnapshotV1(state);
  const created = createPlayerCoreSessionSaveV1(state); if (!created.ok) throw Error("fixture");
  const common = { projectId: previous.manifest.projectId, buildId: state.runtimeState!.buildId, savedAtEpochMilliseconds: 1000,
    title: snapshot.title, sceneId: state.runtimeState!.cursor.sceneId, presentationKind: snapshot.presentation.kind,
    runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: created.artifactHash, serializedSessionSave: created.serialized };
  const original = createWorldPlayerSaveSlotV3({ ...common, slotId: "quick-1", kind: "quick", chapterId: null, chapterTitle: null,
    sceneTitle: "Fork", route: null, customMetadata: {}, preview: { status: "unavailable", reason: "capture-unavailable" }, checkpointStepId: null });
  const rows = new Map<string, WorldPlayerSaveSlotV3>([["quick-1", original]]);
  const save: WorldPlayerSaveStoreV3 = { version: "3.0.0", backend: "memory-test", async list() { return [...rows.values()]; },
    async read(_project, id) { return rows.get(id) ?? null; }, async readPreview() { return null; }, async write(row) { if (row.schemaVersion !== 3) throw Error("legacy"); rows.set(row.slotId, row); } };
  let recovery: WorldPlayerRecoveryRecordV1 | null = createWorldPlayerRecoveryRecordV1(common);
  const recover: WorldPlayerRecoveryStoreV1 = { version: "1.0.0", backend: "memory-test", async read() { return recovery; }, async write(row) { recovery = row; }, async clear() { recovery = null; } };
  return { previous, original, rows, save, recover, getRecovery: () => recovery };
}

it("loads verified old slots, writes checkpoints/manual/recovery with the original identity and resumes after refresh", async () => {
  const data = stores(), current = verifyWebSaveCompatibility(fixture("1.0.1"), data.previous);
  const view = render(<PlayerShell project={current} saveStore={data.save} recoveryStore={data.recover} />);
  await screen.findByText("这份旧版进度已核对兼容，可以继续上次的故事。");
  fireEvent.click(screen.getByRole("button", { name: "读取存档" }));
  let dialog = screen.getByRole("dialog", { name: "存读档槽位" });
  fireEvent.click(within(dialog).getByRole("button", { name: "快速" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "读取" }));
  await screen.findByText("已读取核对过的旧版存档，可以继续故事");
  expect(data.rows.get("quick-1")).toEqual(data.original);
  fireEvent.click(screen.getByRole("button", { name: "Left" }));
  await waitFor(() => expect([...data.rows.values()].some(row => row.kind === "checkpoint")).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "存读档" }));
  dialog = screen.getByRole("dialog", { name: "存读档槽位" });
  fireEvent.click(within(dialog).getByRole("button", { name: "手动" }));
  fireEvent.click(within(dialog).getAllByRole("button", { name: "保存" })[0]!);
  await waitFor(() => expect(data.rows.has("manual-1")).toBe(true));
  expect(data.rows.get("manual-1")!.buildId).toBe(data.original.buildId);
  expect([...data.rows.values()].filter(row => row.kind === "checkpoint").every(row => row.buildId === data.original.buildId)).toBe(true);
  await waitFor(() => expect(data.getRecovery()!.sceneId).toBe("branch_left"));
  expect(data.getRecovery()!.buildId).toBe(data.original.buildId);
  const hash = view.container.querySelector("main")!.getAttribute("data-runtime-state-hash");
  view.unmount(); const refreshed = render(<PlayerShell project={current} saveStore={data.save} recoveryStore={data.recover} />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "恢复上次进度" })[0]).toBeEnabled());
  fireEvent.click(screen.getAllByRole("button", { name: "恢复上次进度" })[0]!);
  await waitFor(() => expect(refreshed.container.querySelector("main")).toHaveAttribute("data-runtime-state-hash", hash));
  expect(data.rows.get("quick-1")).toEqual(data.original);
});

it("keeps an unverified old recovery disabled and a failed explicit read leaves all data and title unchanged", async () => {
  const data = stores(), view = render(<PlayerShell project={fixture("1.0.1")} saveStore={data.save} recoveryStore={data.recover} />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "恢复上次进度" })[0]).toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "读取存档" }));
  const dialog = screen.getByRole("dialog", { name: "存读档槽位" });
  fireEvent.click(within(dialog).getByRole("button", { name: "快速" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "读取" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("尚未核对的游戏版本");
  expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "title");
  expect(data.rows.get("quick-1")).toEqual(data.original);
  expect(data.getRecovery()!.buildId).toBe(data.original.buildId);
});

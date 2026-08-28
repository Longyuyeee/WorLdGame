import { describe, expect, it } from "vitest";
import { createWorldPlayerSaveSlotV2, type WorldPlayerSaveSlotV2, type WorldPlayerSaveStoreV2 } from "./player-save-store";
import { WorldPlayerSaveWriteCoordinatorV1, worldPlayerAutoSaveAllowedV1, worldPlayerSaveSceneIdentityV1 } from "./player-save-policy";

const hash = "a".repeat(64);

function slot(kind: "manual" | "auto" | "quick", slotId: string, sceneId: string, savedAtEpochMilliseconds: number): WorldPlayerSaveSlotV2 {
  return createWorldPlayerSaveSlotV2({
    kind, slotId, projectId: "golden_branching", buildId: hash, savedAtEpochMilliseconds, title: "Branching Golden",
    chapterId: "chapter_main", chapterTitle: "Main", sceneId, sceneTitle: sceneId, route: null, customMetadata: {},
    preview: { status: "unavailable", reason: "capture-unavailable" }, presentationKind: "dialogue", runtimeStateHash: hash,
    sessionArtifactHash: hash, serializedSessionSave: "{}"
  });
}

function memoryStore(records = new Map<string, WorldPlayerSaveSlotV2>()): WorldPlayerSaveStoreV2 {
  return {
    version: "2.0.0", backend: "memory-test",
    async list(projectId) { return [...records.values()].filter((value) => value.projectId === projectId); },
    async read(projectId, slotId) { return records.get(`${projectId}\0${slotId}`) ?? null; },
    async readPreview() { return null; },
    async write(value) { if (value.schemaVersion !== 2) throw new Error("legacy"); records.set(`${value.projectId}\0${value.slotId}`, value); }
  };
}

describe("N52-E3b save policy", () => {
  it("allows only the frozen stable presentable boundaries", () => {
    expect(worldPlayerAutoSaveAllowedV1("presenting", "dialogue")).toBe(true);
    expect(worldPlayerAutoSaveAllowedV1("presenting", "narration")).toBe(true);
    expect(worldPlayerAutoSaveAllowedV1("waiting-choice", "choice")).toBe(true);
    expect(worldPlayerAutoSaveAllowedV1("ended", "ending")).toBe(true);
    expect(worldPlayerAutoSaveAllowedV1("title", "title")).toBe(false);
    expect(worldPlayerAutoSaveAllowedV1("waiting-effect", "effect")).toBe(false);
    expect(worldPlayerAutoSaveAllowedV1("waiting-barrier", "barrier")).toBe(false);
    expect(worldPlayerAutoSaveAllowedV1("error", "error")).toBe(false);
  });

  it("coalesces the newest scene and rotates five automatic slots oldest-first", async () => {
    const records = new Map<string, WorldPlayerSaveSlotV2>();
    const coordinator = new WorldPlayerSaveWriteCoordinatorV1(memoryStore(records));
    let clock = 100;
    const writeScene = (sceneId: string) => coordinator.writeAuto("golden_branching", worldPlayerSaveSceneIdentityV1(hash, sceneId), async (slotId) => {
      records.set(`golden_branching\0${slotId}`, slot("auto", slotId, sceneId, clock++));
    });
    expect(await writeScene("scene-1")).toEqual({ status: "written", slotId: "auto-1" });
    expect(await writeScene("scene-1")).toEqual({ status: "coalesced", slotId: "auto-1" });
    for (let index = 2; index <= 5; index += 1) await writeScene(`scene-${index}`);
    expect(await writeScene("scene-6")).toEqual({ status: "written", slotId: "auto-1" });
    expect(records.get("golden_branching\0auto-1")?.sceneId).toBe("scene-6");
    expect([...records.values()].filter((value) => value.kind === "auto")).toHaveLength(5);
  });

  it("serializes writes, continues after failure, and leaves the prior slot intact", async () => {
    const records = new Map([["golden_branching\0quick-1", slot("quick", "quick-1", "prior", 1)]]);
    const coordinator = new WorldPlayerSaveWriteCoordinatorV1(memoryStore(records));
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const failed = coordinator.writeFixed(async () => { events.push("first-start"); await gate; events.push("first-fail"); throw new Error("disk full"); });
    const succeeded = coordinator.writeFixed(async () => { events.push("second-start"); records.set("golden_branching\0quick-1", slot("quick", "quick-1", "next", 2)); events.push("second-end"); });
    await Promise.resolve();
    expect(events).toEqual(["first-start"]);
    expect(records.get("golden_branching\0quick-1")?.sceneId).toBe("prior");
    release();
    await expect(failed).rejects.toThrow("disk full");
    await succeeded;
    expect(events).toEqual(["first-start", "first-fail", "second-start", "second-end"]);
    expect(records.get("golden_branching\0quick-1")?.sceneId).toBe("next");
  });
});

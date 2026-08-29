import { describe, expect, it } from "vitest";
import { createWorldPlayerSaveSlotV3, type WorldPlayerSaveKindV3, type WorldPlayerSaveSlotV3, type WorldPlayerSaveStoreV3 } from "./player-save-store";
import { createWorldPlayerRecoveryRecordV1, type WorldPlayerRecoveryRecordV1, type WorldPlayerRecoveryStoreV1 } from "./player-recovery-store";
import { WorldPlayerRecoveryWriteCoordinatorV1, WorldPlayerSaveWriteCoordinatorV1, worldPlayerAutoSaveAllowedV1, worldPlayerSaveSceneIdentityV1 } from "./player-save-policy";

const hash = "a".repeat(64);

function slot(kind: WorldPlayerSaveKindV3, slotId: string, sceneId: string, savedAtEpochMilliseconds: number, checkpointStepId: string | null = null): WorldPlayerSaveSlotV3 {
  return createWorldPlayerSaveSlotV3({
    kind, slotId, projectId: "golden_branching", buildId: hash, savedAtEpochMilliseconds, title: "Branching Golden",
    chapterId: "chapter_main", chapterTitle: "Main", sceneId, sceneTitle: sceneId, route: null, customMetadata: {},
    preview: { status: "unavailable", reason: "capture-unavailable" }, presentationKind: "dialogue", runtimeStateHash: hash,
    sessionArtifactHash: hash, serializedSessionSave: "{}", checkpointStepId
  });
}

function memoryStore(records = new Map<string, WorldPlayerSaveSlotV3>()): WorldPlayerSaveStoreV3 {
  return {
    version: "3.0.0", backend: "memory-test",
    async list(projectId) { return [...records.values()].filter((value) => value.projectId === projectId); },
    async read(projectId, slotId) { return records.get(`${projectId}\0${slotId}`) ?? null; },
    async readPreview() { return null; },
    async write(value) { if (value.schemaVersion !== 3) throw new Error("legacy"); records.set(`${value.projectId}\0${value.slotId}`, value); }
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
    const records = new Map<string, WorldPlayerSaveSlotV3>();
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

describe("N52-E3c4 checkpoint save policy", () => {
  it("fills three slots, rotates oldest by timestamp and slot ID, and coalesces the same build and step", async () => {
    const records = new Map<string, WorldPlayerSaveSlotV3>();
    const coordinator = new WorldPlayerSaveWriteCoordinatorV1(memoryStore(records));
    let clock = 100;
    const write = (stepId: string) => coordinator.writeCheckpoint("golden_branching", hash, stepId, async (slotId) => {
      records.set(`golden_branching\0${slotId}`, slot("checkpoint", slotId, `scene-${stepId}`, clock++, stepId));
    });
    expect(await write("step-a")).toEqual({ status: "written", slotId: "checkpoint-1" });
    expect(await write("step-b")).toEqual({ status: "written", slotId: "checkpoint-2" });
    expect(await write("step-c")).toEqual({ status: "written", slotId: "checkpoint-3" });
    expect(await write("step-b")).toEqual({ status: "coalesced", slotId: "checkpoint-2" });
    expect(await write("step-d")).toEqual({ status: "written", slotId: "checkpoint-1" });
    expect([...records.values()].filter((value) => value.kind === "checkpoint")).toHaveLength(3);
    expect(records.get("golden_branching\0checkpoint-1")?.checkpointStepId).toBe("step-d");
    expect(records.get("golden_branching\0checkpoint-2")?.savedAtEpochMilliseconds).toBe(103);
  });

  it("retains the prior checkpoint and continues the serialized queue after a failed replacement", async () => {
    const prior = slot("checkpoint", "checkpoint-1", "prior", 1, "step-prior");
    const records = new Map([["golden_branching\0checkpoint-1", prior]]);
    const coordinator = new WorldPlayerSaveWriteCoordinatorV1(memoryStore(records));
    const failed = coordinator.writeCheckpoint("golden_branching", hash, "step-next", async () => { throw new Error("disk full"); });
    const succeeded = coordinator.writeCheckpoint("golden_branching", hash, "step-later", async (slotId) => {
      records.set(`golden_branching\0${slotId}`, slot("checkpoint", slotId, "later", 2, "step-later"));
    });
    await expect(failed).rejects.toThrow("disk full");
    expect(records.get("golden_branching\0checkpoint-1")).toEqual(prior);
    await expect(succeeded).resolves.toEqual({ status: "written", slotId: "checkpoint-2" });
  });
});

describe("N52-E3c1 recovery write policy", () => {
  it("serializes recovery mutations and continues after a failed write", async () => {
    let current: WorldPlayerRecoveryRecordV1 | null = createWorldPlayerRecoveryRecordV1({
      projectId: "golden_branching", buildId: hash, savedAtEpochMilliseconds: 1, title: "Branching Golden",
      sceneId: "prior", presentationKind: "dialogue", runtimeStateHash: hash, sessionArtifactHash: hash,
      serializedSessionSave: "{}"
    });
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const store: WorldPlayerRecoveryStoreV1 = {
      version: "1.0.0", backend: "memory-test", async read() { return current; },
      async write(value) {
        if (value.sceneId === "failed") { events.push("first-start"); await gate; events.push("first-fail"); throw new Error("disk full"); }
        events.push("second-start"); current = value; events.push("second-end");
      },
      async clear() { current = null; }
    };
    const coordinator = new WorldPlayerRecoveryWriteCoordinatorV1(store);
    const failed = coordinator.write(createWorldPlayerRecoveryRecordV1({ ...current, sceneId: "failed" }));
    const next = createWorldPlayerRecoveryRecordV1({ ...current, sceneId: "next", savedAtEpochMilliseconds: 2 });
    const succeeded = coordinator.write(next);
    await Promise.resolve();
    expect(events).toEqual(["first-start"]);
    expect(current?.sceneId).toBe("prior");
    release();
    await expect(failed).rejects.toThrow("disk full");
    await succeeded;
    expect(events).toEqual(["first-start", "first-fail", "second-start", "second-end"]);
    expect(current).toEqual(next);
  });
});

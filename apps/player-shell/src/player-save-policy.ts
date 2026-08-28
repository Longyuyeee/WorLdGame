import type { WorldPlayerSaveSlotV2, WorldPlayerSaveStoreV2 } from "./player-save-store";

export const WORLD_PLAYER_AUTO_SAVE_SLOT_COUNT = 5;
export const WORLD_PLAYER_QUICK_SAVE_SLOT_ID = "quick-1" as const;

export type WorldPlayerSaveWriteV1 = () => Promise<void>;
export type WorldPlayerAutoSaveResultV1 =
  | { readonly status: "written"; readonly slotId: string }
  | { readonly status: "coalesced"; readonly slotId: string };

export function worldPlayerSaveSceneIdentityV1(buildId: string, sceneId: string): string {
  return `${buildId}\0${sceneId}`;
}

export function worldPlayerAutoSaveAllowedV1(status: string, presentationKind: string): boolean {
  return status === "presenting" && (presentationKind === "dialogue" || presentationKind === "narration") ||
    status === "waiting-choice" && presentationKind === "choice" || status === "ended" && presentationKind === "ending";
}

export class WorldPlayerSaveWriteCoordinatorV1 {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly store: WorldPlayerSaveStoreV2) {}

  writeSerial(task: WorldPlayerSaveWriteV1): Promise<void> {
    const current = this.tail.then(task, task);
    this.tail = current.then(() => undefined, () => undefined);
    return current;
  }

  writeFixed<T>(task: () => Promise<T>): Promise<T> {
    return this.enqueue(task);
  }

  writeAuto(projectId: string, sceneIdentity: string, createAndWrite: (slotId: string) => Promise<void>): Promise<WorldPlayerAutoSaveResultV1> {
    return this.enqueue(async () => {
      const autoSlots = (await this.store.list(projectId)).filter((slot) => slot.kind === "auto");
      const newest = [...autoSlots].sort(newestFirst)[0];
      if (newest !== undefined && worldPlayerSaveSceneIdentityV1(newest.buildId, newest.sceneId) === sceneIdentity) {
        return { status: "coalesced" as const, slotId: newest.slotId };
      }
      const empty = Array.from({ length: WORLD_PLAYER_AUTO_SAVE_SLOT_COUNT }, (_, index) => `auto-${index + 1}`).find((slotId) => !autoSlots.some((slot) => slot.slotId === slotId));
      const slotId = empty ?? [...autoSlots].sort(oldestFirst)[0]?.slotId ?? "auto-1";
      await createAndWrite(slotId);
      return { status: "written" as const, slotId };
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const current = this.tail.then(task, task);
    this.tail = current.then(() => undefined, () => undefined);
    return current;
  }
}

function oldestFirst(left: WorldPlayerSaveSlotV2, right: WorldPlayerSaveSlotV2): number {
  return left.savedAtEpochMilliseconds - right.savedAtEpochMilliseconds || left.slotId.localeCompare(right.slotId);
}

function newestFirst(left: WorldPlayerSaveSlotV2, right: WorldPlayerSaveSlotV2): number {
  return right.savedAtEpochMilliseconds - left.savedAtEpochMilliseconds || right.slotId.localeCompare(left.slotId);
}

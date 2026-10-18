import { canonicalPlayerDataStringifyV1 } from '@world-studio/player-core';
import { listWorldPlayerSaveSummariesV3, type WorldPlayerSaveStoreV3 } from './player-save-store';

/** Single-process memory fixture capability, not evidence of native transaction safety.
 * Real cross-window atomicity is tested with IndexedDB and exported-game browsers. */
export function testSaveComparison(getStore: () => WorldPlayerSaveStoreV3): NonNullable<WorldPlayerSaveStoreV3['writeIfUnchanged']> {
  let tail = Promise.resolve();
  return (slot, expected, preview) => {
    const task = tail.then(async () => {
      const store = getStore(), actual = (await listWorldPlayerSaveSummariesV3(store, slot.projectId)).find(row => row.slotId === slot.slotId) ?? null;
      if (canonicalPlayerDataStringifyV1(actual) !== canonicalPlayerDataStringifyV1(expected)) return false;
      await store.write(slot, preview); return true;
    });
    tail = task.then(() => undefined, () => undefined); return task;
  };
}

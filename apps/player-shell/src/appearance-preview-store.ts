import { readWorldPlayerSaveSlotV3, worldPlayerSaveSummaryV3, type WorldPlayerSaveSlotV3, type WorldPlayerSaveStoreV3 } from "./player-save-store";
import { canonicalPlayerDataStringifyV1 } from '@world-studio/player-core';

/** Real save operations for the appearance iframe, discarded with that iframe. */
export function createAppearancePreviewSaveStore(): WorldPlayerSaveStoreV3 {
  const slots = new Map<string, WorldPlayerSaveSlotV3>(), previews = new Map<string, Blob>();
  const key = (projectId: string, slotId: string) => `${projectId}:${slotId}`;
  const commit = (input: Parameters<WorldPlayerSaveStoreV3['write']>[0], preview?: Blob) => {
    const slot = structuredClone(readWorldPlayerSaveSlotV3(input)), id = key(slot.projectId, slot.slotId);
    slots.set(id, slot);
    if (preview) previews.set(id, preview); else previews.delete(id);
    if (slots.size > 24) { const oldest = slots.keys().next().value!; slots.delete(oldest); previews.delete(oldest); }
  };
  return {
    version: "3.0.0", backend: "appearance-preview-memory",
    list: async projectId => [...slots.values()].filter(slot => slot.projectId === projectId).map(slot => structuredClone(slot)),
    listSummaries: async projectId => [...slots.values()].filter(slot => slot.projectId === projectId).map(slot => structuredClone(worldPlayerSaveSummaryV3(slot))),
    read: async (projectId, slotId) => { const slot = slots.get(key(projectId, slotId)); return slot ? structuredClone(slot) : null; },
    readPreview: async (projectId, slotId) => previews.get(key(projectId, slotId)) ?? null,
    write: async (input, preview) => { commit(input, preview); },
    writeIfUnchanged: async (slot, expected, preview) => {
      if (expected !== null && (expected.projectId !== slot.projectId || expected.slotId !== slot.slotId)) throw new TypeError('WORLD_PLAYER_SAVE_EXPECTATION_INVALID');
      const actual = slots.get(key(slot.projectId, slot.slotId));
      if (canonicalPlayerDataStringifyV1(actual ? worldPlayerSaveSummaryV3(actual) : null) !== canonicalPlayerDataStringifyV1(expected)) return false;
      // This iframe's private Map is replaced synchronously, with no await
      // between comparison and commit. It never claims cross-window storage.
      commit(slot, preview); return true;
    }
  };
}

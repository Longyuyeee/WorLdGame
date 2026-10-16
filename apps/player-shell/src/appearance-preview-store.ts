import { readWorldPlayerSaveSlotV3, worldPlayerSaveSummaryV3, type WorldPlayerSaveSlotV3, type WorldPlayerSaveStoreV3 } from "./player-save-store";

/** Real save operations for the appearance iframe, discarded with that iframe. */
export function createAppearancePreviewSaveStore(): WorldPlayerSaveStoreV3 {
  const slots = new Map<string, WorldPlayerSaveSlotV3>(), previews = new Map<string, Blob>();
  const key = (projectId: string, slotId: string) => `${projectId}:${slotId}`;
  return {
    version: "3.0.0", backend: "appearance-preview-memory",
    list: async projectId => [...slots.values()].filter(slot => slot.projectId === projectId).map(slot => structuredClone(slot)),
    listSummaries: async projectId => [...slots.values()].filter(slot => slot.projectId === projectId).map(worldPlayerSaveSummaryV3),
    read: async (projectId, slotId) => { const slot = slots.get(key(projectId, slotId)); return slot ? structuredClone(slot) : null; },
    readPreview: async (projectId, slotId) => previews.get(key(projectId, slotId)) ?? null,
    write: async (input, preview) => {
      const slot = readWorldPlayerSaveSlotV3(input), id = key(slot.projectId, slot.slotId);
      slots.set(id, slot);
      if (preview) previews.set(id, preview); else previews.delete(id);
      if (slots.size > 24) { const oldest = slots.keys().next().value!; slots.delete(oldest); previews.delete(oldest); }
    }
  };
}

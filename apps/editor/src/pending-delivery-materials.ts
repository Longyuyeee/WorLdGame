import { readPlaytestNotes } from './playtest-notes';
import { readPlaytestProgress } from './playtest-progress';

export type DeliveryMaterialKind = 'notes' | 'progress';
const key = (referenceId: string, kind: DeliveryMaterialKind) => `world-studio:pending-delivery:${referenceId}:${kind}`;
/** Keep optional author files attached to the imported workspace until the author decides. */
export function stageDeliveryMaterials(referenceId: string, projectId: string, notes: string | null, progress: string | null, storage: Storage = localStorage) {
  if (notes !== null) readPlaytestNotes(notes, projectId);
  if (progress !== null) readPlaytestProgress(progress, projectId);
  try {
    if (notes !== null) storage.setItem(key(referenceId, 'notes'), notes);
    if (progress !== null) storage.setItem(key(referenceId, 'progress'), progress);
  } catch {
    for (const kind of ['notes', 'progress'] as const) { try { storage.removeItem(key(referenceId, kind)); } catch { /* Original ZIP remains the recovery source. */ } }
    throw Error('暂时无法保留交付包的待恢复资料，请检查浏览器空间后重试。原交付 ZIP 未改变。');
  }
}
export const pendingDeliveryMaterial = (referenceId: string, kind: DeliveryMaterialKind, storage: Storage = localStorage) => storage.getItem(key(referenceId, kind)) ?? undefined;
export const consumeDeliveryMaterial = (referenceId: string, kind: DeliveryMaterialKind, storage: Storage = localStorage) => storage.removeItem(key(referenceId, kind));

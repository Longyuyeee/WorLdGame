import { afterEach, expect, it, vi } from 'vitest';
import { consumeDeliveryMaterial, pendingDeliveryMaterial, stageDeliveryMaterials } from './pending-delivery-materials';
import { completionFromTrace, writePlaytestProgress } from './playtest-progress';
import { endedTrace, progressProject } from './playtest-progress-fixture';
import { writePlaytestNotes } from './playtest-notes';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('retains independent author choices per imported workspace until consumed', () => {
  const project = progressProject(), id = project.manifest.projectId, progress = writePlaytestProgress(id, [completionFromTrace(project, endedTrace(), 1)!]), notes = writePlaytestNotes(id, []);
  stageDeliveryMaterials('first', id, notes, progress); stageDeliveryMaterials('second', id, null, progress);
  expect(pendingDeliveryMaterial('first', 'notes')).toBe(notes); expect(pendingDeliveryMaterial('first', 'progress')).toBe(progress);
  consumeDeliveryMaterial('first', 'notes'); expect(pendingDeliveryMaterial('first', 'notes')).toBeUndefined(); expect(pendingDeliveryMaterial('first', 'progress')).toBe(progress);
  consumeDeliveryMaterial('first', 'progress'); expect(pendingDeliveryMaterial('second', 'progress')).toBe(progress);
});
it('validates both author files before staging and rolls back if the second write fails', () => {
  const id = progressProject().manifest.projectId, notes = writePlaytestNotes(id, []), progress = writePlaytestProgress(id, []);
  expect(() => stageDeliveryMaterials('bad', id, notes, writePlaytestProgress('foreign', []))).toThrow(); expect(pendingDeliveryMaterial('bad', 'notes')).toBeUndefined();
  const original = Storage.prototype.setItem; let calls = 0;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) { if (++calls === 2) throw Error('quota'); original.call(this, name, value); });
  expect(() => stageDeliveryMaterials('full', id, notes, progress)).toThrow(/浏览器空间/); expect(pendingDeliveryMaterial('full', 'notes')).toBeUndefined(); expect(pendingDeliveryMaterial('full', 'progress')).toBeUndefined();
});
